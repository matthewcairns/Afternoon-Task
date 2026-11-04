# Siesta AI and Afternoon — what they can do, what they can't, and why clients benefit

> Source of truth for the prototype. `server.js` sends this whole file to the model when it
> sorts the adviser's to-do list, so the green / yellow / red decisions are grounded here.

## What Afternoon and Siesta AI are

- Afternoon is a working platform for financial advisers. Every client's records, documents, meetings, valuations and reports live together in one place, organised by client and by family.
- Siesta AI is the assistant built into Afternoon. You meet it in three places:
  - the chat, where you type questions and requests;
  - the suggested actions panel on the right of the client page, offering one-click AI actions such as refining a document;
  - the engine behind the scenes that reads uploaded documents, extracts their data, transcribes meetings and generates documents.
- Siesta AI is the adviser's helper, never the adviser: it finds, checks, calculates, drafts and files — you own every decision and recommendation.

## 1. Everything Siesta AI can do

### Answer questions about a client
- Retrieves any information held on a client or the whole family: personal details, dependants, objectives, health, vulnerabilities, attitude to risk, capacity for loss, estate planning and soft facts.
- Covers everything financial too: pensions, investments and cash, properties, crypto, collectibles, spending accounts, mortgages, loans, protection policies, income, spending, tax and life events.
- Handles households as households: answers across every family member at once, clearly labels whose figure is whose, and gives combined totals when wanted.

### Keep client records in shape
- Proposes new records, edits and deletions — pensions, investments, properties, liabilities, protection, profile details, income and spending — all checked by the system first.
- Handles shared items correctly: a joint mortgage or joint account is one record listing both owners, never a copy per person.
- Reads the follow-up actions agreed in past meetings, and can mark them done, edit, reopen, remove or add actions — or summarise outstanding actions across your entire book.
- Nothing is saved anywhere until you approve it in the chat.

### Work with meetings and recordings
- Reads the transcript of any recorded meeting (full text, speakers labelled, timestamps) and can quote it word for word or search it by keyword.
- Answers questions like "what did we agree about the pension?" using the exact wording from the meeting.
- After a meeting, extracts every fact learned and proposes the profile updates for your approval, in a table.
- Runs a green/amber/red data health check across seven areas of the client record, plus a list of identity and anti-money-laundering (AML) checks received and outstanding.
- Builds a first-meeting agenda around whatever the record is missing, and drafts the welcome email with the agenda attached.
- Prepares annual review packs: this year against last year, each goal rated on track / at risk / off track, each action rated done / in progress / not started, material changes in income, health, family, risk appetite or plans flagged, an interactive goal heatmap, and the pre-meeting email with it attached.

### Read, create and edit documents
- Reads whatever you upload: PDFs, Word and text files, spreadsheets, photos of paperwork (using text recognition), and audio or video recordings (transcribed automatically with speakers labelled).
- Can be pointed at different document styles when extracting data: general documents, fact finds, DARSCO-format files (an industry pension data format) and fund valuations.
- Explores several documents at once — for example pulling the policy numbers, providers and values out of every statement in a batch, with quotes back to the source.
- Triages files ready for a suitability report — sorting them into what needs processing, the advice documents, the fee documents and what to exclude — and can merge the advice documents into one master file, with the fee structure prepared.
- Creates new documents: Word reports and letters, Excel trackers, PowerPoint decks, PDFs, and interactive dashboards with charts — all carrying your firm's branding.
- Edits existing Word documents surgically — the original formatting, styles, tracked changes and comments are preserved — and fills in templates without breaking them.
- Refines anything it has generated when you ask for changes.

### Draft emails and read your correspondence
- Drafts emails in your voice for you to send from your own Outlook — follow-ups, chasers, summaries — with client documents offered as attachments.
- Searches your connected Outlook inbox and sent items: it can recap your correspondence with a client or provider before you act.

