# -*- coding: utf-8 -*-
"""
fetchers.py —— 学术工作台网络接口模块
功能：聚合学术/科技资讯、抓取天气，全部带超时与失败容错。
所有函数只负责"抓取"，缓存由 server.py 管理。
依赖：仅 Python 标准库（urllib / xml.etree / concurrent.futures）
"""

import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Doubao-PhD-Workbench/1.0"
TIMEOUT = 12  # 每个请求超时秒数

# ---------------------------------------------------------------------------
# 资讯源配置：可自行增删，每项为一个 dict
#   key    : 唯一标识
#   name   : 展示名
#   kind   : "rss" | "weekly"
#   url    : (rss)   RSS/Atom 地址
#   limit  : 最多保留条数
#   icon   : 前端展示用标签
# 说明：arXiv 论文追踪已于 2026-09-11 移入「文献工具 → arXiv 追踪」
#       （server.py 的 /api/lit/arxiv 按需拉取），不再作为常驻资讯源轮询。
# ---------------------------------------------------------------------------
SOURCES = [
    {
        "key": "nature",
        "name": "Nature 最新",
        "kind": "rss",
        "url": "https://www.nature.com/nature.rss",
        "limit": 6,
        "icon": "🔬",
    },
    {
        "key": "science",
        "name": "Science 最新",
        "kind": "rss",
        "url": "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science",
        "limit": 6,
        "icon": "🎓",
    },
    {
        "key": "cell",
        "name": "Cell 最新",
        "kind": "rss",
        "url": "https://www.cell.com/action/showFeed?type=etoc&feed=rss&jc=cell",
        "limit": 6,
        "icon": "🧫",
    },
    {
        "key": "natcomms",
        "name": "Nature Communications",
        "kind": "rss",
        "url": "https://www.nature.com/ncomms.rss",
        "limit": 6,
        "icon": "📡",
    },
    {
        "key": "biorxiv",
        "name": "bioRxiv · 生物信息学",
        "kind": "rss",
        "url": "https://connect.biorxiv.org/biorxiv_xml.php?subject=bioinformatics",
        "limit": 6,
        "icon": "",
        "oa": True,   # 开放获取：可拼 PDF 直链，供「一键送转写」
    },
    {
        "key": "medrxiv",
        "name": "medRxiv 最新",
        "kind": "rss",
        "url": "https://connect.medrxiv.org/medrxiv_xml.php?subject=all",
        "limit": 4,
        "icon": "",
        "oa": True,
    },
    {
        "key": "hackernews",
        "name": "Hacker News",
        "kind": "rss",
        "url": "https://hnrss.org/frontpage",
        "limit": 8,
        "icon": "🖥️",
    },
    {
        "key": "aihot",
        "name": "AI Hot · 卡兹克",
        "kind": "rss",
        "url": "https://aihot.virxact.com/feed.xml",
        "limit": 10,
        "icon": "🔥",
    },
    {
        "key": "ruanyf_weekly",
        "name": "科技爱好者周刊",
        "kind": "weekly",
        "limit": 6,
        "icon": "📮",
    },
]

# 需要把英文标题翻译成中文的资讯源（顶刊 + 英文预印本）
TRANSLATE_KEYS = {"nature", "science", "cell", "natcomms", "biorxiv", "medrxiv"}
# 标题翻译的本地缓存（英文标题 → 中文），避免每次刷新重复付费
_TRANSL_CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "title_translations.json")


