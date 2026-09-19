## 这个 PR 做了什么

<!-- 一句话说明。如果是修 Bug，写清对应 Issue 号，例如 fix #12 -->

## 怎么验证的

<!-- 比只贴 diff 有用得多：你执行了什么命令、看到什么结果 -->

按 `CONTRIBUTING.md` 的自查命令跑了哪些：

- [ ] 1. Python 语法（`server.py` / `fetchers.py` / `pdf_worker/worker.py`）
- [ ] 2. 前端语法（`node --check web/app.js`）
- [ ] 3. 起服务能正常打开 `http://127.0.0.1:8765`
- [ ] 4. `/api/pdf/health` 返回正常（与 PDF 无关的改动可跳过）

## 自查清单

- [ ] 没有提交任何真实密钥（`data/llm_config.json` 等已在 `.gitignore` 里）
- [ ] 没有提交个人研究数据（`data/pdf_jobs/`、`data/summaries/` 等运行时目录）
- [ ] 保持零依赖：后端只用 Python 标准库，前端未引入外部 JS / CSS / 字体 / 图表库
- [ ] 新增图标用的是内联 SVG，不是 emoji
- [ ] 涉及界面改动的，附了改动前后的截图