### Do the analysis
- Does the maths: arithmetic, tax-year figures, compound growth, projections and percentages — showing its working so you can check it.
- Runs full cashflow models (projecting a client's finances year by year): the earliest affordable retirement age, sustainable spending, extra saving needed, the biggest one-off a plan can absorb — and stress-tests each plan against a market crash, years of low returns or high inflation.
- Screens new prospects from an enquiry form, call transcript or notes: rates advice need, affordability, relationship, engagement and warning signs, produces a one-page fit scorecard PDF with first-meeting questions, and drafts either a first-meeting invite or a polite decline.

### Research, remember and help
- Searches the web for current figures and rules — rates, tax limits, regulation — rather than relying on stale knowledge.
- Answers how-to questions about the Afternoon platform itself, from the official user guide.
- Pulls up your firm's own shared reference documents (policies, templates, guidance) when asked about them.
- Remembers durable facts and preferences you ask it to keep — about you and about clients — and applies them in future conversations.

### Extra powers for system administrators
- Builds and edits the firm's meeting note and meeting agenda templates, through a propose-and-approve flow.
- Captures a repeatable workflow as a reusable custom skill — complete with supporting files — that the whole firm can then trigger by name.

### Guardrails that apply to all of it
- Nothing changes without your approval: record edits, meeting actions and memories are proposed first, and you accept them in the chat.
- It will not invent data: missing information stays missing until someone supplies it.
- Citations come as standard: extracted data and generated notes point back to the exact source text.
- Generated documents can be reviewed and edited in the platform before anyone downloads them.

## 2. Jobs it may be asked to do that it can't

- "Just send that to the client." It can't send anything — it drafts the email or document, and you press send from your own mailbox. It can't call, text or message clients either.
- "Tell them to consolidate their pensions." It doesn't give financial advice. It can present options, run the numbers and draft a report containing your recommendation — but the recommendation, and the responsibility, are yours.
- "Move £5,000 into their ISA." It has no access to money, bank accounts, platforms or providers. It can't place trades, start transfers or set up contributions. The only automatic connections are the read-only ORIGO and FINIO valuation feeds.
- "Chase the provider about that transfer." It can't contact third parties. It can draft the email for you to send.
- "Remind me next week." Nothing happens in the background or between conversations — no reminders, no notifications, no scheduling, no watching accounts for changes. It works only while you're asking it to.
- "Join the meeting and answer the client's questions." The meeting bot records and transcribes (once admitted to the room), but the assistant can't speak in, listen to or take part in a live meeting.
- "Admit the bot for me." It can't press buttons in the platform — connecting calendars, inviting colleagues, admitting the bot, clicking "Process data". It can walk you through every step and diagnose what went wrong, but you do the clicking.
- "Recover yesterday's recording — we never let the bot in." A missed recording cannot be recovered. If the bot isn't admitted into the meeting room, the recording is simply never taken.
- "Update the record — no need to show me." Every change goes through a proposal you approve in the chat, checked by the system first. Nothing is applied silently.
- "Read this ZIP file / this iPhone photo." Only the supported types can be read: documents (PDF, DOCX, TXT), images (PNG, JPG, JPEG), spreadsheets (CSV, XLS, XLSX, XLSM) and recordings (MP3, MP4, WAV, AAC, FLAC, OGG, M4A, MOV). Anything else needs converting first.
- "Edit our suitability report template." Suitability reports follow strict compliant templates; changes to those are handled with the Afternoon team via support@afternoon.co.uk. The template editor covers meeting notes and meeting agendas only.
- "Fill in the gaps — you know what they'd want." It won't guess. Missing data is treated as unavailable: no invented figures, no assumed providers or employers.
- "Sign this off as suitable." It can gather and structure the evidence — citations, data snapshots, ID and AML lists — but responsibility for suitability and compliance stays with you and your firm.
- "Remember everything we said." It only keeps what you ask it to keep. One-off calculations and chats aren't stored unless you approve saving a memory or they land in the client record.
- "Guarantee the extracted data is right." AI extraction and transcription aren't perfect — accents, technical terms and poor audio can trip them. The platform gives you review screens, citations and conflict checks, but the review itself is human work.
- "Create a client record for this prospect." In chat it can't set up or merge client records — that's done in the platform or the Note Taker app — though it can then work with everything stored against them.

## 3. Why Afternoon is useful to clients — even where Siesta AI isn't involved

These benefits come from the platform itself. Several run automatically in the background, and none of them needs anyone to type a request to the assistant.

- One place for their whole financial life. Personal details, family, goals, health, pensions, investments, properties, loans, income and spending are held in one consistent structure — not scattered across emails, spreadsheets and paper.
- The family is planned as a family. Clients sit in family groupings, so couples and dependants are looked at as one household, and joint assets are recorded once with both owners named.
- Values that look after themselves. Pensions and investments update automatically through the ORIGO and FINIO valuation feeds — providers push fund holdings, unit prices, values and dates — matched to each client by reference number, with foreign currency converted automatically.
- Far less form-filling. Clients hand over documents they already have — provider statements, an old fact find, a spreadsheet, even a photo of a letter — and the platform reads and structures the data. The adviser checks every field against a citation to the exact source text before anything is applied.
- Mistakes get caught. When a new document disagrees with what's on file, the platform shows both side by side and asks the adviser to resolve it — so a provider error or an out-of-date figure gets noticed, not quietly absorbed.
- A reliable record of every meeting. Meetings on Microsoft Teams, Google Meet, Zoom, Webex, GoTo Meeting and Slack huddles can be recorded automatically, producing a transcript with every speaker labelled and timed. Recordings from any other device can be uploaded and transcribed too. What was agreed never depends on memory.
- Privacy when it matters. In the mobile app, a recording can be paused while something sensitive is discussed and resumed afterwards — the paused part is never captured. Each adviser's own calendar stays private to them.
- Better-prepared meetings. A pre-meeting pack — a snapshot of the client's current data and recent activity — is produced automatically for client meetings, and agendas are built from the client's own record, so the time together goes on their goals, not on admin.
- Faster advice, properly evidenced. Meeting notes, client information documents and suitability reports that once took hours are generated, checked by the adviser, and delivered as branded Word documents — with a snapshot of exactly which data was used, kept for audit, plus version history for every document.
- Continuity if their adviser is away. Documents, meetings and notes sit on the client's shared record, so a colleague can pick up the full picture at any time.
- A record can start anywhere. The Afternoon Note Taker app (iOS and Android) records in-person meetings — even with no signal — and can create the client record on the spot, uploading when a connection returns.
- It fits around the tools already in use. Google and Microsoft calendars, files from SharePoint, recordings from Teams, Zoom or Google Meet, and uploads from any computer — nobody has to change how they already work.

## In short

- Siesta AI is a powerful back-office assistant: it finds, checks, calculates, drafts, models and files — but it advises nothing, sends nothing and changes nothing without a human approving it.
- Afternoon is the organised, automated home around it: records, valuations, recordings, review workflows and evidence trails that benefit the client whether or not the assistant is ever asked for anything.
- Both depend on data quality. The platform's own guidance is to hold the smallest high-quality, complete set of data needed for advice — and to review anything extracted from a document before applying it.

Questions or problems the platform can't resolve: support@afternoon.co.uk
