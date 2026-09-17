---
name: academic-workbench-builder
description: 帮用户搭建并定制「学术工作台」——一套免费的个人科研工作台（14 面板：资讯/文献/PDF转写/译文/精读/摘要卡/日志/专注等）。当用户说"想搭科研工作台/学术工作台/文献管理工作台"、"拿到这个包想跑起来"、"想改领域、换资讯源"时使用。
---

# 学术工作台 · 搭建与定制指南（Agent 说明书）

你（AI Agent）的任务：帮助用户把**当前目录**这套代码跑起来，并**改造成用户自己的领域版本**。
它是一个纯本地运行的 Web 工作台：Python 标准库后端（零第三方依赖，除 PDF 转写外）+ 原生 HTML/CSS/JS 前端，全部免费服务驱动。

## 第 0 步：先问，再动手（必做）

拿到这份 Skill 后，**不要直接改代码**。先向用户确认四件事（一次问完）：

1. **你的研究方向是什么？**（决定资讯源关键词、前沿瞭望的主题、示例数据）
2. **你处于哪个阶段？**（本科/硕士/博士——决定面板侧重：本科偏文献积累，博士偏精读与综述）
3. **每天愿意花几分钟维护？**（0 分钟 → 只保留抓取类自动化；10 分钟 → 全开精读/日志）
4. **电脑上有没有装 Python 3？**（没装就先带用户装；macOS 自带，Windows 需引导）

拿到答案后再进入下面步骤。**用户的领域信息回填到配置，而不是留在对话里。**

## 项目结构（30 秒理解）

```
（仓库根目录 = 工作台本体）
├── server.py            # 主服务（端口 8765）：资讯/天气/待办/日志/周报 API + 静态页
├── fetchers.py          # 资讯源抓取 + 天气（天气配置在 data/weather_config.json）
├── start.command        # macOS 一键启动（双击）
├── pdf_worker/          # PDF 转写引擎（端口 8766，独立 venv，MinerU 驱动）
│   └── worker.py        #   转写/摘要/翻译/精读 四类 LLM 任务都在这
├── web/                 # 前端（index.html / app.js / style.css）
├── ai-bio-kit/          # 「前沿瞭望」Agent 指令包（领域可换）
├── SKILL/               # 本说明书 + TRAE / 豆包 适配
├── TRAE日报定时任务指令.md  # 每日热点日报的定时任务提示词（TRAE/其他 Agent 通用）
└── data/                # 所有数据与配置
    ├── llm_config.json       # ★ 百炼 API Key（免费 LLM）
    ├── pdf_config.json       # ★ MinerU Token（云端转写，可选）
    ├── weather_config.json   # ★ 和风天气 Host/Key/坐标/城市名
    ├── settings.json         # ☆ 学制、毕业条件、扫描目录（模板 settings.example.json）
    ├── literature/           # 文献工具：glossary(术语) / journals(期刊库) / search_queries(检索式)
    └── summaries|translations|readings|...  # 各业务数据（自动生成）
```

带 ★ 的是必须填 Key 的文件，☆ 是按需覆盖的个性化设定。所有 *.json 都有同名 `.example.json` 模板。

## 第 1 步：跑起来（10 分钟）

1. **启动**：macOS 双击 `start.command`；或终端 `python3 server.py`，浏览器开 `http://127.0.0.1:8765`。
   - 只有 Python 3，不需要 pip install 任何东西（主服务纯标准库）。
2. **填三个 Key**（都在 `data/` 下，改完即生效，无需重启）：

| 文件 | Key 去哪申请 | 免费额度 | 不填的后果 |
|---|---|---|---|
| `llm_config.json` | 阿里云百炼 bailian.console.aliyun.com | 各模型每天免费额度（qwen3.8-flash 最耐用） | 摘要/翻译/精读/标签建议不可用，其余正常 |
| `weather_config.json` | 和风天气 qweather.cn（控制台→设置里还有**专属 API Host**，Host / Key / 坐标 / 城市名四项都要填） | 每天约 1000 次 | 概览页无天气卡片，其余正常 |
| `pdf_config.json` | mineru.net/apiManage/token | 云端 Precision 每天 2000 页，90 天有效 | 云端引擎不可用；**本地引擎不需要 Token 也能转写** |

3. **个性化设定（建议做）**：复制 `data/settings.example.json` 为 `data/settings.json`：
   - `field_name` —— **用户的领域名**（显示在侧栏品牌下方 + 浏览器标题）。把第 0 步问到的方向填进去，这是"让它看起来属于用户"的第一件事。
   - `phd_start` / `phd_end` —— 学制起止日期（本科/硕士也填这里，用他们的学制）；`c_journal_label` 改成他的毕业要求（C 刊论文 / SCI 一区 / CSSCI…）
   - `workspace_dir` —— 「文件夹」面板扫描的目录，留空则扫描工作台上一级目录
   - 不填也能跑：会用内置默认值（你的研究领域 + 示例学制日期）。
