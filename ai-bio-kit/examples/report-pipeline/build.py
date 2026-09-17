# -*- coding: utf-8 -*-
"""组装最终单文件 HTML：模板 + 三部分正文 + 六个视觉模块。"""
import json
import re
import html as htmllib

import os
BASE = os.environ.get('TRAE_ASSISTANT_DIR', os.path.expanduser('~/.trae-cn/assistant/'))

template = open(BASE + 'tools/template.html', encoding='utf-8').read()
meta = json.load(open(BASE + 'tools/meta.json', encoding='utf-8'))
parts = {k: open(BASE + 'tools/part%s.html' % k, encoding='utf-8').read() for k in '123'}


def cites(s):
    """卡片/图示内的 [N] -> 引用链接（视觉与正文一致）。"""
    return re.sub(r'\[(\d{1,2})\]',
                  lambda m: '<a class="cite" href="#ref-%s">[%s]</a>' % (m.group(1), m.group(1)),
                  s)


def esc(s):
    return htmllib.escape(s, quote=False)


# ============================================================
# 1. 参考文献条目包进 <ul class="refs-list">
# ============================================================
def wrap_refs(h):
    lines = h.split('\n')
    out, in_list = [], False
    for ln in lines:
        is_ref = ln.startswith('<li class="ref-item')
        if is_ref and not in_list:
            out.append('<ul class="refs-list">')
            in_list = True
        if not is_ref and in_list:
            out.append('</ul>')
            in_list = False
        out.append(ln)
    if in_list:
        out.append('</ul>')
    return '\n'.join(out)


# ============================================================
# 2. 图 1 · 能力阶梯（判断二，1.2 节）
# ============================================================
def ladder_svg():
    A = '#14595d'   # 分子层
    B = '#3d7f7c'   # 细胞层
    C = '#b9d4d0'   # 个体与生态系统层
    e = []

    def t(x, y, s, size=13, fill='#fff', weight=None, anchor='middle'):
        a = 'x="%s" y="%s" text-anchor="%s" font-size="%s" fill="%s"' % (x, y, anchor, size, fill)
        if weight:
            a += ' font-weight="%s"' % weight
        e.append('<text %s>%s</text>' % (a, s))

    # 三级台阶
    e.append('<g><title>分子层：最成熟</title><rect x="30" y="70" width="340" height="270" rx="4" fill="%s" stroke="rgba(0,0,0,.14)"/>' % A)
    t(200, 103, '分子层', 18, '#ffffff', 700)
    e.append('<rect x="168" y="112" width="64" height="20" rx="4" fill="#ffffff"/>')
    t(200, 127, '最成熟', 12, A, 700)
    t(200, 160, '序列 · 结构 · 分子间相互作用', 13, '#e7f0ee')
    t(200, 184, '数据基础：半个多世纪的积累', 12.5, '#ffffff', 600)
    t(200, 208, '· PDB（1971—）约 25.9 万实验结构 <a href="#ref-7">[7]</a>', 12.5, '#dce9e7')
    t(200, 230, '· UniProt 约 2.46 亿条序列 <a href="#ref-18">[18]</a>', 12.5, '#dce9e7')
    t(200, 252, '· CASP 盲测（1994—）三十余年 <a href="#ref-23">[23]</a>', 12.5, '#dce9e7')
    t(200, 282, '成熟度跨度（4.9 节）', 12.5, '#ffc59e', 600)
    t(200, 304, 'L4 单体结构 · L2–L3 复合物姿态', 12.5, '#ffffff')
    t(200, 324, 'L1–L2 亲和力与活性', 12.5, '#ffffff')
    e.append('</g>')

    e.append('<g><title>细胞层：独立评测未能稳定超越简单统计基线</title><rect x="390" y="170" width="340" height="170" rx="4" fill="%s" stroke="rgba(0,0,0,.14)"/>' % B)
    t(560, 203, '细胞层', 18, '#ffffff', 700)
    e.append('<rect x="528" y="212" width="64" height="20" rx="4" fill="#ffffff"/>')
    t(560, 227, 'L1–L2', 12, B, 700)
    t(560, 258, '细胞状态预测 · 扰动响应', 13, '#ffffff')
    t(560, 282, '独立评测：未能稳定超越', 12.5, '#ffffff')
    t(560, 302, '简单统计基线 <a href="#ref-4">[4]</a>', 12.5, '#ffffff')
    t(560, 326, '数据补贴：十亿细胞计划（2025）<a href="#ref-8">[8]</a>', 12.5, '#ffffff')
    e.append('</g>')

    e.append('<g><title>个体与生态系统层：几乎没有可信的能力证明</title><rect x="750" y="250" width="340" height="90" rx="4" fill="%s" stroke="rgba(0,0,0,.14)"/>' % C)
    t(920, 288, '个体与生态系统层', 18, '#1f2a2e', 700)
    t(920, 316, '几乎没有可信的能力证明', 13, '#144d50')
    e.append('</g>')

    # 决定变量箭头
    e.append('<path d="M200,58 L560,158 L920,236" fill="none" stroke="#52616a" stroke-width="1.8" stroke-dasharray="7 5" marker-end="url(#lad-arrow)"/>')
    t(560, 134, '数据基础设施的历史厚度（决定变量）', 13, '#52616a', 600)

    # 底部结论
    t(560, 374, '哪里有厚数据，AI 的能力就到哪里为止。', 14.5, '#1f2a2e', 600)
    t(560, 394, '——判断二（1.2 节）', 12, '#52616a')

    return ('<svg viewBox="0 0 1120 404" role="img" aria-labelledby="lad-t lad-d">'
            '<title id="lad-d">能力阶梯：分子层最成熟，细胞层次之，个体与生态系统层几乎没有可信的能力证明，决定变量是数据基础设施的历史厚度。</title>'
            '<defs><marker id="lad-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#52616a"/></marker></defs>'
            + ''.join(e) + '</svg>')


