# PLASU Project Management System

A project supervision and research-support platform for **Plateau State University, Bokkos**. It covers undergraduate and postgraduate projects.

- **Frontend:** React 18, Vite and React Router (`client/`)
- **Backend:** Node.js 22, Express 5 and SQLite through the built-in `node:sqlite` module, so no native build is needed (`server/`)

## Quick start

Requires **Node.js 22.13 or newer**.

```bash
npm run install:all      # install server + client dependencies

# Development (two terminals)
npm run dev:server       # API on http://localhost:4000 (auto-seeds an empty DB)
npm run dev:client       # UI on http://localhost:5173 (proxies /api to :4000)

# Production (single process)
npm start                # builds the client, then serves UI + API on http://localhost:4000
```

`npm run reset-db` deletes the SQLite database. A fresh copy with sample data is seeded on the next server start.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Super Admin | superadmin@plasu.edu.ng | Admin@123 |
| System Admin | sysadmin@plasu.edu.ng | Password@123 |
| Dean (FNAS) | dean.fnas@plasu.edu.ng | Password@123 |
| HOD (Computer Science) | hod.csc@plasu.edu.ng | Password@123 |
| Lecturer | d.bulus@plasu.edu.ng | Password@123 |
| UG student | amina.musa@student.plasu.edu.ng | Password@123 |
| PG student | ibrahim.yusuf@student.plasu.edu.ng | Password@123 |

**Before deploying:** change these passwords and set `JWT_SECRET` in the server environment.

## Roles and what they can do

| Role | Capabilities |
|---|---|
| **Super Admin** | Everything a System Admin can do, plus: create, edit, deactivate and reactivate other admins (System Admins, Deans, HODs). |
| **System Admin** | Manage users, faculties, departments and programmes; appoint deans and HODs; turn platform modules on or off; set session and integrity thresholds; view the full activity log and aggregates. |
| **Dean** | See every department and project in the faculty; print and export reports (progress, supervisor workload, at-risk students, stage distribution); schedule defenses; publish faculty templates and announcements. |
| **HOD** | Approve or reject registration requests (students and staff) for the department; allocate supervisors manually or with ⚡ auto-allocate (balances workload and matches research interests); schedule defenses; send department announcements. |
| **Lecturer** | See allocated students; approve, refine or reject topics; review chapter submissions with similarity and AI scores; request corrections or approve; chat with students; co-author manuscripts. |
| **Student** | Self-register (HOD approves); propose up to 3 topics; draft in the Writing Studio; run integrity checks; submit chapters; track progress; download templates; manage references; chat with the supervisor. |

## Feature map

- **Onboarding:** self-registration for students (matric number, programme; UG or PG is taken from the programme) and staff (staff ID, research interests). Requests stay pending until the HOD approves them.
- **Project workflow:**
  - UG stages: Topic → Chapters 1–5 → Final draft → Defense → Completed.
  - PG stages add Proposal, Proposal defense, Post-field seminar and Viva.
  - Approving a chapter moves the project to the next stage.
  - Requesting corrections sets the status to *Make corrections*.
  - Every action is recorded on the project timeline and notifies the people involved.
- **Inline review:** when reviewing a submission, a supervisor can:
  - Select text and pick a coloured highlighter to comment on it. Each colour is a category: 🟥 Error (must correct), 🟨 General, 🟦 Clarify/expand, 🟧 Citation needed, 🟪 Grammar & style, 🟩 Good work.
  - Switch on **Edit text** to correct wording directly. Edits are saved as a separate reviewed copy, so the student's original is never changed.
  - Use the **Track changes** view to see inserted and deleted words against the original.
  - Request corrections using inline comments alone, without writing overall feedback.

  The student can then:
  - Reply to comments and mark them resolved (resolved highlights fade).
  - Filter comments by status or colour.
  - Open the reviewed text in the Writing Studio, either as a clean copy (supervisor edits kept, highlights removed) or with the highlights.

  Comments are withdrawn rather than deleted, so they stay on record.
- **Writing Studio:** a rich-text word processor with:
  - Paragraph styles, fonts, sizes, colours and highlight
  - Alignment, line spacing, lists and indentation
  - Tables with captions, images and figures, links, symbols, page breaks
  - Find and replace, word count, outline, autosave, print to PDF, and `.docx` import
- **Automated formatting:** auto-numbered headings (1.1, 1.1.1), capitalised chapter titles, justified text, consistent spacing, and chapter or article skeletons.
- **Word export:** produces `.docx` using PLASU presets (Times New Roman 12 pt, double spacing, 1.5″ binding margin, page numbers). It can optionally add:
  - Generated preliminary pages: title page with logo, declaration, certification, dedication, acknowledgements, abstract
  - A table of contents
