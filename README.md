<div align="center">

# 学术工作台 · Academic Workbench

**一个跑在你自己电脑上的免费学术工作台。**
本科写毕设、硕士做课题、博士攻论文，都能用同一套流程：
把「追踪文献 → 转写 PDF → 存摘要卡 → 精读对照 → 记录日志」串成一条流水线，
14 个面板、零第三方依赖、全部用免费服务驱动。

![Python](https://img.shields.io/badge/Python-3.8%2B-3776AB?logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-0F766E)
![Dependencies](https://img.shields.io/badge/%E4%BE%9D%E8%B5%96-%E4%BB%85%E6%A0%87%E5%87%86%E5%BA%93-059669)
![Cost](https://img.shields.io/badge/%E6%88%90%E6%9C%AC-%C2%A50-B45309)

[快速开始](#快速开始) · [面板一览](#面板一览) · [让-AI-Agent-帮你搭一个](#让-ai-agent-帮你搭一个) · [常见问题](#常见问题)

<img src="docs/screenshots/01-overview.jpg" width="900" alt="概览面板">

</div>

---

## 这是什么

不管是本科写毕设、硕士做课题，还是博士攻论文，最耗神的往往不是研究本身，而是**文献工作流太碎**：早上刷期刊、看到好文章下载、读一半卡在英文、想记点想法又懒得开笔记软件……一天下来真正推进研究的时间被切碎了。

这个工作台是我给自己搭的一套本地工具，把这些环节收进一个页面：

| 环节 | 以前 | 现在 |
|---|---|---|
| 追文献 | 开 4 个期刊网站来回刷 | 早晨打开「资讯」看一屏聚合 |
| 读论文 | 下载 → 手动复制 → 网页翻译 | 拖进「PDF 转写」→ 自动出 Markdown → 「译文库」全文中译 |
| 抓重点 | 自己划线摘抄 | 「摘要卡片」结构化摘要，标签自动建议 |
| 精读 | 英文原文与翻译来回切 | 「原文精读」逐段三级对照：译文 / 原文 / 解读 |
| 记想法 | 散在各处 | 「研究日志」还能直接链接到某张摘要卡 |
| 专注 | 番茄钟 App | 内置「专注」面板，计时不怕切标签页 |

**所有数据都留在你电脑的 `data/` 目录里**，不经过任何第三方服务器；模型调用走你自己的 API Key。

## 面板一览

14 个面板，按使用频率分四组：

| 组 | 面板 |
|---|---|
| 核心工作 | 概览 · 待办 · **专注**（番茄钟） · 资讯 |
| 文献 | 文献工具 · PDF 转写 · 译文库 · 原文精读 |
| 情报 | 前沿瞭望 · 热点日报 · 科技周报 |
| 归档 | 摘要卡片 · 文件夹 · 研究日志 |

<table>
<tr>
<td width="50%"><img src="docs/screenshots/02-news.jpg" alt="资讯面板"><br><sub>资讯：7 个学术/科技源聚合，顶刊标题自动中译</sub></td>
<td width="50%"><img src="docs/screenshots/03-focus.jpg" alt="专注面板"><br><sub>专注：番茄钟用时间戳计时，切标签页也不走偏</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/04-hotspot-daily.jpg" alt="热点日报"><br><sub>热点日报：每天早晚各一期，AI 生成</sub></td>
<td width="50%"><img src="docs/screenshots/07-dark-mode.jpg" alt="暗色模式"><br><sub>亮 / 暗双主题</sub></td>
</tr>
</table>

更多界面截图见 [`docs/screenshots/`](docs/screenshots/)。

## 快速开始

**只需要 Python 3**（macOS 自带，Windows 去 python.org 装一个），主服务零第三方依赖。

```bash
git clone https://github.com/wujing855/academic-workbench.git
cd academic-workbench
python3 server.py          # macOS 也可以直接双击 start.command
```

浏览器打开 **http://127.0.0.1:8765** —— 待办、资讯、专注、周报、日志这些面板**不配任何 Key 就能用**。想要 AI 功能再往下看。

### 三个免费 Key（按需，不填也能用）

| 功能 | 去哪申请 | 免费额度 | 填进哪个文件 |
|---|---|---|---|
| AI 摘要 / 翻译 / 精读 | [阿里云百炼](https://bailian.console.aliyun.com) | 每天有免费 tokens，推荐 `qwen3.8-flash` | `data/llm_config.json` |
| 天气卡片 | [和风天气](https://www.qweather.com) | 每天约 1000 次（**Host 和 Key 是两个值**） | `data/weather_config.json` |
| 云端 PDF 转写 | [MinerU](https://mineru.net/apiManage/token) | 每天 2000 页，Token 90 天有效 | `data/pdf_config.json` |

每个文件都有对应的 `*.example.json` 模板，**复制改名再填**即可（真实配置已被 `.gitignore` 排除，不会误传）。

> PDF 也想在本地转写（不消耗云端额度）：`cd pdf_worker && python3 -m venv .venv && .venv/bin/pip install -U mineru`，转写时选「本地引擎」。
>
> 免费额度是各家给的试用政策，**会调整** —— 以官网为准。

### 把它调成你的

复制 `data/settings.example.json` 为 `data/settings.json`，改这几个值：

```json
{
  "field_name": "你的研究领域（显示在侧栏和浏览器标题上）",
  "phd_start": "入学日期（本科/硕士也一样填，按你的学制改）",
  "phd_end": "预计毕业日期",
  "c_journal_required": 2,
  "c_journal_label": "毕业要求名称（C 刊论文 / SCI 一区 / CSSCI…）",
  "workspace_dir": "「文件夹」面板要扫描的目录（留空则用上一级目录）"
}
```

改完刷新页面，侧栏下方就会显示你自己的领域名——**它不该看起来像别人的工具**。

## 让 AI Agent 帮你搭一个

这个仓库的设计是**留空缺**：资讯源关键词、前沿瞭望主题、文献检索式都是填空位。
[`SKILL/`](SKILL/) 里是一份给 **AI Agent** 看的说明书（不是给人看的教程）——把整个文件夹丢给你的 Agent，它会先问你几个问题（研究方向、阶段、想追踪什么），再把这套骨架改造成你自己的。

| 你用的 Agent | 怎么接 |
|---|---|
| **WorkBuddy** | 把 `SKILL/SKILL.md` 放进技能目录，说「按这个 Skill 帮我搭」 |
| **TRAE** | 见 [`SKILL/TRAE-规则适配.md`](SKILL/TRAE-规则适配.md)，设为项目规则 |
| **豆包** | 见 [`SKILL/豆包-提示词适配.md`](SKILL/豆包-提示词适配.md)，当提示词贴 |

三者都有免费额度（WorkBuddy / TRAE 可签到领积分，豆包学生认证有会员额度）。

## 项目结构

```
academic-workbench/
├── server.py              主服务（8765 端口，纯标准库）
├── fetchers.py            资讯源与天气抓取（改这里换你的领域期刊）
├── pdf_worker/            PDF 转写引擎（8766 端口，MinerU 驱动）
├── web/                   前端（原生 HTML/CSS/JS，无框架）
├── ai-bio-kit/            「前沿瞭望」Agent 指令包（领域可换）
├── SKILL/                 给 AI Agent 的搭建说明书
├── docs/screenshots/      README 用的界面截图
└── data/                  所有数据与配置（业务数据都在这里）
```

改资讯源：编辑 `fetchers.py` 顶部的 `SOURCES` 数组，加一条就是加一个源。

## 常见问题

**Q：资讯一片空白？**
你可能开着代理。国内源（Nature / HN / 阮一峰等）代码里已强制直连；反过来，个别国外源（如 PhilSci）反而需要代理，属正常。

**Q：AI 功能报 `HTTP 403 FreeTierOnly`？**
免费额度当天用完了。改 `data/llm_config.json` 把对应任务换成 `qwen3.8-flash`（最耐用），或次日再用。

**Q：不填天气 Key 行吗？**
行。天气区会显示「天气暂不可用」，其他一切正常。

**Q：数据能带走 / 备份吗？**
整个 `data/` 目录就是你的全部数据，复制走即可。

**Q：端口被占了？**
改 `server.py` 顶部的 `PORT` 和 `WORKER_BASE`（两处要一致），并在 `start.command` 里同步。

## 许可与致谢

MIT License —— 随便用、随便改，保留版权声明即可。

数据源与服务：[阿里云百炼](https://bailian.console.aliyun.com) · [MinerU](https://mineru.net) · [和风天气](https://www.qweather.com) · Nature / Science / Cell / bioRxiv / Hacker News 等公开 RSS。
AI Agent 协作：[WorkBuddy](https://www.workbuddy.cn) · TRAE · 豆包。

如果这套工作台帮你省下了一点时间，欢迎点个 ⭐ —— 也欢迎告诉我你加了什么我没想过的东西。
