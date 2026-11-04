// =============================================================================
// Siesta To-Do Onboarding — getting client information into Afternoon
// -----------------------------------------------------------------------------
// A first-time adviser's Afternoon is empty, so most of their to-do list is
// yellow ("needs client info"). This file adds a "Start here" card that walks
// them through the platform's own upload flow, step by step, as described in
// data/guide/afternoon-user-guide-adding-client-data.md:
//
//   choose files -> pick an upload model -> Extracting -> Ready -> Process data
//   -> review new / updates / conflicts (with citations) -> Finalise review
//
// The extraction is REAL: each file's text goes to /api/extract, where the AI
// reads it. When the adviser finalises, the accepted fields become the client
// record, and app.js sorts the to-do list again, so tasks can turn green.
//
// Uses helpers from app.js (el, api, say, refresh, ...). Both files are plain
// scripts sharing the page's global scope, which keeps things simple.
// =============================================================================

const UPLOAD_MODELS = ['Fact Find', 'Core', 'DARSCO', 'IO Fund Valuation'];
const MAX_FILES = 5; // Afternoon takes up to 5 files per upload

// File types from the capabilities document. The prototype can only READ
// plain text (.txt, .csv) without adding libraries; the other supported
// types are accepted but explained rather than silently failing.
const READABLE = /\.(txt|csv)$/i;
const SUPPORTED = /\.(pdf|docx|txt|png|jpe?g|csv|xlsx?|xlsm|mp3|mp4|wav|aac|flac|ogg|m4a|mov)$/i;

// The current upload batch, and what's already been finalised.
const upload = {
  stage: 'choose', // choose -> extracting -> ready -> review -> choose
  files: [], // { name, text, model, status, note, extraction }
  finalised: [], // names of documents now in Afternoon
};

// Siesta suggests an upload model from the file name, but the adviser picks.
// WHY suggest? Choosing the model is the step new users are most likely to get
// wrong, and a sensible default saves a decision.
function guessModel(name) {
  if (/fact.?find/i.test(name)) return 'Fact Find';
  if (/darsco/i.test(name)) return 'DARSCO';
  if (/valuation/i.test(name)) return 'IO Fund Valuation';
  return 'Core';
}

// Add the "Start here" card to the top of the board the first time any task
// needs client information.
function ensureUploadCard() {
  if (tasks.some((t) => t.id === 'upload')) return;
  if (!tasks.some((t) => t.triage?.kind === 'needs_upload')) return;
  tasks.unshift({
    id: 'upload',
    text: 'Get your client information into Afternoon',
    status: 'needs_you',
    triage: {
      kind: 'upload',
      colour: 'yellow',
      short_label: 'Start here',
      reason: 'A new Afternoon account starts empty, and most of your list depends on client information. Adding it is what turns those cards green.',
      afternoon_helps: "Afternoon reads the documents you already have with AI and structures the data for you, with a citation for every field. Far less form-filling, and the originals stay in the client's Documents area.",
    },
  });
}

const uploadSummary = () => `${upload.finalised.length} document${upload.finalised.length === 1 ? '' : 's'} in Afternoon`;

// -----------------------------------------------------------------------------
// The walkthrough shown when the "Start here" card is opened
// -----------------------------------------------------------------------------
function renderUploadGuide() {
  // Tailor the walkthrough: list what THIS adviser's tasks are waiting for
  // (the AI wrote these during sorting).
  const waiting = tasks.filter((t) => t.triage?.kind === 'needs_upload' && t.status === 'needs_you');
  return el('div', {},
    el('div', { class: 'label' }, 'What your list is waiting for'),
    waiting.length
      ? el('ul', {}, waiting.map((t) => el('li', {}, el('strong', {}, t.triage.needs_upload), ` for "${t.text}"`)))
      : el('p', {}, "Nothing on your list is waiting for client information right now. You can still upload more at any time."),

    el('p', {}, 'There are three ways to add client information. The first is usually quickest:'),

    // Route 1: upload documents and extract the data (interactive).
    el('div', { class: 'route open' },
      el('h4', {}, '1. Upload documents and extract the data'),
      renderUploadWidget()
    ),

    // Routes 2 and 3: explained, because they happen elsewhere in Afternoon.
    el('details', { class: 'route' },
      el('summary', {}, '2. Connected valuation feeds (hands-off, ongoing)'),
      el('ul', {},
        el('li', {}, 'Pension and investment values can flow in automatically from provider feeds: ORIGO (the industry standard) or FINIO.'),
        el('li', {}, 'Data matches to clients by provider reference number and stays up to date in the background, with no uploading.'),
        el('li', {}, "If you're a system administrator, the Company Data page shows which providers are connected and when they last updated.")
      )
    ),
    el('details', { class: 'route' },
      el('summary', {}, '3. Manual entry'),
      el('p', {}, "Use the Create button on the client profile for anything missing. It's useful for gaps after a bulk upload.")
    ),
    el('p', { class: 'tip' }, '💡 Tip: batch-upload the fact find plus the key statements (5 files per batch), use "Add everything as new" / "Update all" when you trust the documents, then top up any gaps manually.')
  );
}

