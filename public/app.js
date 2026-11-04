// =============================================================================
// Siesta To-Do Onboarding — the panel (plain browser JavaScript, no framework)
// -----------------------------------------------------------------------------
// The panel has three places, one at a time:
//   - Conversation: Siesta's general chat (welcome, list summary, "done" pings)
//   - To-Do List:   the whole list, full height. Drag to prioritise, edit, add.
//   - A task:       each task is its OWN chat session with Siesta. The top
//                   message is the task's brief (why it's that colour, what
//                   Siesta needs, buttons for the actions); below it, the
//                   adviser and Siesta talk about just that task.
//
// The UI is driven by ONE array, `tasks`, in priority order. Each task holds
// its own `messages`. Every change updates the data, then calls `refresh()`,
// which redraws from it.
// WHY this pattern? It's the core idea of React, without React: one source of
// truth and a "draw everything from state" function. Easy to follow and debug.
//
// A task's life:
//   sorting   -> sent to /api/triage, waiting for a colour
//   ready     -> green: Siesta can do it alone, waiting for "Start working"
//   needs_you -> yellow/red: waiting for the adviser (upload, answer, call…)
//   queued    -> in Siesta's background work queue (worked top to bottom)
//   working   -> /api/run in progress
//   done      -> Siesta has replied in the task's chat; follow-ups welcome
//   error     -> something failed; the adviser can retry
// =============================================================================

const tasks = [];
let nextId = 1;
let started = false; // has the adviser pressed "Start working"?
let busy = false; // is the background queue running a task? (one at a time)
let meanwhile = ''; // "what you can do meanwhile" tip from the last triage
let tab = 'conversation'; // 'conversation' or 'todo'
let openTaskId = null; // inside the To-Do tab: which task's chat is open
let dragId = null; // the card currently being dragged
let editingId = null; // the card whose text is being edited, if any

const DEMO_LIST = `Prep for the Hendersons' annual review on Thursday
What did we agree about Sarah Henderson's pension contributions last meeting?
Chase Aviva about the Henderson pension transfer
Move £5,000 into Tom Henderson's ISA
Set up my Outlook calendar so meetings record automatically
Call Sarah to confirm her new employer, then update her record`;

// Card wording for each kind while it waits for the adviser.
const WAITING_TEXT = {
  needs_upload: 'Needs client info',
  needs_answers: 'Needs your answers',
  walkthrough: 'You do this, I guide',
  handoff: 'Your step first',
  cannot: "Can't do: see alternative",
  upload: 'Start here',
};

// -----------------------------------------------------------------------------
// Tiny helpers (also used by upload.js)
// -----------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

