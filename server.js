// =============================================================================
// Siesta To-Do Onboarding — server
// -----------------------------------------------------------------------------
// One file, zero npm dependencies. Run with:   node --env-file=.env server.js
//
// WHY no dependencies? I need to be able to explain every line, and the
// prototype should "just run" on a laptop. Node 22 ships everything needed:
//   - `http`   for the web server (no Express)
//   - `fetch`  for calling OpenAI (no SDK)
//   - `--env-file` for reading .env (no dotenv)
//
// WHAT the server does:
//   1. Serves the static front end (public/) and the screenshot (assets/).
//   2. Exposes a small JSON API that the Siesta panel calls. It is shaped like
//      something that could sit behind a real Afternoon panel:
//        POST /api/triage   to-do lines        -> green / yellow / red cards
//        POST /api/run      one task (+inputs) -> drafts, answers, proposals
//        POST /api/approve  adviser approves a proposed record change
//        POST /api/memory   adviser saves a suggested memory or skill
//        GET  /api/state    what has been approved / saved this session
//   3. Keeps the OpenAI key here, on the server. The browser never sees it.
// =============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.OPENAI_MODEL || 'gpt-6.1-terra';
const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  // Fail loudly at start-up rather than with a confusing error mid-demo.
  console.error('Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

// -----------------------------------------------------------------------------
// 1. Knowledge the AI is grounded in
// -----------------------------------------------------------------------------

// The capabilities document is the SOURCE OF TRUTH for what Siesta can and
// can't do. We send it, word for word, with every request. That way the sorting
// isn't the model's own opinion of what an assistant can do: it follows
// Afternoon's documented rules (e.g. "can't move money", "can't send emails").
const CAPABILITIES = fs.readFileSync(path.join(ROOT, 'docs/afternoon-capabilities.md'), 'utf8');

// The synthetic client files Siesta can "search": the Henderson household plus
// a placeholder user-guide page. We load them once at start-up and split them
// into small chunks so we can send only the relevant bits to the model, with
// the file name attached so answers can cite their source.
const DATA_DIR = path.join(ROOT, 'data');

function loadChunks() {
  const chunks = [];
  for (const rel of listFiles(DATA_DIR)) {
    const text = fs.readFileSync(path.join(DATA_DIR, rel), 'utf8');
    // JSON files are small, structured records: keep each one whole so the
    // model sees complete objects (e.g. a full pension entry).
    // Text files (transcripts, emails, notes) are split on blank lines. A
    // transcript line like "[00:13:55] Matthew: ..." becomes its own chunk,
    // which gives us exact, quotable sources.
    const pieces = rel.endsWith('.json') ? [text] : text.split(/\n\s*\n/);
    // The first paragraph of a text file is its header (meeting title, date,
    // attendees). We prepend it to each chunk so a lone transcript line still
    // tells the model WHICH meeting it came from.
    const header = rel.endsWith('.json') ? '' : pieces[0].trim();
    pieces.forEach((p, i) => {
      if (!p.trim()) return;
      const body = i === 0 || !header ? p.trim() : `(${firstLine(header)})\n${p.trim()}`;
      chunks.push({ file: rel, text: body, terms: termSet(body + ' ' + rel) });
    });
  }
  return chunks;
}

function listFiles(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? listFiles(path.join(dir, d.name), path.join(prefix, d.name)) : [path.join(prefix, d.name)]
  );
}

const firstLine = (s) => s.split('\n')[0];

// --- A deliberately simple search ---------------------------------------------
// WHY not embeddings / a vector database? With a handful of files, keyword
// overlap is good enough, has no extra moving parts, and is easy to explain.
// (In the real product this would be Afternoon's own retrieval over the
// client record; see "what I'd improve" in the README.)
const STOP = new Set(
  'the a an and or of to for in on at is are was were be by with about from that this it my me we our their them her his what did do does last next then up into as can'.split(' ')
);

// Turn text into a set of crude "stems": lower-case words, stop words removed,
// cut to 6 letters so "contributions" and "contribution" match, as do
// "Hendersons" and "Henderson".
function termSet(text) {
  const words = text.toLowerCase().match(/[a-z0-9£]+/g) || [];
  return new Set(words.filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 6)));
}

