(() => {
  'use strict';
  const AUTH_KEY = 'word-step-identity-v1';
  const MONTH_KEY = 'word-step-calendar-month-v1';
  const LOCAL_PROGRESS_KEY = 'word-step-local-progress-v1';
  const app = document.getElementById('app');
  const uiTranslations = { "TODAY'S STUDY": '今日の学習', "TODAY'S TEST": '今日のテスト', 'TEST RESULT': 'テスト結果' };
  const localizeUi = () => { const walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT); const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode); nodes.forEach((node) => { Object.entries(uiTranslations).forEach(([from, to]) => { const next = node.nodeValue.replaceAll(from, to); if (next !== node.nodeValue) node.nodeValue = next; }); }); };
  new MutationObserver(localizeUi).observe(app, { childList: true, subtree: true, characterData: true });
  const today = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const monthKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const IDENTITIES = [{ id: 'dad', name: 'パパ', avatar: '👨🏻', color: 'blue' }, { id: 'mom', name: 'ママ', avatar: '👩🏻', color: 'coral' }, { id: 'uu', name: 'UU', avatar: '🧒🏻', color: 'gold' }];
  let progress = { studyDates: [], testDates: [] };
  let progressSyncAvailable = true;
  let studyWords = [];

  function randomIndex(max) {
    if (window.crypto && window.crypto.getRandomValues) { const values = new Uint32Array(1); window.crypto.getRandomValues(values); return values[0] % max; }
    return Math.floor(Math.random() * max);
  }
  function shuffleWords(words) {
    const shuffled = words.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) { const swapIndex = randomIndex(index + 1); [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]; }
    if (shuffled.length > 1 && shuffled.every((item, index) => index === 0 || (shuffled[index - 1].word || shuffled[index - 1].english) <= (item.word || item.english))) [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
    return shuffled;
  }
  function getIdentity() { try { const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); return IDENTITIES.find((identity) => identity.id === saved?.id) || null; } catch (error) { return null; } }
  function getMonth() { const saved = localStorage.getItem(MONTH_KEY); if (saved && /^\d{4}-\d{2}$/.test(saved)) { const [year, month] = saved.split('-').map(Number); if (month >= 1 && month <= 12) return new Date(year, month - 1, 1); } return new Date(today.getFullYear(), today.getMonth(), 1); }
  function setMonth(date) { localStorage.setItem(MONTH_KEY, monthKey(date)); }
  function go(view) { window.location.hash = view === 'calendar' ? '' : view; render(); }
  function apiError(message, error) { console.error(message, error); return new Error(message); }
  async function api(path, options = {}) { try { const response = await fetch(path, { headers: { Accept: 'application/json' }, ...options }); if (!response.ok) throw apiError(`API ${response.status}`, response.statusText); return await response.json(); } catch (error) { throw apiError('サーバーと通信できませんでした。時間をおいてもう一度お試しください。', error); } }
  function jsonBody(body) { return { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }; }
  function busy(message = '読み込み中です…') { app.innerHTML = `<main class="status-page"><div class="status-card"><span class="brand-mark">W</span><p>${message}</p></div></main>`; }
  function errorView(error, retry) { app.innerHTML = `<main class="status-page"><div class="status-card"><span class="status-icon">!</span><h1>読み込めませんでした</h1><p>${error.message}</p><button id="retry" class="primary-button" type="button">もう一度試す <span>→</span></button></div></main>`; document.getElementById('retry').addEventListener('click', retry); }
  function selectIdentity(identity) { localStorage.setItem(AUTH_KEY, JSON.stringify({ id: identity.id })); window.location.hash = ''; render(); }
  function getLocalStudyDates(identity) { try { const saved = JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || '{}'); return Array.isArray(saved[identity.id]) ? saved[identity.id].map(String) : []; } catch (error) { return []; } }
  function saveLocalStudyDate(identity, date) { try { const saved = JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || '{}'); const dates = Array.isArray(saved[identity.id]) ? saved[identity.id].map(String) : []; if (!dates.includes(date)) dates.push(date); saved[identity.id] = dates; localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(saved)); } catch (error) { console.error('ローカルの学習記録を保存できませんでした。', error); } }

  function loginView() {
    app.innerHTML = `<main class="auth-layout"><section class="auth-intro"><a class="brand" href="./" aria-label="ワードステップ ホームへ"><span class="brand-mark">W</span>ワードステップ</a><div class="intro-copy"><p class="overline">YOUR WORD JOURNEY</p><h1>毎日の一歩を、<br><em>カレンダー</em>から。</h1><p>学びたい日を見つけて、あなたのペースで単語学習を続けましょう。</p></div><div class="intro-shape" aria-hidden="true"><span></span><span></span><span></span></div></section><section class="auth-panel"><div class="auth-card"><div class="mobile-brand"><span class="brand-mark">W</span>ワードステップ</div><p class="overline">WELCOME BACK</p><h2>だれが学びますか？</h2><p class="auth-description">名前を選ぶと、学習カレンダーがひらきます。</p><div class="identity-list" aria-label="学習する人を選択">${IDENTITIES.map((identity) => `<button class="identity-option identity-${identity.color}" type="button" data-identity="${identity.id}"><span class="identity-avatar" aria-hidden="true">${identity.avatar}</span><span class="identity-name">${identity.name}</span><span class="identity-arrow" aria-hidden="true">→</span></button>`).join('')}</div><p class="local-note"><span aria-hidden="true">▣</span> 選んだ名前はこの端末のブラウザに保存されます</p></div></section></main>`;
    app.innerHTML = app.innerHTML.replace('YOUR WORD JOURNEY', '毎日の単語の旅').replace('WELCOME BACK', 'おかえりなさい');
    document.querySelectorAll('[data-identity]').forEach((button) => button.addEventListener('click', () => { const identity = IDENTITIES.find((item) => item.id === button.dataset.identity); if (identity) selectIdentity(identity); }));
  }
  function normalizeProgress(data) { const source = data?.progress || data || {}; const dates = (value) => Array.isArray(value) ? value.map(String) : []; return { studyDates: dates(source.studyDates || source.studiedDates || source.study_dates), testDates: dates(source.testDates || source.testedDates || source.test_dates) }; }
  async function loadProgress(identity) {
    const localStudyDates = getLocalStudyDates(identity);
    try {
      const cloudProgress = normalizeProgress(await api(`/api/progress?identity=${encodeURIComponent(identity.id)}`));
      progress = { studyDates: localStudyDates, testDates: cloudProgress.testDates };
      progressSyncAvailable = true;
    } catch (error) {
      console.error('クラウドの学習記録を読み込めませんでした。', error);
      progress = { studyDates: localStudyDates, testDates: [] };
      progressSyncAvailable = false;
    }
  }

  function checkinView(identity) {
    const date = dateKey(today);
    app.innerHTML = `<main class="content-page"><header class="site-header"><a class="brand" href="./"><span class="brand-mark">W</span>ワードステップ</a><button class="back-button" id="back-calendar" type="button">← カレンダーへ</button></header><section class="page-heading"><p class="overline">今日の打刻</p><h1>今日も学習をはじめましょう</h1><p>今日の学習を記録して、10単語の学習ページへ進みます。</p></section><div class="checkin-card"><p class="checkin-date">${date}</p><p>学習する準備ができたら、打刻してください。</p><button id="checkin-button" class="primary-button" type="button">今日の打刻をする <span>→</span></button></div></main>`;
    document.getElementById('back-calendar').addEventListener('click', () => go('calendar'));
    document.getElementById('checkin-button').addEventListener('click', () => { saveLocalStudyDate(identity, date); go('study'); });
  }

  function calendarView(identity) {
    const displayed = getMonth(); const year = displayed.getFullYear(); const month = displayed.getMonth(); const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate(); const previous = new Date(year, month - 1, 1); const next = new Date(year, month + 1, 1); const cells = [];
    for (let i = 0; i < firstDay; i += 1) cells.push('<div class="day-cell is-empty" aria-hidden="true"></div>');
    for (let day = 1; day <= daysInMonth; day += 1) { const current = new Date(year, month, day); const key = dateKey(current); const isToday = key === dateKey(today); const weekday = current.getDay(); const studied = progress.studyDates.includes(key); const tested = progress.testDates.includes(key); cells.push(`<div class="day-cell${isToday ? ' is-today' : ''}${weekday === 0 ? ' is-sunday' : ''}"><span class="day-number">${day}</span>${isToday ? '<span class="today-label">今日</span>' : ''}${studied || tested ? `<span class="day-status" aria-label="${studied ? '学習済み' : ''}${tested ? ' テスト済み' : ''}">${studied ? '✓' : ''}${tested ? '★' : ''}</span>` : ''}</div>`); }
    while (cells.length % 7 !== 0) cells.push('<div class="day-cell is-empty" aria-hidden="true"></div>');
    app.innerHTML = `<main class="calendar-page"><header class="site-header"><a class="brand" href="./" aria-label="ワードステップ ホームへ"><span class="brand-mark">W</span>ワードステップ</a><div class="header-actions"><span class="user-chip"><span class="avatar avatar-${identity.color}" aria-hidden="true">${identity.avatar}</span><span>${identity.name}</span></span></div></header><section class="calendar-heading"><div><p class="overline">MY CALENDAR</p><h1>学習カレンダー</h1><p class="heading-subtitle">今日の一歩を、ここから始めましょう。</p></div><button id="today-button" class="today-button" type="button">今日に戻る</button></section><section class="calendar-card" aria-label="${year}年${monthNames[month]}のカレンダー"><div class="calendar-toolbar"><h2>${year}年 <span>${monthNames[month]}</span></h2><div class="month-controls"><button id="previous-month" type="button" aria-label="前の月へ">←</button><button id="next-month" type="button" aria-label="次の月へ">→</button></div></div><div class="weekdays">${labels.map((label, index) => `<span class="${index === 0 ? 'is-sunday' : ''}">${label}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div><p class="calendar-legend">✓ 学習済み　★ テスト済み</p></section><section class="calendar-actions"><button id="study-button" class="primary-button" type="button">今日の打刻をする <span>→</span></button><button id="test-button" class="secondary-button" type="button">今日のテストへ</button></section><p class="privacy-note">学習記録はこの端末に保存され、テスト結果のみサーバーに保存されます。</p></main>`;
    app.innerHTML = app.innerHTML.replace('MY CALENDAR', 'わたしのカレンダー');
    if (!progressSyncAvailable) {
      const notice = document.createElement('p');
      notice.className = 'sync-notice';
      notice.setAttribute('role', 'status');
      notice.textContent = 'クラウド同期を一時的に利用できません。現在の端末に保存された学習記録を表示しています。';
      document.querySelector('.calendar-heading').after(notice);
    }
    document.getElementById('previous-month').addEventListener('click', () => { setMonth(previous); calendarView(identity); }); document.getElementById('next-month').addEventListener('click', () => { setMonth(next); calendarView(identity); }); document.getElementById('today-button').addEventListener('click', () => { setMonth(today); calendarView(identity); }); document.getElementById('study-button').addEventListener('click', () => go('checkin')); document.getElementById('test-button').addEventListener('click', () => go('test'));
  }

  function wordItem(item, index, test = false) { const word = item.word || item.english; const japanese = item.japanese || item.ja || item.meaningJa || ''; const chinese = item.chinese || item.zh || item.meaningZh || item.meaning || ''; const phonetic = item.phonetic || item.ipa || ''; const example = item.example || item.exampleSentence || ''; return `<article class="word-card"><span class="word-number">${String(index + 1).padStart(2, '0')}</span><div class="word-copy"><h3>${japanese}</h3><p class="word-chinese">${chinese}</p>${test ? '' : `<p class="phonetic">${phonetic}</p>`}${test ? `<label class="answer-label" for="answer-${index}">英単語を入力</label><input class="answer-input" id="answer-${index}" data-answer-index="${index}" autocomplete="off" autocapitalize="none" spellcheck="false">` : `<p class="english-word">${word}</p><span class="word-example">${example}</span>`}</div></article>`; }
  async function fetchWords(identity, date) { const data = await api(`/api/words?date=${encodeURIComponent(date)}&identity=${encodeURIComponent(identity.id)}`); const words = Array.isArray(data) ? data : (data.words || data.items || []); if (words.length !== 10) throw new Error('今日の単語を10個取得できませんでした。'); const unique = new Set(words.map((item) => item.word || item.english)); if (unique.size !== 10) throw new Error('今日の単語に重複があります。もう一度お試しください。'); return shuffleWords(words); }

  async function studyView(identity) { busy('今日の単語を読み込んでいます…'); try { studyWords = await fetchWords(identity, dateKey(today)); } catch (error) { errorView(error, () => studyView(identity)); return; } app.innerHTML = `<main class="content-page"><header class="site-header"><a class="brand" href="./"><span class="brand-mark">W</span>ワードステップ</a><button class="back-button" id="back-calendar" type="button">← カレンダーへ</button></header><section class="page-heading"><p class="overline">TODAY'S STUDY</p><h1>今日の10単語</h1><p>英単語、日本語、中国語の意味と発音を確認しましょう。</p></section><section class="word-list study-list">${studyWords.map((item, index) => wordItem(item, index)).join('')}</section><div class="page-actions"><button id="complete-study" class="primary-button" type="button">学習を完了する <span>→</span></button><button id="to-test" class="secondary-button" type="button">今日のテストへ</button></div><p id="study-message" class="inline-message" role="status"></p></main>`; document.getElementById('back-calendar').addEventListener('click', () => go('calendar')); document.getElementById('to-test').addEventListener('click', () => go('test')); document.getElementById('complete-study').addEventListener('click', () => { saveLocalStudyDate(identity, dateKey(today)); document.getElementById('study-message').textContent = '学習を記録しました。おつかれさまでした。'; }); }

  async function testView(identity) { if (!studyWords.length) { busy('テストを準備しています…'); try { studyWords = await fetchWords(identity, dateKey(today)); } catch (error) { errorView(error, () => testView(identity)); return; } } app.innerHTML = `<main class="content-page"><header class="site-header"><a class="brand" href="./"><span class="brand-mark">W</span>ワードステップ</a><button class="back-button" id="back-calendar" type="button">← カレンダーへ</button></header><section class="page-heading"><p class="overline">TODAY'S TEST</p><h1>今日のテスト</h1><p>日本語と中国語の意味を見て、英単語を入力してください。</p></section><form id="test-form" class="word-list study-list">${studyWords.map((item, index) => wordItem(item, index, true)).join('')}<div class="page-actions"><button class="primary-button" type="submit">答え合わせをする <span>→</span></button></div></form><p id="test-message" class="inline-message" role="status"></p></main>`; document.getElementById('back-calendar').addEventListener('click', () => go('calendar')); document.getElementById('test-form').addEventListener('submit', async (event) => { event.preventDefault(); const answers = [...document.querySelectorAll('[data-answer-index]')].map((input) => input.value.trim()); const correct = answers.reduce((total, answer, index) => total + (answer.toLowerCase() === String(studyWords[index].word || studyWords[index].english).toLowerCase() ? 1 : 0), 0); const message = document.getElementById('test-message'); try { await api('/api/test-result', jsonBody({ identity: identity.id, date: dateKey(today), answers, correctAnswers: correct, totalQuestions: studyWords.length })); app.innerHTML = `<main class="result-page"><div class="result-card"><p class="overline">TEST RESULT</p><h1>テスト結果</h1><p class="result-score">${Math.round(correct / studyWords.length * 100)}<small>%</small></p><p>${correct} / ${studyWords.length} 問正解です。</p><div class="page-actions"><button id="result-calendar" class="primary-button" type="button">カレンダーへ <span>→</span></button><button id="result-retry" class="secondary-button" type="button">もう一度テストする</button></div></div></main>`; document.getElementById('result-calendar').addEventListener('click', () => go('calendar')); document.getElementById('result-retry').addEventListener('click', () => testView(identity)); } catch (error) { message.textContent = `テスト結果を保存できませんでした。${error.message}`; } }); }
  async function render() { const identity = getIdentity(); if (!identity) { loginView(); return; } const view = window.location.hash.slice(1) || 'calendar'; if (view === 'checkin') { checkinView(identity); return; } if (view === 'study') { studyView(identity); return; } if (view === 'test') { testView(identity); return; } busy('カレンダーを読み込んでいます…'); await loadProgress(identity); calendarView(identity); }
  window.addEventListener('hashchange', render); render();
})();
