/* ============================================================
   学术工作台 · 前端逻辑
   双主题（亮色实验室笔记本 / 暗色深墨绿）
   侧边栏导航 · 文献工具 · 前沿日报 · 动画交互
   ============================================================ */

(function () {
  'use strict';

  // ===== 状态 =====
  const state = {
    panel: 'dashboard',
    overview: null,
    news: null,
    todos: [],
    todoDoneCollapsed: true,
    journal: [],
    journalTypeFilter: '全部',
    activeNewsTab: 'all',
    relevanceOnly: false,   // 只看与研究领域相关的资讯
    theme: 'light',
    // 文献工具
    lit: { journals: null, glossary: null, queries: null, arxiv: null },
    activeLitTab: 'journals',
    journalFilter: 'all',
    glossaryQuery: '',
    // 前沿瞭望
    frontier: null,
    // 热点日报
    hotspots: null,
    // 科技爱好者周刊（独立轻接口）
    weekly: null,
    // PDF 转写
    pdf: {
      file: null,
      jobId: null,
      timer: null,
      creepTimer: null,
      running: false,
      health: null,
      markdown: '',
      view: 'preview',
      progress: 0,
    },
  };

  const PANEL_TITLES = {
    dashboard: '概览',
    todos: '待办事项',
    focus: '专注',
    news: '资讯动态',
    literature: '文献工具',
    pdf: 'PDF转写',
    translations: '译文库',
    readings: '原文精读',
    frontier: '前沿瞭望',
    hotspots: '热点日报',
    weekly: '科技周报',
    sections: '文件夹',
    journal: '研究日志',
    summaries: '摘要卡片',
  };

  // 板块图标（线性 SVG）
  const SECTION_ICONS = {
    '01_文献库': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    '02_研究笔记': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    '03_论文写作': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    '04_数据分析': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    '05_学业事务': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    '06_项目归档': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
    '07_个人管理': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    '08_临时中转': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>',
  };

  // 空态图标（内联线性 SVG；界面禁 emoji）
  const HS_ICONS = {
    frontier: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5" opacity="0.55"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>',
    hotspot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v3H4z"/><path d="M4 9h10v11H4z"/><path d="M16 9h4v11h-4z"/><line x1="7" y1="12.5" x2="11" y2="12.5"/><line x1="7" y1="16" x2="11" y2="16"/></svg>',
    weekly: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>',
    signal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.25a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',
    journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  };

  // ===== 工具函数 =====
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function api(url, options) {
    return fetch(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options))
      .then(function (r) { return r.json(); });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // 轻量 Markdown 渲染器（零依赖，支持日报常用语法）
  function renderMarkdown(md) {
    if (!md) return '';
    var lines = md.split('\n');
    var html = [];
    var inCodeBlock = false;
    var inList = false;
    var listType = '';
    var inQuote = false;

    function closeList() {
      if (inList) {
        html.push('</' + listType + '>');
        inList = false;
        listType = '';
      }
    }
    function closeQuote() {
      if (inQuote) {
        html.push('</blockquote>');
        inQuote = false;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      // 代码块
      if (trimmed.startsWith('```')) {
        closeList(); closeQuote();
        if (inCodeBlock) {
          html.push('</code></pre>');
          inCodeBlock = false;
        } else {
          html.push('<pre><code>');
          inCodeBlock = true;
        }
        continue;
      }
      if (inCodeBlock) {
        html.push(escapeHtml(line));
        continue;
      }

      // 空行
      if (trimmed === '') {
        closeList(); closeQuote();
        continue;
      }

      // 水平线
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        closeList(); closeQuote();
        html.push('<hr>');
        continue;
      }

      // 标题
      var headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        closeList(); closeQuote();
        var level = headingMatch[1].length;
        html.push('<h' + level + '>' + renderInline(headingMatch[2]) + '</h' + level + '>');
        continue;
      }

      // 引用
      if (trimmed.startsWith('>')) {
        closeList();
        if (!inQuote) {
          html.push('<blockquote>');
          inQuote = true;
        }
        html.push('<p>' + renderInline(trimmed.replace(/^>\s?/, '')) + '</p>');
        continue;
      } else {
        closeQuote();
      }

      // 无序列表
      if (/^[-*+]\s+/.test(trimmed)) {
        if (!inList || listType !== 'ul') {
          closeList();
          html.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        html.push('<li>' + renderInline(trimmed.replace(/^[-*+]\s+/, '')) + '</li>');
        continue;
      }

      // 有序列表
      if (/^\d+\.\s+/.test(trimmed)) {
        if (!inList || listType !== 'ol') {
          closeList();
          html.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        html.push('<li>' + renderInline(trimmed.replace(/^\d+\.\s+/, '')) + '</li>');
        continue;
      }

      // 普通段落
      closeList();
      html.push('<p>' + renderInline(trimmed) + '</p>');
    }

    closeList(); closeQuote();
    if (inCodeBlock) html.push('</code></pre>');
    return html.join('\n');
  }

  // 行内 Markdown：加粗、斜体、行内代码、链接、HTML上标下标
  function renderInline(text) {
    // 先保护 <sup>/<sub> 等安全行内 HTML 标签（escapeHtml 会转义 <>）
    var protectedTags = [];
    var protoText = text.replace(/<(sup|sub|b|i|em|strong|br\s*\/?)>([\s\S]*?)<\/\1>/gi, function (m, tag, inner) {
      var idx = protectedTags.length;
      protectedTags.push('<' + tag + '>' + inner + '</' + tag + '>');
      return '\x00TAG' + idx + '\x00';
    });
    // 自闭合标签 <br/>
    protoText = protoText.replace(/<br\s*\/?>/gi, function (m) {
      var idx = protectedTags.length;
      protectedTags.push('<br>');
      return '\x00TAG' + idx + '\x00';
    });

    var escaped = escapeHtml(protoText);
    // 行内代码
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 加粗
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 斜体（不与加粗冲突）
    escaped = escaped.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    // 图片 ![alt](url)（必须在普通链接规则之前）
    escaped = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
    // 链接 [text](url)
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // 还原被保护的 HTML 标签
    for (var i = 0; i < protectedTags.length; i++) {
      escaped = escaped.replace('\x00TAG' + i + '\x00', protectedTags[i]);
    }
    return escaped;
  }

  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  // 数字滚动动画
  function countUp(el, target, duration) {
    if (!el) return;
    duration = duration || 1200;
    var start = performance.now();
    var isFloat = String(target).indexOf('.') > -1;
    function step() {
      var elapsed = performance.now() - start;
      var progress = Math.min(elapsed / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var val = target * eased;
      el.textContent = isFloat ? val.toFixed(1) : Math.round(val);
      if (progress < 1) setTimeout(step, 16);
    }
    step();
  }

  function formatDate(d) {
    var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + days[d.getDay()];
  }

  // ===== 主题切换 =====
  function initTheme() {
    // ?theme=dark|light 可临时覆盖（方便对比 / 截图 / 分享）
    var q = (location.search.match(/[?&]theme=(light|dark)/) || [])[1];
    var saved = q || localStorage.getItem('academic-workbench-theme');
    state.theme = saved || 'light';
    applyTheme();
  }

  function applyTheme() {
    if (state.theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('academic-workbench-theme', state.theme);

    // 从按钮位置扩开的圆形揭示（不支持 View Transition 时直接切）
    var root = document.documentElement;
    var btn = $('#themeToggle');
    if (btn) {
      var r = btn.getBoundingClientRect();
      root.style.setProperty('--reveal-x', Math.round(r.left + r.width / 2) + 'px');
      root.style.setProperty('--reveal-y', Math.round(r.top + r.height / 2) + 'px');
    }
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && typeof document.startViewTransition === 'function') {
      try {
        root.classList.add('theme-switching');
        var t = document.startViewTransition(applyTheme);
        var done = function () { root.classList.remove('theme-switching'); };
        if (t && t.finished && t.finished.finally) { t.finished.finally(done); }
        else { setTimeout(done, 700); }
        return;
      } catch (err) {
        root.classList.remove('theme-switching');
      }
    }
    applyTheme();
  }

  // ===== 导航切换 =====
  function switchPanel(panel) {
    var prev = state.panel;
    if (prev && prev !== panel) scrollMemory[prev] = window.scrollY || 0;
    state.panel = panel;
    $$('.nav-item').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.panel === panel);
    });
    $$('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + panel);
    });
    $('#panelTitle').textContent = PANEL_TITLES[panel] || '';
    staggerCards(panel);
    // 面板切换时懒加载数据
    if (panel === 'literature') loadLiteratureAll();
    if (panel === 'frontier') loadFrontier();
    if (panel === 'hotspots') loadHotspots();
    if (panel === 'weekly') loadWeekly();
    if (panel === 'pdf') checkPdfHealth();
    if (panel === 'translations') loadTranslations();
    if (panel === 'readings') loadReadings();
    if (panel === 'focus') focusRenderAll();   // 专注面板：进度/统计/记录实时刷新
    refreshUnreadBadges();   // 进入即视为已读，红点立刻消
    positionNavInk(true);
    syncHash(panel);
    restoreScroll(panel);
  }

  function staggerCards(panel) {
    var container = $('#panel-' + panel);
    if (!container) return;
    var cards = container.querySelectorAll('.card, .section-card, .news-item, .todo-card, .timeline-item, .journal-card, .glossary-item, .query-item, .arxiv-item, .hs-item, .sum-card');
    cards.forEach(function (card, i) {
      card.style.animationDelay = (Math.min(i, 11) * 0.045) + 's';
    });
  }

  // ===== 数据加载 =====
  /* 品牌副标题：显示研究领域名（来自 data/settings.json 的 field_name）*/
  function applyFieldName(name) {
    if (!name) return;
    var sub = $('#brandSub');
    if (sub) sub.textContent = name;
    document.title = '学术工作台 · ' + name;
  }

  function loadOverview() {
    return api('/api/overview').then(function (data) {
      state.overview = data;
      renderOverview();
      renderSections();
      renderTodayBoard(); renderWeekReview();
      applyFieldName(data.field_name);
    });
  }

  function loadNews() {
    return api('/api/news').then(function (data) {
      state.news = data;
      renderNews();
      renderWeather();
      if (state.overview) {
        var newsCount = 0;
        if (data && data.data && data.data.news) {
          Object.values(data.data.news).forEach(function (src) {
            newsCount += (src.items || []).length;
          });
        }
        var el = $('#statNews');
        if (el) countUp(el, newsCount, 1000);
      }
    });
  }

  function loadTodos() {
    return api('/api/todos').then(function (data) {
      state.todos = data || [];
      renderTodos();
      renderDashboardTodos();
      updateTodoBadge();
      renderTodayBoard(); renderWeekReview();
    });
  }

  function loadJournal() {
    return api('/api/journal').then(function (data) {
      state.journal = data || [];
      renderJournal();
      renderDashboardJournal();
      // 周回顾里的「日志条数」读的是 state.journal —— 别处几个数据源都重算了，
      // 唯独这里漏掉，导致那一格永远是加载时的 0。
      renderWeekReview();
    });
  }

  function loadLiteratureAll() {
    var promises = [];
    if (!state.lit.journals) {
      promises.push(api('/api/literature/journals').then(function (d) { state.lit.journals = d; renderJournals(); renderJournalFilters(); }));
    }
    if (!state.lit.glossary) {
      promises.push(api('/api/literature/glossary').then(function (d) { state.lit.glossary = d; renderGlossary(); }));
    }
    if (!state.lit.queries) {
      promises.push(api('/api/literature/queries').then(function (d) { state.lit.queries = d; renderQueries(); }));
    }
    return Promise.all(promises);
  }

  function loadFrontier() {
    return api('/api/frontier').then(function (data) {
      state.frontier = data;
      renderFrontier();
      renderTodayBoard(); renderWeekReview();
    });
  }

  function loadAll() {
    return Promise.all([loadOverview(), loadNews(), loadTodos(), loadJournal()]);
  }

  // ===== 渲染：概览 =====
  function renderOverview() {
    var phd = state.overview.phd;
    /* 进度卡标题随学段走：设了学段就是「博士进度 / 硕士进度 / 本科进度」，否则「学业进度」 */
    var phdLabel = phd.label || '学业进度';
    var cardLabel = $('#phdCardLabel');
    if (cardLabel) cardLabel.textContent = phd.stage ? (phdLabel + ' · ' + phd.stage) : phdLabel;
    var miniLabel = $('#phdMiniLabel');
    if (miniLabel) miniLabel.textContent = phdLabel;

    if (phd.configured) {
      countUp($('#phdPercent'), phd.percent, 1500);
      countUp($('#phdPercentMini'), phd.percent, 1500);
      setTimeout(function () {
        $('#phdBarFill').style.width = phd.percent + '%';
        $('#phdBarMini').style.width = phd.percent + '%';
      }, 100);
      $('#phdDays').innerHTML = '已读 <strong>' + phd.elapsed_days + '</strong> 天 · 剩余 <strong>' + phd.remain_days + '</strong> 天';
      $('#phdStartDate').textContent = phd.start;
      $('#phdEndDate').textContent = phd.end;
      var miniRange = $('#phdMiniRange');
      if (miniRange) miniRange.textContent = phd.start.slice(0, 7).replace('-', '.') + ' — ' + phd.end.slice(0, 7).replace('-', '.');
    } else {
      /* 未配置学制：明确说出来，不要拿别人的日期算出假进度 */
      $('#phdPercent').textContent = '—';
      $('#phdPercentMini').textContent = '—';
      $('#phdBarFill').style.width = '0%';
      $('#phdBarMini').style.width = '0%';
      $('#phdStartDate').textContent = '待设置';
      $('#phdEndDate').textContent = '待设置';
      $('#phdDays').textContent = '还没设置学制 —— 对你的 AI Agent 说「帮我设置学段和学制」，它会替你填好';
      var miniRange2 = $('#phdMiniRange');
      if (miniRange2) miniRange2.textContent = '未设置学制';
    }
    renderGraduation();

    var tree = state.overview.tree;
    var fileCount = 0, dirCount = 0;
    (function count(node) {
      if (node.type === 'file') fileCount++;
      else {
        dirCount++;
        (node.children || []).forEach(count);
      }
    })(tree);
    countUp($('#statFiles'), fileCount, 1000);
    countUp($('#statDirs'), dirCount, 1000);

    var newsCount = 0;
    if (state.news && state.news.data && state.news.data.news) {
      Object.values(state.news.data.news).forEach(function (src) {
        newsCount += (src.items || []).length;
      });
    }
    countUp($('#statNews'), newsCount, 1000);
  }

  function renderDashboardTodos() {
    var container = $('#dashboardTodos');
    var pending = state.todos.filter(function (t) { return !t.done; }).slice(0, 4);
    if (pending.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">暂无待办，享受当下。</div>';
      return;
    }
    container.innerHTML = pending.map(function (t) {
      return '<div class="todo-mini-item' + (t.done ? ' done' : '') + '">' +
        '<div class="todo-mini-check"></div>' +
        '<span class="todo-mini-text">' + escapeHtml(t.text) + '</span></div>';
    }).join('');
  }

  function renderDashboardJournal() {
    var container = $('#dashboardJournal');
    var recent = state.journal.slice(0, 3);
    if (recent.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">还没有研究日志，开始记录吧。</div>';
      return;
    }
    container.innerHTML = recent.map(function (j) {
      return '<div class="journal-mini-item">' +
        '<div class="journal-mini-date">' + escapeHtml(j.date || j.created || '') + '</div>' +
        '<div class="journal-mini-text">' + escapeHtml((j.content || '').slice(0, 80)) + ((j.content || '').length > 80 ? '…' : '') + '</div></div>';
    }).join('');
  }

  function updateTodoBadge() {
    var pending = state.todos.filter(function (t) { return !t.done; }).length;
    $('#navTodoBadge').textContent = pending;
    $('#navTodoBadge').style.display = pending > 0 ? '' : 'none';
  }

  // ===== 渲染：天气 =====
  var WEATHER_CODE_MAP = {
    0: '晴', 1: '晴间多云', 2: '多云', 3: '阴',
    45: '雾', 48: '雾凇',
    51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
    56: '冻毛毛雨', 57: '强冻毛毛雨',
    61: '小雨', 63: '中雨', 65: '大雨',
    66: '冻雨', 67: '强冻雨',
    71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
    80: '小阵雨', 81: '阵雨', 82: '大阵雨',
    85: '小阵雪', 86: '大阵雪',
    95: '雷暴', 96: '雷暴伴小冰雹', 99: '雷暴伴大冰雹'
  };

  function renderWeather() {
    var w = state.news && state.news.data ? state.news.data.weather : null;
    var el = $('#weatherText');
    if (!w) { el.textContent = '天气暂不可用'; return; }
    var cur = w.current || {};
    var temp = cur.temp;
    // 和风天气直接返回中文 text，优先使用；回退到代码映射
    var desc = cur.text || WEATHER_CODE_MAP[cur.code] || ('天气代码 ' + cur.code);
    // 今天的最高/最低气温
    var today = (w.daily && w.daily[0]) || {};
    var tmax = today.tmax;
    var tmin = today.tmin;
    var range = '';
    if (tmax !== undefined && tmin !== undefined) {
      range = ' · ' + Math.round(tmin) + '° / ' + Math.round(tmax) + '°';
    }
    // 体感温度（如果有）
    var feels = '';
    if (cur.feels_like !== undefined) {
      feels = ' · 体感' + Math.round(cur.feels_like) + '°';
    }
    // 风向风力（如果有）
    var wind = '';
    if (cur.wind_dir && cur.wind_scale !== undefined) {
      wind = ' · ' + cur.wind_dir + cur.wind_scale + '级';
    }
    el.textContent = (w && w.city ? w.city + ' ' : '') + (temp !== undefined ? Math.round(temp) + '°C · ' : '') + desc + range + feels + wind;
    // 渲染天气模态框数据（打开时直接显示）
    renderWeatherModal(w);
  }

  /* ===== 天气图标系统（V4）=====
     全部为线性 SVG，统一 24 网格 / 1.7 描边 / currentColor，
     因此能自动继承所在位置的字色，亮暗主题一致，不再出现 emoji 的五彩突兀感。 */
  var WX_PATH = {
    // —— 天气状况 ——
    sun:      '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>',
    partly:   '<circle cx="8.4" cy="8.2" r="3.1"/><path d="M8.4 2.7v1.5M2.9 8.2h1.5M4.4 4.2l1.1 1.1M12.4 4.2l-1.1 1.1"/><path d="M17.4 19.4H9.4a3.4 3.4 0 0 1-.3-6.8 4.6 4.6 0 0 1 8.5 1.3 2.8 2.8 0 0 1-.2 5.5z"/>',
    cloud:    '<path d="M17.6 18.6H7.6a3.9 3.9 0 0 1-.4-7.8 5.2 5.2 0 0 1 9.8 1.5 3.2 3.2 0 0 1 .6 6.3z"/>',
    rain:     '<path d="M17.4 15.2H7.8a3.7 3.7 0 0 1-.4-7.4 4.9 4.9 0 0 1 9.3 1.4 3 3 0 0 1 .7 6z"/><path d="M9.4 18l-1.2 2.8M13.4 18l-1.2 2.8M17.4 18l-1.2 2.8"/>',
    rainHeavy:'<path d="M17.4 14.6H7.8a3.7 3.7 0 0 1-.4-7.4 4.9 4.9 0 0 1 9.3 1.4 3 3 0 0 1 .7 6z"/><path d="M9 17.6l-1.8 4M13.2 17.6l-1.8 4M17.4 17.6l-1.8 4"/>',
    thunder:  '<path d="M17.4 14.4H7.8a3.7 3.7 0 0 1-.4-7.4 4.9 4.9 0 0 1 9.3 1.4 3 3 0 0 1 .7 6z"/><path d="M12.8 16.4l-2.4 4h2.9l-1.2 3.4"/>',
    snow:     '<path d="M17.4 14.6H7.8a3.7 3.7 0 0 1-.4-7.4 4.9 4.9 0 0 1 9.3 1.4 3 3 0 0 1 .7 6z"/><path d="M9.4 18v2.8M8.2 18.7l2.4 1.4M10.6 18.7l-2.4 1.4M15.6 18v2.8M14.4 18.7l2.4 1.4M16.8 18.7l-2.4 1.4"/>',
    fog:      '<path d="M4.6 9.4h11.2"/><path d="M7.8 12.8h12"/><path d="M3.8 16.2h11.6"/>',
    wind:     '<path d="M3 8h9a2.6 2.6 0 1 0-2.6-2.6"/><path d="M3 12.5h13.6a2.6 2.6 0 1 1-2.6 2.6"/><path d="M3 17h7.2a2.2 2.2 0 1 1-2.2 2.2"/>',
    // —— 详情字段 ——
    thermo:   '<path d="M13.8 13.6V5.4a1.8 1.8 0 0 0-3.6 0v8.2a3.8 3.8 0 1 0 3.6 0z"/><path d="M12 8.4v6.6"/>',
    humidity: '<path d="M12 3.4c3.4 3.7 5.6 6.3 5.6 9.1a5.6 5.6 0 0 1-11.2 0c0-2.8 2.2-5.4 5.6-9.1z"/>',
    gauge:    '<path d="M6.1 17.9A8.4 8.4 0 1 1 17.9 17.9"/><path d="M12 12.4l3.6-3"/><circle cx="12" cy="12.4" r="1.15" fill="currentColor" stroke="none"/>',
    eye:      '<path d="M2.6 12S6 6.2 12 6.2 21.4 12 21.4 12 18 17.8 12 17.8 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.8"/>',
    uv:       '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M18.5 5.5l-1.6 1.6M7.1 16.9l-1.6 1.6"/>',
    sunrise:  '<path d="M3.4 18.6h17.2"/><path d="M7.8 14.6a4.2 4.2 0 0 1 8.4 0"/><path d="M12 3.6v2.6"/><path d="M6.2 6.6l1.5 1.5M17.8 6.6l-1.5 1.5"/>',
    // —— 生活指数 ——
    activity: '<path d="M3.4 12h3l2.2-5.2 3.2 10.4 2.4-5.2h4.4"/>',
    car:      '<path d="M4.4 15.2h15.2"/><path d="M6.4 15.2l1.4-4.2h8.4l1.4 4.2"/><circle cx="8" cy="17.4" r="1.4"/><circle cx="16" cy="17.4" r="1.4"/>',
    shirt:    '<path d="M9.4 4.4L5.6 6.8l1.6 3 1.2-.6v8.6h7.2V9.2l1.2.6 1.6-3-3.8-2.4"/><path d="M9.4 4.4a2.6 2.6 0 0 0 5.2 0"/>',
    pin:      '<path d="M12 20.6s5.8-5 5.8-9.2a5.8 5.8 0 1 0-11.6 0c0 4.2 5.8 9.2 5.8 9.2z"/><circle cx="12" cy="11.2" r="2.2"/>',
    pollen:   '<path d="M4.4 19.6C4.4 11.6 9.6 6.4 19.6 6.4c0 9.6-5.2 13.2-11.6 13.2z"/><path d="M8.2 15.8c1.6-3.4 3.8-5.6 7-7"/>',
    fish:     '<path d="M3.6 12c3-4.6 7-4.6 10.4-2.2l4 2.2-4 2.2C10.6 16.6 6.6 16.6 3.6 12z"/><circle cx="8.2" cy="11.2" r=".95" fill="currentColor" stroke="none"/>',
    hanger:   '<path d="M12 7.4a2.1 2.1 0 1 1 2.1-2.1"/><path d="M12 7.4L4.4 14.4h15.2z"/>',
    sparkle:  '<path d="M12 3.6l1.7 4.7 4.7 1.7-4.7 1.7L12 16.4l-1.7-4.7L5.6 10l4.7-1.7z"/><path d="M18.4 16l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
    route:    '<circle cx="6.6" cy="6.6" r="2.4"/><circle cx="17.4" cy="17.4" r="2.4"/><path d="M6.6 9v5a3.6 3.6 0 0 0 3.6 3.6h5"/>',
    smile:    '<circle cx="12" cy="12" r="8.4"/><path d="M8.6 14.2a4.6 4.6 0 0 0 6.8 0"/><circle cx="9.2" cy="9.6" r=".95" fill="currentColor" stroke="none"/><circle cx="14.8" cy="9.6" r=".95" fill="currentColor" stroke="none"/>',
    dot:      '<circle cx="12" cy="12" r="6.6"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  };

  // 注意：多字关键词必须排在单字之前，否则「晴间多云」会被「晴」抢先匹配
  var WEATHER_ICON_MAP = {
    '晴间多云': 'partly', '多云': 'partly', '少云': 'partly', '晴': 'sun',
    '雷阵雨': 'thunder', '雷暴': 'thunder', '暴雨': 'rainHeavy',
    '大雨': 'rainHeavy', '中雨': 'rain', '小雨': 'rain', '阵雨': 'rain',
    '大雪': 'snow', '中雪': 'snow', '小雪': 'snow', '阵雪': 'snow', '雨夹雪': 'snow',
    '浮尘': 'wind', '扬沙': 'wind', '霾': 'fog', '雾': 'fog', '阴': 'cloud',
  };

  function wxSvg(key, cls) {
    var path = WX_PATH[key] || WX_PATH.thermo;
    return '<svg class="wx-ico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + path + '</svg>';
  }

  function getWeatherIcon(text) {
    if (!text) return wxSvg('thermo');
    for (var key in WEATHER_ICON_MAP) {
      if (text.indexOf(key) >= 0) return wxSvg(WEATHER_ICON_MAP[key]);
    }
    return wxSvg('thermo');
  }

  // 生活指数 → 图标（按名称关键词匹配）
  function indexIconKey(name) {
    var n = name || '';
    if (n.indexOf('运动') >= 0) return 'activity';
    if (n.indexOf('洗车') >= 0) return 'car';
    if (n.indexOf('穿衣') >= 0) return 'shirt';
    if (n.indexOf('紫外线') >= 0) return 'uv';
    if (n.indexOf('旅游') >= 0) return 'pin';
    if (n.indexOf('过敏') >= 0) return 'pollen';
    if (n.indexOf('感冒') >= 0) return 'thermo';
    if (n.indexOf('钓鱼') >= 0) return 'fish';
    if (n.indexOf('晾晒') >= 0) return 'hanger';
    if (n.indexOf('化妆') >= 0) return 'sparkle';
    if (n.indexOf('交通') >= 0) return 'route';
    if (n.indexOf('舒适') >= 0) return 'smile';
    if (n.indexOf('空气') >= 0 || n.indexOf('污染') >= 0 || n.indexOf('扩散') >= 0) return 'wind';
    return 'dot';
  }

  // 把页面里所有 [data-wx-ico] 占位符渲染成对应图标（单一数据源，避免 HTML/JS 各写一份）
  function paintWxIcons(root) {
    var list = (root || document).querySelectorAll('[data-wx-ico]');
    for (var i = 0; i < list.length; i++) {
      list[i].innerHTML = wxSvg(list[i].getAttribute('data-wx-ico'));
    }
  }

  // 空气质量颜色
  function getAqiColor(aqi) {
    if (aqi <= 50) return { bg: 'rgba(82,196,26,0.12)', text: '#52C41A' };
    if (aqi <= 100) return { bg: 'rgba(250,173,20,0.12)', text: '#D48806' };
    if (aqi <= 150) return { bg: 'rgba(250,140,22,0.12)', text: '#D46B08' };
    if (aqi <= 200) return { bg: 'rgba(234,102,104,0.12)', text: '#CF1322' };
    if (aqi <= 300) return { bg: 'rgba(114,46,209,0.12)', text: '#722ED1' };
    return { bg: 'rgba(122,59,27,0.12)', text: '#7A3B1B' };
  }

  // 预警级别颜色
  function getAlertColor(severity) {
    if (!severity) return '#999';
    var s = severity.toLowerCase();
    if (s.indexOf('红') >= 0 || s === 'severe' || s === 'extreme') return '#CF1322';
    if (s.indexOf('橙') >= 0 || s === 'moderate') return '#D46B08';
    if (s.indexOf('黄') >= 0 || s === 'minor') return '#D48806';
    if (s.indexOf('蓝') >= 0) return '#1677FF';
    return '#999';
  }

  // 天气模态框：打开/关闭
  function openWeatherModal() {
    var modal = $('#weatherModal');
    if (modal) modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeWeatherModal() {
    var modal = $('#weatherModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
  }

  function renderWeatherModal(w) {
    if (!w || !w.current) return;
    var cur = w.current;
    var today = (w.daily && w.daily[0]) || {};

    // 模态框标题图标 + 当前天气大图标（SVG，需用 innerHTML）
    if ($('#wModalIcon')) $('#wModalIcon').innerHTML = getWeatherIcon(cur.text);
    if ($('#wModalNowIcon')) $('#wModalNowIcon').innerHTML = getWeatherIcon(cur.text);
    // 当前温度
    if ($('#wModalTemp')) $('#wModalTemp').textContent = cur.temp !== undefined ? Math.round(cur.temp) : '--';
    // 天气描述
    if ($('#wModalDesc')) $('#wModalDesc').textContent = cur.text || '--';
    // 体感
    if ($('#wModalFeels')) {
      var range = '';
      if (today.tmin !== undefined && today.tmax !== undefined) {
        range = Math.round(today.tmin) + '° / ' + Math.round(today.tmax) + '°';
      }
      $('#wModalFeels').textContent = '体感 ' + (cur.feels_like !== undefined ? Math.round(cur.feels_like) + '°' : '--') +
        (range ? ' · ' + range : '');
    }
    // 详细信息
    if ($('#wModalHumidity')) $('#wModalHumidity').textContent = cur.humidity !== undefined ? cur.humidity + '%' : '--';
    if ($('#wModalWind')) $('#wModalWind').textContent = (cur.wind_dir || '') + (cur.wind_scale !== undefined ? cur.wind_scale + '级' : '');
    if ($('#wModalPressure')) $('#wModalPressure').textContent = cur.pressure !== undefined ? Math.round(cur.pressure) + ' hPa' : '--';
    if ($('#wModalVisibility')) $('#wModalVisibility').textContent = cur.visibility !== undefined ? (cur.visibility >= 1000 ? (cur.visibility / 1000).toFixed(1) + ' km' : cur.visibility + ' m') : '--';
    if ($('#wModalUV')) $('#wModalUV').textContent = cur.uv_index !== undefined ? cur.uv_index : '--';
    if ($('#wModalSun')) $('#wModalSun').textContent = (today.sunrise || '--') + ' / ' + (today.sunset || '--');

    // 3天预报
    var forecastEl = $('#wModalForecast');
    if (forecastEl && w.daily) {
      var html = '';
      var todayStr = new Date().toISOString().slice(0, 10);
      w.daily.forEach(function (day, i) {
        var isToday = day.date === todayStr;
        var dateLabel = isToday ? '今天' : (i === 1 ? '明天' : (i === 2 ? '后天' : day.date.slice(5)));
        html += '<div class="weather-forecast-day">' +
          '<div class="weather-forecast-date' + (isToday ? ' today' : '') + '">' + dateLabel + '</div>' +
          '<div class="weather-forecast-icon">' + getWeatherIcon(day.text) + '</div>' +
          '<div class="weather-forecast-temp">' + Math.round(day.tmax) + '° <span class="low">/ ' + Math.round(day.tmin) + '°</span></div>' +
          '<div class="weather-forecast-desc">' + (day.text || '') + '</div>' +
          (day.precip_prob > 0 ? '<div class="weather-forecast-precip">' + wxSvg('humidity', 'wx-ico-xs') + '<span>' + Math.round(day.precip_prob * 100) + '%</span></div>' : '') +
          '</div>';
      });
      forecastEl.innerHTML = html;
    }

    // 空气质量
    var aqi = w.air_quality;
    if (aqi && aqi.aqi !== undefined) {
      var aqiBlock = $('#wModalAqiBlock');
      var colors = getAqiColor(aqi.aqi);
      // 环形表盘：AQI 0–300 映射为 0–100% 弧长（r=18 → 周长 113.1）
      if (aqiBlock) aqiBlock.style.setProperty('--aqi-color', colors.text);
      var aqiArc = $('#wModalAqiArc');
      if (aqiArc) {
        var circ = 2 * Math.PI * 18;
        var pct = Math.max(0.03, Math.min(1, aqi.aqi / 300));
        aqiArc.style.strokeDasharray = circ.toFixed(2);
        aqiArc.style.strokeDashoffset = (circ * (1 - pct)).toFixed(2);
      }
      if ($('#wModalAqiValue')) {
        $('#wModalAqiValue').textContent = aqi.aqi;
        $('#wModalAqiValue').style.color = colors.text;
      }
      if ($('#wModalAqiCategory')) {
        $('#wModalAqiCategory').textContent = aqi.category || '--';
        $('#wModalAqiCategory').style.color = colors.text;
      }
    }

    // 天气指数
    var indicesEl = $('#wModalIndices');
    if (indicesEl && w.indices) {
      var html2 = '';
      w.indices.forEach(function (idx) {
        html2 += '<div class="weather-index-tag" title="' + escapeHtml(idx.text || '') + '">' +
          '<span class="weather-index-ico">' + wxSvg(indexIconKey(idx.name)) + '</span>' +
          '<span class="weather-index-name">' + escapeHtml(idx.name || '') + '</span>' +
          '<span class="weather-index-category">' + escapeHtml(idx.category || '') + '</span>' +
          '</div>';
      });
      indicesEl.innerHTML = html2;
    }

    // 天气预警
    var alertsEl = $('#wModalAlerts');
    if (alertsEl && w.alerts && w.alerts.length > 0) {
      alertsEl.style.display = 'block';
      var html3 = '';
      w.alerts.forEach(function (a) {
        var color = getAlertColor(a.severity);
        html3 += '<div class="weather-alert-item">' +
          '<span class="weather-alert-badge" style="background:' + color + '">' + escapeHtml(a.severity || '预警') + '</span>' +
          '<span class="weather-alert-event">' + escapeHtml(a.event || '') + '</span>' +
          '<span class="weather-alert-sender">' + escapeHtml(a.sender || '') + '</span>' +
          '</div>';
      });
      alertsEl.innerHTML = html3;
    } else if (alertsEl) {
      alertsEl.style.display = 'none';
    }
  }

  // ===== 渲染：待办 =====
  function renderTodos() {
    var container = $('#todoBoard');
    if (state.todos.length === 0) {
      container.innerHTML = '<div class="todo-empty"><div class="todo-empty-icon">' + HS_ICONS.check + '</div><div class="todo-empty-text">还没有待办，加一条开始吧</div></div>';
      return;
    }
    var priorityMap = { '高': 'high', '普通': 'medium', '低': 'low' };
    var active = state.todos.filter(function (t) { return !t.done; });
    var done = state.todos.filter(function (t) { return t.done; });
    // 未完成按优先级排序：高>普通>低，同级按id倒序
    var priorityOrder = { '高': 0, '普通': 1, '低': 2 };
    active.sort(function (a, b) {
      var pa = priorityOrder[a.priority] !== undefined ? priorityOrder[a.priority] : 1;
      var pb = priorityOrder[b.priority] !== undefined ? priorityOrder[b.priority] : 1;
      if (pa !== pb) return pa - pb;
      return (b.id || 0) - (a.id || 0);
    });
    done.sort(function (a, b) { return (b.id || 0) - (a.id || 0); });

    function renderCard(t, i) {
      var p = priorityMap[t.priority] || 'medium';
      return '<div class="todo-card' + (t.done ? ' done' : '') + '" data-id="' + t.id + '" style="animation-delay:' + (i * 0.05) + 's">' +
        '<div class="todo-priority-bar ' + p + '"></div>' +
        '<div class="todo-card-body">' +
        '<button class="todo-card-check" data-action="toggle" data-id="' + t.id + '" aria-label="切换完成"></button>' +
        '<div class="todo-card-content">' +
        '<div class="todo-card-text">' + escapeHtml(t.text) + '</div>' +
        '<div class="todo-card-meta">' +
        '<span class="todo-priority-tag ' + p + '">' + escapeHtml(t.priority || '普通') + '</span>' +
        '<span>' + escapeHtml(t.created || '') + '</span>' +
        '</div></div>' +
        '<div class="todo-card-actions">' +
        (!t.done ? '<button class="todo-card-pomo" data-action="pomo" data-id="' + t.id + '" title="开始 25 分钟专注"><svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="9" y1="2" x2="15" y2="2"/></svg>' + ((pomoCounts[t.id] || 0) > 0 ? ' ×' + pomoCounts[t.id] : '') + '</button>' : '') +
        '<button class="todo-card-delete" data-action="delete" data-id="' + t.id + '" aria-label="删除">×</button>' +
        '</div></div></div>';
    }

    var html = '';
    if (active.length > 0) {
      html += '<div class="todo-group" data-group="active">' +
        '<div class="todo-group-header" data-toggle="active">' +
        '<span class="todo-group-title">进行中</span>' +
        '<span class="todo-group-count">' + active.length + '</span>' +
        '<span class="todo-group-toggle">▼</span></div>' +
        '<div class="todo-group-body">' + active.map(renderCard).join('') + '</div></div>';
    }
    if (done.length > 0) {
      var collapsed = state.todoDoneCollapsed !== false; // 默认折叠
      html += '<div class="todo-group' + (collapsed ? ' collapsed' : '') + '" data-group="done">' +
        '<div class="todo-group-header" data-toggle="done">' +
        '<span class="todo-group-title">已完成</span>' +
        '<span class="todo-group-count">' + done.length + '</span>' +
        '<span class="todo-group-toggle">▼</span></div>' +
        '<div class="todo-group-body">' + done.map(renderCard).join('') + '</div></div>';
    }
    container.innerHTML = html;
  }

  // ===== 渲染：资讯 =====
  function renderNews() {
    var tabsContainer = $('#newsTabs');
    var listContainer = $('#newsList');
    var newsData = (state.news && state.news.data && state.news.data.news) || {};
    // 科技爱好者周刊有独立板块，不在资讯面板里重复出现
    var sources = Object.entries(newsData).filter(function (s) { return s[0] !== 'ruanyf_weekly'; });

    if (sources.length === 0) {
      listContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:48px 0;">暂无资讯，点击右上角「更新资讯」拉取。</div>';
      tabsContainer.innerHTML = '';
      return;
    }

    var tabs = [{ key: 'all', name: '全部' }].concat(sources.map(function (s) { return { key: s[0], name: s[1].name }; }));
    tabsContainer.innerHTML = tabs.map(function (t) {
      return '<button class="news-tab' + (state.activeNewsTab === t.key ? ' active' : '') + '" data-tab="' + t.key + '">' + escapeHtml(t.name) + '</button>';
    }).join('');

    var items = [];
    if (state.activeNewsTab === 'all') {
      sources.forEach(function (s) {
        (s[1].items || []).forEach(function (item) {
          items.push(Object.assign({ _source: s[1].name }, item));
        });
      });
    } else {
      var src = newsData[state.activeNewsTab];
      if (src) {
        (src.items || []).forEach(function (item) {
          items.push(Object.assign({ _source: src.name }, item));
        });
      }
    }

    // 「只看相关」：按后端算好的领域相关度过滤（阈值 30）
    if (state.relevanceOnly) {
      items = items.filter(function (it) { return (it.relevance || 0) >= 30; });
    }

    // 源不可达提示：失败源不再静默消失
    var failed;
    if (state.activeNewsTab === 'all') {
      failed = sources.filter(function (s) { return s[1].ok === false; });
    } else {
      var cur = newsData[state.activeNewsTab];
      failed = (cur && cur.ok === false) ? [[state.activeNewsTab, cur]] : [];
    }

    if (items.length === 0) {
      if (failed.length) {
        var err = (failed[0][1].error || '').replace(/<[^>]+>/g, '');
        listContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px 0;">' +
          '<div>「' + escapeHtml(failed[0][1].name) + '」暂时不可达，已自动重试未成功。</div>' +
          (err ? '<div style="font-size:11px;margin-top:8px;opacity:.7;">' + escapeHtml(err) + '</div>' : '') +
          '<div style="font-size:11px;margin-top:8px;opacity:.7;">点右上角「更新资讯」可再试。</div></div>';
      } else {
        listContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px 0;">这个源今天没抓到东西，换个源看看</div>';
      }
      return;
    }

    var noticeHtml = '';
    if (failed.length && state.activeNewsTab === 'all') {
      noticeHtml = '<div style="color:var(--text-muted);font-size:11.5px;text-align:center;padding:10px 12px;margin-bottom:4px;">' +
        escapeHtml(failed.map(function (s) { return s[1].name; }).join('、')) +
        ' 暂时不可达（已自动重试），其余来源正常。</div>';
    }
    listContainer.innerHTML = noticeHtml + items.map(function (item, i) {
      var title = item.title || '无标题';
      var link = item.link || '#';
      var date = item.date || item.pubDate || item.updated || '';
      var summary = item.summary || item.description || item.content || '';
      if (summary.length > 200) summary = summary.slice(0, 200) + '…';
      return '<a class="news-item" href="' + escapeHtml(link) + '" target="_blank" rel="noopener" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="news-title">' + escapeHtml(title) + '</div>' +
        (item.title_zh ? '<div class="news-title-zh">' + escapeHtml(item.title_zh) + '</div>' : '') +
        '<div class="news-meta"><span>' + escapeHtml(item._source || '') + '</span>' + (date ? '<span>' + escapeHtml(date) + '</span>' : '') +
          (item.pdf ? '<button class="news-transcribe-btn" data-pdf="' + escapeHtml(item.pdf) + '" data-title="' + escapeHtml(item.title_zh || title) + '" title="下载开放获取 PDF 并直接送转写">送转写</button>' : '') +
          '<button class="news-quick-add-btn" data-title="' + escapeHtml(item.title_zh || title) + '" data-title-en="' + escapeHtml(item.title_zh ? title : '') + '" data-url="' + escapeHtml(link) + '" data-summary="' + escapeHtml(summary) + '" data-source="' + escapeHtml(item._source || '') + '" title="只收录标题与摘要到卡片库，不转写全文">收录</button>' +
        '</div>' +
        '<div class="news-flags">' +
          (isAlreadyInLibrary(title) ? '<span class="news-owned">已入库</span>' : '') +
          (item.matched && item.matched.length ? '<span class="news-matched">相关：' + item.matched.map(function (m) { return escapeHtml(m); }).join(' · ') + '</span>' : '') +
        '</div>' +
        (summary ? '<div class="news-summary">' + escapeHtml(summary) + '</div>' : '') +
        '</a>';
    }).join('');
  }

  // ===== 已入库标记：资讯条目 ↔ 卡片库标题匹配 =====
  function titleWords(t) {
    return String(t || '').toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, ' ')
      .split(/\s+/)
      .filter(function (w) { return w.length > 3; });
  }

  function isAlreadyInLibrary(title) {
    var words = titleWords(title);
    if (!words.length) return false;
    for (var i = 0; i < (summaryAll || []).length; i++) {
      var lib = titleWords(summaryAll[i].title).concat(titleWords(summaryAll[i].title_en));
      var common = 0;
      for (var j = 0; j < words.length; j++) {
        if (lib.indexOf(words[j]) >= 0) common++;
      }
      if (common >= 3) return true;   // 3 个以上实词重合即视为同一篇
    }
    return false;
  }

  // ===== 今日工作台（概览顶部动线入口） =====
  function todayStr() {
    var d = new Date();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function todayWeek() {
    return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date().getDay()];
  }

  function renderTodayBoard() {
    var board = $('#todayBoard');
    if (!board) return;

    var pending = (state.todos || []).filter(function (t) { return !t.done; });
    var fr = (state.frontier && state.frontier.items) || [];
    var hs = (state.hotspots && state.hotspots.items) || [];
    var wk = (state.weekly && state.weekly.items) || [];
    var papers = (summaryAll || []).slice(0, 3);
    var today = new Date().toISOString().slice(0, 10);

    var freshCount = 0;
    if (fr.length && fr[0].date === today) freshCount++;
    if (hs.length && hs[0].date === today) freshCount++;

    var html = '';
    html += '<div class="today-head">' +
      '<div class="today-title">今日 · ' + todayStr() + ' ' + todayWeek() + '</div>' +
      '<div class="today-sub">' +
      (pending.length ? '待办 ' + pending.length + ' 项' : '待办已清空') +
      ' · ' + (freshCount ? '今日新出 ' + freshCount + ' 份情报' : '情报今日暂无更新') +
      ' · 卡片库 ' + (summaryAll || []).length + ' 篇' +
      '</div>' +
      '</div>';

    html += '<div class="today-grid">';

    // 1. 今日待办
    html += '<div class="today-col">' +
      '<div class="today-col-head">今日待办<span class="today-count">' + pending.length + '</span></div>';
    if (!pending.length) {
      html += '<div class="today-empty">没有未完成的待办</div>';
    } else {
      html += pending.slice(0, 4).map(function (t, i) {
        return '<div class="today-todo" data-goto="todos">' +
          '<span class="today-todo-dot"></span>' +
          '<span class="today-todo-text">' + escapeHtml(t.text) + '</span>' +
          '</div>';
      }).join('');
      if (pending.length > 4) {
        html += '<div class="today-more" data-goto="todos">还有 ' + (pending.length - 4) + ' 项…</div>';
      }
    }
    html += '</div>';

    // 2. 今日情报
    html += '<div class="today-col">' +
      '<div class="today-col-head">今日情报</div>';
    var feeds = [];
    if (fr.length) feeds.push({ panel: 'frontier', name: '前沿瞭望', latest: fr[0].date, isNew: fr[0].date === today });
    if (hs.length) feeds.push({ panel: 'hotspots', name: '热点日报', latest: hs[0].date + ' ' + (hs[0].session || ''), isNew: hs[0].date === today });
    if (wk.length) feeds.push({ panel: 'weekly', name: '科技周报', latest: '第 ' + wk[0].issue + ' 期', isNew: false });
    if (!feeds.length) {
      html += '<div class="today-empty">最近还没有情报归档</div>';
    } else {
      html += feeds.map(function (f) {
        return '<div class="today-feed" data-goto="' + f.panel + '">' +
          (f.isNew ? '<span class="today-new">新</span>' : '') +
          '<span class="today-feed-name">' + escapeHtml(f.name) + '</span>' +
          '<span class="today-feed-latest">' + escapeHtml(f.latest) + '</span>' +
          '</div>';
      }).join('');
    }
    html += '</div>';

    // 3. 最近论文
    html += '<div class="today-col">' +
      '<div class="today-col-head">最近论文<span class="today-count">' + (summaryAll || []).length + '</span></div>';
    if (!papers.length) {
      html += '<div class="today-empty">卡片库还是空的</div>';
    } else {
      html += papers.map(function (s) {
        var t = s.title || s.title_en || '未命名论文';
        return '<div class="today-paper" data-goto="summaries">' +
          '<span class="today-paper-title">' + escapeHtml(t) + '</span>' +
          '<span class="today-paper-date">' + escapeHtml((s.created_at || '').slice(0, 10)) + '</span>' +
          '</div>';
      }).join('');
    }
    html += '</div>';

    html += '</div>';
    board.innerHTML = html;
  }

  // ===== 资讯：开放获取条目一键送转写（bioRxiv / medRxiv 等） =====
  function sendToTranscribe(url, title) {
    toast('正在下载 PDF 并入队转写…');
    api('/api/pdf/from-url', {
      method: 'POST',
      body: JSON.stringify({ url: url, title: title, source: '资讯' })
    }).then(function (d) {
      if (!d.ok) { toast('送转写失败：' + (d.error || '未知错误')); return; }
      toast('已入队，正在转写（' + (Math.round(d.size / 1048576 * 10) / 10) + ' MB）');
      state.pdf.title = title || '';
      state.pdf.jobId = d.jobId;
      switchPanel('pdf');
      if (typeof pollPdfStatus === 'function') pollPdfStatus();
    }).catch(function () {
      toast('送转写失败：请求异常');
    });
  }

  // ===== 资讯：一键轻收录（只存元数据入卡片库，不转写全文） =====
  function quickAddFromNews(ds) {
    api('/api/pdf/summary/quick-add', {
      method: 'POST',
      body: JSON.stringify({
        title: ds.title || '',
        title_en: ds.titleEn || '',
        url: ds.url || '',
        abstract: ds.summary || '',
        source: ds.source || '资讯'
      })
    }).then(function (d) {
      if (!d.ok) { toast('收录失败：' + (d.error || '未知错误')); return; }
      toast('已收进卡片库，只存了标题和摘要');
      if (typeof loadSummaryCards === 'function') loadSummaryCards();
    }).catch(function () { toast('收录失败：请求异常'); });
  }

  // ===== 渲染：科技爱好者周刊（hs-item 归档风格，与其余日报面板统一） =====
  function loadWeekly(force) {
    var container = $('#weeklyList');
    if (!container) return;
    return api('/api/weekly' + (force ? '?refresh=1' : '')).then(function (data) {
      state.weekly = data;
      renderWeekly();
      renderTodayBoard(); renderWeekReview();
    }).catch(function () {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.weekly + '</div>' +
        '<div class="hs-empty-text">周刊加载失败</div>' +
        '<div class="hs-empty-hint">点上方「刷新」重试；数据来自 GitHub 开源仓库，需要网络可达</div>' +
        '</div>';
    });
  }

  // ===== 侧栏「未读」徽标：期刊类面板显示未读篇数（红），点开即已读 =====
  // 阅读记录只存「读到哪个最新标识」，不逐条记状态：够用且零维护
  function readMark(key) {
    try { return localStorage.getItem('wb_read_' + key) || ''; } catch (e) { return ''; }
  }

  function setReadMark(key, latest) {
    try { if (latest) localStorage.setItem('wb_read_' + key, latest); } catch (e) {}
  }

  // items 需按「新 → 旧」排列；keyOf 返回可字典序比较的标识（文件名 / 补零期号）
  function applyUnreadBadge(badge, storeKey, panelName, items, keyOf) {
    if (!badge) return;
    var list = items || [];
    if (!list.length) {
      badge.hidden = true;
      badge.style.display = 'none';
      badge.classList.remove('is-unread');
      return;
    }
    var latest = String(keyOf(list[0]) || '');
    var viewing = (state.panel === panelName);   // 正看着这个面板 → 视为已读
    if (viewing && latest) setReadMark(storeKey, latest);
    var mark = viewing ? latest : readMark(storeKey);
    var unread = 0;
    if (mark) {
      list.forEach(function (it) { if (String(keyOf(it) || '') > mark) unread++; });
    } else {
      unread = list.length;   // 从未打开过 → 全部算未读
    }
    badge.hidden = false;
    badge.style.display = '';
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.classList.add('is-unread');
      badge.title = unread + ' 篇未读，点开即标记已读';
    } else {
      badge.textContent = String(list.length);
      badge.classList.remove('is-unread');
      badge.title = '共 ' + list.length + ' 篇，已读完';
    }
  }

  // 用内存里已加载的数据重算三个期刊徽标（切面板时立即消红点）。
  // 只在对应数据已加载时更新——否则会把「还没加载」误当成「没有内容」而藏掉徽标。
  function refreshUnreadBadges() {
    if (state.frontier) {
      applyUnreadBadge($('#navFrontierBadge'), 'frontier', 'frontier',
        state.frontier.items || [], function (it) { return it.file || ''; });
    }
    if (state.hotspots) {
      applyUnreadBadge($('#navHotspotBadge'), 'hotspots', 'hotspots',
        state.hotspots.items || [], function (it) { return it.file || ''; });
    }
    if (state.weekly) {
      applyUnreadBadge($('#navWeeklyBadge'), 'weekly', 'weekly',
        state.weekly.items || [], function (it) { return String(it.issue || '').padStart(4, '0'); });
    }
  }

  // 周刊发布日期文案：源文件里没有日期，后端从该期文件的提交记录取。
  // 用户曾因看不到日期而误以为列表是「当期」，故明确标注发布日 + 相对时间。
  function weeklyDateLabel(dateStr) {
    var s = String(dateStr || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '每周五更新';
    var d = new Date(s + 'T00:00:00');
    if (isNaN(d.getTime())) return '每周五更新';
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    var rel;
    if (days <= 0) rel = '今天';
    else if (days === 1) rel = '昨天';
    else if (days < 7) rel = days + ' 天前';
    else rel = Math.floor(days / 7) + ' 周前';
    return s + ' 发布 · ' + rel;
  }

  function renderWeekly() {
    var container = $('#weeklyList');
    if (!container) return;
    var d = state.weekly || {};
    var items = d.items || [];
    refreshUnreadBadges();   // 徽标归侧栏统一管：未读红点 / 已读总数
    if (!items.length) {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.weekly + '</div>' +
        '<div class="hs-empty-text">还没抓到周刊</div>' +
        '<div class="hs-empty-hint">' + (d.ok === false ? '仓库暂时不可达，点上方「刷新」重试。' : '点上方「刷新」拉取最新一期。') + '</div>' +
        '</div>';
      return;
    }
    container.innerHTML = items.map(function (item, i) {
      var topic = item.topic || '';
      var title = topic || ('科技爱好者周刊 · 第 ' + (item.issue || '') + ' 期');
      return '<a class="hs-item" href="' + escapeHtml(item.link || '#') + '" target="_blank" rel="noopener" style="animation-delay:' + (i * 0.04) + 's">' +
        '<span class="hs-session hs-session-wk">第 ' + escapeHtml(String(item.issue || '?')) + ' 期</span>' +
        '<div class="hs-item-main">' +
          '<div class="hs-item-title">' + escapeHtml(title) + '</div>' +
          '<div class="hs-item-meta">阮一峰 · ' + escapeHtml(weeklyDateLabel(item.date)) + '</div>' +
        '</div>' +
        '<div class="hs-item-arrow">阅读原文 ↗</div>' +
        '</a>';
    }).join('');
  }

  // ===== 渲染：文件夹 =====
  function renderSections() {
    var container = $('#sectionsGrid');
    var sections = (state.overview && state.overview.sections) || [];
    container.innerHTML = sections.map(function (s, i) {
      var icon = SECTION_ICONS[s.folder] || SECTION_ICONS['08_临时中转'];
      return '<div class="section-card" data-path="' + escapeHtml(s.folder) + '" style="animation-delay:' + (i * 0.06) + 's">' +
        '<div class="section-icon">' + icon + '</div>' +
        '<div class="section-name">' + escapeHtml(s.label) + '</div>' +
        '<div class="section-path">' + escapeHtml(s.folder) + '/</div>' +
        '<div class="section-stats"><span>' + s.count + '</span> 个文件</div>' +
        '</div>';
    }).join('');
  }

  // ===== 渲染：研究日志（时间线） =====
  function renderJournalTypeFilters() {
    var container = $('#journalTypeFilters');
    var types = ['全部', '日常', '想法', '问题', '进展'];
    var counts = { '全部': state.journal.length };
    state.journal.forEach(function (j) {
      var t = j.type || '日常';
      counts[t] = (counts[t] || 0) + 1;
    });
    container.innerHTML = types.map(function (t) {
      return '<button class="journal-filter' + (state.journalTypeFilter === t ? ' active' : '') + '" data-type="' + t + '">' + t + (counts[t] ? ' (' + counts[t] + ')' : '') + '</button>';
    }).join('');
  }

  function renderJournal() {
    renderJournalTypeFilters();
    var container = $('#journalTimeline');
    if (state.journal.length === 0) {
      container.innerHTML = '<div class="todo-empty"><div class="todo-empty-icon">' + HS_ICONS.journal + '</div><div class="todo-empty-text">还没有日志记录，写下第一条吧</div></div>';
      return;
    }
    var items = state.journal;
    if (state.journalTypeFilter && state.journalTypeFilter !== '全部') {
      items = items.filter(function (j) { return (j.type || '日常') === state.journalTypeFilter; });
    }
    if (items.length === 0) {
      container.innerHTML = '<div class="todo-empty"><div class="todo-empty-text">该类型暂无日志</div></div>';
      return;
    }
    container.innerHTML = items.map(function (j, i) {
      var type = j.type || '日常';
      return '<div class="timeline-item" style="animation-delay:' + (i * 0.08) + 's">' +
        '<div class="timeline-dot"></div>' +
        '<div class="journal-card">' +
        '<div class="journal-card-head">' +
        '<span class="journal-card-date">' + escapeHtml(j.date || j.created || '') + '</span>' +
        '<span class="journal-type-tag ' + type + '">' + escapeHtml(type) + '</span>' +
        '<button class="journal-delete-btn" data-action="delete-journal" data-id="' + j.id + '" aria-label="删除日志">×</button>' +
        '</div>' +
        '<div class="journal-card-text">' + renderJournalText(j.content) + '</div>' +
        '</div></div>';
    }).join('');
  }

  // ============================================================
  // 文献工具：期刊地图
  // ============================================================
  function renderJournalFilters() {
    var container = $('#journalFilters');
    if (!state.lit.journals) return;
    var layers = [];
    var seen = {};
    state.lit.journals.items.forEach(function (j) {
      var label = j.layer_label || ('第' + j.layer + '层');
      if (!seen[label]) { seen[label] = true; layers.push({ key: j.layer, label: label }); }
    });
    var html = '<button class="journal-filter' + (state.journalFilter === 'all' ? ' active' : '') + '" data-filter="all">全部 (' + state.lit.journals.items.length + ')</button>';
    layers.forEach(function (l) {
      var count = state.lit.journals.items.filter(function (j) { return j.layer === l.key; }).length;
      html += '<button class="journal-filter' + (state.journalFilter === l.key ? ' active' : '') + '" data-filter="' + l.key + '">' + escapeHtml(l.label) + ' (' + count + ')</button>';
    });
    container.innerHTML = html;
  }

  function renderJournals() {
    var container = $('#journalGrid');
    if (!state.lit.journals) return;
    var items = state.lit.journals.items;
    if (state.journalFilter !== 'all') {
      items = items.filter(function (j) { return j.layer === state.journalFilter; });
    }
    if (items.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:32px;">这个分类下还没有期刊</div>';
      return;
    }
    container.innerHTML = items.map(function (j, i) {
      var metrics = j.metrics || {};
      var sjr = metrics.sjr ? metrics.sjr : '—';
      var h = metrics.h_index ? metrics.h_index : '—';
      return '<div class="journal-card" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="journal-card-head">' +
        '<div class="journal-name">' + (j.url ? '<a href="' + escapeHtml(j.url) + '" target="_blank" rel="noopener">' + escapeHtml(j.name) + '</a>' : escapeHtml(j.name)) + '</div>' +
        '<span class="journal-layer-tag">' + escapeHtml(j.layer_label || '') + '</span>' +
        '</div>' +
        '<div class="journal-publisher">' + escapeHtml(j.publisher || '') + (j.oa_mode ? ' · ' + escapeHtml(j.oa_mode) : '') + '</div>' +
        '<div class="journal-metrics">' +
        (sjr !== '—' ? '<span>SJR <strong>' + escapeHtml(String(sjr)) + '</strong></span>' : '') +
        (h !== '—' ? '<span>h-index <strong>' + escapeHtml(String(h)) + '</strong></span>' : '') +
        (j.frequency ? '<span>' + escapeHtml(j.frequency) + '</span>' : '') +
        '</div>' +
        (j.scope ? '<div class="journal-scope">' + escapeHtml(j.scope) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ============================================================
  // 文献工具：术语表
  // ============================================================
  function renderGlossary() {
    var container = $('#glossaryList');
    if (!state.lit.glossary) return;
    var items = state.lit.glossary.items;
    var q = state.glossaryQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(function (g) {
        return (g.term || '').toLowerCase().indexOf(q) > -1 ||
          (g.full_name || '').toLowerCase().indexOf(q) > -1 ||
          (g.zh || '').toLowerCase().indexOf(q) > -1 ||
          (g.plain_explanation || '').toLowerCase().indexOf(q) > -1;
      });
    }
    if (items.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px;">没有匹配的术语，换个说法试试</div>';
      return;
    }
    container.innerHTML = items.map(function (g, i) {
      return '<div class="glossary-item" style="animation-delay:' + (i * 0.03) + 's">' +
        '<div class="glossary-term">' + escapeHtml(g.term || '') + '</div>' +
        (g.full_name && g.full_name !== '—' ? '<div class="glossary-full">' + escapeHtml(g.full_name) + '</div>' : '') +
        (g.zh && g.zh !== '—' ? '<div class="glossary-zh">' + escapeHtml(g.zh) + '</div>' : '') +
        (g.plain_explanation ? '<div class="glossary-explain">' + escapeHtml(g.plain_explanation) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ============================================================
  // 文献工具：检索式库
  // ============================================================
  function renderQueries() {
    var container = $('#queryList');
    if (!state.lit.queries) return;
    container.innerHTML = state.lit.queries.items.map(function (q, i) {
      return '<div class="query-item" style="animation-delay:' + (i * 0.05) + 's">' +
        '<div class="query-label">' + escapeHtml(q.label || '') + '</div>' +
        '<div class="query-code">' + escapeHtml(q.query || '') + '</div>' +
        '<div class="query-meta">' +
        (q.returned_count ? '<span class="count">返回 ' + q.returned_count + ' 条</span>' : '') +
        (q.verified_on ? '<span>验证于 ' + escapeHtml(q.verified_on) + '</span>' : '') +
        '<button class="btn-copy" data-query="' + i + '">复制</button>' +
        '</div>' +
        (q.purpose ? '<div class="query-purpose">' + escapeHtml(q.purpose) + '</div>' : '') +
        (q.query_syntax_note ? '<div class="query-purpose" style="color:var(--text-muted);">语法：' + escapeHtml(q.query_syntax_note) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ============================================================
  // 文献工具：arXiv 追踪（领域可在 server.py 里配，按需拉取）
  // ============================================================
  function loadArxiv(force) {
    return api('/api/lit/arxiv' + (force ? '?refresh=1' : '')).then(function (data) {
      state.lit.arxiv = data;
      renderArxiv();
    });
  }

  function renderArxiv() {
    var container = $('#arxivList');
    if (!container || !state.lit.arxiv) return;
    var d = state.lit.arxiv;
    if (!d.ok) {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.signal + '</div>' +
        '<div class="hs-empty-text">arXiv 暂时连不上</div>' +
        '<div class="hs-empty-hint">' + escapeHtml(d.error || '网络层受阻') + '<br>arXiv 出口网络恢复后点「刷新」即可；不影响其他文献工具</div>' +
        '</div>';
      return;
    }
    if (!d.items.length) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px;">暂无条目</div>';
      return;
    }
    container.innerHTML = d.items.map(function (p, i) {
      return '<div class="arxiv-item" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="arxiv-main">' +
        '<a class="arxiv-title" href="' + escapeHtml(p.link) + '" target="_blank" rel="noopener">' + escapeHtml(p.title) + '</a>' +
        (p.summary ? '<div class="arxiv-abs">' + escapeHtml(p.summary) + '</div>' : '') +
        '<div class="arxiv-meta">' +
        '<span class="arxiv-id">' + escapeHtml((p.link || '').replace('http://arxiv.org/abs/', 'arXiv:').replace('https://arxiv.org/abs/', 'arXiv:')) + '</span>' +
        (p.authors ? '<span>' + escapeHtml(p.authors) + '</span>' : '') +
        '<span>' + escapeHtml(p.date || '') + '</span>' +
        '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  // ============================================================
  // 前沿瞭望（双通道学术雷达，报纸风归档，每期独立 HTML）
  // ============================================================
  // 归档报纸注入工具：每期 HTML 的 <style> 在 <head> 里，只注入 body 会丢样式；
  // 这里把 <style> 提取出来、将选择器限定在 frame 容器内再一并注入——
  // 面板内保持原版式、不污染工作台全局，且样式随 frame.innerHTML 清空而自动移除。
  function extractStyleCss(html) {
    var out = '', re = /<style[^>]*>([\s\S]*?)<\/style>/gi, m;
    while ((m = re.exec(html)) !== null) out += m[1] + '\n';
    return out;
  }
  function scopeCssText(css, scopeSel) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    function scopeSelectors(sel) {
      var parts = sel.split(',').map(function (s) {
        s = s.trim();
        if (!s || /^@/.test(s)) return s;
        if (s === 'html' || s === 'body' || s === ':root' || s === 'html body') return scopeSel;
        if (s === '*') return scopeSel + ' *';
        if (s.indexOf(scopeSel) === 0) return s;
        return scopeSel + ' ' + s;
      }).filter(function (x) { return x; });
      return parts.join(', ');
    }
    function walk(text) {
      var out = '', i = 0, n = text.length;
      while (i < n) {
        var bracePos = text.indexOf('{', i);
        if (bracePos === -1) { out += text.slice(i); break; }
        var prelude = text.slice(i, bracePos).trim();
        if (/^@import/i.test(prelude)) {
          var semi = text.indexOf(';', i);
          if (semi === -1) { out += text.slice(i); break; }
          out += text.slice(i, semi + 1); i = semi + 1; continue;
        }
        var depth = 1, j = bracePos + 1;
        while (j < n && depth > 0) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
        if (j > n) { out += text.slice(i); break; }
        var block = text.slice(bracePos + 1, j - 1);
        if (/^@(media|supports)/i.test(prelude)) {
          out += prelude + '{' + walk(block) + '}';
        } else if (/^@/i.test(prelude)) {
          out += text.slice(i, j); // @keyframes / @font-face 等不含页面选择器，原样保留
        } else {
          var scoped = scopeSelectors(prelude);
          out += (scoped || prelude) + '{' + block + '}';
        }
        i = j;
      }
      return out;
    }
    return walk(css);
  }
  // 归档刊物（前沿瞭望 / 热点日报）是自带样式的独立 HTML，颜色写死为亮色报纸配色，
  // 所以切暗色时外壳变了、文章里不变。这里做一份「暗色重映射」，与亮色版一起注入：
  // 暗色版整体挂在 [data-theme="dark"] 前缀下，切主题由浏览器自动切换，无需重刷。
  var PAPER_DARK_MAP = {
    '#fbfaf5': '#14171a', '#f5f3ee': '#181c1f', '#f0eee5': '#1d2225', '#efece3': '#212629',
    '#1b1e1d': '#e7e5e0', '#2b2f2d': '#c7ccc8', '#4b5350': '#a6aea9', '#8a938e': '#7f8884',
    '#d8d4c6': '#2c3236', '#0f766e': '#5eead4', '#b45309': '#f0b429', '#2563eb': '#6cb2ff',
    '#059669': '#34d399', '#dc2626': '#f87171'
  };

  function darkenPaperCss(css) {
    return css.replace(/#[0-9a-fA-F]{6}\b/g, function (c) {
      return darkenPaperHex(c);
    }).replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g,
      function (m, r, g, b, a) {
        // 亮色刊物里的浅阴影（中灰 + 低透明度）在暗底上等于看不见，改成暗阴影
        var lum = (Number(r) + Number(g) + Number(b)) / 3;
        if (lum > 30 && Number(a) < 0.6) return 'rgba(0, 0, 0, 0.5)';
        return m;
      });
  }

  // 已知的设计系统色优先用精选暗色值；未命中的（各期模板色值不完全一致，
  // 如热点日报用 #fbf6e7 / #141414）按亮度与色差自动推断，保证不漏。
  function _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  }

  function _hslToHex(h, s, l) {
    function f(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
      r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
    }
    function to(x) { var v = Math.round(x * 255); return (v < 16 ? '0' : '') + v.toString(16); }
    return '#' + to(r) + to(g) + to(b);
  }

  function darkenPaperHex(hex) {
    var key = hex.toLowerCase();
    if (PAPER_DARK_MAP[key]) return PAPER_DARK_MAP[key];
    var r = parseInt(key.slice(1, 3), 16), g = parseInt(key.slice(3, 5), 16), b = parseInt(key.slice(5, 7), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return hex;
    var hsl = _rgbToHsl(r, g, b), h = hsl[0], s = hsl[1], l = hsl[2];
    var chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;   // 相对色差，比 HSL 饱和度更靠谱
    if (chroma > 0.18) {
      // 有彩色（品牌 / 语义色）：保住色相，提亮到暗底上看得清的明度
      return _hslToHex(h, Math.max(s, 0.5), Math.min(0.8, Math.max(l, 0.68)));
    }
    // 无彩色：亮纸底压到暗面，墨色提成亮字，中间灰按亮度半反转
    var nl;
    if (l > 0.75) nl = 0.07 + (1 - l) * 0.25;
    else if (l > 0.25) nl = 0.5 + (0.5 - l) * 0.55;
    else nl = 0.88 - l * 0.45;
    return _hslToHex(h, Math.min(s, 0.18), nl);
  }

  function injectArchivedPaper(frame, html) {
    var bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    var content = bodyMatch ? bodyMatch[1] : html;
    var css = extractStyleCss(html);
    var styleHtml = '';
    if (css && frame.id) {
      var light = scopeCssText(css, '#' + frame.id);
      var dark = scopeCssText(darkenPaperCss(css), '[data-theme="dark"] #' + frame.id);
      styleHtml = '<style data-paper-scope="' + frame.id + '">' + light + '\n' + dark + '</style>';
    }
    frame.innerHTML = styleHtml + content;
  }

  function renderFrontier() {
    var container = $('#frontierList');
    if (!container) return;
    var items = (state.frontier && state.frontier.items) || [];
    refreshUnreadBadges();   // 徽标归侧栏统一管：未读红点 / 已读总数
    if (items.length === 0) {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.frontier + '</div>' +
        '<div class="hs-empty-text">前沿瞭望还没出过一期</div>' +
        '<div class="hs-empty-hint">每天自动生成一期；也可将报纸风 HTML 放入 09_工作台程序/data/frontier/ 目录（命名 YYYY-MM-DD.html）</div>' +
        '</div>';
      return;
    }
    var lastDate = null;
    var html = [];
    items.forEach(function (d, i) {
      if (d.date !== lastDate) {
        if (lastDate !== null) html.push('</div>');
        html.push('<div class="hs-day-group"><div class="hs-day-label">' + escapeHtml(d.date) + '</div>');
        lastDate = d.date;
      }
      var sizeKb = (d.size / 1024).toFixed(1);
      html.push(
        '<div class="hs-item" data-file="' + escapeHtml(d.file) + '" style="animation-delay:' + (i * 0.04) + 's">' +
          '<span class="hs-session hs-session-fr">双通道</span>' +
          '<div class="hs-item-main">' +
            '<div class="hs-item-title">前沿瞭望 · ' + escapeHtml(d.date) + '</div>' +
            '<div class="hs-item-meta">' + sizeKb + ' KB · 归档于 ' + escapeHtml(d.modified || '') + '</div>' +
          '</div>' +
          '<div class="hs-item-arrow">展开 →</div>' +
        '</div>'
      );
    });
    html.push('</div>');
    container.innerHTML = html.join('');
  }

  function openFrontier(file) {
    var url = '/frontier/' + encodeURIComponent(file);
    $('#frontierOpenTab').href = url;
    $('#frontierDetailTitle').textContent = '前沿瞭望 · ' + file.replace(/\.html$/, '');
    $('#frontierListView').style.display = 'none';
    $('#frontierDetailView').style.display = 'block';
    pushReportHash('frontier', file);
    var frame = $('#frontierFrame');
    frame.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">加载中…</div>';
    // fetch HTML，提取 body 内容直接注入（自动继承工作台主题）
    fetch(url).then(function (resp) { return resp.text(); }).then(function (html) {
      injectArchivedPaper(frame, html);
    }).catch(function () {
      frame.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--danger);">加载失败，请返回重试</div>';
    });
    var scrollBox = document.querySelector('.main-content') || document.querySelector('.main');
    if (scrollBox) scrollBox.scrollTop = 0;
  }

  function closeFrontier() {
    $('#frontierFrame').innerHTML = '';
    $('#frontierListView').style.display = 'block';
    $('#frontierDetailView').style.display = 'none';
  }

  // ============================================================
  // 热点日报（报纸风归档，每期独立 HTML，iframe 原版式渲染）
  // ============================================================
  function loadHotspots() {
    return api('/api/hotspots').then(function (data) {
      state.hotspots = data;
      renderHotspots();
      renderTodayBoard(); renderWeekReview();
    });
  }

  function renderHotspots() {
    var container = $('#hotspotList');
    if (!container) return;
    var items = (state.hotspots && state.hotspots.items) || [];
    refreshUnreadBadges();   // 徽标归侧栏统一管：未读红点 / 已读总数
    if (items.length === 0) {
      container.innerHTML =
        '<div class="hs-empty">' +
        '<div class="hs-empty-icon">' + HS_ICONS.hotspot + '</div>' +
        '<div class="hs-empty-text">热点日报还没出过一期</div>' +
        '<div class="hs-empty-hint">定时任务每天 10:00 / 16:00 自动生成；也可将报纸风 HTML 放入 09_工作台程序/data/hotspots/ 目录</div>' +
        '</div>';
      return;
    }
    var lastDate = null;
    var html = [];
    items.forEach(function (d, i) {
      if (d.date !== lastDate) {
        if (lastDate !== null) html.push('</div>');
        html.push('<div class="hs-day-group"><div class="hs-day-label">' + escapeHtml(d.date) + '</div>');
        lastDate = d.date;
      }
      var sizeKb = (d.size / 1024).toFixed(1);
      var isAm = d.session.indexOf('上午') !== -1;
      html.push(
        '<div class="hs-item" data-file="' + escapeHtml(d.file) + '" style="animation-delay:' + (i * 0.04) + 's">' +
          '<span class="hs-session ' + (isAm ? 'hs-session-am' : 'hs-session-pm') + '">' + escapeHtml(d.session || '日报') + '</span>' +
          '<div class="hs-item-main">' +
            '<div class="hs-item-title">热点日报 · ' + escapeHtml(d.date) + ' ' + escapeHtml(d.session || '') + '</div>' +
            '<div class="hs-item-meta">' + sizeKb + ' KB · 归档于 ' + escapeHtml(d.modified || '') + '</div>' +
          '</div>' +
          '<div class="hs-item-arrow">展开 →</div>' +
        '</div>'
      );
    });
    html.push('</div>');
    container.innerHTML = html.join('');
  }

  function openHotspot(file) {
    var url = '/hotspot/' + encodeURIComponent(file);
    $('#hotspotOpenTab').href = url;
    var stem = file.replace(/\.html$/, '');
    $('#hotspotDetailTitle').textContent = '热点日报 · ' + stem;
    $('#hotspotsListView').style.display = 'none';
    $('#hotspotsDetailView').style.display = 'block';
    pushReportHash('hotspots', file);
    var frame = $('#hotspotFrame');
    frame.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">加载中…</div>';
    // fetch HTML，提取 body 内容直接注入（不再用 iframe，自动继承工作台主题）
    fetch(url).then(function (resp) { return resp.text(); }).then(function (html) {
      injectArchivedPaper(frame, html);
    }).catch(function () {
      frame.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--danger);">加载失败，请返回重试</div>';
    });
    var scrollBox = document.querySelector('.main-content') || document.querySelector('.main');
    if (scrollBox) scrollBox.scrollTop = 0;
  }

  function closeHotspot() {
    $('#hotspotFrame').innerHTML = '';
    $('#hotspotsListView').style.display = 'block';
    $('#hotspotsDetailView').style.display = 'none';
  }

  // ============================================================
  // PDF 转写（双引擎：本地 MinerU / 云端加速）
  // ============================================================
  // 文件上限（与引擎卡片标注一致；云端 Precision 官方限制 200MB/200页）
  var PDF_LIMITS = { cloud: { mb: 200 }, local: { mb: 500 } };

  function formatBytes(n) {
    if (n === null || n === undefined) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  // 校验文件格式与大小，返回 {ok, msg}
  function validatePdfFile(file, engine) {
    var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) return { ok: false, msg: '仅支持 PDF 格式' };
    var limit = (PDF_LIMITS[engine] || PDF_LIMITS.local).mb;
    var sizeMb = file.size / 1024 / 1024;
    if (sizeMb > limit) {
      return { ok: false, msg: '文件 ' + sizeMb.toFixed(1) + 'MB，超出' + (engine === 'cloud' ? '云端' : '本地') + '上限 ' + limit + 'MB' };
    }
    return { ok: true, msg: '' };
  }

  function showPdfFileError(msg) {
    var el = $('#pdfFileError');
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; }
    else { el.hidden = true; el.textContent = ''; }
  }

  function checkPdfHealth() {
    api('/api/pdf/health').then(function (d) {
      state.pdf.health = d;
      renderPdfHealth();
    }).catch(function () {
      state.pdf.health = { ok: false, local: false, cloud: false, down: true };
      renderPdfHealth();
    });
  }

  function renderPdfHealth() {
    var h = state.pdf.health;
    var statusEl = $('#pdfWorkerStatus');
    applyPdfModelLabels();
    if (!h || !statusEl) return;
    var cloudRadio = document.querySelector('input[name="pdfEngine"][value="cloud"]');
    if (h.down) {
      statusEl.textContent = '转写引擎未启动（worker 8766）';
      statusEl.className = 'pdf-worker-status bad';
    } else {
      statusEl.textContent = (h.local ? '本地就绪' : '本地未就绪') + ' · ' + (h.cloud ? '云端就绪' : '云端未配置');
      statusEl.className = 'pdf-worker-status ' + ((h.local || h.cloud) ? 'ok' : 'bad');
    }
    if (cloudRadio) {
      cloudRadio.disabled = !h.cloud;
      var cloudLabel = cloudRadio.closest('.pdf-engine-opt');
      if (cloudLabel) cloudLabel.classList.toggle('disabled', !h.cloud);
      if (!h.cloud && cloudRadio.checked) {
        var localRadio = document.querySelector('input[name="pdfEngine"][value="local"]');
        if (localRadio && h.local) localRadio.checked = true;
      }
    }
    checkPdfTokenReminder();
    updatePdfStartState();
  }

  // MinerU Token 90天到期提醒：最后10天在面板显示 banner，每天首次进入弹一次 toast
  function checkPdfTokenReminder() {
    var banner = $('#pdfTokenBanner');
    var textEl = $('#pdfTokenText');
    if (!banner || !textEl) return;
    var h = state.pdf.health;
    var token = h && h.token;
    if (!token || typeof token.daysLeft !== 'number' || token.daysLeft > 10) {
      banner.hidden = true;
      return;
    }
    var days = token.daysLeft;
    banner.className = 'pdf-token-banner' + (days <= 3 ? ' urgent' : '');
    textEl.textContent = 'MinerU 云端 Token 还有 ' + days + ' 天到期（' + token.expiresAt + '），请及时更新，否则云端加速将不可用。';
    banner.hidden = false;
    // 每天第一次进入 PDF 面板时弹一次 toast（不重复打扰）
    var today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('pdf_token_reminded_date') !== today) {
      localStorage.setItem('pdf_token_reminded_date', today);
      setTimeout(function () { toast('注意：MinerU Token 还有 ' + days + ' 天到期，请及时更新'); }, 800);
    }
  }

  function getPdfEngine() {
    var r = document.querySelector('input[name="pdfEngine"]:checked');
    return r ? r.value : 'local';
  }

  function updatePdfStartState() {
    var btn = $('#pdfStartBtn');
    if (!btn) return;
    var h = state.pdf.health;
    var engineOk = !!h && !h.down && (getPdfEngine() === 'local' ? !!h.local : !!h.cloud);
    var fileOk = !!state.pdf.file && (!state.pdf.file || validatePdfFile(state.pdf.file, getPdfEngine()).ok);
    btn.disabled = !fileOk || state.pdf.running || !engineOk;
    btn.textContent = state.pdf.running ? '转写中…' : '开始转写';
  }

  function handlePdfFile(file) {
    if (!file) return;
    var engine = getPdfEngine();
    var v = validatePdfFile(file, engine);
    if (!v.ok) {
      toast(v.msg);
      showPdfFileError(v.msg);
      return;
    }
    showPdfFileError('');
    state.pdf.file = file;
    state.pdf.title = '';
    $('#pdfFileName').textContent = file.name;
    $('#pdfFileMeta').textContent = formatBytes(file.size);
    $('#pdfFileInfo').hidden = false;
    $('#pdfDropzone').classList.add('has-file');
    updatePdfStartState();
  }

  function clearPdfFile() {
    if (state.pdf.running) return;
    state.pdf.file = null;
    state.pdf.title = '';
    $('#pdfFileInput').value = '';
    $('#pdfFileInfo').hidden = true;
    $('#pdfDropzone').classList.remove('has-file');
    showPdfFileError('');
    updatePdfStartState();
  }

  function setPdfProgress(pct) {
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    // 服务端按阶段给基准百分比；前端蠕动值不回退，避免看着焦虑
    if (pct < state.pdf.progress && pct < 99) pct = state.pdf.progress;
    state.pdf.progress = pct;
    var fill = $('#pdfProgressFill');
    fill.classList.remove('indeterminate', 'failed');
    fill.style.width = pct + '%';
    var pctEl = $('#pdfProgressPct');
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
  }

  function startPdfCreep() {
    stopPdfCreep();
    state.pdf.creepTimer = setInterval(function () {
      if (!state.pdf.running) { stopPdfCreep(); return; }
      if (state.pdf.progress < 92) setPdfProgress(state.pdf.progress + 0.6);
    }, 1000);
  }

  function stopPdfCreep() {
    if (state.pdf.creepTimer) {
      clearInterval(state.pdf.creepTimer);
      state.pdf.creepTimer = null;
    }
  }

  function showPdfProgress(stage, engine) {
    $('#pdfProgressCard').hidden = false;
    $('#pdfResultCard').hidden = true;
    $('#pdfProgressStage').textContent = stage;
    $('#pdfProgressEngine').textContent = engine ? ('引擎：' + (engine === 'cloud' ? '云端加速' : '本地解析')) : '';
    state.pdf.progress = 0;
    setPdfProgress(0);
    startPdfCreep();
  }

  // 轮询时只更新阶段文字和百分比，不重置进度
  function updatePdfStage(stage, pct) {
    if (stage) $('#pdfProgressStage').textContent = stage;
    if (typeof pct === 'number') setPdfProgress(pct);
  }

  function hidePdfError() {
    var box = $('#pdfErrorBox');
    box.hidden = true;
    box.textContent = '';
  }

  function showPdfError(msg) {
    var box = $('#pdfErrorBox');
    box.hidden = false;
    box.innerHTML = '<strong>转写失败：</strong>' + escapeHtml(msg) +
      '<div class="pdf-error-hint">请检查上方引擎状态；云端失败可切换本地解析重试，本地失败可查看 data/pdf_worker.log。</div>';
  }

  function failPdfJob(msg) {
    state.pdf.running = false;
    clearPdfTimer();
    stopPdfCreep();
    var fill = $('#pdfProgressFill');
    fill.classList.remove('indeterminate');
    fill.classList.add('failed');
    fill.style.width = '100%';
    var pctEl = $('#pdfProgressPct');
    if (pctEl) pctEl.textContent = '';
    $('#pdfProgressStage').textContent = '转写失败';
    showPdfError(msg);
    updatePdfStartState();
  }

  function clearPdfTimer() {
    if (state.pdf.timer) {
      clearInterval(state.pdf.timer);
      state.pdf.timer = null;
    }
  }

  function startPdfJob() {
    var file = state.pdf.file;
    if (!file || state.pdf.running) return;
    var engine = getPdfEngine();
    state.pdf.running = true;
    updatePdfStartState();
    hidePdfError();
    showPdfProgress('上传文件中…', engine);

    fetch('/api/pdf/upload?name=' + encodeURIComponent(file.name), {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    }).then(function (r) { return r.json(); }).then(function (up) {
      if (!up.ok) throw new Error(up.error || '上传失败');
      showPdfProgress('已上传，提交解析任务…', engine);
      return api('/api/pdf/submit', {
        method: 'POST',
        body: JSON.stringify({
          pdfPath: up.pdfPath,
          engine: engine,
          formula: $('#pdfOptFormula').checked,
          table: $('#pdfOptTable').checked,
        }),
      });
    }).then(function (sub) {
      if (!sub.ok) throw new Error(sub.error || '提交失败');
      state.pdf.jobId = sub.jobId;
      showPdfProgress('排队中…', engine);
      pollPdfStatus();
    }).catch(function (e) {
      failPdfJob((e && e.message) ? e.message : String(e));
    });
  }

  function pollPdfStatus() {
    clearPdfTimer();
    var miss = 0;
    state.pdf.timer = setInterval(function () {
      api('/api/pdf/status?jobId=' + encodeURIComponent(state.pdf.jobId)).then(function (st) {
        miss = 0;
        if (st.status === 'queued' || st.status === 'running') {
          updatePdfStage(st.progressText || '解析中…', st.progress);
        } else if (st.status === 'done') {
          clearPdfTimer();
          stopPdfCreep();
          setPdfProgress(100);
          updatePdfStage('正在加载结果…', 100);
          loadPdfResult();
        } else if (st.status === 'error') {
          clearPdfTimer();
          failPdfJob(st.error || '解析失败');
        }
      }).catch(function () {
        miss += 1;
        if (miss >= 8) failPdfJob('无法连接转写引擎（连续多次无响应）');
      });
    }, 1500);
  }

  function loadPdfResult() {
    api('/api/pdf/result?jobId=' + encodeURIComponent(state.pdf.jobId)).then(function (d) {
      if (!d.ok) throw new Error(d.error || '读取结果失败');
      state.pdf.running = false;
      state.pdf.markdown = d.markdown;
      updatePdfStartState();
      $('#pdfProgressCard').hidden = true;
      // 重置翻译状态（新PDF加载时清空上一篇的翻译状态）
      if (pdfTransState.watchdog) { clearInterval(pdfTransState.watchdog); }
      pdfTransState = { running: false, cancelled: false, chunks: [], results: [], nextAssign: 0, doneCount: 0, inFlight: 0, imgMapping: [], watchdog: null };
      $('#pdfTransTabBadge').hidden = true;
      $('#pdfTransProgress').hidden = true;
      $('#pdfTransResultWrap').hidden = true;
      $('#pdfTransContent').innerHTML = '';
      // 重置摘要面板
      pdfSumState = { running: false };
      $('#pdfSumTabBadge').hidden = true;
      $('#pdfSumProgress').hidden = true;
      $('#pdfSumResultWrap').hidden = true;
      $('#pdfSumContent').innerHTML = '';
      $('#pdfSumEmpty').hidden = false;
      $('#pdfSumNote').textContent = '';
      // 重置精读面板的显示（新 PDF 不该沿用上一篇的精读）。
      // 注意：正在跑的精读任务在服务端，切/换 PDF 都不该打断它 ——
      // 所以这里只清面板，不动 readTaskState（浮动进度条继续显示）。
      $('#pdfReadTabBadge').hidden = !readIsRunning(state.pdf.jobId);
      $('#pdfReadProgress').hidden = true;
      $('#pdfReadResultWrap').hidden = true;
      $('#pdfReadContent').innerHTML = '';
      $('#pdfReadEmpty').hidden = false;
      // 结果头部：以论文名为主标题（文件名美化 / 送转写来源标题），路径不再裸露——定位交给「打开文件夹」
      var t = state.pdf.title || (state.pdf.file && state.pdf.file.name ? String(state.pdf.file.name).replace(/\.pdf$/i, '') : '');
      if (!t) {
        var segs = String(d.savedPath || '').split('/');
        t = segs.length >= 2 ? segs[segs.length - 2] : '';
      }
      t = t.replace(/_\d{1,4}$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
      var titleEl = $('#pdfResultTitle');
      titleEl.textContent = t || '转写结果';
      titleEl.title = t || '';
      renderPdfPreview(d.markdown);
      renderPdfAssets(d.markdown, state.pdf.jobId);
      var imgs = d.images || [];
      var metaBits = [];
      if (d.chars) metaBits.push(Number(d.chars).toLocaleString('en-US') + ' 字');
      if (imgs.length) metaBits.push('图片 ' + imgs.length + ' 张');
      $('#pdfResultMeta').textContent = metaBits.join(' · ');
      switchPdfView(state.pdf.view || 'preview');
      $('#pdfResultCard').hidden = false;
      toast('转写完成');
    }).catch(function (e) {
      failPdfJob((e && e.message) ? e.message : String(e));
    });
  }

  function renderPdfPreview(md) {
    var html = renderMarkdown(md);
    var jid = state.pdf.jobId;
    html = rewritePdfImagePaths(html, jid);
    $('#pdfPreview').innerHTML = html;
    numberPdfFigures($('#pdfPreview'));
    bindPdfImageLightbox('#pdfPreview');
  }

  function switchPdfView(mode) {
    state.pdf.view = mode;
    $$('.pdf-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.pdfview === mode);
    });
    $('#pdfPreview').hidden = (mode !== 'preview');
    $('#pdfAssets').hidden = (mode !== 'assets');
    $('#pdfTranslation').hidden = (mode !== 'translation');
    $('#pdfSummary').hidden = (mode !== 'summary');
    $('#pdfReading').hidden = (mode !== 'reading');
    if (mode === 'translation') checkPdfTranslationCache();
    if (mode === 'reading') checkPdfReadingCache();
  }

  // ===== 全文翻译（模型见 llm_config.json 的 models.translation，5路并行）=====
  var PDF_TRANS_CONCURRENCY = 5;
  var pdfTransState = { running: false, cancelled: false, chunks: [], results: [], nextAssign: 0, doneCount: 0, inFlight: 0, imgMapping: [], watchdog: null };

  function checkPdfTranslationCache() {
    if (!state.pdf.jobId) return;
    // 如果翻译正在进行中，不重置UI（进度条和已翻译内容保持显示）
    if (pdfTransState.running && !pdfTransState.cancelled) return;
    api('/api/pdf/translation?jobId=' + encodeURIComponent(state.pdf.jobId)).then(function (d) {
      if (d && d.exists && d.translated) {
        showPdfTranslationResult(d.translated);
      } else {
        // 显示开始翻译界面，估算段数和时间（5路并行，每段约3.5秒）
        var md = state.pdf.markdown || '';
        var chunks = chunkPdfMarkdown(md);
        var est = Math.ceil(chunks.length * 3.5 / PDF_TRANS_CONCURRENCY / 60);
        // 只更新「估算」这一段文本：模型名由 applyPdfModelLabels() 写进
        // #pdfTransModelName，早先这里用 textContent 整体覆盖说明文字，
        // 既抹掉了 span 结构、又把模型名写死成了已停用的 Qwen3.8-Max
        applyPdfModelLabels();
        var estEl = $('#pdfTransEst');
        if (estEl) {
          estEl.textContent = ' 全文约 ' + chunks.length + ' 段，' + PDF_TRANS_CONCURRENCY +
            ' 路并行，预计 ' + (est > 0 ? est + ' 分钟' : '不到 1 分钟') + '。';
        }
        $('#pdfTransEmpty').hidden = false;
        $('#pdfTransProgress').hidden = true;
        $('#pdfTransResultWrap').hidden = true;
      }
    }).catch(function () {
      $('#pdfTransEmpty').hidden = false;
    });
  }

  function chunkPdfMarkdown(md) {
    if (!md) return [];
    var paragraphs = md.split(/\n\n+/);
    var chunks = [];
    var current = '';
    var maxChars = 2500;
    for (var i = 0; i < paragraphs.length; i++) {
      var p = paragraphs[i];
      if (current.length + p.length + 2 > maxChars && current) {
        chunks.push(current.trim());
        current = p;
      } else {
        current = current ? current + '\n\n' + p : p;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  // 保护图片标记：将 ![alt](url) 替换为 [[IMG:n]] 占位符，返回 {text, mapping}
  function protectPdfImages(md) {
    var mapping = [];
    var text = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, url) {
      var idx = mapping.length;
      mapping.push({ alt: alt, url: url });
      return '[[IMG:' + idx + ']]';
    });
    return { text: text, mapping: mapping };
  }

  // 还原图片标记：将 [[IMG:n]] 替换回 ![alt](url)
  function restorePdfImages(text, mapping) {
    if (!mapping || !mapping.length) return text;
    return text.replace(/\[\[IMG:(\d+)\]\]/g, function (m, idx) {
      var i = parseInt(idx, 10);
      if (mapping[i]) {
        return '![' + mapping[i].alt + '](' + mapping[i].url + ')';
      }
      return m;
    });
  }

  // 将 HTML 中的 images/ 相对路径重写为 worker 资源接口
  function rewritePdfImagePaths(html, jobId) {
    return html.replace(/src="images\/([^"]+)"/g, function (m, name) {
      return 'src="/api/pdf/asset?jobId=' + encodeURIComponent(jobId) + '&file=images/' + encodeURIComponent(name) + '"';
    });
  }

  // 给容器内的图片按出现顺序编号（图 1、图 2…），并添加标注
  function numberPdfFigures(container) {
    if (!container) return;
    var imgs = container.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      // 跳过已经编号过的（父元素是 .pdf-figure）
      if (img.parentNode && img.parentNode.classList && img.parentNode.classList.contains('pdf-figure')) continue;
      var wrapper = document.createElement('span');
      wrapper.className = 'pdf-figure';
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);
      var label = document.createElement('span');
      label.className = 'pdf-figure-num';
      label.textContent = '图 ' + (i + 1);
      wrapper.appendChild(label);
    }
  }

  function startPdfTranslation() {
    var md = state.pdf.markdown || '';
    if (!md) { toast('还没有可翻译的正文，先转写完'); return; }
    // 保护图片标记，避免 LLM 翻译时丢失
    var imgProtected = protectPdfImages(md);
    var chunks = chunkPdfMarkdown(imgProtected.text);
    if (!chunks.length) { toast('还没有可翻译的正文，先转写完'); return; }
    pdfTransState = {
      running: true, cancelled: false,
      chunks: chunks,
      results: new Array(chunks.length).fill(null),
      nextAssign: 0, doneCount: 0, inFlight: 0,
      imgMapping: imgProtected.mapping, watchdog: null
    };
    $('#pdfTransEmpty').hidden = true;
    $('#pdfTransProgress').hidden = false;
    $('#pdfTransResultWrap').hidden = true;
    $('#pdfTransTabBadge').hidden = false;
    updatePdfTransProgress();
    // 看门狗：每秒检查是否有 worker 掉线（切换标签页/网络抖动），自动补位
    pdfTransState.watchdog = setInterval(function () {
      if (pdfTransState.running && !pdfTransState.cancelled) pumpPdfTransWorkers();
    }, 1000);
    pumpPdfTransWorkers();
  }

  // 维持最多 PDF_TRANS_CONCURRENCY 个并行请求
  function pumpPdfTransWorkers() {
    if (pdfTransState.cancelled || !pdfTransState.running) return;
    while (pdfTransState.inFlight < PDF_TRANS_CONCURRENCY &&
           pdfTransState.nextAssign < pdfTransState.chunks.length) {
      translateOnePdfChunk(pdfTransState.nextAssign++);
    }
    if (pdfTransState.doneCount >= pdfTransState.chunks.length) {
      finishPdfTranslation();
    }
  }

  function translateOnePdfChunk(idx) {
    pdfTransState.inFlight++;
    var chunk = pdfTransState.chunks[idx];
    api('/api/pdf/llm/translate', {
      method: 'POST',
      body: JSON.stringify({ text: chunk })
    }).then(function (d) {
      pdfTransState.inFlight--;
      if (pdfTransState.cancelled) return;
      pdfTransState.results[idx] = d.ok ? d.translated : ('> [翻译失败，保留原文]\n\n' + chunk);
      pdfTransState.doneCount++;
      updatePdfTransProgress();
      renderPdfTransPartial();
      pumpPdfTransWorkers();
    }).catch(function () {
      pdfTransState.inFlight--;
      if (pdfTransState.cancelled) return;
      pdfTransState.results[idx] = '> [翻译出错，保留原文]\n\n' + chunk;
      pdfTransState.doneCount++;
      updatePdfTransProgress();
      renderPdfTransPartial();
      pumpPdfTransWorkers();
    });
  }

  // 按原始顺序拼接已完成的段落并渲染（未完成的段落跳过，完成后自动补上）
  function renderPdfTransPartial() {
    var parts = [];
    for (var i = 0; i < pdfTransState.results.length; i++) {
      if (pdfTransState.results[i] !== null) parts.push(pdfTransState.results[i]);
    }
    var partial = restorePdfImages(parts.join('\n\n'), pdfTransState.imgMapping);
    var html = rewritePdfImagePaths(renderMarkdown(partial), state.pdf.jobId);
    $('#pdfTransContent').innerHTML = html;
    numberPdfFigures($('#pdfTransContent'));
    $('#pdfTransResultWrap').hidden = false;
  }

  function finishPdfTranslation() {
    pdfTransState.running = false;
    if (pdfTransState.watchdog) { clearInterval(pdfTransState.watchdog); pdfTransState.watchdog = null; }
    $('#pdfTransTabBadge').hidden = true;
    var full = pdfTransState.results.join('\n\n');
    var translated = restorePdfImages(full.trim(), pdfTransState.imgMapping);
    $('#pdfTransProgress').hidden = true;
    showPdfTranslationResult(translated);
    // 保存到后端缓存
    api('/api/pdf/translation/save', {
      method: 'POST',
      body: JSON.stringify({ jobId: state.pdf.jobId, translated: translated })
    }).catch(function () {});
    toast('翻译完成');
  }

  function updatePdfTransProgress() {
    var total = pdfTransState.chunks.length;
    var done = pdfTransState.doneCount;
    var pct = total ? Math.round(done / total * 100) : 0;
    $('#pdfTransProgressText').textContent = '已完成 ' + done + ' / ' + total + ' 段（' + pct + '%），' + pdfTransState.inFlight + ' 段并行翻译中…';
    $('#pdfTransProgressFill').style.width = pct + '%';
  }

  function cancelPdfTranslation() {
    pdfTransState.cancelled = true;
    pdfTransState.running = false;
    if (pdfTransState.watchdog) { clearInterval(pdfTransState.watchdog); pdfTransState.watchdog = null; }
    $('#pdfTransTabBadge').hidden = true;
    $('#pdfTransProgress').hidden = true;
    // 拼接已完成的部分展示
    var parts = [];
    for (var i = 0; i < pdfTransState.results.length; i++) {
      if (pdfTransState.results[i] !== null) parts.push(pdfTransState.results[i]);
    }
    if (parts.length) {
      showPdfTranslationResult(restorePdfImages(parts.join('\n\n'), pdfTransState.imgMapping));
    } else {
      $('#pdfTransEmpty').hidden = false;
    }
    toast('已取消翻译');
  }

  function showPdfTranslationResult(translated) {
    $('#pdfTransEmpty').hidden = true;
    $('#pdfTransProgress').hidden = true;
    var html = rewritePdfImagePaths(renderMarkdown(translated), state.pdf.jobId);
    $('#pdfTransContent').innerHTML = html;
    numberPdfFigures($('#pdfTransContent'));
    $('#pdfTransResultWrap').hidden = false;
    bindPdfImageLightbox('#pdfTransContent');
  }

  // ===== 总结摘要（模型名从后端 llm_config 读取，支持三级深度）=====
  var pdfSumState = { running: false, lastResult: null };
  var SUM_DEPTH_LABELS = { quick: "快速速览", standard: "标准精读", deep: "深度学术评价" };
  var SUM_DEPTH_TIMES = { quick: "约5秒", standard: "约20-30秒", deep: "约1分钟" };

  // 模型 id → 展示名。改 llm_config.json 换模型后界面文案自动跟着变，不要再写死字符串。
  var MODEL_PRETTY = {
    "deepseek-v4-flash": "DeepSeek V4 Flash",
    "deepseek-v4-pro": "DeepSeek V4 Pro",
    "kimi-k3": "Kimi K3",
    "qwen3.8-max": "Qwen3.8 Max",
    "qwen3.8-flash": "Qwen3.8 Flash"
  };

  function prettyModelName(id) {
    if (!id) return '';
    if (MODEL_PRETTY[id]) return MODEL_PRETTY[id];
    return id.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
  }

  // 取某个任务当前生效的模型（数据来自 /api/pdf/health 的 models 字段）
  function pdfModelName(task) {
    var models = (state.pdf.health && state.pdf.health.models) || {};
    var id = models[task || 'summarize'] || models.summarize || models.default || 'qwen3.8-flash';
    return prettyModelName(id);
  }

  // 把生效的模型名写进界面文案（点击前的说明 + 生成中的占位 + 标签页 tooltip）
  function applyPdfModelLabels() {
    var name = pdfModelName('summarize');
    var desc = $('#pdfSumModelName');
    if (desc) desc.textContent = name;
    var placeholder = $('#pdfSumProgressText');
    if (placeholder) placeholder.textContent = name + ' 正在阅读全文并生成摘要…';
    // 翻译说明里的模型名同样从配置取，避免写死后与 llm_config.json 不一致
    var tDesc = $('#pdfTransModelName');
    if (tDesc) tDesc.textContent = pdfModelName('translation');
    var rDesc = $('#pdfReadModelName');
    if (rDesc) rDesc.textContent = pdfModelName('annotate');
    // 标签页 tooltip 也别写死模型名（换模型后 tooltip 会跟着变）
    var sumTab = document.querySelector('.pdf-tab[data-pdfview="summary"]');
    if (sumTab) sumTab.title = name + ' 生成结构化文献摘要';
    var transTab = document.querySelector('.pdf-tab[data-pdfview="translation"]');
    if (transTab) transTab.title = pdfModelName('translation') + ' 整篇译成中文，分段并行，结果会缓存';
    var readTab = document.querySelector('.pdf-tab[data-pdfview="reading"]');
    if (readTab) readTab.title = pdfModelName('annotate') + ' 生成逐段对照的精读长文：原文一段、译文一段，重点处附解读';
  }

  function startPdfSummary(depth) {
    if (!state.pdf.jobId) { toast('先转写完，再做这一步'); return; }
    if (pdfSumState.running) return;
    depth = depth || 'standard';
    pdfSumState.running = true;
    $('#pdfSumEmpty').hidden = true;
    $('#pdfSumResultWrap').hidden = true;
    $('#pdfSumProgress').hidden = false;
    $('#pdfSumTabBadge').hidden = false;
    // 更新进度提示
    var progressText = $('#pdfSumProgress').querySelector('.pdf-translation-progress-text');
    if (progressText) {
      progressText.textContent = pdfModelName('summarize') + ' 正在生成【' + SUM_DEPTH_LABELS[depth] + '】，' + SUM_DEPTH_TIMES[depth] + '…';
    }
    // 禁用所有深度按钮
    $$('.sum-depth-btn').forEach(function (b) { b.disabled = true; });
    api('/api/pdf/llm/summarize', {
      method: 'POST',
      body: JSON.stringify({ jobId: state.pdf.jobId, depth: depth })
    }).then(function (d) {
      pdfSumState.running = false;
      $('#pdfSumTabBadge').hidden = true;
      $('#pdfSumProgress').hidden = true;
      $$('.sum-depth-btn').forEach(function (b) { b.disabled = false; });
      if (!d.ok) {
        $('#pdfSumEmpty').hidden = false;
        $('#pdfSumNote').textContent = '生成失败：' + (d.error || '未知错误');
        return;
      }
      pdfSumState.lastResult = d;
      renderPdfSummary(d);
    }).catch(function (e) {
      pdfSumState.running = false;
      $('#pdfSumTabBadge').hidden = true;
      $('#pdfSumProgress').hidden = true;
      $$('.sum-depth-btn').forEach(function (b) { b.disabled = false; });
      $('#pdfSumEmpty').hidden = false;
      $('#pdfSumNote').textContent = '请求失败：' + ((e && e.message) ? e.message : String(e));
    });
  }

  function renderPdfSummary(d) {
    var html = '';

    // 一句话概括（突出显示）
    if (d.one_liner) {
      html += '<div class="sum-oneliner">' + escapeHtml(d.one_liner) + '</div>';
    }

    // 创新点（quick 模式）
    if (d.innovation) {
      html += '<h3>创新点</h3><p>' + escapeHtml(d.innovation).replace(/\n/g, '<br>') + '</p>';
    }

    // 中文摘要
    var zh = d.abstract_zh || d.summary_zh;
    if (zh) {
      html += '<h3>中文摘要</h3><p>' + escapeHtml(zh).replace(/\n/g, '<br>') + '</p>';
    }

    // 英文摘要
    var en = d.abstract_en || d.abstract;
    if (en) {
      html += '<h3>Abstract</h3><p class="sum-abstract-en">' + escapeHtml(en).replace(/\n/g, '<br>') + '</p>';
    }

    // 关键词
    if (d.keywords) {
      var kws = d.keywords.split(/[,，]/).map(function (k) { return k.trim(); }).filter(Boolean);
      html += '<h3>关键词</h3><p>' + kws.map(function (k) {
        return '<span class="pdf-kw-tag">' + escapeHtml(k) + '</span>';
      }).join(' ') + '</p>';
    }

    // 研究问题与意义
    if (d.research_question) {
      html += '<h3>研究问题与意义</h3><p>' + escapeHtml(d.research_question).replace(/\n/g, '<br>') + '</p>';
    }

    // 方法论架构
    if (d.methodology) {
      html += '<h3>方法论架构</h3><p>' + escapeHtml(d.methodology).replace(/\n/g, '<br>') + '</p>';
    }

    // 关键发现
    if (d.key_findings && d.key_findings.length) {
      html += '<h3>关键发现</h3><ul class="sum-findings">';
      d.key_findings.forEach(function (f) {
        html += '<li>' + escapeHtml(f) + '</li>';
      });
      html += '</ul>';
    }

    // 理论贡献（deep 模式）
    if (d.theoretical_contribution) {
      html += '<h3>理论贡献</h3><p>' + escapeHtml(d.theoretical_contribution).replace(/\n/g, '<br>') + '</p>';
    }

    // 关键突破（deep 模式，带重要度星级）
    if (d.breakthroughs && d.breakthroughs.length) {
      html += '<h3>关键突破</h3><div class="sum-breakthroughs">';
      d.breakthroughs.forEach(function (b, i) {
        var title = b.title || ('突破' + (i + 1));
        var desc = b.description || b.desc || '';
        var imp = b.importance || b.importance_level || 3;
        var why = b.why || '';
        var stars = '';
        for (var s = 0; s < 5; s++) { stars += s < imp ? '★' : '☆'; }
        html += '<div class="sum-breakthrough-item">';
        html += '<div class="sum-breakthrough-title"><span class="sum-breakthrough-num">' + (i + 1) + '</span>' + escapeHtml(title) + '<span class="sum-breakthrough-stars">' + stars + '</span></div>';
        if (desc) html += '<div class="sum-breakthrough-desc">' + escapeHtml(desc) + '</div>';
        if (why) html += '<div class="sum-breakthrough-why">为什么重要：' + escapeHtml(why) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // 优势与局限（双栏）
    if ((d.strengths && d.strengths.length) || (d.limitations && d.limitations.length)) {
      html += '<div class="sum-sl-grid">';
      if (d.strengths && d.strengths.length) {
        html += '<div class="sum-sl-card sum-strengths"><h4>主要优势</h4><ul>';
        d.strengths.forEach(function (s) { html += '<li>' + escapeHtml(s) + '</li>'; });
        html += '</ul></div>';
      }
      if (d.limitations && d.limitations.length) {
        html += '<div class="sum-sl-card sum-limitations"><h4>主要局限</h4><ul>';
        d.limitations.forEach(function (l) {
          var content = typeof l === 'object' ? (l.content || l.text || '') : l;
          var severity = typeof l === 'object' ? (l.severity || '') : '';
          html += '<li>' + escapeHtml(content) + (severity ? ' <span class="sum-severity sum-severity-' + severity + '">[' + severity + ']</span>' : '') + '</li>';
        });
        html += '</ul></div>';
      }
      html += '</div>';
    }

    // 待改进与疑惑清单（deep 模式）
    if (d.questions && d.questions.length) {
      html += '<h3>待改进与疑惑清单</h3><div class="sum-questions">';
      d.questions.forEach(function (q, i) {
        var question = q.question || q.text || q.content || ('问题' + (i + 1));
        var type = q.type || '';
        var impact = q.impact || '';
        var typeClass = type === '关键问题' ? 'critical' : (type === '方法问题' ? 'method' : 'understanding');
        html += '<div class="sum-question-item sum-question-' + typeClass + '">';
        if (type) html += '<span class="sum-question-type">' + escapeHtml(type) + '</span>';
        html += '<div class="sum-question-text">' + escapeHtml(question) + '</div>';
        if (impact) html += '<div class="sum-question-impact">影响：' + escapeHtml(impact) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // 对研究的启示
    if (d.implications) {
      html += '<h3>对研究的启示</h3><p>' + escapeHtml(d.implications).replace(/\n/g, '<br>') + '</p>';
    }

    // 进一步研究方向（deep 模式）
    if (d.future_directions && d.future_directions.length) {
      html += '<h3>进一步研究方向</h3><ul class="sum-findings">';
      d.future_directions.forEach(function (f) {
        html += '<li>' + escapeHtml(f) + '</li>';
      });
      html += '</ul>';
    }

    $('#pdfSumContent').innerHTML = html;
    var meta = d.model ? ('模型：' + prettyModelName(d.model) + ' · ' + d.tokens + ' tokens') : '';
    if (d.depth) meta += ' · ' + SUM_DEPTH_LABELS[d.depth];
    $('#pdfSumMeta').textContent = meta;
    $('#pdfSumResultWrap').hidden = false;
  }

  // ===== 图片灯箱：点击放大查看 =====
  function bindPdfImageLightbox(containerSelector) {
    var container = document.querySelector(containerSelector);
    if (!container) return;
    var imgs = container.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener('click', function (e) {
        e.preventDefault();
        openPdfImageLightbox(this.src, this.alt || '');
      });
    }
  }

  function openPdfImageLightbox(src, alt) {
    if (!src) return;
    $('#pdfImgLightboxImg').src = src;
    $('#pdfImgLightboxCaption').textContent = alt || '';
    $('#pdfImgLightboxCaption').hidden = !alt;
    $('#pdfImgLightbox').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closePdfImageLightbox() {
    $('#pdfImgLightbox').hidden = true;
    $('#pdfImgLightboxImg').src = '';
    document.body.style.overflow = '';
  }

  // ===== 保存摘要 =====
  function savePdfSummary() {
    if (!pdfSumState.lastResult) { toast('还没生成摘要，没东西可存'); return; }
    var btn = $('#pdfSumSaveBtn');
    var btnHtml = btn ? btn.innerHTML : '';   // 记住原图标+文字，恢复时 innerHTML 回写（textContent 会吃掉 SVG）
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    api('/api/pdf/summary/save', {
      method: 'POST',
      body: JSON.stringify({ jobId: state.pdf.jobId, summary: pdfSumState.lastResult })
    }).then(function (d) {
      if (btn) { btn.disabled = false; btn.innerHTML = btnHtml; }
      if (d.ok) {
        toast('摘要已保存到卡片库');
        if (typeof loadSummaryCards === 'function') loadSummaryCards();
      } else {
        toast('保存失败：' + (d.error || '未知错误'));
      }
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = btnHtml; }
      toast('保存请求失败');
    });
  }

  // ===== 摘要卡片库 =====
  var summaryFilter = 'all';
  var summaryQuery = '';
  var summaryTagActive = '';
  var summaryAll = [];
  var summaryCurrentId = '';

  function loadSummaryCards() {
    api('/api/pdf/summaries').then(function (d) {
      if (d.ok) {
        summaryAll = d.summaries || [];
        renderSummaryCards();
        renderTodayBoard(); renderWeekReview();
        var badge = $('#navSummaryBadge');
        if (badge) {
          if ((d.summaries || []).length > 0) {
            badge.style.display = '';
            badge.textContent = d.summaries.length;
          } else {
            badge.style.display = 'none';
          }
        }
      }
    }).catch(function () {});
  }

  function renderSummaryCards() {
    var list = $('#summaryCardList');
    var empty = $('#summaryEmpty');
    if (!list) return;

    var filtered = summaryAll;
    if (summaryFilter !== 'all') {
      filtered = filtered.filter(function (s) { return s.depth === summaryFilter; });
    }
    if (summaryQuery.trim()) {
      var q = summaryQuery.trim().toLowerCase();
      filtered = filtered.filter(function (s) {
        var hay = [s.title, s.title_en, s.keywords, s.one_liner, (s.tags || []).join(' ')].join(' ').toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    if (summaryTagActive) {
      filtered = filtered.filter(function (s) { return (s.tags || []).indexOf(summaryTagActive) >= 0; });
    }

    renderSummaryTagFilter();

    if (!filtered.length) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        var et = empty.querySelector('.sum-empty-title');
        var ed = empty.querySelector('.sum-empty-desc');
        var narrowing = summaryQuery.trim() || summaryTagActive || summaryFilter !== 'all';
        if (et) et.textContent = narrowing ? '没有匹配的卡片' : '还没有保存的摘要';
        if (ed) ed.textContent = narrowing ? '换个关键词，或清除上方的筛选条件' : '转写完一份 PDF，切到「摘要」标签生成，点「保存」就进卡片库了';
      }
      return;
    }
    if (empty) empty.hidden = true;

    list.classList.toggle('sum-select-on', sumSelectMode);
    var depthIcons = {
      quick: '<svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      standard: '<svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
      deep: '<svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>'
    };
    var depthLabels = { quick: '快速', standard: '标准', deep: '深度' };
    var depthClass = { quick: 'sum-depth-quick', standard: 'sum-depth-standard', deep: 'sum-depth-deep' };

    var html = '';
    filtered.forEach(function (s) {
      var title = s.title || s.title_en || '未命名论文';
      var year = s.year ? ' · ' + s.year : '';
      var keywords = s.keywords ? s.keywords.split(/[,，]/).slice(0, 4).map(function (k) {
        return '<span class="sum-card-kw">' + escapeHtml(k.trim()) + '</span>';
      }).join('') : '';

      var selected = sumSelected.indexOf(s.id) >= 0;
      html += '<div class="sum-card' + (selected ? ' selected' : '') + '" data-id="' + escapeHtml(s.id) + '">';
      html += '<button class="sum-card-check" data-check="' + escapeHtml(s.id) + '" aria-label="勾选这篇论文"></button>';
      html += '<div class="sum-card-header">';
      html += '<span class="sum-card-depth ' + (depthClass[s.depth] || '') + '">' + (depthIcons[s.depth] || '') + (depthLabels[s.depth] || s.depth) + '</span>';
      html += '<span class="sum-card-date">' + escapeHtml(s.created_at || '') + '</span>';
      html += '</div>';
      html += '<div class="sum-card-title">' + escapeHtml(title) + '<span class="sum-card-year">' + escapeHtml(year) + '</span></div>';
      if (s.one_liner) {
        html += '<div class="sum-card-oneliner">' + escapeHtml(s.one_liner) + '</div>';
      }
      if (keywords) {
        html += '<div class="sum-card-keywords">' + keywords + '</div>';
      }
      if (s.tags && s.tags.length) {
        html += '<div class="sum-card-tags">' + s.tags.map(function (t) {
          return '<span class="sum-card-tag"># ' + escapeHtml(t) + '</span>';
        }).join('') + '</div>';
      }
      html += '</div>';
    });
    list.innerHTML = html;

    list.querySelectorAll('.sum-card').forEach(function (card) {
      card.addEventListener('click', function () {
        // 勾选模式下点卡片 = 切换选中；普通模式 = 打开详情
        if (sumSelectMode) { toggleSumSelect(this.dataset.id); return; }
        openSummaryDetail(this.dataset.id);
      });
    });
  }

  // ===== 勾选模式 + 浮动操作条 + BibTeX 导出 + 综述草稿 =====
  var sumSelectMode = false;
  var sumSelected = [];

  function toggleSumSelect(id) {
    var idx = sumSelected.indexOf(id);
    if (idx >= 0) sumSelected.splice(idx, 1); else sumSelected.push(id);
    renderSummaryCards();
    updateSumActionBar();
  }

  function setSumSelectMode(on) {
    sumSelectMode = !!on;
    if (!sumSelectMode) { sumSelected = []; }
    var btn = $('#summarySelectToggle');
    if (btn) btn.classList.toggle('active', sumSelectMode);
    renderSummaryCards();
    updateSumActionBar();
  }

  function updateSumActionBar() {
    var bar = $('#sumActionBar');
    if (!bar) return;
    var count = sumSelected.length;
    $('#sumActionCount').textContent = '已选 ' + count + ' 篇';
    $('#sumActionReview').textContent = count > 1 ? '生成综述草稿' : '生成综述草稿（需 ≥2 篇）';
    bar.hidden = !sumSelectMode;
  }

  function downloadTextFile(text, filename) {
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 200);
  }

  function exportBibtex() {
    var ids = sumSelectMode && sumSelected.length ? sumSelected.slice() : null;
    api('/api/pdf/summaries/bibtex', {
      method: 'POST',
      body: JSON.stringify(ids ? { ids: ids } : {})
    }).then(function (d) {
      if (!d.ok) { toast('导出失败：' + (d.error || '未知错误')); return; }
      downloadTextFile(d.bibtex, '学术工作台-文献库.bib');
      toast('已导出 ' + d.count + ' 条 BibTeX');
    }).catch(function () { toast('导出失败：请求异常'); });
  }

  var reviewMarkdown = '';
  var reviewSources = [];

  function openReviewModal() {
    if (sumSelected.length < 2) { toast('综述至少需要勾选 2 篇论文'); return; }
    $('#reviewTopicInput').value = '';
    $('#reviewModalStatus').hidden = true;
    $('#reviewModalBody').hidden = true;
    $('#reviewCopyBtn').hidden = true;
    $('#reviewDownloadBtn').hidden = true;
    $('#reviewRunBtn').disabled = false;
    $('#reviewModal').hidden = false;
    setTimeout(function () { $('#reviewTopicInput').focus(); }, 40);
  }

  function closeReviewModal() {
    $('#reviewModal').hidden = true;
  }

  function runReview() {
    var btn = $('#reviewRunBtn');
    var status = $('#reviewModalStatus');
    btn.disabled = true;
    status.hidden = false;
    status.textContent = '正在基于 ' + sumSelected.length + ' 篇论文生成综述草稿…（约需十几秒）';
    api('/api/pdf/review', {
      method: 'POST',
      body: JSON.stringify({ ids: sumSelected.slice(), topic: $('#reviewTopicInput').value.trim() })
    }).then(function (d) {
      btn.disabled = false;
      if (!d.ok) {
        status.textContent = '生成失败：' + (d.error || '未知错误');
        return;
      }
      reviewMarkdown = d.markdown || '';
      reviewSources = d.sources || [];
      status.hidden = true;
      var body = $('#reviewModalBody');
      body.hidden = false;
      body.innerHTML = renderMarkdown(reviewMarkdown);
      linkifyCitations(body, reviewSources);
      $('#reviewCopyBtn').hidden = false;
      $('#reviewDownloadBtn').hidden = false;
      toast('综述草稿已生成（' + d.count + ' 篇 · ' + (d.model || '') + '）');
    }).catch(function () {
      btn.disabled = false;
      status.textContent = '生成失败：请求异常';
    });
  }

  function renderSummaryTagFilter() {
    var box = $('#summaryTagFilter');
    if (!box) return;
    var counts = {};
    summaryAll.forEach(function (s) {
      (s.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
    });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!keys.length) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<button class="sum-tag-btn' + (summaryTagActive ? '' : ' active') + '" data-tag="">全部</button>' +
      keys.map(function (t) {
        return '<button class="sum-tag-btn' + (summaryTagActive === t ? ' active' : '') + '" data-tag="' + escapeHtml(t) + '">' +
          escapeHtml(t) + '<span class="sum-tag-count">' + counts[t] + '</span></button>';
      }).join('');
  }

  function saveSummaryTags(tags) {
    if (!summaryCurrentId) return;
    api('/api/pdf/summary/tags', {
      method: 'POST',
      body: JSON.stringify({ id: summaryCurrentId, tags: tags })
    }).then(function (d) {
      if (!d.ok) { toast('标签保存失败：' + (d.error || '')); return; }
      // 同步本地全量数据，列表与筛选立即更新
      summaryAll = summaryAll.map(function (s) {
        return s.id === summaryCurrentId ? Object.assign({}, s, { tags: d.tags }) : s;
      });
      renderSummaryCards();
      renderSummaryTagChips(d.tags);
    }).catch(function () { toast('标签保存失败'); });
  }

  function renderSummaryTagChips(tags) {
    var box = $('#summaryTagChips');
    if (!box) return;
    tags = tags || [];
    if (!tags.length) {
      box.innerHTML = '<span class="sum-tag-empty">还没有标签</span>';
      return;
    }
    box.innerHTML = tags.map(function (t) {
      return '<span class="sum-tag-chip" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) +
        '<svg class="ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>';
    }).join('');
  }

  // ===== 标签自动建议：AI 读摘要 → 3-5 个候选 → 勾选采纳 =====
  // 按卡片独立存状态（tagSuggestCache[cardId]）：切换卡片时各自的建议/加载态
  // 互不干扰，本会话内来回切也保留；请求回包只刷新当前显示的那张卡。
  var tagSuggestCache = {};   // cardId -> { loading, tags:[], selected:[idx], error }

  function suggestSummaryTags() {
    var id = summaryCurrentId;
    if (!id) return;
    var prev = tagSuggestCache[id];
    if (prev && prev.loading) return;   // 该卡已在建议中，忽略重复点击
    tagSuggestCache[id] = { loading: true, tags: [], selected: [], error: '' };
    renderTagSuggestArea();
    api('/api/pdf/summary/suggest-tags', {
      method: 'POST',
      body: JSON.stringify({ id: id })
    }).then(function (d) {
      var ok = !!(d && d.ok && (d.tags || []).length);
      tagSuggestCache[id] = {
        loading: false,
        tags: ok ? d.tags : [],
        selected: [],
        error: ok ? '' : ((d && d.error) || '未取得建议，请重试')
      };
      renderTagSuggestArea();
    }).catch(function () {
      tagSuggestCache[id] = { loading: false, tags: [], selected: [], error: '请求异常，请重试' };
      renderTagSuggestArea();
    });
  }

  // 按「当前卡片」渲染建议区（切卡时由 openSummaryDetail 调用以恢复各自状态）
  function renderTagSuggestArea() {
    var btn = $('#summaryTagAiBtn');
    var box = $('#summaryTagSuggest');
    if (!btn || !box) return;
    var entry = tagSuggestCache[summaryCurrentId];
    if (!entry) {
      btn.disabled = false;
      btn.textContent = 'AI 建议';
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    if (entry.loading) {
      btn.disabled = true;
      btn.textContent = '分析中…';
      box.hidden = false;
      box.innerHTML = '<span class="sum-tag-suggest-hint">正在读摘要内容…</span>';
      return;
    }
    btn.disabled = false;
    btn.textContent = 'AI 建议';
    box.hidden = false;
    if (!entry.tags.length) {
      box.innerHTML = '<span class="sum-tag-suggest-hint">' + escapeHtml(entry.error || '未取得建议，请重试') + '</span>';
      return;
    }
    box.innerHTML = '<span class="sum-tag-suggest-label">AI 建议</span>' +
      entry.tags.map(function (t, i) {
        var on = entry.selected.indexOf(i) >= 0;
        return '<button class="sum-tag-suggest-chip' + (on ? ' selected' : '') + '" data-si="' + i + '">' + escapeHtml(t) + '</button>';
      }).join('') +
      '<button class="sum-tag-suggest-adopt" id="sumTagAdoptBtn">采纳选中</button>' +
      '<button class="sum-tag-suggest-close" id="sumTagSuggestClose" title="收起这条建议">×</button>';
  }

  function toggleSuggestChip(i) {
    var entry = tagSuggestCache[summaryCurrentId];
    if (!entry || !entry.tags[i]) return;
    var at = entry.selected.indexOf(i);
    if (at >= 0) entry.selected.splice(at, 1); else entry.selected.push(i);
    renderTagSuggestArea();
  }

  function adoptSuggestedTags() {
    var id = summaryCurrentId;
    var entry = tagSuggestCache[id];
    if (!entry) return;
    if (!entry.selected.length) { toast('先点选要采纳的标签'); return; }
    var picked = entry.selected.map(function (i) { return entry.tags[i]; }).filter(Boolean);
    var cur = summaryAll.filter(function (s) { return s.id === id; })[0];
    var tags = (cur && cur.tags) ? cur.tags.slice() : [];
    picked.forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
    if (tags.length > 12) tags = tags.slice(0, 12);
    // 已采纳的从候选移除；剩余建议保留，可继续挑
    entry.tags = entry.tags.filter(function (t) { return picked.indexOf(t) < 0; });
    entry.selected = [];
    if (!entry.tags.length) delete tagSuggestCache[id];
    renderTagSuggestArea();
    saveSummaryTags(tags);
    toast('已采纳 ' + picked.length + ' 个标签');
  }

  function closeTagSuggest() {
    delete tagSuggestCache[summaryCurrentId];
    renderTagSuggestArea();
  }

  // ===== 综述引用 [n] → 可点击跳原文卡片 =====
  function linkifyCitations(container, sources) {
    if (!container || !(sources || []).length) return;
    var map = {};
    sources.forEach(function (s) { map[String(s.n)] = s; });
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var targets = [];
    var node;
    while ((node = walker.nextNode())) {
      if (/\[\d+\]/.test(node.nodeValue)) targets.push(node);
    }
    targets.forEach(function (textNode) {
      var text = textNode.nodeValue;
      var frag = document.createDocumentFragment();
      var last = 0, m;
      var re = /\[(\d+)\]/g;
      while ((m = re.exec(text))) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        var src = map[m[1]];
        var a = document.createElement(src ? 'a' : 'span');
        a.className = src ? 'review-cite' : 'review-cite review-cite-missing';
        a.textContent = m[0];
        if (src) {
          a.dataset.cardId = src.id;
          a.title = '跳转到：' + (src.title || '');
        }
        frag.appendChild(a);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
    });
  }

  // ===== 译文库：列表 / 详情 / 检索 / 删除 =====
  var transQuery = '';
  var transCurrentId = '';
  var transLoaded = false;

  function loadTranslations(force) {
    if (transLoaded && !force) return Promise.resolve(state.translations || []);
    return api('/api/pdf/translations').then(function (d) {
      state.translations = (d && d.translations) || [];
      transLoaded = true;
      renderTranslations();
      return state.translations;
    }).catch(function () {
      state.translations = [];
      renderTranslations();
      return [];
    });
  }

  function renderTranslations() {
    var list = $('#transList');
    var empty = $('#transEmpty');
    if (!list) return;
    var items = state.translations || [];
    var badge = $('#navTransBadge');
    if (badge) {
      badge.textContent = items.length;
      // 该徽标在 HTML 上带 hidden 属性，必须清属性而不是只改 style
      badge.hidden = items.length === 0;
    }
    var q = transQuery.trim().toLowerCase();
    var filtered = q ? items.filter(function (t) {
      return [t.title, t.source, t.excerpt].join(' ').toLowerCase().indexOf(q) >= 0;
    }) : items;

    if (!filtered.length) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        var et = empty.querySelector('.sum-empty-title');
        var ed = empty.querySelector('.sum-empty-desc');
        if (et) et.textContent = q ? '没有匹配的译文' : '译文库还是空的';
        if (ed) ed.textContent = q
          ? '换个关键词试试，标题、来源和正文片段都能搜'
          : '在 PDF 转写的「译文」标签翻译完全文后，点「存入译文库」，译文就会归档到这里';
      }
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = filtered.map(function (t, i) {
      var k = Math.max(1, Math.round((t.chars || 0) / 1000));
      return '<div class="trans-item" data-id="' + escapeHtml(t.id) + '" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="trans-item-main">' +
          '<div class="trans-item-title">' + escapeHtml(t.title || '未命名译文') + '</div>' +
          '<div class="trans-item-meta">' + escapeHtml(t.source || '') + ' · ' + k + 'k 字 · ' + escapeHtml(t.created_at || '') + '</div>' +
          (t.excerpt ? '<div class="trans-item-excerpt">' + escapeHtml(t.excerpt) + '</div>' : '') +
        '</div>' +
        '<div class="hs-item-arrow">打开 →</div>' +
        '</div>';
    }).join('');
    list.querySelectorAll('.trans-item').forEach(function (el) {
      el.addEventListener('click', function () { openTranslationDetail(this.dataset.id); });
    });
  }

  function openTranslationDetail(id) {
    api('/api/pdf/translation/get?id=' + encodeURIComponent(id)).then(function (d) {
      if (!d.ok) { toast('打开失败：' + (d.error || '未知错误')); return; }
      var r = d.record || {};
      transCurrentId = id;
      $('#transDetailTitle').textContent = r.title || '未命名译文';
      var k = Math.max(1, Math.round((r.chars || 0) / 1000));
      $('#transDetailMeta').innerHTML =
        '<span>' + escapeHtml(r.source || '') + '</span>' +
        '<span>' + k + 'k 字</span>' +
        '<span>' + escapeHtml(r.created_at || '') + '</span>';
      // 图片仍走资源接口：沿用原任务的 job_id，旧任务图片由跨 job 回退兜住
      var box = $('#transDetailContent');
      box.innerHTML = rewritePdfImagePaths(renderMarkdown(r.markdown || ''), r.job_id || '');
      // 先切换视图再补装饰（图注编号 / 点击放大）：装饰逻辑出错不该挡住阅读
      $('#translationsListView').style.display = 'none';
      $('#translationsDetailView').style.display = '';
      try {
        numberPdfFigures(box);
        bindPdfImageLightbox('#transDetailContent');   // 该函数收选择器字符串，不是元素
      } catch (e) {
        if (window.console) console.warn('译文图注/灯箱初始化失败（不影响阅读）', e);
      }
      var sb = document.querySelector('.main-content') || document.querySelector('.main');
      if (sb) sb.scrollTop = 0;
      var tjob = r.job_id || '';
      renderXrefBar('#transXref', tjob, 'translation');
      ensureXrefData(function () { renderXrefBar('#transXref', tjob, 'translation'); });
    }).catch(function () { toast('打开失败：请求异常'); });
  }

  function closeTranslationDetail() {
    transCurrentId = '';
    $('#translationsDetailView').style.display = 'none';
    $('#translationsListView').style.display = '';
  }

  function deleteTranslation() {
    if (!transCurrentId) return;
    if (!window.confirm('从译文库移除这篇译文？转写任务里的原文不受影响。')) return;
    api('/api/pdf/translation/delete', {
      method: 'POST',
      body: JSON.stringify({ id: transCurrentId })
    }).then(function (d) {
      if (!d.ok) { toast('移除失败：' + (d.error || '未知错误')); return; }
      toast('已从译文库移除');
      closeTranslationDetail();
      loadTranslations(true);
    }).catch(function () { toast('移除失败：请求异常'); });
  }

  function saveCurrentTranslation() {
    if (!state.pdf.jobId) { toast('先转写并翻译全文，再来保存'); return; }
    var btn = $('#pdfTransSaveBtn');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    api('/api/pdf/translation/archive', {
      method: 'POST',
      body: JSON.stringify({ jobId: state.pdf.jobId })
    }).then(function (d) {
      if (btn) { btn.disabled = false; btn.textContent = '存入译文库'; }
      if (!d.ok) { toast('保存失败：' + (d.error || '未知错误')); return; }
      toast(d.replaced
        ? '译文已更新（覆盖同一任务的上一版）'
        : '译文已存入译文库（' + Math.max(1, Math.round((d.chars || 0) / 1000)) + 'k 字）');
      loadTranslations(true);   // 徽标与列表立即跟上
    }).catch(function () {
      if (btn) { btn.disabled = false; btn.textContent = '存入译文库'; }
      toast('保存失败：请求异常');
    });
  }

  // ===== 原文精读：由服务端按 jobId 生成 =====
  // 早先这套是前端分块并发跑的，只有 PDF 转写面板（当前会话有 markdown）能用 ——
  // 于是在卡片/译文里看到「还没有精读」就是个死胡同，只能回去把整篇重跑一遍。
  // 现在生成挪到 worker：给个 jobId 就读该任务的 result.md 开跑，前端只管
  // 提交 + 轮询进度（分块口径也只有服务端那一份）。
  var readTaskState = { jobId: '', source: '', total: 0, done: 0, timer: null, cancelling: false, rateBase: null };

  function fmtReadEta(seconds) {
    var s = Number(seconds) || 0;
    if (s < 60) return '不到 1 分钟';
    return '约 ' + Math.round(s / 60) + ' 分钟';
  }

  // 剩余时间：以「首次观测到进度」为基线算单段耗时，再乘剩余段数。
  // 基线不能取任务开始时刻 —— 刷新页面接手一个跑了一半的任务时，
  // 用「已跑段数 / 刚经过的几秒」会把剩余时间算得离谱地短。
  function readEtaText() {
    var st = readTaskState;
    var remain = Math.max(0, (st.total || 0) - (st.done || 0));
    if (!st.total || !remain) return '';
    var per = 25;                      // 经验值：单段约 25 秒（实测 21 段 123 秒）
    var base = st.rateBase;
    if (base && st.done > base.done) {
      per = Math.max(4, (Date.now() - base.t) / 1000 / (st.done - base.done));
    }
    var left = remain * per;
    return left < 60 ? '预计还要不到 1 分钟' : '预计还要约 ' + Math.round(left / 60) + ' 分钟';
  }

  function readIsRunning(jobId) {
    return !!(readTaskState.timer && jobId && readTaskState.jobId === jobId);
  }

  // 浮动进度卡：跨面板可见，也是「生成中」的唯一真相
  function renderReadTaskBar() {
    var bar = $('#readTaskBar');
    if (!bar) return;
    if (!readTaskState.timer) {
      bar.hidden = true;
      bar.classList.remove('is-done');
      return;
    }
    bar.hidden = false;
    bar.classList.remove('is-done');
    var pct = readTaskState.total ? Math.round(readTaskState.done / readTaskState.total * 100) : 0;
    var title = $('#readTaskTitle');
    if (title) title.textContent = '原文精读生成中';
    var fill = $('#readTaskFill');
    if (fill) fill.style.width = pct + '%';
    var pctEl = $('#readTaskPct');
    if (pctEl) pctEl.textContent = pct + '%';
    var sub = $('#readTaskSub');
    if (sub) sub.textContent = readTaskState.done + ' / ' + readTaskState.total + ' 段';
    var eta = $('#readTaskEta');
    if (eta) eta.textContent = readEtaText();
    var btn = $('#readTaskCancel');
    if (btn) {
      // 轮询每 2.5 秒会重画一次，正在取消时别把「取消中…」冲掉
      btn.textContent = readTaskState.cancelling ? '取消中…' : '取消';
      btn.disabled = !!readTaskState.cancelling;
    }
  }

  function updatePdfReadProgress() {
    // 只有当下这个 PDF 任务就是正在跑的那个，才把进度写进面板里的进度区
    if (!readIsRunning(state.pdf.jobId)) return;
    var total = readTaskState.total, done = readTaskState.done;
    var pct = total ? Math.round(done / total * 100) : 0;
    var t = $('#pdfReadProgressText');
    if (t) t.textContent = '已完成 ' + done + ' / ' + total + ' 段（' + pct + '%），后台生成中…（可以切到别的面板，跑完会提示你）';
    var fill = $('#pdfReadProgressFill');
    if (fill) fill.style.width = pct + '%';
  }

  function beginReadTask(jobId, source, total) {
    readTaskState.jobId = jobId;
    readTaskState.source = source || 'pdf';
    readTaskState.total = total || 0;
    readTaskState.done = 0;
    readTaskState.cancelling = false;
    readTaskState.rateBase = null;
    if (readTaskState.timer) clearInterval(readTaskState.timer);
    if (readTaskState.source === 'pdf') {
      $('#pdfReadEmpty').hidden = true;
      $('#pdfReadProgress').hidden = false;
      $('#pdfReadResultWrap').hidden = true;
    }
    $('#pdfReadTabBadge').hidden = false;
    renderReadTaskBar();
    updatePdfReadProgress();
    readTaskState.timer = setInterval(pollReadTask, 2500);
    pollReadTask();
  }

  // finished=true 时不是无声消失，而是先变成「已完成」再收起 —— 生成是在后台跑的，
  // 进度卡直接不见了会让人不确定到底跑完没有。
  function endReadTask(finished) {
    var lastSub = readTaskState.done + ' / ' + readTaskState.total + ' 段';
    if (readTaskState.timer) { clearInterval(readTaskState.timer); readTaskState.timer = null; }
    readTaskState.jobId = '';
    readTaskState.done = 0;
    readTaskState.cancelling = false;
    readTaskState.rateBase = null;
    $('#pdfReadTabBadge').hidden = true;
    var bar = $('#readTaskBar');
    if (finished && bar) {
      bar.hidden = false;
      bar.classList.add('is-done');
      var t = $('#readTaskTitle'); if (t) t.textContent = '原文精读已生成';
      var f = $('#readTaskFill'); if (f) f.style.width = '100%';
      var p = $('#readTaskPct'); if (p) p.textContent = '100%';
      var s = $('#readTaskSub'); if (s) s.textContent = lastSub;
      var e = $('#readTaskEta'); if (e) e.textContent = '';
      setTimeout(function () {
        if (!readTaskState.timer) { bar.hidden = true; bar.classList.remove('is-done'); }
      }, 1900);
    } else {
      renderReadTaskBar();
    }
    refreshVisibleXref();   // 关联条上的「精读生成中…」要跟着复原
  }

  function pollReadTask() {
    var jobId = readTaskState.jobId;
    if (!jobId) return;
    api('/api/pdf/reading/status?jobId=' + encodeURIComponent(jobId)).then(function (d) {
      if (!readTaskState.jobId || readTaskState.jobId !== jobId) return;
      if (d && typeof d.done === 'number') {
        readTaskState.done = d.done;
        // 首次拿到非零进度时定为速率基线（刷新后接手一个跑了一半的任务也不会算错）
        if (!readTaskState.rateBase && d.done > 0) {
          readTaskState.rateBase = { t: Date.now(), done: d.done };
        }
      }
      if (d && d.total) readTaskState.total = d.total;
      renderReadTaskBar();
      updatePdfReadProgress();
      refreshVisibleXref();   // 关联条上的「精读生成中 3/19」跟着走
      var st = (d && d.status) || 'none';
      if (st === 'running') return;
      var src = readTaskState.source;
      var err = (d && d.error) || '';
      endReadTask(st === 'done');
      if (st === 'done') onReadTaskDone(jobId, src, (d && d.failed) || 0);
      else if (st === 'cancelled') onReadTaskCancelled(src);
      else if (st === 'error') onReadTaskFail(src, err);
      else onReadTaskFail(src, '任务状态丢了（服务可能重启过），请再点一次');
    }).catch(function () { /* 轮询抖一下不打断，下一轮继续 */ });
  }

  function onReadTaskDone(jobId, src, failed) {
    loadReadings(true).then(function () {
      var hit = findReadingByJob(jobId);
      var sizeTxt = hit ? Math.max(1, Math.round((hit.chars || 0) / 1000)) + 'k 字' : '';
      if (src === 'pdf' && state.pdf.jobId === jobId) {
        api('/api/pdf/reading?jobId=' + encodeURIComponent(jobId)).then(function (d) {
          if (d && d.exists) showPdfReadingResult(d.markdown);
          updateReadArchivedTip();
        });
      } else if (hit) {
        // 从卡片/译文那边点起来的：直接把生成好的精读打开给他
        switchPanel('readings');
        openReadingDetail(hit.id);
      }
      var msg = hit ? ('精读已生成并存进精读库（' + sizeTxt + '）') : '精读已生成';
      if (failed > 0) msg += '，其中 ' + failed + ' 段没成功（已保留原文，可重新生成）';
      toast(msg);
    });
  }

  function onReadTaskFail(src, msg) {
    toast('精读生成失败：' + (msg || '未知错误'));
    if (src === 'pdf' && state.pdf.jobId) {
      $('#pdfReadProgress').hidden = true;
      $('#pdfReadEmpty').hidden = false;
      $('#pdfReadNote').textContent = msg || '';
    }
  }

  function onReadTaskCancelled(src) {
    toast('已取消精读生成');
    if (src === 'pdf' && state.pdf.jobId) {
      $('#pdfReadProgress').hidden = true;
      $('#pdfReadResultWrap').hidden = true;
      $('#pdfReadEmpty').hidden = false;
      checkPdfReadingCache();
    }
  }

  function submitReadTask(jobId, source) {
    if (!jobId) { toast('这篇没有关联的转写任务'); return; }
    if (readIsRunning(jobId)) { toast('这篇正在生成中'); return; }
    if (readTaskState.timer) { toast('还有一个精读任务在跑，等它完成或先取消'); return; }
    api('/api/pdf/reading/generate', {
      method: 'POST',
      body: JSON.stringify({ jobId: jobId })
    }).then(function (d) {
      if (!d || !d.ok) { toast((d && d.error) || '无法开始生成'); return; }
      beginReadTask(jobId, source, d.total);
      if (d.started) toast('开始生成原文精读：共 ' + d.total + ' 段，可以切去干别的，跑完我会告诉你');
      else toast('这篇之前已经在生成，接着看进度');
    }).catch(function () { toast('提交失败：请求异常'); });
  }

  function cancelReadTask() {
    var jobId = readTaskState.jobId;
    if (!jobId) return;
    readTaskState.cancelling = true;
    renderReadTaskBar();
    api('/api/pdf/reading/cancel', { method: 'POST', body: JSON.stringify({ jobId: jobId }) })
      .then(function (d) {
        if (!d || !d.ok) {
          toast((d && d.error) || '取消失败');
          readTaskState.cancelling = false;
          renderReadTaskBar();
        }
        // 成功就不用自己收尾：下一轮轮询看到 cancelled 会收掉浮条
      })
      .catch(function () {
        toast('取消失败：请求异常');
        readTaskState.cancelling = false;
        renderReadTaskBar();
      });
  }

  // 「还没有精读」的一键入口：确认后直接就地生成（不必回 PDF 转写重跑）
  function generateReadingFor(jobId, title) {
    if (!jobId) { toast('这篇没有关联的转写任务'); return; }
    if (readIsRunning(jobId)) { toast('这篇正在生成中：' + readTaskState.done + ' / ' + readTaskState.total + ' 段'); return; }
    if (readTaskState.timer) { toast('还有一个精读任务在跑，等它完成或先取消'); return; }
    api('/api/pdf/reading/plan?jobId=' + encodeURIComponent(jobId)).then(function (p) {
      if (!p || !p.ok) { toast((p && p.error) || '无法生成：读不到这篇的转写结果'); return; }
      var label = title ? ('《' + String(title).slice(0, 32) + '》') : '这篇';
      var msg = '为' + label + '生成原文精读？\n\n' +
        '共 ' + p.total + ' 段，预计 ' + fmtReadEta(p.seconds) + '，' +
        '会调用 ' + p.total + ' 次模型。生成时可以切去干别的，跑完自动存进精读库。';
      if (!window.confirm(msg)) return;
      submitReadTask(jobId, 'xref');
    }).catch(function () { toast('读取预估失败：请求异常'); });
  }

  function showReadPlan(jobId) {
    api('/api/pdf/reading/plan?jobId=' + encodeURIComponent(jobId)).then(function (p) {
      $('#pdfReadEmpty').hidden = false;
      $('#pdfReadProgress').hidden = true;
      $('#pdfReadResultWrap').hidden = true;
      $('#pdfReadNote').textContent = (p && p.ok && p.total)
        ? '全文共 ' + p.total + ' 段，预计 ' + fmtReadEta(p.seconds) + '。生成时可以切去干别的，跑完自动存进精读库。'
        : ((p && p.error) || '还没有可精读的正文，先把 PDF 转写完');
    }).catch(function () {});
  }

  function checkPdfReadingCache() {
    var jobId = state.pdf.jobId;
    if (!jobId) return;
    if (readIsRunning(jobId)) {   // 本地已知在跑：回到进度态
      $('#pdfReadEmpty').hidden = true;
      $('#pdfReadProgress').hidden = false;
      $('#pdfReadResultWrap').hidden = true;
      updatePdfReadProgress();
      return;
    }
    api('/api/pdf/reading?jobId=' + encodeURIComponent(jobId)).then(function (d) {
      if (d && d.exists && d.markdown) { showPdfReadingResult(d.markdown); return; }
      // 没有现成的：先看服务端是不是还在跑（页面刷新过也能接上），否则报预估
      api('/api/pdf/reading/status?jobId=' + encodeURIComponent(jobId)).then(function (s) {
        if (s && s.status === 'running') {
          beginReadTask(jobId, 'pdf', s.total);
          readTaskState.done = s.done || 0;
          renderReadTaskBar();
          updatePdfReadProgress();
          return;
        }
        showReadPlan(jobId);
      }).catch(function () { showReadPlan(jobId); });
    }).catch(function () {});
  }

  function startPdfReading() {
    if (!state.pdf.jobId) { toast('先转写完，再做这一步'); return; }
    submitReadTask(state.pdf.jobId, 'pdf');
  }

  function cancelPdfReading() { cancelReadTask(); }

  // 精读正文里「原文 / 译文 / 解读」三种段落要分层，但 LLM 输出的是 Markdown
  // 的 **解读** 加粗，渲染后是 <p><strong>解读</strong> …</p>。这里在渲染结果上
  // 再加工一层：换成带 class 的段落，样式表就能给三级不同的视觉权重。
  function decorateReadingHtml(html) {
    return html
      .replace(/<p><strong>(原文|译文|解读)<\/strong>[:：]?\s*<\/p>/g, '')
      .replace(/<p><strong>解读<\/strong>[:：]?\s*/g, '<p class="rd-note">')
      .replace(/<p><strong>译文<\/strong>[:：]?\s*/g, '<p class="rd-zh">')
      .replace(/<p><strong>原文<\/strong>[:：]?\s*/g, '<p class="rd-src">');
  }

  function renderPdfReadingInto(markdown) {
    var html = decorateReadingHtml(rewritePdfImagePaths(renderMarkdown(markdown), state.pdf.jobId));
    var box = $('#pdfReadContent');
    box.innerHTML = html;
    numberPdfFigures(box);
  }

  function showPdfReadingResult(markdown) {
    if (!markdown || !markdown.trim()) { $('#pdfReadEmpty').hidden = false; return; }
    $('#pdfReadEmpty').hidden = true;
    $('#pdfReadProgress').hidden = true;
    renderPdfReadingInto(markdown);
    $('#pdfReadResultWrap').hidden = false;
    updateReadArchivedTip();
  }

  function updateReadArchivedTip() {
    var tip = $('#pdfReadArchivedTip');
    if (!tip) return;
    var hit = findReadingByJob(state.pdf.jobId);
    tip.hidden = !hit;
    tip.textContent = hit ? '已存入精读库' : '';
  }

  function copyCurrentReading() {
    var md = $('#pdfReadContent') ? $('#pdfReadContent').innerText : '';
    if (!md) { toast('还没有精读内容'); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(md).then(function () { toast('已复制精读全文'); });
    }
  }

  // ===== 精读库：列表 / 详情 / 检索 / 删除 =====
  var readQuery = '';
  var readCurrentId = '';
  var readLoaded = false;

  function loadReadings(force) {
    if (readLoaded && !force) return Promise.resolve(state.readings || []);
    return api('/api/pdf/readings').then(function (d) {
      state.readings = (d && d.readings) || [];
      readLoaded = true;
      renderReadings();
      return state.readings;
    }).catch(function () {
      state.readings = [];
      readLoaded = true;
      renderReadings();
      return [];
    });
  }

  function renderReadings() {
    var list = $('#readList');
    var empty = $('#readEmpty');
    if (!list) return;
    var items = state.readings || [];
    var badge = $('#navReadingBadge');
    if (badge) {
      badge.textContent = items.length;
      badge.hidden = items.length === 0;
    }
    var q = readQuery.trim().toLowerCase();
    var filtered = q ? items.filter(function (t) {
      return [t.title, t.source, t.excerpt].join(' ').toLowerCase().indexOf(q) >= 0;
    }) : items;

    if (!filtered.length) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        var et = empty.querySelector('.sum-empty-title');
        var ed = empty.querySelector('.sum-empty-desc');
        if (et) et.textContent = q ? '没有匹配的精读' : '精读库还是空的';
        if (ed) ed.textContent = q
          ? '换个关键词试试，标题、来源和正文片段都能搜'
          : '在 PDF 转写的「精读」标签生成精读长文，生成完会自动归档到这里';
      }
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = filtered.map(function (t, i) {
      var k = Math.max(1, Math.round((t.chars || 0) / 1000));
      return '<div class="trans-item" data-id="' + escapeHtml(t.id) + '" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="trans-item-main">' +
          '<div class="trans-item-title">' + escapeHtml(t.title || '未命名精读') + '</div>' +
          '<div class="trans-item-meta">' + escapeHtml(t.source || '') + ' · ' + k + 'k 字 · ' + escapeHtml(t.created_at || '') + '</div>' +
          (t.excerpt ? '<div class="trans-item-excerpt">' + escapeHtml(t.excerpt) + '</div>' : '') +
        '</div>' +
        '<div class="hs-item-arrow">打开 →</div>' +
        '</div>';
    }).join('');
    list.querySelectorAll('.trans-item').forEach(function (el) {
      el.addEventListener('click', function () { openReadingDetail(this.dataset.id); });
    });
  }

  function openReadingDetail(id) {
    api('/api/pdf/reading/get?id=' + encodeURIComponent(id)).then(function (d) {
      if (!d.ok) { toast('打开失败：' + (d.error || '未知错误')); return; }
      var r = d.record || {};
      readCurrentId = id;
      $('#readDetailTitle').textContent = r.title || '未命名精读';
      var k = Math.max(1, Math.round((r.chars || 0) / 1000));
      $('#readDetailMeta').innerHTML =
        '<span>' + escapeHtml(r.source || '') + '</span>' +
        '<span>' + k + 'k 字</span>' +
        '<span>' + escapeHtml(r.created_at || '') + '</span>';
      var box = $('#readDetailContent');
      box.innerHTML = decorateReadingHtml(rewritePdfImagePaths(renderMarkdown(r.markdown || ''), r.job_id || ''));
      $('#readingsListView').style.display = 'none';
      $('#readingsDetailView').style.display = '';
      try {
        numberPdfFigures(box);
        bindPdfImageLightbox('#readDetailContent');
      } catch (e) {
        if (window.console) console.warn('精读图注/灯箱初始化失败（不影响阅读）', e);
      }
      renderXrefBar('#readXref', r.job_id || '', 'reading');
      var sb = document.querySelector('.main-content') || document.querySelector('.main');
      if (sb) sb.scrollTop = 0;
    }).catch(function () { toast('打开失败：请求异常'); });
  }

  function closeReadingDetail() {
    readCurrentId = '';
    $('#readingsDetailView').style.display = 'none';
    $('#readingsListView').style.display = '';
  }

  function deleteReading() {
    if (!readCurrentId) return;
    if (!window.confirm('从精读库移除这篇精读？转写任务里的原文件不受影响。')) return;
    api('/api/pdf/reading/delete', {
      method: 'POST',
      body: JSON.stringify({ id: readCurrentId })
    }).then(function (d) {
      if (!d.ok) { toast('移除失败：' + (d.error || '未知错误')); return; }
      toast('已从精读库移除');
      closeReadingDetail();
      loadReadings(true);
    }).catch(function () { toast('移除失败：请求异常'); });
  }

  // ===== 四方互链：摘要卡片 ↔ 译文 ↔ 原文精读 ↔ 原文 PDF =====
  // 用 jobId 做钥匙：摘要卡的 jobId、译文的 job_id、精读的 job_id 指向同一次转写任务。
  function findSummaryByJob(jobId) {
    if (!jobId) return null;
    for (var i = 0; i < summaryAll.length; i++) {
      if (summaryAll[i].jobId === jobId) return summaryAll[i];
    }
    return null;
  }

  function findTranslationByJob(jobId) {
    if (!jobId) return null;
    var list = state.translations || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].job_id === jobId) return list[i];
    }
    return null;
  }

  function findReadingByJob(jobId) {
    if (!jobId) return null;
    var list = state.readings || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].job_id === jobId) return list[i];
    }
    return null;
  }

  // 关联条需要的三个列表：摘要卡已随卡片库加载，译文/精读按需补
  function ensureXrefData(cb) {
    var waits = [];
    if (!transLoaded) waits.push(loadTranslations());
    if (!readLoaded) waits.push(loadReadings());
    if (!waits.length) { cb(); return; }
    Promise.all(waits).then(function () { cb(); }, function () { cb(); });
  }

  function renderXrefBar(sel, jobId, current) {
    var el = $(sel);
    if (!el) return;
    el.dataset.jobId = jobId || '';
    var hasSummary = !!findSummaryByJob(jobId);
    var hasTrans = !!findTranslationByJob(jobId);
    var hasRead = !!findReadingByJob(jobId);
    var busyRead = readIsRunning(jobId);
    function btn(kind, label, on, hint, busy) {
      var cls = 'xref-btn' + (kind === current ? ' is-current'
        : (busy ? ' is-busy' : (on ? ' is-on' : ' is-off')));
      var title = kind === current ? '你已经在这里了'
        : (busy ? '正在生成，点一下看进度'
          : (on ? hint : hint + '（还没有，点一下可以直接生成）'));
      return '<button class="' + cls + '" data-xref="' + kind + '" title="' + escapeHtml(title) + '">' +
        escapeHtml(label) + '</button>';
    }
    // 「还没有」时按钮文案直接说「生成原文精读」——用户一眼就知道点它能补齐，
    // 不必再回 PDF 转写把整篇重跑一遍
    var readLabel = busyRead
      ? ('精读生成中 ' + readTaskState.done + '/' + readTaskState.total)
      : (hasRead ? '原文精读' : '生成原文精读');
    el.innerHTML = '<span class="xref-label">关联</span>' +
      btn('summary', '精读卡片', hasSummary, '跳到这篇的摘要卡片') +
      btn('translation', '译文', hasTrans, '跳到这篇的全文译文') +
      btn('reading', readLabel, hasRead, '跳到这篇的精读长文', busyRead) +
      '<button class="xref-btn xref-pdf" data-xref="pdf" title="在默认浏览器（Edge）里打开这篇的原文 PDF">原文 PDF ↗</button>';
  }

  // 精读任务进度一变，把当前显示着的关联条也刷一遍（按钮上的进度要动）
  function refreshVisibleXref() {
    [['#summaryXref', 'summary'], ['#transXref', 'translation'], ['#readXref', 'reading']].forEach(function (m) {
      var el = $(m[0]);
      if (el && el.dataset.jobId) renderXrefBar(m[0], el.dataset.jobId, m[1]);
    });
  }

  function bindXrefBar(sel) {
    var el = $(sel);
    if (!el) return;
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('.xref-btn');
      if (!btn) return;
      onXrefClick(el.dataset.jobId || '', btn.dataset.xref);
    });
  }

  function onXrefClick(jobId, target) {
    if (target === 'pdf') { openOriginalPdf(jobId); return; }
    if (!jobId) {
      toast('这篇还没有转写任务（只有标题和摘要），先在 PDF 转写里转一次原文');
      return;
    }
    if (target === 'summary') {
      var s = findSummaryByJob(jobId);
      if (!s) { toast('这篇还没有摘要卡片：转写后在「摘要」标签生成，点「保存」即入卡片库'); return; }
      switchPanel('summaries');
      openSummaryDetail(s.id);
      return;
    }
    if (target === 'translation') {
      var t = findTranslationByJob(jobId);
      if (!t) { toast('这篇译文还没进译文库：转写后翻译全文，点「存入译文库」'); return; }
      switchPanel('translations');
      openTranslationDetail(t.id);
      return;
    }
    if (target === 'reading') {
      var r = findReadingByJob(jobId);
      if (r) {
        switchPanel('readings');
        openReadingDetail(r.id);
        return;
      }
      // 还没有 → 不让他回 PDF 转写重跑，就地生成（确认后开始）
      generateReadingFor(jobId, crossLinkTitle(jobId));
    }
  }

  function crossLinkTitle(jobId) {
    var hit = findSummaryByJob(jobId) || findTranslationByJob(jobId);
    return hit ? (hit.title || hit.title_en || '') : '';
  }

  function openOriginalPdf(jobId) {
    if (!jobId) { toast('这篇没有关联的转写任务，找不到原文 PDF'); return; }
    // 由 worker 以 application/pdf 回原件，浏览器（Edge）里直接内嵌打开
    window.open('/api/pdf/original?jobId=' + encodeURIComponent(jobId), '_blank');
  }

  function openSummaryDetail(id) {
    api('/api/pdf/summary?id=' + encodeURIComponent(id)).then(function (d) {
      if (!d.ok) { toast('加载失败：' + (d.error || '')); return; }
      var record = d.record || {};
      var summary = record.summary || {};

      var title = record.title || record.title_en || '未命名论文';
      $('#summaryDetailTitle').textContent = title + (record.year ? ' · ' + record.year : '');
      summaryCurrentId = id;
      renderSummaryTagChips(record.tags || []);
      // 恢复这张卡自己的建议状态（加载中 / 已出建议 / 无），互不串台
      renderTagSuggestArea();

      var container = $('#summaryDetailContent');
      if (container) {
        renderSummaryToElement(summary, container);
      }

      $('#summariesListView').style.display = 'none';
      $('#summariesDetailView').style.display = '';
      renderCardJournalMentions(record, container);
      // 关联条先按已有数据渲染一次，译文库/精读库列表到位后再刷一遍，
      // 免得列表还没加载时把「已有译文」误判成「还没有」
      var jid = record.jobId || '';
      renderXrefBar('#summaryXref', jid, 'summary');
      ensureXrefData(function () { renderXrefBar('#summaryXref', jid, 'summary'); });
    }).catch(function () { toast('加载失败'); });
  }

  // ===== 摘要 ↔ 日志互链：卡片详情显示「日志提及」；日志文本渲染 [[card:标题]] =====
  function renderCardJournalMentions(record, container) {
    if (!container) return;
    var old = container.querySelector('.sum-journal-mentions');
    if (old) old.remove();
    var title = record.title || record.title_en || '';
    if (!title) return;
    var tLower = title.toLowerCase();
    var hits = (state.journal || []).filter(function (j) {
      return (j.content || '').toLowerCase().indexOf(tLower) >= 0;
    });
    var box = document.createElement('div');
    box.className = 'sum-journal-mentions';
    if (hits.length) {
      box.innerHTML = '<div class="sum-mentions-head">日志提及（' + hits.length + '）</div>' +
        hits.slice(0, 3).map(function (j) {
          return '<div class="sum-mention-item"><span class="sum-mention-date">' + escapeHtml(j.date || j.created || '') + '</span>' +
            escapeHtml(String(j.content || '').slice(0, 80)) + '</div>';
        }).join('');
    } else {
      box.innerHTML = '<div class="sum-mentions-head">日志提及</div>' +
        '<div class="sum-mention-item sum-mention-empty">研究日志里还没写过这篇。去日志里用 [[card:' + escapeHtml(title) + ']] 引用它吧</div>';
    }
    container.appendChild(box);
  }

  function renderJournalText(text) {
    var esc = escapeHtml(String(text || ''));
    // [[card:标题]] → 卡片引用链接（点击跳转摘要卡片并打开详情）
    return esc.replace(/\[\[card:([^\]]+)\]\]/g, function (_, title) {
      return '<a class="journal-card-link" data-card-title="' + title + '" href="javascript:void(0)">' + title + '</a>';
    });
  }

  function jumpToCard(title) {
    var t = String(title || '').trim().toLowerCase();
    var hit = null;
    for (var i = 0; i < summaryAll.length; i++) {
      var s = summaryAll[i];
      var a = (s.title || '').toLowerCase();
      var b = (s.title_en || '').toLowerCase();
      if ((a && (a === t || a.indexOf(t) >= 0)) || (b && (b === t || b.indexOf(t) >= 0))) { hit = s; break; }
    }
    if (!hit) { toast('卡片库里没找到「' + title + '」'); return; }
    switchPanel('summaries');
    openSummaryDetail(hit.id);
  }

  // ===== 专注（番茄钟）=====
  // 计时用「结束时间戳」而不是「每秒减 1」：标签页切到后台时浏览器会把 setInterval
  // 降频甚至暂停，减 1 的算法会让计时越来越慢（用户会以为 25 分钟到了、其实还早）。
  // 进行中的一轮同时写进 localStorage，刷新/关标签都能接着跑（此前刷新即丢）。
  var FOCUS_PRESETS = [15, 25, 45, 60];
  var FOCUS_BREAK_SEC = 5 * 60;
  var FOCUS_LOG_KEY = 'wb_focus_log';
  var FOCUS_STATE_KEY = 'wb_focus_state';
  var FOCUS_PRESET_KEY = 'wb_focus_preset';
  var FOCUS_LOG_MAX = 200;
  var FOCUS_TICK_MS = 250;   // 刷新频率：只影响数字与环的顺滑度，不影响计时准确性

  var pomoCounts = {};
  try { pomoCounts = JSON.parse(localStorage.getItem('wb_pomo_counts') || '{}') || {}; } catch (e) { pomoCounts = {}; }

  var focusPreset = 25;
  try {
    var savedPreset = parseInt(localStorage.getItem(FOCUS_PRESET_KEY) || '', 10);
    if (FOCUS_PRESETS.indexOf(savedPreset) >= 0) focusPreset = savedPreset;
  } catch (e) {}

  var focusState = {
    mode: 'focus', totalSec: focusPreset * 60,
    endAt: 0, leftMs: focusPreset * 60000,
    paused: false, running: false, done: false,
    todoId: null, text: '', startedAt: 0, interval: null
  };

  function pomoDayKey(d) {
    var dt = d || new Date();
    return 'wb_pomo_minutes_' + dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
  }

  function pomoMinutesOn(d) {
    return parseInt(localStorage.getItem(pomoDayKey(d)) || '0', 10) || 0;
  }

  // ---------- 记录（单次明细，用于「近 7 天」与记录列表）----------
  function focusLogAll() {
    try {
      var v = JSON.parse(localStorage.getItem(FOCUS_LOG_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function focusLogAdd(entry) {
    var list = focusLogAll();
    list.unshift(entry);
    if (list.length > FOCUS_LOG_MAX) list = list.slice(0, FOCUS_LOG_MAX);
    try { localStorage.setItem(FOCUS_LOG_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function focusIsSameDay(ts, d) {
    if (!ts) return false;
    var a = new Date(ts), b = d || new Date();
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // ---------- 计时核心 ----------
  function focusRemainingMs() {
    if (!focusState.running) return Math.max(0, focusState.leftMs);
    return Math.max(0, focusState.endAt - Date.now());
  }

  function fmtClock(ms) {
    var s = Math.ceil(Math.max(0, ms) / 1000);
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function focusIsActive() {
    return !!(focusState.running || focusState.paused);
  }

  function focusPersist() {
    try {
      localStorage.setItem(FOCUS_STATE_KEY, JSON.stringify({
        mode: focusState.mode, totalSec: focusState.totalSec,
        endAt: focusState.endAt, leftMs: focusState.leftMs,
        paused: focusState.paused, todoId: focusState.todoId,
        text: focusState.text, startedAt: focusState.startedAt
      }));
    } catch (e) {}
  }

  function focusUnpersist() {
    try { localStorage.removeItem(FOCUS_STATE_KEY); } catch (e) {}
  }

  function focusStartTicker() {
    if (focusState.interval) clearInterval(focusState.interval);
    focusState.interval = setInterval(focusTick, FOCUS_TICK_MS);
  }

  function focusStopTicker() {
    if (focusState.interval) { clearInterval(focusState.interval); focusState.interval = null; }
  }

  function focusTick() {
    if (!focusState.running) return;
    if (focusRemainingMs() <= 0) { focusComplete(false); return; }
    focusPaint();
    focusSyncBadge();
  }

  function focusBegin(mode, todoId, text) {
    mode = mode || 'focus';
    var totalSec = mode === 'break' ? FOCUS_BREAK_SEC : focusPreset * 60;
    focusStopTicker();
    focusState = {
      mode: mode, totalSec: totalSec,
      endAt: Date.now() + totalSec * 1000, leftMs: totalSec * 1000,
      paused: false, running: true, done: false,
      todoId: todoId || null, text: text || '',
      startedAt: Date.now(), interval: null
    };
    focusPersist();
    focusStartTicker();
    focusRenderAll();
    return totalSec;
  }

  function focusStart() {
    if (focusIsActive()) { toast('已经有一轮在进行了'); return; }
    var sel = $('#focusTaskSelect');
    var todoId = sel && sel.value ? parseInt(sel.value, 10) : null;
    var t = todoId ? todoById(todoId) : null;
    var kind = t ? '专注' : '自由专注';
    var sec = focusBegin('focus', todoId, t ? t.text : '');
    toast(kind + '开始，' + (sec / 60) + ' 分钟');
  }

  // 从待办卡上的「专注」按钮进来：带着那条待办开始
  function startPomo(id) {
    var t = todoById(id);
    if (!t) return;
    if (focusIsActive()) { toast('已经有一轮在跑了，先结束它'); return; }
    focusBegin('focus', id, t.text);
    var sel = $('#focusTaskSelect');
    if (sel) sel.value = String(id);
    toast('开始专注：' + (t.text.length > 16 ? t.text.slice(0, 16) + '…' : t.text));
  }

  function focusPause() {
    if (!focusState.running) return;
    focusState.leftMs = focusRemainingMs();
    focusState.paused = true;
    focusState.running = false;
    focusStopTicker();
    focusPersist();
    focusRenderAll();
  }

  function focusResume() {
    if (!focusState.paused) return;
    focusState.endAt = Date.now() + focusState.leftMs;
    focusState.paused = false;
    focusState.running = true;
    focusPersist();
    focusStartTicker();
    focusRenderAll();
  }

  // 放弃：把已经专注的那部分记进记录（诚实记录，但不算「完成」）
  function focusGiveUp() {
    if (!focusIsActive()) return;
    var st = focusState;
    var spentSec = Math.max(0, (st.totalSec * 1000 - focusRemainingMs()) / 1000);
    var minutes = Math.round(spentSec / 60);
    if (minutes >= 1) {
      if (st.mode === 'focus') {
        try { localStorage.setItem(pomoDayKey(), String(pomoMinutesOn() + minutes)); } catch (e) {}
      }
      focusLogAdd({
        id: 'f' + Date.now(), mode: st.mode, start: st.startedAt, end: Date.now(),
        minutes: minutes, todoId: st.todoId, text: st.text, completed: false
      });
    }
    focusStopTicker();
    focusUnpersist();
    var wasMin = minutes;
    resetFocusState();
    focusRenderAll();
    renderWeekReview();
    toast(minutes >= 1 ? ('已放弃，' + wasMin + ' 分钟记入专注流水') : '已放弃本轮');
  }

  function resetFocusState() {
    focusState = {
      mode: 'focus', totalSec: focusPreset * 60,
      endAt: 0, leftMs: focusPreset * 60000,
      paused: false, running: false, done: false,
      todoId: null, text: '', startedAt: 0, interval: null
    };
  }

  // silent=true 用于「页面关着时已经跑完」的补记（不弹完成动画）
  function focusComplete(silent) {
    var st = focusState;
    var spentSec = st.running
      ? Math.max(0, (Date.now() - st.startedAt) / 1000)
      : Math.max(0, (st.totalSec * 1000 - st.leftMs) / 1000);
    var minutes = Math.max(1, Math.round(spentSec / 60));
    var isBreak = st.mode === 'break';

    focusLogAdd({
      id: 'f' + Date.now(), mode: st.mode, start: st.startedAt, end: Date.now(),
      minutes: minutes, todoId: st.todoId, text: st.text, completed: true
    });
    if (!isBreak) {
      try { localStorage.setItem(pomoDayKey(), String(pomoMinutesOn() + minutes)); } catch (e) {}
      if (st.todoId) {
        pomoCounts[st.todoId] = (pomoCounts[st.todoId] || 0) + 1;
        try { localStorage.setItem('wb_pomo_counts', JSON.stringify(pomoCounts)); } catch (e) {}
      }
    }
    focusStopTicker();
    focusUnpersist();

    if (silent) { resetFocusState(); focusRenderAll(); renderWeekReview(); return; }

    // 保留一份「刚完成」的状态用于渲染完成态（环变绿 + 扩散波 + 下一步建议）
    focusState = {
      mode: st.mode, totalSec: st.totalSec,
      endAt: 0, leftMs: 0, paused: false, running: false, done: true,
      todoId: st.todoId, text: st.text, startedAt: st.startedAt,
      interval: null, lastMinutes: minutes
    };
    focusRenderAll();
    renderTodos();
    renderWeekReview();
    if (typeof renderTodayBoard === 'function') renderTodayBoard();
    toast(isBreak ? '休息结束，继续加油' : ('专注完成！今日累计 ' + pomoMinutesOn() + ' 分钟'));
  }

  // 启动时恢复未跑完/已跑完的一轮
  function focusRestore() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(FOCUS_STATE_KEY) || 'null'); } catch (e) {}
    if (!raw || !raw.totalSec) return;
    if (raw.paused) {
      focusState = {
        mode: raw.mode || 'focus', totalSec: raw.totalSec,
        endAt: 0, leftMs: raw.leftMs || 0, paused: true, running: false, done: false,
        todoId: raw.todoId || null, text: raw.text || '',
        startedAt: raw.startedAt || Date.now(), interval: null
      };
      focusRenderAll();
      toast('已恢复上一轮（暂停中）：还剩 ' + fmtClock(focusState.leftMs));
      return;
    }
    var left = (raw.endAt || 0) - Date.now();
    if (left > 0) {
      focusState = {
        mode: raw.mode || 'focus', totalSec: raw.totalSec,
        endAt: raw.endAt, leftMs: left, paused: false, running: true, done: false,
        todoId: raw.todoId || null, text: raw.text || '',
        startedAt: raw.startedAt || Date.now(), interval: null
      };
      focusStartTicker();
      focusRenderAll();
      toast('已恢复上一轮，还剩 ' + fmtClock(left));
    } else {
      // 页面没开着的时候已经跑完了：静默补记
      focusState = {
        mode: raw.mode || 'focus', totalSec: raw.totalSec,
        endAt: raw.endAt, leftMs: 0, paused: false, running: false, done: false,
        todoId: raw.todoId || null, text: raw.text || '',
        startedAt: raw.startedAt || Date.now(), interval: null
      };
      focusComplete(true);
    }
  }

  // ---------- 渲染 ----------
  function todoById(id) {
    for (var i = 0; i < state.todos.length; i++) { if (String(state.todos[i].id) === String(id)) return state.todos[i]; }
    return null;
  }

  // 轻量刷新：数字 / 环 / 浮条（每 250ms 一次，别在这里动 DOM 结构）
  function focusPaint() {
    var left = focusRemainingMs();
    var totalMs = Math.max(1, focusState.totalSec * 1000);
    var ratio = Math.min(1, Math.max(0, 1 - left / totalMs));   // 0 → 1 表示「已走过」
    var txt = fmtClock(left);

    var ft = $('#focusTime');
    if (ft) ft.textContent = txt;
    var ring = $('#focusRingProgress');
    if (ring) ring.style.strokeDashoffset = String(678.6 * (1 - ratio));

    // 侧栏徽标与浮条跟随
    var pc = $('#pomoClock');
    if (pc) pc.textContent = txt;
    var pf = $('#pomoRingFg');
    if (pf) pf.style.strokeDashoffset = String(125.66 * (1 - ratio));
    var badge = $('#navFocusBadge');
    if (badge && focusIsActive()) badge.textContent = txt;

    // 文档标题：切到别的标签也能看到剩余时间
    var base = document.title.replace(/^\d{2}:\d{2} · /, '');
    document.title = focusIsActive() ? (txt + ' · ' + base) : base;
  }

  function focusRenderStage() {
    var wrap = $('#focusRingWrap');
    if (!wrap) return;
    wrap.classList.toggle('is-running', !!focusState.running);
    wrap.classList.toggle('is-paused', !!focusState.paused);
    wrap.classList.toggle('is-break', focusState.mode === 'break');
    wrap.classList.toggle('is-done', !!focusState.done);

    var chip = $('#focusModeChip');
    if (chip) chip.textContent = focusState.mode === 'break' ? '休息' : (focusState.done ? '完成' : '专注');

    var label = $('#focusTaskLabel');
    if (label) {
      if (focusState.mode === 'break') {
        label.textContent = focusState.done ? '休息结束' : '离开屏幕，放松一下';
      } else {
        var t = focusState.text || (focusState.todoId ? '' : '自由专注');
        label.textContent = focusState.done
          ? ((focusState.lastMinutes || 0) + ' 分钟已记录')
          : (t || '自由专注');
      }
    }

    var ripples = $('#focusRipples');
    if (ripples) {
      if (focusState.done && !focusLastDone) {
        // 只在「刚变完成」时播放一次扩散波（重复渲染不该反复播）
        ripples.hidden = true;
        /* 强制重排，让动画从头播放 */
        void ripples.offsetWidth;
        ripples.hidden = false;
      } else if (!focusState.done) {
        ripples.hidden = true;
      }
    }
    focusLastDone = !!focusState.done;
    focusPaint();
  }

  function focusRenderControls() {
    var startBtn = $('#focusStartBtn');
    var pauseBtn = $('#focusPauseBtn');
    var giveUpBtn = $('#focusGiveUpBtn');
    var next = $('#focusNext');
    var setup = $('#focusSetupCard');
    if (!startBtn) return;

    var running = focusState.running, paused = focusState.paused, done = focusState.done;
    var active = running || paused;

    startBtn.hidden = active;
    startBtn.textContent = done
      ? (focusState.mode === 'break' ? '再来一轮' : '再专注一轮')
      : (focusState.mode === 'break' ? '开始休息' : '开始专注');

    pauseBtn.hidden = !active;
    if (active) pauseBtn.textContent = paused ? '继续' : '暂停';
    giveUpBtn.hidden = !active;

    // 进行中不让改设置（改了也不该影响这一轮）
    if (setup) {
      setup.style.opacity = active ? '.45' : '';
      setup.style.pointerEvents = active ? 'none' : '';
    }

    if (next) {
      if (done) {
        next.hidden = false;
        if (focusState.mode === 'break') {
          next.innerHTML = '<span class="focus-next-text">休息结束，要不要再来一轮？</span>' +
            '<button class="focus-next-btn" data-focus-next="again">开始专注</button>' +
            '<button class="focus-next-skip" data-focus-next="dismiss">先不用</button>';
        } else {
          next.innerHTML = '<span class="focus-next-text">完成一轮，休息一下再继续？</span>' +
            '<button class="focus-next-btn" data-focus-next="break">休息 5 分钟</button>' +
            '<button class="focus-next-skip" data-focus-next="dismiss">先不用</button>';
        }
      } else {
        next.hidden = true;
        next.innerHTML = '';
      }
    }
  }

  function focusRenderSetup() {
    var box = $('#focusPresets');
    if (box) {
      // 按钮里只放数字（四个一行排得下），单位在标签里说明
      box.innerHTML = FOCUS_PRESETS.map(function (m) {
        return '<button class="focus-preset' + (m === focusPreset ? ' active' : '') + '" data-preset="' + m + '">' + m + '</button>';
      }).join('');
    }
    var sel = $('#focusTaskSelect');
    if (sel) {
      var cur = sel.value;
      var opts = ['<option value="">自由专注（不关联任务）</option>'];
      state.todos.filter(function (t) { return !t.done; }).forEach(function (t) {
        opts.push('<option value="' + t.id + '">' + escapeHtml(t.text.slice(0, 30)) + '</option>');
      });
      sel.innerHTML = opts.join('');
      if (cur) sel.value = cur;
    }
    var hint = $('#focusSetupHint');
    if (hint) {
      var pending = state.todos.filter(function (t) { return !t.done; }).length;
      hint.textContent = pending
        ? ('可以选一条待办绑定这一轮，完成会在待办卡上记一次专注；不选就是自由专注。')
        : '还没有待办，这一轮会是自由专注。';
    }
  }

  function focusRenderToday() {
    var box = $('#focusToday');
    if (!box) return;
    var list = focusLogAll();
    var todayMin = pomoMinutesOn();
    var todayRounds = list.filter(function (e) {
      return e.mode === 'focus' && e.completed && focusIsSameDay(e.start);
    }).length;
    // 连续天数：从今天往前数，只要有专注记录就不算断
    var streak = 0;
    for (var i = 0; i < 400; i++) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var has = pomoMinutesOn(d) > 0 || list.some(function (e) {
        return e.mode === 'focus' && focusIsSameDay(e.start, d);
      });
      if (has) streak++;
      else if (i > 0) break;   // 今天还没开始也不算断
      else if (i === 0) continue;
    }
    box.innerHTML =
      '<div class="focus-stat"><span class="focus-stat-num">' + todayMin + '<em>分</em></span><span class="focus-stat-label">今日专注</span></div>' +
      '<div class="focus-stat"><span class="focus-stat-num">' + todayRounds + '<em>轮</em></span><span class="focus-stat-label">今日完成</span></div>' +
      '<div class="focus-stat"><span class="focus-stat-num">' + streak + '<em>天</em></span><span class="focus-stat-label">连续专注</span></div>';
  }

  function focusRenderBars() {
    var box = $('#focusBars');
    if (!box) return;
    var days = [], max = 0;
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var min = pomoMinutesOn(d);
      if (min > max) max = min;
      days.push({ d: d, min: min, isToday: i === 0 });
    }
    var hint = $('#focusBarsHint');
    if (hint) hint.hidden = max > 0;
    var week = ['日', '一', '二', '三', '四', '五', '六'];
    box.innerHTML = days.map(function (x) {
      var h = max > 0 ? Math.round(x.min / max * 100) : 0;
      var cls = 'focus-bar' + (x.isToday ? ' is-today' : '') + (x.min ? '' : ' is-empty');
      return '<div class="' + cls + '">' +
        '<span class="focus-bar-val">' + (x.min || '') + '</span>' +
        '<div class="focus-bar-track"><div class="focus-bar-fill" style="--h:' + h + '%"></div></div>' +
        '<span class="focus-bar-label">' + (x.isToday ? '今天' : '周' + week[x.d.getDay()]) + '</span>' +
        '</div>';
    }).join('');
  }

  function focusRenderLog() {
    var box = $('#focusLog');
    if (!box) return;
    var list = focusLogAll().slice(0, 12);
    if (!list.length) {
      box.innerHTML = '<div class="focus-log-empty">还没有专注记录。开始第一轮吧。</div>';
      return;
    }
    box.innerHTML = list.map(function (e, i) {
      var t = new Date(e.start || Date.now());
      var hm = function (n) { return (n < 10 ? '0' : '') + n; };
      var when = (t.getMonth() + 1) + '月' + t.getDate() + '日 ' + hm(t.getHours()) + ':' + hm(t.getMinutes());
      var isBreak = e.mode === 'break';
      var cls = 'focus-log-item' + (isBreak ? ' is-break' : '') + (e.completed ? '' : ' is-giving-up');
      var title = isBreak ? '休息' : (e.text || '自由专注');
      var status = e.completed ? '' : ' · 中途放弃';
      return '<div class="' + cls + '" style="--i:' + i + '">' +
        '<span class="focus-log-dot"></span>' +
        '<div class="focus-log-main">' +
        '<div class="focus-log-title' + (e.text || isBreak ? '' : ' is-empty') + '">' + escapeHtml(title) + '</div>' +
        '<div class="focus-log-meta">' + when + status + '</div>' +
        '</div>' +
        '<span class="focus-log-min">' + (isBreak ? '休息 ' : '') + e.minutes + ' 分</span>' +
        '</div>';
    }).join('');
  }

  function focusSyncBadge() {
    var badge = $('#navFocusBadge');
    if (!badge) return;
    var active = focusIsActive();
    badge.hidden = !active;
    badge.classList.toggle('is-timing', active);
    badge.classList.toggle('is-paused', !!focusState.paused);
    badge.textContent = active ? fmtClock(focusRemainingMs()) : '';
  }

  function focusRenderFloating() {
    var bar = $('#pomoTimer');
    if (!bar) return;
    var active = focusIsActive();
    bar.hidden = !active;
    if (!active) return;
    var task = $('#pomoTask');
    if (task) {
      var name = focusState.mode === 'break' ? '休息' : (focusState.text || '自由专注');
      task.textContent = (focusState.paused ? '已暂停 · ' : '') + (name.length > 14 ? name.slice(0, 14) + '…' : name);
    }
    var pauseBtn = $('#pomoPauseBtn');
    if (pauseBtn) pauseBtn.textContent = focusState.paused ? '继续' : '暂停';
  }

  function focusRenderAll() {
    focusRenderStage();
    focusRenderControls();
    focusRenderSetup();
    focusRenderToday();
    focusRenderBars();
    focusRenderLog();
    focusSyncBadge();
    focusRenderFloating();
  }

  var focusLastDone = false;   // 用于「完成瞬间只播一次扩散波」

  function renderWeekReview() {
    var box = $('#weekReview');
    if (!box) return;
    var now = new Date();
    var day = now.getDay() || 7;
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
    function inWeek(dateStr) {
      var d = new Date(String(dateStr || '').replace(' ', 'T'));
      return !isNaN(d.getTime()) && d >= monday;
    }
    var todosNew = state.todos.filter(function (t) { return inWeek(t.created); }).length;
    var todosDone = state.todos.filter(function (t) { return t.done && inWeek(t.created); }).length;
    var journalN = state.journal.filter(function (j) { return inWeek(j.date || j.created); }).length;
    var cardsN = summaryAll.filter(function (s) { return inWeek(s.created_at); }).length;
    var pomoMin = 0;
    for (var i = 0; i < 7; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      if (d >= monday) pomoMin += pomoMinutesOn(d);
    }
    var fmt = function (d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; };
    box.hidden = false;
    box.innerHTML =
      '<div class="week-review-head"><span class="week-review-title">本周回顾</span>' +
      '<span class="week-review-range">' + fmt(monday) + ' – ' + fmt(now) + '</span></div>' +
      '<div class="week-review-grid">' +
      '<div class="week-cell"><span class="week-num">' + cardsN + '</span><span class="week-label">新增卡片</span></div>' +
      '<div class="week-cell"><span class="week-num">' + todosDone + '<em>/' + todosNew + '</em></span><span class="week-label">完成/新增待办</span></div>' +
      '<div class="week-cell"><span class="week-num">' + journalN + '</span><span class="week-label">日志条数</span></div>' +
      '<div class="week-cell"><span class="week-num">' + pomoMin + '<em> 分钟</em></span><span class="week-label">专注时长</span></div>' +
      '</div>';
  }

  function renderSummaryToElement(d, el) {
    var html = '';
    if (d.one_liner) html += '<div class="sum-oneliner">' + escapeHtml(d.one_liner) + '</div>';
    if (d.innovation) html += '<h3>创新点</h3><p>' + escapeHtml(d.innovation).replace(/\n/g, '<br>') + '</p>';
    if (d.abstract_zh) html += '<h3>中文摘要</h3><p>' + escapeHtml(d.abstract_zh).replace(/\n/g, '<br>') + '</p>';
    if (d.abstract_en) html += '<h3>Abstract</h3><p class="sum-abstract-en">' + escapeHtml(d.abstract_en).replace(/\n/g, '<br>') + '</p>';
    if (d.keywords) {
      var kws = d.keywords.split(/[,，]/).map(function (k) { return k.trim(); }).filter(Boolean);
      html += '<h3>关键词</h3><p>' + kws.map(function (k) { return '<span class="pdf-kw-tag">' + escapeHtml(k) + '</span>'; }).join(' ') + '</p>';
    }
    if (d.research_question) html += '<h3>研究问题与意义</h3><p>' + escapeHtml(d.research_question).replace(/\n/g, '<br>') + '</p>';
    if (d.methodology) html += '<h3>方法论架构</h3><p>' + escapeHtml(d.methodology).replace(/\n/g, '<br>') + '</p>';
    if (d.key_findings && d.key_findings.length) {
      html += '<h3>关键发现</h3><ul class="sum-findings">';
      d.key_findings.forEach(function (f) { html += '<li>' + escapeHtml(f) + '</li>'; });
      html += '</ul>';
    }
    if (d.theoretical_contribution) html += '<h3>理论贡献</h3><p>' + escapeHtml(d.theoretical_contribution).replace(/\n/g, '<br>') + '</p>';
    if (d.breakthroughs && d.breakthroughs.length) {
      html += '<h3>关键突破</h3><div class="sum-breakthroughs">';
      d.breakthroughs.forEach(function (b, i) {
        var title = b.title || ('突破' + (i + 1));
        var desc = b.description || b.desc || '';
        var imp = b.importance || b.importance_level || 3;
        var why = b.why || '';
        var stars = '';
        for (var s = 0; s < 5; s++) { stars += s < imp ? '★' : '☆'; }
        html += '<div class="sum-breakthrough-item">';
        html += '<div class="sum-breakthrough-title"><span class="sum-breakthrough-num">' + (i + 1) + '</span>' + escapeHtml(title) + '<span class="sum-breakthrough-stars">' + stars + '</span></div>';
        if (desc) html += '<div class="sum-breakthrough-desc">' + escapeHtml(desc) + '</div>';
        if (why) html += '<div class="sum-breakthrough-why">为什么重要：' + escapeHtml(why) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    if ((d.strengths && d.strengths.length) || (d.limitations && d.limitations.length)) {
      html += '<div class="sum-sl-grid">';
      if (d.strengths && d.strengths.length) {
        html += '<div class="sum-sl-card sum-strengths"><h4>主要优势</h4><ul>';
        d.strengths.forEach(function (s) { html += '<li>' + escapeHtml(s) + '</li>'; });
        html += '</ul></div>';
      }
      if (d.limitations && d.limitations.length) {
        html += '<div class="sum-sl-card sum-limitations"><h4>主要局限</h4><ul>';
        d.limitations.forEach(function (l) {
          var content = typeof l === 'object' ? (l.content || l.text || '') : l;
          var severity = typeof l === 'object' ? (l.severity || '') : '';
          html += '<li>' + escapeHtml(content) + (severity ? ' <span class="sum-severity sum-severity-' + severity + '">[' + severity + ']</span>' : '') + '</li>';
        });
        html += '</ul></div>';
      }
      html += '</div>';
    }
    if (d.questions && d.questions.length) {
      html += '<h3>待改进与疑惑清单</h3><div class="sum-questions">';
      d.questions.forEach(function (q, i) {
        var question = q.question || q.text || q.content || ('问题' + (i + 1));
        var type = q.type || '';
        var impact = q.impact || '';
        var typeClass = type === '关键问题' ? 'critical' : (type === '方法问题' ? 'method' : 'understanding');
        html += '<div class="sum-question-item sum-question-' + typeClass + '">';
        if (type) html += '<span class="sum-question-type">' + escapeHtml(type) + '</span>';
        html += '<div class="sum-question-text">' + escapeHtml(question) + '</div>';
        if (impact) html += '<div class="sum-question-impact">影响：' + escapeHtml(impact) + '</div>';
        html += '</div>';
      });
      html += '</div>';
    }
    if (d.implications) html += '<h3>对研究的启示</h3><p>' + escapeHtml(d.implications).replace(/\n/g, '<br>') + '</p>';
    if (d.future_directions && d.future_directions.length) {
      html += '<h3>进一步研究方向</h3><ul class="sum-findings">';
      d.future_directions.forEach(function (f) { html += '<li>' + escapeHtml(f) + '</li>'; });
      html += '</ul>';
    }
    el.innerHTML = html;
  }

  function initPdfImageLightbox() {
    $('#pdfImgLightboxClose').addEventListener('click', closePdfImageLightbox);
    $('#pdfImgLightboxOverlay').addEventListener('click', closePdfImageLightbox);
    $('#pdfImgLightboxImg').addEventListener('click', closePdfImageLightbox);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#pdfImgLightbox').hidden) {
        closePdfImageLightbox();
      }
    });
  }

  // ===== 从 Markdown 提取非文字元素（图片 / 公式 / 表格）=====
  function extractPdfAssets(md) {
    var assets = { images: [], formulas: [], tables: [] };
    if (!md) return assets;
    var lines = md.split('\n');
    var seenImg = {};
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      // 块级公式 $$...$$（单行或跨行）
      if (trimmed.startsWith('$$')) {
        var buf = [trimmed];
        var singleLine = trimmed.length > 4 && trimmed.endsWith('$$');
        if (!singleLine) {
          i++;
          while (i < lines.length && !lines[i].trim().endsWith('$$')) {
            buf.push(lines[i]);
            i++;
          }
          if (i < lines.length) buf.push(lines[i]);
        }
        assets.formulas.push(buf.join('\n'));
        i++;
        continue;
      }

      // 独立成行的公式 $...$
      if (/^\$[^$]+\$$/.test(trimmed) && trimmed.length > 2) {
        assets.formulas.push(trimmed);
        i++;
        continue;
      }

      // 表格：连续以 | 开头的行
      if (trimmed.startsWith('|')) {
        var tbuf = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tbuf.push(lines[i]);
          i++;
        }
        if (tbuf.length >= 2) assets.tables.push(tbuf.join('\n'));
        continue;
      }

      // 图片（行内或独立行，按 src 去重）
      var imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
      var m;
      while ((m = imgRe.exec(line)) !== null) {
        if (!seenImg[m[2]]) {
          seenImg[m[2]] = true;
          assets.images.push({ alt: m[1], src: m[2] });
        }
      }
      i++;
    }
    return assets;
  }

  // Markdown 表格 → HTML <table>
  function markdownTableToHtml(md) {
    var rows = md.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.indexOf('|') === 0; });
    if (rows.length < 2) return '';
    function splitRow(row) {
      return row.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
    }
    var header = splitRow(rows[0]);
    var body = rows.slice(2).map(splitRow);
    var html = '<table><thead><tr>';
    header.forEach(function (h) { html += '<th>' + escapeHtml(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    body.forEach(function (r) {
      html += '<tr>';
      r.forEach(function (c) { html += '<td>' + renderInline(c) + '</td>'; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  // 渲染「图片公式」汇总视图
  function renderPdfAssets(md, jobId) {
    var container = $('#pdfAssets');
    if (!container) return;
    var assets = extractPdfAssets(md);
    var total = assets.images.length + assets.formulas.length + assets.tables.length;
    if (total === 0) {
      container.innerHTML = '<div class="pdf-assets-empty">未检测到图片、公式或表格（本文可能为纯文字文档）</div>';
      return;
    }
    var html = '';
    if (assets.images.length) {
      html += '<div class="pdf-assets-section"><div class="pdf-assets-title">图片（' + assets.images.length + '）</div><div class="pdf-assets-grid">';
      assets.images.forEach(function (img, idx) {
        var url = img.src.indexOf('images/') === 0
          ? '/api/pdf/asset?jobId=' + encodeURIComponent(jobId) + '&file=' + encodeURIComponent(img.src)
          : img.src;
        html += '<div class="pdf-assets-img"><img src="' + url + '" alt="' + escapeHtml(img.alt) + '" loading="lazy" title="' + escapeHtml(img.src) + '"><div class="pdf-assets-img-name">图 ' + (idx + 1) + '</div></div>';
      });
      html += '</div></div>';
    }
    if (assets.formulas.length) {
      html += '<div class="pdf-assets-section"><div class="pdf-assets-title">公式（' + assets.formulas.length + '）</div>';
      assets.formulas.forEach(function (f, idx) {
        html += '<div class="pdf-formula-box"><div class="pdf-formula-num">公式 ' + (idx + 1) + '</div><pre><code>' + escapeHtml(f) + '</code></pre></div>';
      });
      html += '</div>';
    }
    if (assets.tables.length) {
      html += '<div class="pdf-assets-section"><div class="pdf-assets-title">表格（' + assets.tables.length + '）</div>';
      assets.tables.forEach(function (t, idx) {
        html += '<div class="pdf-table-wrap"><div class="pdf-table-num">表格 ' + (idx + 1) + '</div>' + markdownTableToHtml(t) + '</div>';
      });
      html += '</div>';
    }
    container.innerHTML = html;
    bindPdfImageLightbox('#pdfAssets');
  }

  function copyPdfMarkdown() {
    var text = state.pdf.markdown || '';
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制 Markdown 全文'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast('已复制 Markdown 全文');
    }
  }

  function downloadPdfMarkdown() {
    var text = state.pdf.markdown || '';
    if (!text) return;
    var blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'result.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function retryPdfJob() {
    $('#pdfResultCard').hidden = true;
    if (state.pdf.file) startPdfJob();
    else { $('#pdfProgressCard').hidden = true; toast('再选一次 PDF'); }
  }

  function openPdfJobFolder() {
    if (!state.pdf.jobId) { toast('没有可打开的任务'); return; }
    fetch('/api/pdf/open-folder?jobId=' + encodeURIComponent(state.pdf.jobId))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) toast('文件夹已打开');
        else toast('打开失败：' + (d.error || '未知错误'));
      })
      .catch(function () { toast('打开文件夹请求失败'); });
  }

  // ===== P0 一键入库 =====
  function setPdfIngestBusy(busy) {
    var btn = $('#pdfIngestConfirm');
    btn.disabled = busy;
    btn.textContent = busy ? '处理中…' : '确认入库';
  }
  function showPdfIngestError(msg) {
    var box = $('#pdfIngestError');
    box.textContent = msg || '';
    box.hidden = !msg;
  }
  function fillPdfThemeOptions(lib) {
    var dl = $('#piThemeList');
    dl.innerHTML = '';
    var seen = {};
    var cats = (lib && lib.categories) || {};
    Object.keys(cats).forEach(function (cat) {
      (cats[cat] || []).forEach(function (t) {
        if (!seen[t.theme]) {
          seen[t.theme] = 1;
          var o = document.createElement('option');
          o.value = t.theme;
          dl.appendChild(o);
        }
      });
    });
  }
  function openPdfIngest() {
    if (!state.pdf.jobId) { toast('先转写完，再做这一步'); return; }
    state.pdf.draft = null;
    $('#pdfIngestError').hidden = true;
    $('#pdfIngestDone').hidden = true;
    $('#pdfIngestFooter').hidden = false;
    $('#piTitle').value = '';
    $('#piAuthors').value = '';
    $('#piYear').value = '';
    $('#piJournal').value = '';
    $('#piDoi').value = '';
    $('#piAbstract').value = '';
    $('#piKeywords').value = '';
    $('#piSummaryZh').value = '';
    $('#piTheme').value = '';
    $('#piCategory').value = '精读';
    $('#piPriority').value = '参考';
    $('#piMakeNotes').checked = true;
    var hint = $('#pdfIngestHint');
    hint.hidden = false;
    hint.textContent = '正在提取元数据…';
    setPdfIngestBusy(true);
    $('#pdfIngestModal').hidden = false;
    Promise.all([
      api('/api/pdf/library'),
      api('/api/pdf/metadata', { method: 'POST', body: JSON.stringify({ jobId: state.pdf.jobId }) })
    ]).then(function (arr) {
      var lib = arr[0], draft = arr[1];
      fillPdfThemeOptions(lib);
      if (!draft.ok) throw new Error(draft.error || '元数据提取失败');
      state.pdf.draft = draft;
      var m = draft.meta || {};
      $('#piTitle').value = m.title || '';
      $('#piAuthors').value = draft.authorsText || (m.authors || []).join('、');
      $('#piYear').value = m.year || '';
      $('#piJournal').value = m.journal || '';
      $('#piDoi').value = m.doi || '';
      $('#piAbstract').value = m.abstract || '';
      $('#piKeywords').value = (m.keywords || []).join(', ');
      var hints = (draft.notes || []).join('；');
      hint.textContent = hints ? ('元数据为自动提取，请核对：' + hints) : '元数据为自动提取，请核对后入库';
    }).catch(function (e) {
      hint.textContent = '自动提取未成功，可手动填写：' + ((e && e.message) || e);
    }).then(function () { setPdfIngestBusy(false); });
  }
  function closePdfIngest() {
    $('#pdfIngestModal').hidden = true;
  }
  function runPdfAiSummarize() {
    var btn = $('#piAiBtn');
    var btnHtml = btn ? btn.innerHTML : '';   // 恢复时 innerHTML 回写，保住图标
    if (!state.pdf.jobId) { toast('先转写完，再做这一步'); return; }
    btn.disabled = true;
    btn.textContent = 'AI 分析中…（约15秒）';
    showPdfIngestError('');
    api('/api/pdf/llm/summarize', { method: 'POST', body: JSON.stringify({ jobId: state.pdf.jobId }) })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'AI 补全失败');
        if (d.abstract) $('#piAbstract').value = d.abstract;
        if (d.keywords) $('#piKeywords').value = d.keywords;
        if (d.summary_zh) $('#piSummaryZh').value = d.summary_zh;
        toast('AI 补全完成（' + (d.tokens || 0) + ' tokens，模型 ' + (d.model || '') + '）');
      })
      .catch(function (e) {
        showPdfIngestError('AI 补全失败：' + ((e && e.message) || String(e)) + '（不影响手动填写和入库）');
      })
      .then(function () {
        btn.disabled = false;
        btn.innerHTML = btnHtml;
      });
  }
  function confirmPdfIngest() {
    var title = $('#piTitle').value.trim();
    var theme = $('#piTheme').value.trim();
    if (!title) { showPdfIngestError('请填写标题'); return; }
    if (!theme) { showPdfIngestError('请填写或选择研究主题'); return; }
    showPdfIngestError('');
    var base = (state.pdf.draft && state.pdf.draft.meta) || {};
    var payload = {
      jobId: state.pdf.jobId,
      category: $('#piCategory').value,
      theme: theme,
      priority: $('#piPriority').value,
      makeNotes: $('#piMakeNotes').checked,
      meta: {
        title: title,
        authorsText: $('#piAuthors').value.trim(),
        year: $('#piYear').value.trim(),
        journal: $('#piJournal').value.trim(),
        doi: $('#piDoi').value.trim(),
        abstract: $('#piAbstract').value.trim(),
        keywords: $('#piKeywords').value.trim(),
        summaryZh: $('#piSummaryZh').value.trim(),
        pages: base.pages || 0,
        chars: base.chars || 0
      }
    };
    setPdfIngestBusy(true);
    api('/api/pdf/ingest', { method: 'POST', body: JSON.stringify(payload) }).then(function (d) {
      setPdfIngestBusy(false);
      if (!d.ok) throw new Error(d.error || '入库失败');
      $('#pdfIngestFooter').hidden = true;
      $('#pdfIngestDone').hidden = false;
      $('#piDonePaper').textContent = '文献目录：' + d.paperDir;
      $('#piDoneNote').textContent = d.notePath ? ('读书札记：' + d.notePath) : '（未生成札记）';
      toast('已存入文献库');
    }).catch(function (e) {
      setPdfIngestBusy(false);
      showPdfIngestError(((e && e.message) || String(e)));
    });
  }

  // ===== 选中文字→引用到札记 =====
  var pdfSelState = { text: '', visible: false };

  function initPdfSelectionToolbar() {
    var preview = $('#pdfPreview');
    if (!preview) return;

    // 监听预览区内的鼠标抬起（选中完成）
    preview.addEventListener('mouseup', function (e) {
      // 延迟一帧，确保 selection 已更新
      setTimeout(function () { handlePdfSelection(e); }, 10);
    });

    // 点击工具栏外部时隐藏
    document.addEventListener('mousedown', function (e) {
      var toolbar = $('#pdfSelToolbar');
      if (toolbar && !toolbar.hidden && !toolbar.contains(e.target)) {
        // 如果点击的是预览区且有选中，不隐藏（mouseup 会重新定位）
        if (!preview.contains(e.target)) {
          hidePdfSelToolbar();
        }
      }
    });

    // 滚动时隐藏工具栏（位置会失效）
    var scrollContainer = preview.closest('.panel') || window;
    scrollContainer.addEventListener('scroll', hidePdfSelToolbar, true);

    // 按钮点击
    $('#pdfSelQuoteBtn').addEventListener('click', function () {
      if (pdfSelState.text) {
        quotePdfSelectionToNote(pdfSelState.text);
      }
    });
  }

  function handlePdfSelection(e) {
    var sel = window.getSelection();
    var text = sel ? sel.toString().trim() : '';
    if (!text || text.length < 2) {
      hidePdfSelToolbar();
      return;
    }
    // 确认选中范围在预览区内
    var preview = $('#pdfPreview');
    if (sel.rangeCount > 0) {
      var range = sel.getRangeAt(0);
      if (!preview.contains(range.commonAncestorContainer)) {
        hidePdfSelToolbar();
        return;
      }
    }
    pdfSelState.text = text;
    showPdfSelToolbar(e.clientX, e.clientY, text.length);
  }

  function showPdfSelToolbar(x, y, charCount) {
    var toolbar = $('#pdfSelToolbar');
    if (!toolbar) return;
    toolbar.hidden = false;
    pdfSelState.visible = true;

    // 显示字数
    $('#pdfSelCount').textContent = charCount + ' 字';

    // 定位：在鼠标位置上方，超出视口则调整
    var tbW = toolbar.offsetWidth || 180;
    var tbH = toolbar.offsetHeight || 40;
    var left = x - tbW / 2;
    var top = y - tbH - 10;

    // 边界修正
    if (left < 8) left = 8;
    if (left + tbW > window.innerWidth - 8) left = window.innerWidth - tbW - 8;
    if (top < 8) top = y + 16; // 放不下就放下面

    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
  }

  function hidePdfSelToolbar() {
    var toolbar = $('#pdfSelToolbar');
    if (toolbar) toolbar.hidden = true;
    pdfSelState.visible = false;
    pdfSelState.text = '';
  }

  function quotePdfSelectionToNote(text) {
    var btn = $('#pdfSelQuoteBtn');
    var jobId = state.pdf.jobId;
    if (!jobId) {
      toast('没找到这次的转写任务');
      return;
    }
    btn.disabled = true;
    btn.textContent = '追加中…';

    api('/api/pdf/note/quote', {
      method: 'POST',
      body: JSON.stringify({ jobId: jobId, text: text, section: '九' })
    }).then(function (d) {
      btn.disabled = false;
      btn.textContent = '引用到札记';
      if (d.ok) {
        toast('已追加到札记「可引用段落摘录」（' + d.chars + ' 字）');
        hidePdfSelToolbar();
        // 清除选中
        window.getSelection().removeAllRanges();
      } else {
        toast('失败：' + (d.error || '未知错误'));
      }
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = '引用到札记';
      toast('请求失败：' + ((e && e.message) || String(e)));
    });
  }

  // ===== 事件绑定 =====
  function bindEvents() {
    // 导航
    $$('.nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () { switchPanel(btn.dataset.panel); });
    });

    // 概览里的"查看全部"
    $$('.btn-goto').forEach(function (btn) {
      btn.addEventListener('click', function () { switchPanel(btn.dataset.goto); });
    });

    // 今日工作台：动态内容，用事件委托跳转面板
    var todayBoardEl = $('#todayBoard');
    if (todayBoardEl) {
      todayBoardEl.addEventListener('click', function (e) {
        var el = e.target.closest('[data-goto]');
        if (!el) return;
        switchPanel(el.dataset.goto);
      });
    }

    // 主题切换
    $('#themeToggle').addEventListener('click', toggleTheme);

    // 天气：点击右上角角标打开模态框
    var weatherChip = $('#weatherChip');
    if (weatherChip) {
      weatherChip.style.cursor = 'pointer';
      weatherChip.addEventListener('click', openWeatherModal);
    }
    // 天气模态框：关闭按钮 + 遮罩
    var weatherModalClose = $('#weatherModalClose');
    if (weatherModalClose) weatherModalClose.addEventListener('click', closeWeatherModal);
    var weatherModalOverlay = $('#weatherModalOverlay');
    if (weatherModalOverlay) weatherModalOverlay.addEventListener('click', closeWeatherModal);
    // ESC 键关闭模态框
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeWeatherModal();
    });

    // 待办添加
    $('#todoAddBtn').addEventListener('click', addTodo);
    $('#todoInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addTodo(); });

    // 待办列表事件委托
    $('#todoBoard').addEventListener('click', function (e) {
      // 分组折叠
      var groupHeader = e.target.closest('.todo-group-header');
      if (groupHeader) {
        var group = groupHeader.closest('.todo-group');
        if (group) {
          group.classList.toggle('collapsed');
          if (group.dataset.group === 'done') {
            state.todoDoneCollapsed = group.classList.contains('collapsed');
          }
        }
        return;
      }
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var id = parseInt(btn.dataset.id);
      if (btn.dataset.action === 'toggle') toggleTodo(id);
      else if (btn.dataset.action === 'delete') deleteTodo(id);
      else if (btn.dataset.action === 'pomo') startPomo(id);
    });

    // 日志类型筛选
    $('#journalTypeFilters').addEventListener('click', function (e) {
      var filter = e.target.closest('.journal-filter');
      if (!filter) return;
      state.journalTypeFilter = filter.dataset.type;
      renderJournal();
    });

    // 日志删除（事件委托）
    $('#journalTimeline').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="delete-journal"]');
      if (!btn) return;
      deleteJournal(parseInt(btn.dataset.id));
    });

    // 日志 → 摘要卡片互链跳转（事件委托）
    $('#journalTimeline').addEventListener('click', function (e) {
      var link = e.target.closest('.journal-card-link');
      if (!link) return;
      jumpToCard(link.dataset.cardTitle);
    });

    // 论文添加
    $('#pubAddBtn').addEventListener('click', addPublication);

    // 论文删除（事件委托）
    $('#pubList').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="delete-pub"]');
      if (!btn) return;
      deletePublication(parseInt(btn.dataset.id));
    });

    // 资讯 tab
    $('#newsTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.news-tab');
      if (!tab) return;
      state.activeNewsTab = tab.dataset.tab;
      renderNews();
    });

    // 文件夹点击
    $('#sectionsGrid').addEventListener('click', function (e) {
      var card = e.target.closest('.section-card');
      if (!card) return;
      openFolder(card.dataset.path);
    });

    // 日志添加
    $('#journalAddBtn').addEventListener('click', addJournal);

    // 刷新资讯
    $('#refreshBtn').addEventListener('click', refreshNews);

    // 资讯：开放获取条目「送转写」（捕获阶段拦截，避免触发外链跳转）
    var newsListEl = $('#newsList');
    if (newsListEl) {
      newsListEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.news-transcribe-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        sendToTranscribe(btn.dataset.pdf, btn.dataset.title || '');
      }, true);
      // 资讯：一键轻收录（只存元数据，不转写）
      newsListEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.news-quick-add-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        quickAddFromNews(btn.dataset);
      }, true);
    }

    // 资讯：只看与研究领域相关
    var relToggle = $('#newsRelToggle');
    if (relToggle) {
      relToggle.addEventListener('click', function () {
        state.relevanceOnly = !state.relevanceOnly;
        this.classList.toggle('active', state.relevanceOnly);
        renderNews();
      });
    }

    // ===== 摘要卡片：勾选模式 / 浮动操作条 / BibTeX / 综述模态 =====
    var selToggle = $('#summarySelectToggle');
    if (selToggle) {
      selToggle.addEventListener('click', function () { setSumSelectMode(!sumSelectMode); });
    }
    var actClear = $('#sumActionClear');
    if (actClear) actClear.addEventListener('click', function () { sumSelected = []; renderSummaryCards(); updateSumActionBar(); });
    var actBib = $('#sumActionBib');
    if (actBib) actBib.addEventListener('click', exportBibtex);
    var bibBtn = $('#summaryBibBtn');
    if (bibBtn) bibBtn.addEventListener('click', exportBibtex);
    var actReview = $('#sumActionReview');
    if (actReview) actReview.addEventListener('click', openReviewModal);
    var rvClose = $('#reviewModalClose');
    if (rvClose) rvClose.addEventListener('click', closeReviewModal);
    var rvOverlay = $('#reviewModalOverlay');
    if (rvOverlay) rvOverlay.addEventListener('click', closeReviewModal);
    var rvRun = $('#reviewRunBtn');
    if (rvRun) {
      rvRun.addEventListener('click', runReview);
      $('#reviewTopicInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') runReview();
      });
    }
    var rvCopy = $('#reviewCopyBtn');
    if (rvCopy) {
      rvCopy.addEventListener('click', function () {
        if (!reviewMarkdown) return;
        navigator.clipboard.writeText(reviewMarkdown).then(function () { toast('综述草稿已复制'); },
          function () { toast('复制失败，请手动选择文本'); });
      });
    }
    var rvDl = $('#reviewDownloadBtn');
    if (rvDl) {
      rvDl.addEventListener('click', function () {
        if (reviewMarkdown) downloadTextFile(reviewMarkdown, '综述草稿.md');
      });
    }

    // ===== 专注浮条（其他面板也能看到正在跑的一轮）=====
    var pomoPause = $('#pomoPauseBtn');
    if (pomoPause) {
      pomoPause.addEventListener('click', function (e) {
        e.stopPropagation();
        if (focusState.paused) focusResume(); else focusPause();
      });
    }
    var pomoStop = $('#pomoStopBtn');
    if (pomoStop) {
      pomoStop.addEventListener('click', function (e) { e.stopPropagation(); focusGiveUp(); });
    }
    // 点浮条空白处 → 跳到专注面板
    var pomoTimer = $('#pomoTimer');
    if (pomoTimer) {
      pomoTimer.addEventListener('click', function () { switchPanel('focus'); });
    }

    // ===== 专注面板 =====
    var focusStartBtn = $('#focusStartBtn');
    if (focusStartBtn) {
      focusStartBtn.addEventListener('click', function () {
        // 完成态的按钮承担「再来一轮」：先清掉完成态再开始
        if (focusState.done) { resetFocusState(); focusRenderAll(); }
        focusStart();
      });
    }
    var focusPauseBtn = $('#focusPauseBtn');
    if (focusPauseBtn) {
      focusPauseBtn.addEventListener('click', function () {
        if (focusState.paused) focusResume(); else focusPause();
      });
    }
    var focusGiveUpBtn = $('#focusGiveUpBtn');
    if (focusGiveUpBtn) focusGiveUpBtn.addEventListener('click', focusGiveUp);

    var focusPresets = $('#focusPresets');
    if (focusPresets) {
      focusPresets.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-preset]');
        if (!btn) return;
        if (focusIsActive()) { toast('这一轮进行中，结束后再改时长'); return; }
        focusPreset = parseInt(btn.dataset.preset, 10) || 25;
        try { localStorage.setItem(FOCUS_PRESET_KEY, String(focusPreset)); } catch (err) {}
        if (!focusState.done) { focusState.totalSec = focusPreset * 60; focusState.leftMs = focusPreset * 60000; }
        focusRenderAll();
      });
    }

    var focusNext = $('#focusNext');
    if (focusNext) {
      focusNext.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-focus-next]');
        if (!btn) return;
        var act = btn.dataset.focusNext;
        if (act === 'dismiss') { resetFocusState(); focusRenderAll(); return; }
        var wasBreak = focusState.mode === 'break';
        resetFocusState();
        focusRenderAll();
        if (act === 'break') focusBegin('break');
        else if (act === 'again') focusStart();
        if (wasBreak && act === 'again') toast('开始专注 ' + focusPreset + ' 分钟');
      });
    }

    // ===== 标签 AI 建议 =====
    var tagAiBtn = $('#summaryTagAiBtn');
    if (tagAiBtn) tagAiBtn.addEventListener('click', suggestSummaryTags);
    var tagSuggest = $('#summaryTagSuggest');
    if (tagSuggest) {
      tagSuggest.addEventListener('click', function (e) {
        var chip = e.target.closest('.sum-tag-suggest-chip');
        if (chip) { toggleSuggestChip(parseInt(chip.dataset.si, 10)); return; }
        if (e.target.closest('#sumTagAdoptBtn')) { adoptSuggestedTags(); return; }
        if (e.target.closest('#sumTagSuggestClose')) { closeTagSuggest(); }
      });
    }

    // ===== 综述引用 [n] 点击 → 跳原文卡片 =====
    var rvBody = $('#reviewModalBody');
    if (rvBody) {
      rvBody.addEventListener('click', function (e) {
        var a = e.target.closest('.review-cite');
        if (!a) return;
        var cid = a.dataset.cardId;
        if (!cid) return;
        closeReviewModal();
        switchPanel('summaries');
        openSummaryDetail(cid);
      });
    }

    // 文献工具子标签页
    $('#litTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.lit-tab');
      if (!tab) return;
      state.activeLitTab = tab.dataset.lit;
      $$('.lit-tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      $$('.lit-subpanel').forEach(function (p) {
        p.classList.toggle('active', p.id === 'lit-' + state.activeLitTab);
      });
      if (state.activeLitTab === 'arxiv' && !state.lit.arxiv) loadArxiv();
      staggerCards('literature');
    });

    // 期刊筛选
    $('#journalFilters').addEventListener('click', function (e) {
      var btn = e.target.closest('.journal-filter');
      if (!btn) return;
      state.journalFilter = btn.dataset.filter;
      renderJournalFilters();
      renderJournals();
    });

    // 术语搜索
    $('#glossarySearch').addEventListener('input', function (e) {
      state.glossaryQuery = e.target.value;
      renderGlossary();
    });

    // 检索式复制
    $('#queryList').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-copy');
      if (!btn) return;
      var idx = parseInt(btn.dataset.query);
      var q = state.lit.queries.items[idx];
      if (q && q.query) {
        navigator.clipboard.writeText(q.query).then(function () {
          toast('检索式已复制');
        }).catch(function () {
          // 降级：用 textarea
          var ta = document.createElement('textarea');
          ta.value = q.query;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast('检索式已复制');
        });
      }
    });

    // arXiv 追踪刷新
    $('#arxivRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadArxiv(true).then(function () {
        btn.classList.remove('loading');
        toast('arXiv 列表已刷新');
      });
    });

    // 前沿瞭望：列表点击 / 返回 / 刷新 / 打开归档目录
    $('#frontierList').addEventListener('click', function (e) {
      var item = e.target.closest('.hs-item');
      if (!item) return;
      openFrontier(item.dataset.file);
    });
    $('#frontierBackBtn').addEventListener('click', closeFrontier);
    $('#frontierRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadFrontier().then(function () {
        btn.classList.remove('loading');
        toast('前沿瞭望归档已刷新');
      });
    });
    $('#frontierFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/frontier' })
      }).then(function (r) { if (!r.ok) toast('打开目录失败'); });
    });

    // 热点日报：列表点击 / 返回 / 刷新 / 打开归档目录
    $('#hotspotList').addEventListener('click', function (e) {
      var item = e.target.closest('.hs-item');
      if (!item) return;
      openHotspot(item.dataset.file);
    });
    $('#hotspotBackBtn').addEventListener('click', closeHotspot);
    $('#hotspotRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadHotspots().then(function () {
        btn.classList.remove('loading');
        toast('热点日报归档已刷新');
      });
    });
    $('#hotspotFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/hotspots' })
      }).then(function (r) { if (!r.ok) toast('打开目录失败'); });
    });

    // ===== 摘要卡片库 =====
    $$('.sum-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.sum-filter-btn').forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        summaryFilter = this.dataset.filter;
        loadSummaryCards();
      });
    });
    $('#summaryRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadSummaryCards();
      setTimeout(function () { btn.classList.remove('loading'); toast('摘要卡片已刷新'); }, 500);
    });
    $('#summaryFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/summaries' })
      }).then(function (r) { if (!r.ok) toast('打开目录失败'); });
    });

    // ===== 译文库 =====
    $('#transFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/translations' })
      }).then(function (r) { if (!r.ok) toast('打开目录失败'); });
    });
    $('#transRefreshBtn').addEventListener('click', function () {
      transLoaded = false;
      loadTranslations(true);
      toast('已刷新译文列表');
    });
    $('#transSearch').addEventListener('input', function () {
      transQuery = this.value || '';
      renderTranslations();
    });
    $('#transBackBtn').addEventListener('click', closeTranslationDetail);
    $('#transDeleteBtn').addEventListener('click', deleteTranslation);
    $('#pdfTransSaveBtn').addEventListener('click', saveCurrentTranslation);

    // ===== 原文精读（PDF 面板的「精读」标签）=====
    $('#pdfReadStartBtn').addEventListener('click', startPdfReading);
    $('#pdfReadCancelBtn').addEventListener('click', cancelPdfReading);
    $('#pdfReadRetryBtn').addEventListener('click', function () {
      if (readTaskState.timer) { toast('正在生成中，等它跑完或先取消'); return; }
      startPdfReading();
    });
    $('#readTaskCancel').addEventListener('click', cancelReadTask);
    $('#pdfReadCopyBtn').addEventListener('click', copyCurrentReading);

    // ===== 精读库面板 =====
    $('#readRefreshBtn').addEventListener('click', function () {
      readLoaded = false;
      loadReadings(true);
      toast('已刷新精读列表');
    });
    $('#readSearch').addEventListener('input', function () {
      readQuery = this.value || '';
      renderReadings();
    });
    $('#readBackBtn').addEventListener('click', closeReadingDetail);
    $('#readDeleteBtn').addEventListener('click', deleteReading);
    $('#readFolderBtn').addEventListener('click', function () {
      api('/api/open', {
        method: 'POST',
        body: JSON.stringify({ path: '09_工作台程序/data/readings' })
      }).then(function (r) { if (!r.ok) toast('文件夹没打开，可能路径不对'); });
    });

    // ===== 关联条：三个详情页共用一套点击委托 =====
    bindXrefBar('#summaryXref');
    bindXrefBar('#transXref');
    bindXrefBar('#readXref');

    // 译文库 / 精读库列表提前取一次：侧栏徽标与「关联」条都要用（无正文，很轻）
    loadTranslations();
    loadReadings();

    // ===== 科技爱好者周刊 =====
    $('#weeklyRefreshBtn').addEventListener('click', function () {
      var btn = this;
      btn.classList.add('loading');
      loadWeekly(true).then(function () {
        btn.classList.remove('loading');
        toast('周刊已刷新');
      });
    });
    $('#weeklyArchiveBtn').addEventListener('click', function () {
      window.open('https://github.com/ruanyf/weekly/tree/master/docs', '_blank', 'noopener');
    });
    $('#summaryBackBtn').addEventListener('click', function () {
      $('#summariesDetailView').style.display = 'none';
      $('#summariesListView').style.display = '';
    });

    // 摘要卡片：全文检索
    var sSearch = $('#summarySearch');
    if (sSearch) {
      sSearch.addEventListener('input', function () {
        summaryQuery = this.value || '';
        renderSummaryCards();
      });
    }
    // 摘要卡片：标签筛选
    var sTagFilter = $('#summaryTagFilter');
    if (sTagFilter) {
      sTagFilter.addEventListener('click', function (e) {
        var btn = e.target.closest('.sum-tag-btn');
        if (!btn) return;
        summaryTagActive = btn.dataset.tag || '';
        renderSummaryCards();
      });
    }
    // 摘要卡片：详情内标签编辑（点 chip 删除）
    var sChips = $('#summaryTagChips');
    if (sChips) {
      sChips.addEventListener('click', function (e) {
        var chip = e.target.closest('.sum-tag-chip');
        if (!chip) return;
        var cur = summaryAll.filter(function (s) { return s.id === summaryCurrentId; })[0];
        var tags = ((cur && cur.tags) || []).filter(function (t) { return t !== chip.dataset.tag; });
        saveSummaryTags(tags);
      });
    }
    // 摘要卡片：详情内标签编辑（回车添加）
    var sTagInput = $('#summaryTagInput');
    if (sTagInput) {
      sTagInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var val = (this.value || '').trim();
        if (!val) return;
        var cur = summaryAll.filter(function (s) { return s.id === summaryCurrentId; })[0];
        var tags = (cur && cur.tags) ? cur.tags.slice() : [];
        if (tags.indexOf(val) < 0) tags.push(val);
        this.value = '';
        saveSummaryTags(tags);
      });
    }

    // 初始化加载摘要卡片
    loadSummaryCards();

    // ===== PDF 转写 =====
    var dz = $('#pdfDropzone');
    var fileInput = $('#pdfFileInput');
    // 点击选择文件（点到已选文件信息区不重复触发）
    dz.addEventListener('click', function (e) {
      if (e.target.closest('#pdfFileInfo')) return;
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) handlePdfFile(fileInput.files[0]);
    });
    // 拖拽
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('dragging');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove('dragging');
      });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handlePdfFile(f);
    });
    $('#pdfFileClear').addEventListener('click', function (e) {
      e.stopPropagation();
      clearPdfFile();
    });
    // 引擎切换：重新校验已选文件大小（不同引擎上限不同）
    $$('input[name="pdfEngine"]').forEach(function (r) {
      r.addEventListener('change', function () {
        if (state.pdf.file) {
          var v = validatePdfFile(state.pdf.file, getPdfEngine());
          if (!v.ok) { showPdfFileError(v.msg); toast(v.msg); }
          else showPdfFileError('');
        }
        updatePdfStartState();
      });
    });
    // 开始转写
    $('#pdfStartBtn').addEventListener('click', startPdfJob);
    // 结果视图切换：双栏 / 仅预览 / 仅源码
    $$('.pdf-tab').forEach(function (t) {
      t.addEventListener('click', function () { switchPdfView(t.dataset.pdfview); });
    });
    $('#pdfCopyBtn').addEventListener('click', copyPdfMarkdown);
    $('#pdfDownloadBtn').addEventListener('click', downloadPdfMarkdown);
    $('#pdfRetryBtn').addEventListener('click', retryPdfJob);
    $('#pdfOpenFolderBtn').addEventListener('click', openPdfJobFolder);
    // P0 一键入库
    $('#pdfIngestBtn').addEventListener('click', openPdfIngest);
    $('#pdfIngestClose').addEventListener('click', closePdfIngest);
    $('#pdfIngestCancel').addEventListener('click', closePdfIngest);
    $('#pdfIngestOverlay').addEventListener('click', closePdfIngest);
    $('#pdfIngestConfirm').addEventListener('click', confirmPdfIngest);
    $('#piAiBtn').addEventListener('click', runPdfAiSummarize);
    // 全文翻译
    $('#pdfTransStartBtn').addEventListener('click', startPdfTranslation);
    $('#pdfTransCancelBtn').addEventListener('click', cancelPdfTranslation);
    $('#pdfTransRetryBtn').addEventListener('click', function () {
      if (confirm('重新翻译将覆盖当前译文，确定继续？')) {
        startPdfTranslation();
      }
    });
    // 同步两个深度按钮组的 active 状态
    function setSumDepthActive(depth) {
      $$('.sum-depth-btn, .sum-switch-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.depth === depth);
      });
    }

    // 空状态的三个大深度按钮
    $$('.sum-depth-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var depth = this.dataset.depth;
        setSumDepthActive(depth);
        startPdfSummary(depth);
      });
    });

    // 结果区域的小切换按钮
    $$('.sum-switch-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var depth = this.dataset.depth;
        setSumDepthActive(depth);
        startPdfSummary(depth);
      });
    });

    // 保存按钮
    $('#pdfSumSaveBtn').addEventListener('click', savePdfSummary);

    $('#pdfSumRetryBtn').addEventListener('click', function () {
      // 重新生成时使用当前选中的深度
      var active = document.querySelector('.sum-switch-btn.active') || document.querySelector('.sum-depth-btn.active');
      var depth = active ? active.dataset.depth : 'standard';
      startPdfSummary(depth);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('#pdfIngestModal').hidden) closePdfIngest();
    });
  }

  // ===== 操作：待办 =====
  function addTodo() {
    var input = $('#todoInput');
    var prioritySelect = $('#todoPriority');
    var text = input.value.trim();
    if (!text) return;
    var priority = prioritySelect ? prioritySelect.value : '普通';
    api('/api/todos', { method: 'POST', body: JSON.stringify({ action: 'add', text: text, priority: priority }) })
      .then(function (res) {
        if (res.ok) {
          state.todos = res.todos;
          input.value = '';
          renderTodos();
          renderDashboardTodos();
          updateTodoBadge();
          toast('已添加待办');
        }
      });
  }

  function toggleTodo(id) {
    api('/api/todos', { method: 'POST', body: JSON.stringify({ action: 'toggle', id: id }) })
      .then(function (res) {
        if (res.ok) {
          state.todos = res.todos;
          renderTodos();
          renderDashboardTodos();
          updateTodoBadge();
        }
      });
  }

  function deleteTodo(id) {
    api('/api/todos', { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) })
      .then(function (res) {
        if (res.ok) {
          state.todos = res.todos;
          renderTodos();
          renderDashboardTodos();
          updateTodoBadge();
          toast('已删除');
        }
      });
  }

  // ===== 操作：日志 =====
  function addJournal() {
    var input = $('#journalInput');
    var typeSelect = $('#journalType');
    var content = input.value.trim();
    if (!content) return;
    var type = typeSelect ? typeSelect.value : '日常';
    api('/api/journal', { method: 'POST', body: JSON.stringify({ content: content, type: type }) })
      .then(function (res) {
        if (res.ok) {
          state.journal = res.journal;
          input.value = '';
          renderJournal();
          renderDashboardJournal();
          toast('已记录');
        }
      });
  }

  function deleteJournal(id) {
    if (!confirm('确定删除这条日志？')) return;
    api('/api/journal', { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) })
      .then(function (res) {
        if (res.ok) {
          state.journal = res.journal;
          renderJournal();
          renderDashboardJournal();
          toast('已删除');
        }
      });
  }

  // ===== 毕业条件 & 论文 =====
  function renderGraduation() {
    var grad = (state.overview && state.overview.graduation) || { c_journal: { required: 2, achieved: 0, items: [] } };
    var cj = grad.c_journal;
    $('#gradCJrnlAchieved').textContent = cj.achieved;
    $('#gradCJrnlRequired').textContent = cj.required;
    var pct = cj.required > 0 ? Math.min(100, cj.achieved / cj.required * 100) : 0;
    $('#gradCJrnlBar').style.width = pct + '%';
    // 论文列表
    var pubList = $('#pubList');
    if (cj.items && cj.items.length > 0) {
      pubList.innerHTML = cj.items.map(function (p) {
        return '<div class="pub-item">' +
          '<div class="pub-info">' +
          '<span class="pub-title">' + escapeHtml(p.title || '') + '</span>' +
          (p.journal ? '<span class="pub-journal">' + escapeHtml(p.journal) + '</span>' : '') +
          (p.date ? '<span class="pub-date">' + escapeHtml(p.date) + '</span>' : '') +
          '</div>' +
          '<button class="pub-delete" data-action="delete-pub" data-id="' + p.id + '" aria-label="删除">×</button>' +
          '</div>';
      }).join('');
    } else {
      pubList.innerHTML = '<div class="pub-empty">暂无论文记录，发表后点击上方按钮登记</div>';
    }
  }

  function addPublication() {
    var title = prompt('论文标题：');
    if (!title || !title.trim()) return;
    var journal = prompt('发表期刊（可选）：') || '';
    var date = prompt('发表时间（可选，如 2026-09）：') || '';
    api('/api/publications', { method: 'POST', body: JSON.stringify({ action: 'add', title: title.trim(), type: 'c_journal', journal: journal.trim(), date: date.trim() }) })
      .then(function (res) {
        if (res.ok) {
          state.overview.graduation = res.graduation;
          renderGraduation();
          toast('已登记论文');
        }
      });
  }

  function deletePublication(id) {
    if (!confirm('确定删除这条论文记录？')) return;
    api('/api/publications', { method: 'POST', body: JSON.stringify({ action: 'delete', id: id }) })
      .then(function (res) {
        if (res.ok) {
          state.overview.graduation = res.graduation;
          renderGraduation();
          toast('已删除');
        }
      });
  }

  // ===== 操作：文件夹 =====
  function openFolder(folder) {
    api('/api/open', { method: 'POST', body: JSON.stringify({ path: folder }) })
      .then(function (res) {
        if (res.ok) toast('已在 Finder 中打开');
        else toast('打开失败');
      });
  }

  // ===== 操作：刷新资讯 =====
  function refreshNews() {
    var btn = $('#refreshBtn');
    btn.classList.add('loading');
    btn.querySelector('span').textContent = '更新中…';
    api('/api/refresh', { method: 'POST' })
      .then(function (data) {
        state.news = data;
        renderNews();
        renderWeather();
        renderOverview();
        toast('资讯已更新');
      })
      .catch(function () { toast('更新失败，请检查网络'); })
      .finally(function () {
        btn.classList.remove('loading');
        btn.querySelector('span').textContent = '更新资讯';
      });
  }

  // ============================================================
  // V3 · 交互层
  //   滑动导航胶囊 · ⌘K 命令面板 · URL 深链 · 吸顶顶栏 · 滚动记忆
  // ============================================================

  var scrollMemory = {};

  function rememberScroll() { scrollMemory[state.panel] = window.scrollY || 0; }

  function restoreScroll(panel) {
    var y = scrollMemory[panel] || 0;
    requestAnimationFrame(function () { window.scrollTo(0, y); });
  }

  /* ---------- 滑动导航胶囊 ---------- */
  var navInk = null;

  function ensureNavInk() {
    var nav = $('.sidebar-nav');
    if (!nav) return;
    if (!navInk) {
      navInk = document.createElement('span');
      navInk.className = 'nav-ink';
      nav.insertBefore(navInk, nav.firstChild);
      // 字体换入会改变行高；侧栏尺寸变化也会。两者都要重算，
      // 否则胶囊会停在按旧行高算出的位置（初次加载时最明显）。
      window.addEventListener('resize', function () { positionNavInk(false); });
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { positionNavInk(false); });
      }
      if (window.ResizeObserver) {
        try { new ResizeObserver(function () { positionNavInk(false); }).observe(nav); } catch (e) {}
      }
    }
  }

  /* 定位算法：必须用 rect 差值，不能用 active.offsetTop。
     offsetTop 相对「最近的定位祖先」，而 .nav-group 上有 position: relative，
     于是从第三组起 offsetTop 只等于「在该组内的高度」——点「前沿日报」
     （组内第一个）胶囊会落回导航顶部压住「概览」，误差正好是前两组的高度。
     rect 差值不依赖任何祖先的定位方式，同时按 scrollTop/clientTop 校正，
     导航自身滚动时也不会错位。 */
  function positionNavInk(animate) {
    if (!navInk) return;
    var nav = $('.sidebar-nav');
    var active = $('.nav-item.active');
    if (!nav || !active) { navInk.classList.remove('ready'); return; }
    var ir = active.getBoundingClientRect();
    var nr = nav.getBoundingClientRect();
    var y = (ir.top - nr.top) - nav.clientTop + nav.scrollTop;
    var x = (ir.left - nr.left) - nav.clientLeft + nav.scrollLeft;
    if (!animate) navInk.style.transition = 'none';
    navInk.style.height = ir.height + 'px';
    navInk.style.width = ir.width + 'px';
    navInk.style.left = x + 'px';
    navInk.style.transform = 'translateY(' + (Math.round(y * 100) / 100) + 'px)';
    navInk.classList.add('ready');
    if (!animate) {
      void navInk.offsetHeight;
      navInk.style.transition = '';
    }
  }

  /* ---------- 顶栏吸顶态 ---------- */
  function initTopbarStuck() {
    var bar = $('.topbar');
    if (!bar) return;
    var onScroll = function () {
      // 本站滚动容器是 body（body{overflow-y:auto}）：window.scrollY 恒为 0，
      // 原实现只读 window/documentElement → 吸顶态永不生效、顶栏保持透明，
      // 内容滚上来就与「面板标题 + 日期」叠影。必须补 body.scrollTop 这一支。
      // （不能用 bar.getBoundingClientRect().top 判断：topbar 是页面首个元素，未滚动时 top 也是 0）
      var y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
      bar.classList.toggle('is-stuck', y > 6);
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- URL 深链：#panel / #hotspots/<文件> ---------- */
  function syncHash(panel) {
    var h = '#' + panel;
    if (location.hash !== h) {
      try { history.replaceState(null, '', h); } catch (err) { location.hash = panel; }
    }
  }

  function applyHash() {
    var raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return false;
    var parts = raw.split('/');
    var panel = parts[0];
    if (!$('.nav-item[data-panel="' + panel + '"]')) return false;
    switchPanel(panel);
    if (parts.length > 1) {
      var file = decodeURIComponent(parts.slice(1).join('/'));
      if (panel === 'hotspots') setTimeout(function () { openHotspot(file); }, 60);
      if (panel === 'frontier') setTimeout(function () { openFrontier(file); }, 60);
    }
    return true;
  }

  function pushReportHash(panel, file) {
    try { history.replaceState(null, '', '#' + panel + '/' + encodeURIComponent(file)); } catch (err) {}
  }

  /* ---------- ⌘K 命令面板 ---------- */
  var CM_ICONS = {
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
  };

  var cmdkItems = [];
  var cmdkIndex = 0;
  var cmdkFiltered = [];

  function buildCmdkItems() {
    var items = [];
    $$('.nav-item').forEach(function (btn) {
      var svg = btn.querySelector('svg');
      var key = btn.dataset.panel;
      items.push({
        group: '前往面板',
        label: PANEL_TITLES[key] || (btn.textContent || '').trim(),
        keys: key,
        icon: svg ? svg.outerHTML : '',
        run: function () { switchPanel(key); }
      });
    });
    items.push({
      group: '动作',
      label: state.theme === 'dark' ? '切换到明亮模式' : '切换到暗夜模式',
      keys: 'theme dark light 主题 明暗',
      icon: CM_ICONS.theme,
      sub: '隐藏玩法：点主题按钮有惊喜',
      run: function () { toggleTheme(); }
    });
    items.push({
      group: '动作', label: '更新资讯', keys: 'refresh news update 刷新 更新',
      icon: CM_ICONS.refresh, run: function () { $('#refreshBtn').click(); }
    });
    items.push({
      group: '动作', label: '打开热点日报归档目录', keys: 'folder hotspots 归档 目录',
      icon: CM_ICONS.folder,
      run: function () { var b = $('#hotspotFolderBtn'); if (b) b.click(); }
    });
    items.push({
      group: '动作', label: '打开摘要卡片保存目录', keys: 'folder summaries 摘要 目录',
      icon: CM_ICONS.folder,
      run: function () { var b = $('#summaryFolderBtn'); if (b) b.click(); }
    });
    return items;
  }

  // 全局内容搜索：⌘K 输入关键字时跨面板检索（待办 / 文献卡片 / 研究日志）
  function buildCmdkContentItems(q) {
    var needle = (q || '').trim().toLowerCase();
    if (!needle) return [];
    var items = [];
    state.todos.filter(function (t) { return !t.done && (t.text || '').toLowerCase().indexOf(needle) >= 0; })
      .slice(0, 4).forEach(function (t) {
        items.push({
          group: '待办事项', label: t.text, keys: t.text,
          icon: CM_ICONS.check || '', sub: '待办',
          run: function () { switchPanel('todos'); }
        });
      });
    summaryAll.filter(function (s) {
      var hay = [s.title, s.title_en, s.keywords, s.one_liner].join(' ').toLowerCase();
      return hay.indexOf(needle) >= 0;
    }).slice(0, 5).forEach(function (s) {
      var title = s.title || s.title_en || s.id;
      items.push({
        group: '文献卡片', label: title, keys: [s.title, s.title_en, s.one_liner].join(' '),
        icon: CM_ICONS.folder || '', sub: '摘要卡片',
        run: function () { switchPanel('summaries'); openSummaryDetail(s.id); }
      });
    });
    // 译文库 / 精读库也进搜索：否则「搜不到自己存过的东西」会显得很割裂
    (state.translations || []).filter(function (t) {
      return [t.title, t.source, t.excerpt].join(' ').toLowerCase().indexOf(needle) >= 0;
    }).slice(0, 4).forEach(function (t) {
      items.push({
        group: '译文', label: t.title || '未命名译文', keys: [t.title, t.source].join(' '),
        icon: CM_ICONS.folder || '', sub: '译文库 · ' + Math.max(1, Math.round((t.chars || 0) / 1000)) + 'k 字',
        run: function () { switchPanel('translations'); openTranslationDetail(t.id); }
      });
    });
    (state.readings || []).filter(function (t) {
      return [t.title, t.source, t.excerpt].join(' ').toLowerCase().indexOf(needle) >= 0;
    }).slice(0, 4).forEach(function (t) {
      items.push({
        group: '原文精读', label: t.title || '未命名精读', keys: [t.title, t.source].join(' '),
        icon: CM_ICONS.book || '', sub: '精读库 · ' + Math.max(1, Math.round((t.chars || 0) / 1000)) + 'k 字',
        run: function () { switchPanel('readings'); openReadingDetail(t.id); }
      });
    });
    state.journal.filter(function (j) { return (j.content || '').toLowerCase().indexOf(needle) >= 0; })
      .slice(0, 4).forEach(function (j) {
        items.push({
          group: '研究日志', label: String(j.content || '').slice(0, 52), keys: j.content || '',
          icon: CM_ICONS.edit || '', sub: j.date || j.created || '',
          run: function () { switchPanel('journal'); }
        });
      });
    return items;
  }

  function renderCmdk(query) {
    var list = $('#cmdkList');
    if (!list) return;
    var q = (query || '').trim().toLowerCase();
    var pool = cmdkItems.concat(buildCmdkContentItems(q));
    cmdkFiltered = pool.filter(function (it) {
      if (!q) return true;
      return (it.label + ' ' + it.keys).toLowerCase().indexOf(q) >= 0;
    });
    if (cmdkIndex >= cmdkFiltered.length) cmdkIndex = cmdkFiltered.length - 1;
    if (cmdkIndex < 0) cmdkIndex = 0;

    if (!cmdkFiltered.length) {
      list.innerHTML = '<div class="cmdk-empty">没有匹配的项</div>';
      return;
    }
    var html = [];
    var lastGroup = '';
    cmdkFiltered.forEach(function (it, i) {
      if (it.group !== lastGroup) {
        html.push('<div class="cmdk-group-label">' + escapeHtml(it.group) + '</div>');
        lastGroup = it.group;
      }
      html.push(
        '<button class="cmdk-item' + (i === cmdkIndex ? ' active' : '') + '" data-i="' + i + '">' +
          it.icon +
          '<span>' + escapeHtml(it.label) + '</span>' +
          (it.sub ? '<span class="cmdk-item-sub">' + escapeHtml(it.sub) + '</span>' : '') +
        '</button>'
      );
    });
    list.innerHTML = html.join('');
  }

  function moveCmdk(delta) {
    if (!cmdkFiltered.length) return;
    cmdkIndex = (cmdkIndex + delta + cmdkFiltered.length) % cmdkFiltered.length;
    var items = $$('.cmdk-item');
    items.forEach(function (el, i) { el.classList.toggle('active', i === cmdkIndex); });
    if (items[cmdkIndex] && items[cmdkIndex].scrollIntoView) {
      items[cmdkIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function openCmdk() {
    var ov = $('#cmdkOverlay');
    if (!ov) return;
    cmdkItems = buildCmdkItems();
    cmdkIndex = 0;
    $('#cmdkInput').value = '';
    renderCmdk('');
    ov.classList.add('open');
    document.body.classList.add('cmdk-open');
    setTimeout(function () { $('#cmdkInput').focus(); }, 30);
  }

  function closeCmdk() {
    var ov = $('#cmdkOverlay');
    if (!ov) return;
    ov.classList.remove('open');
    document.body.classList.remove('cmdk-open');
  }

  function runCmdk() {
    var it = cmdkFiltered[cmdkIndex];
    if (!it) return;
    closeCmdk();
    setTimeout(function () { it.run(); }, 40);
  }

  function initCmdk() {
    var ov = $('#cmdkOverlay');
    if (!ov) return;

    var opener = $('#cmdkOpen');
    if (opener) opener.addEventListener('click', openCmdk);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeCmdk(); });

    $('#cmdkInput').addEventListener('input', function (e) {
      cmdkIndex = 0;
      renderCmdk(e.target.value);
    });
    $('#cmdkList').addEventListener('click', function (e) {
      var btn = e.target.closest('.cmdk-item');
      if (!btn) return;
      cmdkIndex = parseInt(btn.dataset.i, 10) || 0;
      runCmdk();
    });

    document.addEventListener('keydown', function (e) {
      var open = ov.classList.contains('open');
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (open) closeCmdk(); else openCmdk();
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); closeCmdk(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); moveCmdk(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveCmdk(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); runCmdk(); }
    });
  }

  function initV3() {
    paintWxIcons();
    ensureNavInk();
    positionNavInk(false);
    initTopbarStuck();
    initCmdk();
    window.addEventListener('beforeunload', rememberScroll);
    window.addEventListener('hashchange', applyHash);
  }

  // ===== 初始化 =====
  function init() {
    initTheme();
    $('#panelDate').textContent = formatDate(new Date());
    initV3();
    bindEvents();
    initPdfSelectionToolbar();
    initPdfImageLightbox();
    // 恢复未跑完的一轮专注（刷新/关标签都能接着跑），并先渲染一次面板
    focusRestore();
    focusRenderAll();
    // 侧栏徽标预取：归档型面板计数启动即加载，不必等用户点进面板（本地轻接口）
    loadFrontier().catch(function () {});
    loadHotspots().catch(function () {});
    loadWeekly().catch(function () {});
    // 切回标签页时立即续跑翻译（看门狗1秒兜底，这里更即时）
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && pdfTransState.running && !pdfTransState.cancelled) {
        pumpPdfTransWorkers();
      }
      // 专注计时用的是时间戳，回前台立刻校准一次（后台标签页会被降频，
      // 也可能在后台期间已经到点）
      if (!document.hidden && focusIsActive()) { focusTick(); focusRenderAll(); }
    });
    loadAll().then(function () {
      focusRenderAll();   // 待办加载完，「关联任务」下拉才有内容
      if (!applyHash()) switchPanel('dashboard');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