// The structured client record (the .json files: profile, holdings, actions)
// is small and relevant to almost every task, so it is ALWAYS included.
// WHY? In testing, keyword search sometimes ranked the holdings file below
// transcript lines, so a review pack came back "missing" the mortgage. The
// record is the client's core data, and search is for the documents around it.
function search(query, k = 10) {
  const q = termSet(query);
  const records = CHUNKS.filter((c) => c.file.endsWith('.json'));
  const documents = CHUNKS.filter((c) => !c.file.endsWith('.json'))
    .map((c) => ({ c, score: [...q].filter((t) => c.terms.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.c);
  return [...records, ...documents];
}

// Format search hits for the prompt, labelled with their file so the model can
// cite them, e.g.  [source: hendersons/meeting-actions.json]
const formatChunks = (chunks) =>
  chunks.map((c) => `[source: ${c.file}]\n${c.text}`).join('\n\n---\n\n') || '(no matching client files)';

const CHUNKS = loadChunks();

// -----------------------------------------------------------------------------
// 2. Session state (in memory on purpose)
// -----------------------------------------------------------------------------
// WHY in memory? It's a demo: restarting the server resets everything, and the
// synthetic files on disk are never modified. In Afternoon these would be the
// real client record, firm memory and skills store.
const state = {
  approvedChanges: [], // record updates the adviser approved
  memories: [], // firm/client memories the adviser chose to save
  skills: [], // repeatable workflows saved as skills
};

// Approved changes and saved memories are fed back into later prompts, so the
// adviser can see that approving or remembering something changes later work.
function sessionContext() {
  const changes = state.approvedChanges.map((c) => `- ${c.member}: ${c.field} changed from "${c.current_value}" to "${c.proposed_value}" (approved by adviser)`);
  const mems = state.memories.map((m) => `- ${m}`);
  return [
    'Record changes approved by the adviser this session (these OVERRIDE the client files):',
    changes.join('\n') || '- none',
    '',
    'Saved firm memory (apply these preferences):',
    mems.join('\n') || '- none',
  ].join('\n');
}

// -----------------------------------------------------------------------------
// 3. Calling OpenAI
// -----------------------------------------------------------------------------
// We use Chat Completions with "structured outputs": we give a JSON schema and
// the model MUST reply in exactly that shape. WHY? The front end can then just
// display the fields: no parsing prose, no "the model forgot the reason".
async function askModel({ system, user, schemaName, schema }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
    }),
    signal: AbortSignal.timeout(120_000), // never leave the UI spinning forever
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `OpenAI error ${res.status}`);
  return JSON.parse(data.choices[0].message.content);
}

// Small helpers so the schemas below stay readable. Strict mode requires every
// object to list all its keys as required and forbid extra ones.
const str = (description) => ({ type: 'string', description });
const obj = (properties) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const arr = (items, description) => ({ type: 'array', items, description });

// Siesta's persona and rules, shared by every request.
const SIESTA_RULES = `You are Siesta, the AI assistant built into Afternoon, a platform for UK financial advisers.
You are the adviser's helper, never the adviser. Hard rules (from the capabilities document):
- You only draft and propose. You never send, move money, contact anyone or change a record yourself.
- Never invent data. If something isn't in the client files, say it's missing.
- Use British English and £. Be brief, warm and practical. Today is ${new Date().toDateString()}.
- Be pragmatic, not pedantic: read relative dates ("1 Nov", "Thursday") against today's date and use normal UK conventions (salaries are annual). Only flag gaps that actually matter.
- The client data is fictional and synthetic (the Henderson household).`;

// -----------------------------------------------------------------------------
// 4. /api/triage — sort the to-do list into green / yellow / red
// -----------------------------------------------------------------------------
// The model picks a KIND for each task. The COLOUR is then worked out here in
// code from the kind. WHY? If the model chose both, it could contradict itself
// (e.g. "cannot" but green). One decision by the model, one fixed rule in code.
const KINDS = ['siesta_now', 'needs_answers', 'walkthrough', 'handoff', 'cannot'];
const COLOUR = {
  siesta_now: 'green', // Siesta can do it alone
  needs_answers: 'yellow', // Siesta can do it once you answer a question
  walkthrough: 'yellow', // you do it, Afternoon/Siesta walks you through
  handoff: 'yellow', // you do a first step, then Siesta takes over
  cannot: 'red', // Siesta can't do it (reason + alternative)
};