// el('div', {class: 'x', onclick: fn}, child1, 'text', ...) builds DOM nodes.
// Text is always added as text nodes, never as HTML. WHY: everything shown
// comes from the model or the user, and this stops it injecting HTML/script.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue; // lets us write disabled: cond ? '' : null
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value; // only ever used with md(), which escapes first
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'value') node.value = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false || child === '') continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// A very small Markdown subset: "## heading", "- bullet", **bold**.
// Escapes HTML FIRST, so model output can't inject tags.
function md(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '';
  let inList = false;
  for (const raw of escaped.split('\n')) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    if (bullet && !inList) { html += '<ul>'; inList = true; }
    if (!bullet && inList) { html += '</ul>'; inList = false; }
    if (bullet) html += `<li>${bullet[1]}</li>`;
    else if (/^#{1,4}\s/.test(line)) html += `<h4>${line.replace(/^#+\s/, '')}</h4>`;
    else if (line.trim()) html += `<p>${line}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}

// POST JSON to our own server. The browser only ever talks to localhost; the
// server holds the OpenAI key.
async function api(path, body = {}) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const spinner = () => el('span', { class: 'spin' });
const confirmLine = (text) => el('div', { class: 'confirm' }, '✓ ', text);

// Add a message to the Conversation tab (the general chat). This log is only
// ever appended to, so plain DOM appends are enough here.
function say(...children) {
  const node = el('div', { class: 'msg siesta' }, ...children);
  const log = $('#log');
  log.append(node);
  // Scroll only the chat (scrollIntoView would also scroll the page around it).
  log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' });
  return node;
}

function youSay(text) {
  $('#log').append(el('div', { class: 'msg you' }, text));
}

// A row of buttons. Each handler receives the row, so it can replace the row
// with a confirmation once clicked (no double clicks, clear feedback).
function buttonRow(buttons) {
  const row = el('div', { class: 'actions' });
  for (const [label, handler, style = 'btn'] of buttons) {
    row.append(el('button', { class: style, onclick: () => handler(row) }, label));
  }
  return row;
}

// Add a message to ONE task's chat. Task chats are redrawn from data, so a
// message is stored as data ({ role, kind, ... }), not as DOM.
function post(task, message) {
  task.messages.push({ role: 'siesta', kind: 'text', ...message });
}

// -----------------------------------------------------------------------------
// 1. Navigation: tabs, the list, one task's chat
// -----------------------------------------------------------------------------
document.querySelectorAll('.tab[data-tab]').forEach((button) =>
  button.addEventListener('click', () => {
    // Clicking To-Do List while inside a task goes back to the whole list.
    if (button.dataset.tab === 'todo' && tab === 'todo') openTaskId = null;
    tab = button.dataset.tab;
    refresh();
  })
);

function openTask(id) {
  tab = 'todo';
  openTaskId = id;
  refresh();
}

function backToList() {
  openTaskId = null;
  refresh();
}

// Redraw everything that depends on state. `changed` (optional) says which
// task changed: the open chat is only redrawn if it's that task, so a task
// finishing in the background doesn't disturb what the adviser is typing.
function refresh(changed) {
  const inTask = tab === 'todo' && openTaskId;
  $('#view-conversation').hidden = tab !== 'conversation';
  $('#todo-list').hidden = tab !== 'todo' || !!openTaskId;
  $('#task-view').hidden = !inTask;
  document.querySelectorAll('.tab[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));

  // The badge counts tasks waiting for the adviser.
  const waiting = tasks.filter((t) => t.status === 'needs_you').length;
  $('#todo-badge').hidden = !waiting;
  $('#todo-badge').textContent = waiting;

  renderComposer();
  renderBanner();
  renderBoard();
  if (inTask && (!changed || changed.id === openTaskId)) renderTaskView();
}

// One composer, three jobs: add tasks (Conversation), talk about one task
// (task view), or nothing (the list has its own "+ Add task").
function renderComposer() {
  const task = tab === 'todo' && tasks.find((t) => t.id === openTaskId);
  $('#composer').hidden = tab === 'todo' && !task;
  $('#demo').hidden = !!task;
  $('#input').disabled = task ? task.status === 'working' || task.status === 'sorting' : false;
  $('#input').placeholder = !task ? 'Paste or type tasks to add to your list, one per line…'
    : task.status === 'needs_you' && task.triage?.kind === 'handoff' ? 'Tell Siesta what you found out…'
    : task.status === 'needs_you' && task.triage?.kind === 'needs_answers' ? 'Answer here, or use the boxes above…'
    : task.id === 'upload' ? 'Ask Siesta about adding client information…'
    : 'Ask Siesta about this task, or ask for changes…';
}

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#input').value.trim();
  if (!text) return;
  $('#input').value = '';
  const task = tab === 'todo' && tasks.find((t) => t.id === openTaskId);
  if (task) sendTaskMessage(task, text);
  else addTasksFromText(text);
});

// Enter adds a new line (lists need line breaks); Ctrl/Cmd+Enter sends.
$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#composer').requestSubmit();
});

$('#demo').addEventListener('click', () => {
  $('#input').value = DEMO_LIST;
  $('#input').focus();
});

// -----------------------------------------------------------------------------
// 2. First login: the welcome pop-up
// -----------------------------------------------------------------------------
// Every page load is treated as a first login: the server session is wiped and
// the pop-up appears. WHY a pop-up rather than a tour? The quickest route to
// value is the adviser's own work, so the very first thing we ask for is it.
api('/api/reset');
refresh();

$('#welcome-demo').addEventListener('click', () => ($('#welcome-input').value = DEMO_LIST));

$('#welcome-start').addEventListener('click', () => {
  const text = $('#welcome-input').value.trim();
  if (!text) return $('#welcome-input').focus();
  $('#welcome').hidden = true;
  greet();
  addTasksFromText(text);
});

// Skip: the adviser just wants to look around. Siesta stays available.
$('#welcome-skip').addEventListener('click', () => {
  $('#welcome').hidden = true;
  greet();
  say(el('p', {}, "No problem, have a look around. Whenever you're ready, paste your to-do list below and I'll start on it."));
});

function greet() {
  say(
    el('p', {}, 'Hi Matthew, welcome to Afternoon 👋'),
    el('p', {}, "Let's get some of your real work done. I'll show you what I can take off your plate, what I need from you first, and what only you can do (with how Afternoon helps anyway).")
  );
}

// -----------------------------------------------------------------------------
// 3. Turning pasted text into tasks, and sorting them
// -----------------------------------------------------------------------------
// Split pasted text into one task per line. Word is the awkward case: a
// pasted Word list can bring Windows line endings, non-breaking spaces,
// tabs, and bullet characters ("•", "o", "§", or Symbol-font characters
// like U+F0B7), plus numbering such as "1." or "a)". We strip all of these.
// Short heading lines ending in ":" (e.g. "To do today:") are dropped too.
const BULLET = /^\s*(?:[-–—*•◦▪▫●○■□➢➤►✓✔§·]|o(?=\s)|\(?\d{1,2}[.)]|\(?[a-z][.)](?=\s))\s*/;

function parseTaskLines(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .split('\n')
    .map((line) => line.replace(BULLET, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line && !(line.endsWith(':') && line.length < 40));
}

const newTask = (text) => ({ id: `t${nextId++}`, text, status: 'sorting', messages: [] });

async function addTasksFromText(text) {
  youSay(text);
  const lines = parseTaskLines(text);
  if (!lines.length) return;
  const added = lines.map(newTask);
  tasks.push(...added);
  // Go straight to the list: the adviser sees their own tasks appear and
  // get sorted, which is the "aha" moment.
  tab = 'todo';
  openTaskId = null;
  refresh();

  const ok = await sortTasks(added);
  if (ok) summariseTriage(added);
}

// Send tasks to /api/triage and apply the result. Used for a new list, an
// edited card, an added card, and re-sorting after an upload.
async function sortTasks(list) {
  list.forEach((t) => (t.status = 'sorting'));
  refresh();
  try {
    const result = await api('/api/triage', { tasks: list.map(({ id, text }) => ({ id, text })) });
    for (const t of result.tasks) {
      const task = tasks.find((x) => x.id === t.id);
      if (!task) continue;
      task.triage = t;
      // Green tasks wait for "Start" (or join the queue straight away if work
      // has already started). Yellow and red wait for the adviser.
      task.status = t.colour === 'green' ? (started ? 'queued' : 'ready') : 'needs_you';
    }
    meanwhile = result.meanwhile;
    ensureUploadCard(); // from upload.js
    refresh();
    if (started) processQueue();
    return true;
  } catch (err) {
    list.forEach((t) => { t.status = 'error'; t.error = err.message; });
    say(el('p', { class: 'error' }, `Sorry, I couldn't sort that: ${err.message}`));
    refresh();
    return false;
  }
}

