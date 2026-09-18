# -*- coding: utf-8 -*-
"""
server.py —— 学术工作台本地后端
功能：
  * 提供前端页面（web/ 目录）
  * API：概览统计、目录树、资讯缓存、待办、研究日志、打开文件夹
  * 资讯缓存管理：1 小时 TTL（见下方 CACHE_TTL），手动刷新立即拉取；断网时返回旧缓存
  * 依赖：仅 Python 标准库
运行：python3 server.py  →  浏览器打开 http://127.0.0.1:8765
"""

import os
import sys
import re
import json
import time
import shutil
import subprocess
import threading
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

import fetchers

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE = os.path.dirname(BASE_DIR)          # 学术工作台根目录
WEB_DIR = os.path.join(BASE_DIR, "web")
DATA_DIR = os.path.join(BASE_DIR, "data")
CACHE_FILE = os.path.join(DATA_DIR, "cache.json")
TODOS_FILE = os.path.join(DATA_DIR, "todos.json")
JOURNAL_FILE = os.path.join(DATA_DIR, "journal.json")
LITERATURE_DIR = os.path.join(DATA_DIR, "literature")
FRONTIER_DIR = os.path.join(DATA_DIR, "frontier")
HOTSPOT_DIR = os.path.join(DATA_DIR, "hotspots")
PUBLICATIONS_FILE = os.path.join(DATA_DIR, "publications.json")

PORT = 8765
WORKER_BASE = "http://127.0.0.1:8766"   # PDF 转写 worker（pdf_worker/worker.py）
WORKER_PY = os.path.join(BASE_DIR, "pdf_worker", ".venv", "bin", "python")
WORKER_SCRIPT = os.path.join(BASE_DIR, "pdf_worker", "worker.py")
CACHE_TTL = 1 * 3600          # 资讯缓存有效期：1 小时
CACHE_MAX_AGE = 7 * 24 * 3600  # 缓存最长保留：7 天（之后即使断网也不展示）


