# TRAE 适配：把本 Skill 变成你的项目规则

TRAE 不支持 WorkBuddy 的 Skill 文件夹格式，但支持**项目规则（Rules）**。两种接法，选一种：

## 接法一：整份当规则贴（推荐，最省事）

1. 在 TRAE 里打开你的工作台目录（`academic-workbench/`）。
2. 打开 Rules / 规则设置 → 新建规则 → 粘贴 `SKILL.md` 全文（frontmatter 可以删掉）。
3. 之后对 TRAE 说「按规则帮我把资讯源换成我的领域」即可。

## 接法二：拆成两条规则

如果嫌一整份太长，拆成：

**规则 A「工作台结构」**：保留 SKILL.md 的"项目结构"+"必须遵守的约定"两节。
**规则 B「定制流程」**：保留"第 0 步问卷"+"第 2 步定制"两节。

## TRAE 独有的两件事

1. **每日热点日报**：仓库里的 `TRAE日报定时任务指令.md` 就是为 TRAE 写的——TRAE 的定时任务直接用它，输出目录已相对化，TRAE 在工作台目录打开即可命中。
2. **报告流水线**：`ai-bio-kit/examples/report-pipeline/` 里的 `build.py` 默认读 `~/.trae-cn/assistant/`（TRAE 的助手输出目录），可用环境变量 `TRAE_ASSISTANT_DIR` 改。

## 注意

- TRAE 的 Rules 是"每次对话都注入"的全局上下文，SKILL.md 全文约 3000 字，在上下文预算内，但拆两条更聚焦。
- 改 `fetchers.py` / 前端三件套前，让 TRAE 先备份（规则里已写，但它有时会忘——提醒一句"先备份"）。
