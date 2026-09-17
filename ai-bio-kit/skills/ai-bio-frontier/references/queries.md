# 七域固定检索查询组

按源项目报告第 4 章的七大任务域组织。检索窗口默认最近 3 天。每组执行：至少 1 条通用查询 + 1 条限定来源查询（限定 sources.md 白名单站点）。

## 域 1 · 蛋白质结构预测

- `AlphaFold OR "protein structure prediction"`（新论文/新版本）
- `CASP16 OR CASP17`（评测动态）
- 分子复合物、结合亲和力、构象系综相关的新独立评测

## 域 2 · 从头蛋白质设计

- `"de novo protein design" OR RFdiffusion OR ProteinMPNN OR AlphaProteo`
- 设计成功率/实验验证的独立结果（对照锚点：CASP16 显示明确缺口）

## 域 3 · 基因组解读

- `"genome foundation model" OR AlphaGenome OR "Evo 2"`
- 基因组模型的独立基准（防止只有自报成绩）

## 域 4 · 细胞状态与虚拟细胞

- `"single-cell foundation model" OR "virtual cell"`，另加 `baseline evaluation` 类词核对独立评测
- 十亿细胞计划等数据基础设施进展

## 域 5 · 显微成像分析

- `AI microscopy image analysis` / `foundation model microscopy biological imaging`

## 域 6 · 实验自动化

- `"self-driving lab" biology OR "automated experimentation" OR "autonomous lab"`

## 域 7 · 药物发现

- `AI drug discovery clinical trial`（只认公开可验证的临床进展，营销性里程碑声明标注「单一来源」）

## 横向查询（每次必查）

- `"AI scientist" OR "AI biologist"`（自主科研系统，如 Robin 类）
- 重点机构公告：Google DeepMind、Isomorphic Labs、Arc Institute、EvolutionaryScale、EMBL-EBI
- 本领域重大奖项/评审动态（诺奖后续、CASP 组织方公告）

## 检索纪律

1. 查询词可用英文为主（该领域一手文献以英文发表），说明性检索可中文
2. 命中后回源访问；摘要页不足以核对三要素时，进入正文页或标注缺口
3. 转载报道只作线索，溯源后按一手来源分级
4. 查询与排除过程不写入日报正文；全部来源链接统一收入日报「参考来源」区
