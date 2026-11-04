// =============================================================================
// Siesta To-Do Onboarding — the panel (plain browser JavaScript, no framework)
// -----------------------------------------------------------------------------
// The whole UI is driven by ONE array, `tasks`, in priority order. Every user
// action changes that array (or a task in it), then calls `refresh()`, which
// redraws the board and any open task detail.
// WHY this pattern? It's the core idea of React, without React: one source of
// truth and a "draw everything from state" function. Easy to follow and debug.
//
// A task's life:
//   sorting   -> sent to /api/triage, waiting for a colour
//   ready     -> green: Siesta can do it alone, waiting for "Start"
//   needs_you -> yellow/red: waiting for the adviser to click the card
//   queued    -> in Siesta's work queue (worked top to bottom)
//   working   -> /api/run in progress
//   done      -> result ready to review (drafts, proposals, answers)
//   error     -> something failed; the adviser can retry
// =============================================================================

const tasks = [];
let nextId = 1;
let started = false; // has the adviser pressed "Start working"?
let busy = false; // is Siesta currently running a task? (one at a time)
let meanwhile = ''; // "what you can do meanwhile" tip from the last triage
let openTaskId = null; // which task's detail view is showing, if any
let dragId = null; // the card currently being dragged

const DEMO_LIST = `Prep for the Hendersons' annual review on Thursday
What did we agree about Sarah Henderson's pension contributions last meeting?
Chase Aviva about the Henderson pension transfer
Move £5,000 into Tom Henderson's ISA
Set up my Outlook calendar so meetings record automatically
Call Sarah to confirm her new employer, then update her record`;

// Card wording for each kind while it waits for the adviser.
const WAITING_TEXT = {
  needs_answers: 'Needs your answers',
  walkthrough: 'You do this, I guide',
  handoff: 'Your step first',
  cannot: "Can't do: see alternative",
};

// -----------------------------------------------------------------------------
// Tiny helpers
// -----------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);

// el('div', {class: 'x', onclick: fn}, child1, 'text', ...) builds DOM nodes.
// Text is always added as text nodes, never as HTML. WHY: everything shown
// comes from the model or the user, and this stops it injecting HTML/script.
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value; // only ever used with md(), which escapes first
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
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
async function api(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const spinner = () => el('span', { class: 'spin' });

// Add a message to the conversation. Returns the node so it can be updated.
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

const confirmLine = (text) => el('div', { class: 'confirm' }, '✓ ', text);

// -----------------------------------------------------------------------------
// 1. Pasting the to-do list
// -----------------------------------------------------------------------------
$('#demo').addEventListener('click', () => {
  $('#input').value = DEMO_LIST;
  $('#input').focus();
});

// Enter adds a new line (lists need line breaks); Ctrl/Cmd+Enter sends.
$('#input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#composer').requestSubmit();
});

$('#composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#input').value.trim();
  if (!text) return;
  $('#input').value = '';
  youSay(text);

  // Each line becomes one task. Strip bullets and numbers, because people
  // paste from Notes, Outlook or Word, where lists usually start with "-", "•" or "1.".
  const lines = text.split('\n').map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const newTasks = lines.map((line) => ({ id: `t${nextId++}`, text: line, status: 'sorting' }));
  tasks.push(...newTasks);
  $('#board').hidden = false;
  refresh();

  const thinking = say(spinner(), ` Sorting ${newTasks.length} task${newTasks.length > 1 ? 's' : ''} into what I can do, what needs you, and what I can't…`);
  try {
    const result = await api('/api/triage', { tasks: newTasks.map(({ id, text }) => ({ id, text })) });
    for (const t of result.tasks) {
      const task = tasks.find((x) => x.id === t.id);
      if (!task) continue;
      task.triage = t;
      // Green tasks wait for "Start" (or join the queue straight away if work
      // has already started). Yellow and red wait for the adviser to click them.
      task.status = t.colour === 'green' ? (started ? 'queued' : 'ready') : 'needs_you';
    }
    meanwhile = result.meanwhile;
    thinking.remove();
    summariseTriage(newTasks);
    refresh();
    if (started) processQueue();
  } catch (err) {
    thinking.remove();
    newTasks.forEach((t) => (t.status = 'error'));
    say(el('p', { class: 'error' }, `Sorry, I couldn't sort that list: ${err.message}`));
    refresh();
  }
});