const TRIAGE_SCHEMA = obj({
  tasks: arr(
    obj({
      id: str('The task id exactly as given'),
      kind: { type: 'string', enum: KINDS },
      short_label: str('2-5 words for the card, e.g. "Siesta drafts, you send" or "Siesta can\'t move money"'),
      reason: str('One sentence: why this kind, grounded in the capabilities document'),
      siesta_part: str('One sentence: what Siesta WILL do for this task, in the future tense. Do not do the task or give the answer yet. ("" if nothing)'),
      your_part: str('One sentence: what the adviser must do themselves ("" if nothing)'),
      questions: arr(str('A short question'), 'Only for needs_answers: 1-3 questions whose answers are NOT in the client files. Otherwise []'),
      alternative: str('Only for cannot: a concrete thing Siesta CAN do instead. Otherwise ""'),
      afternoon_helps: str('One sentence: how the Afternoon platform itself helps with this task even without the AI (use section 3 of the document), specific to this task'),
    })
  ),
  meanwhile: str('One or two sentences: while Siesta works on the green tasks, what should the adviser do themselves? Name the specific tasks only they can move forward.'),
});

const TRIAGE_SYSTEM = `${SIESTA_RULES}

The adviser has just opened Afternoon for the first time. Instead of a product tour, they pasted their real to-do list.
Sort EACH task into exactly one kind, using the capabilities document as the only source of truth:
- siesta_now: you can complete it alone right now (find information, prepare packs, draft emails, propose updates). Drafting an email the adviser then sends themselves is siesta_now; say they press send.
- needs_answers: you could do it, but you need information that is NOT in the client files and that you must not guess. Ask the fewest questions possible.
- walkthrough: the adviser must do it themselves in the platform (clicking buttons, connecting integrations); you can walk them through it step by step.
- handoff: the adviser must do a first step you cannot (e.g. phone the client); once they tell you the outcome, you take over (e.g. propose the record update).
- cannot: you cannot do it at all. Give the documented reason and a useful alternative you CAN do.
Check the client file excerpts before asking a question. Never ask for something that is already there.`;

async function triage({ tasks }) {
  const taskList = tasks.map((t) => `${t.id}: ${t.text}`).join('\n');
  // Search once per task and merge, so every task gets its relevant context.
  const hits = [...new Set(tasks.flatMap((t) => search(t.text, 6)))];
  const result = await askModel({
    system: TRIAGE_SYSTEM,
    schemaName: 'triage',
    schema: TRIAGE_SCHEMA,
    user: `TO-DO LIST (in the adviser's priority order):\n${taskList}\n\n${sessionContext()}\n\nCLIENT FILE EXCERPTS:\n${formatChunks(hits)}\n\nCAPABILITIES DOCUMENT:\n${CAPABILITIES}`,
  });
  // Attach the colour in code (see COLOUR above).
  result.tasks.forEach((t) => (t.colour = COLOUR[t.kind]));
  return result;
}

// -----------------------------------------------------------------------------
// 5. /api/run — do one task
// -----------------------------------------------------------------------------
// One schema covers every kind of output. Fields that don't apply come back
// empty, and the UI only shows what's filled in. WHY one schema? One endpoint,
// one renderer, much less code to explain.
const RUN_SCHEMA = obj({
  headline: str('One short line summarising the result'),
  body: str('The main result. Plain text; you may use "## " headings, "- " bullets and **bold**. Keep it scannable.'),
  sources: arr(obj({ file: str('File path exactly as in [source: ...]'), quote: str('Short exact quote from that file') }), 'Citations backing the result'),
  email: {
    anyOf: [obj({ to: str('Recipient address from the files, or "" if unknown'), subject: str(''), body: str('Email body, signed off as Matthew') }), { type: 'null' }],
    description: 'An email DRAFT for the adviser to send themselves, or null',
  },
  proposals: arr(
    obj({ member: str('Whose record, e.g. Sarah Henderson'), field: str('e.g. Employer'), current_value: str(''), proposed_value: str(''), source: str('Where the new value came from') }),
    'Proposed record changes for the adviser to approve. [] if none'
  ),
  steps: arr(str('One step'), 'For walkthroughs: numbered steps the adviser follows. Otherwise []'),
  memory_suggestion: str('A durable fact or preference worth saving to company memory, learnt from this task, or "" if none'),
  skill_suggestion: {
    anyOf: [obj({ name: str('Short skill name'), description: str('What the reusable skill would do') }), { type: 'null' }],
    description: 'If this is repeat work, a skill the firm could reuse. Otherwise null',
  },
  next_step: str('One sentence: what the adviser should do next (e.g. review and press send)'),
});

