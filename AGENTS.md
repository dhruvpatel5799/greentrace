# AGENTS.md — GreenTrace

This file tells any AI coding agent (Cursor, Copilot, Windsurf, Codex CLI, Claude Code,
Gemini CLI, or a human copy-pasting into a chat) how to work on this repo. It is
tool-agnostic by design — no single vendor's assistant is assumed. If a chat conversation
says something that conflicts with this file, update this file rather than letting the two
drift apart; this file is the source of truth going forward.

---

## 1. Project context

**GreenTrace** — AI-powered climate accountability platform, built for AI Builder Cup 2026
(Hack2Skill × Google Cloud, Sustainability & Social Impact theme). Self-funded on GCP free trial credit ($300, ~$5–10 expected spend).

**Two modules under one platform, sharing data:**
1. **Supply Chain Carbon Auditor** (`/api/src/modules/carbon-auditor`) — procurement CSV →
   Document AI → Gemini Scope 3 categorisation → BigQuery emission factor join → dashboard
   → CSRD-aligned report export.
2. **Green Bond Verifier** (`/api/src/modules/bond-verifier`) — bond PDF → Document AI +
   Gemini claim extraction → Earth Engine satellite verification → greenwashing score.

Module 2 reads Module 1's `company_emissions` data as a cross-check signal. **This shared
data path is the platform's core differentiator** — treat it as a load-bearing integration
point, not an optional coupling. Flag any change that touches it.

**GCP project:** `greentrace-509210` · **Region:** `us-central1`.

**Repo layout:**
```
/api                    Node.js + Express backend (primary orchestration layer)
/earth-engine-service   Python microservice, Earth Engine only (EE's SDK is Python-first)
/web                    React + Next.js frontend, Tailwind CSS
/scripts                One-off data-loading / ops scripts (e.g. EPA CSV → BigQuery)
```

---

## 2. Setup & running things

```bash
# Backend
cd api && npm install && npm run dev        # local dev server

# Earth Engine microservice
cd earth-engine-service
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py

# Frontend
cd web && npm install && npm run dev

# Tests (run before every commit that touches the relevant folder)
cd api && npm test -- --coverage
cd earth-engine-service && pytest --cov
cd web && npm test
```

Environment variables live in `.env` at the repo root (backend/scripts) and `web/.env.local`
(frontend, Next.js convention). Never commit either — see Security section.

---

## 3. Git workflow

**Branches:**
```
feature/<short-description>   e.g. feature/carbon-csv-upload
fix/<short-description>       e.g. fix/bigquery-join-null-factors
chore/<short-description>     e.g. chore/update-dependencies
```
Lowercase, hyphen-separated. Branch off `develop`.

**Commits:** plain, descriptive, no required prefix. Say what changed and why if it's not
obvious from the diff: `Add BigQuery join for emission factors`, not `update code`.

**Merging:** merge feature branches into `develop` via PR once a module reaches a
working, tested state — gives you a clean rollback point before starting the next module.
Don't merge with failing tests or coverage below the target in Section 5.

---

## 4. Documentation standard

**JavaScript / TypeScript (`/api`, `/web`):**
- JSDoc on every exported function: purpose, `@param`, `@returns`, `@throws` where relevant.
- Comments explain *why*, not *what* — don't narrate obvious code.
- React components: a one-line comment block above the component describing its role and
  its key props if not self-evident from prop names.

**Python (`/earth-engine-service`):**
- Google-style docstrings on every function and class.
- Type hints on all function signatures (this is Python 3.14 — use modern syntax,
  `list[str]` not `List[str]`, `X | None` not `Optional[X]`).

**Every module folder** gets its own `README.md`: what it does, its inputs/outputs or API
endpoints, how to run it locally, how to test it. Update it in the same PR that changes
the module's behavior — a stale README is worse than none.

---

## 5. Testing

**Coverage target: 90%+ on backend and Earth Engine business logic**
(`/api/src/services`, `/api/src/modules`, `/earth-engine-service/*.py` excluding thin
entrypoints). Excluded from the target: route handlers that only delegate to a service,
and one-off scripts in `/scripts`. Frontend: no hard percentage, but every component with
non-trivial logic (data transforms, conditional rendering branches, form validation) needs
a test — visual-only components don't.

- **Frameworks:** Jest (+ React Testing Library for `/web`) for JS/TS, `pytest` for Python.
- **Location:** co-located — `foo.js` + `foo.test.js`, `foo.py` + `test_foo.py`.
- **Mandatory coverage for:**
  - Every service function calling a GCP API — mock the client, never hit real GCP in
    tests (protects the budget and keeps tests deterministic).
  - Every data transformation: CSV parsing, Scope 3 category mapping, discrepancy scoring,
    NDVI/imagery comparison logic.
  - Edge cases: empty input, malformed CSV rows, missing PDF fields, Gemini returning
    malformed/unexpected JSON, network/API failures and timeouts.
  - The Module 1 ↔ Module 2 integration point (`company_emissions` read path) —
    specifically test what happens when this data is missing or stale, since Module 2
    depends on it.