// A record of the sort in the Conversation tab, with a way back to the list.
function summariseTriage(added) {
  const count = (colour) => added.filter((t) => t.triage?.colour === colour).length;
  say(
    el('p', {}, `I've sorted your ${added.length} tasks: 🟢 ${count('green')} I can do on my own, 🟡 ${count('yellow')} need a bit of you, 🔴 ${count('red')} I can't do (I'll suggest what I can instead).`),
    el('p', {}, 'Each task has its own chat with me in the To-Do List, with my questions and the actions needed right there.'),
    buttonRow([['Open my To-Do List', () => { tab = 'todo'; openTaskId = null; refresh(); }]])
  );
}

// The summary at the top of the To-Do List: counts, and the next best step.
function renderBanner() {
  const real = tasks.filter((t) => t.id !== 'upload');
  if (!real.length) {
    $('#banner').replaceChildren(el('p', { class: 'empty' }, 'No tasks yet. Paste your to-do list in the Conversation tab, or use "+ Add task" below.'));
    return;
  }
  const count = (colour) => real.filter((t) => t.triage?.colour === colour).length;
  const sorting = real.some((t) => t.status === 'sorting');
  const ready = real.filter((t) => t.status === 'ready').length;
  const upload = tasks.find((t) => t.id === 'upload' && t.status === 'needs_you');
  $('#banner').replaceChildren(el('div', { class: 'banner' },
    sorting
      ? el('p', {}, spinner(), ' Sorting into what I can do, what needs you, and what I can\'t…')
      : el('p', {}, `🟢 ${count('green')} Siesta can do · 🟡 ${count('yellow')} need you · 🔴 ${count('red')} can't`),
    upload && el('p', {}, 'Start with the first card: your client information unlocks most of the others.'),
    !sorting && el('p', { class: 'small' }, 'Drag to set priority, ✎ to fix anything I misread. Open a card to see what I need and chat about it.'),
    started && meanwhile && el('p', {}, 'Meanwhile: ', meanwhile),
    !started && ready > 0 && el('div', { class: 'actions' }, el('button', { class: 'btn', onclick: startWork }, `Start working (${ready})`))
  ));
}

