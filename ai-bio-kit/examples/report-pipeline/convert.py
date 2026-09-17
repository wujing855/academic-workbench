# -*- coding: utf-8 -*-
"""Markdown 定稿 -> HTML 片段转换器。程序化转换保证内容零改动。"""
import re
import html
import json

SRC = [
    ('AI与生物学交叉研究报告_终稿_第一部分.md', 'part1'),
    ('AI与生物学交叉研究报告_终稿_第二部分.md', 'part2'),
    ('AI与生物学交叉研究报告_终稿_第三部分.md', 'part3'),
]

CITE_RE = re.compile(r'\[(\d{1,2})\]')
BOLD_RE = re.compile(r'\*\*([^*]+?)\*\*')
URL_RE = re.compile(r'(https?://[^\s，。）)]+)')

# 预印本类文献（条目含独立"（预印本）"标注）
PREPRINT_REFS = {43, 74, 87, 89, 94}
# 单一来源标注
SINGLE_REFS = {31, 36, 71, 92}

first_cite = {}
para_counter = [0]


def classify_ref(entry_text):
    if '（预印本）' in entry_text or '（预印本；' in entry_text:
        return 'preprint'
    if '个人博客' in entry_text:
        return 'personal'
    if '（新闻）' in entry_text or '（新闻，' in entry_text:
        return 'media'
    if any(k in entry_text for k in ['机构公告', '机构数据页', '机构网页', '机构统计页',
                                      '机构文档页', '企业博客', '企业公告', '行业协议', '新闻稿', '智库报告']):
        return 'official'
    return 'peer'


def inline(text, para_id=None, do_urls=False):
    t = html.escape(text, quote=False)
    t = BOLD_RE.sub(r'<strong>\1</strong>', t)

    def cite_sub(m):
        n = int(m.group(1))
        if para_id and n not in first_cite:
            first_cite[n] = para_id
        cls = 'cite'
        if n in PREPRINT_REFS or n in SINGLE_REFS:
            cls += ' cite-flag'
        return '<a class="%s" href="#ref-%d">[%d]</a>' % (cls, n, n)

    t = CITE_RE.sub(cite_sub, t)
    if do_urls:
        t = URL_RE.sub(lambda m: '<a class="reflink" href="%s" rel="noopener">%s</a>' % (m.group(1), m.group(1)), t)
    return t


def slug_heading(text, part):
    """生成标题锚点 id。"""
    t = text.strip().lstrip('#').strip()
    m = re.match(r'^第 (\d+) 章', t)
    if m:
        return 'ch-%s' % m.group(1), t
    m = re.match(r'^(\d+)\.(\d+)\s', t)
    if m:
        return 'sec-%s-%s' % (m.group(1), m.group(2)), t
    if t.startswith('十年关键事件年表'):
        return 'timeline-events', t
    if t.startswith('参考文献'):
        return 'refs-%s' % part[-1], t
    if t.startswith('附录 A'):
        return 'appendix-a', t
    if t.startswith('附录 B'):
        return 'appendix-b', t
    return None, t


def parse_table(lines, i):
    """收集从 i 开始的表格行，返回 (rows, next_i)。rows 为单元格二维列表。"""
    rows = []
    while i < len(lines) and lines[i].strip().startswith('|'):
        raw = lines[i].strip()
        cells = [c.strip() for c in raw.strip('|').split('|')]
        if not all(re.fullmatch(r':?-{3,}:?', c) for c in cells):
            rows.append(cells)
        i += 1
    return rows, i


def render_table(rows, extra_cls=''):
    if not rows:
        return ''
    head = rows[0]
    body = rows[1:]
    out = ['<div class="tablewrap%s">' % (' ' + extra_cls if extra_cls else '')]
    out.append('<table>')
    out.append('<thead><tr>')
    for c in head:
        out.append('<th>%s</th>' % inline(c))
    out.append('</tr></thead><tbody>')
    for r in body:
        para_counter[0] += 1
        pid = 'p-%d' % para_counter[0]
        out.append('<tr id="%s">' % pid)
        for c in r:
            out.append('<td>%s</td>' % inline(c, pid))
        out.append('</tr>')
    out.append('</tbody></table></div>')
    return ''.join(out)