// After sorting: a short summary, how to use the board, and a Start button.
function summariseTriage(newTasks) {
  const count = (colour) => newTasks.filter((t) => t.triage?.colour === colour).length;
  say(
    el('p', {}, `I've sorted your ${newTasks.length} tasks:`),
    el('ul', {},
      el('li', {}, `🟢 ${count('green')} I can do on my own`),
      el('li', {}, `🟡 ${count('yellow')} need a bit of you`),
      el('li', {}, `🔴 ${count('red')} I can't do, but I'll show you what I can do instead`)
    ),
    el('p', {}, 'Drag the cards to set priority: I work through them from the top. Click any yellow or red card to see what I need from you.'),
    !started && buttonRow([['Start working', (row) => { row.remove(); startWork(); }]])
  );
}

function startWork() {
  started = true;
  tasks.filter((t) => t.status === 'ready').forEach((t) => (t.status = 'queued'));
  const first = tasks.find((t) => t.status === 'queued');
  say(
    first ? el('p', {}, 'Starting with ', el('strong', {}, first.text), '.') : el('p', {}, "There's nothing I can start on my own yet."),
    meanwhile && el('p', {}, 'Meanwhile: ', meanwhile)
  );
  refresh();
  processQueue();
}

// -----------------------------------------------------------------------------
// 2. The work queue: Siesta does one task at a time, top of the board first
// -----------------------------------------------------------------------------
// WHY re-check the order each time? If the adviser drags a card while Siesta
// is busy, the next task picked is whatever is highest on the board THEN.
let announcedAllDone = false;

async function processQueue() {
  if (busy) return;
  const task = tasks.find((t) => t.status === 'queued');
  if (!task) return announceIfAllDone();

  busy = true;
  announcedAllDone = false;
  task.status = 'working';
  refresh();
  try {
    task.result = await api('/api/run', { task: { text: task.text, triage: task.triage }, ...task.inputs });
    task.status = 'done';
    say(
      el('p', {}, '✓ Done: ', el('strong', {}, task.text)),
      el('p', {}, task.result.headline),
      buttonRow([['Review', () => openDetail(task.id), 'btn light']])
    );
    suggestMemoryAndSkill(task);
  } catch (err) {
    task.status = 'error';
    task.error = err.message;
    say(el('p', { class: 'error' }, `I hit a problem with "${task.text}": ${err.message}`));
  } finally {
    busy = false;
    refresh();
    processQueue(); // move on to the next queued task
  }
}

// When the queue empties, point the adviser at what's still waiting for them.
function announceIfAllDone() {
  if (!started || announcedAllDone || tasks.some((t) => t.status === 'working')) return;
  announcedAllDone = true;
  const waiting = tasks.filter((t) => t.status === 'needs_you');
  say(
    el('p', {}, 'That\'s everything I can do on my own for now. Please review the drafts before anything goes out.'),
    waiting.length > 0 && el('p', {}, `Still waiting for you: ${waiting.map((t) => `"${t.text}"`).join(', ')}.`)
  );
}

// Offer to save useful things to company memory or turn repeat work into a
// skill. Nothing is saved unless the adviser clicks (guardrail from the doc).
function suggestMemoryAndSkill(task) {
  const { memory_suggestion: memory, skill_suggestion: skill } = task.result;
  if (memory) {
    say(
      el('p', {}, '💡 Worth remembering for next time?'),
      el('blockquote', {}, memory),
      buttonRow([
        ['Save to company memory', async (row) => {
          await api('/api/memory', { type: 'memory', text: memory });
          row.replaceWith(confirmLine("Saved to company memory. I'll use it from now on."));
        }],
        ['No thanks', (row) => row.replaceWith(confirmLine('Not saved.')), 'btn ghost'],
      ])
    );
  }
  if (skill) {
    say(
      el('p', {}, '🔁 This looks like repeat work. Turn it into a skill the whole firm can run by name?'),
      el('blockquote', {}, el('strong', {}, skill.name), ': ', skill.description),
      buttonRow([
        ['Create skill', async (row) => {
          await api('/api/memory', { type: 'skill', skill });
          row.replaceWith(confirmLine(`Skill "${skill.name}" created.`));
        }],
        ['Not now', (row) => row.replaceWith(confirmLine('Skipped.')), 'btn ghost'],
      ])
    );
  }
}

// Put a task in the queue with whatever the adviser supplied, then go back to
// the chat so they can see it being worked on.
function queueTask(task, inputs = {}) {
  task.inputs = inputs;
  task.status = 'queued';
  say(el('p', {}, 'Thanks, I\'ve added ', el('strong', {}, task.text), ' to my queue.'));
  closeDetail();
  processQueue();
}

