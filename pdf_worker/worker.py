# -*- coding: utf-8 -*-
"""
worker.py —— PDF 转写双引擎 Worker（学术工作台专用）

引擎：
  * local：子进程调用本地 MinerU CLI（pipeline 后端，纯 CPU，离线可用）
  * cloud：调用云端 mineru-open-sdk（Precision 精确解析，GPU 加速，需 Token）

仅依赖 Python 标准库提供 HTTP 服务；MinerU / SDK 等重依赖装在同目录 .venv 中。
端口 8766，只监听 127.0.0.1，由主 server.py（8765）反向代理，浏览器不直接访问。

接口：
  GET  /api/pdf/health                         引擎就绪状态
  POST /api/pdf/upload?name=xxx.pdf            请求体为 PDF 原始字节 -> {pdfPath}
  POST /api/pdf/submit        JSON {pdfPath, engine, formula?, table?} -> {jobId,status}
  GET  /api/pdf/status?jobId=xxx               任务状态轮询
  GET  /api/pdf/result?jobId=xxx               完成后取 Markdown + 图片清单
  GET  /api/pdf/asset?jobId=xxx&file=images/a.jpg   取任务产物图片
  GET  /api/pdf/original?jobId=xxx             原文 PDF（浏览器内嵌打开）
  POST /api/pdf/reading/generate  JSON {jobId} 生成原文精读（后台跑，按 jobId 直接
                                               读 result.md，不需要重新转写）
  GET  /api/pdf/reading/plan?jobId=xxx         精读预估（段数 / 预计秒数）
  GET  /api/pdf/reading/status?jobId=xxx       精读生成进度
  POST /api/pdf/reading/cancel    JSON {jobId} 中止精读生成

产物目录：data/pdf_jobs/<jobId>/
  input.pdf、result.md、translation.md、reading.md、images/、local_out|cloud_out/
"""

import os
import sys
import re
import json
import time
import uuid
import shutil
import queue
import subprocess
import threading
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# ---------------------------------------------------------------------------
# 路径与常量
# ---------------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))                 # pdf_worker/
BASE_DIR = os.path.dirname(HERE)                                  # 09_工作台程序/
DATA_DIR = os.path.join(BASE_DIR, "data")
JOBS_DIR = os.path.join(DATA_DIR, "pdf_jobs")
UPLOAD_DIR = os.path.join(JOBS_DIR, "_uploads")
CONFIG_FILE = os.path.join(DATA_DIR, "pdf_config.json")
# 工作台根目录（09_工作台程序 的上一级）与文献库/札记目录（P0 一键入库）
WORKBENCH_ROOT = os.path.dirname(BASE_DIR)
LIT_ROOT = os.path.join(WORKBENCH_ROOT, "01_文献库")
NOTES_ROOT = os.path.join(WORKBENCH_ROOT, "02_研究笔记", "02_读书札记")
# 分类 -> 01_文献库 下的实际文件夹名
CATEGORY_DIRS = {
    "精读": "01_精读文献",
    "泛读": "02_泛读文献",
    "待读": "03_待读清单",
}
PORT = 8766
HOST = "127.0.0.1"

# worker 用 venv 的 python 启动，mineru CLI 与 python 在同一 bin 目录
VENV_BIN = os.path.dirname(sys.executable)
MINERU_CLI = os.path.join(VENV_BIN, "mineru")

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp")

os.makedirs(JOBS_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# 配置（云端 Token 从 data/pdf_config.json 读取，环境变量优先）
# ---------------------------------------------------------------------------
def load_config():
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def get_cloud_token():
    return os.environ.get("MINERU_TOKEN", "").strip() or load_config().get("cloud_token", "").strip()


def get_token_info():
    """读取 Token 签发日期，返回剩余天数和到期日；未配置则返回 None。"""
    cfg = load_config()
    created_str = cfg.get("token_created_at", "")
    validity = int(cfg.get("token_validity_days", 90))
    if not created_str:
        return None
    try:
        created = datetime.strptime(created_str, "%Y-%m-%d").date()
    except ValueError:
        return None
    expires = created + timedelta(days=validity)
    days_left = (expires - date.today()).days
    return {
        "createdAt": created_str,
        "expiresAt": expires.isoformat(),
        "daysLeft": days_left,
        "validityDays": validity,
    }


def local_engine_available():
    return os.path.isfile(MINERU_CLI)


# ---------------------------------------------------------------------------
# 任务管理：单队列、单工作线程、顺序执行（不追求并发）
# ---------------------------------------------------------------------------
class JobManager:
    def __init__(self):
        self.jobs = {}
        self.lock = threading.Lock()
        self.q = queue.Queue()
        threading.Thread(target=self._worker_loop, daemon=True).start()

    def create(self, pdf_path, engine, opts):
        if engine not in ("local", "cloud"):
            raise ValueError("engine 必须是 local 或 cloud")
        if not os.path.isfile(pdf_path):
            raise FileNotFoundError("PDF 文件不存在：%s" % pdf_path)
        # 从 PDF 文件名生成可辨认的 job_id：{文件名缩写}_{时间戳}_{随机4位}
        base_name = os.path.splitext(os.path.basename(pdf_path))[0]
        # 剥掉上传时加的时间戳前缀（YYYYMMDD_HHMMSS_6位hex_），避免双重时间戳
        base_name = re.sub(r"^\d{8}_\d{6}_[0-9a-f]{6}_", "", base_name)
        safe_name = sanitize_filename(base_name, 30)
        job_id = safe_name + "_" + time.strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:4]
        job_dir = os.path.join(JOBS_DIR, job_id)
        os.makedirs(job_dir, exist_ok=True)
        input_copy = os.path.join(job_dir, "input.pdf")
        shutil.copy2(pdf_path, input_copy)  # submit 时复制一份，外部文件变动不影响任务
        job = {
            "jobId": job_id,
            "dir": job_dir,
            "input": input_copy,
            "engine": engine,
            "opts": opts or {},
            "status": "queued",
            "progress": 0,
            "progressText": "排队中，等待上一任务完成…",
            "resultMarkdownPath": "",
            "error": "",
            "images": [],
            "created": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        with self.lock:
            self.jobs[job_id] = job
        self.q.put(job_id)
        return job

    def update(self, job_id, **fields):
        with self.lock:
            if job_id in self.jobs:
                self.jobs[job_id].update(fields)

    def public_status(self, job_id):
        with self.lock:
            j = self.jobs.get(job_id)
            if not j:
                return None
            # 对外字段（不暴露内部 dir）
            return {
                "jobId": j["jobId"],
                "status": j["status"],
                "progress": j.get("progress", 0),
                "progressText": j["progressText"],
                "engine": j["engine"],
                "resultMarkdownPath": j["resultMarkdownPath"],
                "images": j.get("images", []),
                "error": j["error"],
            }

    def _worker_loop(self):
        while True:
            job_id = self.q.get()
            with self.lock:
                job = dict(self.jobs[job_id])
            try:
                self.update(job_id, status="running", progress=2, progressText="初始化引擎…")
                if job["engine"] == "local":
                    run_local(job, self)
                else:
                    run_cloud(job, self)
            except Exception as exc:
                self.update(job_id, status="error", error="%s: %s" % (type(exc).__name__, str(exc))[:600])
            finally:
                self.q.task_done()


# ---------------------------------------------------------------------------
# 本地引擎：subprocess 调 MinerU CLI
# CLI 参数与云端对齐：-m auto 自动判型/必要时 OCR，-l ch，公式/表格默认开
# ---------------------------------------------------------------------------
# (关键词, 阶段文案, 大致进度百分比) —— 不追求精确，给用户心理预期
MINERU_STAGE_MAP = [
    ("DocAnalysis init", "加载版面 / OCR 模型…", 8),
    ("Fetching", "首次下载模型权重…", 10),
    ("Layout Predict", "版面分析中…", 25),
    ("OCR-det", "OCR 文字检测中…", 45),
    ("OCR-rec", "OCR 文字识别中…", 68),
    ("Table", "表格识别中…", 80),
    ("Processing pages", "生成 Markdown 中…", 90),
    ("Completed", "收尾中…", 96),
]


def _kill_stale_mineru():
    """清理残留的 MinerU 进程。

    worker 的任务队列是串行的——开始新任务时若仍有 MinerU 在跑，必是上一次
    异常退出留下的孤儿（MinerU 3.x 会自启临时 API 子进程），它们占着端口/显存，
    会让后续任务启动即失败（表现为卡在 3%、输出目录全空，用户连点重试时高发）。
    按本项目 venv 内 CLI 的绝对路径匹配，不会误杀其它程序或 worker 自身。
    """
    try:
        subprocess.run(["pkill", "-f", MINERU_CLI], capture_output=True, timeout=10)
        time.sleep(1.5)
    except Exception:
        pass


def _run_mineru_once(cmd, env, log_path, mgr, jid, append=False):
    """跑一次 MinerU CLI：输出落盘 + 抓进度关键词。返回 (退出码, 尾部输出)。

    输出必须落盘：原先只把 stdout 用来抓进度，失败时真实报错被丢弃，
    只剩一句 code=1，用户报「本地 / 云端都失败」时无从查起。
    """
    logf = open(log_path, "a" if append else "w", encoding="utf-8")
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        # stdin 必须显式指向 DEVNULL：不指定时子进程会继承 worker 的 stdin，
        # 而 worker 被某些方式拉起（如后台/守护进程）时 stdin 是个已失效的 fd，
        # MinerU 带的 Python 会在启动时直接
        # 「Fatal Python error: init_sys_streams ... Bad file descriptor」崩掉 ——
        # 表现为转写进度永远停在 3%、local_out 空目录。
        stdin=subprocess.DEVNULL,
        env=env, text=True, bufsize=1,
    )
    stage, cur_progress, tail = "本地引擎启动中…", 3, []
    assert proc.stdout is not None
    for chunk in proc.stdout:
        try:
            logf.write(chunk)
            logf.flush()
        except Exception:
            pass
        tail.append(chunk)
        if len(tail) > 60:
            tail.pop(0)
        for key, text, pct in MINERU_STAGE_MAP:
            if key in chunk:
                stage, cur_progress = text, pct
                break
        mgr.update(jid, progress=cur_progress, progressText=stage)
    code = proc.wait()
    logf.close()
    return code, "".join(tail).strip()


def _mineru_error_hint(raw_tail, limit=900):
    """从引擎输出里挑出真正有用的报错行。

    MinerU 的进度条用 \\r 不停刷新，直接截尾部会得到一大段进度噪声。
    先按 \\r/\\n 拆行去空，优先保留报错关键词所在行，没有再回退最后几行。
    """
    text = (raw_tail or "").replace("\r", "\n")
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    if not lines:
        return "(引擎无任何输出)"
    keys = ("Error", "ERROR", "Traceback", "Exception", "error", "Failed", "failed",
            "CUDA", "OutOfMemory", "out of memory", "No such", "not found", "Permission",
            "denied", "无法", "失败")
    important = [ln for ln in lines if any(k in ln for k in keys)]
    picked = important[-12:] if important else lines[-8:]
    return "\n".join(picked)[:limit]


def run_local(job, mgr):
    jid = job["jobId"]
    job_dir = job["dir"]
    out_dir = os.path.join(job_dir, "local_out")
    os.makedirs(out_dir, exist_ok=True)

    if not local_engine_available():
        raise RuntimeError("本地 MinerU CLI 不存在：%s（请先在 pdf_worker/.venv 安装 mineru）" % MINERU_CLI)

    env = dict(os.environ)
    # MinerU 3.x CLI 会自启本地临时 API，回环地址必须绕过系统代理
    env["NO_PROXY"] = "127.0.0.1,localhost,::1"
    env["no_proxy"] = "127.0.0.1,localhost,::1"

    opts = job.get("opts", {})
    formula = "true" if opts.get("formula", True) else "false"
    table = "true" if opts.get("table", True) else "false"
    cmd = [
        MINERU_CLI, "-p", job["input"], "-o", out_dir,
        "-b", "pipeline", "-m", "auto", "-l", "ch",
        "-f", formula, "-t", table,
    ]
    mgr.update(jid, progress=3, progressText="本地引擎启动中（首次需加载模型）…")
    log_path = os.path.join(job_dir, "mineru.log")
    # 开跑前先清残留：这类「卡在 3% 就退出」的失败多半是上次异常退出留下的
    # MinerU 孤儿进程占着端口/显存，清掉后通常一次就过（用户连点重试时高发）
    _kill_stale_mineru()
    code, tail = 1, ""
    for attempt in range(2):
        if attempt > 0:
            mgr.update(jid, progress=3, progressText="首次启动失败，清理残留后重试…")
            _kill_stale_mineru()
            time.sleep(2)
        code, tail = _run_mineru_once(cmd, env, log_path, mgr, jid, append=(attempt > 0))
        if code == 0:
            break
    if code != 0:
        raise RuntimeError(
            "本地 MinerU 异常退出（code=%s，已自动重试一次）。完整日志：data/pdf_jobs/%s/mineru.log\n%s"
            % (code, jid, _mineru_error_hint(tail)))

    _collect_outputs(job, out_dir, mgr, note="local 使用 CLI 默认参数，可能与云端存在细微格式差异。")


