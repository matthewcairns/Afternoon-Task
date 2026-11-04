// =============================================================================
// Siesta To-Do Onboarding — getting client information into Afternoon
// -----------------------------------------------------------------------------
// A first-time adviser's Afternoon is empty, so most of their to-do list is
// yellow ("needs client info"). This file adds a "Start here" card that walks
// them through the platform's own upload flow, step by step, as described in
// data/guide/afternoon-user-guide-adding-client-data.md:
//
//   choose files -> pick an upload model -> Extracting -> Ready -> Process data
//   -> (in the product: review new / updates / conflicts, then Finalise review;
//       the demo accepts everything and just says "Files uploaded")
//
// The extraction is REAL: each file's text goes to /api/extract, where the AI
// reads it. When the adviser clicks Process data, the extracted fields become the client
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
  stage: 'choose', // choose -> extracting -> ready -> processing -> choose
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
    messages: [], // its own chat, like every task
    triage: {
      kind: 'upload',
      colour: 'yellow',
      short_label: 'Start here',
      reason: 'A new Afternoon account starts empty, and most of your list depends on client information. Adding it is what turns those cards green.',
      afternoon_helps: "Afternoon reads the documents you already have with AI and structures the data for you, with a citation for every field. Far less form-filling, and the originals stay in the client's Documents area.",
    },
  });
}

const uploadTask = () => tasks.find((t) => t.id === 'upload');


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
    el('p', { class: 'tip' }, '💡 Tip: batch-upload the fact find plus the key statements (5 files per batch), then top up any gaps manually.')
  );
}

// -----------------------------------------------------------------------------
// The upload widget: one function per stage, so each step is easy to follow
// -----------------------------------------------------------------------------
function renderUploadWidget() {
  if (upload.stage === 'choose') return renderChoose();
  return renderExtracting();
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
    upload.finalised.length > 0 && el('p', { class: 'confirm' }, `✓ Files uploaded: ${upload.finalised.join(', ')}`),
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
      post(uploadTask(), { text: `Afternoon takes ${MAX_FILES} files per upload, so I've left out "${file.name}". Upload it in the next batch.` });
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
    upload.stage === 'ready' && anyReady && el('button', { class: 'btn', onclick: processData }, 'Process data'),
    upload.stage === 'processing' && el('div', { class: 'status-line' }, spinner(), 'Processing data…')
  );
}

// Step 4: Process data. In the product the adviser now reviews every field
// (new information, updates, conflicts, each with a citation) and clicks
// "Finalise review". For the demo we skip that long list: everything found is
// accepted (the "Add everything as new" + "Update all information" shortcut)
// and the adviser just sees "Files uploaded". The citations are still sent to
// the server, so the extraction is real; only the review screen is skipped.
async function processData() {
  upload.stage = 'processing';
  refresh();
  const docs = upload.files.filter((f) => f.extraction);
  const accepted = docs.flatMap((f) => f.extraction.items);
  await api('/api/finalise', { documents: docs.map(({ name, model, text }) => ({ name, model, text })), accepted });
  upload.finalised.push(...docs.map((f) => f.name));
  upload.files = [];
  upload.stage = 'choose';

  // The card stays (more documents can be added later) but turns green.
  const card = uploadTask();
  card.status = 'done';
  card.triage.colour = 'green';
  card.triage.short_label = 'Add more anytime';

  // Keep the message short for the demo, then re-sort the list (app.js).
  card.messages.push({ role: 'siesta', kind: 'note', text: `Files uploaded (${docs.length}).` });
  refresh();
  await resortAfterUpload(card);
}
