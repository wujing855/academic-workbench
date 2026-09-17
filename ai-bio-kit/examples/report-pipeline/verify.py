# -*- coding: utf-8 -*-
"""零改动校验 v3：行级比对 + 4.9 总览表逐单元格比对（卡片化呈现）。"""
import re
import json
import html as htmllib

SRC = [
    ('AI与生物学交叉研究报告_终稿_第一部分.md', 'tools/part1.html', '1'),
    ('AI与生物学交叉研究报告_终稿_第二部分.md', 'tools/part2.html', '2'),
    ('AI与生物学交叉研究报告_终稿_第三部分.md', 'tools/part3.html', '3'),
]

meta = json.load(open('tools/meta.json', encoding='utf-8'))
ROWS_49 = meta['sixpanel']['sec-4-9-rows']
ROW_NORMS = set()
for r in ROWS_49:
    ROW_NORMS.add(re.sub(r'\s+', '', '|'.join(r)))


def strip_html_fragment(s):
    s = re.sub(r'<span class="rt[^"]*">[^<]*</span>', '', s)   # 类型标签
    s = re.sub(r'<a class="ref-back"[^>]*>[^<]*</a>', '', s)  # 回跳链接
    s = re.sub(r'</t[dh]>\s*<t[dh][^>]*>', '|', s)            # 单元格边界
    s = re.sub(r'<[^>]+>', '', s)
    return htmllib.unescape(s)


def norm(s):
    return re.sub(r'\s+', '', s)


total_issues = 0
for md_path, html_path, key in SRC:
    md = open(md_path, encoding='utf-8').read()
    md_lines = []
    for line in md.split('\n'):
        t = line.strip()
        if not t or t == '---' or t.startswith('# ') or t.startswith('本轮应用的修订'):
            continue
        t2 = re.sub(r'^#{2,4}\s+', '', t)
        t2 = re.sub(r'\*\*([^*]+)\*\*', r'\1', t2)
        t2 = re.sub(r'^- ', '', t2)
        t2 = re.sub(r'^\d+\.\s+', '', t2)
        if t2.startswith('|'):
            cells = [c.strip() for c in t2.strip('|').split('|')]
            if all(re.fullmatch(r':?-{3,}:?', c) for c in cells):
                continue
            t2 = '|'.join(cells)
        md_lines.append(norm(t2))

    frag = open(html_path, encoding='utf-8').read()
    # 4.9 卡片化：行级比对跳过这些行，改为单元格比对
    if key == '2':
        frag_build = open('AI与生物学交叉研究报告.html', encoding='utf-8').read()
        frag_build = frag_build.replace('</tr>', '</tr>\n')
        flat49 = norm(strip_html_fragment(frag_build))
        cell_fail = []
        for r in ROWS_49[1:]:
            for c in r:
                if norm(c) not in flat49:
                    cell_fail.append(c[:40])
        print('    4.9 单元格校验:', 'PASS (%d 行 × 5 列)' % (len(ROWS_49) - 1) if not cell_fail else 'FAIL')
        for c in cell_fail[:8]:
            print('        缺失单元格:', c)
        total_issues += len(cell_fail)

    frag = frag.replace('<!--CAPABILITY_PANEL-->', '')
    # 表格在 HTML 中为单行：先按 tr 边界拆行
    frag = frag.replace('</tr>', '</tr>\n')
    # 祛魅卡片：拆开包装 div，保留段落独立成行
    frag = frag.replace('</p>\n</div>', '</p>\n</div>')
    html_lines = []
    for line in frag.split('\n'):
        t = strip_html_fragment(line)
        if not t:
            continue
        html_lines.append(norm(t))

    missing = []
    hi = 0
    for ml in md_lines:
        if key == '2' and ml in ROW_NORMS:
            continue  # 4.9 表行由单元格校验覆盖
        found = False
        for j in range(hi, min(hi + 60, len(html_lines))):
            if html_lines[j] == ml:
                hi = j + 1
                found = True
                break
        if not found:
            missing.append(ml[:60])
    total_issues += len(missing)
    print(md_path, '原文行:', len(md_lines), 'HTML行:', len(html_lines), '问题:', len(missing))
    for m in missing[:10]:
        print('    缺失/顺序:', m)

print('TOTAL ISSUES:', total_issues)
