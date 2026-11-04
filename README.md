# Siesta To-Do Onboarding

A prototype for **Afternoon**: on first login, Siesta asks the adviser to paste their real to-do list and starts doing the work, instead of giving a product tour.

> **The aim:** advisers feel they're getting work done, not learning a new tool.

A brand-new Afternoon account has **no client data**, so Siesta is honest about it. Every task starts yellow or red, and Siesta walks the adviser through uploading their existing documents. As the client record fills up, tasks **turn green** and Siesta gets on with them.

All client data is **fictional and synthetic** (the Henderson household).

---

## Run it

Needs Node 22 or later. There are no npm packages to install.

```bash
cp .env.example .env
```

Put your OpenAI key in `.env`, then:

```bash
npm start
```

Open http://localhost:3000. **Every page load is a fresh first login**: the session resets and the welcome pop-up appears.

### Demo script

1. **Welcome pop-up:** paste the to-do list (bulleted lists copied from Word work), then click **Get Started**. **Skip** closes it to explore.
2. **To-Do List tab** (it replaces the panel's History tab): the list opens at full height and gets sorted. Every card is yellow or red, because nothing is in Afternoon yet. A **Start here** card appears at the top: *Get your client information into Afternoon*.
3. **Fix the list:** drag to reorder, ✎ to edit a card (it gets sorted again), × to delete, **+ Add task** for anything missed.
4. **Each task is its own chat with Siesta.** Open a card: the first message is the task's brief (why it's that colour, how Afternoon helps anyway, and the questions or actions needed), and below it you talk to Siesta about just that task.
5. **Upload:** open *Start here*. It lists what each task is waiting for, then walks through the platform's steps. Use the files in **`demo-uploads/`**.
   - **Batch 1 (5 files):** fact find, valuations CSV, 2025 review transcript, actions CSV, Aviva emails. Upload, **Process data**, **Add everything as new**, **Finalise review**.
   - Siesta sorts the list again, and three tasks turn 🟢: review prep, the pension question and the Aviva chaser.
   - **Batch 2 (optional):** `sarah-voicemail-file-note-2026-10-28.txt` shows a **conflict**: the record says Northgate, but the voicemail says she's left.
6. **Start working** (top of the list): Siesta does the green tasks top-down in the background, producing a review pack, a cited answer and a chaser draft. The Conversation tab pings you as each one finishes.
7. **Follow up in a task's chat**, e.g. open the Aviva chaser and type "Make it shorter and copy in Sarah". Siesta returns a revised draft with Sarah in Cc.
8. **Yellow and red:** "Call Sarah" is a handoff: type what Sarah said into its chat, then approve the proposed updates. "Outlook" gets a walkthrough. The ISA task can't be done, so it offers an allowance check instead.
9. **Memory and skills:** suggestions appear in the task chat they came from; save them with one click.

---

## What it does

| Colour | Kind | Meaning |
|---|---|---|
| 🟢 green | `siesta_now` | Siesta can do it alone (find, prepare, draft, propose) |
| 🟡 yellow | `needs_upload` | Siesta could do it, but the client information isn't in Afternoon yet |
| 🟡 yellow | `needs_answers` | The information is there, but Siesta needs a decision or fact from you |
| 🟡 yellow | `walkthrough` | You do it in the platform; Siesta walks you through it |
| 🟡 yellow | `handoff` | You do a first step (e.g. phone the client), then Siesta takes over |
| 🔴 red | `cannot` | Siesta can't do it: you get the reason and an alternative it *can* do |