LADDER_BLOCK = (
    '<section class="viz" id="ladder-viz" aria-labelledby="lad-t">\n'
    '<p class="viz-title" id="lad-t">图 1 · 能力阶梯：组织层级与 AI 能力成反比</p>\n'
    '<p class="viz-sub">台阶自左向右降低，对应生物组织层级自分子到生态系统的升序；台阶高度为示意（非定量刻度）。依据 1.2 节判断二绘制，成熟度标签取自 4.9 节总览表。</p>\n'
    '%s\n'
    '<p class="viz-note">文字与数值均出自 1.2 节判断二、2.2 节数据基础与 4.9 节总览表；台阶高度仅示意能力梯度，不构成定量比较。</p>\n'
    '</section>\n'
) % ladder_svg()


# ============================================================
# 3. 图 2 · 技术谱系（第 2–3 章）
# ============================================================
def lineage_svg():
    # (id, x, y, w, label, [sub 行], 里程碑?)
    nodes = [
        # 计算机科学一侧
        ('cs1', 60, 48, 110, '感知机 1958', ['Rosenblatt <a href="#ref-9">[9]</a>']),
        ('cs2', 196, 48, 122, '反向传播 1986', ['多层网络可训练 <a href="#ref-10">[10]</a>']),
        ('cs3', 344, 48, 138, '卷积网络 1989', ['LeCun · 邮编识别 <a href="#ref-11">[11]</a>']),
        ('cs4', 508, 48, 124, 'AlexNet 2012', ['top-5 15.3% <a href="#ref-13">[13]</a>']),
        ('cs5', 658, 48, 134, 'Transformer 2017', ['注意力架构 <a href="#ref-27">[27]</a>']),
        ('cs6', 818, 48, 160, '蛋白质语言模型 2019', ['ESM · 约 2.5 亿序列 <a href="#ref-32">[32]</a>']),
        # 生物学一侧
        ('bio1', 42, 476, 118, 'DNA 双螺旋 1953', ['遗传的分子载体']),
        ('bio2', 184, 476, 100, 'PDB 1971', ['开放数据库 <a href="#ref-17">[17]</a>']),
        ('bio3', 308, 476, 130, 'Sanger 测序 1977', ['序列可读 <a href="#ref-14">[14]</a>']),
        ('bio4', 462, 476, 90, 'BLAST 1990', ['千倍加速 <a href="#ref-19">[19]</a>']),
        ('bio5', 576, 476, 126, '人类基因组 2003', ['约 30 亿碱基对 <a href="#ref-15">[15]</a>']),
        ('bio6', 726, 476, 140, '1000 Genomes 2015', ['变异编目 <a href="#ref-20">[20]</a>']),
        ('bio7', 890, 476, 150, '冷冻电镜革命 2012–13', ['分辨率革命 <a href="#ref-21">[21]</a>']),
        # 交汇主线
        ('m0', 40, 268, 128, '折叠问题', ['序列决定结构', 'Levinthal 1969', 'Anfinsen 1972 <a href="#ref-22">[22]</a>']),
        ('m1', 186, 268, 142, 'CASP 盲测 1994', ['独立评测制度 <a href="#ref-23">[23]</a><a href="#ref-24">[24]</a>']),
        ('m2', 344, 268, 140, 'DCA 2009–11', ['共同进化统计 <a href="#ref-25">[25]</a><a href="#ref-26">[26]</a>']),
        ('m3', 502, 268, 142, '接触图深度学习 2017', ['超越统计方法 <a href="#ref-29">[29]</a>']),
        ('m4', 666, 268, 128, 'AlphaFold1 2018', ['CASP13 夺冠 <a href="#ref-30">[30]</a>']),
        ('m5', 816, 268, 154, 'AlphaFold2 2020', ['中位 GDT_TS 92.4 <a href="#ref-1">[1]</a><a href="#ref-2">[2]</a>'], True),
        # 三条支线
        ('s1', 1030, 110, 170, '基础设施化 2021–22', ['AFDB 约 2 亿 <a href="#ref-6">[6]</a><a href="#ref-35">[35]</a>', 'ColabFold · ESMFold']),
        ('s2', 1030, 250, 170, '设计工具链 2022–24', ['ProteinMPNN · RFdiffusion', 'AlphaProteo · ESM3']),
        ('s3', 1030, 390, 164, '多模态与系统层 2024–26', ['AlphaFold3 · 基因组模型', '虚拟细胞愿景 <a href="#ref-47">[47]</a>']),
    ]
    npos = {}
    for nd in nodes:
        nid, x, y, w, label, subs = nd[0], nd[1], nd[2], nd[3], nd[4], nd[5]
        npos[nid] = (x, y, w, 12 + 17 + 15 * len(subs) + 9)

    def clip(nid, tx, ty):
        x, y, w, h = npos[nid]
        cx, cy = x + w / 2.0, y + h / 2.0
        dx, dy = tx - cx, ty - cy
        if dx == 0 and dy == 0:
            return cx, cy
        sc = min(w / 2.0 / abs(dx or 1e-9), h / 2.0 / abs(dy or 1e-9))
        return cx + dx * sc, cy + dy * sc

    # (from, to, dashed?, label, label_x, label_y, 曲线控制点 or None, from_anchor, to_anchor)
    edges = [
        ('cs1', 'cs2', 0, None, None, None, None, None, None),
        ('cs2', 'cs3', 0, None, None, None, None, None, None),
        ('cs3', 'cs4', 0, None, None, None, None, None, None),
        ('cs4', 'cs5', 1, '规模信念', 566, 40, None, None, None),
        ('cs5', 'cs6', 0, '架构继承', 784, 40, None, None, None),
        ('bio1', 'bio2', 0, None, None, None, None, None, None),
        ('bio2', 'bio3', 0, None, None, None, None, None, None),
        ('bio3', 'bio4', 0, None, None, None, None, None, None),
        ('bio4', 'bio5', 0, None, None, None, None, None, None),
        ('bio5', 'bio6', 0, None, None, None, None, None, None),
        ('bio6', 'bio7', 0, None, None, None, None, None, None),
        ('bio1', 'm0', 1, '序列↔结构', 128, 400, None, None, None),
        ('m0', 'm1', 0, '催生评测', 202, 260, None, None, None),
        ('bio2', 'm1', 1, '实验靶标', 258, 400, None, None, None),
        ('bio4', 'm2', 1, '序列族', 430, 400, None, None, None),
        ('cs4', 'm3', 1, '深度残差网络', 640, 190, None, None, None),
        ('m2', 'm3', 0, '被深度学习超越', 522, 260, None, None, None),
        ('cs5', 'm4', 1, '注意力', 700, 190, None, None, None),
        ('m3', 'm4', 0, None, None, None, None, None, None),
        ('m4', 'm5', 0, None, None, None, None, None, None),
        ('m1', 'm4', 1, '盲测信号（CASP13）', 530, 208, (530, 200), None, None),
        ('m5', 's1', 0, None, None, None, None, None, None),
        ('m5', 's2', 0, None, None, None, None, None, None),
        ('m5', 's3', 0, None, None, None, None, None, None),
        ('cs6', 's1', 1, 'ESMFold', 985, 92, None, None, None),
        ('cs6', 's2', 1, 'ESM3', 972, 196, None, None, None),
        ('bio6', 's3', 1, '基因组数据', 900, 448, None, None, None),
        ('bio2', 'm5', 1, '训练集：约 25.9 万实验结构 <a href="#ref-7">[7]</a>', 571, 428, (560, 470), None, None),
    ]

    out = ['<svg viewBox="0 0 1208 582" role="img" aria-labelledby="gk-t gk-d">',
           '<title id="gk-d">技术谱系图：计算机科学一侧的方法积累与生物学一侧的数据积累，经由折叠问题、CASP 盲测与共同进化统计交汇，汇入 AlphaFold1、AlphaFold2，再分出基础设施化、设计工具链、多模态与系统层三条支线。</title>',
           '<defs>'
           '<marker id="gk-as" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#3d7f7c"/></marker>'
           '<marker id="gk-ad" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8a6d3b"/></marker>'
           '</defs>']

    # 车道底色
    out.append('<rect x="30" y="22" width="1170" height="96" rx="8" fill="#f0f5f4"/>')
    out.append('<rect x="30" y="462" width="1170" height="106" rx="8" fill="#f7f4ec"/>')
    out.append('<text x="40" y="38" font-size="13" font-weight="700" fill="#52616a">计算机科学一侧：方法与算力积累（2.1 节）</text>')
    out.append('<text x="40" y="556" font-size="13" font-weight="700" fill="#52616a">生物学一侧：数据与制度积累（2.2 节）</text>')
    out.append('<text x="40" y="256" font-size="13" font-weight="700" fill="#93380a">交汇点：折叠问题与评测文化（2.3 节）</text>')

    # 连线（先画线，再画节点盖住线头）
    for ed in edges:
        f, to, dashed, label, lx, ly, ctrl, _, _ = ed
        x1, y1, w1, h1 = npos[f]
        x2, y2, w2, h2 = npos[to]
        c1 = (x1 + w1 / 2.0, y1 + h1 / 2.0)
        c2 = (x2 + w2 / 2.0, y2 + h2 / 2.0)
        if ctrl:
            p1 = clip(f, ctrl[0], ctrl[1])
            p2 = clip(to, ctrl[0], ctrl[1])
            d = 'M%.1f,%.1f Q%.1f,%.1f %.1f,%.1f' % (p1[0], p1[1], ctrl[0], ctrl[1], p2[0], p2[1])
        else:
            p1 = clip(f, c2[0], c2[1])
            p2 = clip(to, c1[0], c1[1])
            d = 'M%.1f,%.1f L%.1f,%.1f' % (p1[0], p1[1], p2[0], p2[1])
        cls = 'gk-edge dashed' if dashed else 'gk-edge solid'
        out.append('<path class="%s" data-from="%s" data-to="%s" d="%s" marker-end="url(#%s)"/>'
                   % (cls, f, to, d, 'gk-ad' if dashed else 'gk-as'))
        if label:
            out.append('<text class="gk-edge-label" x="%s" y="%s" text-anchor="middle">%s</text>' % (lx, ly, label))

    # 节点
    for nd in nodes:
        nid, x, y, w, label, subs = nd[0], nd[1], nd[2], nd[3], nd[4], nd[5]
        mile = len(nd) > 6 and nd[6]
        h = npos[nid][3]
        stroke = '#b8470e' if mile else '#b9d4d0'
        sw = 2.2 if mile else 1.2
        fill = '#fdf6f1' if mile else '#ffffff'
        lab = ('◆ ' + label) if mile else label
        lab_fill = '#93380a' if mile else '#1f2a2e'
        t = ('<g class="gk-node" data-node="%s" tabindex="0" aria-label="%s">'
             '<title>%s</title>'
             '<rect x="%s" y="%s" width="%s" height="%s" rx="7" fill="%s" stroke="%s" stroke-width="%s"/>'
             '<text x="%.1f" y="%s" text-anchor="middle" font-weight="700" fill="%s">%s</text>'
             % (nid, label + ('（里程碑）' if mile else ''), label, x, y, w, h, fill, stroke, sw,
                x + w / 2.0, y + 25, lab_fill, lab))
        for i, s in enumerate(subs):
            t += ('<text class="gk-sub" x="%.1f" y="%s" text-anchor="middle">%s</text>'
                  % (x + w / 2.0, y + 43 + i * 15, s))
        t += '</g>'
        out.append(t)

    # 诺贝尔奖注记（3.4 节）
    out.append('<text x="1022" y="348" font-size="12" font-weight="700" fill="#93380a">◆ 2024 诺贝尔化学奖</text>')
    out.append('<text x="1022" y="366" font-size="10.5" fill="#52616a">结构预测＋从头设计 <a href="#ref-46">[46]</a></text>')

    out.append('</svg>')
    return ''.join(out)


