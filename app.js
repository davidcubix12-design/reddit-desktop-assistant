const csrf = document.querySelector('meta[name="csrf-token"]').content;
const $ = id => document.getElementById(id);
const node = (tag, className = '', content = '') => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = content;
  return el;
};
const button = (label, action, className = '') => {
  const el = node('button', className, label);
  el.type = 'button';
  el.addEventListener('click', action);
  return el;
};
let state = { account: '', drafts: [], communities: [], sources: [] };
let pendingApproval = null;
let busy = false;
function notice(message, error = false) {
  const el = $('notice'); el.hidden = false; el.textContent = message; el.classList.toggle('error', error);
}
async function api(path, body = null) {
  const response = await fetch(path, body === null ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Запрос не выполнен.');
  return data;
}
async function run(task) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach(el => { el.disabled = true; });
  try { await task(); }
  catch (error) { notice(error.message || 'Неизвестная ошибка.', true); }
  finally {
    busy = false;
    document.querySelectorAll('button').forEach(el => { el.disabled = false; });
    $('sendApproval').disabled = !$('approvalCheck').checked || !pendingApproval;
  }
}
async function refresh() { state = await api('/api/state'); render(); }
function link(url, label) {
  if (!url || !/^https:\/\/(www\.)?reddit\.com\//i.test(url)) return null;
  const el = node('a', '', label); el.href = url; el.target = '_blank'; el.rel = 'noopener noreferrer'; return el;
}
function render() {
  $('accountBadge').textContent = state.account ? `Подключено: u/${state.account}` : 'Не подключено';
  $('disconnectBtn').hidden = !state.account;
  $('connectionForm').hidden = Boolean(state.account);
  $('connectBtn').hidden = Boolean(state.account);
  $('approved').parentElement.hidden = Boolean(state.account);
  renderCommunities(); renderSources(); renderDrafts();
}
function renderCommunities() {
  const host = $('communityList'); host.replaceChildren();
  for (const item of state.communities) {
    const card = node('div', 'item');
    const head = node('div', 'itemHead');
    head.append(node('h3', '', `r/${item.name}`), node('span', 'status', item.blocked ? 'Возможно, ИИ запрещён' : item.allowed ? 'Разрешено вами' : 'Нужен просмотр'));
    card.append(head);
    const rules = node('div', 'rules', item.rules.map(rule => `${rule.short_name}\n${rule.description}`).join('\n\n') || 'Сообщество не вернуло текст правил. Проверьте дополнительные правила на его странице.');
    card.append(rules);
    const open = link(`https://www.reddit.com/r/${item.name}/about/rules`, 'Открыть правила на Reddit'); if (open) card.append(open);
    if (!item.blocked && !item.allowed) {
      const row = node('div', 'row');
      row.append(button('Я проверил: ИИ разрешён', () => run(async () => {
        await api('/api/community/allow', { name: item.name, hash: item.hash, allowed: true });
        notice(`r/${item.name} добавлено после вашего подтверждения.`); await refresh();
      })));
      card.append(row);
    }
    host.append(card);
  }
}
function renderSources() {
  const host = $('sourceList'); host.replaceChildren();
  if (!state.sources.length) { host.append(node('p', 'hint', 'Обсуждения и входящие появятся здесь после подключения и загрузки.')); return; }
  for (const source of state.sources.slice().reverse().slice(0, 50)) {
    const card = node('div', 'item');
    card.append(node('small', '', source.incoming ? 'Входящее сообщение или ответ' : `r/${source.subreddit} · ${source.comments} комментариев`));
    card.append(node('h3', '', source.title || source.name));
    if (source.body) card.append(node('p', '', source.body.slice(0, 500)));
    const row = node('div', 'row');
    const open = link(source.permalink, 'Открыть на Reddit'); if (open) row.append(open);
    row.append(button('Ответить', () => run(async () => {
      await api('/api/draft/create', { kind: 'reply', target: source.name, title: '', body: '' });
      notice('Черновик ответа создан ниже.'); await refresh(); $('draftList').scrollIntoView({ behavior: 'smooth' });
    })));
    card.append(row); host.append(card);
  }
}
function renderDrafts() {
  const host = $('draftList'); host.replaceChildren();
  if (!state.drafts.length) { host.append(node('p', 'hint', 'Очередь пуста. Создайте пост или выберите обсуждение для ответа.')); return; }
  for (const draft of state.drafts) {
    const card = node('article', 'item draft');
    const head = node('div', 'itemHead');
    head.append(node('h3', '', draft.kind === 'post' ? `Пост в r/${draft.subreddit}` : `Ответ: ${draft.sourceLabel || draft.target}`));
    head.append(node('span', 'status', { draft: 'Черновик', sending: 'Отправляется', sent: 'Отправлено', uncertain: 'Проверьте Reddit' }[draft.status] || draft.status));
    card.append(head);
    if (draft.message) card.append(node('p', '', draft.message));
    const result = link(draft.resultUrl, 'Открыть опубликованное'); if (result) card.append(result);
    if (draft.status === 'draft') {
      const titleLabel = node('label', '', 'Заголовок на английском');
      const titleInput = node('input'); titleInput.value = draft.title; titleInput.maxLength = 300;
      if (draft.kind !== 'post') titleLabel.hidden = true;
      titleLabel.append(titleInput); card.append(titleLabel);
      const bodyLabel = node('label', '', 'Текст на английском');
      const bodyInput = node('textarea'); bodyInput.value = draft.body; bodyInput.maxLength = 10000;
      bodyLabel.append(bodyInput); card.append(bodyLabel);
      const row = node('div', 'row');
      const save = () => api('/api/draft/edit', { id: draft.id, title: titleInput.value, body: bodyInput.value });
      row.append(button('Сохранить', () => run(async () => { await save(); notice('Черновик сохранён.'); await refresh(); }), 'quiet'));
      row.append(button('Предложить текст', () => run(async () => {
        const changed = titleInput.value !== draft.title || bodyInput.value !== draft.body;
        if (changed) {
          if (!bodyInput.value.trim() || (draft.kind === 'post' && !titleInput.value.trim())) {
            throw new Error('Чтобы учесть ваши правки, заполните заголовок и текст или очистите оба поля.');
          }
          await save();
        }
        await api('/api/draft/generate', { id: draft.id, model: $('modelName').value });
        notice('Текст готов. Проверьте его перед отправкой.'); await refresh();
      }), 'quiet'));
      row.append(button('Проверить и отправить', () => run(async () => {
        await save();
        const preview = await api('/api/preview', { id: draft.id });
        pendingApproval = { id: draft.id, confirmation: preview.confirmation };
        $('approvalDestination').textContent = preview.draft.kind === 'post' ? `Новый пост · r/${preview.draft.subreddit}` : `Ответ · ${preview.draft.target}`;
        $('approvalPostTitle').textContent = preview.draft.title;
        $('approvalBody').textContent = preview.draft.body;
        $('approvalCheck').checked = false; $('sendApproval').disabled = true;
        $('approvalDialog').showModal();
      })));
      row.append(button('Удалить', () => run(async () => { await api('/api/draft/remove', { id: draft.id }); await refresh(); }), 'danger'));
      card.append(row);
    } else if (draft.status !== 'sending') card.append(button('Убрать из очереди', () => run(async () => { await api('/api/draft/remove', { id: draft.id }); await refresh(); }), 'quiet'));
    host.append(card);
  }
}
$('connectBtn').addEventListener('click', () => run(async () => {
  const result = await api('/api/connect', { clientId: $('clientId').value, username: $('username').value, approved: $('approved').checked });
  location.assign(result.url);
}));
$('disconnectBtn').addEventListener('click', () => run(async () => { await api('/api/disconnect', {}); notice('Отключено. Содержимое очереди удалено из памяти.'); await refresh(); }));
$('reviewBtn').addEventListener('click', () => run(async () => { await api('/api/community/review', { name: $('communityName').value }); await refresh(); }));
$('discoverBtn').addEventListener('click', () => run(async () => { const data = await api('/api/discover', {}); notice(`Загружено ${data.items.length} недавних обсуждений.`); await refresh(); }));
$('inboxBtn').addEventListener('click', () => run(async () => { const data = await api('/api/inbox', {}); notice(`Загружено ${data.items.length} входящих.`); await refresh(); }));
$('newPostBtn').addEventListener('click', () => run(async () => {
  const community = $('postCommunity').value;
  await api('/api/draft/create', { kind: 'post', subreddit: community, context: $('postTopic').value, title: '', body: '' });
  notice('Черновик поста создан ниже.'); await refresh(); $('draftList').scrollIntoView({ behavior: 'smooth' });
}));
$('approvalCheck').addEventListener('change', () => { $('sendApproval').disabled = !$('approvalCheck').checked || !pendingApproval || busy; });
$('cancelApproval').addEventListener('click', () => { $('approvalDialog').close(); pendingApproval = null; });
$('approvalDialog').addEventListener('close', () => { pendingApproval = null; $('approvalCheck').checked = false; });
$('sendApproval').addEventListener('click', () => run(async () => {
  if (!pendingApproval || !$('approvalCheck').checked) return;
  const approval = pendingApproval; pendingApproval = null; $('approvalDialog').close();
  try { await api('/api/send', { id: approval.id, confirmation: approval.confirmation, approved: true }); notice('Reddit подтвердил отправку.'); }
  finally { await refresh(); }
}));
refresh().catch(error => notice(error.message || 'Не удалось открыть приложение.', true));
