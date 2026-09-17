#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI×生物前沿日报 Markdown -> 单文件 HTML。

用法:
    python3 digest2html.py <日报.md> [-o <输出.html>]

- 仅标准库，无第三方依赖；输出完全离线可读（CSS 全内联，无外链）。
- 「预印本」「单一来源」自动渲染为琥珀徽章；「分析：」段落渲染为推断样式。
- 转换后自动执行零改动校验（剥离标签逐行比对），输出 PASS/FAIL；FAIL 时退出码 1。

支持的 Markdown 子集（与 digest-template.md 严格对应）：
  #/##/### 标题、- 列表、> 引用、--- 分隔线、**加粗**、[文字](链接)、段落。
"""
import re
import sys
import html as H

BG = '#faf9f5'
INK = '#1f2a2e'
SOFT = '#52616a'
TEAL = '#14595d'
TEAL_PALE = '#e7f0ee'
LINE = '#e3e0d8'
AMBER_BG = '#fdf3e3'
AMBER_LINE = '#b45309'
AMBER_INK = '#7c3d06'

LINK_RE = re.compile(r'\[([^\]]+)\]\((https?://[^)\s]+)\)')
BOLD_RE = re.compile(r'\*\*([^*]+?)\*\*')


def inline(t):
    t = H.escape(t, quote=False)
    t = BOLD_RE.sub(r'<strong>\1</strong>', t)
    t = LINK_RE.sub(r'<a href="\2" rel="noopener">\1</a>', t)
    t = t.replace('（预印本）', '<span class="badge">预印本</span>')
    t = t.replace('（单一来源）', '<span class="badge">单一来源</span>')
    return t


def parse(md_lines):
    blocks = []
    i, n = 0, len(md_lines)
    while i < n:
        s = md_lines[i].strip()
        if not s:
            i += 1
        elif s.startswith('### '):
            blocks.append(('h3', s[4:])); i += 1
        elif s.startswith('## '):
            blocks.append(('h2', s[3:])); i += 1
        elif s.startswith('# '):
            blocks.append(('h1', s[2:])); i += 1
        elif re.fullmatch(r'-{3,}', s):
            blocks.append(('hr', '')); i += 1
        elif s.startswith('>'):
            buf = []
            while i < n and md_lines[i].strip().startswith('>'):
                buf.append(md_lines[i].strip().lstrip('>').strip()); i += 1
            blocks.append(('quote', ' '.join(buf)))
        elif s.startswith('- '):
            items = []
            while i < n and md_lines[i].strip().startswith('- '):
                items.append(md_lines[i].strip()[2:]); i += 1
            blocks.append(('ul', items))
        else:
            buf = []
            while (i < n and md_lines[i].strip()
                   and not md_lines[i].strip().startswith(('#', '>', '-'))):
                buf.append(md_lines[i].strip()); i += 1
            blocks.append(('p', ' '.join(buf)))
    return blocks


def render(blocks):
    out = []
    for typ, content in blocks:
        if typ == 'h1':
            out.append('<h1>%s</h1>' % inline(content))
        elif typ == 'h2':
            out.append('<h2>%s</h2>' % inline(content))
        elif typ == 'h3':
            out.append('<h3>%s</h3>' % inline(content))
        elif typ == 'hr':
            out.append('<hr>')
        elif typ == 'quote':
            out.append('<blockquote>%s</blockquote>' % inline(content))
        elif typ == 'p':
            if content.startswith('分析：'):
                cls = ' class="ana"'
            elif content.startswith('检索窗口') or content.startswith('检索日期'):
                cls = ' class="meta"'
            else:
                cls = ''
            out.append('<p%s>%s</p>' % (cls, inline(content)))
        else:
            out.append('<ul>' + ''.join('<li>%s</li>' % inline(x) for x in content) + '</ul>')
    return '\n'.join(out)


CSS = (
    ':root{--bg:%s;--ink:%s;--soft:%s;--teal:%s;--teal-pale:%s;--line:%s;'
    '--amber-bg:%s;--amber-line:%s;--amber-ink:%s}\n'
    'body{margin:0;background:var(--bg);color:var(--ink);'
    "font:17.5px/1.78 -apple-system,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;"
    '-webkit-font-smoothing:antialiased}\n'
    'main{max-width:44em;margin:0 auto;padding:2.6em 1.2em 2em}\n'
    'h1{font-size:1.55em;color:var(--teal);margin:.2em 0 .5em;line-height:1.4}\n'
    'h2{font-size:1.2em;color:var(--teal);margin:2.1em 0 .7em;'
    'border-bottom:2px solid var(--teal-pale);padding-bottom:.25em}\n'
    'h3{font-size:1.05em;margin:1.4em 0 .4em}\n'
    'p{margin:.65em 0}\n'
    'ul{margin:.5em 0;padding-left:1.4em}\n'
    'li{margin:.45em 0}\n'
    'a{color:var(--teal)}\n'
    'p.meta{font-size:.9em;color:var(--soft);background:#fff;border:1px solid var(--line);'
    'border-radius:6px;padding:.6em .95em;margin:1em 0}\n'
    'blockquote{border-left:3px solid var(--teal);background:var(--teal-pale);'
    'color:#144d50;margin:1em 0;padding:.55em .95em;border-radius:0 6px 6px 0}\n'
    'p.ana{background:var(--teal-pale);border-left:3px solid var(--teal);'
    'padding:.55em .95em;border-radius:0 6px 6px 0}\n'
    '.badge{display:inline-block;font-size:.76em;padding:0 .5em;border:1px solid var(--amber-line);'
    'border-radius:3px;color:var(--amber-ink);background:var(--amber-bg);vertical-align:.12em;'
    'white-space:nowrap}\n'
    'hr{border:none;border-top:1px solid var(--line);margin:2em 0}\n'
    'footer{max-width:44em;margin:0 auto;padding:0 1.2em 2.6em;color:var(--soft);font-size:.82em}'
) % (BG, INK, SOFT, TEAL, TEAL_PALE, LINE, AMBER_BG, AMBER_LINE, AMBER_INK)


def build_html(md_text, title):
    body = render(parse(md_text.split('\n')))
    return ('<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n'
            '<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            '<title>%s</title>\n<style>\n%s</style>\n</head>\n<body>\n'
            '<main>\n%s\n</main>\n'
            '<footer>预印本/单一来源以琥珀徽章标注；「分析：」段落为本日报的推断性内容，'
            '与事实相区分。本页为单文件离线文档。</footer>\n'
            '</body>\n</html>\n') % (H.escape(title), CSS, body)


def norm(t):
    t = t.replace('（预印本）', '预印本').replace('（单一来源）', '单一来源')
    t = re.sub(r'^\s{0,3}(#{1,6}|>|(-{1,}))\s*', '', t)
    t = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', t)
    t = t.replace('**', '')
    return re.sub(r'\s', '', t)


def verify(md_text, html_doc):
    m = re.search(r'<main>(.*)</main>', html_doc, re.S)
    flat = norm(H.unescape(re.sub(r'<[^>]+>', '', m.group(1) if m else '')))
    fails = []
    for line in md_text.split('\n'):
        s = line.strip()
        if not s or re.fullmatch(r'-{3,}', s):
            continue
        if norm(line) not in flat:
            fails.append(s[:60])
    return fails


def main():
    args = [a for a in sys.argv[1:] if a != '-o']
    if not args:
        print(__doc__)
        sys.exit(2)
    src = args[0]
    out = args[1] if len(args) > 1 else (src[:-3] + '.html' if src.endswith('.md') else src + '.html')
    md_text = open(src, encoding='utf-8').read()
    m = re.search(r'^# (.+)$', md_text, re.M)
    title = m.group(1).strip() if m else 'AI×生物前沿日报'
    doc = build_html(md_text, title)
    open(out, 'w', encoding='utf-8').write(doc)
    fails = verify(md_text, doc)
    if fails:
        print('校验: FAIL（%d 行未命中）' % len(fails))
        for f in fails[:10]:
            print('  >', f)
        sys.exit(1)
    print('校验: PASS — 内容零改动 | 输出: %s' % out)


if __name__ == '__main__':
    main()