LINEAGE_BLOCK = (
    '<section class="viz" id="lineage-viz" aria-labelledby="gk-t2">\n'
    '<p class="viz-title" id="gk-t2">图 2 · 技术谱系：两条积累曲线的交汇与分岔</p>\n'
    '<p class="viz-sub">实线＝直接技术继承；虚线＝概念、制度或数据层面的影响；◆＝里程碑节点。节点与连线关系均出自第 2–3 章正文；悬停或用 Tab 聚焦节点，可高亮其上下游路径。</p>\n'
    '%s\n'
    '<p class="viz-note">谱系为报告叙事结构的图示化，非完备的技术史：仅收录正文明确讨论的节点与承继关系；箭头方向表示影响流向，不表示直接引用关系。</p>\n'
    '</section>\n'
) % lineage_svg()


# ============================================================
# 4. 图 3 · 交互式时间轴挂载块（节点数据在模板 JS 中）
# ============================================================
TIMELINE_BLOCK = (
    '<section class="viz" id="timeline-viz" aria-labelledby="tlv-t">\n'
    '<p class="viz-title" id="tlv-t">图 3 · 交互式时间轴：前史与十年演进（1953–2026）</p>\n'
    '<p class="viz-sub">时间轴为非线性刻度：2000 年之前与 2015 年之前压缩呈现，2016–2026 展开呈现。◆ 里程碑、● 一般事件（本报告的分析性划分，与年表"类别"列一致）；悬停或键盘聚焦节点查看说明，点击跳转对应小节；底部色带为能力重心分期（依据 3.3–3.5 节）。窄屏自动转为纵向排列。</p>\n'
    '<div class="viz-legend">\n'
    '<span class="lg"><span class="sw" style="background:#b8470e"></span>◆ 里程碑事件</span>\n'
    '<span class="lg"><span class="sw" style="background:#14595d"></span>● 一般事件</span>\n'
    '<span class="lg"><span class="sw" style="background:#14595d;opacity:.3"></span>预测已有 2018–2022</span>\n'
    '<span class="lg"><span class="sw" style="background:#3d7f7c;opacity:.3"></span>生成新物 2022–2024</span>\n'
    '<span class="lg"><span class="sw" style="background:#b8470e;opacity:.3"></span>模拟系统 2024–2026</span>\n'
    '</div>\n'
    '<svg id="timeline-svg" role="img" aria-label="交互式时间轴（1953–2026），完整事件与年份见下方年表"></svg>\n'
    '<p class="viz-note">节点名称与说明全部摘自第 2 章前史与第 3 章年表正文；若脚本未启用，请阅读下方"十年关键事件年表"。</p>\n'
    '</section>\n'
)