function startWork() {
  started = true;
  tasks.filter((t) => t.status === 'ready').forEach((t) => (t.status = 'queued'));
  const first = tasks.find((t) => t.status === 'queued');
  if (first) say(el('p', {}, 'Starting with ', el('strong', {}, first.text), ". I'll let you know here as each one is done."));
  refresh();
  processQueue();
}

// Called by upload.js once an upload is finalised: sort every open task again
// against the newly filled record, and report in the upload task's chat.
// Red cards are re-checked too: new information can change what's possible.
async function resortAfterUpload(uploadTask) {
  const open = tasks.filter((t) => t.id !== 'upload' && ['needs_you', 'ready', 'error'].includes(t.status));
  if (!open.length) return;
  const before = new Map(open.map((t) => [t.id, t.triage?.colour]));
  post(uploadTask, { kind: 'typing', text: 'Checking your list again now the information is in Afternoon…' });
  refresh(uploadTask);
  const ok = await sortTasks(open);
  uploadTask.messages = uploadTask.messages.filter((m) => m.kind !== 'typing');
  if (!ok) return refresh(uploadTask);
  const turned = open.filter((t) => t.triage.colour === 'green' && before.get(t.id) !== 'green');
  post(uploadTask, {
    text: turned.length
      ? `🟢 ${turned.length} task${turned.length > 1 ? 's' : ''} turned green:\n${turned.map((t) => `- ${t.text}`).join('\n')}\n\n${started ? "They're in my queue now." : 'Press **Start working** at the top of your To-Do List and I\'ll get on with them.'}`
      : "Nothing new turned green yet. Open a yellow card to see what's still missing.",
  });
  refresh(uploadTask);
}

// -----------------------------------------------------------------------------
// 4. Doing a task: the background queue, and each task's own chat
// -----------------------------------------------------------------------------
// The queue works through green tasks one at a time, top of the list first.
// WHY re-check the order each time? If the adviser drags a card while Siesta
// is busy, the next task picked is whatever is highest on the list THEN.
async function processQueue() {
  if (busy) return;
  const task = tasks.find((t) => t.status === 'queued');
  if (!task) return announceIfAllDone();
  busy = true;
  await runTask(task, {});
  busy = false;
  processQueue();
}

let announcedAllDone = false;
function announceIfAllDone() {
  if (!started || announcedAllDone || tasks.some((t) => t.status === 'working' || t.status === 'queued')) return;
  announcedAllDone = true;
  const waiting = tasks.filter((t) => t.status === 'needs_you');
  say(
    el('p', {}, "That's everything I can do on my own for now. Please review the drafts before anything goes out."),
    waiting.length > 0 && el('p', {}, `Still waiting for you: ${waiting.map((t) => `"${t.text}"`).join(', ')}.`)
  );
}

// The conversation so far on one task, sent with each turn so Siesta can
// handle follow-ups ("make it shorter", "add Tom's ISA too").
function historyFor(task) {
  return task.messages
    .filter((m) => m.role === 'you' || m.kind === 'result')
    .slice(-8)
    .map((m) => m.role === 'you'
      ? { role: 'adviser', text: m.text }
      : { role: 'siesta', text: [m.result.headline, m.result.body, m.result.email && `EMAIL DRAFT:\n${m.result.email.body}`].filter(Boolean).join('\n') });
}

// The adviser typed in a task's chat. What it MEANS depends on where the task
// is: for a handoff it's the outcome of their step, for questions it's the
// answer, otherwise it's a follow-up or a request for changes.
function sendTaskMessage(task, text) {
  const history = historyFor(task);
  task.messages.push({ role: 'you', text });
  const waitingOn = task.status === 'needs_you' ? task.triage?.kind : null;
  const inputs =
    waitingOn === 'handoff' ? { handoffNote: text }
    : waitingOn === 'needs_answers' ? { answers: [{ q: task.triage.questions.join(' / '), a: text }] }
    : { message: text };
  runTask(task, { ...inputs, history });
}

