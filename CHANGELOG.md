# 更新日志

本项目的重要变更都记录在这里，格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

> **升级会不会丢数据？** 不会。你的日记、待办、配置、PDF 转写记录全部存放在 `data/` 文件夹里，**升级只替换代码、不动 `data/`**。
> 具体步骤见 README 常见问题的「出了新版本怎么升级？老数据会丢吗」，或 `SKILL/SKILL.md` 的「老用户升级」一节。

## [未发布]

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
