# Siesta To-Do Onboarding

A prototype for **Afternoon**. On first login, Siesta (Afternoon's AI assistant) asks the adviser to paste their real to-do list and starts doing the work, instead of giving a product tour.

> **The aim:** advisers feel they're getting work done, not learning a new tool.

A brand-new Afternoon account has **no client data**, so Siesta is honest about it. Every task starts yellow or red, and Siesta walks the adviser through uploading their existing documents. As the client record fills up, tasks **turn green** and Siesta gets on with them. Every task is **its own chat session** with Siesta.

All client data is **fictional and synthetic** (the Henderson household).

**Contents**
1. [Run it](#1-run-it)
2. [Demo script](#2-demo-script)
3. [Project map: which file does what](#3-project-map-which-file-does-what)
4. [The big picture: three AI calls](#4-the-big-picture-three-ai-calls)
5. [Step by step: what happens in the code](#5-step-by-step-what-happens-in-the-code)
6. [The prompts, in full](#6-the-prompts-in-full)
7. [What the AI is grounded in: knowledge and search](#7-what-the-ai-is-grounded-in-knowledge-and-search)
8. [Front-end state: the task object and the redraw pattern](#8-front-end-state-the-task-object-and-the-redraw-pattern)
9. [API reference](#9-api-reference)
10. [Safety and guardrails in the code](#10-safety-and-guardrails-in-the-code)
11. [Design decisions](#11-design-decisions)
12. [Interview notes](#12-interview-notes)

---

## 1. Run it

Needs Node 22 or later. There are **no npm packages** to install.

```bash
cp .env.example .env
```

Put your OpenAI key in `.env` (and optionally `OPENAI_MODEL`, default `gpt-6.1-terra`), then:

```bash
npm start
```

Open http://localhost:3000. `npm start` runs `node --env-file=.env server.js`, so Node reads `.env` itself.

**Every page load is a fresh first login.** The browser calls `/api/reset`, which wipes the server's session, and the welcome pop-up appears.

---

## 2. Demo script

1. **Welcome pop-up:** paste the to-do list (bulleted lists copied from Word work) and click **Get Started**. **Skip** closes it to explore.
2. **To-Do List tab** (it replaces the panel's History tab): the list opens at full height and gets sorted. Every card is yellow or red, because nothing is in Afternoon yet. A **Start here** card appears at the top: *Get your client information into Afternoon*. The banner says **"Click on a task to talk it through with Siesta"**.
3. **Fix the list:** drag to reorder, ✎ to edit (that card is sorted again), × to delete, **+ Add task** for anything missed.
4. **Open a task:** the first message is its brief (why it's that colour, how Afternoon helps anyway, and the questions or actions needed). Below it you chat with Siesta about just that task.
5. **Upload:** open *Start here* and use the files in **`demo-uploads/`**. Choose the first five, click **Upload 5 files**, wait for *Ready*, then click **Process data**. Siesta says **Files uploaded** and three tasks turn 🟢: review prep, the pension question and the Aviva chaser.
6. **Next task →** (shown under **Task complete**) moves to the next unfinished task in your order.
7. **Start working** (top of the list): Siesta does the green tasks top-down in the background. The Conversation tab pings you as each finishes.
8. **Follow up in a task's chat:** in the Aviva chaser, type "Make it shorter and copy in Sarah". Siesta returns a revised draft with Sarah in **Cc**.
9. **Handoff:** in "Call Sarah…", type what Sarah said ("She started at Barclays on 1 Nov…"). Siesta proposes record updates, and you **Approve** each one.
10. **Walkthrough / can't do:** "Outlook" gets numbered steps. The ISA task can't be done, so **Do this instead** runs an allowance check.
11. **Memory and skills:** suggestions appear in the task chat they came from. Saving is one click.

---

## 3. Project map: which file does what

```
afternoon-task/
├── server.js                 ← the whole back end: API routes, prompts, OpenAI calls, search, session state
├── public/
│   ├── index.html            ← the welcome pop-up, the panel's tabs and its three views, the composer
│   ├── app.js                ← panel logic: pop-up, list parsing, sorting, To-Do List, task chats, work queue
│   ├── upload.js             ← the "Start here" task: upload walkthrough, extraction, "Files uploaded"
│   └── styles.css            ← all styling (the screenshot is the page background)
├── docs/
│   └── afternoon-capabilities.md   ← SOURCE OF TRUTH for what Siesta can/can't do; sent with every AI call
├── data/guide/               ← Afternoon user-guide pages, searchable from day one
│   ├── afternoon-user-guide-adding-client-data.md   (Afternoon's own upload guidance)
│   └── afternoon-user-guide-calendar.md             (placeholder for the Outlook walkthrough)
├── demo-uploads/             ← the adviser's existing files to upload during the demo (synthetic)
│   ├── henderson-fact-find.txt                      (Fact Find model)
│   ├── henderson-valuations-2026-10-31.csv          (IO Fund Valuation model)
│   ├── henderson-2025-annual-review-transcript.txt  (Core)
│   ├── henderson-2025-review-actions.csv            (Core)
│   ├── aviva-transfer-emails.txt                    (Core)
│   └── sarah-voicemail-file-note-2026-10-28.txt     (Core; optional second batch)
├── assets/afternoon-screenshot.png   ← static Afternoon screenshot behind the panel
├── .env / .env.example       ← OPENAI_API_KEY, OPENAI_MODEL, PORT (.env is git-ignored)
└── package.json              ← only a "start" script; no dependencies
```

**Where to find things in `server.js`** (numbered sections in the file):

| Section | What's there |
|---|---|
| 1. Knowledge | `CAPABILITIES` (the capabilities doc), `chunkDocument()`, `termSet()`, `search()`, `formatChunks()`, `GUIDE_CHUNKS` |
| 2. Session state | `state` / `freshState()`, `recordText()`, `sessionContext()` |
| 3. Calling OpenAI | `askModel()`, the schema helpers `str` / `obj` / `arr`, and `SIESTA_RULES` (the shared persona prompt) |
| 4. `/api/triage` | `KINDS`, `COLOUR`, `TRIAGE_SCHEMA`, `TRIAGE_SYSTEM`, `triage()` |
| 5. `/api/extract`, `/api/finalise` | `UPLOAD_MODELS`, `EXTRACT_SCHEMA`, `extract()`, `finalise()` |
| 6. `/api/run` | `RUN_SCHEMA`, `RUN_SYSTEM`, `runTask()` |
| 7. HTTP server | `ROUTES`, `serveStatic()`, `http.createServer` |

**Where to find things in `public/app.js`** (numbered sections in the file):

| Section | What's there |
|---|---|
| Helpers | `el()` (safe DOM builder), `md()` (tiny Markdown), `api()`, `say()` / `youSay()` (Conversation tab), `post()` (task chat), `buttonRow()` |
| 1. Navigation | tab clicks, `openTask()`, `backToList()`, `refresh()`, `renderComposer()`, composer submit |
| 2. Welcome pop-up | `api('/api/reset')`, Get Started / Skip / Use demo list handlers, `greet()` |
| 3. Tasks and sorting | `BULLET`, `parseTaskLines()`, `newTask()`, `addTasksFromText()`, `sortTasks()`, `summariseTriage()`, `renderBanner()`, `startWork()`, `resortAfterUpload()` |
| 4. Doing a task | `processQueue()`, `announceIfAllDone()`, `historyFor()`, `sendTaskMessage()`, `act()`, `runTask()` |
| 5. The list | `renderBoard()`, `renderCard()` (incl. drag-and-drop), `moveTask()`, `saveEdit()`, `deleteTask()`, + Add task |
| 6. One task's chat | `renderTaskView()`, `renderComplete()`, `nextTask()`, `renderBrief()`, `renderNeeds()`, `renderMessage()`, `renderMemory()`, `renderSkill()`, `renderResult()`, `renderEmail()`, `renderProposals()`, `renderDecision()` |

**`public/upload.js`:** `UPLOAD_MODELS`, `MAX_FILES`, `READABLE` / `SUPPORTED`, the `upload` state object, `guessModel()`, `ensureUploadCard()`, `renderUploadGuide()`, `renderUploadWidget()`, `renderChoose()`, `addFiles()`, `startExtraction()`, `renderExtracting()`, `processData()`.

---

## 4. The big picture: three AI calls

The AI is called in exactly **three places**. Each one is a single OpenAI Chat Completions request from `askModel()` in `server.js`, with:
- a **system prompt**: Siesta's rules plus that job's instructions;
- a **user message** assembled by the server: the task, client data, document excerpts and the capabilities doc;
- a **JSON schema** in strict *structured outputs* mode, so the reply always has exactly the fields the UI expects.

| # | AI call | Endpoint → server function | Prompt | Schema | Triggered from (browser) | When |
|---|---|---|---|---|---|---|
| 1 | **Sort the to-do list** | `POST /api/triage` → `triage()` | `TRIAGE_SYSTEM` | `TRIAGE_SCHEMA` | `sortTasks()` in `app.js` | After Get Started, a pasted list, an edited or added card, and after every upload |
| 2 | **Read an uploaded file** | `POST /api/extract` → `extract()` | inline in `extract()` + `UPLOAD_MODELS[model]` | `EXTRACT_SCHEMA` | `startExtraction()` in `upload.js` | Once per file, all files in parallel |
| 3 | **One turn of a task's chat** | `POST /api/run` → `runTask()` | `RUN_SYSTEM` | `RUN_SCHEMA` | `runTask()` in `app.js` (via the queue, `act()` or `sendTaskMessage()`) | Doing a task, a button in a brief, or any message typed in a task chat |

Everything else is plain code with no AI: the reset, finalising uploads, approvals, saving memory, search, the colour rule, priority and the queue.

```
 Browser (public/)                                   Server (server.js)                             OpenAI
 ─────────────────                                   ──────────────────                             ──────
 page load ──────────── POST /api/reset ───────────► state = freshState()
 Get Started ─ sortTasks() ─ POST /api/triage ─────► triage(): search() + sessionContext() ──────► TRIAGE_SYSTEM
                                                       + CAPABILITIES → askModel()                 + TRIAGE_SCHEMA
                                                     ◄─ kinds, labels, reasons, questions… ◄────── (JSON)
                                                       (+ colour added in code from KINDS)
 Upload N files ─ startExtraction() ─ POST /api/extract (×N, parallel) ─► extract() ─────────────► extraction prompt
                                                     ◄─ fields tagged new/update/conflict + quotes ◄ + EXTRACT_SCHEMA
 Process data ─ processData() ─ POST /api/finalise ► finalise(): fields → state.record,
                                                       text → state.documentChunks (searchable)
 ...then sortTasks() again ─ POST /api/triage ─────► (now the record isn't empty → tasks turn green)
 task chat / queue ─ runTask() ─ POST /api/run ────► runTask(): task + history + inputs
                                                       + sessionContext() + search() ──────────────► RUN_SYSTEM
                                                     ◄─ headline, body, email, proposals, … ◄────── + RUN_SCHEMA
 Approve ───────────── POST /api/approve ──────────► state.approvedChanges (fed into later prompts)
 Save memory/skill ─── POST /api/memory ───────────► state.memories / state.skills (memories fed into later prompts)
```

---

## 5. Step by step: what happens in the code

### 5.1 Page load and the welcome pop-up
**Files:** `public/index.html` (`#welcome`), `public/app.js` section 2.

- The pop-up's HTML is in `index.html` inside `<div id="welcome" class="backdrop">`. It's visible by default, so it appears on every load.
- At the top of section 2, `app.js` calls `api('/api/reset')`. On the server that runs `Object.assign(state, freshState())`, which empties the client record, documents, approvals, memories and skills. **Every load is a first login.**
- **Use demo list** (`#welcome-demo`) fills the box with `DEMO_LIST`.
- **Get Started** (`#welcome-start`): if the box is empty it focuses the box. Otherwise it hides the pop-up and calls `greet()`, which posts the greeting in the Conversation tab, and then `addTasksFromText(text)`.
- **Skip** (`#welcome-skip`) hides the pop-up, greets, and posts "No problem, have a look around…". The panel stays usable: paste a list in the Conversation tab any time.

### 5.2 Turning pasted text into tasks
**File:** `public/app.js` section 3: `parseTaskLines()`, `BULLET`, `addTasksFromText()`.

- `parseTaskLines()` copes with text pasted from Word:
  - Windows line endings (`\r\n`) become `\n`;
  - non-breaking and narrow spaces become normal spaces;
  - text is split into lines;
  - each line's leading bullet or number is stripped with the `BULLET` regex (`•`, `◦`, `o`, `§`, Word's Symbol-font bullet characters, `-`, `*`, `1.`, `2)`, `a)`…);
  - whitespace is collapsed;
  - empty lines and short headings ending in `:` (e.g. "To do this week:") are dropped.
- `addTasksFromText()`:
  - echoes the text in the Conversation tab;
  - creates one task per line with `newTask()`, giving each an `id`, its `text`, status `'sorting'` and an empty `messages` array (its own chat);
  - switches to the **To-Do List** tab, so the adviser watches their own tasks appear;
  - calls `sortTasks()` and then `summariseTriage()`, which posts a summary with an "Open my To-Do List" button in Conversation.

### 5.3 AI call #1: sorting into green / yellow / red
**Files:** `public/app.js` → `sortTasks()`; `server.js` section 4 → `triage()`.

**In the browser, `sortTasks(list)`:**
1. sets each task's status to `'sorting'` and redraws, so cards show a spinner;
2. calls `POST /api/triage` with `{ tasks: [{ id, text }, …] }`;
3. for each returned item, stores it on the task as `task.triage` and sets the status:
   - **green** → `'ready'`, or straight to `'queued'` if work has already started;
   - **yellow / red** → `'needs_you'`;
4. stores `result.meanwhile` (the "what you can do meanwhile" tip);
5. calls `ensureUploadCard()` from `upload.js`. If any task is `needs_upload`, this adds the *Start here* card to the top of the list.

**On the server, `triage({ tasks })`:**
1. **Search:** runs `search(task.text, 6)` for every task and merges the hits. That's up to 6 text chunks per task, plus all CSV tables, from the guide and any uploaded documents.
2. **Builds the user message**, in this order:
   ```
   TO-DO LIST (in the adviser's priority order):
   t1: Prep for the Hendersons' annual review on Thursday
   t2: …
   <sessionContext()>         ← CLIENT RECORD (or "EMPTY…"), approved changes, saved memories
   DOCUMENT EXCERPTS:
   [source: uploads/aviva-transfer-emails.txt]
   …chunk text…
   CAPABILITIES DOCUMENT:
   <the whole docs/afternoon-capabilities.md>
   ```
3. **Calls the model** with `TRIAGE_SYSTEM` (see [§6.2](#62-triage_system-sorting-the-list)) and `TRIAGE_SCHEMA`.
4. **Adds the colour in code:** `t.colour = COLOUR[t.kind]`.

**The six kinds, and the colour code gives each one:**

| `kind` (chosen by the AI) | Colour (set in code) | Meaning | What the task's brief shows |
|---|---|---|---|
| `siesta_now` | 🟢 green | Siesta can do it alone with the data it has | What it'll do, **Do this now** |
| `needs_upload` | 🟡 yellow | Siesta could do it, but the client info isn't in Afternoon yet | What's needed, **Show me how to upload it** |
| `needs_answers` | 🟡 yellow | Needs a decision or fact no document would hold | The questions with answer boxes, **Send answers** |
| `walkthrough` | 🟡 yellow | The adviser clicks; Siesta guides | Your part, **Walk me through it** |
| `handoff` | 🟡 yellow | The adviser does a first step (e.g. a call), then Siesta takes over | Your part / then I will, "tell me what you found out below" |
| `cannot` | 🔴 red | Siesta can't do it at all | The reason, an alternative, **Do this instead** |

**What the model returns for each task (`TRIAGE_SCHEMA`):** `id`, `kind`, `short_label` (the card's chip), `reason`, `siesta_part`, `your_part`, `needs_upload`, `questions`, `alternative` and `afternoon_helps` ("How Afternoon helps anyway"). There's also one top-level `meanwhile`. Questions for *every* task are generated in this one call, but each is only shown when its task is opened.

**Why tasks start yellow:** before any upload, `recordText()` returns `CLIENT RECORD IN AFTERNOON: EMPTY…`. `TRIAGE_SYSTEM` says to never mark a task `siesta_now` if its information is missing, so data-dependent tasks come back `needs_upload`.

### 5.4 The To-Do List tab
**Files:** `public/index.html` (`#todo-list`), `public/app.js` sections 1, 3 and 5.

- **Tabs:** *Actions* (copied from the real panel, disabled), *Conversation* and *To-Do List*. A click sets `tab` and calls `refresh()`. Clicking *To-Do List* while inside a task goes back to the whole list.
- **Badge** on the To-Do List tab: the number of tasks with status `needs_you`. It's updated in `refresh()`.
- **Banner** (`renderBanner()`), from top to bottom:
  - **"💬 Click on a task to talk it through with Siesta"**;
  - the 🟢/🟡/🔴 counts;
  - "Start with the first card…" while the upload card is waiting;
  - a help line;
  - the "Meanwhile" tip once work has started;
  - **Start working (n)** when there are green tasks and work hasn't started.
- **Cards** (`renderCard()`) show a priority number and drag handle, the text, ✎ / × tools, a status line and the coloured `short_label` chip. Status text by state:

  | Status | Card shows |
  |---|---|
  | `sorting` | spinner "Sorting…" |
  | `ready` | "Siesta will do this" |
  | `needs_you` | `WAITING_TEXT[kind]`, e.g. "Needs client info", "Your step first" |
  | `queued` | "Queued" |
  | `working` | spinner "Working…" |
  | `done` | "✓ Task complete" |
  | `error` | "⚠ Error: open to retry" |

- **Drag to prioritise:** native HTML5 drag-and-drop in `renderCard()`. `dragover` works out whether the pointer is in the top or bottom half of the target card, and `drop` calls `moveTask()`, which reorders the `tasks` array. **The array order *is* the priority.** The queue and **Next task** both read it.
- **Edit (✎):** the text becomes an input. Enter calls `saveEdit()`, which clears that task's result and chat and **re-sorts just that task**. Esc cancels.
- **Delete (×)** calls `deleteTask()`. **+ Add task** adds an input row, and Enter creates a task and sorts it. The *Start here* card can't be edited or deleted.

### 5.5 Each task is its own chat
**Files:** `public/index.html` (`#task-view`), `public/app.js` section 6.

Clicking a card calls `openTask(id)`, and `renderTaskView()` draws, from the task's data:
1. **Header:** "← All tasks", the coloured chip, the task text.
2. **The brief** (`renderBrief()`), always the first message: the `reason`, a "How Afternoon helps anyway" box (`afternoon_helps`), and **what's needed** (`renderNeeds()`), which depends on the task's status and kind (table in §5.3). Once the task is underway or done, this shrinks to "My part". The *Start here* card shows the upload walkthrough here instead (§5.8).
3. **The conversation:** `task.messages.map(renderMessage)`. Messages are stored as **data**, not HTML, so they can be redrawn at any time:

   | Message | Drawn by | Looks like |
   |---|---|---|
   | `{ role: 'you', text }` | `renderMessage` | the adviser's bubble |
   | `{ kind: 'result', result }` | `renderResult()` | cream card: headline, body, steps, email draft, proposals, next step, sources |
   | `{ kind: 'memory', text, choice }` | `renderMemory()` | 💡 "Worth remembering?" + Save / No thanks |
   | `{ kind: 'skill', skill, choice }` | `renderSkill()` | 🔁 "Turn it into a skill?" + Create / Not now |
   | `{ kind: 'note', text }` | `renderMessage` | green ✓ line (e.g. "Files uploaded (5).") |
   | `{ kind: 'text', text }` | `renderMessage` + `md()` | Siesta text |
   | `{ kind: 'error' }`, `{ kind: 'typing' }` | `renderMessage` | error text / spinner line |

4. **"Working on it…"** while the status is `working`.
5. **"✓ Task complete" + Next task →** when the status is `done` (`renderComplete()`). `nextTask()` finds the next task in list order that isn't done, wrapping round to the top. If there are none, the button becomes "All tasks done: back to the list".

**Scroll and typing are preserved.** `refresh(changed)` only redraws the open chat if *that* task changed. A task finishing in the background doesn't wipe what you're typing, and email edits and answer boxes write straight back to their objects (`oninput`).

**The composer** (`renderComposer()`) is shared, and its job depends on where you are:
- **Conversation tab:** adds tasks ("Paste or type tasks to add to your list…").
- **To-Do List:** hidden (the list has + Add task).
- **Inside a task:** talks to Siesta about that task. The placeholder changes by kind ("Tell Siesta what you found out…" for a handoff), and the composer is disabled while Siesta is working on that task.

### 5.6 AI call #3: one turn of a task's chat (`/api/run`)
**Files:** `public/app.js` section 4 (`sendTaskMessage()`, `act()`, `historyFor()`, `runTask()`); `server.js` section 6 (`runTask()`).

**Three ways a turn starts in the browser:**
- **A button in the brief** calls `act(task, label, inputs)`. The label (e.g. "Walk me through it.") is added as the adviser's message, so the session reads like a chat.

  | Button | `inputs` sent |
  |---|---|
  | Do this now / Walk me through it | `{}` |
  | Send answers | `{ answers: [{ q, a }, …] }` |
  | Do this instead (red) | `{ doAlternative: true }` |

- **Typing in the task chat** calls `sendTaskMessage(task, text)`. What the text *means* depends on what the task is waiting for:

  | Task is… | Text is sent as |
  |---|---|
  | `needs_you` + `handoff` | `{ handoffNote: text }`: the outcome of the adviser's step |
  | `needs_you` + `needs_answers` | `{ answers: [{ q: all questions, a: text }] }` |
  | anything else (done, ready, upload card…) | `{ message: text }`: a follow-up or a request for changes |

- **The background queue** calls `runTask(task, {})` for green tasks (§5.7).

**`historyFor(task)`** sends the last 8 turns of that task's chat: adviser messages, plus each Siesta result as headline, body and email body. It's taken **before** the new message is added, so the new message isn't duplicated. This is what makes every task its own session: the server keeps no chat state, and the browser sends the history each time.

**`runTask(task, inputs)` in the browser:**
1. sets the status to `working` and redraws;
2. calls `POST /api/run` with `{ task: { text, triage }, ...inputs, history }`;
3. stores the reply as `task.result` and adds a `result` message;
4. if the reply suggests one, adds a `memory` message, and a `skill` message (at most one skill per task);
5. sets the status to `done`;
6. if the adviser isn't looking at that task, pings the Conversation tab: "✓ Done: …" with an **Open** button;
7. on error, adds an error message and sets the status to `error` (or back to `done` if there was already a result).

**On the server, `runTask({ task, answers, handoffNote, doAlternative, message, history })`:**
1. Builds `extra`, the adviser's input as text:
   - `The adviser answered your questions: Q: … A: …`
   - `The adviser has done their part and reports: "…". Now do your part.`
   - `You can't do this task as written. Do the alternative instead: <alternative>`
   - `The adviser's new message in this task's chat: "…"`
2. Builds `conversation`: `CONVERSATION SO FAR ON THIS TASK:` plus each history turn as `ADVISER: …` / `SIESTA: …`.
3. **Search:** `search(task.text + extra)` (top 10 text chunks plus all CSV tables). The adviser's answers shape *what is looked up* as well as what is written.
4. **The user message**, in this order:
   ```
   TASK: <task text>
   HOW YOU SORTED IT: <kind>. <reason>
   YOUR PART: <siesta_part>
   CONVERSATION SO FAR ON THIS TASK: …        (if any)
   <extra>                                    (answers / handoff note / alternative / new message)
   <sessionContext()>                         (client record, approved changes, saved memories)
   DOCUMENT EXCERPTS: [source: …] …
   CAPABILITIES DOCUMENT: <whole doc>
   ```
5. Calls the model with `RUN_SYSTEM` (see [§6.4](#64-run_system-doing-a-task--chatting-about-it)) and `RUN_SCHEMA`.

**What comes back (`RUN_SCHEMA`) and how it's shown (`renderResult()`):**

| Field | Shown as |
|---|---|
| `headline` | bold title of the result card (also used in Conversation pings) |
| `body` | main text, rendered by `md()` (`## headings`, `- bullets`, `**bold**`) |
| `steps` | numbered checklist (walkthroughs) |
| `email` `{to, cc, subject, body}` or `null` | editable draft with **Open in my mail app** (a `mailto:` link) and **Copy**. Never sent by Siesta. |
| `proposals` `[{member, field, current_value, proposed_value, source}]` | old → new, each with **Approve** / **Reject** |
| `next_step` | orange "→" line |
| `sources` `[{file, quote}]` | collapsible "Sources (n)" with exact quotes |
| `memory_suggestion` | 💡 message (if not empty) |
| `skill_suggestion` `{name, description}` or `null` | 🔁 message |

One schema covers every kind of task. Fields that don't apply come back empty and aren't drawn. That means one endpoint and one renderer.

### 5.7 The background work queue
**File:** `public/app.js`: `startWork()`, `processQueue()`, `announceIfAllDone()`.

- **Start working** (banner) sets `started = true`, moves every `ready` task to `queued`, posts "Starting with …" in Conversation, and calls `processQueue()`.
- `processQueue()` takes **the first `queued` task in list order**, runs it with `runTask(task, {})`, then calls itself again. A `busy` flag keeps it to **one at a time**. Because it re-reads the order each time, dragging a card while Siesta works changes what it does next.
- After `started`, any task that turns green, for example after an upload, goes straight into the queue.
- When nothing is queued or working, `announceIfAllDone()` posts in Conversation: "That's everything I can do on my own for now…" and lists the tasks still waiting for you.
- **Do this now** in a green task's brief runs that task immediately, outside the queue.

### 5.8 AI call #2: uploading client information
**Files:** `public/upload.js`; `server.js` section 5 (`extract()`, `finalise()`).

**The *Start here* card.** `ensureUploadCard()` adds a special task (`id: 'upload'`, kind `'upload'`, yellow, "Start here") to the **top** of the list the first time any task is `needs_upload`. Its brief is `renderUploadGuide()`:
- **"What your list is waiting for"**: each waiting task's `needs_upload` text (written by the AI during sorting) next to the task name, so the walkthrough is tailored to this adviser's own list;
- **Route 1, upload documents and extract the data:** the interactive widget;
- **Routes 2 and 3, valuation feeds and manual entry:** explained in expandable sections, because they happen elsewhere in Afternoon;
- a practical tip.

**The widget is a small state machine** (`upload.stage`: `choose → extracting → ready → processing → choose`):

| Stage | Function | What happens |
|---|---|---|
| `choose` | `renderChoose()`, `addFiles()` | Drag files in or click **Upload from your computer** (SharePoint is shown but disabled). `addFiles()` caps the batch at `MAX_FILES = 5`, rejects unsupported types (`SUPPORTED` comes from the capabilities doc), explains supported-but-unreadable ones (only `.txt` / `.csv` are read, to avoid libraries), and reads text with `file.text()`. Each file gets an upload model dropdown pre-filled by `guessModel()`: "fact find" → Fact Find, "valuation" → IO Fund Valuation, "darsco" → DARSCO, else Core. |
| `extracting` | `startExtraction()`, `renderExtracting()` | Sends **every file in parallel** (`Promise.all`) to `POST /api/extract` with `{ name, model, text }`. Each row shows *Extracting* → *Ready* (or *Failed*). |
| `ready` | `renderExtracting()` | **Process data** appears. |
| `processing` | `processData()` | Accepts **all** extracted fields (the demo shortcut; see below), calls `POST /api/finalise` with `{ documents, accepted }`, marks the card **done / green / "Add more anytime"**, posts **"Files uploaded (n)."**, then calls `resortAfterUpload()`. |

**On the server, `extract({ name, model, text })`:**
- The system prompt is `SIESTA_RULES` plus extraction instructions (see [§6.3](#63-extraction-prompt-reading-an-uploaded-file)), including `UPLOAD_MODELS[model]`. **The upload model changes what the AI looks for**: Fact Find looks for personal details, objectives, risk and so on; IO Fund Valuation looks for holdings.
- The user message is `recordText()` (the current record, so it can tell new from update from conflict), then `DOCUMENT: <name>` and the file text (first 30,000 characters).
- It returns `{ summary, items: [{ group: new|update|conflict, section, field, value, existing_value, quote }] }`, and the server tags every item with `file: uploads/<name>`.

**On the server, `finalise({ documents, accepted })`:**
- Every document is chunked with `chunkDocument()` into `state.documentChunks`. From now on Siesta can **search and quote** it, as in "documents stay in the client's Documents area".
- Every accepted field goes into `state.record`. A field with the same section and name replaces the old one, which is how updates and conflicts take effect.

**Then the list is sorted again.** `resortAfterUpload(card)` in `app.js` re-sorts **every open card**: `needs_you`, `ready` and `error`, red ones included, because new information can change what's possible. While it runs, a "Checking your list again…" line shows in the upload chat. Afterwards it posts e.g. "🟢 3 tasks turned green. Press **Start working** on your To-Do List." Because `recordText()` is no longer empty, the model now marks the data-backed tasks `siesta_now`.

**The demo shortcut.** In the product, after *Process data* the adviser sees every field grouped as new information, updates and conflicts, each with a citation, and clicks *Finalise review*. The demo skips that screen and accepts everything (the platform's "Add everything as new" + "Update all information"). The extraction and citations are still real and still sent to the server.

### 5.9 Approvals, memory and skills
- **Approve** on a proposal (`renderDecision()`) sends `POST /api/approve` with `{ proposal }`, and the server adds it to `state.approvedChanges`. `sessionContext()` puts approved changes into **every later prompt** as overriding older values. A ✓ note is added to the task chat. **Reject** just marks it in the browser.
- **Save to company memory** sends `POST /api/memory` with `{ type: 'memory', text }`, adding it to `state.memories`, which `sessionContext()` also puts into every later prompt ("apply these preferences").
- **Create skill** sends `{ type: 'skill', skill }`, adding it to `state.skills` (stored only; in Afternoon this would create a firm skill).
- Each choice is saved on its message (`m.choice`), so the buttons turn into a confirmation and stay that way after redraws.

---

## 6. The prompts, in full

All prompts live in `server.js`. Every system prompt starts with `SIESTA_RULES`, and every request also sends the full capabilities document.

### 6.1 `SIESTA_RULES`: shared persona and hard rules (section 3)
```
You are Siesta, the AI assistant built into Afternoon, a platform for UK financial advisers.
You are the adviser's helper, never the adviser. Hard rules (from the capabilities document):
- You only draft and propose. You never send, move money, contact anyone or change a record yourself.
- Never invent data. If something isn't in the client record or documents, say it's missing.
- Use British English and £. Be brief, warm and practical. Today is <today's date>.
- Be pragmatic, not pedantic: read relative dates ("1 Nov", "Thursday") against today's date and use normal UK conventions (salaries are annual). Only flag gaps that actually matter.
- The client data is fictional and synthetic (the Henderson household).
```
*Why the "pragmatic" line:* in testing, the model refused to accept "1 Nov" without a year and asked whether £82k was annual. The line stops that pedantry without loosening "never invent data".

### 6.2 `TRIAGE_SYSTEM`: sorting the list (section 4)
```
<SIESTA_RULES>

The adviser is brand new to Afternoon. Instead of a product tour, they pasted their real to-do list.
Client information only exists in Afternoon once it has been uploaded or entered: check the CLIENT RECORD and DOCUMENTS below.
Sort EACH task into exactly one kind, using the capabilities document as the only source of truth:
- siesta_now: you can complete it alone right now because the information it needs IS in the record or documents (find information, prepare packs, draft emails, propose updates). Drafting an email the adviser then sends themselves is siesta_now; say they press send.
- needs_upload: you could do it yourself, but the client information it depends on is NOT in Afternoon yet. Say exactly what to upload. Never mark a task siesta_now if its information is missing.
- needs_answers: the information is in Afternoon, but you need a decision or fact that no document would hold. Ask the fewest questions possible.
- walkthrough: the adviser must do it themselves in the platform (clicking buttons, connecting integrations); you can walk them through it step by step.
- handoff: the adviser must do a first step you cannot (e.g. phone the client); once they tell you the outcome, you take over (e.g. propose the record update).
- cannot: you cannot do it at all. Give the documented reason and a useful alternative you CAN do.
Requests to chase, email or follow up with someone are NOT cannot: you can't contact them, but you CAN draft the message for the adviser to send, so they are siesta_now (or needs_upload if you lack the details to write it). Use cannot only when there is nothing useful you can draft or prepare towards the task itself (e.g. moving money).
Platform how-tos don't need client data.
```
*Why the "chase" paragraph:* in testing, "Chase Aviva…" came back red ("Siesta can't contact third parties"). That's literally in the capabilities doc, but Siesta *can* draft the chaser, so the prompt now says so.

The **schema field descriptions** are part of the prompt too. For example, `siesta_part` says "in the future tense. Do not do the task or give the answer yet", which stopped the model from answering questions during sorting.

### 6.3 Extraction prompt: reading an uploaded file (section 5, inside `extract()`)
```
<SIESTA_RULES>

You are Afternoon's document extraction engine. Read ONE uploaded document and list the client facts in it.
Upload model chosen by the adviser: "<model>". <UPLOAD_MODELS[model]>
Compare every fact with the CURRENT CLIENT RECORD:
- new: not in the record yet.
- update: already in the record, and this document has a newer or more complete value that doesn't contradict it.
- conflict: contradicts what's in the record (e.g. a different employer). Show both values.
Every item needs an exact quote from the document as its citation. Only extract what the document says: never infer or fill gaps.
```
`UPLOAD_MODELS` (one line per model):

| Model | What it tells the AI to extract |
|---|---|
| Fact Find | personal details, dependants, employment and income, health, objectives, attitude to risk, capacity for loss, liabilities, protection, soft facts, ID/AML |
| Core | every client fact, holding, agreement, action and status in a general document |
| DARSCO | each pension: owner, provider, policy ref, value, contributions, dates |
| IO Fund Valuation | each holding: owner, provider, product, policy ref, value, valuation date |

### 6.4 `RUN_SYSTEM`: doing a task / chatting about it (section 6)
```
<SIESTA_RULES>

You are now doing ONE task from the adviser's to-do list. Use only the client record, the document excerpts, the session context and the capabilities document.
- Back facts with sources: quote the exact words from the documents, with the file path.
- Emails are drafts only; the adviser sends them from their own Outlook.
- Record changes are proposals only; the adviser approves them.
- For a walkthrough, give clear numbered steps from the user guide excerpt and remind them you can't click for them.
- If asked to do the alternative to something you can't do, do that alternative and briefly say why the original isn't possible.
- This is a chat about ONE task. If the adviser sends a new message, answer it directly. If they ask for changes to a draft or proposal, return the complete revised version. Don't repeat sources, suggestions or proposals they've already dealt with unless asked.
- Look for things worth keeping. Suggest a memory when the task reveals a durable fact or preference that would help next time (e.g. a provider's usual turnaround, how a client prefers to be contacted, the firm's chasing rule). Suggest a skill when the task is work an adviser repeats across clients (e.g. annual review prep, provider chasers, post-call record updates). Leave them empty only for genuine one-offs.
```
*Why the memory/skill line is so explicit:* with a vaguer "only if clearly valuable", the model never suggested anything.

---

## 7. What the AI is grounded in: knowledge and search

All in `server.js` sections 1 and 2.

| Knowledge | Where it comes from | How it reaches the prompt |
|---|---|---|
| **What Siesta can and can't do** | `docs/afternoon-capabilities.md`, read once at start-up into `CAPABILITIES` | Appended **in full** to every triage and run request |
| **Platform how-tos** | `data/guide/*.md`, chunked at start-up into `GUIDE_CHUNKS` | Through `search()` (always available, even before uploads) |
| **Client documents** | Uploaded files, chunked by `finalise()` into `state.documentChunks` | Through `search()` (only after Process data) |
| **The client record** | Fields accepted from uploads, in `state.record` | `recordText()` inside `sessionContext()`; says **EMPTY** before uploads |
| **Approved changes and memories** | `state.approvedChanges`, `state.memories` | `sessionContext()`, marked as overriding / to apply |

**How search works** (deliberately simple; no vector database):
- `chunkDocument(file, text)` splits **text files on blank lines**, so each transcript line like `[00:13:55] Matthew: …` becomes its own quotable chunk. It prepends the file's first line (e.g. the meeting title) so a lone line still says which meeting it came from. **CSV files stay whole** (`whole: true`) so rows keep their headers.
- `termSet(text)` makes crude stems: lower-case words, minus stop words, cut to 6 letters ("contributions" ≈ "contribution", "Hendersons" ≈ "Henderson").
- `search(query, k)` always returns **every CSV table**, plus the top `k` text chunks ranked by how many query stems they share. (In testing, the holdings table sometimes ranked below transcript lines and a review pack came back "missing" values, hence "always include tables".)
- `formatChunks()` labels every chunk `[source: <file>]`, which is what the model quotes back in `sources`.

---

## 8. Front-end state: the task object and the redraw pattern

**One array, `tasks`, in priority order**, at the top of `app.js`. Each task looks like:

```js
{
  id: 't3',                      // or 'upload' for the Start here card
  text: 'Chase Aviva about the Henderson pension transfer',
  status: 'needs_you',           // sorting | ready | needs_you | queued | working | done | error
  triage: { kind, colour, short_label, reason, siesta_part, your_part,
            needs_upload, questions, alternative, afternoon_helps },   // from /api/triage
  messages: [ { role: 'you', text }, { role: 'siesta', kind: 'result', result }, … ],  // its own chat
  result: { headline, body, email, proposals, steps, sources, … },     // latest /api/run reply
  answers: ['', ''],             // values typed into question boxes (kept across redraws)
  error: '…',                    // last error, if any
}
```

The other UI state lives in a few `let` variables:
- `tab`, `openTaskId`: where you are;
- `started`, `busy`: the queue;
- `meanwhile`: the tip;
- `dragId`, `editingId`: drag and edit in progress.

`upload.js` adds its own `upload` object (`stage`, `files`, `finalised`).

**The redraw pattern:** every action changes the data, then calls `refresh()`. That shows the right view, updates the badge and composer, and redraws the banner, the list and, if open, the task chat from data. It's React's core idea without React: one source of truth, and "draw everything from state".

**Two small helpers keep it safe and short:**
- `el(tag, attrs, ...children)` builds DOM nodes and **always adds text as text nodes**, so nothing from the model or the user can inject HTML. Attributes set to `null` or `false` are skipped, so `disabled: cond ? '' : null` works.
- `md(text)` is a tiny Markdown renderer (`##`, `-`, `**`) that **escapes HTML first**. It's the only place `innerHTML` is used.

---

## 9. API reference

All routes are in `ROUTES` in `server.js`. JSON in, JSON out. Errors return `500 { error }`, and the panel shows them in the chat.

| Route | Request | Response | AI? |
|---|---|---|---|
| `POST /api/reset` | `{}` | `{ ok }` | no |
| `POST /api/triage` | `{ tasks: [{ id, text }] }` | `{ tasks: [{ id, kind, colour, short_label, reason, siesta_part, your_part, needs_upload, questions, alternative, afternoon_helps }], meanwhile }` | **yes** |
| `POST /api/extract` | `{ name, model, text }` | `{ summary, items: [{ group, section, field, value, existing_value, quote, file }] }` | **yes** |
| `POST /api/finalise` | `{ documents: [{ name, model, text }], accepted: [items] }` | `{ ok, fields, documents }` | no |
| `POST /api/run` | `{ task: { text, triage }, history?, message?, answers?, handoffNote?, doAlternative? }` | `{ headline, body, sources, email, proposals, steps, memory_suggestion, skill_suggestion, next_step }` | **yes** |
| `POST /api/approve` | `{ proposal }` | `{ ok, approvedChanges }` | no |
| `POST /api/memory` | `{ type: 'memory', text }` or `{ type: 'skill', skill }` | `{ ok, memories, skills }` | no |
| `GET /api/state` | none | the session state (handy for debugging) | no |

Anything that isn't an API route is served by `serveStatic()`, which serves **only** `public/` and `assets/`.

---

## 10. Safety and guardrails in the code

| Guardrail | Where |
|---|---|
| The OpenAI key is only on the server; the browser only talks to localhost | `.env` (git-ignored), `API_KEY` in `server.js`, `api()` in `app.js` |
| `.env` and `data/` can't be fetched (path traversal blocked) | `serveStatic()`: resolves the path and checks it's inside `public/` or `assets/` |
| Siesta never sends, moves money or changes records | `SIESTA_RULES` / `RUN_SYSTEM`; emails are `mailto:` drafts; record changes need **Approve** |
| No invented data | `SIESTA_RULES` ("Never invent data"), `needs_upload` instead of guessing, extraction "never infer" |
| Every fact is sourced | `sources` in `RUN_SCHEMA`, `quote` in `EXTRACT_SCHEMA`, `[source: …]` labels from `formatChunks()` |
| A card can't say "cannot" and be green | the colour is set in code from `COLOUR[kind]`, not by the model |
| Model output can't inject HTML | `el()` uses text nodes; `md()` escapes first |
| The UI never spins forever | `AbortSignal.timeout(120_000)` in `askModel()`; errors surface in the chat with **Try again** |

---

## 11. Design decisions

- **Start empty, like a real first login.** Siesta's honesty ("I won't guess") turns into the reason to do the most valuable onboarding step: getting data in.
- **Grounded in the capabilities doc**, sent with every call, so the sorting follows Afternoon's rules rather than the model's own idea of an assistant.
- **The model chooses a *kind*; the code chooses the *colour*.** One decision for the model, one fixed rule in code.
- **Structured outputs everywhere.** The UI just displays fields, and one result schema covers every task type.
- **One chat per task.** A to-do list is many separate jobs, so each gets a focused session (brief, questions, drafts, follow-ups) instead of competing in one cramped chat. The server is stateless per turn; the browser sends the task's history.
- **Questions generated once, asked in context.** All questions come from the single triage call, but appear only when that task is opened.
- **Re-sort after every upload.** This is how tasks turn green, and it also corrects earlier misjudgements.
- **"Task complete → Next task"** keeps momentum, following the adviser's own priority order.
- **Zero dependencies.** Node 22's `http`, `fetch` and `--env-file`; plain browser JS. The prototype reads `.txt` / `.csv`; PDF and Word would need one parsing library.
- **Built to slot in.** A self-contained panel plus a small typed API. In Afternoon, `/api/extract` and `/api/finalise` would be the real extraction pipeline, and `search()` the real client record.

---

## 12. Interview notes

### Why this problem
- Advisers like Afternoon in demos but struggle to fit it into their day. Onboarding that teaches *the tool* competes with their real work.
- This flips it: the adviser's own to-do list *is* the onboarding.
- The biggest real blocker for a new firm is an empty platform. Tying uploads to tasks the adviser actually wants done gives them a reason to upload now, and watching cards turn green is the payoff.
- Red and yellow cards build trust: being honest about limits, with an alternative, beats an assistant that over-promises.

### AI tools I used, and how
- **Claude Code** (Anthropic's coding agent) as a pair programmer. We agreed a plan first: architecture, colour model, data and constraints. It then generated the synthetic data and code, and ran end-to-end browser tests with Playwright after every change. I reviewed and iterated. The tests drove real fixes:
  - "Chase Aviva" marked red led to the prompt fix and to re-sorting red cards;
  - a review pack "missing" values led to always including CSV tables in search;
  - pedantic date questions led to the "pragmatic" rule.
- **OpenAI `gpt-6.1-terra`** at runtime, with strict structured JSON outputs, for sorting, document extraction and each task chat.

### What I'd improve next
- **Real file types:** PDF and Word parsing, OCR for photos, SharePoint, and the real extraction pipeline with the review screen.
- **Real retrieval:** Afternoon's client-record APIs, tool calling so the model chooses what to look up, and embeddings for long documents.
- **Streaming responses** for long tasks; persist the list and the chats across sessions so they become a daily start page.
- **An eval set:** a few hundred real (anonymised) to-do lines with expected kinds, plus citation-accuracy checks, run on every prompt or model change.
- **Learn from corrections:** edited cards, rejected proposals and discarded fields fed back into prompts and evals.

### How I'd measure impact
- **Activation:** % of new advisers who paste a list on day one; % who upload at least one batch in their first session; time to first useful output.
- **Data completeness:** fields on the record after week 1 compared with the current onboarding (the precondition for everything else).
- **Adoption:** weekly active advisers in weeks 1–8 compared with the current cohort; Siesta tasks per adviser per week; **Next task** click-through.
- **Value:** draft acceptance rate (sent with few edits), proposal approval rate, estimated time saved per task type.
- **Trust and quality:** how often advisers edit cards or re-sort, and how often citations are reported wrong.
- **Run it as an A/B test** (new onboarding vs. current) by firm, with a 30-day retention comparison, plus short interviews with advisers who stop using it.