# ---------------------------------------------------------------------------
# 个人设定（可选）：复制 data/settings.example.json 为 data/settings.json 即可覆盖
#   field_name           侧栏与浏览器标题上的研究领域名
#   degree_level         学段：本科 / 硕士 / 博士（决定进度卡标题与年级名）
#   program_years        学制年数（本科一般 4、硕士 3、博士 4）
#   phd_start            入学日期 YYYY-MM-DD
#   phd_end              预计毕业日期 YYYY-MM-DD
#   c_journal_required   毕业要求论文数
#   c_journal_label      毕业要求名称（如「C 刊论文」「SCI 一区」）
#   workspace_dir        「文件夹」面板扫描的根目录（默认 = 工作台的上一级目录）
#   auto_archive         每日自动 git 存档开关（默认关闭；开启后每天自动提交一次）
#
# 学制四项（degree_level / program_years / phd_start / phd_end）刻意**不设默认值**：
# 没配置时界面显示「待设置」并给出提示，而不是拿内置日期算出一个不属于你的进度。
# ---------------------------------------------------------------------------
def _load_settings():
    """读取 data/settings.json；不存在或损坏时返回空 dict，全部走内置默认值。"""
    try:
        with open(os.path.join(DATA_DIR, "settings.json"), "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


SETTINGS = _load_settings()

# 研究领域名：显示在侧栏品牌下方（改 data/settings.json 的 field_name 即可）
FIELD_NAME = SETTINGS.get("field_name") or "你的研究领域"

# 学段与学制（可在 data/settings.json 覆盖）。刻意不设默认日期，见上方注释。
DEGREE_LEVEL = (SETTINGS.get("degree_level") or "").strip()
try:
    PROGRAM_YEARS = int(SETTINGS.get("program_years") or 0)
except (TypeError, ValueError):
    PROGRAM_YEARS = 0
PHD_START = (SETTINGS.get("phd_start") or "").strip()
PHD_END = (SETTINGS.get("phd_end") or "").strip()

try:
    _C_JOURNAL_N = int(SETTINGS.get("c_journal_required") or 2)
except (TypeError, ValueError):
    _C_JOURNAL_N = 2

# 毕业条件
GRADUATION_REQUIREMENTS = {
    "c_journal_required": _C_JOURNAL_N,   # 需发表论文数
    "c_journal_label": SETTINGS.get("c_journal_label") or "C 刊论文",
}

# 工作台根目录（「文件夹」面板扫描起点，可在 settings.json 用 workspace_dir 覆盖）
WORKSPACE = SETTINGS.get("workspace_dir") or WORKSPACE

# 8 大板块目录（与文件夹体系一一对应）
SECTIONS = [
    ("01_文献库", "文献库"),
    ("02_研究笔记", "研究笔记"),
    ("03_论文写作", "论文写作"),
    ("04_数据分析", "数据分析"),
    ("05_学业事务", "学业事务"),
    ("06_项目归档", "项目归档"),
    ("07_个人管理", "个人管理"),
    ("08_临时中转", "临时中转"),
]

_lock = threading.Lock()


# ---------------------------------------------------------------------------
# 数据读写工具
# ---------------------------------------------------------------------------
def _ensure_data_dir():
    os.makedirs(DATA_DIR, exist_ok=True)


def _read_json(path, default):
    _ensure_data_dir()
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _write_json(path, data):
    _ensure_data_dir()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ---------------------------------------------------------------------------
# 文件系统服务
# ---------------------------------------------------------------------------
def scan_tree(root, max_depth=3, max_items=80):
    """扫描工作台目录树，返回 {name, path, type, children, count}"""
    root = os.path.abspath(root)

    def walk(dirpath, depth):
        node = {
            "name": os.path.basename(dirpath) or dirpath,
            "path": dirpath,
            "type": "dir",
            "count": 0,
            "children": [],
        }
        try:
            entries = sorted(os.listdir(dirpath), key=lambda x: (not os.path.isdir(os.path.join(dirpath, x)), x.lower()))
        except OSError:
            return node
        for name in entries:
            if name.startswith("."):
                continue
            full = os.path.join(dirpath, name)
            if os.path.isdir(full):
                if depth < max_depth:
                    child = walk(full, depth + 1)
                else:
                    child = {"name": name, "path": full, "type": "dir", "count": 0, "children": []}
                node["children"].append(child)
                node["count"] += child["count"]
            else:
                node["children"].append({"name": name, "path": full, "type": "file", "size": os.path.getsize(full) if os.path.exists(full) else 0})
                node["count"] += 1
        node["children"] = node["children"][:max_items]
        return node

    return walk(root, 0)


def section_stats():
    """统计各板块文件数 + 最近修改的 2 个文件。"""
    stats = []
    for folder, label in SECTIONS:
        path = os.path.join(WORKSPACE, folder)
        count = 0
        recent = []
        if os.path.isdir(path):
            all_files = []
            for dirpath, _, filenames in os.walk(path):
                for fn in filenames:
                    if fn.startswith(".") or fn.startswith("~$"):
                        continue
                    fp = os.path.join(dirpath, fn)
                    try:
                        all_files.append((os.path.getmtime(fp), fp))
                    except OSError:
                        pass
            count = len(all_files)
            recent = [fp for _, fp in sorted(all_files, reverse=True)[:2]]
        stats.append({"folder": folder, "label": label, "count": count, "recent": recent})
    return stats


# 学段 → 年级单字（大一 / 研二 / 博三）
_DEGREE_STAGE_CHAR = {"本科": "大", "硕士": "研", "博士": "博"}
_CN_DIGITS = "〇一二三四五六七八九十"


def degree_label():
    """进度卡标题：设了学段就是「博士进度 / 硕士进度 / 本科进度」，否则「学业进度」。"""
    return (DEGREE_LEVEL + "进度") if DEGREE_LEVEL else "学业进度"


def _stage_name(year_no):
    """第 N 学年 → 年级名（大一 / 研二 / 博三）。没设学段时返回空串。"""
    ch = _DEGREE_STAGE_CHAR.get(DEGREE_LEVEL)
    if not ch or year_no < 1:
        return ""
    num = _CN_DIGITS[year_no] if year_no <= 10 else str(year_no)
    return ch + num


def phd_progress():
    """学业进度：入学至今的天数与百分比。

    未在 data/settings.json 里配置学制时返回 configured=False，由前端提示「待设置」——
    绝不拿内置日期假装算出一个不属于用户的进度（这正是旧版「博二显示成博一」的原因）。
    """
    from datetime import datetime

    today = datetime.now()
    base = {
        "configured": False,
        "label": degree_label(),
        "degree_level": DEGREE_LEVEL,
        "total_years": PROGRAM_YEARS,
        "stage": "",
        "year_no": 0,
        "start": PHD_START,
        "end": PHD_END,
        "elapsed_days": 0,
        "total_days": 0,
        "remain_days": 0,
        "percent": 0.0,
        "today": today.strftime("%Y-%m-%d"),
    }
    try:
        start = datetime.strptime(PHD_START, "%Y-%m-%d")
        end = datetime.strptime(PHD_END, "%Y-%m-%d")
    except (TypeError, ValueError):
        return base
    if end <= start:
        return base

    total = (end - start).days
    elapsed = max(0, (today - start).days)
    pct = min(100.0, elapsed / total * 100)
    remain = (end - today).days

    # 当前是第几学年：按入学月日逐年滚动，跨过入学日才算升一级
    years_passed = today.year - start.year - (
        1 if (today.month, today.day) < (start.month, start.day) else 0
    )
    year_no = max(1, years_passed + 1)
    if PROGRAM_YEARS:
        year_no = min(year_no, PROGRAM_YEARS)

    base.update({
        "configured": True,
        "stage": _stage_name(year_no),
        "year_no": year_no,
        "elapsed_days": elapsed,
        "total_days": total,
        "remain_days": max(0, remain),
        "percent": round(pct, 1),
    })
    return base


def get_publications():
    """读取已发表论文列表。"""
    if not os.path.exists(PUBLICATIONS_FILE):
        return []
    try:
        with open(PUBLICATIONS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []


def save_publications(pubs):
    """保存论文列表。"""
    with _lock:
        with open(PUBLICATIONS_FILE, "w", encoding="utf-8") as f:
            json.dump(pubs, f, ensure_ascii=False, indent=2)


def graduation_progress():
    """毕业条件进度统计。"""
    pubs = get_publications()
    c_pubs = [p for p in pubs if p.get("type") == "c_journal"]
    required = GRADUATION_REQUIREMENTS["c_journal_required"]
    return {
        "c_journal": {
            "required": required,
            "achieved": len(c_pubs),
            "remaining": max(0, required - len(c_pubs)),
            "complete": len(c_pubs) >= required,
            "items": c_pubs,
        }
    }


def open_in_finder(path):
    """macOS 下用 Finder 打开路径。"""
    if sys.platform == "darwin":
        subprocess.Popen(["open", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    return False


# ---------------------------------------------------------------------------
# 资讯缓存
# ---------------------------------------------------------------------------
def load_cache():
    return _read_json(CACHE_FILE, {"news": {}, "weather": None, "fetched_at": None})


def save_cache(data):
    _write_json(CACHE_FILE, data)


def get_news(force=False):
    """返回资讯数据。force=True 强制刷新；否则命中 TTL 用缓存。"""
    cache = load_cache()
    now = time.time()

    if not force:
        fetched_at = cache.get("fetched_at")
        if fetched_at:
            try:
                age = now - time.mktime(time.strptime(fetched_at, "%Y-%m-%d %H:%M:%S"))
            except ValueError:
                age = CACHE_TTL + 1
            # 缓存新鲜：直接用
            if age < CACHE_TTL:
                return {"ok": True, "from_cache": True, "data": cache, "age_seconds": int(age)}
            # 缓存过期但还在最长保留期内：返回旧数据并异步刷新
            if age < CACHE_MAX_AGE:
                threading.Thread(target=_background_refresh, daemon=True).start()
                return {"ok": True, "from_cache": True, "stale": True, "data": cache, "age_seconds": int(age)}

    # 无缓存 / 已过期超期 / 强制刷新：同步抓取
    try:
        data = fetchers.fetch_all_with_weather()
        cache = data
        save_cache(cache)
        return {"ok": True, "from_cache": False, "data": cache}
    except Exception as e:
        if cache.get("news"):
            return {"ok": True, "from_cache": True, "stale": True, "data": cache, "refresh_error": str(e)[:120]}
        return {"ok": False, "error": str(e)[:120], "data": {"news": {}, "weather": None}}


def _background_refresh():
    """后台线程刷新缓存（失败静默，不打断用户）。"""
    with _lock:
        cache = load_cache()
        try:
            data = fetchers.fetch_all_with_weather()
            save_cache(data)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 科技爱好者周刊：单源轻接口（磁盘持久化缓存 + 限流冷却）
# 以前周刊面板刷新会触发 /api/news?refresh=1 全量重抓（7 源 + LLM 翻译，20s+），
# 现在只抓 ruanyf/weekly 一个源；缓存落盘，服务重启不丢；GitHub 匿名限额 60 次/小时，
# 被限流后进入 1 小时冷却，期间直接回退缓存，不再雪上加霜。
# ---------------------------------------------------------------------------
WEEKLY_CACHE_TTL = 6 * 3600        # 缓存有效期 6 小时（周刊每周五才更新）
WEEKLY_COOLDOWN = 60 * 60          # 限流冷却期 1 小时
WEEKLY_CACHE_FILE = os.path.join(DATA_DIR, "weekly_cache.json")
_weekly_cache = {"items": None, "ts": 0.0}
_weekly_lock = threading.Lock()
_weekly_fail = {"ts": 0.0, "rate_limited": False}


def _load_weekly_disk():
    data = _read_json(WEEKLY_CACHE_FILE, {})
    return (data.get("items") or []), float(data.get("ts") or 0)


def _save_weekly_disk(items):
    _write_json(WEEKLY_CACHE_FILE, {
        "items": items,
        "ts": time.time(),
        "fetched_at": time.strftime("%Y-%m-%d %H:%M"),
    })


def _merge_weekly(new_items, *old_sources):
    """把新抓结果与旧缓存按期号合并。

    网络抖动时 fetch_weekly 可能只抓到部分期（实测会在 2–6 期之间跳），
    若直接覆盖缓存，列表会忽长忽短。合并规则：
      * 旧缓存里本期未抓到的期 → 保留旧数据
      * 同期新数据缺日期 → 沿用旧日期
    返回按期号倒序、最多 8 条。
    """
    old_map = {}
    for src in old_sources:
        for it in (src or []):
            iss = it.get("issue")
            if iss and iss not in old_map:
                old_map[iss] = it
    merged = {}
    for it in new_items:
        iss = it.get("issue")
        if not iss:
            continue
        if not it.get("date") and old_map.get(iss, {}).get("date"):
            it["date"] = old_map[iss]["date"]
        merged[iss] = it
    for iss, old in old_map.items():
        merged.setdefault(iss, old)
    return sorted(merged.values(), key=lambda x: x.get("issue") or 0, reverse=True)[:8]


def get_weekly(force=False):
    """返回科技爱好者周刊条目。优先级：进程内缓存 → 磁盘缓存 → 现抓 → 回退任一旧缓存。"""
    with _weekly_lock:
        now = time.time()
        cached = _weekly_cache["items"]
        if cached is None:
            disk_items, disk_ts = _load_weekly_disk()
            if disk_items:
                _weekly_cache["items"], _weekly_cache["ts"] = disk_items, disk_ts
                cached = disk_items
        else:
            disk_items, disk_ts = _load_weekly_disk()

        # 1) 进程内缓存新鲜
        if not force and cached is not None and now - _weekly_cache["ts"] < WEEKLY_CACHE_TTL:
            return {"ok": True, "from_cache": True, "items": cached}
        # 2) 磁盘缓存新鲜（服务重启后仍可用）
        if not force and disk_items and now - disk_ts < WEEKLY_CACHE_TTL:
            return {"ok": True, "from_cache": True, "items": disk_items}
        # 3) 限流冷却期内不重试
        if not force and _weekly_fail["rate_limited"] and now - _weekly_fail["ts"] < WEEKLY_COOLDOWN:
            fallback = cached or disk_items
            if fallback:
                return {"ok": True, "from_cache": True, "stale": True, "items": fallback,
                        "refresh_error": "GitHub 接口限流冷却中（1 小时内不重试）"}

        # 4) 现抓
        try:
            items = fetchers.fetch_weekly()
            if items:                      # 空结果不覆盖已有好缓存
                items = _merge_weekly(items, cached, disk_items)
                _weekly_cache["items"], _weekly_cache["ts"] = items, now
                _save_weekly_disk(items)
                _weekly_fail["rate_limited"] = False
                return {"ok": True, "from_cache": False, "items": items}
            return {"ok": True, "from_cache": True, "stale": True,
                    "items": cached or disk_items or [], "refresh_error": "本次未取到内容"}
        except Exception as e:
            err = str(e)[:120]
            _weekly_fail["ts"] = now
            _weekly_fail["rate_limited"] = ("403" in err or "rate limit" in err.lower())
            fallback = cached or disk_items
            if fallback:
                return {"ok": True, "from_cache": True, "stale": True,
                        "items": fallback, "refresh_error": err}
            return {"ok": False, "error": err, "items": []}


# ---------------------------------------------------------------------------
# 待办 / 研究日志
# ---------------------------------------------------------------------------
def get_todos():
    return _read_json(TODOS_FILE, [])


def save_todos(todos):
    _write_json(TODOS_FILE, todos)


def get_journal():
    return _read_json(JOURNAL_FILE, [])


def save_journal(entries):
    _write_json(JOURNAL_FILE, entries)


# ---------------------------------------------------------------------------
# 文献工具：结构化数据 + arXiv 追踪（按需拉取，30 分钟缓存）
# ---------------------------------------------------------------------------
def load_literature(name):
    """读取 literature/ 下的 JSON 数据文件。name: journals|glossary|queries"""
    mapping = {
        "journals": "journals.json",
        "glossary": "glossary.json",
        "queries": "search_queries.json",
    }
    fname = mapping.get(name)
    if not fname:
        return {"error": "unknown literature type", "valid": list(mapping.keys())}
    path = os.path.join(LITERATURE_DIR, fname)
    return _read_json(path, {"items": [], "count": 0})


_arxiv_cache = {"data": None, "ts": 0.0}
ARXIV_CACHE_TTL = 30 * 60  # arXiv 追踪缓存 30 分钟


def get_arxiv_feed(force=False):
    """arXiv 追踪：领域相关论文，按最新提交时间排序。"""
    if not force and _arxiv_cache["data"] and (time.time() - _arxiv_cache["ts"]) < ARXIV_CACHE_TTL:
        return dict(_arxiv_cache["data"], from_cache=True)
    try:
        items = fetchers.fetch_arxiv(fetchers.ARXIV_AIBIO_QUERY, 18)
        data = {"ok": True, "items": items, "count": len(items), "fetched_at": time.strftime("%Y-%m-%d %H:%M"), "error": None}
    except Exception as e:
        data = {"ok": False, "items": [], "count": 0, "fetched_at": time.strftime("%Y-%m-%d %H:%M"), "error": str(e)[:120]}
    _arxiv_cache["data"] = data
    _arxiv_cache["ts"] = time.time()
    return data


# ---------------------------------------------------------------------------
# 前沿瞭望：双通道归档（领域前沿 + 深度评述，每期独立 HTML）
# ---------------------------------------------------------------------------
def list_frontier():
    """扫描前沿瞭望归档目录，按文件名倒序返回 .html 列表。
    命名约定：YYYY-MM-DD.html（每天一期，双通道合并排版）
    """
    os.makedirs(FRONTIER_DIR, exist_ok=True)
    files = []
    for fn in sorted(os.listdir(FRONTIER_DIR), reverse=True):
        if fn.endswith(".html") and not fn.startswith("."):
            path = os.path.join(FRONTIER_DIR, fn)
            try:
                mtime = os.path.getmtime(path)
                size = os.path.getsize(path)
            except OSError:
                continue
            files.append({
                "file": fn,
                "date": fn[:-5],
                "size": size,
                "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(mtime)),
            })
    return {"items": files, "count": len(files)}


def read_frontier(filename):
    """读取指定一期前沿瞭望的原始 HTML。防目录穿越。"""
    safe = os.path.basename(filename)
    path = os.path.join(FRONTIER_DIR, safe)
    if not os.path.isfile(path) or not os.path.realpath(path).startswith(os.path.realpath(FRONTIER_DIR)):
        return None
    if not safe.endswith(".html"):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 热点日报：扫描归档目录 + 读取原始 HTML（每期独立完整 HTML，归档保留）
# ---------------------------------------------------------------------------
def list_hotspots():
    """扫描热点日报归档目录，按文件名倒序返回 .html 列表。
    命名约定：YYYY-MM-DD_上午版.html / YYYY-MM-DD_下午版.html
    """
    os.makedirs(HOTSPOT_DIR, exist_ok=True)
    files = []
    for fn in sorted(os.listdir(HOTSPOT_DIR), reverse=True):
        if fn.endswith(".html") and not fn.startswith("."):
            path = os.path.join(HOTSPOT_DIR, fn)
            try:
                mtime = os.path.getmtime(path)
                size = os.path.getsize(path)
            except OSError:
                continue
            stem = fn[:-5]
            date, _, session = stem.partition("_")
            files.append({
                "file": fn,
                "date": date,
                "session": session or "日报",
                "size": size,
                "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(mtime)),
            })
    return {"items": files, "count": len(files)}


def read_hotspot(filename):
    """读取指定热点日报的原始 HTML。防目录穿越。"""
    safe = os.path.basename(filename)
    path = os.path.join(HOTSPOT_DIR, safe)
    if not os.path.isfile(path) or not os.path.realpath(path).startswith(os.path.realpath(HOTSPOT_DIR)):
        return None
    if not safe.endswith(".html"):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# HTTP 处理
# ---------------------------------------------------------------------------
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "PhDWorkbench/1.0"

    # ---------- 工具 ----------
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    def _log(self, *args):
        pass  # 静默访问日志，保持终端干净

    def _proxy_worker(self, method, full_path, body=None,
                      ctype="application/json; charset=utf-8", timeout=600):
        """把请求原样转发给 PDF worker（8766），浏览器只与主服务 8765 通信。"""
        url = WORKER_BASE + full_path
        data = None
        if body is not None:
            data = body if isinstance(body, bytes) else body.encode("utf-8")
        req = urllib.request.Request(
            url, data=data, method=method,
            headers={"Content-Type": ctype},
        )
        # 本地回环必须绕过系统代理
        proxy_handler = urllib.request.ProxyHandler({})
        opener = urllib.request.build_opener(proxy_handler)
        try:
            with opener.open(req, timeout=timeout) as resp:
                raw = resp.read()
                rctype = resp.headers.get("Content-Type", "application/json; charset=utf-8")
                self.send_response(resp.status)
                self.send_header("Content-Type", rctype)
                self.send_header("Content-Length", str(len(raw)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(raw)
        except urllib.error.HTTPError as e:
            raw = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)
        except (urllib.error.URLError, ConnectionError, OSError):
            self._send(503, {"ok": False, "error": "PDF 转写引擎未启动（pdf_worker 8766 未运行），请先运行 start.command 或手动启动 worker"})

    # ---------- 路由 ----------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == "/" or path == "/index.html":
            self._serve_static("/index.html")
        elif path.startswith("/static/"):
            self._serve_static(path[len("/static/"):])
        elif path == "/api/overview":
            self._send(200, {
                "phd": phd_progress(),
                "graduation": graduation_progress(),
                "sections": section_stats(),
                "tree": scan_tree(WORKSPACE, max_depth=2),
                "field_name": FIELD_NAME,
            })
        elif path == "/api/news":
            self._send(200, get_news(force="refresh" in query and query["refresh"][0] == "1"))
        elif path == "/api/weekly":
            force = "refresh" in query and query["refresh"][0] == "1"
            self._send(200, get_weekly(force=force))
        elif path == "/api/todos":
            self._send(200, get_todos())
        elif path == "/api/journal":
            self._send(200, get_journal())
        elif path.startswith("/api/literature/"):
            name = path.split("/")[-1]
            self._send(200, load_literature(name))
        elif path == "/api/lit/arxiv":
            force = "refresh" in query and query["refresh"][0] == "1"
            self._send(200, get_arxiv_feed(force=force))
        elif path == "/api/publications":
            self._send(200, {"publications": get_publications(), "graduation": graduation_progress()})
        elif path == "/api/frontier":
            self._send(200, list_frontier())
        elif path == "/api/frontier/file":
            filename = query.get("file", [""])[0]
            content = read_frontier(filename)
            if content is None:
                self._send(404, {"error": "not found"})
            else:
                self._send(200, {"file": filename, "content": content})
        elif path.startswith("/frontier/"):
            # 供「新标签页打开」直接加载的前沿瞭望原始 HTML
            filename = unquote(path[len("/frontier/"):])
            content = read_frontier(filename)
            if content is None:
                self._send(404, {"error": "not found"})
            else:
                self._send(200, content, ctype="text/html; charset=utf-8")
        elif path == "/api/hotspots":
            self._send(200, list_hotspots())
        elif path == "/api/hotspot":
            filename = query.get("file", [""])[0]
            content = read_hotspot(filename)
            if content is None:
                self._send(404, {"error": "not found"})
            else:
                self._send(200, {"file": filename, "content": content})
        elif path.startswith("/hotspot/"):
            # 供 iframe 直接加载的原始热点日报 HTML
            filename = unquote(path[len("/hotspot/"):])
            content = read_hotspot(filename)
            if content is None:
                self._send(404, {"error": "not found"})
            else:
                self._send(200, content, ctype="text/html; charset=utf-8")
        elif path.startswith("/api/pdf/"):
            # PDF 转写：健康检查 / 状态轮询 / 取结果 / 取图片，全部转发 worker
            self._proxy_worker("GET", self.path)
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/todos":
            body = self._body()
            todos = get_todos()
            action = body.get("action", "add")
            if action == "add":
                item = {
                    "id": int(time.time() * 1000),
                    "text": body.get("text", "").strip(),
                    "done": False,
                    "created": time.strftime("%Y-%m-%d %H:%M"),
                    "deadline": body.get("deadline", ""),
                    "priority": body.get("priority", "普通"),
                }
                if item["text"]:
                    todos.append(item)
                    save_todos(todos)
                    return self._send(200, {"ok": True, "todos": todos})
                return self._send(400, {"error": "待办内容为空"})
            elif action == "toggle":
                for t in todos:
                    if t["id"] == body.get("id"):
                        t["done"] = not t["done"]
                        break
                save_todos(todos)
                return self._send(200, {"ok": True, "todos": todos})
            elif action == "delete":
                todos = [t for t in todos if t["id"] != body.get("id")]
                save_todos(todos)
                return self._send(200, {"ok": True, "todos": todos})

        elif path == "/api/journal":
            body = self._body()
            entries = get_journal()
            action = body.get("action", "add")
            if action == "delete":
                entry_id = body.get("id")
                before = len(entries)
                entries = [e for e in entries if e.get("id") != entry_id]
                if len(entries) < before:
                    save_journal(entries)
                    return self._send(200, {"ok": True, "journal": entries})
                return self._send(404, {"error": "日志不存在"})
            else:
                entry = {
                    "id": int(time.time() * 1000),
                    "date": body.get("date") or time.strftime("%Y-%m-%d"),
                    "type": body.get("type", "日常"),
                    "content": body.get("content", "").strip(),
                    "created": time.strftime("%Y-%m-%d %H:%M"),
                }
                if entry["content"]:
                    entries.insert(0, entry)
                    save_journal(entries)
                    return self._send(200, {"ok": True, "journal": entries})
                return self._send(400, {"error": "日志内容为空"})

        elif path == "/api/publications":
            body = self._body()
            action = body.get("action", "list")
            if action == "add":
                pubs = get_publications()
                pub = {
                    "id": int(time.time() * 1000),
                    "title": body.get("title", "").strip(),
                    "type": body.get("type", "c_journal"),
                    "journal": body.get("journal", "").strip(),
                    "date": body.get("date", "").strip(),
                    "note": body.get("note", "").strip(),
                    "created": time.strftime("%Y-%m-%d %H:%M"),
                }
                if pub["title"]:
                    pubs.append(pub)
                    save_publications(pubs)
                    return self._send(200, {"ok": True, "publications": pubs, "graduation": graduation_progress()})
                return self._send(400, {"error": "论文标题为空"})
            elif action == "delete":
                pubs = get_publications()
                pub_id = body.get("id")
                before = len(pubs)
                pubs = [p for p in pubs if p.get("id") != pub_id]
                if len(pubs) < before:
                    save_publications(pubs)
                    return self._send(200, {"ok": True, "publications": pubs, "graduation": graduation_progress()})
                return self._send(404, {"error": "论文不存在"})
            else:
                return self._send(200, {"publications": get_publications(), "graduation": graduation_progress()})

        elif path == "/api/open":
            body = self._body()
            raw = body.get("path", "")
            # 支持相对路径（如 "01_文献库"）和绝对路径
            if os.path.isabs(raw):
                target = os.path.normpath(raw)
            else:
                target = os.path.normpath(os.path.join(WORKSPACE, raw))
            if os.path.isdir(target) and target.startswith(WORKSPACE):
                ok = open_in_finder(target)
                return self._send(200, {"ok": ok, "path": target})
            return self._send(400, {"error": "非法路径: " + target})

        elif path == "/api/refresh":
            data = get_news(force=True)
            return self._send(200, data)

        elif path == "/api/pdf/upload":
            # 前端拖拽上传：请求体是 PDF 原始字节，原样转发给 worker
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length > 0 else b""
            return self._proxy_worker("POST", self.path, raw, "application/pdf")

        elif path.startswith("/api/pdf/"):
            # submit 等 JSON 请求
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length > 0 else b""
            return self._proxy_worker("POST", self.path, raw, "application/json; charset=utf-8")

        self._send(404, {"error": "not found"})

    def _serve_static(self, rel):
        # 防目录穿越
        target = os.path.normpath(os.path.join(WEB_DIR, rel.lstrip("/")))
        if not target.startswith(WEB_DIR) or not os.path.isfile(target):
            return self._send(404, {"error": "not found"}, "application/json; charset=utf-8")
        ext = os.path.splitext(target)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        with open(target, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


# ---------------------------------------------------------------------------
# 每日自动维护：git 自动存档 + data 轻量快照（保 14 天）+ pdf_jobs 去重瘦身
# 由 main() 启动 daemon 线程，每天 ≥03:00 执行一次；随 start.command 常驻，
# 不依赖任何外部会话。快照目录 data_snapshots/ 不入 git（见 .gitignore）。
# ---------------------------------------------------------------------------
BACKUP_STATE_FILE = os.path.join(DATA_DIR, "backup_state.json")
SNAPSHOT_ROOT = os.path.join(BASE_DIR, "data_snapshots")

# 不进快照的文件：给 data/ 做镜像会把 api_key / token 复制成十几份明文
# （保留 keep_days 天），一旦整个目录被拷走或打包就跟着泄露；这些配置本来也能重建。
SNAPSHOT_SKIP_FILES = {
    "llm_config.json",      # 百炼 api_key
    "pdf_config.json",      # MinerU cloud_token
    "weather_config.json",  # 和风 Host / Key
    "settings.json",        # 学制 / 本地扫描目录
}
JOB_TS_RE = re.compile(r"^(.+)_(\d{8})_(\d{6})_[a-z0-9]{4}$")


def _log_maint(msg):
    print("[maint] " + msg, flush=True)


def _dir_size(path):
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _auto_archive_enabled():
    """「每日自动 git 存档」的开关，**默认关闭**（data/settings.json 里 auto_archive=true 才启用）。
    为什么默认关：这个工作台会被别人 clone 到自己机器上，而存档执行的是 `git add -A`——
    会把使用者当时**未提交的改动一并提交**，混进他自己的提交历史里，且失败只在日志里。
    只有明确知道「这个目录就是我自己的 git 仓库」时才该打开。每次现读配置，改完不用重启。"""
    return bool(_load_settings().get("auto_archive"))


def _git_auto_commit(today):
    """把代码与轻量数据自动提交（pdf_jobs 已被 .gitignore 排除，提交很轻）。
    仅在 data/settings.json 的 auto_archive=true 时被调用（见 _auto_archive_enabled）。
    注意：必须检查 returncode——曾经因 .git/index.lock 陈旧残留导致
    提交静默失败而日志仍报「完成」，自动备份形同虚设。"""
    try:
        # 陈旧锁（>10 分钟，通常是崩溃/超时残留）自动清理，否则自动存档会永久失败
        lock = os.path.join(BASE_DIR, ".git", "index.lock")
        if os.path.exists(lock) and time.time() - os.path.getmtime(lock) > 600:
            try:
                os.remove(lock)
                _log_maint("git：清理陈旧 index.lock")
            except OSError:
                pass
        r = subprocess.run(["git", "add", "-A"], cwd=BASE_DIR,
                           capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            _log_maint("git：add 失败 " + (r.stderr or "")[:200])
            return False
        st = subprocess.run(["git", "status", "--porcelain"], cwd=BASE_DIR,
                            capture_output=True, text=True, timeout=30)
        if not st.stdout.strip():
            _log_maint("git：工作区干净，跳过提交")
            return True
        c = subprocess.run(["git", "commit", "-m", "自动存档 " + today],
                           cwd=BASE_DIR, capture_output=True, text=True, timeout=120)
        if c.returncode != 0:
            _log_maint("git：commit 失败 " + ((c.stderr or "") + (c.stdout or ""))[:200])
            return False
        _log_maint("git：自动存档完成")
        return True
    except Exception as e:
        _log_maint("git：存档失败 " + repr(e))
        return False


def _data_snapshot(today, keep_days=14):
    """把 data/ 下所有 *.json 与 *.md 轻量镜像到 data_snapshots/<日期>/
    （转写文本与摘要都在内；input.pdf/images 等重资源不备份），并清理过期快照。
    密钥类配置（SNAPSHOT_SKIP_FILES）不进快照——避免把 api_key 复制成多份明文。"""
    dst = os.path.join(SNAPSHOT_ROOT, today)
    for root, _, files in os.walk(DATA_DIR):
        for fn in files:
            if os.path.splitext(fn)[1].lower() not in (".json", ".md"):
                continue
            if fn in SNAPSHOT_SKIP_FILES:
                continue
            src = os.path.join(root, fn)
            rel = os.path.relpath(src, DATA_DIR)
            rel_parts = rel.split(os.sep)
            # pdf_jobs 只备份 job 顶层的小文件（job.json/summary/source/result.md），
            # local_out|cloud_out 深处的布局中间 json（input_middle 等）可重建，不备份
            if rel_parts[0] == "pdf_jobs" and len(rel_parts) > 3:
                continue
            dstp = os.path.join(dst, rel)
            try:
                os.makedirs(os.path.dirname(dstp), exist_ok=True)
                shutil.copy2(src, dstp)
            except OSError:
                pass
    _log_maint("快照完成: %s（%.1f MB）" % (today, _dir_size(dst) / 1048576.0))
    cutoff = time.time() - keep_days * 86400
    try:
        for name in os.listdir(SNAPSHOT_ROOT):
            p = os.path.join(SNAPSHOT_ROOT, name)
            if os.path.isdir(p) and os.path.getmtime(p) < cutoff:
                shutil.rmtree(p, ignore_errors=True)
                _log_maint("清理过期快照: " + name)
    except OSError:
        pass


def _prune_jobs():
    """同名论文（目录名去掉 _日期_时间_哈希 后缀）只保留最新 job 的重资源：
    旧 job 删除 input.pdf 与 images/，保留 *.json 与 *.md（转写文本仍可回看）"""
    jobs_dir = os.path.join(DATA_DIR, "pdf_jobs")
    try:
        names = [n for n in os.listdir(jobs_dir) if os.path.isdir(os.path.join(jobs_dir, n))]
    except OSError:
        return
    groups = {}
    for n in names:
        m = JOB_TS_RE.match(n)
        if m:
            groups.setdefault(m.group(1), []).append(n)
    freed = 0
    for slug, dirs in groups.items():
        if len(dirs) < 2:
            continue
        dirs.sort()                       # 目录名含时间戳，字符串序即时间序
        for old in dirs[:-1]:
            d = os.path.join(jobs_dir, old)
            before = _dir_size(d)
            try:
                ip = os.path.join(d, "input.pdf")
                if os.path.exists(ip):
                    os.remove(ip)
                img = os.path.join(d, "images")
                if os.path.isdir(img):
                    shutil.rmtree(img, ignore_errors=True)
                freed += before - _dir_size(d)
            except OSError as e:
                _log_maint("清理 %s 失败 %r" % (old, e))
    if freed:
        _log_maint("pdf_jobs 去重瘦身：回收 %.1f MB" % (freed / 1048576.0))


def _worker_alive():
    """探测 PDF worker（8766）是否在跑。"""
    try:
        req = urllib.request.Request(WORKER_BASE + "/api/pdf/health")
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def ensure_worker():
    """确保 PDF 转写 worker（8766）在跑：不在则后台拉起。

    server 现在是常驻进程（开机自启 + 保活），它是唯一需要守护的对象；
    让 server 顺带守护 worker，用户就不必再关心「转写引擎忘了启动」
    ——这正是「本地未就绪 · 云端未配置」的常见成因。
    """
    if _worker_alive():
        return True
    if not (os.path.isfile(WORKER_PY) and os.path.isfile(WORKER_SCRIPT)):
        print("[worker] 未找到 venv 或 worker.py，跳过守护", flush=True)
        return False
    try:
        log = open(os.path.join(DATA_DIR, "pdf_worker.log"), "a")
        subprocess.Popen([WORKER_PY, WORKER_SCRIPT], cwd=BASE_DIR,
                         stdout=log, stderr=log, start_new_session=True)
        print("[worker] 检测到 8766 未运行，已后台拉起", flush=True)
        return True
    except Exception as e:
        print("[worker] 拉起失败：%r" % e, flush=True)
        return False


def _maintenance_loop():
    while True:
        try:
            ensure_worker()          # 每分钟自愈检查：worker 挂了自动拉起
            if time.localtime().tm_hour >= 3:
                today = time.strftime("%Y-%m-%d")
                state = _read_json(BACKUP_STATE_FILE, {})
                if state.get("last_date") != today:
                    # git 存档是可选功能（默认关）：别人的 clone 里不该被自动提交
                    if _auto_archive_enabled():
                        _git_auto_commit(today)
                    else:
                        _log_maint("git：自动存档未启用（data/settings.json 的 auto_archive），已跳过")
                    _data_snapshot(today)
                    _prune_jobs()
                    _write_json(BACKUP_STATE_FILE, {
                        "last_date": today,
                        "last_run": time.strftime("%Y-%m-%d %H:%M"),
                    })
        except Exception as e:
            _log_maint("维护线程异常 " + repr(e))
        time.sleep(60)   # 每分钟醒一次：worker 守护需要较高检查频率（每日维护靠 last_date 去重）


def main():
    _ensure_data_dir()
    # 启动即确保转写引擎就绪，并交给维护线程持续守护
    ensure_worker()
    # 每日自动维护（git 存档 + 轻量快照 + pdf_jobs 瘦身），随服务常驻
    threading.Thread(target=_maintenance_loop, daemon=True).start()
    # 首次运行生成默认待办样例
    if not os.path.exists(TODOS_FILE):
        save_todos([
            {"id": 1, "text": "阅读一篇本领域论文并做精读笔记", "done": False, "created": "2026-01-01 09:00", "deadline": "", "priority": "高"},
            {"id": 2, "text": "把想到的问题记进研究日志", "done": True, "created": "2026-01-01 09:00", "deadline": "", "priority": "中"},
        ])
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("=" * 56)
    print("  学术工作台已启动")
    print(f"  请在浏览器打开： http://127.0.0.1:{PORT}")
    print("  按 Ctrl+C 停止服务")
    print("=" * 56)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")


if __name__ == "__main__":
    main()
