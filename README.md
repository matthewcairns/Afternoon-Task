# Siesta To-Do Onboarding

A prototype for **Afternoon**: on first login, Siesta asks the adviser to paste their real to-do list and starts doing the work, instead of giving a product tour.

> **The aim:** advisers feel they're getting work done, not learning a new tool.

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

Open http://localhost:3000. Click **Use demo list**, send it, then press **Start working**.

Restarting the server resets the demo. Approvals and memories are kept in memory, and the files in `data/` are never modified.

---

## What it does

1. **Paste**: each line of the to-do list becomes a task card. Bullets and numbers are stripped.
2. **Prioritise**: drag the cards into order. Siesta always works on the highest queued card next, so you can reorder while it works.
3. **Sort**: Siesta colours each card, using `docs/afternoon-capabilities.md` as the source of truth:

   | Colour | Kind | Meaning |
   |---|---|---|
   | 🟢 green | `siesta_now` | Siesta can do it alone (find, prepare, draft, propose) |
   | 🟡 yellow | `needs_answers` | Siesta can do it once you answer its questions |
   | 🟡 yellow | `walkthrough` | You do it in the platform; Siesta walks you through it |
   | 🟡 yellow | `handoff` | You do a first step (e.g. phone the client), then Siesta takes over |
   | 🔴 red | `cannot` | Siesta can't do it: you get the reason and an alternative it *can* do |

4. **Afternoon helps anyway**: every card also says how the platform itself helps, even where the AI can't.
5. **Questions**: all questions are generated at once during sorting, but each is asked only when you click its yellow card.
6. **Start working**: Siesta says which task it's starting with and what you could do meanwhile, then works through the green cards in order.
7. **Only drafts and proposes**: emails are editable drafts that you open in your own mail app and send yourself. Record changes are proposals you **Approve** or **Reject**, and approved changes feed into later tasks.
8. **Handoff**: on "Call Sarah…", you note what you learnt and click *I've done my part*. Siesta then proposes the record updates.
9. **Memory and skills**: after a task, Siesta may suggest saving a fact to company memory or turning repeat work into a skill. Nothing is saved unless you click. Saved memories are used in later prompts.

### Demo list (covers every case)

| Task | Result |
|---|---|
| Prep for the Hendersons' annual review on Thursday | 🟢 review pack and pre-meeting email draft |
| What did we agree about Sarah's pension contributions? | 🟢 exact quote from the transcript, with timestamp |
| Chase Aviva about the Henderson pension transfer | 🟢 chaser draft quoting the case ref; you send it |
| Move £5,000 into Tom Henderson's ISA | 🔴 can't move money; offers an allowance check instead |
| Set up my Outlook calendar so meetings record automatically | 🟡 step-by-step walkthrough |
| Call Sarah to confirm her new employer, then update her record | 🟡 handoff, then record-update proposals |

---

## How it works

```
 Browser: public/ (plain HTML/CSS/JS)          Server: server.js (Node, no deps)            OpenAI
 ┌────────────────────────────────┐           ┌──────────────────────────────────┐        ┌────────┐
 │ screenshot background          │           │ POST /api/triage ─┐              │        │        │
 │ Siesta panel                   │  JSON     │ POST /api/run ────┼─ search() ───┼──────► │ gpt-   │
 │  · cards (drag to reorder)     │ ────────► │                   │  data/ files │ JSON   │ 6.1-   │
 │  · chat                        │           │ POST /api/approve   (session     │ schema │ terra  │
 │  · task detail                 │ ◄──────── │ POST /api/memory     state)      │ ◄──────│        │
 └────────────────────────────────┘           │ OPENAI_API_KEY from .env only    │        └────────┘
                                              └──────────────────────────────────┘
```

| File | What it is |
|---|---|
| `server.js` | Static file server, the 5 API routes, keyword search and OpenAI calls. |
| `public/app.js` | Panel logic. One `tasks` array (in priority order) plus a `refresh()` that redraws everything from it. |
| `public/index.html`, `styles.css` | Panel markup and styling. The screenshot is the page background. |
| `docs/afternoon-capabilities.md` | Source of truth for what Siesta can and can't do; sent with every request. |
| `data/hendersons/*` | Synthetic household: profile, holdings, meeting actions, a 2025 review transcript, Aviva emails, a voicemail note. |
| `data/guide/*` | Placeholder user-guide page for the Outlook walkthrough. It would be replaced by the real guide. |