// -----------------------------------------------------------------------------
// The upload widget: one function per stage, so each step is easy to follow
// -----------------------------------------------------------------------------
function renderUploadWidget() {
  if (upload.stage === 'choose') return renderChoose();
  if (upload.stage === 'extracting' || upload.stage === 'ready') return renderExtracting();
  return renderReview();
}

// Steps 1 and 2: choose files and pick each file's upload model.
function renderChoose() {
  const picker = el('input', { type: 'file', multiple: '', hidden: '', onchange: (e) => addFiles(e.target.files) });
  const drop = el('div', { class: 'dropzone' },
    el('p', {}, 'Drag files here, or'),
    el('div', { class: 'actions' },
      el('button', { class: 'btn', onclick: () => picker.click() }, 'Upload from your computer'),
      el('button', { class: 'btn ghost', disabled: '', title: 'Not available in this prototype' }, 'Upload from SharePoint')
    ),
    el('small', {}, `Up to ${MAX_FILES} files at a time. PDFs, Word, text, images, spreadsheets and audio/video are supported in Afternoon (this prototype reads .txt and .csv).`),
    picker
  );
  // Drag-and-drop straight from Finder/Explorer.
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });

  const readable = upload.files.filter((f) => !f.note);
  return el('div', {},
    upload.finalised.length > 0 && el('p', { class: 'confirm' }, `✓ ${uploadSummary()}: ${upload.finalised.join(', ')}`),
    el('div', { class: 'step' }, el('b', {}, 'Step 1'), ' Choose the files'),
    drop,
    upload.files.length > 0 && [
      el('div', { class: 'step' }, el('b', {}, 'Step 2'), ' Pick the upload model for each file so it is read correctly'),
      el('p', { class: 'small' }, 'Fact Find: your existing fact finds · Core: general documents like provider statements · DARSCO: DARSCO-format files · IO Fund Valuation: fund valuation data. I\'ve suggested one for each.'),
      upload.files.map((f) => el('div', { class: 'file-row' },
        el('span', { class: 'file-name' }, f.name),
        f.note
          ? el('small', { class: 'error' }, f.note)
          : el('select', { onchange: (e) => (f.model = e.target.value) }, UPLOAD_MODELS.map((m) => el('option', m === f.model ? { selected: '' } : {}, m))),
        el('button', { class: 'x', title: 'Remove', onclick: () => { upload.files.splice(upload.files.indexOf(f), 1); refresh(); } }, '×')
      )),
      el('button', { class: 'btn', disabled: readable.length ? null : '', onclick: startExtraction }, `Upload ${readable.length} file${readable.length === 1 ? '' : 's'}`),
    ].flat()
  );
}

async function addFiles(fileList) {
  for (const file of fileList) {
    if (upload.files.length >= MAX_FILES) {
      say(el('p', {}, `Afternoon takes ${MAX_FILES} files per upload, so I've left out "${file.name}". Upload it in the next batch.`));
      break;
    }
    const entry = { name: file.name, model: guessModel(file.name), status: 'waiting' };
    if (!SUPPORTED.test(file.name)) entry.note = 'Not a supported file type. Convert it first (e.g. unzip it, or save as PDF).';
    else if (!READABLE.test(file.name)) entry.note = 'Supported in Afternoon, but this prototype only reads .txt and .csv.';
    else entry.text = await file.text();
    upload.files.push(entry);
  }
  refresh();
}

// Step 3: each file goes to the AI. Status shows Extracting, then Ready.
// The files are processed in parallel, as the platform does.
async function startExtraction() {
  upload.files = upload.files.filter((f) => !f.note);
  upload.stage = 'extracting';
  upload.files.forEach((f) => (f.status = 'extracting'));
  refresh();
  await Promise.all(upload.files.map(async (f) => {
    try {
      f.extraction = await api('/api/extract', { name: f.name, model: f.model, text: f.text });
      f.status = 'ready';
    } catch (err) {
      f.status = 'error';
      f.error = err.message;
    }
    refresh();
  }));
  upload.stage = 'ready';
  refresh();
}