# ============================================================
# 5. 4.9 交互式能力面板（卡片化总览表，文字逐字保留）
# ============================================================
CAP_SEC = {
    1: 'sec-4-1', 2: 'sec-4-1', 3: 'sec-4-1',
    4: 'sec-4-2', 5: 'sec-4-2', 6: 'sec-4-2',
    7: 'sec-4-3', 8: 'sec-4-3', 9: 'sec-4-3',
    10: 'sec-4-4', 11: 'sec-4-5', 12: 'sec-4-5',
    13: 'sec-4-6', 14: 'sec-4-7', 15: 'sec-4-7',
}
SEC_TITLE = dict(re.findall(r'<h3 id="(sec-4-\d)">([^<]*)</h3>', parts['2']))


def lv_badge(lv):
    cls = {'L4': 'lv-4', 'L3': 'lv-3', 'L2': 'lv-2', 'L1': 'lv-1'}.get(lv, 'lv-mix')
    return '<span class="lv %s">%s</span>' % (cls, lv)


def cap_panel():
    rows = meta['sixpanel']['sec-4-9-rows'][1:]  # 去表头
    cards = []
    for r in rows:
        no = int(r[0])
        name, lv, brief, bottleneck = r[1], r[2], r[3], r[4]
        levels = lv.replace('–', ' ')
        sec = CAP_SEC[no]
        sec_title = SEC_TITLE[sec]
        cards.append(
            '<details class="cap-card" id="cap-%d" data-levels="%s">\n'
            '<summary>\n'
            '<span class="cap-head"><span class="cap-no">%s</span>'
            '<span class="cap-name">%s</span>%s</span>\n'
            '<span class="cap-brief">%s</span>\n'
            '</summary>\n'
            '<div class="cap-body">\n'
            '<p class="cap-bottleneck"><strong>核心瓶颈：</strong>%s</p>\n'
            '<p class="cap-detail-link">详见 <a href="#%s">%s</a></p>\n'
            '</div>\n'
            '</details>'
            % (no, levels, r[0], esc(name), lv_badge(lv),
               cites(esc(brief)), cites(esc(bottleneck)), sec, sec_title))

    defs = {
        'L4': 'L4 基础设施级：产出默认可信，已嵌入日常科研流程',
        'L3': 'L3 常规工具级：可靠有用，但成功率因对象而异，结果须人工核查',
        'L2': 'L2 研究工具级：需要专家操作与逐例验证，仅部分案例成功',
        'L1': 'L1 探索级：能力声称主要来自开发者自报评测',
    }
    btns = ['<button data-lv="all" aria-pressed="true">全部 %d 项</button>' % len(rows)]
    for lv in ('L4', 'L3', 'L2', 'L1'):
        btns.append('<button data-lv="%s" title="%s">%s</button>' % (lv, defs[lv], defs[lv].split('：')[0]))

    return ('<div class="cap-panel" id="cap-panel">\n'
            '<div class="cap-filter" role="group" aria-label="按成熟度分级筛选（分级定义见 4.0 节）">\n'
            + '\n'.join(btns) + '\n</div>\n'
            '<div class="cap-grid">\n' + '\n'.join(cards) + '\n</div>\n</div>')