def _http_get(url, timeout=TIMEOUT, prefer_direct=False):
    """发起 GET 请求，返回文本；失败抛异常。

    容错策略（双通道 + 重试）：本机开代理时，部分境外源（arXiv/HN 等）会间歇性
    出现 SSL EOF 或连接重置，且直连与走代理的失败点不同——因此每条请求按通道
    顺序各试 2 次，任一次成功即返回。默认先系统代理后直连；prefer_direct=True
    时先直连后代理（arXiv 直连可用时省去代理挂起，直连被重置也是秒级失败，代价小）。
    """
    headers = {"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/xml, application/atom+xml, text/xml, */*"}
    last_err = None
    order = ((False, 2), (True, 2)) if prefer_direct else ((True, 2), (False, 2))
    for use_proxy, attempts in order:
        handlers = [] if use_proxy else [urllib.request.ProxyHandler({})]
        opener = urllib.request.build_opener(*handlers)
        for _ in range(attempts):
            req = urllib.request.Request(url, headers=headers)
            try:
                with opener.open(req, timeout=timeout) as resp:
                    raw = resp.read()
                    charset = resp.headers.get_content_charset() or "utf-8"
                    try:
                        return raw.decode(charset)
                    except (UnicodeDecodeError, LookupError):
                        return raw.decode("utf-8", errors="replace")
            except Exception as e:
                last_err = e
                time.sleep(0.6)
    raise last_err


# ---------------------------------------------------------------------------
# arXiv（文献工具「arXiv 追踪」用，server.py 按需调用并缓存）
# ---------------------------------------------------------------------------
ARXIV_AIBIO_QUERY = (
    '(cat:q-bio.QM OR cat:q-bio.GN OR cat:q-bio.NC OR cat:q-bio.BM) '
    'AND ("deep learning" OR "machine learning" OR "artificial intelligence" '
    'OR "neural network" OR "language model" OR "foundation model")'
)