4. **PDF 转写（可选增强）**：进入 `pdf_worker/` 建 venv 并装 MinerU：
   ```
   cd pdf_worker && python3 -m venv .venv && .venv/bin/pip install -U mineru
   ```
   不装也能用工作台，只是"PDF转写"面板用云端引擎（需 Token）。

> Windows 用户没有 .command 脚本：直接 `python server.py` 即可，其余同理。

## 第 2 步：定制成用户的领域（核心环节）

这是"个人性"的落点——**骨架通用，领域由用户填空**。按第 0 步收集的答案改：

### 2a. 资讯源（fetchers.py 顶部 SOURCES 数组）
- 学术源按用户领域换：把 Nature/Science/Cell 的 RSS 换成用户领域的期刊 RSS（biorxiv/medrxiv 有学科分类集合源，改 URL 里的 `server_biorxiv_` 前缀即可）。
- 技术源（HN/阮一峰）与领域无关，建议保留。
- 想加源：复制一段 dict，改 key/name/url/limit 即可，`kind: "rss"`。

### 2b. 前沿瞭望（ai-bio-kit/skills/ai-bio-frontier/）
- 这是让 AI Agent 每天生成一页"你领域的新进展"。里面是 AI×生物的示例——**把 SKILL.md、references/queries.md、sources.md 里的领域词全部换成用户的领域**（_queries.md 是搜索词库，_sources.md 是信源白名单，digest-template.md 是版式，版式别动）。
- 换完后把每日生成指令（SKILL.md 末尾附的 prompt 模板）设成 Agent 的定时任务（WorkBuddy 用"自动化"，TRAE 用定时任务，都是每天早上一次）。

### 2c. 文献工具的检索式（data/literature/search_queries.json）
- 把里面的检索式换成用户领域的（OpenAlex/Crossref 语法）。
- `glossary.json` 填用户领域的核心术语对照，"文献工具"面板的术语速查会用。

### 2d. 示例数据
- `data/todos.json` 现在是 2 条通用示例，换成用户领域的真实待办。
- 研究日志/摘要卡片/精读库都是空的——**这是故意的**，让用户的数据自己长出来。

## 第 3 步：每日自动化（建议配置）

| 任务 | 内容 | 频率 |
|---|---|---|
| 前沿瞭望 | Agent 按改造后的 ai-bio-kit 指令生成一页领域进展 | 每天早上 |
| 热点日报 | 按 `TRAE日报定时任务指令.md` 的提示词生成 | 每天两次 |
| 科技周报 | 纯抓取，server 自动缓存，无需配置 | 每周五 |

三个 Agent 的免费额度都够：**WorkBuddy**（签到领积分）、**TRAE**（签到）、**豆包**（学生认证有会员额度）。一个任务用一家，轮着来。

## 必须遵守的约定（改坏 = 用户损失数据）

1. **不要动 `data/` 下的业务 JSON 的结构**（字段名/嵌套关系），只加数据不改 schema。
2. **`llm_config.json` / `pdf_config.json` 永远不入 git**（.gitignore 已排除，别解开）。
3. **改 fetchers.py 的 SOURCES 前先备份**；改完让用户刷新页面确认资讯还能加载。
4. **前端三件套（web/）改动前备份到 `_archives/`**（若用户 git init 过则先 commit）。
5. 模型选择只改 `llm_config.json` 的 `models` 字段，**不要在代码里硬编码模型名**。
6. 主服务 8765、worker 8766，端口被占时改 `server.py` 顶部 `PORT` 与 `WORKER_BASE`（两处要同步）。

## 已知坑（Agent 排障速查）

- **资讯/天气全空** → 用户开了代理：代码已默认禁用系统代理直连国内源；若源在国外（如 philsci）反而需要代理，属正常。
- **LLM 报 HTTP 403 FreeTierOnly** → 该模型当日免费额度耗尽：让用户在 llm_config.json 里把对应任务换成 qwen3.8-flash。
- **转写卡在 3% 不动** → 看 `data/pdf_worker.log`；MinerU Token 过期（90 天）会静默失败。
- **页面打不开** → `lsof -ti :8765` 看进程；重启 `start.command`。
- **天气卡片不显示** → weather_config.json 的 api_host 忘了填（和风的 Host 与 Key 是两个东西）。