# ============================================================
# 6. 图 4 · 证据基础（参考文献构成） + 筛选条
# ============================================================
TYPE_META = [
    ('peer', '同行评议', '#14595d'),
    ('official', '官方与机构', '#2b4a6b'),
    ('media', '媒体报道', '#5d3a75'),
    ('preprint', '预印本', '#7c3d06'),
    ('personal', '个人页面', '#6b5233'),
]
PART_LABEL = [('1', '参考文献（第 1–3 章）'), ('2', '参考文献（第 4 章）'), ('3', '参考文献（第 5–8 章）')]


def collect_refs():
    refs = []
    for k in '123':
        h = parts[k]
        for m in re.finditer(r'id="ref-(\d+)" data-type="(\w+)">(.*?)</li>', h, re.S):
            n, t, body = int(m.group(1)), m.group(2), m.group(3)
            single = 'rt-single' in body
            refs.append({'n': n, 'type': t, 'single': single, 'part': k})
    return refs


REFS = collect_refs()
TOTAL = len(REFS)


def source_viz():
    counts = {t: sum(1 for r in REFS if r['type'] == t) for t, _, _ in TYPE_META}
    singles = [r['n'] for r in REFS if r['single']]
    e = []
    y = 30
    for t, name, color in TYPE_META:
        n = counts[t]
        w = n * 700.0 / 68.0
        e.append('<text x="10" y="%s" font-size="13" fill="#1f2a2e">%s</text>' % (y + 16, name))
        e.append('<rect x="130" y="%s" width="%.1f" height="22" rx="2" fill="%s"/>' % (y, w, color))
        lab = '%d 条 · %.1f%%' % (n, n * 100.0 / TOTAL)
        if w > 150:
            e.append('<text x="%.1f" y="%s" font-size="12.5" fill="#ffffff" text-anchor="end" font-weight="600">%s</text>'
                     % (130 + w - 8, y + 16, lab))
        else:
            e.append('<text x="%.1f" y="%s" font-size="12.5" fill="#1f2a2e">%s</text>' % (130 + w + 8, y + 16, lab))
        y += 36
    svg = ('<svg viewBox="0 0 1000 196" role="img" aria-labelledby="sv-d">'
           '<title id="sv-d">参考文献构成条形图：95 条文献中同行评议 %d 条、官方与机构 %d 条、媒体报道 %d 条、预印本 %d 条、个人页面 %d 条。</title>'
           % (counts['peer'], counts['official'], counts['media'], counts['preprint'], counts['personal'])
           + ''.join(e) + '</svg>')

    # 分节构成小表
    rows = ['<tr><th>节</th><th>编号区间</th><th>条数</th>' + ''.join('<th>%s</th>' % nm for _, nm, _ in TYPE_META) + '</tr>']
    for k, label in PART_LABEL:
        sub = [r for r in REFS if r['part'] == k]
        nums = [r['n'] for r in sub]
        cells = ''.join('<td>%d</td>' % sum(1 for r in sub if r['type'] == t) for t, _, _ in TYPE_META)
        rows.append('<tr><td>%s</td><td>[%d]–[%d]</td><td>%d</td>%s</tr>'
                    % (label, min(nums), max(nums), len(sub), cells))
    table = ('<div class="tablewrap"><table><thead><tr>' + rows[0] + '</tr></thead><tbody>'
             + ''.join(rows[1:]) + '</tbody></table></div>')

    single_str = '、'.join('[%d]' % n for n in singles)
    note = ('统计为对参考文献列表的机械计数（同一文献不重复计数）。另有 %d 条标注"单一来源"：%s。'
            '[55] 未被正文引用，无"↩ 正文"回跳锚点。正文中，预印本与单一来源类引用编号以琥珀色虚线标示。'
            % (len(singles), single_str))
    return (
        '<section class="viz" id="source-viz" aria-labelledby="sv-t">\n'
        '<p class="viz-title" id="sv-t">图 4 · 证据基础：95 条参考文献的构成</p>\n'
        '<p class="viz-sub">按参考文献列表各条目的类型标注统计（编号连续，访问日期 2026-09-01）。长条末端为条数与占比。</p>\n'
        + svg + '\n' + table + '\n'
        '<p class="viz-note">%s</p>\n'
        '</section>\n' % note)