def fetch_arxiv(query, max_results=8):
    """按查询表达式抓取 arXiv 论文，返回统一条目列表。"""
    url = "https://export.arxiv.org/api/query?" + urllib.parse.urlencode(
        {"search_query": query, "start": 0, "max_results": max_results, "sortBy": "submittedDate", "sortOrder": "descending"}
    )
    text = _http_get(url, prefer_direct=True)
    ns = {"a": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(text)
    items = []
    for entry in root.findall("a:entry", ns):
        title = _clean((entry.findtext("a:title", "", ns) or "").strip())
        summary = _clean((entry.findtext("a:summary", "", ns) or "").strip())
        published = (entry.findtext("a:published", "", ns) or "")[:10]
        link_el = entry.find("a:id", ns)
        link = link_el.text if link_el is not None else ""
        authors = [a.findtext("a:name", "", ns) for a in entry.findall("a:author", ns)]
        items.append({
            "title": title,
            "summary": summary[:400],
            "date": published,
            "link": link,
            "authors": "、".join(authors[:6]),
            "source": "arxiv",
        })
    return items


# ---------------------------------------------------------------------------
# RSS / Atom
# ---------------------------------------------------------------------------
def fetch_rss(url, limit=8):
    """通用 RSS 解析，兼容 RSS 2.0 / RSS 1.0(RDF) / Atom。"""
    text = _http_get(url)
    root = ET.fromstring(text)
    items = []

    def find_text(el, *names):
        """按局部名通配查找第一个文本，兼容各命名空间。"""
        for n in names:
            hit = el.find("{*}" + n)
            if hit is not None and hit.text:
                return hit.text
        return ""

    # Atom 格式
    if root.tag.endswith("feed"):
        for entry in root.findall("{http://www.w3.org/2005/Atom}entry")[:limit]:
            link_el = entry.find("{http://www.w3.org/2005/Atom}link")
            link = link_el.get("href") if link_el is not None else ""
            items.append({
                "title": _clean(find_text(entry, "title")),
                "summary": _clean(find_text(entry, "summary", "content"))[:400],
                "date": find_text(entry, "updated", "published")[:10],
                "link": link,
                "authors": _clean(find_text(entry, "name")) if entry.find("{*}name") is not None else "",
                "source": "rss",
            })

    # RSS 2.0 / 1.0（{*} 通配任意命名空间，兼容 RSS 1.0 RDF）
    else:
        for item in root.findall(".//{*}item")[:limit]:
            # RSS 1.0 的 link 是 rdf:resource 属性；2.0 是子元素文本
            link_el = item.find("{*}link")
            link = ""
            if link_el is not None:
                link = link_el.get("rdf:resource") or link_el.get("href") or (link_el.text or "").strip()
            items.append({
                "title": _clean(find_text(item, "title")),
                "summary": _clean(find_text(item, "description"))[:400],
                "date": find_text(item, "date", "pubDate", "updated", "published")[:16],
                "link": link,
                "authors": _clean(find_text(item, "creator", "author", "name")),
                "source": "rss",
            })
    return items


def _clean(text):
    """去掉 HTML 标签与多余空白。"""
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# ---------------------------------------------------------------------------
# 科技爱好者周刊（阮一峰，GitHub 开源仓库，每周五更新）
# ---------------------------------------------------------------------------
def fetch_weekly(limit=6):
    """从 ruanyf/weekly 仓库抓取最近几期周刊（并发，单期失败不拖累整体）。

    每期返回 {title, issue, topic, summary, date, link}：
      title  = 「科技爱好者周刊（第 412 期）：禁止 issue，只用 PR」
      topic  = 本期主题（标题冒号后的部分）
      summary= 本期话题板块的导读段落（去 Markdown 语法，截 200 字）
      date   = 该期发布日期（源文件无日期，取文件提交时间）
      link   = GitHub 上的原文
    """
    api_url = "https://api.github.com/repos/ruanyf/weekly/contents/docs"
    req = urllib.request.Request(api_url, headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"})
    with urllib.request.build_opener().open(req, timeout=TIMEOUT) as resp:
        files = json.loads(resp.read().decode("utf-8"))
    names = sorted(
        (f["name"] for f in files if re.match(r"issue-\d+\.md$", f.get("name", ""))),
        key=lambda n: int(re.search(r"\d+", n).group()),
        reverse=True,
    )[:limit]

    # 并发抓取：串行时 12 次请求里任意一次网络抖动就丢一整期（实测条目数会在 2–6 之间跳）
    items = []
    with ThreadPoolExecutor(max_workers=max(2, min(6, len(names)))) as ex:
        for it in ex.map(_fetch_one_weekly, names):
            if it:
                items.append(it)
    items.sort(key=lambda x: x.get("issue") or 0, reverse=True)
    return items


def _fetch_one_weekly(name):
    """抓单期周刊（正文 + 发布日期）。raw 端点偶发失败 → 重试 2 次；
    最终仍失败返回 None，由调用方跳过，server 侧再与旧缓存合并补回。"""
    issue_no = int(re.search(r"\d+", name).group())
    raw_url = f"https://raw.githubusercontent.com/ruanyf/weekly/master/docs/{name}"
    md = ""
    for attempt in range(3):
        try:
            req = urllib.request.Request(raw_url, headers={"User-Agent": USER_AGENT})
            with urllib.request.build_opener().open(req, timeout=TIMEOUT) as resp:
                md = resp.read().decode("utf-8")
            break
        except Exception:
            if attempt == 2:
                return None
            time.sleep(0.6 * (attempt + 1))
    if not md:
        return None

    m = re.search(r"^#\s+(.+)$", md, re.M)
    title = _clean(m.group(1)) if m else f"科技爱好者周刊（第 {issue_no} 期）"
    topic = title.split("：", 1)[1].strip() if "：" in title else ""

    # 抓「本期话题」类正文：取第一个非封面/非元信息的二级标题下的段落
    summary = ""
    sections = re.split(r"^##\s+", md, flags=re.M)[1:]
    skip = ("封面", "图片", "言论", "工具", "文章", "招人", "广告", "往期", "订阅", "赞助")
    for sec in sections:
        lines = sec.splitlines()
        head = lines[0].strip()
        if not head or any(k in head for k in skip):
            continue
        body = _clean(re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", "\n".join(lines[1:])))
        if len(body) > 40:
            summary = body[:200] + ("…" if len(body) > 200 else "")
            break
    if not summary and sections:
        body = _clean(re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", sections[0]))
        summary = body[:200]

    return {
        "title": title,
        "issue": issue_no,
        "topic": topic,
        "summary": summary,
        "date": _weekly_issue_date(name),
        "link": f"https://github.com/ruanyf/weekly/blob/master/docs/{name}",
        "source": "weekly",
    }


def _weekly_issue_date(name):
    """取某期周刊的发布日期。

    周刊正文里只有期号、没有日期（用户因此误以为是当期的），
    改从该文件的提交记录取。取**最早一次提交**（即这期进仓库的时间），
    不是最后一次——作者事后改错字会让「最后提交」变成今天，看着像新刊。
    失败返回空串，不影响主流程。
    """
    url = ("https://api.github.com/repos/ruanyf/weekly/commits"
           f"?path=docs/{name}&per_page=100")
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"})
        with urllib.request.build_opener().open(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if isinstance(data, list) and data:
            return (data[-1].get("commit", {}).get("author", {}).get("date") or "")[:10]
    except Exception:
        pass
    return ""


# ---------------------------------------------------------------------------
# 英文标题 → 中文翻译（顶刊源用，走 llm_config.json 的 OpenAI 兼容接口）
# ---------------------------------------------------------------------------
def _load_trans_cache():
    try:
        with open(_TRANSL_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_trans_cache(cache):
    try:
        os.makedirs(os.path.dirname(_TRANSL_CACHE_FILE), exist_ok=True)
        with open(_TRANSL_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=0)
    except Exception:
        pass


def _llm_translate_batch(titles, timeout=45):
    """调用 OpenAI 兼容接口批量翻译标题，返回中文标题列表。失败抛异常。"""
    cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "llm_config.json")
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    # 标题翻译走轻量快模型：优先 models.title_translation，缺省回落 default_model
    model = (cfg.get("models") or {}).get("title_translation") or cfg.get("default_model", "qwen3.8-flash")
    base = cfg.get("base_url", "").rstrip("/")
    prompt = (
        "把下面的学术论文/新闻标题逐条翻译成简体中文，保留专有名词与技术术语，"
        "不要解释，只输出一个 JSON 字符串数组，顺序与输入一一对应。标题列表：\n" +
        "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
    )
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2,
    }).encode("utf-8")
    req = urllib.request.Request(
        base + "/chat/completions", data=body,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + cfg.get("api_key", "")},
    )
    # 国内 API：绕过系统代理 + 显式挂 certifi 根证书。
    # 不挂 CA 时，某些 Python 环境（如缺根证书的 venv）会报
    # CERTIFICATE_VERIFY_FAILED，而 translate_titles 是「失败静默返回原文」，
    # 表现为标题悄悄不翻译、界面上看不出任何错。没有 certifi 就退回默认上下文。
    handlers = [urllib.request.ProxyHandler({})]
    try:
        import ssl
        import certifi
        handlers.append(urllib.request.HTTPSHandler(
            context=ssl.create_default_context(cafile=certifi.where())))
    except Exception:
        pass
    with urllib.request.build_opener(*handlers).open(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    content = data["choices"][0]["message"]["content"].strip()
    m = re.search(r"\[.*\]", content, re.S)
    zh_list = json.loads(m.group(0)) if m else []
    return [str(z).strip() for z in zh_list]


def translate_titles(items):
    """给条目补 title_zh 字段（带本地缓存，失败静默返回原条目）。"""
    cache = _load_trans_cache()
    missing = []
    for it in items:
        t = (it.get("title") or "").strip()
        if t and t not in cache and t not in missing:
            missing.append(t)
    if missing:
        try:
            zh_list = _llm_translate_batch(missing)
            for t, z in zip(missing, zh_list):
                if z:
                    cache[t] = z
            _save_trans_cache(cache)
        except Exception:
            pass  # 翻译失败不影响资讯本身
    for it in items:
        zh = cache.get((it.get("title") or "").strip())
        if zh:
            it["title_zh"] = zh
    return items


# ---------------------------------------------------------------------------
# 天气（和风天气 QWeather）
# ---------------------------------------------------------------------------
# 和风天气配置：每个开发者有专属 API Host，在控制台-设置中查看。
# 从 data/weather_config.json 读取（模板见 weather_config.example.json），
# 环境变量优先级更高（QWEATHER_HOST / QWEATHER_KEY / QWEATHER_LAT / QWEATHER_LON）。
# 未配置时 fetch_weather 会抛错，但被 fetch_all_with_weather 捕获，不影响资讯。


def _load_weather_config():
    """读取 data/weather_config.json，失败返回空 dict。"""
    try:
        cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "data", "weather_config.json")
        with open(cfg_path, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


_QW_CFG = _load_weather_config()
QW_API_HOST = (os.environ.get("QWEATHER_HOST", "").strip()
               or str(_QW_CFG.get("api_host", "")).strip())
QW_API_KEY = (os.environ.get("QWEATHER_KEY", "").strip()
              or str(_QW_CFG.get("api_key", "")).strip())
QW_LAT = (os.environ.get("QWEATHER_LAT", "").strip()
          or str(_QW_CFG.get("lat", "39.90")).strip())    # 默认北京，换成你所在的城市
QW_LON = (os.environ.get("QWEATHER_LON", "").strip()
          or str(_QW_CFG.get("lon", "116.40")).strip())
QW_CITY = (os.environ.get("QWEATHER_CITY", "").strip()
           or str(_QW_CFG.get("city", "北京")).strip())    # 天气卡片上显示的城市名


def _qweather_get(path):
    """调用和风天气 API，自动禁用系统代理，返回解析后的 JSON。"""
    import gzip
    url = f"https://{QW_API_HOST}{path}"
    if "?" in path:
        url += f"&key={QW_API_KEY}"
    else:
        url += f"?key={QW_API_KEY}"
    # 禁用系统代理（本地开了代理会干扰国内 API）
    proxy_handler = urllib.request.ProxyHandler({})
    opener = urllib.request.build_opener(proxy_handler)
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept-Encoding": "gzip",
    })
    with opener.open(req, timeout=TIMEOUT) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return json.loads(raw.decode("utf-8"))


def fetch_weather():
    """返回当前天气、3天预报、空气质量、天气指数、预警（和风天气数据源）。"""
    if not QW_API_HOST or not QW_API_KEY:
        raise RuntimeError("天气未配置：请把 data/weather_config.example.json 复制为 "
                           "data/weather_config.json，填入你的和风天气 API Host 与 Key")
    # 1. 实时天气
    now = _qweather_get(f"/weather/v1/current/{QW_LAT}/{QW_LON}")
    # 2. 每日预报（3天）
    daily = _qweather_get(f"/weather/v1/daily/{QW_LAT}/{QW_LON}?days=3")
    # 3. 空气质量
    try:
        air = _qweather_get(f"/airquality/v1/current/{QW_LAT}/{QW_LON}")
    except Exception:
        air = {}
    # 4. 天气指数（全部类型 type=0，旧版 v7 路径）
    try:
        indices = _qweather_get(f"/v7/indices/1d?location={QW_LON},{QW_LAT}&type=0")
    except Exception:
        indices = {}
    # 5. 天气预警
    try:
        alerts = _qweather_get(f"/weatheralert/v1/current/{QW_LAT}/{QW_LON}")
    except Exception:
        alerts = {}

    cur = now
    wind_dir_map = {
        "n": "北风", "nne": "东北偏北", "ne": "东北风", "ene": "东北偏东",
        "e": "东风", "ese": "东南偏东", "se": "东南风", "sse": "东南偏南",
        "s": "南风", "ssw": "西南偏南", "sw": "西南风", "wsw": "西南偏西",
        "w": "西风", "wnw": "西北偏西", "nw": "西北风", "nnw": "西北偏北",
    }
    wind_compass = cur.get("wind", {}).get("direction", {}).get("compass", "")
    wind_dir_cn = wind_dir_map.get(wind_compass, wind_compass)

    def _utc_to_cn(utc_str):
        """UTC 时间字符串（HH:MM 或 ISO 格式）转北京时间 HH:MM。"""
        if not utc_str:
            return ""
        if "T" in utc_str:
            time_part = utc_str[11:16]
        else:
            time_part = utc_str[:5]
        try:
            h, m = int(time_part[:2]), int(time_part[3:5])
            h = (h + 8) % 24
            return f"{h:02d}:{m:02d}"
        except (ValueError, IndexError):
            return time_part

    def _utc_to_cn_date(utc_str):
        """UTC ISO 日期时间字符串转北京时间日期 YYYY-MM-DD。"""
        if not utc_str or "T" not in utc_str:
            return utc_str[:10] if utc_str else ""
        try:
            from datetime import datetime, timedelta
            dt = datetime.fromisoformat(utc_str.replace("Z", "+00:00"))
            dt_cn = dt + timedelta(hours=8)
            return dt_cn.strftime("%Y-%m-%d")
        except (ValueError, IndexError):
            return utc_str[:10]

    # 解析空气质量
    aqi_data = None
    aq_indexes = air.get("indexes", [])
    if aq_indexes:
        aqi0 = aq_indexes[0]
        aqi_data = {
            "aqi": aqi0.get("aqi"),
            "level": aqi0.get("level"),
            "category": aqi0.get("category", ""),
            "primary_pollutant": aqi0.get("primaryPollutant") or "无",
            "effect": aqi0.get("health", {}).get("effect", ""),
            "advice": aqi0.get("health", {}).get("advice", {}).get("generalPopulation", ""),
        }
    # 主要污染物浓度
    pollutants = {}
    for p in air.get("pollutants", []):
        code = p.get("code", "")
        pollutants[code] = {
            "name": p.get("name", ""),
            "value": p.get("concentration", {}).get("value"),
            "unit": p.get("concentration", {}).get("unit", ""),
        }

    # 解析天气指数（只保留常用的几个）
    useful_indices = ["运动指数", "洗车指数", "穿衣指数", "紫外线指数", "旅游指数", "感冒指数", "过敏指数"]
    index_list = []
    for item in indices.get("daily", []):
        name = item.get("name", "")
        if name in useful_indices:
            index_list.append({
                "name": name,
                "category": item.get("category", ""),
                "level": item.get("level", ""),
                "text": item.get("text", ""),
            })

    # 解析天气预警
    alert_list = []
    for a in alerts.get("alerts", []):
        severity = a.get("severity", {})
        # severity 可能是字符串或对象
        if isinstance(severity, str):
            severity_name = severity
            severity_level = ""
        else:
            severity_name = severity.get("name", "")
            severity_level = severity.get("level", "")
        alert_list.append({
            "id": a.get("id", ""),
            "sender": a.get("senderName", ""),
            "event": a.get("eventType", {}).get("name", ""),
            "severity": severity_name,
            "severity_level": severity_level,
            "description": a.get("description", ""),
            "instruction": a.get("instruction", ""),
            "issued_time": _utc_to_cn_date(a.get("issuedTime", "")) + " " + _utc_to_cn(a.get("issuedTime", "")),
        })

    return {
        "current": {
            "temp": cur.get("temperature", {}).get("value"),
            "text": cur.get("condition", {}).get("text", ""),
            "code": cur.get("condition", {}).get("code"),
            "feels_like": cur.get("feelsLike", {}).get("value"),
            "humidity": int(cur.get("humidity", 0) * 100),
            "wind_speed": cur.get("wind", {}).get("speed", {}).get("value"),
            "wind_scale": cur.get("wind", {}).get("scale"),
            "wind_dir": wind_dir_cn,
            "pressure": cur.get("pressure", {}).get("value"),
            "visibility": cur.get("visibility", {}).get("value"),
            "uv_index": cur.get("uvIndex"),
        },
        "daily": [
            {
                "date": _utc_to_cn_date(d.get("forecastStartTime", "")),
                "tmax": d.get("temperatureMax", {}).get("value"),
                "tmin": d.get("temperatureMin", {}).get("value"),
                "text": d.get("daytime", {}).get("condition", {}).get("text", ""),
                "code": d.get("daytime", {}).get("condition", {}).get("code"),
                "night_text": d.get("nighttime", {}).get("condition", {}).get("text", ""),
                "wind_dir": wind_dir_map.get(
                    d.get("daytime", {}).get("wind", {}).get("direction", {}).get("compass", ""),
                    d.get("daytime", {}).get("wind", {}).get("direction", {}).get("compass", ""),
                ),
                "wind_scale": d.get("daytime", {}).get("wind", {}).get("scale"),
                "precip_prob": d.get("daytime", {}).get("precipitation", {}).get("probability", 0),
                "uv_index_max": d.get("uvIndexMax"),
                "sunrise": _utc_to_cn(d.get("astro", {}).get("sunrise", "")),
                "sunset": _utc_to_cn(d.get("astro", {}).get("sunset", "")),
            }
            for d in daily.get("days", [])
        ],
        "air_quality": aqi_data,
        "pollutants": pollutants,
        "indices": index_list,
        "alerts": alert_list,
        "source": "和风天气 QWeather",
        "city": QW_CITY,
    }


# ---------------------------------------------------------------------------
# 统一抓取入口
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# 研究兴趣画像：给每条资讯打「与研究领域的相关度」，用来压掉无关噪音
# 换领域：改下面的关键词表即可（见 SKILL/SKILL.md「第 2 步」）
# 权重：AI/ML 类词 30 分，生物学类词 18 分，交叉方法类 24 分；每组最多累计 3 个词，上限 100
# 判定经验：顶刊生物论文通常命中 2+ 个生物词（36+）→ 相关；
#           纯技术/创业新闻一个词都不中 → 被「只看相关」过滤掉。
# 命中词一并返回，前端可显示「为什么相关」
# ---------------------------------------------------------------------------
INTEREST_TERMS = {
    "ai": (30, [
        "machine learning", "deep learning", "neural network", "transformer", "llm",
        "large language model", "foundation model", "generative", "diffusion model",
        "language model", "gpt", "multi-agent", "alphafold", "protein structure prediction",
        "representation learning", "self-supervised", "fine-tuning", "agent",
        "artificial intelligence", "ai",
    ]),
    "bio": (18, [
        "protein", "gene", "genome", "genomic", "cell", "single-cell", "rna", "dna",
        "crispr", "molecular", "biology", "biological", "organism", "phenotype",
        "sequence", "expression", "evolution", "microbiome", "neuroscience", "transcriptom",
        "enzyme", "antibody", "drug", "disease", "patient", "clinical", "tissue", "species",
    ]),
    "cross": (24, [
        "single-cell", "spatial transcriptomics", "virtual cell", "protein design",
        "structure prediction", "drug discovery", "systems biology", "synthetic biology",
        "gene regulatory", "cell atlas", "multi-omics", "bioinformatics", "computational biology",
    ]),
}


def score_relevance(item, academic=False):
    """给单条资讯打分，写入 item["relevance"] (0-100) 与 item["matched"] (最多 3 个命中词)。

    academic=True 表示来源本身就是学术源（顶刊/预印本）：天然相关，给 30 分基础分。
    理由：顶刊 RSS 的 description 往往只有一句话，靠关键词会被误判为不相关；
    综合源（HN、周刊）没有基础分，纯靠关键词筛。
    """
    text = " ".join([
        str(item.get("title") or ""),
        str(item.get("summary") or ""),
        str(item.get("description") or ""),
    ]).lower()
    if not text.strip():
        return 0, []
    total, matched = 0, []
    for group, (weight, terms) in INTEREST_TERMS.items():
        hits = 0
        for t in terms:
            # 词边界匹配，避免 "ai" 命中 "said"/"chain"、"cell" 命中 "excellent"
            if re.search(r"\b" + re.escape(t.strip()) + r"\b", text):
                total += weight
                hits += 1
                if t.strip() not in matched:
                    matched.append(t.strip())
                if hits >= 3:      # 每组最多累计 3 个词，避免同义堆砌刷分
                    break
    if academic:
        total += 30
    return int(min(100, total)), matched[:3]


def fetch_all():
    """并行抓取所有资讯源，返回 {key: {ok, name, icon, items, error}}。"""
    results = {}

    def run(src):
        try:
            if src["kind"] == "weekly":
                items = fetch_weekly(src.get("limit", 6))
            else:
                items = fetch_rss(src["url"], src.get("limit", 8))
            return src["key"], {"ok": True, "name": src["name"], "icon": src.get("icon", ""), "items": items, "error": None}
        except Exception as e:
            return src["key"], {"ok": False, "name": src["name"], "icon": src.get("icon", ""), "items": [], "error": str(e)[:120]}

    with ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        for key, res in pool.map(run, SOURCES):
            results[key] = res

    # 开放获取源（bioRxiv / medRxiv）：清理 rss 参数并补 PDF 直链，供「一键送转写」使用
    for src in SOURCES:
        if not src.get("oa"):
            continue
        res = results.get(src["key"])
        if not (res and res.get("ok")):
            continue
        for it in res["items"]:
            link = (it.get("link") or "").replace("?rss=1", "").rstrip("/")
            it["link"] = link
            if link:
                it["pdf"] = link + ".full.pdf"
                it["oa"] = True

    # 相关度打分：按研究领域画像给每条资讯打分，供前端「只看相关」过滤
    academic_keys = {s["key"] for s in SOURCES if s.get("oa") or s["key"] in TRANSLATE_KEYS}
    for key, res in results.items():
        if not res.get("ok"):
            continue
        for it in res["items"]:
            sc, mt = score_relevance(it, academic=key in academic_keys)
            it["relevance"] = sc
            it["matched"] = mt

    # 顶刊源：把所有英文标题合并成一次批量翻译（单次 API 调用，避免限流）
    try:
        cache = _load_trans_cache()
        pending = []  # (key, index, title)
        for key in TRANSLATE_KEYS:
            if results.get(key, {}).get("ok"):
                for idx, it in enumerate(results[key]["items"]):
                    t = (it.get("title") or "").strip()
                    if t and t not in cache:
                        pending.append((key, idx, t))
        if pending:
            titles = list(dict.fromkeys(p[2] for p in pending))  # 去重保序
            # 8 条一批（大批次会超时），单批失败重试 1 次，仍失败则下次刷新自动补
            for i in range(0, len(titles), 8):
                part = titles[i:i + 8]
                zh_list = None
                for _ in range(2):
                    try:
                        zh_list = _llm_translate_batch(part)
                        break
                    except Exception:
                        continue
                if zh_list:
                    for t, z in zip(part, zh_list):
                        if z:
                            cache[t] = z
            _save_trans_cache(cache)
        for key in TRANSLATE_KEYS:
            if results.get(key, {}).get("ok"):
                for it in results[key]["items"]:
                    zh = cache.get((it.get("title") or "").strip())
                    if zh:
                        it["title_zh"] = zh
    except Exception:
        pass  # 翻译整体失败不影响资讯本身
    return results


def fetch_all_with_weather():
    """抓取资讯 + 天气，天气失败不影响资讯。"""
    payload = {"news": fetch_all(), "weather": None}
    try:
        payload["weather"] = fetch_weather()
    except Exception as e:
        payload["weather_error"] = str(e)[:120]
    payload["fetched_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return payload


if __name__ == "__main__":
    # 自测：直接运行 python3 fetchers.py
    import pprint
    pprint.pprint(fetch_all_with_weather())