### Design decisions

- **Grounded in the capabilities doc.** The model sorts tasks against Afternoon's documented rules, not its own idea of what an assistant can do. That's why "Move £5,000" comes back red with the documented reason.
- **The model chooses a *kind*; the code chooses the *colour*.** One decision for the model and one fixed rule in code, so a card can never say "cannot" and still be green.
- **Structured outputs (JSON schema).** Every response has the same shape, so the UI just displays the fields. One result schema covers answers, emails, proposals, steps, sources and suggestions.
- **Simple retrieval.** The structured record (`.json`) is always included. Documents are ranked by keyword overlap. In testing, pure keyword search sometimes dropped the holdings file, so a review pack came back without the mortgage; that's why the structured record is always included. No vector database is needed at this size.
- **Citations.** Every result lists exact quotes plus their file.
- **Human approval everywhere.** Siesta can't send, move money or edit a record. Every change has an Approve button, which is the only place a change happens.
- **The key stays on the server.** The browser only talks to localhost. `.env` is git-ignored. Static serving is limited to `public/` and `assets/`, so `.env` and `data/` can't be fetched.
- **Zero dependencies.** Node 22's built-in `http`, `fetch` and `--env-file` handle everything, so there's no hidden code to explain.
- **Built to slot in.** The panel is self-contained, and the API is a small, typed contract (`triage → run → approve/memory`). In Afternoon, `search()` would call the real client record and `approve` would call the real record-update flow.

---

## Interview notes

### Why this problem
- Advisers like Afternoon in demos but struggle to fit it into their day. Onboarding that teaches *the tool* competes with their real work.
- This flips it: the adviser's own to-do list *is* the onboarding. The first session produces real output (a review pack, a chaser, a record update). It also teaches what Siesta can do, what needs them, and what it can't do, using their own tasks rather than a feature list.
- Red and yellow cards build trust: being honest about limits, with an alternative, beats an assistant that over-promises.

### AI tools I used, and how
- **Claude Code** (Anthropic's coding agent) as a pair programmer. We agreed a plan first: architecture, the colour model, the data and the constraints. It then generated the synthetic data and code, ran an end-to-end browser test with Playwright, and I reviewed and iterated. For example, the test showed the review pack missing the mortgage, which led to the "always include the record" fix.
- **OpenAI `gpt-6.1-terra`** at runtime, with structured JSON outputs, for sorting tasks and doing them.

### What I'd improve next
- **Real retrieval:** call Afternoon's client-record APIs, use tool calling so the model chooses what to look up, and use embeddings for long documents.
- **Streaming responses** so long tasks (review packs) appear progressively.
- **Real integrations:** create Outlook drafts directly in the adviser's mailbox, apply approved changes through Afternoon's conflict-checked update flow, and use real company memory and skills.
- **Learn from corrections:** if an adviser re-colours a card or rejects a proposal, feed that back into the prompt and evals.
- **An eval set:** a few hundred real (anonymised) to-do lines with expected kinds, run against prompt and model changes. Plus checks on citation accuracy.
- **Persistence:** keep the to-do board across sessions, so it becomes the adviser's daily start page rather than a one-off.

### How I'd measure impact
- **Activation:** % of new advisers who paste a list on day one; time to first useful output (first approved draft or record update).
- **Adoption:** weekly active advisers in weeks 1–8 compared with the current onboarding cohort; Siesta tasks per adviser per week; % of sessions that start from the to-do board.
- **Value:** draft acceptance rate (sent with few edits), proposal approval rate, estimated time saved per task type.
- **Trust and quality:** how often advisers disagree with Siesta's sorting, or report a wrong citation.
- **Learning:** whether advisers try new task types over time (do they discover skills, memory, review packs?).
- **Run it as an A/B test** (new onboarding vs. current) by firm, with a 30-day retention comparison, plus short interviews with advisers who stop using it.