- **Three tabs:** *Conversation* (Siesta's general chat and progress pings), *To-Do List* (the full list, with a badge counting tasks waiting for you), and inside it **one chat session per task**.
- **Every task's brief also says how Afternoon helps anyway**, even where the AI can't.
- **Questions** are generated at once during sorting, but each is only asked when you open its task. Answer in the boxes or just reply in the chat.
- **Follow-ups:** every turn sends that task's history, so you can ask for changes ("shorter", "add Tom") and get a complete revised draft.
- **Getting data in** follows Afternoon's own flow (`data/guide/afternoon-user-guide-adding-client-data.md`):
  - choose up to 5 files and pick an upload model for each (Fact Find, Core, DARSCO, IO Fund Valuation; Siesta suggests one);
  - each file goes from *Extracting* to *Ready*, then **Process data**;
  - review the findings as new information, updates and conflicts, each with a citation;
  - use the global buttons or decide item by item, then **Finalise review**.
  - The other two routes (valuation feeds, manual entry) are explained.
- **Extraction is real.** Each file's text goes to the AI with the chosen upload model. Accepted fields become the client record, and the documents become searchable for later tasks.
- **Only drafts and proposes.** Emails are editable drafts that you open in your own mail app and send yourself. Record changes need **Approve**.
- **Memory and skills:** suggested after tasks, and saved only on click. Saved memories feed later prompts.

---

## How it works

```
 Browser: public/ (plain HTML/CSS/JS)          Server: server.js (Node, no deps)            OpenAI
 ┌────────────────────────────────┐           ┌──────────────────────────────────┐        ┌────────┐
 │ welcome pop-up                 │           │ POST /api/reset                  │        │        │
 │ Siesta panel                   │  JSON     │ POST /api/triage  ─┐             │        │        │
 │  · cards (drag, edit)          │ ────────► │ POST /api/extract ─┼── prompts ──┼──────► │ gpt-   │
 │  · chat                        │           │ POST /api/run     ─┘  + search() │ JSON   │ 6.1-   │
 │  · task detail / upload flow   │ ◄──────── │ POST /api/finalise  (session:    │ schema │ terra  │
 └────────────────────────────────┘           │ POST /api/approve    record,     │ ◄──────│        │
                                              │ POST /api/memory     documents)  │        └────────┘
                                              │ OPENAI_API_KEY from .env only    │
                                              └──────────────────────────────────┘
```

| File | What it is |
|---|---|
| `server.js` | Static files, API routes, session state (record, documents), keyword search, OpenAI calls. |
| `public/app.js` | Welcome pop-up, tabs, list parsing, the To-Do List (drag/edit), the work queue and each task's chat. One `tasks` array in priority order (each task holds its own `messages`), and a `refresh()` that redraws from it. |
| `public/upload.js` | The *Start here* card: the walkthrough and the upload, extract, review and finalise steps. |
| `public/index.html`, `styles.css` | Markup and styling. The screenshot is the page background. |
| `docs/afternoon-capabilities.md` | Source of truth for what Siesta can and can't do; sent with every request. |
| `data/guide/*` | Platform user-guide pages (always available). The adding-client-data page is from Afternoon's guidance; the calendar page is a placeholder. |
| `demo-uploads/*` | The adviser's existing files to upload (synthetic): fact find, valuations, transcript, actions, Aviva emails, voicemail note. |

### Design decisions

- **Start empty, like a real first login.** The client data isn't preloaded: it only exists once uploaded and finalised. Siesta's honesty ("I won't guess") turns into a reason to do the most valuable onboarding step, which is getting data in.
- **Grounded in the capabilities doc.** The model sorts tasks against Afternoon's documented rules, not its own idea of what an assistant can do.
- **The model chooses a *kind*; the code chooses the *colour*.** One decision for the model and one fixed rule in code, so a card can't say "cannot" and still be green.
- **Structured outputs (JSON schema)** for sorting, extraction and task results, so the UI just displays the fields.
- **One chat per task.** A to-do list is many separate jobs, so each one gets its own focused session (brief, questions, drafts, follow-ups), instead of everything competing in one cramped chat. The server stays stateless per turn: the browser sends that task's history with each message.
- **Re-sort after every upload.** Each finalised batch re-checks every open card. That's how tasks turn green, and it also corrects earlier misjudgements.
- **Citations everywhere.** Extracted fields and task results quote the exact source text plus its file.
- **Human approval everywhere.** Extracted fields need Add/Update, record changes need Approve, and emails are only drafts.
- **Simple retrieval.** Structured tables (CSV) are always included, and text documents are ranked by keyword overlap. No vector database is needed at this size.
- **The key stays on the server.** The browser only talks to localhost, `.env` is git-ignored, and static serving is limited to `public/` and `assets/`.
- **Zero dependencies.** Node 22's built-in `http`, `fetch` and `--env-file`. The prototype reads `.txt`/`.csv`; PDF and Word would need one parsing library, and other supported types are accepted and explained.
- **Built to slot in.** The panel is self-contained, and the API is small and typed. In Afternoon, `/api/extract` and `/api/finalise` would be the real extraction pipeline, and `search()` the real client record.

---

## Interview notes

### Why this problem
- Advisers like Afternoon in demos but struggle to fit it into their day. Onboarding that teaches *the tool* competes with their real work.
- This flips it: the adviser's own to-do list *is* the onboarding. It shows what Siesta can do, what needs them, and what it can't do, using their own tasks.
- The biggest real blocker for a new firm is an empty platform. Tying uploads to tasks the adviser actually wants done gives them a reason to upload now, and watching cards turn green is the payoff.
- Red and yellow cards build trust: being honest about limits, with an alternative, beats an assistant that over-promises.

### AI tools I used, and how
- **Claude Code** (Anthropic's coding agent) as a pair programmer. We agreed a plan first: architecture, colour model, data and constraints. It then generated the synthetic data and code, and ran end-to-end browser tests with Playwright after every change. I reviewed and iterated. For example, the tests showed "Chase Aviva" being marked red ("can't contact third parties"), which led to a prompt fix (drafting a chaser *is* possible) and to re-sorting red cards after uploads.
- **OpenAI `gpt-6.1-terra`** at runtime, with structured JSON outputs, for sorting, document extraction and doing tasks.

### What I'd improve next
- **Real file types:** PDF and Word parsing, OCR for photos, and connecting to the real extraction pipeline and SharePoint.
- **Smarter extraction review:** dedupe fields across files in one batch, and show conflicts within a batch.
- **Real retrieval:** Afternoon's client-record APIs, tool calling so the model chooses what to look up, and embeddings for long documents.
- **Streaming responses** for long tasks; persist the board across sessions so it becomes a daily start page.
- **An eval set:** a few hundred real (anonymised) to-do lines with expected kinds, plus citation-accuracy checks, run on every prompt or model change.
- **Learn from corrections:** if an adviser edits a card, rejects a proposal or discards extracted fields, feed that back into prompts and evals.

### How I'd measure impact
- **Activation:** % of new advisers who paste a list on day one; % who upload at least one batch in their first session; time to first useful output.
- **Data completeness:** fields on the record after week 1 compared with the current onboarding (the real precondition for everything else).
- **Adoption:** weekly active advisers in weeks 1–8 compared with the current cohort; Siesta tasks per adviser per week.
- **Value:** draft acceptance rate (sent with few edits), proposal and extracted-field acceptance rates, estimated time saved per task type.
- **Trust and quality:** how often advisers re-sort or edit Siesta's sorting, and how often citations are reported wrong.
- **Run it as an A/B test** (new onboarding vs. current) by firm, with a 30-day retention comparison, plus short interviews with advisers who stop using it.