def ref_filter():
    counts = {t: sum(1 for r in REFS if r['type'] == t) for t, _, _ in TYPE_META}
    btns = ['<button data-type="all" aria-pressed="true">全部 <span class="count">%d</span></button>' % TOTAL]
    for t, name, _ in TYPE_META:
        btns.append('<button data-type="%s">%s <span class="count">%d</span></button>' % (t, name, counts[t]))
    return ('<div class="ref-filter" id="ref-filter" role="group" '
            'aria-label="按类型筛选参考文献（作用于全部三节文献列表）">\n' + '\n'.join(btns) + '\n</div>')


# ============================================================
# 7. 4.8 祛魅清单卡片化（文字逐字保留，仅加视觉结构）
# ============================================================
MYTH_RE = re.compile(
    r'<p id="(p-\d+)"><strong>(误解[一二三四五]：[\s\S]*?)</strong></p>\n'
    r'<p id="(p-\d+)">(核查：[\s\S]*?)</p>\n'
    r'<p id="(p-\d+)">(修正表述：[\s\S]*?)</p>')


def mythify(h):
    def sub(m):
        return ('<div class="myth-card"><div class="myth-row">\n'
                '<div class="myth-left">\n<p id="%s"><strong>%s</strong></p>\n</div>\n'
                '<div class="myth-right">\n<p id="%s" class="myth-check">%s</p>\n'
                '<p id="%s" class="myth-fix">%s</p>\n</div>\n</div></div>'
                % (m.group(1), m.group(2), m.group(3), m.group(4), m.group(5), m.group(6)))
    return MYTH_RE.subn(sub, h)


