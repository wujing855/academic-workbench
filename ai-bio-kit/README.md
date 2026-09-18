# AI×生物前沿监测套件（ai-bio-frontier-kit）

从「AI 与生物学交叉研究报告」项目中提取的可复用资产，供任何具备联网搜索能力的 LLM Agent 使用（WorkBuddy / TRAE / Claude Code / Codex 等均可）。整个套件无第三方依赖、可整体拷贝到任意位置。

## 目录结构

```
ai-bio-frontier-kit/
├── README.md                     # 本文件：接入指南
├── skills/
│   ├── rigorous-research/         # 技能一：通用研究方法论（研究宪法，任何课题可用）
│   │   └── SKILL.md
│   └── ai-bio-frontier/           # 技能二：AI×生物领域监测（领域数据层）
│       ├── SKILL.md               # 日报五步工作流 + 领域判定基线
│       └── references/
│           ├── sources.md         #   分级源清单（检索入口白名单）
│           ├── queries.md        #   七域固定检索查询组
│           ├── milestones.md     #   里程碑锚点（判断"新进展是否真的新"）
│           └── digest-template.md #   日报 Markdown 模板
├── agent-prompts/
│   └── daily-digest.md            # 工作台 Agent 任务提示词（自包含，可直接粘贴）
├── scripts/
│   └── digest2html.py             # 日报 MD→单文件 HTML（自带零改动校验）
└── examples/
    ├── daily-digest-sample.md     # 日报格式演示（历史已核实事件）
    ├── daily-digest-sample.html   # 转换效果示例
    └── report-pipeline/           # 完整报告管线参考（本项目所用，见下）
```

## 接入方式

### 方式 A：具备联网搜索的 LLM Agent（推荐起点）

把 `agent-prompts/daily-digest.md` 全文作为任务指令（System Prompt 或任务消息），每日定时触发一次。该提示词自包含：五条铁律、七域检索策略、日报模板、执行规则都已内嵌，Agent 无需读文件即可执行。输出 Markdown 日报；若环境可执行 Python，再调用 `scripts/digest2html.py` 生成 HTML 阅读版。

### 方式 B：支持"技能 / 规则"机制的 Agent

- 若你的 Agent 有技能目录（如 WorkBuddy 的技能目录、TRAE 的 `.trae/skills/`），把 `skills/` 下两个技能整个放进去，新会话中即可被发现并调用（也可用 `/rigorous-research`、`/ai-bio-frontier` 手动调用）。
- 若它只支持"项目规则 / 自定义指令"，把对应 `SKILL.md` 全文设为规则即可，用法本质相同。
- 两者都没有也完全不影响：走方式 A，把提示词当任务指令贴给它。

### 方式 C：MCP（工作台定型后）

若工作台作为 MCP 客户端，可将套件封装为两个无状态工具：

1. `daily_digest_search` —— 检索编排（输入日期窗口，输出分级后的候选条目）
2. `digest_to_html` —— 包装 `scripts/digest2html.py`（输入 MD 路径，输出 HTML 路径 + 校验结果）

套件按"无状态命令行 + 自包含提示词"设计，正是为便于这种包装。封装时注意：检索质量取决于宿主 Agent 的搜索工具，方法论约束在提示词层，不在代码层。

## 依赖

- 检索与写作：无（只需 Agent 自带联网搜索）
- HTML 阅读版：Python 3.8+，仅标准库
- 脚本自带零改动校验（MD 是唯一事实源，HTML 只是呈现层；校验 FAIL 即退出码 1）

## 设计原则（继承自源项目）

1. **内容零改动**：Markdown 为唯一事实源，程序化转换 + 逐行校验保证呈现层不污染内容
2. **三类陈述显式区分**：事实 / 预印本与单一来源（琥珀徽章）/ 推断（「分析：」段落）
3. **禁止编造**：宁可写"未检索到"，不虚构条目；检索受限时如实声明
4. **单文件离线**：所有 HTML 输出零外链，断网可读

## examples/report-pipeline 说明

这是生成本项目完整研究报告（95 条参考文献、六视觉模块、237 KB 单文件 HTML）所用的管线：`convert.py`（MD→HTML 片段）+ `build.py`（组装与可视化）+ `verify.py`（零改动校验）+ `template.html`（模板）。它绑定该报告的结构（六栏任务表、参考文献分类、交互时间轴数据），不适配新文档；保留作"如何做一份完整长报告"的工程参考。日常任务请用 `scripts/digest2html.py`。