// -----------------------------------------------------------------------------
// 3. The board: draggable cards
// -----------------------------------------------------------------------------
function refresh() {
  renderBoard();
  if (openTaskId) renderDetail();
}

function renderBoard() {
  const list = $('#cards');
  list.replaceChildren(...tasks.map((task, i) => renderCard(task, i)));
}

function renderCard(task, index) {
  const t = task.triage;
  const status = {
    sorting: [spinner(), ' Sorting…'],
    ready: ['Siesta will do this'],
    needs_you: [WAITING_TEXT[t?.kind] || 'Needs you'],
    queued: ['Queued'],
    working: [spinner(), ' Working…'],
    done: ['✓ Done: review'],
    error: ['⚠ Error: click to retry'],
  }[task.status];

  const card = el('li', { class: `card ${t?.colour || ''}`, draggable: 'true', onclick: () => t && openDetail(task.id) },
    el('div', { class: 'handle', title: 'Drag to reorder' }, el('b', {}, index + 1), '⋮⋮'),
    el('div', {},
      el('div', { class: 'card-text' }, task.text),
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

// -----------------------------------------------------------------------------
// 4. Task detail: what Siesta needs, and what it produced
// -----------------------------------------------------------------------------
function openDetail(id) {
  openTaskId = id;
  $('#detail').hidden = false;
  renderDetail();
  $('#detail').scrollTop = 0;
}

function closeDetail() {
  openTaskId = null;
  $('#detail').hidden = true;
}

function renderDetail() {
  const task = tasks.find((t) => t.id === openTaskId);
  if (!task) return closeDetail();
  const t = task.triage;

  $('#detail').replaceChildren(
    el('button', { class: 'back', onclick: closeDetail }, '← Back to list'),
    el('div', { class: 'sheet' },
      el('span', { class: `chip ${t.colour}` }, t.short_label),
      el('h2', {}, task.text),
      el('p', {}, t.reason),
      // Point 5 of the brief: every task says how Afternoon itself helps,
      // even where the AI can't.
      el('div', { class: 'helps' }, el('div', { class: 'label' }, 'How Afternoon helps anyway'), t.afternoon_helps),
      el('div', { class: 'section' }, renderAction(task))
    )
  );
}

// The middle of the detail view depends on the task's state and kind.
function renderAction(task) {
  const t = task.triage;
  if (task.status === 'working') return el('div', { class: 'status-line' }, spinner(), 'Siesta is working on this…');
  if (task.status === 'queued') return el('div', { class: 'status-line' }, 'Queued: I\'ll get to this in priority order.');
  if (task.status === 'done') return renderResult(task);
  if (task.status === 'error') {
    return el('div', {}, el('p', { class: 'error' }, task.error), el('button', { class: 'btn', onclick: () => queueTask(task, task.inputs) }, 'Try again'));
  }
  if (task.status === 'ready') return el('div', {}, el('div', { class: 'label' }, 'What I\'ll do'), el('p', {}, t.siesta_part), el('p', {}, 'Press "Start working" in the chat and I\'ll begin with the top card.'));

  // --- Yellow and red: what Siesta needs from the adviser ---
  if (t.kind === 'needs_answers') {
    // Questions were generated during triage (all in one go), but are only
    // asked now, when the adviser picks this task up.
    const inputs = t.questions.map((q) => el('input', { type: 'text', 'aria-label': q }));
    return el('div', {},
      el('div', { class: 'label' }, 'To move this forward I need to know'),
      t.questions.map((q, i) => el('div', { class: 'q' }, el('label', {}, q), inputs[i])),
      el('button', { class: 'btn', onclick: () => queueTask(task, { answers: t.questions.map((q, i) => ({ q, a: inputs[i].value || '(no answer)' })) }) }, 'Send answers')
    );
  }
  if (t.kind === 'handoff') {
    // Handoff: the adviser does the human step, tells Siesta the outcome, and
    // Siesta picks it up from there.
    const note = el('textarea', { rows: '3', placeholder: 'e.g. Sarah started at Barclays on 1 Nov as Programme Director, £82k' });
    return el('div', {},
      el('div', { class: 'label' }, 'Your part'), el('p', {}, t.your_part),
      el('div', { class: 'label' }, 'Then I will'), el('p', {}, t.siesta_part),
      el('div', { class: 'label' }, 'What did you find out?'), note,
      el('p', {}),
      el('button', { class: 'btn', onclick: () => note.value.trim() && queueTask(task, { handoffNote: note.value.trim() }) }, "I've done my part")
    );
  }
  if (t.kind === 'walkthrough') {
    return el('div', {},
      el('div', { class: 'label' }, 'Your part'), el('p', {}, t.your_part),
      el('div', { class: 'label' }, 'How I can help'), el('p', {}, t.siesta_part),
      el('button', { class: 'btn', onclick: () => queueTask(task) }, 'Walk me through it')
    );
  }
  // cannot (red)
  return el('div', {},
    el('div', { class: 'label' }, 'What I can do instead'), el('p', {}, t.alternative),
    t.your_part && [el('div', { class: 'label' }, 'Your part'), el('p', {}, t.your_part)],
    el('button', { class: 'btn', onclick: () => queueTask(task, { doAlternative: true }) }, 'Do this instead')
  );
}

// Show whatever the run produced. Each block only appears if it has content.
function renderResult(task) {
  const r = task.result;
  return el('div', {},
    el('h3', {}, r.headline),
    el('div', { html: md(r.body) }),
    r.steps.length > 0 && el('ol', { class: 'steps' }, r.steps.map((s) => el('li', {}, el('label', {}, el('input', { type: 'checkbox' }), ' ', el('span', { html: md(s).replace(/<\/?p>/g, '') }))))),
    r.email && renderEmail(r.email),
    r.proposals.length > 0 && renderProposals(r.proposals),
    r.next_step && el('p', { class: 'next' }, '→ ', r.next_step),
    r.sources.length > 0 && el('details', { class: 'sources' },
      el('summary', {}, `Sources (${r.sources.length})`),
      r.sources.map((s) => el('blockquote', {}, `"${s.quote}"`, el('cite', {}, s.file)))
    )
  );
}

// An email DRAFT. Editable, then copied or opened in the adviser's own mail
// app. Siesta never sends: the adviser presses send (per the capabilities doc).
function renderEmail(email) {
  const to = el('input', { type: 'text', value: email.to });
  const subject = el('input', { type: 'text', value: email.subject });
  const body = el('textarea', {}, email.body);
  const mailto = () => `mailto:${encodeURIComponent(to.value)}?subject=${encodeURIComponent(subject.value)}&body=${encodeURIComponent(body.value)}`;
  return el('div', { class: 'email' },
    el('div', { class: 'label' }, 'Draft email: you send it'),
    el('div', { class: 'row' }, 'To', to),
    el('div', { class: 'row' }, 'Subject', subject),
    body,
    buttonRow([
      ['Open in my mail app', () => (window.location.href = mailto())],
      ['Copy', async (row) => { await navigator.clipboard.writeText(`Subject: ${subject.value}\n\n${body.value}`); row.append(confirmLine('Copied')); }, 'btn ghost'],
    ])
  );
}

// Proposed record changes. Nothing changes until the adviser approves each one.
function renderProposals(proposals) {
  return el('div', { class: 'section' },
    el('div', { class: 'label' }, 'Proposed record updates: approve to apply'),
    proposals.map((p) =>
      el('div', { class: 'proposal' },
        el('strong', {}, `${p.member}: ${p.field}`),
        el('div', { class: 'old' }, p.current_value || '(empty)'),
        el('div', { class: 'new' }, p.proposed_value),
        el('small', {}, 'Source: ', p.source),
        renderDecision(p)
      )
    )
  );
}

function renderDecision(p) {
  if (p.decision === 'approved') return el('div', { class: 'actions' }, el('span', { class: 'chip green' }, '✓ Approved'));
  if (p.decision === 'rejected') return el('div', { class: 'actions' }, el('span', { class: 'chip' }, 'Rejected'));
  return el('div', { class: 'actions' },
    el('button', { class: 'btn', onclick: async () => {
      await api('/api/approve', { proposal: p });
      p.decision = 'approved';
      say(confirmLine(`Approved: ${p.member}, ${p.field} is now "${p.proposed_value}".`));
      refresh();
    } }, 'Approve'),
    el('button', { class: 'btn ghost', onclick: () => { p.decision = 'rejected'; refresh(); } }, 'Reject')
  );
}

// -----------------------------------------------------------------------------
// 5. First impression: Siesta asks for the real to-do list instead of a tour
// -----------------------------------------------------------------------------
say(
  el('p', {}, 'Hi Matthew, welcome to Afternoon 👋'),
  el('p', {}, "Rather than a tour, let's get some of your real work done. Paste today's to-do list below, one task per line."),
  el('p', {}, "I'll show you what I can take off your plate right now, what I need a quick answer for, and what only you can do (with how Afternoon helps anyway).")
);
