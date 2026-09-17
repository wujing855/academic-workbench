# 参与贡献

欢迎提 Issue 和 PR。这个项目是"一个人给自己搭的工具"长出来的，所以结构比较简单，改动门槛很低。

## 快速上手代码

```bash
git clone https://github.com/wujing855/academic-workbench.git
cd academic-workbench
python3 server.py     # 打开 http://127.0.0.1:8765
```

- 后端：`server.py`（主服务 8765）、`fetchers.py`（抓取）、`pdf_worker/worker.py`（转写引擎 8766）
- 前端：`web/`（原生 HTML/CSS/JS，**不引入任何框架和 CDN**）
- 数据：`data/` 下全是 JSON / HTML，结构即数据模型

## 提交前请确认

1. **不要提交任何真实密钥**：`data/llm_config.json`、`data/pdf_config.json`、`data/weather_config.json`、`data/settings.json` 都已在 `.gitignore` 里，检查 `git status` 里没有它们。
2. **不要提交个人研究数据**：`data/pdf_jobs/`、`data/summaries/` 等运行时目录同样已忽略，别用 `git add -f` 强加。
3. **保持零依赖**：主服务只依赖 Python 标准库；前端不引外部 JS/CSS/字体/图表库。图表用内联 SVG。
4. **图标不用 emoji**：项目统一用内联 SVG 图标（保持跨平台渲染一致）。

## 适合上手的贡献方向

- **新增资讯源**：在 `fetchers.py` 的 `SOURCES` 里加一条 RSS 配置（记得标注学科）
- **新增面板**：参考 `web/index.html` 里已有面板的结构 + `web/app.js` 的 `PANEL_TITLES`
- **适配你的领域**：把 `ai-bio-kit/` 改造成你的领域版，PR 回来能帮到同领域的人
- **修 bug / 改文案**：直接提

## 提问时请附上

- 操作系统 + Python 版本
- 复现步骤
- `data/server.log` 或 `data/pdf_worker.log` 里的报错（**注意先删掉里面的密钥和私人路径**）
