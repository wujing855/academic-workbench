# 更新日志

本项目的重要变更都记录在这里，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

> **升级会不会丢数据？** 不会。你的日记、待办、配置、PDF 转写记录全部存放在 `data/` 文件夹里，**升级只替换代码、不动 `data/`**。
> 具体步骤见 README 常见问题的「出了新版本怎么升级？老数据会丢吗」，或 `SKILL/SKILL.md` 的「老用户升级」一节。

## [未发布]

下一版的改动会先记在这里，发版时把本段标题改成 `## [x.y] - YYYY-MM-DD`。

> **不必等发新版本**：本节列出的改动**在 main 分支上已经生效**，`git clone` 或下载 main 分支的 zip 就能拿到。本项目在 main 上持续更新，**只在有较大功能更新时才打 Release** —— 所以「版本号没变」不代表「没修 bug」。

### 修复

- **PDF 云端加速的安装步骤补全（会导致「云端 SDK 未安装」）**：此前文档只教装本地引擎包 `mineru`，漏掉了云端加速所需的**独立包** `mineru-open-sdk` —— 照旧文档配好 Token 后点「云端加速」必然报错。现在 `SKILL/SKILL.md`、README 与 `data/pdf_config.example.json` 都写明：**两个包都要装，且 `mineru-open-sdk` 必须在 `mineru` 之后装**（两者共用 `mineru/` 命名空间，顺序反了会静默失效，很难排查）
- 补上 MinerU 的注册与领 Token 指引（<https://mineru.net> 注册 → <https://mineru.net/apiManage/token> 领取），并明确说明**本地引擎不需要注册、不需要任何 Token、不联网**
- 🔴 **本地引擎改为锁定 MinerU 3.x（`pip install -U "mineru>=3.4,<4"`）—— 修复「所有新装用户本地转写必失败」**：MinerU 已发布 4.0（当前 4.0.4），把命令行从扁平参数重写成了子命令（`mineru parse <路径> --output …`，顶层只剩 `--version`），而本项目调用的是 3.x 参数。此前文档那句不限版本的 `pip install -U mineru` 会让新用户装到 4.x，**本地转写 100% 报错，且安装时毫无提示**。现在 README 与 `SKILL/SKILL.md` 都锁上 `<4`（3.x 最后一版是 **3.4.5**，即开发验证所用版本），并给出已误装 4.x 的补救命令
- `pdf_worker/worker.py` 新增 MinerU 版本探测：装成 4.x 时，点转写会**直接给出中文提示与修复命令**，而不是抛出 `No such option: -p` 这种看不懂的报错
- `SKILL/SKILL.md` 第 5 步自检表第 8 项收紧为「**本地、云端各试一次**」——原来的「任一转通」会让没配好的那个引擎蒙混过关

### 文档

- README 新增**面向 AI Agent 的显式安装约束块**（`[!IMPORTANT]`）：把「必须锁 `<4`」「装完立刻验版本 `3.4.x`」「误装 4.x 怎么降回」写成 Agent 可直接照做的三步命令。装这套工作台的通常是用户的 AI Agent，所以这段刻意按**命令级指令**写，而不是解释性说明
- README 常见问题新增「点转写提示『本地引擎版本不兼容』」条目——按**用户实际会搜的报错原文**命名，便于用户或 Agent 直接命中
- `SKILL/SKILL.md` 第 5 步自检表第 8 项增加「先验版本必须是 `3.4.x`」，排障速查表新增对应的报错行
- 明确一句容易误解的话：**本地引擎的「最新版本」指 3.x 系列内的最新（3.4.5），不是 PyPI 上的 4.x**（此前"装最新版"的表述会把人带到 4.x 上）

## [1.2] - 2026-09-20

### 新增

- **社区基础设施**：新增 Issue 表单（报 Bug / 提功能建议）、PR 模板，并开启 [Discussions 讨论区](https://github.com/wujing855/academic-workbench/discussions)——从此「装不上」「有问题」「有想法」都有地方说
- 新增本更新日志

### 变更

- **文档全面改为平台无关**：删除 `SKILL/TRAE-规则适配.md`、`SKILL/豆包-提示词适配.md` 两个平台专属文件，`SKILL/SKILL.md` 作为唯一的通用部署向导；README 安装说明改为「WorkBuddy、TRAE、豆包、Claude Code、Codex、Cursor、Cline、通义灵码……任何能读写文件的 AI Agent 都行」
- `ai-bio-kit/examples/report-pipeline/build.py` 的素材目录改用通用环境变量 `AGENT_OUTPUT_DIR`（旧的 `TRAE_ASSISTANT_DIR` 保留兼容，已配置过的环境不受影响）
- `TRAE日报定时任务指令.md` 改名为 `日报定时任务指令.md`，内容去掉作者本地运行状态，改为通用写法
- 清理仓库中残留的 3 个占位符配置（`data/llm_config.json`、`data/pdf_config.json`、`data/weather_config.json`），仓库只保留 `*.example.json` 模板

### 修复

- README 的「自动存档」常见问题改用日志里的原词做标题（原标题是「它会自动把我改的东西 git commit 吗」），用户按「存档」搜索时不再是空结果
- `SKILL/SKILL.md` 第 1 步补上「代码从哪里来」——明确要求克隆 `main` 或下载 `main.zip`，**禁止安装 Releases 里的历史附件**，并给出 10 秒版本自检方法

### 文档

- 新增「老用户升级」完整流程（`SKILL/SKILL.md` + README 常见问题），含唯一冲突场景（`data/todos.json`）的 `git stash` 处理办法
- README 首屏改为「把仓库网址复制给你的 AI Agent」引导语，大幅截图移入「它长什么样」章节，避免首访者只看到标题

## [1.1] - 2026-09-18

**一键部署版** —— 这一版的目标：让完全不懂编程的人也能装上。

### 新增

- **学段 / 学制可配置**：进度卡不再写死日期。在 `data/settings.json` 里设置 `degree_level`（硕士 / 博士 / 博后等）、`program_years`、`entry_date`、`grad_date`，进度按你的实际情况计算；未配置时显示「待设置」并给出引导，而不会算成错误的年级
- **`SKILL/SKILL.md` 重写为「Agent 部署向导」**：第 0 步由 Agent 一次问清 10 个问题（学科、AI 渠道、是否需要 PDF 转写 / 天气 / 日报等），第 1~4 步全部由 Agent 代劳，第 5 步用 10 项自检表逐项验证通过后才交付

### 变更

- README 重写为面向零编程基础用户的版本，首屏改为「复制这句话发给你在用的 AI Agent」
- 日报 HTML 产出不再入库；`data/digests/`、`data/hotspots/*.html` 加入 `.gitignore`

### 安全

- **「每日自动存档」（`auto_archive`）改为默认关闭**：它会把当时所有未提交的改动一并提交进 git 历史，现在只有用户明确开启后才生效
- 每日数据快照不再复制密钥配置文件（`SNAPSHOT_SKIP_FILES`）

## [1.0] - 2026-09-17

首个公开版本。

- 本地优先的学术工作台：PDF 转写与翻译、原文精读、摘要卡片、前沿瞭望、热点日报、科技周报、专注面板
- 零第三方依赖：后端只用 Python 标准库，前端为原生 HTML / CSS / JS，不引入任何框架与 CDN
- 数据全部存放在本地 `data/` 目录，不上传任何服务器
- MIT License