- Coverage dropping below target should block a merge to `develop`, treated as a real gate.

---

## 6. Code quality & architecture (DRY and beyond)

- **One GCP client per service, not per call.** Initialize each GCP client (Vertex AI,
  Document AI, BigQuery, Storage, Secret Manager, Earth Engine) once in
  `/api/src/config/gcpClients.js`, import everywhere. Never instantiate a client inline in
  a route handler.
- **Shared logic lives in `/api/src/services`**, never duplicated per module. Both modules
  call Document AI — one `documentAiService.js`, not two.
- **No hardcoded config.** Project ID, dataset names, bucket names, model names — always
  from environment variables, never string literals in logic files.
- **Consistent error handling:** services throw typed errors (custom `Error` subclasses
  with a `.code` and safe `.message`); route handlers catch and map to an HTTP status +
  consistent JSON error shape (`{ error: { code, message } }`). Never let a raw GCP SDK
  error or stack trace reach the frontend response.
- **Validate at the boundary.** Sanitize/validate uploaded CSVs and PDFs at the route or
  first service call — reject malformed input early with a clear error, don't let bad data
  travel deep into the pipeline before failing.
- **Idempotency where it matters.** Pub/Sub can redeliver messages — Cloud Function
  handlers triggered by it should tolerate being run twice on the same event without
  double-writing or double-charging an API call.
- **Prefer composition over premature abstraction.** DRY doesn't mean force a shared
  abstraction across Module 1 and Module 2 the moment they look similar — wait until a
  third use case confirms the pattern, or you'll build the wrong abstraction under
  deadline pressure.
- **Keep the LLM boundary thin and typed.** Wrap every Gemini call in a service function
  that (a) constrains output format (JSON mode or a strict prompt schema), (b) validates
  the parsed response against an expected shape before returning it, and (c) has a defined
  fallback/error path when the model returns something unparseable. Don't let raw model
  output flow into BigQuery or the frontend unvalidated.

---

## 7. Security

- **Secrets never in code or chat.** DB password from Secret Manager at runtime; API keys
  from env vars backed by Secret Manager in production. `.env`, `.env.local`, and
  `greentrace-backend-key.json` are gitignored — never paste their contents into any chat
  or commit, including "just to show you the format."
- **Least-privilege IAM.** The `greentrace-backend` service account should hold only the
  roles each service actually needs — don't grant `Editor`/`Owner` for convenience.
- **Validate and sanitize all file uploads** (CSV, PDF) for size limits and expected
  structure before passing to Document AI — this is a public-facing upload path.
- **No PII beyond what's needed.** This platform handles corporate/vendor data, not
  personal data — if anything resembling personal data shows up in a CSV or PDF, don't
  log it, and consider whether it needs to be stripped before storage.
- **Rate-limit and budget-guard any endpoint that triggers a paid API call** (Gemini,
  Document AI, Earth Engine) — a bug that loops a paid call is a bigger risk here than on
  a normally-funded project, given the manual $10 budget guard.

---

## 8. Frontend-specific (`/web`)

- **Component naming:** `PascalCase.jsx`, one component per file, filename matches the
  component name.
- **Accessibility basics, not an afterthought:** semantic HTML elements, `alt` text on
  images/charts where meaningful, form inputs always paired with a `<label>`, sufficient
  color contrast (check against the judging criteria's UX weight — 10% of the score).
  This is a small ask that meaningfully improves the demo's polish.
- **Loading and error states are not optional.** Every upload → processing → result flow
  (both modules follow this shape) needs a visible loading state and a visible error state
  — a hackathon demo that hangs silently on a slow Gemini call reads as broken.
- **Keep chart/dashboard components presentational.** Data fetching and shaping happens in
  a hook or parent container; the chart component itself just renders props. Makes both
  easier to test independently.

---

## 9. Naming conventions

| Item | Convention |
|---|---|
| JS/TS files | `camelCase.js` |
| Python files | `snake_case.py` |
| Functions/variables (JS) | `camelCase` |
| Functions/variables (Python) | `snake_case` |
| Classes (both languages) | `PascalCase` |
| Constants | `UPPER_SNAKE_CASE` |
| BigQuery datasets/tables | `snake_case` (`greentrace_data`, `emission_factors`, `company_emissions`) |
| React components | `PascalCase.jsx` |
| Env vars | `UPPER_SNAKE_CASE` |

---

## 10. Before generating code, an agent should

1. Check whether the needed logic already exists in `/api/src/services` before writing new
   logic — search first, write second.
2. Confirm which module (`carbon-auditor` or `bond-verifier`) the code belongs to, or
   whether it's genuinely shared and belongs in a common service.
3. Write the test alongside the implementation, not as a follow-up step.
4. Use environment variables for anything environment- or project-specific — no
   hardcoded IDs, bucket names, or model names.
5. Flag explicitly if a change touches the Module 1 → Module 2 `company_emissions` data
   path, since it's easy to break silently and hard to notice in a quick demo run-through.
6. Prefer the smallest change that correctly solves the task over a broad refactor,
   unless asked — this is a hackathon build on a deadline, not a greenfield redesign.