# ---------------------------------------------------------------------------
# 云端引擎：mineru-open-sdk（Token 从配置/环境变量读取）
# ---------------------------------------------------------------------------
def run_cloud(job, mgr):
    jid = job["jobId"]
    job_dir = job["dir"]
    token = get_cloud_token()
    if not token:
        raise RuntimeError("未配置云端 Token：请在 data/pdf_config.json 填写 cloud_token，或设置 MINERU_TOKEN 环境变量")
    os.environ["MINERU_TOKEN"] = token  # SDK 默认读这个环境变量

    opts = job.get("opts", {})
    mgr.update(jid, progress=5, progressText="正在上传 PDF 到云端…")
    try:
        from mineru import MinerU  # 延迟导入：本地引擎不需要加载 torch/SDK
    except ImportError as exc:
        raise RuntimeError("云端 SDK 未安装（pip install mineru-open-sdk）：%s" % exc)

    client = MinerU(token)
    try:
        try:
            mgr.update(jid, progress=30, progressText="云端 GPU 解析中…")
            result = client.extract(
                job["input"],
                model="pipeline",
                ocr=True,  # 扫描件必须 OCR；电子版云端会自动走文字层
                formula=opts.get("formula", True),
                table=opts.get("table", True),
                language="ch",
                timeout=600,
            )
        except Exception as exc:
            # 会话/沙箱托管的进程跨天后可能失去出站网络：进程活着但连不出去
            if "Connection refused" in str(exc) or "ConnectError" in type(exc).__name__:
                raise RuntimeError(
                    "云端连接被拒（引擎进程网络受限）。请重启工作台（双击 start.command）后重试；急用可先切本地解析。"
                ) from exc
            raise
        markdown = result.markdown or ""
        if not markdown.strip():
            raise RuntimeError("云端返回了空 Markdown，请重试或改用本地引擎")

        result_md = os.path.join(job_dir, "result.md")
        with open(result_md, "w", encoding="utf-8") as f:
            f.write(markdown)

        # 保存图片等资源（失败不阻断，Markdown 已是完整产物）
        images = []
        try:
            cloud_out = os.path.join(job_dir, "cloud_out")
            os.makedirs(cloud_out, exist_ok=True)
            result.save_all(cloud_out)
            img_dir = os.path.join(job_dir, "images")
            for root, _, files in os.walk(cloud_out):
                for fn in sorted(files):
                    if fn.lower().endswith(IMAGE_EXTS):
                        os.makedirs(img_dir, exist_ok=True)
                        dst = os.path.join(img_dir, fn)
                        if not os.path.exists(dst):
                            shutil.copy2(os.path.join(root, fn), dst)
                        images.append("images/" + fn)
        except Exception:
            images = []

        mgr.update(
            jid, status="done", progress=100, progressText="云端解析完成",
            resultMarkdownPath=result_md, images=sorted(set(images)),
        )
    finally:
        try:
            client.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 输出归集：从 MinerU CLI 的嵌套输出目录里找到 .md 和 images，复制到任务根目录
# ---------------------------------------------------------------------------
def _collect_outputs(job, out_dir, mgr, note=""):
    jid = job["jobId"]
    job_dir = job["dir"]
    md_files = []
    for root, _, files in os.walk(out_dir):
        for fn in files:
            if fn.endswith(".md"):
                md_files.append(os.path.join(root, fn))
    if not md_files:
        raise RuntimeError("解析完成但未找到 Markdown 输出")
    src_md = sorted(md_files)[0]

    images = []
    src_img_dir = os.path.join(os.path.dirname(src_md), "images")
    dst_img_dir = os.path.join(job_dir, "images")
    if os.path.isdir(src_img_dir):
        os.makedirs(dst_img_dir, exist_ok=True)
        for fn in sorted(os.listdir(src_img_dir)):
            shutil.copy2(os.path.join(src_img_dir, fn), os.path.join(dst_img_dir, fn))
            images.append("images/" + fn)

    result_md = os.path.join(job_dir, "result.md")
    shutil.copy2(src_md, result_md)
    text = "本地解析完成" + ("（" + note + "）" if note else "")
    mgr.update(jid, status="done", progress=100, progressText=text,
               resultMarkdownPath=result_md, images=images)


# ---------------------------------------------------------------------------
# P0 一键入库：元数据提取（纯规则：pypdf 内嵌 + Markdown 启发式 + DOI/CrossRef）
# 设计为不依赖 LLM；后续 P1 可在 build_metadata_draft 之后叠加 deepseek 增强。
# ---------------------------------------------------------------------------
DOI_RE = re.compile(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+")
YEAR_RE = re.compile(r"(?:19|20)\d{2}")
INVALID_FN_RE = re.compile(r'[\\/:*?"<>|\x00-\x1f]+')
JATS_RE = re.compile(r"<[^>]+>")


def sanitize_filename(name, maxlen=60):
    """清洗成可安全做文件/文件夹名的字符串（同时防目录穿越）。"""
    name = INVALID_FN_RE.sub(" ", str(name or ""))
    name = re.sub(r"\s+", " ", name).strip(" ._-")
    if not name:
        name = "未命名"
    return name[:maxlen].strip(" ._-") or "未命名"


def _unique_path(path, is_dir=True):
    """目标已存在时追加 _2/_3，绝不覆盖已有文献。"""
    if not os.path.exists(path):
        return path
    base, ext = os.path.splitext(path)
    for i in range(2, 1000):
        cand = "%s_%d%s" % (base, i, ext) if not is_dir else "%s_%d" % (base, i)
        if not os.path.exists(cand):
            return cand
    raise RuntimeError("同名文件过多，无法生成唯一文件名")


def split_authors(text):
    """把作者字符串拆成列表（兼容中英文分隔符）。"""
    if isinstance(text, list):
        return [str(a).strip() for a in text if str(a).strip()]
    parts = re.split(r"[,，、;；]|\s+and\s+|\s*&\s*", str(text or ""))
    return [p.strip() for p in parts if p.strip()]


def read_pdf_embedded(pdf_path):
    """读 PDF 内嵌 /Info 元数据与页数（扫描件通常为空）。"""
    out = {"title": "", "authors": [], "pages": 0}
    try:
        from pypdf import PdfReader
        r = PdfReader(pdf_path)
        out["pages"] = len(r.pages)
        info = r.metadata
        if info:
            t = (getattr(info, "title", None) or "").strip()
            a = (getattr(info, "author", None) or "").strip()
            # 内嵌标题若是文件名/过短则视为无效
            if t and not t.lower().endswith(".pdf") and len(t) >= 4:
                out["title"] = t
            if a:
                out["authors"] = split_authors(a)
    except Exception:
        pass
    return out


def heuristic_from_md(md):
    """从转写后的 Markdown 首页启发式提取标题/作者/年份/DOI/摘要。"""
    head = md[:3000]
    out = {"title": "", "authors": [], "year": "", "doi": "", "abstract": ""}

    # 标题：优先第一个 markdown 标题；否则第一个像样的非空行
    m = re.search(r"(?m)^#{1,3}\s+(.+?)\s*#*$", head)
    if m:
        out["title"] = re.sub(r"[*`]", "", m.group(1)).strip()
    else:
        for line in head.splitlines():
            s = re.sub(r"[#*`>!\[\]()]", "", line).strip()
            if len(s) >= 6 and not s.startswith(("|", "---", "http", "Figure", "图")):
                out["title"] = s[:120]
                break

    # 作者：抓“XXX 著/编著/主编/编译”这类署名（先去掉 markdown 转义符）
    plain_head = head.replace("\\", "").replace("_", "")
    am = re.search(r"([一-龥A-Za-z·.]{2,30}?)\s*(?:编著|主编|编译|著|编)\b", plain_head)
    if am:
        name = am.group(1).strip(" ，,、；;")
        name = re.split(r"[\n，,、；;]", name)[-1].strip()
        if 2 <= len(name) <= 30:
            out["authors"] = [name]

    # DOI
    dm = DOI_RE.search(head)
    if dm:
        out["doi"] = dm.group(0).rstrip(".,);]")

    # 年份：首页中第一个不晚于今年的四位数年份
    this_year = date.today().year
    for y in YEAR_RE.findall(head):
        if 1900 <= int(y) <= this_year:
            out["year"] = y
            break

    # 摘要：标题之后第一个长度足够的普通段落（适当放宽范围与阈值）
    paras = [p.strip() for p in re.split(r"\n\s*\n", md) if p.strip()]
    for p in paras[1:20]:
        clean = re.sub(r"[#*`>|\[\]]", " ", p)
        clean = re.sub(r"\s+", " ", clean).strip()
        if len(clean) >= 40 and not clean.startswith(("!", "|", "http")):
            out["abstract"] = clean[:600]
            break
    return out


def crossref_by_doi(doi, timeout=10):
    """用 DOI 走 CrossRef 免费接口补全权威元数据（无 key，失败返回 None，不阻塞）。
    必须：①直连绕过环境代理（Clash 对 api.crossref.org 会超时）；②用 certifi 的 CA 包
    做 SSL 校验（venv Python 3.12 自带证书库缺失，直连会 CERTIFICATE_VERIFY_FAILED）。"""
    try:
        import ssl
        import certifi
        url = "https://api.crossref.org/works/" + urllib.request.quote(doi)
        req = urllib.request.Request(url, headers={
            "User-Agent": "PhDWorkbench/1.0 (mailto:workbench@local)"})
        ctx = ssl.create_default_context(cafile=certifi.where())
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=ctx))
        with opener.open(req, timeout=timeout) as resp:
            m = json.loads(resp.read().decode("utf-8")).get("message", {})
        authors = []
        for a in m.get("author", []):
            name = " ".join(x for x in [a.get("given", ""), a.get("family", "")] if x).strip()
            if name:
                authors.append(name)
        dp = m.get("issued", {}).get("date-parts", [[None]])
        year = str(dp[0][0]) if dp and dp[0] and dp[0][0] else ""
        abstract = JATS_RE.sub("", m.get("abstract", "") or "").strip()
        return {
            "title": (m.get("title") or [""])[0].strip(),
            "authors": authors,
            "year": year,
            "journal": (m.get("container-title") or [""])[0].strip(),
            "doi": m.get("DOI", doi),
            "abstract": abstract,
        }
    except Exception:
        return None


def _build_summarize_prompt(depth, text):
    """根据深度级别构建摘要提示词。返回 (prompt, max_tokens)。"""
    base = (
        "你是一位经验丰富的学术研究者和文献评论专家。下面是一篇论文 PDF 转写后的 Markdown 文本"
        "（可能包含 OCR 错误、格式噪声、页眉页脚和参考文献）。\n\n"
    )
    tail = "\n\n论文文本如下：\n---\n" + text + "\n---"

    if depth == "quick":
        prompt = base + (
            "请对这篇论文做【30秒速览】极简摘要，严格以 JSON 格式返回"
            "（只返回 JSON，不要任何其他文字、不要 markdown 代码块）。JSON 包含：\n"
            '1. "one_liner": 一句话概括论文核心贡献（中文，不超过50字）\n'
            '2. "key_findings": 核心发现（中文数组，1-2条，每条一句话）\n'
            '3. "innovation": 创新点（中文，一句话说明与众不同之处）\n'
            '4. "keywords": 3-5个关键词（中英文混合，逗号分隔）\n\n'
            "【要求】极简、精准、不展开，只给最核心的信息。拿不准的标注「待核实」。"
        ) + tail
        return prompt, 1500

    elif depth == "deep":
        prompt = base + (
            "请对这篇论文做【深度学术评价】，严格以 JSON 格式返回"
            "（只返回 JSON，不要任何其他文字、不要 markdown 代码块）。JSON 包含以下字段：\n\n"
            '1. "one_liner": 一句话概括（中文，不超过50字）\n'
            '2. "abstract_zh": 中文摘要（300-500字）\n'
            '3. "abstract_en": 英文摘要（清理原文或概括）\n'
            '4. "keywords": 5-8个关键词（中英文混合）\n'
            '5. "research_question": 研究问题与意义（100-200字）\n'
            '6. "methodology": 方法论架构（100-200字）\n'
            '7. "key_findings": 关键发现（数组，3-5条）\n'
            '8. "theoretical_contribution": 理论贡献（中文，100-200字。说明新理论/概念、理论深化、认识提升）\n'
            '9. "breakthroughs": 关键突破（数组，2-3个。每个是对象，包含：'
            '"title"突破名称、"description"具体表现、"importance"重要度1-5、"why"为什么重要）\n'
            '10. "strengths": 主要优势（数组，2-3条）\n'
            '11. "limitations": 主要局限（数组，2-3条，每条包含"content"内容和"severity"严重程度高/中/低）\n'
            '12. "questions": 待改进与疑惑清单（数组，2-4条。每条包含：'
            '"question"问题描述、"type"类型（关键问题/方法问题/认识疑惑）、"impact"对结论的影响）\n'
            '13. "implications": 对研究的启示（100-200字）\n'
            '14. "future_directions": 进一步研究方向（数组，2-3条，每条一句话）\n\n'
            "【写作要求】\n"
            "- 学术语体，正式、客观、克制\n"
            "- 专业术语首次出现中英文对照\n"
            "- 区分事实与分析，分析性内容前缀「分析：」\n"
            "- 拿不准的标注「待核实」，不要编造\n"
            "- 批判性评价要具体，不要空泛"
        ) + tail
        return prompt, 8000

    else:  # standard
        prompt = base + (
            "请对这篇论文做结构化精读摘要，严格以 JSON 格式返回"
            "（只返回 JSON，不要任何其他文字、不要 markdown 代码块）。JSON 包含：\n\n"
            '1. "one_liner": 一句话概括论文核心贡献（中文，不超过50字）\n'
            '2. "abstract_zh": 中文摘要（300-500字，概括研究问题、方法、主要发现和意义。'
            '如果原文有英文摘要，翻译并润色为中文；如果没有，根据全文概括。）\n'
            '3. "abstract_en": 英文摘要（如果原文有明确摘要，清理后直接返回；'
            '如果没有，根据前两页内容概括一段100-150词的英文摘要。'
            '不要包含 "Abstract" 这个词本身，不要包含作者列表或机构信息。）\n'
            '4. "keywords": 5-8个关键词（中英文混合，核心概念用英文原词，通用概念可用中文，用逗号分隔）\n'
            '5. "research_question": 研究问题与意义（中文，100-200字。说明核心问题是什么、现有研究不足在哪里、研究意义在哪里。）\n'
            '6. "methodology": 方法论架构（中文，100-200字。说明研究设计类型、数据/样本来源、分析方法、关键工具。）\n'
            '7. "key_findings": 关键发现（中文数组，3-5条，每条一句话，说明发现内容+证据强度。）\n'
            '8. "strengths": 主要优势（中文数组，2-3条，说明理论贡献新颖性、方法严谨性、发现可推广性等。）\n'
            '9. "limitations": 主要局限（中文数组，2-3条，说明样本代表性、因果推断有效性、外部有效性限制等。）\n'
            '10. "implications": 对研究的启示（中文，100-200字。说明这篇论文对相关领域研究的理论启示、方法启示和内容启示。）\n\n'
            "【写作要求】\n"
            "- 所有中文内容使用学术语体，正式、客观、克制\n"
            "- 专业术语首次出现时中英文对照（如「能动性（agency）」）\n"
            "- 区分事实与分析：事实直接陈述，分析性内容可前缀「分析：」\n"
            "- 拿不准的内容标注「待核实」，不要编造\n"
            "- 数组字段每个元素是一句话，不要太长"
        ) + tail
        return prompt, 5000