// A button in the task brief was pressed. Show it in the chat as the
// adviser's message, so the session reads like a conversation.
function act(task, label, inputs) {
  const history = historyFor(task);
  task.messages.push({ role: 'you', text: label });
  runTask(task, { ...inputs, history });
}

// One turn of a task's chat: call /api/run and post the reply.
async function runTask(task, inputs) {
  const hadResult = !!task.result;
  task.status = 'working';
  refresh(task);
  try {
    const r = await api('/api/run', { task: { text: task.text, triage: task.triage }, ...inputs });
    task.result = r;
    task.status = 'done';
    task.messages.push({ role: 'siesta', kind: 'result', result: r });
    // Memory and skill suggestions appear in the chat they came from.
    if (r.memory_suggestion) post(task, { kind: 'memory', text: r.memory_suggestion });
    if (r.skill_suggestion && !task.messages.some((m) => m.kind === 'skill')) post(task, { kind: 'skill', skill: r.skill_suggestion });
    // If the adviser isn't looking at this task, ping them in Conversation.
    if (openTaskId !== task.id || tab !== 'todo') {
      say(el('p', {}, '✓ Done: ', el('strong', {}, task.text)), el('p', {}, r.headline), buttonRow([['Open', () => openTask(task.id), 'btn light']]));
    }
  } catch (err) {
    task.status = hadResult ? 'done' : 'error';
    task.error = err.message;
    post(task, { kind: 'error', text: `I hit a problem: ${err.message}` });
  }
  refresh(task);
}

// -----------------------------------------------------------------------------
// 5. The list: draggable, editable cards
// -----------------------------------------------------------------------------
function renderBoard() {
  $('#cards').replaceChildren(...tasks.map((task, i) => renderCard(task, i)));
}

function renderCard(task, index) {
  const t = task.triage;
  const status = {
    sorting: [spinner(), ' Sorting…'],
    ready: ['Siesta will do this'],
    needs_you: [WAITING_TEXT[t?.kind] || 'Needs you'],
    queued: ['Queued'],
    working: [spinner(), ' Working…'],
    done: [task.id === 'upload' ? `✓ ${uploadSummary()}` : '✓ Done: review'],
    error: ['⚠ Error: open to retry'],
  }[task.status];

  // While editing, the text becomes an input. Enter saves, Esc cancels.
  const text = editingId === task.id
    ? el('input', { class: 'card-edit', type: 'text', value: task.text, onclick: (e) => e.stopPropagation(), onkeydown: (e) => {
        if (e.key === 'Enter') saveEdit(task, e.target.value);
        if (e.key === 'Escape') { editingId = null; renderBoard(); }
      } })
    : el('div', { class: 'card-text' }, task.text);

  // Edit/delete are available unless Siesta is mid-way through the task.
  // The upload card is Siesta's own, so it can't be edited or deleted.
  const tools = task.id !== 'upload' && !['working', 'sorting'].includes(task.status) &&
    el('span', { class: 'card-tools' },
      el('button', { title: 'Edit task', onclick: (e) => { e.stopPropagation(); editingId = task.id; renderBoard(); $('.card-edit').focus(); } }, '✎'),
      el('button', { title: 'Delete task', onclick: (e) => { e.stopPropagation(); deleteTask(task); } }, '×')
    );

  const card = el('li', { class: `card ${t?.colour || ''} ${task.id === 'upload' ? 'upload' : ''}`, draggable: editingId ? 'false' : 'true', onclick: () => t && openTask(task.id) },
    el('div', { class: 'handle', title: 'Drag to reorder' }, el('b', {}, index + 1), '⋮⋮'),
    el('div', {},
      el('div', { class: 'card-top' }, text, tools),
      el('div', { class: 'card-meta' },
        el('span', {}, ...status),
        t && el('span', { class: `chip ${t.colour}` }, t.short_label)
      )
    )
  );

  // Native HTML5 drag and drop: no library needed. We work out whether the
  // pointer is in the top or bottom half of a card to decide where to drop.
  card.addEventListener('dragstart', (e) => {
    dragId = task.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id); // Firefox needs data set to allow dragging
  });
  card.addEventListener('dragend', () => { dragId = null; renderBoard(); });
  card.addEventListener('dragover', (e) => {
    e.preventDefault(); // allow dropping here
    const box = card.getBoundingClientRect();
    const after = e.clientY > box.top + box.height / 2;
    card.classList.toggle('drop-before', !after);
    card.classList.toggle('drop-after', after);
  });
  card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    moveTask(dragId, task.id, card.classList.contains('drop-after'));
    renderBoard();
  });
  return card;
}