function renderExtracting() {
  const chip = (f) => ({
    extracting: el('span', { class: 'chip' }, spinner(), ' Extracting'),
    ready: el('span', { class: 'chip green' }, 'Ready'),
    error: el('span', { class: 'chip red', title: f.error }, 'Failed'),
  }[f.status]);
  const anyReady = upload.files.some((f) => f.status === 'ready');
  return el('div', {},
    el('div', { class: 'step' }, el('b', {}, 'Step 3'), ' Afternoon is reading each file with AI'),
    upload.files.map((f) => el('div', { class: 'file-row' }, el('span', { class: 'file-name' }, f.name), el('small', {}, f.model), chip(f))),
    upload.stage === 'ready' && anyReady && el('button', { class: 'btn', onclick: () => { upload.stage = 'review'; refresh(); } }, 'Process data')
  );
}

// Step 4: review everything found, grouped like the platform: new information,
// updates and conflicts. Every field shows its citation.
const GROUPS = [
  ['new', 'New information', [['Add', 'add'], ['Discard', 'discard']]],
  ['update', 'Updates', [['Update', 'update'], ['Discard', 'discard']]],
  ['conflict', 'Conflicts', [['Use new value', 'update'], ['Keep existing', 'discard']]],
];

const allItems = () => upload.files.filter((f) => f.extraction).flatMap((f) => f.extraction.items);

function renderReview() {
  const items = allItems();
  const accepted = items.filter((i) => i.decision === 'add' || i.decision === 'update');
  const undecided = items.filter((i) => !i.decision).length;
  const setAll = (groups, decision) => { items.filter((i) => groups.includes(i.group)).forEach((i) => (i.decision = decision)); refresh(); };

  return el('div', {},
    el('div', { class: 'step' }, el('b', {}, 'Step 4'), ' Check what was found'),
    upload.files.filter((f) => f.extraction).map((f) => el('p', { class: 'small' }, el('strong', {}, f.name), ': ', f.extraction.summary)),
    // The global buttons are "the real time-saver" when the documents are trusted.
    el('div', { class: 'actions' },
      el('button', { class: 'btn light', onclick: () => setAll(['new'], 'add') }, 'Add everything as new'),
      el('button', { class: 'btn light', onclick: () => setAll(['update', 'conflict'], 'update') }, 'Update all information')
    ),
    GROUPS.map(([group, title, buttons]) => {
      const list = items.filter((i) => i.group === group);
      return list.length > 0 && el('div', { class: `review-group ${group}` },
        el('h4', {}, `${title} (${list.length})`),
        list.map((item) => renderItem(item, buttons))
      );
    }),
    el('div', { class: 'section' },
      el('div', { class: 'step' }, el('b', {}, 'Step 5'), ' Finalise review: accepted fields land on the client profile'),
      undecided > 0 && el('p', { class: 'small' }, `${undecided} item${undecided === 1 ? '' : 's'} not decided yet will be left out.`),
      el('button', { class: 'btn', disabled: accepted.length ? null : '', onclick: () => finaliseUpload(accepted) }, `Finalise review (${accepted.length} field${accepted.length === 1 ? '' : 's'})`)
    )
  );
}

function renderItem(item, buttons) {
  const decided = item.decision && el('span', { class: `chip ${item.decision === 'discard' ? '' : 'green'}` }, { add: 'Added', update: 'Updated', discard: 'Discarded' }[item.decision]);
  return el('div', { class: 'review-item' },
    el('div', { class: 'small' }, item.section),
    el('strong', {}, item.field),
    item.existing_value && el('div', { class: 'old' }, item.existing_value),
    el('div', { class: 'new' }, item.value),
    // Citation: the exact text the value came from, so the adviser can check it.
    el('details', { class: 'cite' }, el('summary', {}, 'Citation'), el('blockquote', {}, `"${item.quote}"`, el('cite', {}, item.file))),
    el('div', { class: 'actions' },
      decided,
      buttons.map(([label, decision]) => el('button', { class: item.decision === decision ? 'btn' : 'btn ghost', onclick: () => { item.decision = decision; refresh(); } }, label))
    )
  );
}

// Step 5: send the reviewed fields to the server, then re-sort the to-do list.
async function finaliseUpload(accepted) {
  const docs = upload.files.filter((f) => f.extraction);
  await api('/api/finalise', { documents: docs.map(({ name, model, text }) => ({ name, model, text })), accepted });
  upload.finalised.push(...docs.map((f) => f.name));
  upload.files = [];
  upload.stage = 'choose';

  // The card stays (more documents can be added later) but turns green.
  const card = tasks.find((t) => t.id === 'upload');
  card.status = 'done';
  card.triage.colour = 'green';
  card.triage.short_label = 'Add more anytime';

  closeDetail();
  say(confirmLine(`Review finalised: ${accepted.length} fields from ${docs.length} document${docs.length === 1 ? '' : 's'} are now on the Hendersons' profile. The originals stay in their Documents area.`));
  refresh();
  await resortAfterUpload();
}
