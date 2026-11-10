'use strict';

(function () {
  const $ = (sel) => document.querySelector(sel);
  const questionEl = $('#question');
  const askBtn = $('#askBtn');
  const answerEl = $('#answer');
  const metaEl = $('#meta');
  const errBox = $('#errBox');
  const historyEl = $('#history');

  /** 显示错误提示 */
  function showError(msg) {
    errBox.textContent = msg || '';
    errBox.style.display = msg ? 'block' : 'none';
  }

  /** 提交问题 */
  async function ask() {
    const q = questionEl.value.trim();
    showError('');
    if (!q) {
      showError('问题内容不能为空');
      questionEl.focus();
      return;
    }

    askBtn.disabled = true;
    const prevText = askBtn.textContent;
    askBtn.textContent = '思考中…';

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      let json;
      try { json = await res.json(); }
      catch (_) { json = null; }

      if (!res.ok || !json || !json.ok) {
        const msg = (json && json.error) || ('请求失败（HTTP ' + res.status + '）');
        showError(msg);
        return;
      }

      renderAnswer(json.data);
      questionEl.value = '';
      questionEl.focus();
      await loadHistory();
    } catch (err) {
      showError('网络异常：' + (err && err.message || err));
    } finally {
      askBtn.disabled = false;
      askBtn.textContent = prevText;
    }
  }

  /** 渲染回答区域 */
  function renderAnswer(data) {
    answerEl.classList.remove('empty');
    answerEl.textContent = data.answer || '(空)';

    metaEl.style.display = 'flex';
    const parts = [];
    if (data.mode) parts.push('<span class="tag">模式：' + data.mode + '</span>');
    if (data.createdAt) {
      parts.push('<span>' + formatTime(data.createdAt) + '</span>');
    }
    if (Array.isArray(data.sources) && data.sources.length) {
      parts.push('<span>来源：' + data.sources.map(function (s) {
        return s.title || (typeof s === 'string' ? s : '');
      }).filter(Boolean).join('、') + '</span>');
    }
    metaEl.innerHTML = parts.join('');
  }

  /** 加载历史列表 */
  async function loadHistory() {
    try {
      const res = await fetch('/api/history?limit=20');
      const json = await res.json();
      if (!json || !json.ok) return;
      renderHistory(json.data || []);
    } catch (_) { /* 静默 */ }
  }

  /** 渲染历史列表 */
  function renderHistory(list) {
    if (!list.length) {
      historyEl.innerHTML = '<li class="empty" data-testid="history-item">暂无历史记录</li>';
      return;
    }
    const html = list.map(function (item) {
      const q = (item.question || '').replace(/[<>]/g, function (c) {
        return c === '<' ? '&lt;' : '&gt;';
      });
      return (
        '<li data-id="' + item.id + '" data-testid="history-item">' +
          '<div class="q">' + q + '</div>' +
          '<div class="t">' + formatTime(item.createdAt) + (item.mode ? ' · ' + item.mode : '') + '</div>' +
        '</li>'
      );
    }).join('');
    historyEl.innerHTML = html;

    historyEl.querySelectorAll('li[data-id]').forEach(function (li) {
      li.addEventListener('click', function () {
        const id = li.getAttribute('data-id');
        const target = list.find(function (x) { return x.id === id; });
        if (target) {
          renderAnswer(target);
        }
      });
    });
  }

  /** 格式化时间 */
  function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return (
      d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    );
  }

  // 事件绑定
  askBtn.addEventListener('click', ask);
  questionEl.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      ask();
    }
  });

  // 页面加载时拉取历史
  loadHistory();
})();