// Reorder the array. The array order IS the priority, so the queue will pick
// up the new order automatically.
function moveTask(fromId, toId, after) {
  if (!fromId || fromId === toId) return;
  const [moved] = tasks.splice(tasks.findIndex((t) => t.id === fromId), 1);
  const target = tasks.findIndex((t) => t.id === toId);
  tasks.splice(target + (after ? 1 : 0), 0, moved);
}

// Editing a task's wording changes what it means, so its old chat, result and
// colour are thrown away and that one task is sorted again.
function saveEdit(task, value) {
  editingId = null;
  const text = value.trim();
  if (!text || text === task.text) return renderBoard();
  Object.assign(task, { text, result: null, messages: [] });
  sortTasks([task]);
}

function deleteTask(task) {
  tasks.splice(tasks.indexOf(task), 1);
  if (openTaskId === task.id) openTaskId = null;
  refresh();
}

// "+ Add task" for anything missed when pasting.
$('#add-task').addEventListener('click', () => {
  const input = el('input', { class: 'card-edit', type: 'text', placeholder: 'Type a task and press Enter' });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') input.remove();
    if (e.key !== 'Enter' || !input.value.trim()) return;
    const task = newTask(input.value.trim());
    tasks.push(task);
    input.remove();
    sortTasks([task]);
  });
  $('#cards').append(el('li', { class: 'card new' }, input));
  input.focus();
});

// -----------------------------------------------------------------------------
// 6. One task's chat: the brief at the top, then the conversation
// -----------------------------------------------------------------------------
function renderTaskView() {
  const task = tasks.find((t) => t.id === openTaskId);
  if (!task) return backToList();
  const t = task.triage;
  const log = $('#task-log');

  // Keep the adviser's scroll position unless something new arrived.
  const switched = log.dataset.task !== task.id;
  const count = String(task.messages.length) + task.status;
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;

  $('#task-head').replaceChildren(
    el('button', { class: 'back', onclick: backToList }, '← All tasks'),
    el('div', {}, t && el('span', { class: `chip ${t.colour}` }, t.short_label)),
    el('h2', {}, task.text)
  );
  log.replaceChildren(...[
    t ? renderBrief(task) : el('div', { class: 'msg siesta' }, spinner(), ' Sorting…'),
    ...task.messages.map((m) => renderMessage(task, m)),
    task.status === 'working' && el('div', { class: 'msg siesta typing' }, spinner(), ' Working on it…'),
  ].filter(Boolean)); // replaceChildren would print a stray "false" otherwise

  if (switched || nearBottom || log.dataset.count !== count) log.scrollTop = switched && !task.messages.length ? 0 : log.scrollHeight;
  log.dataset.task = task.id;
  log.dataset.count = count;
}

// The first message in every task chat: why it's that colour, how Afternoon
// helps anyway, and exactly what's needed to move it forward.
function renderBrief(task) {
  const t = task.triage;
  return el('div', { class: 'msg siesta' },
    el('div', { class: 'sheet' },
      el('p', {}, t.reason),
      el('div', { class: 'helps' }, el('div', { class: 'label' }, 'How Afternoon helps anyway'), t.afternoon_helps),
      el('div', { class: 'section' }, task.id === 'upload' ? renderUploadGuide() : renderNeeds(task))
    )
  );
}