- **Plagiarism checker:** compares 5-word shingles against every submission, draft and manuscript stored in the institutional repository. It reports matched sources and highlights the matching passages.
- **AI-writing checker:** a heuristic indicator based on sentence-length burstiness, typical AI phrasing, contractions and vocabulary diversity. It also gives a readability score. It is labelled as indicative only.
- **Reference manager:** APA 7, MLA 9, Harvard, IEEE and Chicago, with:
  - DOI lookup via Crossref
  - Copying of in-text citations and reference lists
  - Insertion of citations and the bibliography straight into the editor
- **Templates & guides:** UG and PG templates, a proposal template, writing guidelines and a referencing guide, all generated as `.docx` on first run. Deans, HODs and admins can upload more (`.docx`/`.pdf`) or link external referencing tutorials and PDFs.
- **Communication:**
  - One-to-one chat with unread badges
  - Notifications for every workflow event
  - Announcements targeted by faculty, department or audience
- **Collaboration and networking:** a community forum (collaboration calls, opportunities, Q&A, funding) and a researcher directory searchable by research interest.
- **Manuscript support:** a publication pipeline from drafting through internal review, submission, peer review and revision to acceptance and publication. It includes co-author invitations, a shared draft, review comments, file versions, journal-format export and integrity checks.
- **Dashboards and reports:** role-specific dashboards. The super admin dashboard shows aggregates and 14-day activity. Reports print on a letterhead with signature lines and export to CSV. The activity log also exports to CSV.

## Searching, filtering and pagination

Every table and long list has the same toolbar:

- **Search:** every word you type must appear somewhere in the row.
- **Field filters:** one dropdown per meaningful field (role, status, faculty, department, programme, level, stage, supervisor, similarity band, and so on). Each option shows how many rows it matches, and "— None —" picks rows where that field is empty.
- **Date ranges:** where the table has a date, you can pick a from/to range.
- **Clear:** one button resets the search and all filters, and the toolbar shows a "20 of 65" count.

Long tables split into pages: 25 rows by default (12 for card grids), with First/Previous/Next/Last buttons and a rows-per-page choice of 10, 25, 50 or 100. Changing the search or a filter goes back to page 1. CSV exports, report totals and printed reports always use every matching row, not just the page you're looking at. On a phone, the filters fold away behind a **Filters** button.

The shared code is `useTableControls`, `TableControls` and `Pagination` in `client/src/components/ui.jsx`.

## Deactivation instead of deletion

Nothing in the system is hard-deleted. A deleted record would cascade away, or leave orphaned, the projects, submissions, chats and audit history that depend on it. Records get an `archived_at` timestamp instead, and every one can be restored.

- **Accounts:** an admin can deactivate or reactivate an account.
  - A deactivated account cannot sign in.
  - Any Dean or HOD office the person held becomes vacant.
  - Students they supervise pass to the co-supervisor. If there is no co-supervisor, the student is marked *Awaiting supervisor reallocation* and the HOD is notified. You must confirm this step.
  - On reactivation, the person gets their Dean/HOD office back if nobody else has been appointed in the meantime.
  - The old status dropdown can't be used to get around these steps.
- **Faculties, departments and programmes** can be deactivated and reactivated, with guards:
  - A faculty that still has active departments cannot be deactivated.
  - A department that still has active programmes or members cannot be deactivated.
  - A programme with enrolled students cannot be deactivated.
  - A department or programme can't be restored while its parent unit is inactive.
  - Inactive units disappear from registration and from unit pickers.
- **Content** (Writing Studio documents, references, resources, manuscripts, announcements, forum posts) is archived and restored from an Archived view.
  - Archived resources are hidden from students, but the file is kept.
  - Archived manuscripts are read-only.
  - Archived drafts still count in the plagiarism corpus, so archiving can't be used to evade the similarity check.

Existing databases are upgraded automatically on start: the two columns are added and existing data is not touched.

## Project structure

```
server/src/
  index.js            Express app (serves client/dist in production)
  db.js               SQLite schema & helpers (node:sqlite)
  seed.js             Sample data + generated .docx templates
  lib/                auth, stages, plagiarism/AI checkers, docx generation
  routes/             auth, admin, projects, comms (chat/notifications/community), tools (editor/refs/resources/manuscripts)
client/src/
  pages/              One file per screen
  components/         Layout (role-aware sidebar) and shared UI
  cite.js             Citation style formatter
```

Uploaded files are stored in `server/uploads/` and the database in `server/data/plasu_pms.sqlite`. Back up both folders.

## Notes and limitations

- The plagiarism checker searches only the institutional repository on this platform, not the internet. To check against the web, connect a commercial service such as Turnitin or Copyleaks through `server/src/lib/checkers.js`.
- The AI-writing score is a statistical signal, not proof of misconduct.
- Chat refreshes every 5 seconds by polling. Add WebSockets if you need real-time delivery at scale.
- The external referencing links are seeded from public style-guide sites. Admins can edit or replace them on the Templates & Guides page.