# ============================================================
# 组装
# ============================================================
p1 = parts['1']
p2 = parts['2']
p3 = parts['3']

# part1：三个图示模块 + 来源图 + 筛选条
p1 = p1.replace('<h2 id="ch-2">', LADDER_BLOCK + '<h2 id="ch-2">', 1)
p1 = p1.replace('<h2 id="ch-3">', LINEAGE_BLOCK + '<h2 id="ch-3">', 1)
p1 = p1.replace('<h2 id="timeline-events">', TIMELINE_BLOCK + '<h2 id="timeline-events">', 1)
p1 = p1.replace('<h2 id="refs-1">', source_viz() + '<h2 id="refs-1">', 1)
m = re.search(r'<p id="p-89">.*?</p>', p1, re.S)
assert m, 'refs-1 intro paragraph not found'
p1 = p1.replace(m.group(0), m.group(0) + '\n' + ref_filter(), 1)

# part2：能力面板 + 祛魅卡片 + 六栏表"做不到"行强调
p2 = p2.replace('<!--CAPABILITY_PANEL-->', cap_panel(), 1)
p2, n_myth = mythify(p2)
p2 = re.sub(r'<tr id="(p-\d+)"><td>明确做不到的事</td>',
            r'<tr id="\1" class="row-cannot"><td>明确做不到的事</td>', p2)