// What's needed, by kind. Once the task has moved on, this shrinks to a note:
// the conversation below has taken over.
function renderNeeds(task) {
  const t = task.triage;
  if (task.status === 'sorting') return el('div', { class: 'status-line' }, spinner(), 'Sorting…');
  if (task.status === 'queued') return el('div', { class: 'status-line' }, "Queued: I'll get to this in priority order.");
  if (task.status === 'working' || task.status === 'done') return el('div', {}, el('div', { class: 'label' }, 'My part'), el('p', {}, t.siesta_part || 'See below.'));
  if (task.status === 'error') return el('div', {}, el('p', { class: 'error' }, task.error), el('button', { class: 'btn', onclick: () => (task.triage ? act(task, 'Try again', task.inputs || {}) : sortTasks([task])) }, 'Try again'));
  if (task.status === 'ready') {
    return el('div', {},
      el('div', { class: 'label' }, "What I'll do"), el('p', {}, t.siesta_part),
      el('div', { class: 'actions' }, el('button', { class: 'btn', onclick: () => act(task, 'Do this now', {}) }, 'Do this now')),
      el('p', { class: 'small' }, 'Or press "Start working" on the list and I\'ll work through every green task, top first.')
    );
  }

  // --- Yellow and red: what Siesta needs from the adviser ---
  if (t.kind === 'needs_upload') {
    // A first-time adviser's record is empty. Point them at the upload task.
    return el('div', {},
      el('div', { class: 'label' }, 'What I need first'),
      el('p', {}, t.needs_upload),
      el('p', { class: 'small' }, "It isn't in Afternoon yet, and I won't guess."),
      el('div', { class: 'label' }, 'Then I will'), el('p', {}, t.siesta_part),
      el('button', { class: 'btn', onclick: () => openTask('upload') }, 'Show me how to upload it')
    );
  }
  if (t.kind === 'needs_answers') {
    // Questions were generated during sorting (all in one go), but are only
    // asked now, when the adviser opens this task. Answers can also be typed
    // in the chat. Values are kept on the task so a redraw doesn't lose them.
    task.answers ??= t.questions.map(() => '');
    return el('div', {},
      el('div', { class: 'label' }, 'To move this forward I need to know'),
      t.questions.map((q, i) => el('div', { class: 'q' }, el('label', {}, q),
        el('input', { type: 'text', value: task.answers[i], oninput: (e) => (task.answers[i] = e.target.value) }))),
      el('button', { class: 'btn', onclick: () => act(task, 'Here are my answers.', { answers: t.questions.map((q, i) => ({ q, a: task.answers[i] || '(no answer)' })) }) }, 'Send answers')
    );
  }
  if (t.kind === 'handoff') {
    // Handoff: the adviser does the human step, tells Siesta the outcome in
    // the chat, and Siesta picks it up from there.
    return el('div', {},
      el('div', { class: 'label' }, 'Your part'), el('p', {}, t.your_part),
      el('div', { class: 'label' }, 'Then I will'), el('p', {}, t.siesta_part),
      el('p', { class: 'next' }, "When you've done your part, tell me what you found out below.")
    );
  }
  if (t.kind === 'walkthrough') {
    return el('div', {},
      el('div', { class: 'label' }, 'Your part'), el('p', {}, t.your_part),
      el('div', { class: 'label' }, 'How I can help'), el('p', {}, t.siesta_part),
      el('button', { class: 'btn', onclick: () => act(task, 'Walk me through it.', {}) }, 'Walk me through it')
    );
  }
  // cannot (red)
  return el('div', {},
    el('div', { class: 'label' }, 'What I can do instead'), el('p', {}, t.alternative),
    t.your_part && [el('div', { class: 'label' }, 'Your part'), el('p', {}, t.your_part)],
    el('button', { class: 'btn', onclick: () => act(task, 'Do that instead.', { doAlternative: true }) }, 'Do this instead')
  );
}

// Draw one stored chat message.
function renderMessage(task, m) {
  if (m.role === 'you') return el('div', { class: 'msg you' }, m.text);
  if (m.kind === 'result') return el('div', { class: 'msg siesta' }, el('div', { class: 'sheet' }, renderResult(task, m.result)));
  if (m.kind === 'memory') return renderMemory(task, m);
  if (m.kind === 'skill') return renderSkill(task, m);
  if (m.kind === 'note') return el('div', { class: 'msg' }, confirmLine(m.text));
  if (m.kind === 'error') return el('div', { class: 'msg siesta' }, el('p', { class: 'error' }, m.text));
  if (m.kind === 'typing') return el('div', { class: 'msg siesta typing' }, spinner(), ' ', m.text);
  return el('div', { class: 'msg siesta', html: md(m.text) });
}

// Offer to save useful things to company memory or turn repeat work into a
// skill. Nothing is saved unless the adviser clicks (guardrail from the doc).
// The choice is stored on the message, so it survives redraws.
function renderMemory(task, m) {
  return el('div', { class: 'msg siesta' },
    el('p', {}, '💡 Worth remembering for next time?'),
    el('blockquote', {}, m.text),
    m.choice ? confirmLine(m.choice) : el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: async () => { await api('/api/memory', { type: 'memory', text: m.text }); m.choice = "Saved to company memory. I'll use it from now on."; refresh(task); } }, 'Save to company memory'),
      el('button', { class: 'btn ghost', onclick: () => { m.choice = 'Not saved.'; refresh(task); } }, 'No thanks')
    )
  );
}

