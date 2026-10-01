# SQL Sensi

> **AI-Powered Natural Language SQL & Data Analysis Desktop Assistant**

Upload a SQLite `.db` file → Ask questions in plain English → Get schema-aware SQL, read-only results, query plans, optimization suggestions, and interactive charts — all in a secure, offline-capable desktop app.

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron |
| Frontend | Next.js 14 + React 18 + TypeScript |
| Runtime | Node.js |
| Database | SQLite (via `better-sqlite3`) |
| Visualization | Chart.js |
| AI | Provider abstraction (Gemini / OpenAI / Local LLM) |
| Package Manager | pnpm |

---

## 📁 Project Structure

```
sql-sensi/
├── app/                    # Next.js App Router pages
│   ├── login/              # Authentication UI
│   ├── dashboard/          # Home dashboard
│   ├── database/           # DB upload & management
│   ├── schema/             # Schema Explorer
│   ├── chat/               # AI chat interface
│   ├── sql-editor/         # SQL review & editing
│   ├── results/            # Query results & charts
│   └── settings/           # App settings
│
├── electron/               # Electron main process
│   └── src/
│       ├── main.ts         # App entry, BrowserWindow
│       └── preload.ts      # Secure IPC bridge
│
├── src/                    # Shared business logic
│   ├── types/              # Shared domain types
│   ├── services/           # One service per concern
│   │   ├── auth/
│   │   ├── database/
│   │   ├── schema/
│   │   ├── ai/
│   │   ├── query/
│   │   ├── optimization/
│   │   ├── query-plan/
│   │   ├── conversation/
│   │   └── export/
│   ├── security/           # SQL validator (critical)
│   ├── components/         # Shared UI components
│   ├── features/           # Feature-specific modules
│   ├── utils/              # Pure helper functions
│   └── config/             # App configuration
│
├── tests/                  # All tests
│   ├── unit/
│   ├── integration/
│   └── security/
│
└── docs/                   # Additional documentation
```

---

## ⚡ Getting Started

### Prerequisites
- Node.js >= 20
- pnpm >= 8

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local and add your AI provider key
```

### Development

```bash
# Start Next.js dev server + Electron together
pnpm dev

# Or start just Next.js (for browser development)
pnpm dev:next
```

### Build

```bash
# Build Next.js
pnpm build

# Package as Electron desktop app
pnpm build:electron
```

### Testing

```bash
pnpm test              # All tests
pnpm test:unit         # Unit tests only
pnpm test:integration  # Integration tests
pnpm test:security     # Security tests (SQL validation)
```

### Linting & Formatting

```bash
pnpm lint           # Check for lint errors
pnpm format         # Auto-format all files
pnpm type-check     # TypeScript check (no emit)
```

---

## 🔒 Security Model

- **Read-only by default** — only `SELECT` is allowed; `INSERT/UPDATE/DELETE/DROP/ALTER` are blocked
- **AI output is untrusted** — all AI-generated SQL passes through the `SQLValidator` before execution
- **User must review SQL** — the user sees and can edit generated SQL before it runs
- **Re-validated after edits** — edited SQL goes through validation again
- **No secrets in source code** — all API keys in `.env.local` (never committed)
- **No raw Node.js in renderer** — `contextIsolation: true`, `nodeIntegration: false`

---

## 📋 Implementation Progress

See [implement-plan.md](./implement-plan.md) for the full 16-phase, 120-day plan.

| Phase | Status |
|---|---|
| Phase 1 — Project Foundation | 🔄 In Progress |
| Phase 2 — Authentication | ⏳ Upcoming |
| Phase 3 — SQLite Manager | ⏳ Upcoming |
| Phase 4 — Schema Extraction | ⏳ Upcoming |
| Phase 5 — Schema Explorer | ⏳ Upcoming |
| Phase 6–7 — AI + NL→SQL | ⏳ Upcoming |
| Phase 8 — SQL Security + Execution | ⏳ Upcoming |
| Phase 9 — Optimization | ⏳ Upcoming |
| Phase 10 — EXPLAIN QUERY PLAN | ⏳ Upcoming |
| Phase 11 — Results + Visualization | ⏳ Upcoming |
| Phase 12 — Conversation History | ⏳ Upcoming |
| Phase 13 — Export | ⏳ Upcoming |
| Phase 14–16 — Offline, QA, Deploy | ⏳ Upcoming |

---

## 📄 Documentation

| File | Purpose |
|---|---|
| [PRD.md](./PRD.md) | What are we building? |
| [architecture.md](./architecture.md) | How is it structured? |
| [implement-plan.md](./implement-plan.md) | In what order do we build it? |
| [rules.md](./rules.md) | What must/must not agents do? |
