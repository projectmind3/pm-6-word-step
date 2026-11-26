(() => {
  'use strict';
  const AUTH_KEY = 'word-step-identity-v1';
  const MONTH_KEY = 'word-step-calendar-month-v1';
  const LOCAL_PROGRESS_KEY = 'word-step-local-progress-v1';
  const CREATOR_IDENTITY = 'dad';
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
  let progress = { studyDates: [], testDates: [], tests: [] };
  let progressSyncAvailable = true;
  let studyWords = [];
  let studyWordsDate = null;
  let selectedDate = dateKey(today);

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
  function goToDate(view, date) { selectedDate = date; window.location.hash = view === 'calendar' ? '' : `${view}?date=${encodeURIComponent(date)}`; render(); }
  function isValidDateKey(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const parsed = new Date(`${value}T00:00:00`); return !Number.isNaN(parsed.valueOf()) && dateKey(parsed) === value; }
  function getRouteDate(view) { const query = view.indexOf('?') >= 0 ? view.slice(view.indexOf('?') + 1) : ''; const date = new URLSearchParams(query).get('date'); return date === null ? selectedDate : (isValidDateKey(date) ? date : null); }
  function apiError(message, error) { console.error(message, error); return new Error(message); }
  async function api(path, options = {}) { try { const response = await fetch(path, { headers: { Accept: 'application/json' }, ...options }); if (!response.ok) throw apiError(`API ${response.status}`, response.statusText); return await response.json(); } catch (error) { throw apiError('サーバーと通信できませんでした。時間をおいてもう一度お試しください。', error); } }
  function jsonBody(body) { return { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }; }
  async function downloadBackup(identity) {
    const button = document.getElementById('backup-button');
    const message = document.getElementById('backup-message');
    if (!button || !message) return;
    button.disabled = true;
    button.textContent = 'バックアップを準備中…';
    message.textContent = '';
    try {
      const response = await fetch(`/api/backup?identity=${encodeURIComponent(identity.id)}`, { headers: { Accept: 'text/csv, application/json' } });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) throw new Error('バックアップを作成できませんでした。');
      if (contentType.includes('application/json')) {
        const result = await response.json();
        message.textContent = result.message || '保存済みの単語がありません。';
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `word-step-${identity.id}-backup-${dateKey(today)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      message.textContent = 'バックアップをダウンロードしました。';
    } catch (error) {
      console.error('単語バックアップをダウンロードできませんでした。', error);
      message.textContent = 'バックアップをダウンロードできませんでした。時間をおいてもう一度お試しください。';
    } finally {
      button.disabled = false;
      button.textContent = 'ダウンロードする';
    }
  }
  function busy(message = '読み込み中です…') { app.innerHTML = `<main class="status-page"><div class="status-card"><span class="brand-mark">W</span><p>${message}</p></div></main>`; }
  function errorView(error, retry) { app.innerHTML = `<main class="status-page"><div class="status-card"><span class="status-icon">!</span><h1>読み込めませんでした</h1><p>${error.message}</p><button id="retry" class="primary-button" type="button">もう一度試す <span>→</span></button></div></main>`; document.getElementById('retry').addEventListener('click', retry); }
  function selectIdentity(identity) { localStorage.setItem(AUTH_KEY, JSON.stringify({ id: identity.id })); window.location.hash = ''; render(); }
  function getLocalStudyDates(identity) { try { const saved = JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || '{}'); return Array.isArray(saved[identity.id]) ? saved[identity.id].map(String) : []; } catch (error) { return []; } }
  function saveLocalStudyDate(identity, date) { try { const saved = JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || '{}'); const dates = Array.isArray(saved[identity.id]) ? saved[identity.id].map(String) : []; if (!dates.includes(date)) dates.push(date); saved[identity.id] = dates; localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(saved)); } catch (error) { console.error('ローカルの学習記録を保存できませんでした。', error); } }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }

  function loginView() {
    app.innerHTML = `<main class="auth-layout"><section class="auth-intro"><a class="brand" href="./" aria-label="ワードステップ ホームへ"><span class="brand-mark">W</span>ワードステップ</a><div class="intro-copy"><p class="overline">YOUR WORD JOURNEY</p><h1>毎日の一歩を、<br><em>カレンダー</em>から。</h1><p>学びたい日を見つけて、あなたのペースで単語学習を続けましょう。</p></div><div class="intro-shape" aria-hidden="true"><span></span><span></span><span></span></div></section><section class="auth-panel"><div class="auth-card"><div class="mobile-brand"><span class="brand-mark">W</span>ワードステップ</div><p class="overline">WELCOME BACK</p><h2>だれが学びますか？</h2><p class="auth-description">名前を選ぶと、学習カレンダーがひらきます。</p><div class="identity-list" aria-label="学習する人を選択">${IDENTITIES.map((identity) => `<button class="identity-option identity-${identity.color}" type="button" data-identity="${identity.id}"><span class="identity-avatar" aria-hidden="true">${identity.avatar}</span><span class="identity-name">${identity.name}</span><span class="identity-arrow" aria-hidden="true">→</span></button>`).join('')}</div><p class="local-note"><span aria-hidden="true">▣</span> 選んだ名前はこの端末のブラウザに保存されます</p></div></section></main>`;
    app.innerHTML = app.innerHTML.replace('YOUR WORD JOURNEY', '毎日の単語の旅').replace('WELCOME BACK', 'おかえりなさい');
    document.querySelectorAll('[data-identity]').forEach((button) => button.addEventListener('click', () => { const identity = IDENTITIES.find((item) => item.id === button.dataset.identity); if (identity) selectIdentity(identity); }));
  }
  function normalizeProgress(data) { const source = data?.progress || data || {}; const dates = (value) => Array.isArray(value) ? value.map(String) : []; const tests = Array.isArray(source.tests) ? source.tests.map((test) => ({ identity: String(test.identity), date: String(test.date), correctAnswers: Number(test.correctAnswers), totalQuestions: Number(test.totalQuestions), completedAt: test.completedAt || null })) : []; return { studyDates: dates(source.studyDates || source.studiedDates || source.study_dates), testDates: dates(source.testDates || source.testedDates || source.test_dates), tests }; }
  async function loadProgress(identity) {
    const localStudyDates = getLocalStudyDates(identity);
    try {
      const cloudProgress = normalizeProgress(await api(`/api/progress?identity=${encodeURIComponent(identity.id)}`));
      progress = { studyDates: cloudProgress.studyDates, testDates: cloudProgress.testDates, tests: cloudProgress.tests };
      progressSyncAvailable = true;
    } catch (error) {
      console.error('クラウドの学習記録を読み込めませんでした。', error);
      progress = { studyDates: localStudyDates, testDates: [], tests: [] };
      progressSyncAvailable = false;
    }
  }

  function checkinView(identity, date) {
    app.innerHTML = `<main class="content-page"><header class="site-header"><a class="brand" href="./"><span class="brand-mark">W</span>ワードステップ</a><button class="back-button" id="back-calendar" type="button">← カレンダーへ</button></header><section class="page-heading"><p class="overline">${date === dateKey(today) ? '今日の打刻' : '学習日の打刻'}</p><h1>${date}の学習をはじめましょう</h1><p>${date}の学習を記録して、10単語の学習ページへ進みます。</p></section><div class="checkin-card"><p class="checkin-date">${date}</p><p>学習する準備ができたら、打刻してください。</p><button id="checkin-button" class="primary-button" type="button">${date === dateKey(today) ? '今日の打刻をする' : 'この日の打刻をする'} <span>→</span></button></div></main>`;
    document.getElementById('back-calendar').addEventListener('click', () => go('calendar'));
    document.getElementById('checkin-button').addEventListener('click', () => { saveLocalStudyDate(identity, date); goToDate('study', date); });
  }

  function calendarView(identity) {
    const displayed = getMonth(); const year = displayed.getFullYear(); const month = displayed.getMonth(); const firstDay = new Date(year, month, 1).getDay(); const daysInMonth = new Date(year, month + 1, 0).getDate(); const previous = new Date(year, month - 1, 1); const next = new Date(year, month + 1, 1); const cells = [];
    for (let i = 0; i < firstDay; i += 1) cells.push('<div class="day-cell is-empty" aria-hidden="true"></div>');
    for (let day = 1; day <= daysInMonth; day += 1) { const current = new Date(year, month, day); const key = dateKey(current); const isToday = key === dateKey(today); const isFuture = current > today; const weekday = current.getDay(); const studied = progress.studyDates.includes(key); const tests = progress.tests.filter((test) => test.date === key); const testInfo = tests.map((test) => { const testIdentity = IDENTITIES.find((item) => item.id === test.identity); return `<span class="test-badge"><span class="avatar avatar-${testIdentity?.color || 'blue'}" title="${testIdentity?.name || test.identity}">${testIdentity?.avatar || '●'}</span><span>${test.correctAnswers}/${test.totalQuestions}</span></span>`; }).join(''); const content = `<span class="day-number">${day}</span>${isToday ? '<span class="today-label">今日</span>' : ''}${studied ? '<span class="study-badge" aria-label="学習済み">✓</span>' : ''}${testInfo ? `<span class="test-badges">${testInfo}</span>` : ''}`; cells.push(`<button class="day-cell day-button${isToday ? ' is-today' : ''}${isFuture ? ' is-future' : ''}${weekday === 0 ? ' is-sunday' : ''}" type="button" data-date="${key}" aria-label="${isFuture ? `${key}の学習を始める` : `${key}の学習単語を見る`}">${content}</button>`); }
    while (cells.length % 7 !== 0) cells.push('<div class="day-cell is-empty" aria-hidden="true"></div>');
    const selectedIsToday = selectedDate === dateKey(today); const selectedIsFuture = selectedDate > dateKey(today); const studyButtonLabel = selectedIsToday ? '今日の打刻をする' : selectedIsFuture ? `${selectedDate}の学習を始める` : `${selectedDate}の学習を見る`; const testButtonLabel = selectedIsToday ? '今日のテストへ' : `${selectedDate}のテストへ`;
    app.innerHTML = `<main class="calendar-page"><header class="site-header"><a class="brand" href="./" aria-label="ワードステップ ホームへ"><span class="brand-mark">W</span>ワードステップ</a><div class="header-actions"><span class="user-chip"><span class="avatar avatar-${identity.color}" aria-hidden="true">${identity.avatar}</span><span>${identity.name}</span></span></div></header><section class="calendar-heading"><div><p class="overline">MY CALENDAR</p><h1>学習カレンダー</h1><p class="heading-subtitle">今日の一歩を、ここから始めましょう。</p></div><button id="today-button" class="today-button" type="button">今日に戻る</button></section><section class="calendar-card" aria-label="${year}年${monthNames[month]}のカレンダー"><div class="calendar-toolbar"><h2>${year}年 <span>${monthNames[month]}</span></h2><div class="month-controls"><button id="previous-month" type="button" aria-label="前の月へ">←</button><button id="next-month" type="button" aria-label="次の月へ">→</button></div></div><div class="weekdays">${labels.map((label, index) => `<span class="${index === 0 ? 'is-sunday' : ''}">${label}</span>`).join('')}</div><div class="calendar-grid">${cells.join('')}</div><p class="calendar-legend">✓ 学習済み　テスト: アバター・正解数</p></section><section class="calendar-actions"><button id="study-button" class="primary-button" type="button">${studyButtonLabel} <span>→</span></button><button id="test-button" class="secondary-button" type="button">${testButtonLabel}</button></section><section class="backup-card" aria-labelledby="backup-title"><div><h2 id="backup-title">自分の準2級単語バックアップをダウンロード</h2><p>現在のユーザーが保存した単語を CSV でダウンロードできます。</p></div><button id="backup-button" class="secondary-button" type="button">ダウンロードする</button><p id="backup-message" class="backup-message" role="status" aria-live="polite"></p></section><p class="privacy-note">学習記録とテスト結果はクラウドに保存され、通信失敗時はこの端末にも一時保存されます。</p></main>`;
    app.innerHTML = app.innerHTML.replace('MY CALENDAR', 'わたしのカレンダー');
    if (identity.id === CREATOR_IDENTITY) app.innerHTML = app.innerHTML.replace('<section class="backup-card"', '<section class="creator-entry" aria-labelledby="creator-words-title"><div><h2 id="creator-words-title">準2級単語を確認する</h2><p>データベースに登録されている全単語を確認できます。</p></div><button id="creator-words-button" class="secondary-button" type="button">単語一覧を見る <span>→</span></button></section><section class="backup-card"');
    if (!progressSyncAvailable) {
      const notice = document.createElement('p');
      notice.className = 'sync-notice';
      notice.setAttribute('role', 'status');
      notice.textContent = 'クラウド同期を一時的に利用できません。現在の端末に保存された学習記録を表示しています。';
      document.querySelector('.calendar-heading').after(notice);
    }
    document.getElementById('previous-month').addEventListener('click', () => { setMonth(previous); calendarView(identity); }); document.getElementById('next-month').addEventListener('click', () => { setMonth(next); calendarView(identity); }); document.getElementById('today-button').addEventListener('click', () => { selectedDate = dateKey(today); setMonth(today); calendarView(identity); }); document.querySelectorAll('[data-date]').forEach((button) => button.addEventListener('click', () => { const date = button.dataset.date; selectedDate = date; if (date > dateKey(today)) goToDate('study', date); else go(`study-date=${date}`); })); document.getElementById('study-button').addEventListener('click', () => { if (selectedIsFuture) goToDate('study', selectedDate); else if (selectedIsToday) goToDate('checkin', selectedDate); else go(`study-date=${selectedDate}`); }); document.getElementById('test-button').addEventListener('click', () => goToDate('test', selectedDate)); document.getElementById('backup-button').addEventListener('click', () => downloadBackup(identity)); if (identity.id === CREATOR_IDENTITY) document.getElementById('creator-words-button').addEventListener('click', () => go('creator-words'));
  }

  function wordItem(item, index, test = false, detail = false) { const word = item.word || item.english; const japanese = item.japanese || item.ja || item.meaningJa || ''; const chinese = item.chinese || item.zh || item.meaningZh || item.meaning || ''; const phonetic = item.phonetic || item.ipa || ''; const example = item.example || item.exampleSentence || ''; const learned = item.learned ? '<span class="learned-label">学習済み</span>' : detail ? '<span class="unlearned-label">未完了</span>' : ''; return `<article class="word-card${detail && item.learned ? ' is-learned' : ''}"><span class="word-number">${String(index + 1).padStart(2, '0')}</span><div class="word-copy"><h3>${japanese}</h3><p class="word-chinese">${chinese}</p>${test ? '' : `<p class="phonetic">${phonetic}</p>`}${test ? `<label class="answer-label" for="answer-${index}">英単語を入力</label><input class="answer-input" id="answer-${index}" data-answer-index="${index}" autocomplete="off" autocapitalize="none" spellcheck="false">` : `<p class="english-word">${word}</p><span class="word-example">${example}</span>`}${learned}</div></article>`; }
  async function fetchWords(identity, date, shuffle = true) { const data = await api(`/api/words?date=${encodeURIComponent(date)}&identity=${encodeURIComponent(identity.id)}`); const words = Array.isArray(data) ? data : (data.words || data.items || []); if (words.length !== 10) throw new Error('今日の単語を10個取得できませんでした。'); const unique = new Set(words.map((item) => item.word || item.english)); if (unique.size !== 10) throw new Error('今日の単語に重複があります。もう一度お試しください。'); return shuffle ? shuffleWords(words) : words; }

  async function studyView(identity, date) { selectedDate = date; busy(`${date}の単語を読み込んでいます…`); try { studyWords = await fetchWords(identity, date); studyWordsDate = date; } catch (error) { errorView(error, () => studyView(identity, date)); return; } app.innerHTML = `<main class="content-page"><header class="site-header"><a class="brand" href="./"><span class="brand-mark">W</span>ワードステップ</a><button class="back-button" id="back-calendar" type="button">← カレンダーへ</button></header><section class="page-heading"><p class="overline">${date === dateKey(today) ? '今日の学習' : '選択した日の学習'}</p><h1>${date}の10単語</h1><p>英単語、日本語、中国語の意味と発音を確認しましょう。</p></section><section class="word-list study-list">${studyWords.map((item, index) => wordItem(item, index)).join('')}</section><div class="page-actions"><button id="complete-study" class="primary-button" type="button">学習を完了する <span>→</span></button><button id="to-test" class="secondary-button" type="button">${date === dateKey(today) ? '今日のテストへ' : `${date}のテストへ`}</button></div><p id="study-message" class="inline-message" role="status"></p></main>`; document.getElementById('back-calendar').addEventListener('click', () => go('calendar')); document.getElementById('to-test').addEventListener('click', () => goToDate('test', date)); document.getElementById('complete-study').addEventListener('click', async () => { const button = document.getElementById('complete-study'); const message = document.getElementById('study-message'); button.disabled = true; message.textContent = '学習記録を保存しています…'; try { await api('/api/study', jsonBody({ identity: identity.id, date, words: studyWords.map((item) => ({ id: Number(item.id), word: item.english || item.word, learned: true })) })); saveLocalStudyDate(identity, date); message.textContent = '学習をクラウドに記録しました。おつかれさまでした。'; } catch (error) { saveLocalStudyDate(identity, date); message.textContent = `クラウドに保存できませんでした。端末に記録しました。${error.message}`; } finally { button.disabled = false; } }); }

  async function studyDetailView(identity, date) { busy('学習単語を読み込んでいます…'); try { const words = await fetchWords(identity, date, false); const completed = words.every((item) => item.learned); const hasLearnedWords = words.some((item) => item.learned); const studyAction = completed ? '' : `<button id="detail-study" class="primary-button" type="button">${hasLearnedWords ? '学習を続ける' : '学習をはじめる'} <span>→</span></button>`; app.innerHTML = `<main class="content-page"><header class="site-header"><a class="brand" href="./"><span class="brand-mark">W</span>ワードステップ</a><button class="back-button" id="back-calendar" type="button">← カレンダーへ</button></header><section class="page-heading"><p class="overline">${date === dateKey(today) ? '今日の学習' : '学習の記録'}</p><h1>${date}の10単語</h1><p>${completed ? '10単語の学習が完了しています。' : hasLearnedWords ? 'この日の学習は途中です。続きから再開できます。' : 'この日の単語です。まだ学習完了の記録はありません。'}</p></section><section class="word-list study-list">${words.map((item, index) => wordItem(item, index, false, true)).join('')}</section><div class="page-actions">${studyAction}<button id="detail-calendar" class="${completed ? 'primary' : 'secondary'}-button" type="button">カレンダーへ <span>→</span></button></div></main>`; document.getElementById('back-calendar').addEventListener('click', () => go('calendar')); document.getElementById('detail-calendar').addEventListener('click', () => go('calendar')); if (!completed) document.getElementById('detail-study').addEventListener('click', () => goToDate('study', date)); } catch (error) { errorView(error, () => studyDetailView(identity, date)); } }

  async function testView(identity, date) { selectedDate = date; if (studyWordsDate !== date || !studyWords.length) { busy(`${date}のテストを準備しています…`); try { studyWords = await fetchWords(identity, date); studyWordsDate = date; } catch (error) { errorView(error, () => testView(identity, date)); return; } } app.innerHTML = `<main class="content-page"><header class="site-header"><a class="brand" href="./"><span class="brand-mark">W</span>ワードステップ</a><button class="back-button" id="back-calendar" type="button">← カレンダーへ</button></header><section class="page-heading"><p class="overline">${date === dateKey(today) ? '今日のテスト' : '選択した日のテスト'}</p><h1>${date}のテスト</h1><p>日本語と中国語の意味を見て、英単語を入力してください。</p></section><form id="test-form" class="word-list study-list">${studyWords.map((item, index) => wordItem(item, index, true)).join('')}<div class="page-actions"><button class="primary-button" type="submit">答え合わせをする <span>→</span></button></div></form><p id="test-message" class="inline-message" role="status"></p></main>`; document.getElementById('back-calendar').addEventListener('click', () => go('calendar')); document.getElementById('test-form').addEventListener('submit', async (event) => { event.preventDefault(); const answers = [...document.querySelectorAll('[data-answer-index]')].map((input) => input.value.trim()); const correct = answers.reduce((total, answer, index) => total + (answer.toLowerCase() === String(studyWords[index].word || studyWords[index].english).toLowerCase() ? 1 : 0), 0); const message = document.getElementById('test-message'); try { await api('/api/test-result', jsonBody({ identity: identity.id, date, answers, correctAnswers: correct, totalQuestions: studyWords.length })); app.innerHTML = `<main class="result-page"><div class="result-card"><p class="overline">TEST RESULT</p><h1>${date}のテスト結果</h1><p class="result-score">${Math.round(correct / studyWords.length * 100)}<small>%</small></p><p>${correct} / ${studyWords.length} 問正解です。</p><div class="page-actions"><button id="result-calendar" class="primary-button" type="button">カレンダーへ <span>→</span></button><button id="result-retry" class="secondary-button" type="button">もう一度テストする</button></div></div></main>`; document.getElementById('result-calendar').addEventListener('click', () => go('calendar')); document.getElementById('result-retry').addEventListener('click', () => testView(identity, date)); } catch (error) { message.textContent = `テスト結果を保存できませんでした。${error.message}`; } }); }
  async function render() { const identity = getIdentity(); if (!identity) { loginView(); return; } const view = window.location.hash.slice(1) || 'calendar'; if (view === 'checkin' || view.startsWith('checkin?')) { const date = getRouteDate(view); if (!date) { go('calendar'); return; } selectedDate = date; checkinView(identity, date); return; } if (view === 'study' || view.startsWith('study?')) { const date = getRouteDate(view); if (!date) { go('calendar'); return; } selectedDate = date; studyView(identity, date); return; } if (view === 'test' || view.startsWith('test?')) { const date = getRouteDate(view); if (!date) { go('calendar'); return; } selectedDate = date; testView(identity, date); return; } if (view.startsWith('study-date=')) { const date = view.slice('study-date='.length); if (!isValidDateKey(date)) { go('calendar'); return; } selectedDate = date; if (date > dateKey(today)) { studyView(identity, date); return; } studyDetailView(identity, date); return; } busy('カレンダーを読み込んでいます…'); await loadProgress(identity); calendarView(identity); }
  async function creatorWordsView(identity) {
    if (identity.id !== CREATOR_IDENTITY) { go('calendar'); return; }
    busy('準2級単語一覧を読み込んでいます…');
    try {
      const data = await api(`/api/creator-words?identity=${encodeURIComponent(identity.id)}`);
      const words = Array.isArray(data.words) ? data.words : [];
      app.innerHTML = `<main class="content-page creator-words-page"><header class="site-header"><a class="brand" href="./" aria-label="ワードステップ ホームへ"><span class="brand-mark">W</span>ワードステップ</a><button class="back-button" id="back-calendar" type="button">← カレンダーへ</button></header><section class="page-heading"><p class="overline">CREATOR WORDS</p><h1>準2級単語一覧</h1><p>全${Number(data.total) || words.length}語。データベースに登録されている単語を確認できます。</p></section><label class="creator-search-label" for="creator-search">単語を検索</label><input id="creator-search" class="creator-search" type="search" placeholder="英語・日本語・中国語で検索" autocomplete="off"><p id="creator-count" class="creator-count" role="status"></p><section id="creator-word-list" class="creator-word-list"></section></main>`;
      const list = document.getElementById('creator-word-list'); const count = document.getElementById('creator-count');
      const renderWords = () => { const query = document.getElementById('creator-search').value.trim().toLocaleLowerCase(); const filtered = words.filter((word) => [word.english, word.japanese, word.chinese].some((value) => String(value).toLocaleLowerCase().includes(query))); count.textContent = query ? `${filtered.length}語見つかりました。` : `全${words.length}語`; list.innerHTML = filtered.length ? filtered.map((word, index) => `<article class="creator-word-card"><span class="word-number">${String(index + 1).padStart(2, '0')}</span><div><h2>${escapeHtml(word.english)}</h2><p class="creator-phonetic">${escapeHtml(word.phonetic)}</p><p><strong>日本語：</strong>${escapeHtml(word.japanese)}</p><p><strong>中国語：</strong>${escapeHtml(word.chinese)}</p><p class="creator-example">${escapeHtml(word.example)}</p></div></article>`).join('') : '<p class="empty-message">条件に一致する単語がありません。</p>'; };
      document.getElementById('back-calendar').addEventListener('click', () => go('calendar')); document.getElementById('creator-search').addEventListener('input', renderWords); renderWords();
    } catch (error) { errorView(error, () => creatorWordsView(identity)); }
  }

  window.addEventListener('hashchange', () => { render(); if (window.location.hash.slice(1) === 'creator-words') { const identity = getIdentity(); if (identity) creatorWordsView(identity); } }); if (window.location.hash.slice(1) === 'creator-words') { const identity = getIdentity(); if (identity) creatorWordsView(identity); else loginView(); } else render();
})();