function renderSkill(task, m) {
  return el('div', { class: 'msg siesta' },
    el('p', {}, '🔁 This looks like repeat work. Turn it into a skill the whole firm can run by name?'),
    el('blockquote', {}, el('strong', {}, m.skill.name), ': ', m.skill.description),
    m.choice ? confirmLine(m.choice) : el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: async () => { await api('/api/memory', { type: 'skill', skill: m.skill }); m.choice = `Skill "${m.skill.name}" created.`; refresh(task); } }, 'Create skill'),
      el('button', { class: 'btn ghost', onclick: () => { m.choice = 'Skipped.'; refresh(task); } }, 'Not now')
    )
  );
}

// Show whatever a run produced. Each block only appears if it has content.
function renderResult(task, r) {
  return el('div', {},
    el('h3', {}, r.headline),
    el('div', { html: md(r.body) }),
    r.steps.length > 0 && el('ol', { class: 'steps' }, r.steps.map((s) => el('li', {}, el('label', {}, el('input', { type: 'checkbox' }), ' ', el('span', { html: md(s).replace(/<\/?p>/g, '') }))))),
    r.email && renderEmail(r.email),
    r.proposals.length > 0 && renderProposals(task, r.proposals),
    r.next_step && el('p', { class: 'next' }, '→ ', r.next_step),
    r.sources.length > 0 && el('details', { class: 'sources' },
      el('summary', {}, `Sources (${r.sources.length})`),
      r.sources.map((s) => el('blockquote', {}, `"${s.quote}"`, el('cite', {}, s.file)))
    )
  );
}

// An email DRAFT. Editable (edits are kept on the email object so a redraw
// doesn't lose them), then copied or opened in the adviser's own mail app.
// Siesta never sends: the adviser presses send (per the capabilities doc).
function renderEmail(email) {
  const field = (key, tag = 'input') => el(tag, { type: tag === 'input' ? 'text' : null, value: email[key], oninput: (e) => (email[key] = e.target.value) });
  const mailto = () => `mailto:${encodeURIComponent(email.to)}?cc=${encodeURIComponent(email.cc)}&subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  return el('div', { class: 'email' },
    el('div', { class: 'label' }, 'Draft email: you send it'),
    el('div', { class: 'row' }, 'To', field('to')),
    el('div', { class: 'row' }, 'Cc', field('cc')),
    el('div', { class: 'row' }, 'Subject', field('subject')),
    field('body', 'textarea'),
    buttonRow([
      ['Open in my mail app', () => (window.location.href = mailto())],
      ['Copy', async (row) => { await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`); row.append(confirmLine('Copied')); }, 'btn ghost'],
    ])
  );
}

// Proposed record changes. Nothing changes until the adviser approves each one.
function renderProposals(task, proposals) {
  return el('div', { class: 'section' },
    el('div', { class: 'label' }, 'Proposed record updates: approve to apply'),
    proposals.map((p) =>
      el('div', { class: 'proposal' },
        el('strong', {}, `${p.member}: ${p.field}`),
        el('div', { class: 'old' }, p.current_value || '(empty)'),
        el('div', { class: 'new' }, p.proposed_value),
        el('small', {}, 'Source: ', p.source),
        renderDecision(task, p)
      )
    )
  );
}

function renderDecision(task, p) {
  if (p.decision === 'approved') return el('div', { class: 'actions' }, el('span', { class: 'chip green' }, '✓ Approved'));
  if (p.decision === 'rejected') return el('div', { class: 'actions' }, el('span', { class: 'chip' }, 'Rejected'));
  return el('div', { class: 'actions' },
    el('button', { class: 'btn', onclick: async () => {
      await api('/api/approve', { proposal: p });
      p.decision = 'approved';
      task.messages.push({ role: 'siesta', kind: 'note', text: `Approved: ${p.member}, ${p.field} is now "${p.proposed_value}".` });
      refresh(task);
    } }, 'Approve'),
    el('button', { class: 'btn ghost', onclick: () => { p.decision = 'rejected'; refresh(task); } }, 'Reject')
  );
}
