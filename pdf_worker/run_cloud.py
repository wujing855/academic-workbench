#!/usr/bin/env python3
"""MinerU 云端 Precision 解析测试脚本。

用法：
    python3 run_cloud.py /path/to/你的文件.pdf
Token 从环境变量 MINERU_TOKEN 读取（或提前写入 data/pdf_config.json 的 cloud_token）。
"""
import os
import sys
import time
from mineru import MinerU

if len(sys.argv) < 2:
    print("用法: python3 run_cloud.py <pdf路径>", file=sys.stderr)
    sys.exit(3)
PDF = sys.argv[1]
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_output_cloud")

token = os.environ.get("MINERU_TOKEN")
if not token:
    # 兜底：从 data/pdf_config.json 读（相对于工作台根目录）
    try:
        import json
        cfg_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                "data", "pdf_config.json")
        token = json.load(open(cfg_path, encoding="utf-8")).get("cloud_token", "")
    except Exception:
        token = ""
if not token:
    print("ERROR: 未找到 MinerU Token（设置 MINERU_TOKEN 环境变量，或填 data/pdf_config.json）",
          file=sys.stderr)
    sys.exit(1)

os.makedirs(OUT_DIR, exist_ok=True)

name = os.path.splitext(os.path.basename(PDF))[0]

print(f"[cloud] 初始化 MinerU 客户端...")
client = MinerU(token)

print(f"[cloud] 提交解析任务: {PDF}")
print(f"[cloud] model=pipeline, ocr=True, language=ch, formula=True, table=True")
t0 = time.time()

try:
    result = client.extract(
        PDF,
        model="pipeline",
        ocr=True,
        formula=True,
        table=True,
        language="ch",
        timeout=600,
    )
    elapsed = time.time() - t0
    print(f"[cloud] 完成! 耗时 {elapsed:.1f} 秒")
    print(f"[cloud] state={result.state}, task_id={result.task_id}")

    md = result.markdown or ""
    print(f"[cloud] Markdown 字数: {len(md)}")
    print(f"[cloud] 提取图片数: {len(result.images) if result.images else 0}")

    # 保存 Markdown
    md_path = os.path.join(OUT_DIR, f"{name}_cloud.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"[cloud] Markdown 已保存: {md_path}")

    # 保存全部资源（图片等）
    try:
        result.save_all(OUT_DIR)
        print(f"[cloud] 全部资源已保存到: {OUT_DIR}")
    except Exception as e:
        print(f"[cloud] save_all 警告: {e}")

    # 打印前 500 字预览
    print("\n==== Markdown 前 500 字预览 ====")
    print(md[:500])

except Exception as e:
    elapsed = time.time() - t0
    print(f"[cloud] 失败! 耗时 {elapsed:.1f}s, 错误: {e}", file=sys.stderr)
    sys.exit(2)
finally:
    client.close()