def convert(src_path, part_key):
    text = open(src_path, encoding='utf-8').read()
    lines = text.split('\n')
    out = []
    revision_note = None
    sixpanel = {}
    current_sec = None
    in_refs = False
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        stripped = line.strip()

        # 文件 H1 与修订说明行：提取后跳过
        if stripped.startswith('# ') or stripped.startswith('本轮应用的修订'):
            if stripped.startswith('本轮应用的修订'):
                revision_note = stripped
            i += 1
            continue

        if stripped == '---' or stripped == '':
            i += 1
            continue

        # 标题
        if stripped.startswith('## '):
            hid, t = slug_heading(stripped[3:], part_key)
            in_refs = t.startswith('参考文献')
            out.append('<h2 id="%s">%s</h2>' % (hid, inline(t)))
            current_sec = hid
            i += 1
            continue
        if stripped.startswith('### '):
            hid, t = slug_heading('### ' + stripped[4:], part_key)
            if hid is None:
                hid = 'sec-x-%d' % i
            out.append('<h3 id="%s">%s</h3>' % (hid, inline(t)))
            current_sec = hid
            i += 1
            continue

        # 参考文献条目
        m = re.match(r'^\[(\d+)\]\s+(.*)$', stripped)
        if m and in_refs:
            refno = int(m.group(1))
            entry_raw = m.group(2)
            rtype = classify_ref(entry_raw)
            single = '单一来源' in entry_raw
            entry_html = inline(entry_raw, do_urls=True)
            back = ''
            if refno in first_cite:
                back = '<a class="ref-back" href="#%s" title="返回正文首次引用处">↩ 正文</a>' % first_cite[refno]
            tagmap = {
                'peer': ('同行评议', 'rt-peer'),
                'preprint': ('预印本', 'rt-preprint'),
                'official': ('官方与机构', 'rt-official'),
                'media': ('媒体报道', 'rt-media'),
                'personal': ('个人博客', 'rt-personal'),
            }
            label, cls = tagmap[rtype]
            single_tag = '<span class="rt-single">单一来源</span>' if single else ''
            out.append('<li class="ref-item %s" id="ref-%d" data-type="%s"><span class="ref-no">[%d]</span>%s<span class="rt %s">%s</span>%s %s</li>'
                       % ('ref-dim' if rtype in ('preprint', 'personal') or single else '',
                          refno, rtype, refno, entry_html, cls, label, single_tag, back))
            i += 1
            continue

        # 表格
        if stripped.startswith('|'):
            rows, i2 = parse_table(lines, i)
            i = i2
            if current_sec == 'timeline-events':
                out.append(render_table(rows, extra_cls='tbl-events tbl-sortable'))
            elif current_sec and re.match(r'^sec-4-[1-7]$', current_sec or ''):
                sixpanel[current_sec] = rows
                out.append(render_table(rows, extra_cls='tbl-sixpanel'))
            elif current_sec == 'sec-4-9':
                # 总览表 -> 卡片数据（由 build 阶段渲染，此处输出占位标记并保存行）
                sixpanel['sec-4-9-rows'] = rows
                out.append('<!--CAPABILITY_PANEL-->')
            else:
                out.append(render_table(rows))
            continue

        # 有序列表
        if re.match(r'^\d+\.\s', stripped):
            items = []
            while i < n and re.match(r'^\d+\.\s', lines[i].strip()):
                items.append(re.sub(r'^\d+\.\s+', '', lines[i].strip()))
                i += 1
            out.append('<ol>')
            for it in items:
                para_counter[0] += 1
                pid = 'p-%d' % para_counter[0]
                out.append('<li id="%s">%s</li>' % (pid, inline(it, pid)))
            out.append('</ol>')
            continue

        # 无序列表
        if stripped.startswith('- '):
            items = []
            while i < n and lines[i].strip().startswith('- '):
                items.append(lines[i].strip()[2:])
                i += 1
            out.append('<ul class="%s">' % ('term-list' if current_sec == 'appendix-a' else ''))
            for it in items:
                para_counter[0] += 1
                pid = 'p-%d' % para_counter[0]
                if current_sec == 'appendix-a':
                    # 术语表：冒号前术语加粗（纯样式增强，文字不变）
                    mm = re.match(r'^([^：]{1,30})：(.*)$', it)
                    if mm:
                        out.append('<li id="%s"><strong>%s</strong>：%s</li>' % (pid, html.escape(mm.group(1), quote=False), inline(mm.group(2), pid)))
                    else:
                        out.append('<li id="%s">%s</li>' % (pid, inline(it, pid)))
                else:
                    out.append('<li id="%s">%s</li>' % (pid, inline(it, pid)))
            out.append('</ul>')
            continue

        # 分析段落
        if re.match(r'^分析[（:：]', stripped):
            para_counter[0] += 1
            pid = 'p-%d' % para_counter[0]
            out.append('<blockquote class="analysis" id="%s"><p>%s</p></blockquote>' % (pid, inline(stripped, pid)))
            i += 1
            continue

        # 普通段落
        para_counter[0] += 1
        pid = 'p-%d' % para_counter[0]
        out.append('<p id="%s">%s</p>' % (pid, inline(stripped, pid)))
        i += 1

    return '\n'.join(out), revision_note, sixpanel


results = {}
all_sixpanel = {}
for path, key in SRC:
    body, rev, sp = convert(path, key)
    results[key] = {'body': body, 'revision': rev}
    all_sixpanel.update(sp)
    print(key, 'paragraphs:', para_counter[0], 'bytes:', len(body))

meta = {
    'first_cite': {str(k): v for k, v in sorted(first_cite.items())},
    'sixpanel': all_sixpanel,
    'revisions': {k: v['revision'] for k, v in results.items()},
}
with open('tools/meta.json', 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=False, indent=1)
for k, v in results.items():
    with open('tools/%s.html' % k, 'w', encoding='utf-8') as f:
        f.write(v['body'])
print('done. refs first-cited:', len(first_cite))