# part3：无图示模块
p3 = p3

# 参考文献列表包裹
for k in ('1', '2', '3'):
    pass
p1 = wrap_refs(p1)
p2 = wrap_refs(p2)
p3 = wrap_refs(p3)

# 模板微调：谱系图节点键盘焦点样式；目录补"证据构成图"
template = template.replace(
    'a:focus-visible,button:focus-visible,summary:focus-visible,.tl-node:focus-visible{',
    'a:focus-visible,button:focus-visible,summary:focus-visible,.tl-node:focus-visible,.gk-node:focus-visible{')
template = template.replace(
    '<li class="toc-l1"><a href="#refs-1">参考文献</a></li>',
    '<li class="toc-l1"><a href="#refs-1">参考文献</a>\n      <ul><li class="toc-l2"><a href="#source-viz" class="toc-viz">▣ 证据构成图</a></li></ul>\n    </li>')

final = template.replace('{{PART1}}', p1).replace('{{PART2}}', p2).replace('{{PART3}}', p3)

out_path = BASE + 'AI与生物学交叉研究报告.html'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(final)

# ============================================================
# 自检
# ============================================================
issues = []
if '{{' in final:
    issues.append('模板占位符未替换')
if '<!--CAPABILITY_PANEL-->' in final:
    issues.append('能力面板占位符未替换')
if final.count('<ul class="refs-list">') != 3:
    issues.append('refs-list 包裹数=%d' % final.count('<ul class="refs-list">'))

# 内部锚点完整性
hrefs = set(re.findall(r'href="#([^"]+)"', final))
ids = set(re.findall(r'id="([^"]+)"', final))
missing = sorted(h for h in hrefs if h not in ids)
if missing:
    issues.append('悬空锚点: %s' % missing[:10])

print('myth cards:', n_myth)
print('refs total:', TOTAL, '| singles:', [r['n'] for r in REFS if r['single']])
print('file size: %.1f KB' % (len(final.encode("utf-8")) / 1024.0))
print('issues:', issues if issues else 'NONE')