const RUN_SYSTEM = `${SIESTA_RULES}

You are now doing ONE task from the adviser's to-do list. Use only the client file excerpts, the session context and the capabilities document.
- Back facts with sources: quote the exact words from the excerpts, with the file path.
- Emails are drafts only; the adviser sends them from their own Outlook.
- Record changes are proposals only; the adviser approves them.
- For a walkthrough, give clear numbered steps from the user guide excerpt and remind them you can't click for them.
- If asked to do the alternative to something you can't do, do that alternative and briefly say why the original isn't possible.
- Look for things worth keeping. Suggest a memory when the task reveals a durable fact or preference that would help next time (e.g. a provider's usual turnaround, how a client prefers to be contacted, the firm's chasing rule). Suggest a skill when the task is work an adviser repeats across clients (e.g. annual review prep, provider chasers, post-call record updates). Leave them empty only for genuine one-offs.`;

async function runTask({ task, answers, handoffNote, doAlternative }) {
  const t = task.triage;
  // Everything the adviser supplied goes into both the search query and the
  // prompt, so their answers shape what we look up as well as what we write.
  const extra = [
    answers?.length ? `The adviser answered your questions:\n${answers.map((a) => `Q: ${a.q}\nA: ${a.a}`).join('\n')}` : '',
    handoffNote ? `The adviser has done their part and reports: "${handoffNote}". Now do your part.` : '',
    doAlternative ? `You can't do this task as written. Do the alternative instead: ${t.alternative}` : '',
  ].filter(Boolean).join('\n\n');

  const hits = search(`${task.text} ${extra}`);
  return askModel({
    system: RUN_SYSTEM,
    schemaName: 'task_result',
    schema: RUN_SCHEMA,
    user: `TASK: ${task.text}\nHOW YOU SORTED IT: ${t.kind}. ${t.reason}\nYOUR PART: ${t.siesta_part}\n\n${extra}\n\n${sessionContext()}\n\nCLIENT FILE EXCERPTS:\n${formatChunks(hits)}\n\nCAPABILITIES DOCUMENT:\n${CAPABILITIES}`,
  });
}

// -----------------------------------------------------------------------------
// 6. HTTP server: static files + JSON routes
// -----------------------------------------------------------------------------
const ROUTES = {
  'POST /api/triage': (body) => triage(body),
  'POST /api/run': (body) => runTask(body),
  // Approving only records the change in session state. WHY? Nothing in
  // Afternoon should change without a human saying yes, and this is the one
  // place that "yes" lands. Later prompts then treat it as the new truth.
  'POST /api/approve': (body) => {
    state.approvedChanges.push(body.proposal);
    return { ok: true, approvedChanges: state.approvedChanges };
  },
  'POST /api/memory': (body) => {
    if (body.type === 'skill') state.skills.push(body.skill);
    else state.memories.push(body.text);
    return { ok: true, memories: state.memories, skills: state.skills };
  },
  'GET /api/state': () => state,
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serveStatic(req, res) {
  // Only two folders are public: the front end and the screenshot. Resolving
  // the path and checking its prefix blocks "../" tricks that would otherwise
  // let a browser read .env or the data files directly.
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const base = url.startsWith('/assets/') ? ROOT : path.join(ROOT, 'public');
  const file = path.resolve(base, '.' + (url === '/' ? '/index.html' : url));
  const allowed = [path.join(ROOT, 'public'), path.join(ROOT, 'assets')].some((dir) => file.startsWith(dir + path.sep));
  if (!allowed || !fs.existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

http
  .createServer(async (req, res) => {
    const route = ROUTES[`${req.method} ${req.url.split('?')[0]}`];
    if (!route) return serveStatic(req, res);
    try {
      // Read the JSON request body (small, so collecting it in one go is fine).
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const result = await route(raw ? JSON.parse(raw) : {});
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    } catch (err) {
      // Send the error to the panel so Siesta can say what went wrong instead
      // of failing silently.
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: err.message }));
    }
  })
  .listen(PORT, () => {
    console.log(`Siesta To-Do Onboarding running at http://localhost:${PORT}`);
    console.log(`Model: ${MODEL} · ${CHUNKS.length} searchable chunks loaded from data/`);
  });