def llm_summarize(job, depth="standard", max_chars=8000):
    """从转写结果中提取文献摘要，支持三级深度。
    depth: "quick"(30秒速览) / "standard"(标准精读) / "deep"(深度学术评价)
    返回 {ok, depth, ...字段, model, tokens}；失败返回 {ok:False, error}。
    使用 llm_config.json 中 models.summarize 指定的模型（兜底 default_model）。"""
    try:
        model = _get_task_model("summarize")
        md_path = os.path.join(job["dir"], "result.md")
        with open(md_path, "r", encoding="utf-8") as f:
            md = f.read()
        text = md[:max_chars]

        prompt, max_tokens = _build_summarize_prompt(depth, text)

        result, err = _llm_chat(
            [{"role": "user", "content": prompt}],
            max_tokens=max_tokens, temperature=0.3, response_json=True, model=model)
        if err:
            return {"ok": False, "error": err}

        content = result["choices"][0]["message"]["content"].strip()
        # 去掉可能的 markdown 代码块包裹
        if content.startswith("```"):
            content = re.sub(r"^```(?:json)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
        data = json.loads(content)
        usage = result.get("usage", {})

        # 防御性字段处理：确保不会因 LLM 返回异常类型而崩溃
        def _safe_str(v, field=""):
            try:
                if v is None:
                    return ""
                if isinstance(v, str):
                    return v.strip()
                if isinstance(v, (list, tuple)):
                    for item in v:
                        if item:
                            s = str(item).strip()
                            if s:
                                return s
                    return ""
                return str(v).strip()
            except Exception as e:
                print("[_safe_str] field=%s type=%s err=%s" % (field, type(v).__name__, e))
                return ""

        def _safe_list(v, field=""):
            try:
                if v is None:
                    return []
                if isinstance(v, list):
                    result = []
                    for x in v:
                        if x is None:
                            continue
                        if isinstance(x, str):
                            s = x.strip()
                            if s:
                                result.append(s)
                        else:
                            result.append(x)
                    return result
                if isinstance(v, str) and v.strip():
                    return [v.strip()]
                return []
            except Exception as e:
                print("[_safe_list] field=%s type=%s err=%s" % (field, type(v).__name__, e))
                return []

        resp = {
            "ok": True,
            "depth": depth,
            "one_liner": _safe_str(data.get("one_liner"), "one_liner"),
            "keywords": _safe_str(data.get("keywords"), "keywords"),
            "key_findings": _safe_list(data.get("key_findings"), "key_findings"),
            "model": result.get("model", model),
            "tokens": usage.get("total_tokens", 0),
        }

        # standard 和 deep 共有的字段
        if depth in ("standard", "deep"):
            resp.update({
                "abstract_zh": _safe_str(data.get("abstract_zh"), "abstract_zh"),
                "abstract_en": _safe_str(data.get("abstract_en"), "abstract_en"),
                "research_question": _safe_str(data.get("research_question"), "research_question"),
                "methodology": _safe_str(data.get("methodology"), "methodology"),
                "strengths": _safe_list(data.get("strengths"), "strengths"),
                "limitations": _safe_list(data.get("limitations"), "limitations"),
                "implications": _safe_str(data.get("implications"), "implications"),
            })

        # quick 模式的 innovation 字段
        if depth == "quick":
            resp["innovation"] = _safe_str(data.get("innovation"), "innovation")

        # deep 模式独有字段
        if depth == "deep":
            # breakthroughs 和 questions 期望是对象数组，直接透传，不做字符串处理
            bts = data.get("breakthroughs")
            if not isinstance(bts, list):
                bts = []
            qs = data.get("questions")
            if not isinstance(qs, list):
                qs = []
            resp.update({
                "theoretical_contribution": _safe_str(data.get("theoretical_contribution"), "theoretical_contribution"),
                "breakthroughs": bts,
                "questions": qs,
                "future_directions": _safe_list(data.get("future_directions"), "future_directions"),
            })

        return resp
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


# ===== 摘要保存与管理 =====
SUMMARIES_DIR = os.path.join(DATA_DIR, "summaries")


def _ensure_summaries_dir():
    if not os.path.isdir(SUMMARIES_DIR):
        os.makedirs(SUMMARIES_DIR, exist_ok=True)


_OA_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def start_job_from_url(url, title="", engine="local", source=""):
    """从开放获取链接（bioRxiv/medRxiv 等）下载 PDF 并直接入转写队列。

    下载策略：带同站 Referer + 浏览器 UA，遇 429 退避重试 2 次，
    缓解 Cloudflare 的限流（实测 bioRxiv PDF 直链会间歇性 429）。
    返回 {ok, jobId, status, size} 或 {ok:False, error}。
    """
    if not url.lower().startswith(("http://", "https://")):
        return {"ok": False, "error": "链接格式不正确"}
    headers = {"User-Agent": _OA_UA, "Accept": "application/pdf,*/*"}
    host = re.match(r"https?://[^/]+/", url)
    if host:
        headers["Referer"] = host.group(0)   # 同站 Referer 显著降低 429

    # worker 跑在独立 venv 里，系统证书链取不到，必须显式指定 certifi 的 CA
    try:
        import ssl, certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except Exception:
        try:
            import ssl
            ctx = ssl._create_unverified_context()
        except Exception:
            ctx = None

    data, last_err = None, ""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
                data = resp.read()
            if data[:4] != b"%PDF":
                return {"ok": False, "error": "取到的不是 PDF，该站可能需要订阅权限"}
            break
        except urllib.error.HTTPError as e:
            last_err = "HTTP %s" % e.code
            if e.code in (429, 503):
                time.sleep(2 * (attempt + 1))
                continue
            return {"ok": False, "error": "下载失败：%s（该站可能需要订阅权限）" % last_err}
        except Exception as e:
            last_err = str(e)[:80]
            time.sleep(1)
            continue

    if data is None:
        return {"ok": False, "error": "下载失败：%s（站点限流，稍后重试）" % last_err}

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    stamp = time.strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
    safe = re.sub(r"[^0-9A-Za-z一-龥._-]", "_", (title or "preprint"))[:36] or "preprint"
    saved = os.path.join(UPLOAD_DIR, "%s_%s.pdf" % (stamp, safe))
    with open(saved, "wb") as f:
        f.write(data)

    try:
        job = JOBS.create(saved, engine, {"formula": True, "table": True})
    except Exception as e:
        return {"ok": False, "error": "入队失败：%s" % str(e)[:80]}

    try:
        with open(os.path.join(job["dir"], "source.json"), "w", encoding="utf-8") as f:
            json.dump({"url": url, "title": title, "source": source,
                       "saved_at": time.strftime("%Y-%m-%d %H:%M")}, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return {"ok": True, "jobId": job["jobId"], "status": job["status"], "size": len(data)}


def update_summary_tags(summary_id, tags):
    """更新摘要卡片的自定义标签（向后兼容：老记录没有 tags 字段即为 []）。"""
    safe = os.path.basename(summary_id).replace(".json", "")
    path = os.path.join(SUMMARIES_DIR, safe + ".json")
    if not os.path.isfile(path):
        return {"ok": False, "error": "摘要不存在: %s" % safe}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return {"ok": False, "error": "读取失败: %s" % str(e)[:80]}
    clean = []
    for t in (tags or []):
        s = str(t).strip()
        if s and s not in clean:
            clean.append(s)
    data["tags"] = clean[:12]
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        return {"ok": False, "error": "写入失败: %s" % str(e)[:80]}
    return {"ok": True, "id": safe, "tags": clean}


def save_summary(job, summary_data):
    """保存摘要到 data/summaries/ 目录。
    summary_data 是 llm_summarize 返回的完整字典。
    返回 {ok, id, path}。"""
    try:
        _ensure_summaries_dir()
        depth = summary_data.get("depth", "standard")
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        summary_id = "%s_%s" % (timestamp, depth)

        # 从 job 或 metadata 提取标题和年份
        title = ""
        title_en = ""
        year = ""
        meta_path = os.path.join(job["dir"], "metadata.json")
        if os.path.isfile(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                title = meta.get("title_zh") or meta.get("title") or ""
                title_en = meta.get("title") or ""
                year = meta.get("year") or ""
            except Exception:
                pass

        # 如果没有标题，从 result.md 第一行提取
        if not title:
            try:
                md_path = os.path.join(job["dir"], "result.md")
                with open(md_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("#"):
                            title_en = line.lstrip("#").strip()
                            break
            except Exception:
                pass

        # 元数据补全链：归档 metadata.json（存入文献库时写入）→
        # build_metadata_draft（PDF 内嵌 + 启发式 + CrossRef），缺哪个补哪个，
        # 供 BibTeX 导出与文献信息展示使用
        meta = {}
        meta_path = os.path.join(job["dir"], "metadata.json")
        if os.path.isfile(meta_path):
            try:
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
            except Exception:
                meta = {}
        try:
            if not (meta.get("authors") and meta.get("journal") and meta.get("doi")):
                draft = build_metadata_draft(job)
                if draft.get("ok"):
                    dm = draft.get("meta", {})
                    for k in ("title", "title_zh", "authors", "year", "doi", "journal", "abstract"):
                        if not meta.get(k) and dm.get(k):
                            meta[k] = dm[k]
        except Exception:
            pass

        record = {
            "id": summary_id,
            "jobId": job.get("jobId", ""),
            "title": title,
            "title_en": title_en,
            "year": year,
            "depth": depth,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "authors": meta.get("authors") or [],
            "journal": meta.get("journal") or "",
            "doi": meta.get("doi") or "",
            "abstract": meta.get("abstract") or "",
            "source": meta.get("source") or "",
            "url": meta.get("url") or "",
            "lightweight": bool(meta.get("lightweight")),
            "summary": summary_data,
        }

        file_path = os.path.join(SUMMARIES_DIR, summary_id + ".json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)

        return {"ok": True, "id": summary_id, "path": file_path}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def list_summaries():
    """列出所有已保存的摘要，按时间倒序。
    返回 {ok, summaries: [{id, title, title_en, year, depth, created_at, one_liner}]}。"""
    try:
        _ensure_summaries_dir()
        records = []
        for fname in os.listdir(SUMMARIES_DIR):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(SUMMARIES_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    record = json.load(f)
                # 只返回摘要信息，不返回完整 summary 内容（减少传输量）
                summary = record.get("summary", {})
                records.append({
                    "id": record.get("id", fname.replace(".json", "")),
                    # jobId 是「卡片 ↔ 译文 ↔ 精读 ↔ 原文 PDF」互链的唯一钥匙，
                    # 列表里必须带上（这个函数是白名单挑字段，加字段容易漏）
                    "jobId": record.get("jobId", ""),
                    "title": record.get("title", ""),
                    "title_en": record.get("title_en", ""),
                    "year": record.get("year", ""),
                    "depth": record.get("depth", "standard"),
                    "created_at": record.get("created_at", ""),
                    "one_liner": summary.get("one_liner", ""),
                    "keywords": summary.get("keywords", ""),
                    "tags": record.get("tags", []),
                    "authors": record.get("authors", []),
                    "journal": record.get("journal", ""),
                    "doi": record.get("doi", ""),
                    "url": record.get("url", ""),
                    "source": record.get("source", ""),
                    "lightweight": bool(record.get("lightweight")),
                })
            except Exception:
                continue
        # 按创建时间倒序
        records.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return {"ok": True, "summaries": records}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def get_summary(summary_id):
    """获取单个已保存摘要的完整内容。"""
    try:
        fpath = os.path.join(SUMMARIES_DIR, summary_id + ".json")
        if not os.path.isfile(fpath):
            return {"ok": False, "error": "摘要不存在"}
        with open(fpath, "r", encoding="utf-8") as f:
            record = json.load(f)
        return {"ok": True, "record": record}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def quick_add_summary(payload):
    """资讯一键轻收录：只存元数据（标题/摘要/链接/来源）入卡片库，不转写全文。
    与转写生成的卡片同结构，lightweight=True 标记；之后仍可对原文送转写。"""
    try:
        title = str(payload.get("title") or payload.get("title_en") or "").strip()
        if not title:
            return {"ok": False, "error": "缺少标题"}
        _ensure_summaries_dir()
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        summary_id = "%s_quick" % timestamp
        abstract = str(payload.get("abstract") or "").strip()
        source = str(payload.get("source") or "资讯").strip()
        record = {
            "id": summary_id,
            "jobId": "",
            "title": str(payload.get("title") or "").strip(),
            "title_en": str(payload.get("title_en") or "").strip(),
            "year": str(payload.get("year") or "").strip(),
            "depth": "quick",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "authors": payload.get("authors") or [],
            "journal": str(payload.get("journal") or "").strip(),
            "doi": str(payload.get("doi") or "").strip(),
            "abstract": abstract[:2000],
            "source": source,
            "url": str(payload.get("url") or "").strip(),
            "lightweight": True,
            "tags": [source] if source else [],
            "summary": {
                "ok": True,
                "depth": "quick",
                "one_liner": abstract[:160] or "（轻收录：尚未生成摘要，可对原文送转写后补全）",
                "keywords": "",
                "model": "meta-only",
                "tokens": 0,
            },
        }
        file_path = os.path.join(SUMMARIES_DIR, summary_id + ".json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
        return {"ok": True, "id": summary_id}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def _bibtex_escape(s):
    return str(s or "").replace("&", "\\&").replace("%", "\\%").replace("_", "\\_").replace("#", "\\#")


def _bibtex_key(rec, used):
    first = ""
    authors = rec.get("authors") or []
    if authors:
        parts = str(authors[0]).replace(",", " ").split()
        first = re.sub(r"[^A-Za-z]", "", parts[-1] if parts else "") or "anon"
    year = re.sub(r"[^0-9]", "", str(rec.get("year") or "")) or "nd"
    t = (rec.get("title_en") or rec.get("title") or "untitled").split()
    word = re.sub(r"[^A-Za-z]", "", t[0]) if t else "item"
    key = "%s%s%s" % (first.lower(), year, word.lower())
    n = 2
    base = key
    while key in used:
        key = "%s%d" % (base, n)
        n += 1
    used.add(key)
    return key


def export_bibtex(ids=None):
    """把摘要卡片导出为 BibTeX 文本。ids 为空时导出全部。
    有期刊信息用 @article，否则 @misc（附 url/doi）。"""
    try:
        _ensure_summaries_dir()
        entries = []
        for fname in os.listdir(SUMMARIES_DIR):
            if not fname.endswith(".json"):
                continue
            try:
                with open(os.path.join(SUMMARIES_DIR, fname), "r", encoding="utf-8") as f:
                    rec = json.load(f)
            except Exception:
                continue
            if ids is not None and rec.get("id") not in ids:
                continue
            entries.append(rec)
        if not entries:
            return {"ok": False, "error": "没有可导出的文献"}
        entries.sort(key=lambda r: r.get("created_at", ""))
        used = set()
        out = []
        for rec in entries:
            title = rec.get("title") or rec.get("title_en") or "untitled"
            authors = [str(a) for a in (rec.get("authors") or []) if str(a).strip()]
            year = re.sub(r"[^0-9]", "", str(rec.get("year") or ""))
            journal = rec.get("journal") or ""
            doi = rec.get("doi") or ""
            url = rec.get("url") or ""
            key = _bibtex_key(rec, used)
            lines = ["@%s{%s," % ("article" if journal else "misc", key)]
            lines.append("  title = {%s}," % _bibtex_escape(title))
            if authors:
                lines.append('  author = {%s},' % " and ".join(_bibtex_escape(a) for a in authors))
            if journal:
                lines.append("  journal = {%s}," % _bibtex_escape(journal))
            if year:
                lines.append("  year = {%s}," % year)
            if doi:
                lines.append("  doi = {%s}," % doi)
            if url:
                lines.append("  url = {%s}," % url)
            lines.append("}")
            out.append("\n".join(lines))
        bib = "\n\n".join(out) + "\n"
        return {"ok": True, "count": len(out), "bibtex": bib}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def suggest_summary_tags(summary_id):
    """用 summarize 模型读摘要内容，建议 3-5 个主题标签。
    返回 {ok, tags: [...]}；一次 LLM 调用，成本极低。"""
    try:
        fpath = os.path.join(SUMMARIES_DIR, os.path.basename(str(summary_id)) + ".json")
        if not os.path.isfile(fpath):
            return {"ok": False, "error": "摘要不存在"}
        with open(fpath, "r", encoding="utf-8") as f:
            rec = json.load(f)
        s = rec.get("summary", {}) or {}
        material = "\n".join([
            "标题：" + (rec.get("title") or rec.get("title_en") or ""),
            "一句话结论：" + (s.get("one_liner") or ""),
            "关键词：" + (s.get("keywords") or ""),
            "中文摘要：" + (s.get("abstract_zh") or rec.get("abstract") or "")[:600],
            "研究问题：" + (s.get("research_question") or ""),
            "方法：" + (s.get("methodology") or ""),
            "主要发现：" + "；".join(str(x) for x in (s.get("key_findings") or [])[:4]),
            "已有标签：" + "、".join(rec.get("tags") or []),
        ])
        prompt = (
            "你在为一个博士生的文献卡片库做主题标引。基于下面的论文摘要，"
            "给出 3-5 个中文主题标签。要求：\n"
            "1. 每个标签 2-8 个字，是能用于检索的领域术语（如「机械力传导」「基膜」「多智能体」「科学哲学」）；\n"
            "2. 覆盖「研究对象 / 方法路径 / 所属领域」三个维度，避免同义重复；\n"
            "3. 不要泛词（如「研究」「论文」「分析」「综述」），不要与已有标签重复；\n"
            "4. 严格输出 JSON：{\"tags\": [\"标签1\", \"标签2\", ...]}\n\n"
            "论文摘要：\n" + material
        )
        model = _get_task_model("summarize")
        # max_tokens 必须留足推理空间：推理型模型（deepseek-v4 / qwen3.8 系列）
        # 会先输出思考过程，额度给小了会被思考吃光导致 content 为空（finish_reason=length）
        result, err = _llm_chat([{"role": "user", "content": prompt}],
                                max_tokens=2000, temperature=0.2,
                                response_json=True, model=model)
        if err or not result:
            return {"ok": False, "error": err or "LLM 调用失败"}
        try:
            content = (result.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
        except Exception:
            content = ""
        data = {}
        try:
            data = json.loads(content)
        except Exception:
            m = re.search(r"\{.*\}", content, re.S)
            if m:
                try:
                    data = json.loads(m.group(0))
                except Exception:
                    data = {}
        raw = data.get("tags") if isinstance(data, dict) else None
        existing = [str(t) for t in (rec.get("tags") or [])]
        tags, seen = [], set()
        for t in (raw or []):
            clean = re.sub(r"^[#\s]+", "", str(t)).strip()[:10]
            if clean and clean not in seen and clean not in existing:
                seen.add(clean)
                tags.append(clean)
        if not tags:
            return {"ok": False, "error": "模型未给出有效标签，请重试"}
        return {"ok": True, "tags": tags[:5], "model": model}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


REVIEWS_DIR = os.path.join(DATA_DIR, "reviews")
TRANSLATIONS_DIR = os.path.join(DATA_DIR, "translations")
READINGS_DIR = os.path.join(DATA_DIR, "readings")


# ---------------------------------------------------------------------------
# 译文库：把 job 目录里的 translation.md 归档，可列表 / 检索 / 回看
# （此前译文只活在任务目录里，磁盘瘦身一清就找不到了）
# ---------------------------------------------------------------------------
def _ensure_translations_dir():
    os.makedirs(TRANSLATIONS_DIR, exist_ok=True)


def _translation_title(job_dir, fallback, prefer=("translation.md", "result.md")):
    """取标题：优先指定文件的首行（中文），退回转写结果首行，再退回文件名。

    prefer 决定先看哪个文件 —— 译文库要 translation.md（中文标题），
    精读库要 reading.md（精读稿首行也是中文标题），否则会拿到 result.md
    的英文原标题，与库里的其余中文标题不搭。
    """
    for fname in prefer:
        p = os.path.join(job_dir, fname)
        if not os.path.isfile(p):
            continue
        try:
            with open(p, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    if line.startswith("#"):
                        return line.lstrip("#").strip()[:120]
                    return line[:80]
        except Exception:
            continue
    return fallback


def _translation_excerpt(markdown):
    """列表页用的摘要：去 Markdown 符号、压空白，截 180 字。"""
    text = re.sub(r"```[\s\S]*?```", " ", markdown)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[#>*`_|]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:180]


def save_translation(job_id):
    """把某个任务的译文存进译文库。

    同一任务重复保存时覆盖原记录（保留首次保存时间与 id），
    避免用户重译一次就多出一份重复卡片。
    """
    try:
        job_dir = os.path.join(JOBS_DIR, os.path.basename(str(job_id)))
        src = os.path.join(job_dir, "translation.md")
        if not os.path.isfile(src):
            return {"ok": False, "error": "这个任务还没有译文，先在「译文」标签翻译全文"}
        with open(src, "r", encoding="utf-8") as f:
            markdown = f.read()
        if not markdown.strip():
            return {"ok": False, "error": "译文是空的"}
        _ensure_translations_dir()

        # 来源文件名：去掉上传时加的时间戳前缀
        base = os.path.basename(job_dir)
        source = re.sub(r"_\d{8}_\d{6}_[0-9a-f]{4}$", "", base)
        title = _translation_title(job_dir, source)

        # 同任务已有记录 → 覆盖（沿用 id 与首次保存时间）
        prev = None
        for fname in os.listdir(TRANSLATIONS_DIR):
            if not fname.endswith(".json"):
                continue
            try:
                with open(os.path.join(TRANSLATIONS_DIR, fname), "r", encoding="utf-8") as f:
                    rec = json.load(f)
            except Exception:
                continue
            if rec.get("job_id") == job_id:
                prev = rec
                break

        now = time.time()
        tid = (prev or {}).get("id") or (time.strftime("%Y%m%d_%H%M%S") + "_" + job_id[-4:])
        created_at = (prev or {}).get("created_at") or time.strftime("%Y-%m-%d %H:%M:%S")

        record = {
            "id": tid,
            "job_id": job_id,
            "title": title,
            "source": source,
            "chars": len(markdown),
            "created_at": created_at,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "excerpt": _translation_excerpt(markdown),
            "markdown": markdown,
        }
        fpath = os.path.join(TRANSLATIONS_DIR, tid + ".json")
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False)
        return {"ok": True, "id": tid, "title": title, "chars": len(markdown),
                "replaced": bool(prev), "ts": now}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def list_translations():
    """列出译文库条目（不含正文，减少传输量），按保存时间倒序。"""
    try:
        _ensure_translations_dir()
        items = []
        for fname in os.listdir(TRANSLATIONS_DIR):
            if not fname.endswith(".json"):
                continue
            try:
                with open(os.path.join(TRANSLATIONS_DIR, fname), "r", encoding="utf-8") as f:
                    rec = json.load(f)
            except Exception:
                continue
            items.append({
                "id": rec.get("id", fname[:-5]),
                # 互链用：前端拿它去比对摘要卡片的 jobId
                "job_id": rec.get("job_id", ""),
                "title": rec.get("title", ""),
                "source": rec.get("source", ""),
                "chars": rec.get("chars", 0),
                "created_at": rec.get("created_at", ""),
                "updated_at": rec.get("updated_at", ""),
                "excerpt": rec.get("excerpt", ""),
            })
        items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return {"ok": True, "translations": items}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def get_translation(tid):
    """读取单条译文（含正文）。"""
    try:
        fpath = os.path.join(TRANSLATIONS_DIR, os.path.basename(str(tid)) + ".json")
        if not os.path.isfile(fpath):
            return {"ok": False, "error": "译文不存在"}
        with open(fpath, "r", encoding="utf-8") as f:
            rec = json.load(f)
        return {"ok": True, "record": rec}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def delete_translation(tid):
    """从译文库删除一条（不影响 job 目录里的原文件）。"""
    try:
        fpath = os.path.join(TRANSLATIONS_DIR, os.path.basename(str(tid)) + ".json")
        if os.path.isfile(fpath):
            os.remove(fpath)
            return {"ok": True}
        return {"ok": False, "error": "译文不存在"}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


# ---------------------------------------------------------------------------
# 精读库：LLM 生成的「原文一段 + 译文一段 + 重点解读」长文
# 生成在前端分块跑（进度可见 / 可取消 / 分块缓存），本层只负责落盘与读取
# ---------------------------------------------------------------------------
JOB_STEM_RE = re.compile(r"_\d{8}_\d{6}_[0-9a-f]{4}$")


def _ensure_readings_dir():
    os.makedirs(READINGS_DIR, exist_ok=True)


def find_job_pdf(job_id):
    """定位某个任务的原始 PDF，供「打开原文」使用。

    磁盘瘦身会回收旧任务的 input.pdf，而同类论文往往有多次转写 —— 此时退回
    同名（去掉时间戳）的其它任务目录里去找，避免用户点「打开原文」直接失败。
    """
    job_id = os.path.basename(str(job_id or ""))
    if not job_id:
        return None
    direct = os.path.join(JOBS_DIR, job_id, "input.pdf")
    if os.path.isfile(direct):
        return direct
    stem = JOB_STEM_RE.sub("", job_id)
    try:
        for name in os.listdir(JOBS_DIR):
            if JOB_STEM_RE.sub("", name) != stem:
                continue
            cand = os.path.join(JOBS_DIR, name, "input.pdf")
            if os.path.isfile(cand):
                return cand
    except Exception:
        pass
    return None


def save_reading(job_id, markdown):
    """把精读长文写进任务目录（缓存），空内容拒绝写入。

    空内容校验是踩过坑的：旧译文端点不校验，调用方漏传正文就把已有内容清空。
    """
    try:
        job_id = os.path.basename(str(job_id or ""))
        if not job_id:
            return {"ok": False, "error": "缺少任务 id"}
        job_dir = os.path.join(JOBS_DIR, job_id)
        if not os.path.isdir(job_dir):
            return {"ok": False, "error": "任务目录不存在"}
        if not (markdown or "").strip():
            return {"ok": False, "error": "精读内容为空，拒绝写入"}
        with open(os.path.join(job_dir, "reading.md"), "w", encoding="utf-8") as f:
            f.write(markdown)
        return {"ok": True, "chars": len(markdown)}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def get_job_reading(job_id):
    """回读任务目录里的精读长文（切回标签时恢复显示）。"""
    try:
        p = os.path.join(JOBS_DIR, os.path.basename(str(job_id or "")), "reading.md")
        if os.path.isfile(p):
            with open(p, "r", encoding="utf-8") as f:
                md = f.read()
            return {"ok": True, "exists": bool(md.strip()), "markdown": md}
        return {"ok": True, "exists": False, "markdown": ""}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def archive_reading(job_id):
    """把任务里的精读长文归档进精读库（同一任务重复归档=覆盖，沿用 id 与首次时间）。"""
    try:
        job_id = os.path.basename(str(job_id or ""))
        job_dir = os.path.join(JOBS_DIR, job_id)
        src = os.path.join(job_dir, "reading.md")
        if not os.path.isfile(src):
            return {"ok": False, "error": "这个任务还没有精读长文，先在「精读」标签生成"}
        with open(src, "r", encoding="utf-8") as f:
            markdown = f.read()
        if not markdown.strip():
            return {"ok": False, "error": "精读内容是空的"}
        _ensure_readings_dir()

        source = JOB_STEM_RE.sub("", job_id)
        title = _translation_title(job_dir, source,
                                  prefer=("reading.md", "translation.md", "result.md"))
        prev = None
        for fname in os.listdir(READINGS_DIR):
            if not fname.endswith(".json"):
                continue
            try:
                with open(os.path.join(READINGS_DIR, fname), "r", encoding="utf-8") as f:
                    rec = json.load(f)
            except Exception:
                continue
            if rec.get("job_id") == job_id:
                prev = rec
                break

        rid = (prev or {}).get("id") or (time.strftime("%Y%m%d_%H%M%S") + "_" + job_id[-4:])
        created_at = (prev or {}).get("created_at") or time.strftime("%Y-%m-%d %H:%M:%S")
        record = {
            "id": rid,
            "job_id": job_id,
            "title": title,
            "source": source,
            "chars": len(markdown),
            "created_at": created_at,
            "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "excerpt": _translation_excerpt(markdown),
            "markdown": markdown,
        }
        with open(os.path.join(READINGS_DIR, rid + ".json"), "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False)
        return {"ok": True, "id": rid, "title": title, "chars": len(markdown),
                "replaced": bool(prev)}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def list_readings():
    """列出精读库条目（不含正文）。"""
    try:
        _ensure_readings_dir()
        items = []
        for fname in os.listdir(READINGS_DIR):
            if not fname.endswith(".json"):
                continue
            try:
                with open(os.path.join(READINGS_DIR, fname), "r", encoding="utf-8") as f:
                    rec = json.load(f)
            except Exception:
                continue
            items.append({
                "id": rec.get("id", fname[:-5]),
                "job_id": rec.get("job_id", ""),
                "title": rec.get("title", ""),
                "source": rec.get("source", ""),
                "chars": rec.get("chars", 0),
                "created_at": rec.get("created_at", ""),
                "updated_at": rec.get("updated_at", ""),
                "excerpt": rec.get("excerpt", ""),
            })
        items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return {"ok": True, "readings": items}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def get_reading(rid):
    """读取单条精读长文（含正文）。"""
    try:
        fpath = os.path.join(READINGS_DIR, os.path.basename(str(rid)) + ".json")
        if not os.path.isfile(fpath):
            return {"ok": False, "error": "精读不存在"}
        with open(fpath, "r", encoding="utf-8") as f:
            return {"ok": True, "record": json.load(f)}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def delete_reading(rid):
    """从精读库移除一条（不影响任务目录里的原文件）。"""
    try:
        fpath = os.path.join(READINGS_DIR, os.path.basename(str(rid)) + ".json")
        if os.path.isfile(fpath):
            os.remove(fpath)
            return {"ok": True}
        return {"ok": False, "error": "精读不存在"}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


# ---------------------------------------------------------------------------
# 精读生成（服务端跑：给个 jobId 就直接读该任务的 result.md，不需要重新转写）
#
# 为什么放在服务端而不是前端：
#   ① 任何入口（摘要卡片 / 译文 / 精读详情）点一下就能把缺的精读补上，
#      不必先回到 PDF 转写把整篇重跑一遍；
#   ② 关掉标签页或切走都不会中断（一篇 20 段要跑 2 分钟以上）；
#   ③ 分块口径只有这一份实现，界面报的段数 = 实际段数，
#      不会再出现「提示 21 段、实际跑 19 段」这类两处实现不一致的问题。
# ---------------------------------------------------------------------------
READING_TASKS = {}
READING_TASKS_LOCK = threading.Lock()
READING_CONCURRENCY = 4
READING_CHUNK_CHARS = 2500

IMG_MD_RE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
IMG_PH_RE = re.compile(r"\[\[IMG:(\d+)\]\]")
READING_REF_RE = re.compile(
    r"^#{1,4}\s*(references|bibliography|literature cited|参考文献|引用文献)\s*$",
    re.I | re.M)


def _protect_images(md):
    """![alt](url) → [[IMG:n]]，防止 LLM 在长文里改写或丢失图片。"""
    mapping = []

    def repl(m):
        mapping.append((m.group(1), m.group(2)))
        return "[[IMG:%d]]" % (len(mapping) - 1)

    return IMG_MD_RE.sub(repl, md), mapping


def _restore_images(text, mapping):
    def repl(m):
        i = int(m.group(1))
        if 0 <= i < len(mapping):
            return "![%s](%s)" % mapping[i]
        return m.group(0)

    return IMG_PH_RE.sub(repl, text)


def _reading_chunks(md):
    """精读分块：整篇保护图片 → 切掉参考文献 → 按段落攒到约 2500 字一块。

    顺序有讲究：占位符必须在分块前替换，否则跨块的图片标记会被切断。
    口径只此一份（预估与生成共用），这是段数能对上的前提。
    """
    text, mapping = _protect_images(md or "")
    cut = READING_REF_RE.search(text)
    if cut and cut.start() > 2000:
        text = text[:cut.start()]
    chunks, cur = [], ""
    for para in re.split(r"\n\n+", text):
        if cur and len(cur) + len(para) + 2 > READING_CHUNK_CHARS:
            chunks.append(cur)
            cur = para
        else:
            cur = (cur + "\n\n" + para) if cur else para
    if cur.strip():
        chunks.append(cur)
    return chunks, mapping


def reading_plan(job_id):
    """界面用的预估（段数 / 预计秒数），不触发生成。"""
    job_dir = os.path.join(JOBS_DIR, os.path.basename(str(job_id or "")))
    src = os.path.join(job_dir, "result.md")
    if not os.path.isfile(src):
        return {"ok": False, "error": "找不到这篇文章的转写结果，需要先在 PDF 转写里转一次"}
    try:
        with open(src, "r", encoding="utf-8") as f:
            md = f.read()
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:200]}
    chunks, _ = _reading_chunks(md)
    rounds = (len(chunks) + READING_CONCURRENCY - 1) // READING_CONCURRENCY
    return {"ok": True, "total": len(chunks), "chars": len(md),
            "seconds": rounds * 25, "concurrency": READING_CONCURRENCY}


def reading_status(job_id):
    """精读生成进度（内存状态；worker 重启即丢，前端会退回「未生成」）。"""
    job_id = os.path.basename(str(job_id or ""))
    with READING_TASKS_LOCK:
        t = READING_TASKS.get(job_id)
        if not t:
            return {"ok": True, "status": "none"}
        return {"ok": True, "status": t["status"], "done": t["done"], "total": t["total"],
                "error": t.get("error", ""), "id": t.get("id", ""),
                "chars": t.get("chars", 0), "model": t.get("model", ""),
                "failed": t.get("failed", 0)}


def cancel_reading(job_id):
    """立即把状态置为 cancelled。

    不这么做的话，界面点「取消」后要等已经在跑的那几块（最多 4 块 × 25 秒）
    跑完才变状态 —— 用户会以为取消没反应。真正的收尾由后台线程自己做，
    它每块开跑前都会检查标记，跑完也不会再写盘。
    """
    job_id = os.path.basename(str(job_id or ""))
    with READING_TASKS_LOCK:
        t = READING_TASKS.get(job_id)
        if not t or t["status"] != "running":
            return {"ok": False, "error": "没有正在进行的精读任务"}
        t["cancelled"] = True
        t["status"] = "cancelled"
    return {"ok": True}


def start_reading(job_id):
    """提交精读生成任务：立即返回，前端轮询 reading_status 看进度。"""
    job_id = os.path.basename(str(job_id or ""))
    if not job_id:
        return {"ok": False, "error": "缺少任务 id"}
    plan = reading_plan(job_id)
    if not plan.get("ok"):
        return plan
    if not plan["total"]:
        return {"ok": False, "error": "这篇没有可精读的正文"}
    with READING_TASKS_LOCK:
        cur = READING_TASKS.get(job_id)
        if cur and cur["status"] == "running":
            # 重复点击不重复烧钱：直接把当前进度回给界面
            return {"ok": True, "started": False, "running": True,
                    "done": cur["done"], "total": cur["total"],
                    "model": cur.get("model", "")}
        READING_TASKS[job_id] = {
            "status": "running", "done": 0, "total": plan["total"], "error": "",
            "cancelled": False, "id": "", "chars": 0, "failed": 0,
            "token": uuid.uuid4().hex,          # 认领标记，见 _run_reading 里的说明
            "model": _get_task_model("annotate"),
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        token = READING_TASKS[job_id]["token"]
    threading.Thread(target=_run_reading, args=(job_id, token), daemon=True).start()
    return {"ok": True, "started": True, "running": True, "done": 0,
            "total": plan["total"], "model": _get_task_model("annotate")}


def _run_reading(job_id, token):
    """后台执行：分块并发调用 LLM → 按序拼接 → 写 reading.md → 归档进精读库。

    每轮都带 token 校验：这个任务可能中途被取消，也可能被「取消后马上重新生成」
    顶替掉 —— 只有 token 仍是当前那一个、且没被取消时，才允许计数和写盘，
    否则旧线程跑完会把新任务的成果覆盖掉。
    """

    def still_mine():
        with READING_TASKS_LOCK:
            t = READING_TASKS.get(job_id)
            return bool(t and t.get("token") == token and not t.get("cancelled"))

    def bump():
        if not still_mine():
            return
        with READING_TASKS_LOCK:
            t = READING_TASKS.get(job_id)
            if t:
                t["done"] += 1

    def set_state(**kw):
        with READING_TASKS_LOCK:
            t = READING_TASKS.get(job_id)
            if t and t.get("token") == token:
                t.update(kw)

    try:
        with open(os.path.join(JOBS_DIR, job_id, "result.md"), "r", encoding="utf-8") as f:
            md = f.read()
        chunks, mapping = _reading_chunks(md)
        results = [None] * len(chunks)

        # 失败块要记账：全部失败必须报 error，否则用户看到「已完成」、打开却全是
        # 「这一段没生成成功」—— 额度耗尽 / 模型无权限这类问题会被整个藏起来
        fail = {"n": 0, "err": ""}

        def work(idx):
            if not still_mine():
                return
            try:
                r = llm_annotate(chunks[idx])
                out = r.get("annotated") if r.get("ok") else ""
                err = (r.get("error") or "") if not r.get("ok") else ""
            except Exception as exc:
                out, err = "", "%s: %s" % (type(exc).__name__, str(exc))
            if not out:
                with READING_TASKS_LOCK:
                    fail["n"] += 1
                    if not fail["err"]:
                        fail["err"] = err or "模型没有返回内容"
            # 单块失败不拖垮整篇：保留原文并标注，其余块照常
            results[idx] = out or ("\n> [这一段没生成成功，先保留原文]\n\n" + chunks[idx])
            bump()

        with ThreadPoolExecutor(max_workers=READING_CONCURRENCY) as ex:
            list(ex.map(work, range(len(chunks))))

        if not still_mine():
            return   # 被取消或被新任务顶替：不写盘，避免污染

        if fail["n"] and fail["n"] >= len(chunks):
            set_state(status="error", done=0, chars=0,
                      error="每一段都没生成成功：%s（去 data/llm_config.json 确认 annotate 模型可用、额度没耗尽）"
                            % (fail["err"] or "模型调用失败")[:200])
            return

        full = _restore_images("\n\n".join([r for r in results if r]).strip(), mapping)
        saved = save_reading(job_id, full)
        if not saved.get("ok"):
            raise RuntimeError(saved.get("error") or "写入精读失败")
        arch = archive_reading(job_id)
        if not arch.get("ok"):
            set_state(status="done", chars=len(full), failed=fail["n"],
                      error="精读已生成，但归档失败：" + (arch.get("error") or ""))
            return
        set_state(status="done", chars=len(full), id=arch.get("id", ""), failed=fail["n"])
    except Exception as exc:
        set_state(status="error", error="%s: %s" % (type(exc).__name__, str(exc))[:300])


def generate_review(payload):
    """综述草稿生成器：把勾选的摘要卡片交给 LLM，按主题聚合成带 [n] 引用标注的
    中文综述骨架（Markdown），存 data/reviews/ 并返回文本。"""
    try:
        ids = payload.get("ids") or []
        topic = str(payload.get("topic") or "").strip()
        if not ids:
            return {"ok": False, "error": "请先勾选要综述的论文卡片"}
        # 允许在生成框里现填主题；不填则用「AI × 生物学交叉研究」
        blocks = []
        sources = []
        for sid in ids:
            fpath = os.path.join(SUMMARIES_DIR, os.path.basename(str(sid)) + ".json")
            if not os.path.isfile(fpath):
                continue
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    rec = json.load(f)
            except Exception:
                continue
            s = rec.get("summary", {}) or {}
            title = rec.get("title") or rec.get("title_en") or "untitled"
            findings = "；".join(str(x) for x in (s.get("key_findings") or [])[:4])
            lims = "；".join(str(x) for x in (s.get("limitations") or [])[:3])
            # 编号按实际收录顺序编，跳过读不到的卡片也不会留空洞
            n = len(blocks) + 1
            blocks.append(
                "[%d] 标题：%s\n    一句话：%s\n    研究问题：%s\n    方法：%s\n    主要发现：%s\n    局限：%s\n    意义：%s"
                % (n, title,
                   s.get("one_liner", "") or rec.get("abstract", "")[:160],
                   s.get("research_question", ""),
                   s.get("methodology", ""),
                   findings or s.get("abstract_zh", "")[:200],
                   lims,
                   s.get("implications", ""))
            )
            sources.append({"n": n, "id": rec.get("id") or str(sid), "title": title})
        if not blocks:
            return {"ok": False, "error": "勾选的卡片不存在或无法读取"}
        prompt = (
            "你是学术写作助手。基于以下 %d 篇论文的结构化摘要，围绕主题「%s」"
            "撰写一份中文文献综述草稿（Markdown 格式）。要求：\n"
            "1. 开头一段总述研究现状与脉络；\n"
            "2. 分 3-5 个小节组织（可用 研究背景 / 方法路径 / 核心发现 / 局限与展望 等，"
            "按材料实际内容调整标题）；\n"
            "3. 每个论点后用 [1][2] 这样的编号标注来源，编号与材料一致；\n"
            "4. 结尾「## 参考文献」按编号列出论文标题；\n"
            "5. 忠于给定材料，不要编造材料之外的结论；语言风格学术、克制；\n"
            "6. 直接输出 Markdown 正文，不要任何开场白、自我说明或结束语。\n\n"
            "论文材料：\n%s"
        ) % (len(blocks), topic or "AI × 生物学交叉研究", "\n\n".join(blocks))

        model = _get_task_model("summarize")
        result, err = _llm_chat([{"role": "user", "content": prompt}],
                                max_tokens=6000, temperature=0.4, model=model)
        if err or not result:
            return {"ok": False, "error": err or "LLM 生成失败"}
        try:
            markdown = (result.get("choices") or [{}])[0].get("message", {}).get("content", "") or ""
        except Exception:
            markdown = ""
        if not markdown.strip():
            return {"ok": False, "error": "LLM 返回为空"}
        os.makedirs(REVIEWS_DIR, exist_ok=True)
        fname = "%s_review.md" % time.strftime("%Y%m%d_%H%M%S")
        fpath = os.path.join(REVIEWS_DIR, fname)
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(markdown)
        return {"ok": True, "markdown": markdown, "path": os.path.relpath(fpath, BASE_DIR),
                "count": len(blocks), "model": model, "sources": sources}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


# 不支持 temperature 参数的模型（推理模型通常锁定温度）
_NO_TEMPERATURE_PREFIXES = ("kimi", "deepseek-r1")


def _llm_models():
    """返回当前**生效**的模型分配。

    前端文案（"XX 正在生成…"）从这里取值，避免把模型名写死在 HTML/JS 里
    —— 写死过一次：模型换掉后，生成中的提示还写着旧名，与点击前/生成后对不上。
    下面的兜底值只是「配置文件读不到」时的保险，正常一律以 data/llm_config.json 为准。
    """
    info = {"summarize": "qwen3.8-flash", "translation": "qwen3.8-flash",
            "annotate": "qwen3.8-flash", "title_translation": "qwen3.8-flash",
            "default": "qwen3.8-flash"}
    cfg_path = os.path.join(DATA_DIR, "llm_config.json")
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        info["default"] = cfg.get("default_model") or info["default"]
        models = cfg.get("models") or {}
        for task in ("summarize", "translation", "annotate", "title_translation"):
            info[task] = models.get(task) or info["default"]
    except Exception:
        pass
    return info


def _get_task_model(task):
    """从 llm_config.json 的 models 字段读取指定任务的模型，找不到则用 default_model。"""
    info = _llm_models()
    return info.get(task) or info["default"]


def _llm_chat(messages, max_tokens=2000, temperature=0.3, response_json=False, model=None, no_thinking=False):
    """通用 LLM 调用（阿里云百炼 OpenAI 兼容接口），直连绕过代理+certifi SSL。
    model 为 None 时从 llm_config.json 读取 default_model。
    no_thinking=True 时对 Qwen 模型传 enable_thinking=false 关闭推理，大幅提速。"""
    import ssl
    import certifi
    cfg_path = os.path.join(DATA_DIR, "llm_config.json")
    if not os.path.isfile(cfg_path):
        return None, "未找到 data/llm_config.json"
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    api_key = cfg.get("api_key", "")
    base_url = cfg.get("base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1")
    if model is None:
        model = cfg.get("default_model", "qwen3.8-flash")
    if not api_key:
        return None, "llm_config.json 中 api_key 为空"
    body = {"model": model, "messages": messages, "max_tokens": max_tokens}
    # 推理模型（如 kimi-k3）不支持 temperature 参数，传了会报 400
    if not model.lower().startswith(_NO_TEMPERATURE_PREFIXES):
        body["temperature"] = temperature
    # Qwen 推理模型关闭思考模式可大幅提速（翻译不需要推理）
    if no_thinking and model.lower().startswith("qwen"):
        body["enable_thinking"] = False
    if response_json:
        body["response_format"] = {"type": "json_object"}
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        base_url.rstrip("/") + "/chat/completions",
        data=payload, headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
        method="POST")
    ctx = ssl.create_default_context(cafile=certifi.where())
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx))
    with opener.open(req, timeout=300) as resp:
        result = json.loads(resp.read().decode("utf-8"))
    return result, None


def llm_translate(text):
    """将英文论文 Markdown 翻译成中文，保留格式。模型从 llm_config.json 读取。返回 {ok, translated, model, tokens}。"""
    if not text or not text.strip():
        return {"ok": True, "translated": "", "model": "", "tokens": 0}
    prompt = (
        "你是一个学术翻译助手，专攻科学哲学与人工智能跨学科论文翻译。请将下面的论文 Markdown 文本从英文翻译成中文。\n\n"
        "【翻译规则】\n\n"
        "1. Markdown 格式：\n"
        "   - 严格保留标题（#）、列表、表格、链接、加粗、斜体等所有格式标记\n"
        "   - 表格的行列标题要翻译，表格内数据（数字、代码、符号）原样保留\n"
        "   - 表格对齐符号（:---、---:、:---:）必须原样保留\n\n"
        "2. 专业术语：\n"
        "   - 首次出现的关键术语在中文后括号附英文原文，同一术语后续不再重复\n"
        "   - 科学哲学与AI领域常用译法：agency→能动性、affordance→可供性、paradigm→范式、"
        "explicability/explainability→可解释性、interpretability→可释性、contextualism→语境论、"
        "mechanism→机制、emergence→涌现、multi-agent→多智能体、large language model→大语言模型、"
        "scientific discovery→科学发现、hypothesis→假说\n\n"
        "3. 缩写词：\n"
        "   - 通用缩写（AI、DNA、LLM、CNN 等）保持原样不翻译\n"
        "   - 论文首次定义的缩写：全称翻译成中文，缩写保留，格式为「中文（缩写）」\n"
        "     例：Graph Neural Networks (GNNs) → 图神经网络（GNN）\n\n"
        "4. 数字与单位：\n"
        "   - 纯数字、百分比、科学单位（m、kg、Hz、J 等）原样保留\n"
        "   - 英文数字词需翻译：million→百万、billion→十亿、thousand→千\n\n"
        "5. 公式与代码：\n"
        "   - 公式（$...$、$$...$$）、代码块、URL 原样保留，绝对不翻译\n"
        "   - 公式周围的介绍文字正常翻译：where→其中、Equation (1)→公式（1）\n\n"
        "6. 【极其重要】图片占位符 [[IMG:数字]] 必须原样保留：\n"
        "   - [[IMG:0]]、[[IMG:1]] 等占位符绝对不要翻译、删除、修改或移动位置\n"
        "   - 它们代表原文中的图片，翻译完成后会被自动替换回图片\n\n"
        "7. 中文表达自然度：\n"
        "   - 避免字对字直译，英文被动语态可适度改为主动或无主语句以符合中文习惯\n"
        "   - We propose→我们提出（不是「我们提议」）、It is shown that→研究表明（不是「它被证明」）\n"
        "   - 保持学术正式语体，不要口语化\n\n"
        "8. 段落结构：保持原文的段落划分和空行，不要合并多个段落\n\n"
        "9. 输出要求：只返回翻译后的 Markdown 文本，不要前言、后记、解释说明，不要用代码块包裹，不要输出推理过程\n\n"
        "待翻译文本：\n" + text
    )
    try:
        result, err = _llm_chat([{"role": "user", "content": prompt}], max_tokens=16000, temperature=0.2, model=_get_task_model("translation"), no_thinking=True)
        if err:
            return {"ok": False, "error": err}
        content = result["choices"][0]["message"]["content"].strip()
        # 去掉可能的 markdown 代码块包裹
        if content.startswith("```"):
            content = re.sub(r"^```(?:markdown)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
        # 去掉首尾可能的 --- 分隔线
        content = re.sub(r"^-+\s*\n", "", content)
        content = re.sub(r"\n-+\s*$", "", content)
        content = content.strip()
        usage = result.get("usage", {})
        return {"ok": True, "translated": content, "model": result.get("model", ""), "tokens": usage.get("total_tokens", 0)}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def llm_annotate(text):
    """把一段论文正文做成「原文一段 + 译文一段 + 重点解读」的精读稿。

    前端按 2500 字一段分块调用，各自独立可缓存；本函数只负责单块。
    """
    if not text or not text.strip():
        return {"ok": True, "annotated": "", "model": "", "tokens": 0}
    prompt = (
        "你在帮一位 AI × 生物学方向的博士生做「原文精读」。下面是一段论文正文（英文 Markdown）。\n"
        "请做成逐段对照的精读稿：原文 → 译文 → 该段的解读。\n\n"
        "【输出格式】严格照这个结构，不要加任何额外内容：\n\n"
        "## <章节小标题，中文；原文这一段没有标题就省略这一行>\n\n"
        "> <原文段落，逐字保留>\n\n"
        "<这一段的中文翻译>\n\n"
        "**解读** <这一段值得停一下的地方：关键概念、方法思路、隐含前提、术语译法、对读者的意义。2-4 句，说人话，不要复述译文>\n\n"
        "【规则】\n"
        "1. 原文逐字保留，Markdown 的标题、列表、加粗、表格原样不动\n"
        "2. 每一段原文后面紧跟它的译文和解读，不要把译文集中堆到最后\n"
        "3. 图片占位符 [[IMG:数字]] 原样保留，不翻译、不删除、不移动位置\n"
        "4. 公式（$...$、$$...$$）、代码块、URL、纯数字与单位原样保留\n"
        "5. 术语首次出现时在中文后括注英文，例如「可供性（affordance）」\n"
        "6. 解读只挑真正重要的段落写，普通段落直接跳过；宁可少而精，不要每段都写\n"
        "7. 不要写前言、总述、结语，不要输出推理过程，直接输出精读稿正文\n"
        "8. 中文用学术但好读的语气，不要空话套话\n\n"
        "待精读的正文：\n" + text
    )
    try:
        result, err = _llm_chat([{"role": "user", "content": prompt}], max_tokens=8000,
                                temperature=0.3, model=_get_task_model("annotate"),
                                no_thinking=True)
        if err:
            return {"ok": False, "error": err}
        content = result["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = re.sub(r"^```(?:markdown)?\s*", "", content)
            content = re.sub(r"\s*```$", "", content)
        content = re.sub(r"^-+\s*\n", "", content)
        content = re.sub(r"\n-+\s*$", "", content)
        usage = result.get("usage", {})
        return {"ok": True, "annotated": content.strip(),
                "model": result.get("model", ""), "tokens": usage.get("total_tokens", 0)}
    except Exception as exc:
        return {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:300]}


def build_metadata_draft(job):
    """组合三种来源，产出可在前端编辑的元数据草稿。"""
    md_path = os.path.join(job["dir"], "result.md")
    with open(md_path, "r", encoding="utf-8") as f:
        md = f.read()
    embedded = read_pdf_embedded(job["input"])
    heur = heuristic_from_md(md)
    notes = []

    meta = {
        "title": heur["title"] or embedded["title"],
        "authors": embedded["authors"] or heur.get("authors", []),
        "year": heur["year"],
        "doi": heur["doi"],
        "journal": "",
        "abstract": heur["abstract"],
        "keywords": [],
        "pages": embedded["pages"],
        "chars": len(md),
    }
    if embedded["title"]:
        notes.append("PDF 内嵌信息已读取")
    if heur["title"]:
        notes.append("标题/年份由转写文本启发式提取，请核对")

    if meta["doi"]:
        cr = crossref_by_doi(meta["doi"])
        if cr:
            meta["title"] = cr["title"] or meta["title"]
            if cr["authors"]:
                meta["authors"] = cr["authors"]
            meta["year"] = cr["year"] or meta["year"]
            meta["journal"] = cr["journal"]
            if cr["abstract"]:
                meta["abstract"] = cr["abstract"]
            notes.append("已通过 CrossRef（DOI）补全权威信息")
        else:
            notes.append("DOI 存在但 CrossRef 未命中/网络超时，已用本地提取结果")

    return {"ok": True, "meta": meta, "authorsText": "、".join(meta["authors"]), "notes": notes}


def list_library():
    """扫描文献库，返回各分类下已有主题与文献数（供前端下拉）。"""
    result = {}
    for cat, folder in CATEGORY_DIRS.items():
        cat_dir = os.path.join(LIT_ROOT, folder)
        themes = []
        if os.path.isdir(cat_dir):
            for theme in sorted(os.listdir(cat_dir)):
                tdir = os.path.join(cat_dir, theme)
                if not os.path.isdir(tdir) or theme.startswith("."):
                    continue
                papers = [d for d in os.listdir(tdir)
                          if os.path.isdir(os.path.join(tdir, d)) and not d.startswith(".")]
                themes.append({"theme": theme, "count": len(papers)})
        result[cat] = themes
    return result


def build_note_markdown(meta, rel_paper_dir, category, theme, priority):
    """生成读书札记骨架，严格对齐 01_文献库/01_精读文献/文献精读笔记模板.md 的九节结构。"""
    title = meta.get("title", "未命名文献")
    authors = "、".join(meta.get("authors", [])) or ""
    year = meta.get("year", "") or ""
    journal = meta.get("journal", "") or ""
    doi = meta.get("doi", "") or ""
    keywords = "、".join(meta.get("keywords", [])) or ""
    summary_zh = (meta.get("summaryZh", "") or "").strip()
    today = date.today().isoformat()
    keywords_row = "| 关键词 | %s |\n" % keywords if keywords else ""
    summary_block = "> %s\n" % summary_zh if summary_zh else "> 用一两句话说明这篇文献解决了什么问题、核心主张是什么。\n\n-"
    return """# 文献精读｜{title}

> 分类：{category}　·　主题：{theme}　·　优先级：{priority}　·　入库日期：{today}
> 原文 PDF：`{paper_dir}/paper.pdf`　｜　转写 Markdown：`{paper_dir}/paper.md`

## 一、基本信息

| 项目 | 内容 |
|---|---|
| 题名 | {title} |
| 作者 | {authors} |
| 期刊 / 会议 / 出版社 | {journal} |
| 年份 / 卷期 / 页码 | {year} |
| DOI / 链接 | {doi} |
{keywords_row}| 文献类型 | ☐ 期刊论文 ☐ 会议论文 ☐ 专著章节 ☐ 综述 ☐ 预印本 |
| 阅读日期 | {today} |
| 精读轮次 | 第 1 轮 / 第 2 轮 |

## 二、一句话概括

{summary_block}

## 三、研究问题与背景

- 作者要回答什么问题？（研究问题 / 目标）
- 这个问题为什么重要？（学术背景 / 现实动因）
- 与我的研究方向（语境论 / 可解释性）的关联点？

## 四、核心论点 / 理论框架

- 核心概念及其界定：
- 主要论证链（前提 → 结论）：
- 关键区分 / 命题：

## 五、方法与证据

- 研究方法（理论分析 / 实证 / 案例 / 形式化……）：
- 关键证据或支撑材料：
- 论证强度评估：

## 六、结论与贡献

- 主要结论：
- 理论贡献 / 实践意义：

## 七、我的评价与疑问

- 论证中成立的部分：
- 薄弱环节 / 可质疑之处：
- 待查证的问题：

## 八、与其他文献的联系

- 与已读文献的对话关系（支持 / 反对 / 互补）：
- 在文献地图中的位置：

## 九、可引用段落摘录

> 摘录关键原句，标注页码，方便日后引用。

- p.　：

---
*本札记由工作台 PDF 转写后自动生成骨架，基本信息已预填，请在精读中补全。*
""".format(title=title, authors=authors, year=year, journal=journal, doi=doi,
           category=category, theme=theme, priority=priority,
           paper_dir=rel_paper_dir, today=today,
           keywords_row=keywords_row, summary_block=summary_block)


def ingest_paper(job, payload):
    """执行归档：复制 PDF/MD/图片、写 metadata.json、生成读书札记。"""
    meta = payload.get("meta", {}) or {}
    category = payload.get("category", "精读")
    if category not in CATEGORY_DIRS:
        raise ValueError("分类必须是 精读/泛读/待读")
    theme = sanitize_filename(payload.get("theme", "") or "未分类主题", 40)
    priority = payload.get("priority", "参考")
    if priority not in ("核心", "参考", "补充"):
        priority = "参考"
    make_notes = bool(payload.get("makeNotes", True))

    title = (meta.get("title", "") or "未命名文献").strip()
    year = re.sub(r"\D", "", str(meta.get("year", "") or ""))[:4] or "未知年份"
    authors = split_authors(meta.get("authorsText", "") or meta.get("authors", []))
    short = sanitize_filename(title, 50)
    folder_name = "%s-%s" % (year, short)

    theme_dir = os.path.join(LIT_ROOT, CATEGORY_DIRS[category], theme)
    target_dir = _unique_path(os.path.join(theme_dir, folder_name), is_dir=True)
    # 二次防护：归档路径必须仍在文献库内
    if not os.path.abspath(target_dir).startswith(os.path.abspath(LIT_ROOT)):
        raise ValueError("非法归档路径")
    os.makedirs(target_dir, exist_ok=True)

    # 复制 PDF / Markdown / 图片
    shutil.copy2(job["input"], os.path.join(target_dir, "paper.pdf"))
    paper_md = os.path.join(target_dir, "paper.md")
    shutil.copy2(os.path.join(job["dir"], "result.md"), paper_md)
    src_img = os.path.join(job["dir"], "images")
    img_count = 0
    if os.path.isdir(src_img):
        dst_img = os.path.join(target_dir, "images")
        os.makedirs(dst_img, exist_ok=True)
        for fn in sorted(os.listdir(src_img)):
            s = os.path.join(src_img, fn)
            if os.path.isfile(s):
                shutil.copy2(s, os.path.join(dst_img, fn))
                img_count += 1

    meta_full = {
        "title": title,
        "authors": authors,
        "year": year,
        "doi": meta.get("doi", ""),
        "journal": meta.get("journal", ""),
        "abstract": meta.get("abstract", ""),
        "keywords": [k.strip() for k in re.split(r"[,，、;；]", str(meta.get("keywords", ""))) if k.strip()],
        "summaryZh": meta.get("summaryZh", ""),
        "category": category,
        "theme": theme,
        "priority": priority,
        "sourceEngine": job.get("engine", ""),
        "pages": meta.get("pages", 0),
        "chars": meta.get("chars", 0),
        "imageCount": img_count,
        "ingestedAt": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "files": {"pdf": "paper.pdf", "markdown": "paper.md", "imagesDir": "images/"},
    }
    with open(os.path.join(target_dir, "metadata.json"), "w", encoding="utf-8") as f:
        json.dump(meta_full, f, ensure_ascii=False, indent=2)

    rel_paper_dir = os.path.relpath(target_dir, WORKBENCH_ROOT)
    result = {
        "ok": True,
        "paperDir": rel_paper_dir,
        "metadataPath": os.path.join(rel_paper_dir, "metadata.json"),
        "notePath": "",
        "imageCount": img_count,
    }

    if make_notes:
        os.makedirs(NOTES_ROOT, exist_ok=True)
        note_path = _unique_path(os.path.join(NOTES_ROOT, folder_name + ".md"), is_dir=False)
        with open(note_path, "w", encoding="utf-8") as f:
            f.write(build_note_markdown(meta_full, rel_paper_dir, category, theme, priority))
        result["notePath"] = os.path.relpath(note_path, WORKBENCH_ROOT)

    # 保存入库信息到 job 目录，供"引用到札记"等后续功能定位 notePath
    try:
        ingest_info = {
            "paperDir": result["paperDir"],
            "metadataPath": result["metadataPath"],
            "notePath": result["notePath"],
            "imageCount": img_count,
            "ingestedAt": meta_full["ingestedAt"],
            "title": title,
            "theme": theme,
            "category": category,
        }
        with open(os.path.join(job["dir"], "ingest.json"), "w", encoding="utf-8") as f:
            json.dump(ingest_info, f, ensure_ascii=False, indent=2)
    except Exception:
        pass  # 入库信息保存失败不影响归档本身

    return result


def append_quote_to_note(job_id, text, section="九"):
    """将选中的原文段落以引用块格式追加到读书札记的指定章节。

    Args:
        job_id: PDF 转写任务 ID，用于从 job 目录读取 ingest.json 定位札记
        text: 选中的原文内容
        section: 追加到哪个章节，默认"九"（可引用段落摘录）

    Returns:
        dict: {ok, notePath, appended, chars}
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("引用内容为空")
    if len(text) > 5000:
        text = text[:5000] + "…（截断）"

    job_dir = os.path.join(JOBS_DIR, job_id)
    ingest_path = os.path.join(job_dir, "ingest.json")
    if not os.path.isfile(ingest_path):
        raise ValueError("该文献尚未存入文献库，请先点「存入文献库」")

    with open(ingest_path, "r", encoding="utf-8") as f:
        ingest_info = json.load(f)
    note_rel = ingest_info.get("notePath", "")
    if not note_rel:
        raise ValueError("该文献入库时未生成读书札记")

    note_path = os.path.join(WORKBENCH_ROOT, note_rel)
    # 二次防护：札记路径必须在研究笔记目录下
    if not os.path.abspath(note_path).startswith(os.path.abspath(NOTES_ROOT)):
        raise ValueError("非法札记路径")
    if not os.path.isfile(note_path):
        raise ValueError("札记文件不存在：%s" % note_rel)

    with open(note_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 格式化引用块：每行加 > 前缀，空行也保留
    quote_lines = []
    for line in text.split("\n"):
        stripped = line.rstrip()
        if stripped:
            quote_lines.append("> " + stripped)
        else:
            quote_lines.append(">")
    quote_block = "\n".join(quote_lines)

    # 带时间戳的引用条目
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = "\n- **%s 摘录**\n\n%s\n" % (timestamp, quote_block)

    # 定位插入点：在页脚分隔线 `---` 之前插入
    # 札记末尾格式：---\n*本札记由工作台...*
    footer_marker = "\n---\n*本札记由工作台"
    idx = content.rfind(footer_marker)
    if idx >= 0:
        new_content = content[:idx] + entry + content[idx:]
    else:
        # 找不到页脚就直接追加到末尾
        new_content = content.rstrip() + "\n\n" + entry + "\n"

    with open(note_path, "w", encoding="utf-8") as f:
        f.write(new_content)

    return {
        "ok": True,
        "notePath": note_rel,
        "appended": True,
        "chars": len(text),
    }


# ---------------------------------------------------------------------------
# HTTP 服务
# ---------------------------------------------------------------------------
MIME = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
    ".md": "text/markdown; charset=utf-8",
}


_IMAGE_INDEX = {"ts": 0, "map": {}}


def _find_image_anywhere(filename):
    """在全部 job 的 images/ 里找同名单图（带 120 秒索引缓存）。
    MinerU 图片名是内容 hash，跨 job 同名即为同一张图，可安全复用。"""
    if not filename or "/" in filename or "\\" in filename:
        return None
    now = time.time()
    if now - _IMAGE_INDEX["ts"] > 120:
        index = {}
        try:
            for name in os.listdir(JOBS_DIR):
                img_dir = os.path.join(JOBS_DIR, name, "images")
                if not os.path.isdir(img_dir):
                    continue
                for fn in os.listdir(img_dir):
                    index.setdefault(fn, os.path.join(img_dir, fn))
        except OSError:
            pass
        _IMAGE_INDEX["map"] = index
        _IMAGE_INDEX["ts"] = now
    return _IMAGE_INDEX["map"].get(filename)


class WorkerHandler(BaseHTTPRequestHandler):
    server_version = "PdfWorker/1.0"

    def log_message(self, *args):
        pass  # 静默，保持终端干净

    # ---- 工具 ----
    def _json(self, code, obj):
        raw = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def _bytes(self, code, raw, ctype, download_name=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        if download_name:
            self.send_header("Content-Disposition", 'inline; filename="%s"' % download_name)
        self.end_headers()
        self.wfile.write(raw)

    def _read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(length) if length > 0 else b""

    # ---- GET ----
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        q = parse_qs(parsed.query)

        if path == "/api/pdf/health":
            token_info = get_token_info()
            return self._json(200, {
                "ok": True,
                "local": local_engine_available(),
                "cloud": bool(get_cloud_token()),
                "mineruCli": MINERU_CLI if local_engine_available() else "",
                "token": token_info,
                "models": _llm_models(),
                "time": time.strftime("%Y-%m-%d %H:%M:%S"),
            })

        if path == "/api/pdf/status":
            job_id = q.get("jobId", [""])[0]
            status = JOBS.public_status(job_id)
            if not status and job_id:
                # 磁盘兜底：worker 重启后内存无记录，但结果已落盘的旧任务
                # 应报 done（而非 404），否则刷新页面后无法回看旧结果
                job_dir = os.path.join(JOBS_DIR, job_id)
                if os.path.isfile(os.path.join(job_dir, "result.md")):
                    status = {"jobId": job_id, "ok": True, "status": "done",
                              "progress": 100, "progressText": "已完成", "engine": ""}
            if not status:
                return self._json(404, {"ok": False, "error": "任务不存在：%s" % job_id})
            return self._json(200, status)

        if path == "/api/pdf/result":
            job_id = q.get("jobId", [""])[0]
            with JOBS.lock:
                job = dict(JOBS.jobs[job_id]) if job_id in JOBS.jobs else None
            if not job:
                return self._json(404, {"ok": False, "error": "任务不存在"})
            md_path = os.path.join(job["dir"], "result.md")
            if not os.path.isfile(md_path):
                return self._json(409, {"ok": False, "error": "结果尚未生成", "status": job["status"]})
            with open(md_path, "r", encoding="utf-8") as f:
                markdown = f.read()
            rel = os.path.relpath(md_path, BASE_DIR)
            return self._json(200, {
                "ok": True,
                "jobId": job_id,
                "markdown": markdown,
                "images": job.get("images", []),
                "savedPath": rel,
                "engine": job["engine"],
                "chars": len(markdown),
            })

        if path == "/api/pdf/asset":
            job_id = q.get("jobId", [""])[0]
            rel_file = q.get("file", [""])[0]
            with JOBS.lock:
                job = JOBS.jobs.get(job_id)
            if not job and job_id:
                # 磁盘兜底：worker 重启后内存任务表为空，旧任务的图片仍需可取
                # （否则旧预览/旧译文整页裂图——只剩余「图 N」编号标签）
                job_dir = os.path.join(JOBS_DIR, job_id)
                if os.path.isdir(job_dir):
                    job = {"jobId": job_id, "dir": job_dir, "status": "done"}
            if not job:
                return self._json(404, {"ok": False, "error": "任务不存在"})
            # 防目录穿越：只允许 images/ 下的图片
            safe_rel = os.path.normpath(rel_file)
            full = os.path.normpath(os.path.join(job["dir"], safe_rel))
            if not full.startswith(os.path.join(job["dir"], "images") + os.sep):
                return self._json(404, {"ok": False, "error": "资源不存在"})
            if not os.path.isfile(full):
                # 跨 job 回退：MinerU 图片名是内容 hash（全局唯一），同类论文的
                # 重复转写在磁盘瘦身时可能删掉旧 job 的 images/，此时从其它 job 取
                # 同名文件，避免旧译文/旧预览整页裂图。
                full = _find_image_anywhere(os.path.basename(safe_rel)) or full
                if not os.path.isfile(full):
                    return self._json(404, {"ok": False, "error": "资源不存在"})
            ext = os.path.splitext(full)[1].lower()
            with open(full, "rb") as f:
                return self._bytes(200, f.read(), MIME.get(ext, "application/octet-stream"))

        if path == "/api/pdf/library":
            return self._json(200, {"ok": True, "categories": list_library()})

        if path == "/api/pdf/translation":
            job_id = q.get("jobId", [""])[0]
            trans_path = os.path.join(JOBS_DIR, job_id, "translation.md") if job_id else ""
            if trans_path and os.path.isfile(trans_path):
                with open(trans_path, "r", encoding="utf-8") as f:
                    translated = f.read()
                return self._json(200, {"ok": True, "exists": True, "translated": translated})
            return self._json(200, {"ok": True, "exists": False, "translated": ""})

        if path == "/api/pdf/translations":
            return self._json(200, list_translations())

        if path == "/api/pdf/translation/get":
            tid = q.get("id", [""])[0]
            if not tid:
                return self._json(400, {"ok": False, "error": "缺少译文 id"})
            return self._json(200, get_translation(tid))

        if path == "/api/pdf/summaries":
            return self._json(200, list_summaries())

        # 原文 PDF：直接以 application/pdf 返回任务的 input.pdf，
        # 前端 window.open() 即可在默认浏览器（Edge）里内嵌打开。
        # 走这个端点而不是静态目录，是因为原始 PDF 在 data/pdf_jobs/ 下，
        # 不在静态目录里，而且这里可以做「同类论文」兜底查找。
        if path == "/api/pdf/original":
            job_id = q.get("jobId", [""])[0]
            if not job_id:
                return self._json(400, {"ok": False, "error": "缺少任务 id"})
            pdf_path = find_job_pdf(job_id)
            if not pdf_path:
                return self._json(404, {"ok": False, "error":
                                        "找不到这篇文章的 PDF 原件（旧任务的 PDF 会在磁盘瘦身时回收，重新转写一次即可）"})
            try:
                with open(pdf_path, "rb") as f:
                    return self._bytes(200, f.read(), "application/pdf")
            except Exception as exc:
                return self._json(500, {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:200]})

        if path == "/api/pdf/readings":
            return self._json(200, list_readings())

        if path == "/api/pdf/reading":
            job_id = q.get("jobId", [""])[0]
            if not job_id:
                return self._json(400, {"ok": False, "error": "缺少任务 id"})
            return self._json(200, get_job_reading(job_id))

        if path == "/api/pdf/reading/plan":
            job_id = q.get("jobId", [""])[0]
            if not job_id:
                return self._json(400, {"ok": False, "error": "缺少任务 id"})
            return self._json(200, reading_plan(job_id))

        if path == "/api/pdf/reading/status":
            job_id = q.get("jobId", [""])[0]
            if not job_id:
                return self._json(400, {"ok": False, "error": "缺少任务 id"})
            return self._json(200, reading_status(job_id))

        if path == "/api/pdf/reading/get":
            rid = q.get("id", [""])[0]
            if not rid:
                return self._json(400, {"ok": False, "error": "缺少精读 id"})
            return self._json(200, get_reading(rid))

        if path == "/api/pdf/summary":
            summary_id = q.get("id", [""])[0]
            if not summary_id:
                return self._json(400, {"ok": False, "error": "缺少摘要 id"})
            return self._json(200, get_summary(summary_id))

        if path == "/api/pdf/open-folder":
            job_id = q.get("jobId", [""])[0]
            if not job_id:
                return self._json(400, {"ok": False, "error": "缺少 jobId"})
            job_dir = os.path.join(JOBS_DIR, job_id)
            if not os.path.isdir(job_dir):
                return self._json(404, {"ok": False, "error": "任务目录不存在：%s" % job_id})
            try:
                subprocess.run(["open", job_dir], check=True)
                return self._json(200, {"ok": True, "path": job_dir})
            except Exception as e:
                return self._json(500, {"ok": False, "error": "打开文件夹失败：%s" % str(e)})

        self._json(404, {"ok": False, "error": "not found"})

    # ---- POST ----
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        q = parse_qs(parsed.query)

        if path == "/api/pdf/from-url":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            url = (body.get("url") or "").strip()
            title = (body.get("title") or "").strip()
            if not url:
                return self._json(400, {"ok": False, "error": "缺少 PDF 链接"})
            return self._json(200, start_job_from_url(
                url, title, body.get("engine", "local"), body.get("source", "")))

        if path == "/api/pdf/upload":
            name = q.get("name", ["upload.pdf"])[0]
            safe_name = os.path.basename(name).replace("/", "_").replace("\\", "_") or "upload.pdf"
            if not safe_name.lower().endswith(".pdf"):
                safe_name += ".pdf"
            raw = self._read_body()
            if not raw:
                return self._json(400, {"ok": False, "error": "上传内容为空"})
            stamp = time.strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
            saved = os.path.join(UPLOAD_DIR, "%s_%s" % (stamp, safe_name))
            with open(saved, "wb") as f:
                f.write(raw)
            return self._json(200, {"ok": True, "pdfPath": saved, "size": len(raw), "name": safe_name})

        if path == "/api/pdf/submit":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            pdf_path = body.get("pdfPath", "")
            engine = body.get("engine", "local")
            opts = {
                "formula": body.get("formula", True),
                "table": body.get("table", True),
            }
            try:
                job = JOBS.create(pdf_path, engine, opts)
            except (ValueError, FileNotFoundError) as exc:
                return self._json(400, {"ok": False, "error": str(exc)})
            return self._json(200, {"ok": True, "jobId": job["jobId"], "status": job["status"]})

        if path in ("/api/pdf/metadata", "/api/pdf/ingest"):
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            job_id = body.get("jobId", "")
            with JOBS.lock:
                job = dict(JOBS.jobs[job_id]) if job_id in JOBS.jobs else None
            if not job:
                return self._json(404, {"ok": False, "error": "任务不存在，请先完成转写"})
            if job.get("status") != "done":
                return self._json(409, {"ok": False, "error": "转写尚未完成，当前状态：%s" % job.get("status")})
            try:
                if path == "/api/pdf/metadata":
                    return self._json(200, build_metadata_draft(job))
                return self._json(200, ingest_paper(job, body))
            except Exception as exc:
                return self._json(400, {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:500]})

        if path == "/api/pdf/llm/summarize":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            job_id = body.get("jobId", "")
            with JOBS.lock:
                job = dict(JOBS.jobs[job_id]) if job_id in JOBS.jobs else None
            # worker 重启后内存 job 丢失，从 jobId 重建最小 job 对象（只需 dir）
            if not job and job_id:
                job_dir = os.path.join(JOBS_DIR, job_id)
                if os.path.isfile(os.path.join(job_dir, "result.md")):
                    job = {"jobId": job_id, "dir": job_dir, "status": "done"}
            if not job:
                return self._json(404, {"ok": False, "error": "任务不存在，请先完成转写"})
            if job.get("status") != "done":
                return self._json(409, {"ok": False, "error": "转写尚未完成，当前状态：%s" % job.get("status")})
            depth = body.get("depth", "standard")
            if depth not in ("quick", "standard", "deep"):
                depth = "standard"
            return self._json(200, llm_summarize(job, depth=depth))

        if path == "/api/pdf/summary/save":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            job_id = body.get("jobId", "")
            summary_data = body.get("summary", {})
            if not summary_data:
                return self._json(400, {"ok": False, "error": "缺少摘要数据"})
            with JOBS.lock:
                job = dict(JOBS.jobs[job_id]) if job_id in JOBS.jobs else None
            if not job and job_id:
                job_dir = os.path.join(JOBS_DIR, job_id)
                if os.path.isfile(os.path.join(job_dir, "result.md")):
                    job = {"jobId": job_id, "dir": job_dir, "status": "done"}
            if not job:
                return self._json(404, {"ok": False, "error": "任务不存在"})
            return self._json(200, save_summary(job, summary_data))

        if path == "/api/pdf/summary/tags":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            sid = body.get("id", "")
            tags = body.get("tags", [])
            if not sid:
                return self._json(400, {"ok": False, "error": "缺少摘要 id"})
            return self._json(200, update_summary_tags(sid, tags))

        if path == "/api/pdf/llm/translate":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            text = body.get("text", "")
            return self._json(200, llm_translate(text))

        # 精读：单块生成（前端分块并发调用，与翻译同构）
        if path == "/api/pdf/llm/annotate":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            return self._json(200, llm_annotate(body.get("text", "")))

        # 精读长文写进任务目录（空内容会被拒绝，防止误清）
        if path == "/api/pdf/reading/save":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            return self._json(200, save_reading(body.get("jobId", ""), body.get("markdown", "")))

        # 服务端生成精读（任何入口点一下都能补齐，不必回 PDF 转写重跑）
        if path == "/api/pdf/reading/generate":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            return self._json(200, start_reading(body.get("jobId", "")))

        if path == "/api/pdf/reading/cancel":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            return self._json(200, cancel_reading(body.get("jobId", "")))

        # 归档进精读库
        if path == "/api/pdf/reading/archive":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            job_id = body.get("jobId", "")
            if not job_id:
                return self._json(400, {"ok": False, "error": "缺少任务 id"})
            return self._json(200, archive_reading(job_id))

        if path == "/api/pdf/reading/delete":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            rid = body.get("id", "")
            if not rid:
                return self._json(400, {"ok": False, "error": "缺少精读 id"})
            return self._json(200, delete_reading(rid))

        if path == "/api/pdf/translation/save":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            job_id = body.get("jobId", "")
            translated = body.get("translated", "")
            if not job_id:
                return self._json(400, {"ok": False, "error": "缺少 jobId"})
            # 空内容拒绝写入：调用方漏传 translated 时会把已有译文清空
            # （曾因此误清一份 8 万字的译文，靠每日快照才恢复）
            if not str(translated or "").strip():
                return self._json(400, {"ok": False, "error": "译文内容为空，已拒绝写入以免覆盖已有译文"})
            job_dir = os.path.join(JOBS_DIR, job_id)
            if not os.path.isdir(job_dir):
                return self._json(404, {"ok": False, "error": "任务目录不存在"})
            with open(os.path.join(job_dir, "translation.md"), "w", encoding="utf-8") as f:
                f.write(translated)
            return self._json(200, {"ok": True, "saved": True})

        # 注意：/api/pdf/translation/save 已存在（前端翻译完成后把正文写入
        # job 目录的 translation.md，见上）。归档进译文库用 archive 路径区分。
        if path == "/api/pdf/translation/archive":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            job_id = body.get("jobId", "")
            if not job_id:
                return self._json(400, {"ok": False, "error": "缺少任务 id"})
            return self._json(200, save_translation(job_id))

        if path == "/api/pdf/translation/delete":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            tid = body.get("id", "")
            if not tid:
                return self._json(400, {"ok": False, "error": "缺少译文 id"})
            return self._json(200, delete_translation(tid))

        if path == "/api/pdf/summary/suggest-tags":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            sid = body.get("id", "")
            if not sid:
                return self._json(400, {"ok": False, "error": "缺少摘要 id"})
            return self._json(200, suggest_summary_tags(sid))

        if path == "/api/pdf/summary/quick-add":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            return self._json(200, quick_add_summary(body))

        if path == "/api/pdf/summaries/bibtex":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            return self._json(200, export_bibtex(body.get("ids")))

        if path == "/api/pdf/review":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            return self._json(200, generate_review(body))

        if path == "/api/pdf/note/quote":
            try:
                body = json.loads(self._read_body().decode("utf-8") or "{}")
            except Exception:
                return self._json(400, {"ok": False, "error": "请求体不是合法 JSON"})
            job_id = body.get("jobId", "")
            text = body.get("text", "")
            section = body.get("section", "九")
            if not job_id:
                return self._json(400, {"ok": False, "error": "缺少 jobId"})
            if not text or not text.strip():
                return self._json(400, {"ok": False, "error": "引用内容为空"})
            try:
                return self._json(200, append_quote_to_note(job_id, text, section))
            except Exception as exc:
                return self._json(400, {"ok": False, "error": "%s: %s" % (type(exc).__name__, str(exc))[:500]})

        self._json(404, {"ok": False, "error": "not found"})


JOBS = JobManager()


def main():
    server = ThreadingHTTPServer((HOST, PORT), WorkerHandler)
    print("=" * 56)
    print("  PDF 转写 Worker 已启动  http://%s:%d" % (HOST, PORT))
    print("  本地引擎 MinerU CLI：%s" % ("就绪" if local_engine_available() else "未找到"))
    print("  云端 Token：%s" % ("已配置" if get_cloud_token() else "未配置"))
    print("  按 Ctrl+C 停止（通常由 start.command 后台拉起）")
    print("=" * 56)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPDF Worker 已停止。")


if __name__ == "__main__":
    main()
