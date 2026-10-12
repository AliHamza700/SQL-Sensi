# SQL Sensi — Complete Project Overview, Tech Stack & Version Roadmap

**Project Name:** SQL Sensi  
**Description:** AI-Powered Natural Language SQL & Data Analysis Desktop Assistant  
**Repository:** `SQL-Sensi`  
**Current State:** v0.2.5 (Transitioning to v0.3.0 / v1.0.0)

---

## 1. Technology Stack

### A. Frontend (Renderer Process)
| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | Next.js 14 (App Router) & React 18 | Modern, responsive UI rendering and routing |
| **Language** | TypeScript 5.4 | End-to-end type safety |
| **Styling** | Custom CSS Design System (`globals.css`) | Dark theme, responsive cards, typography, animations |
| **Icons** | Lucide React | High-quality vector UI icons |
| **Data Visualization** | Chart.js 4.4 + React-ChartJS-2 | Interactive Bar, Line, Pie, and Scatter charts |
| **State & Context** | React Context API | `AuthContext`, `DatabaseContext` |

### B. Desktop Backend & Main Process
| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Desktop Shell** | Electron 35.7.5 | Cross-platform desktop runtime (Node.js 22+ built-in) |
| **Inter-Process Comm.** | Electron IPC (`preload.ts` + `contextBridge`) | Strict context isolation & sandboxed API bridge |
| **Database Engine** | Native `node:sqlite` (`DatabaseSync`) | Zero-dependency, native synchronous SQLite execution |
| **Security & Env** | `dotenv` + Cross-Env | Backend API key isolation (no keys exposed to client) |

### C. Artificial Intelligence & Analytics
| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **AI Provider** | Groq Cloud SDK (`groq-sdk`) | High-speed inference using Llama 3 models |
| **Prompt Architecture** | Few-Shot Schema-Aware Prompting | Precise SQL generation strictly bounded by active DDL |
| **Performance Engine** | SQLite `EXPLAIN QUERY PLAN` | Analysis of table scans, index searches, and query cost |

### D. Tooling, Testing & DevOps
| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Package Manager** | pnpm | Fast, deterministic dependency management |
| **Build & Compilation** | TypeScript (`tsc`) + `tsc-alias` | Path resolution (`@/*`) across Electron & Next.js |
| **Testing** | Jest + ts-jest | Unit, integration, and SQL security test suites |
| **Bundling / Packaging**| Electron Builder | Standalone executable installer generation (`.exe`) |

---

## 2. Implemented Core Functionalities

### 1. User Authentication & Session Security (Phase 1 & 2)
- **Local Account Management:** SQLite-based local user storage (`auth.db`).
- **Cryptographic Security:** Hashed passwords with salt using standard crypto standards.
- **Session Lifecycle:** Automatic session token verification, configurable expiry, and idle auto-logout.
- **Route Guarding:** `AuthGuard` protecting workspace routes against unauthenticated access.

### 2. Local Database Connection & Schema Extraction (Phase 3 & 4)
- **Native File Picker:** Integrated OS file dialog for selecting `.db` and `.sqlite` files.
- **Integrity & Header Checks:** Validates SQLite magic header bytes and verifies database consistency via `PRAGMA integrity_check`.
- **Deep Schema Extraction:** Automatically inspects:
  - Table definitions and column types
  - Primary keys and Nullability
  - Foreign key relations and foreign table mappings
  - Existing indexes and uniqueness constraints

### 3. Schema Explorer Interface (Phase 5)
- Dedicated visual tree to explore tables, inspect individual column data types, and review relations without writing manual SQL queries.

### 4. Natural Language to SQL Assistant (Phase 6 & 7)
- **Conversational Chat UI:** Clean interface with chat history, bot indicators, and copy-to-clipboard functionality.
- **Context Injection:** Active database schema dynamically injected into the system prompt.
- **Ambiguity Detection:** Detects incomplete or unclear questions and returns clarifying questions rather than generating risky SQL.

### 5. Read-Only Security Interceptor (Phase 8)
- **Zero-Mutation Guarantee:** All connected databases are opened in strict `readOnly` mode.
- **AST / Syntax Validator:** Intercepts and blocks destructive commands (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`, `VACUUM`).

### 6. Virtual DBA: Query Optimizer & EXPLAIN Engine (Phase 9 & 10)
- **Query Optimization:** Generates optimized query rewrites to avoid full-table scans.
- **Execution Plan Analysis:** Runs `EXPLAIN QUERY PLAN` and translates low-level SQLite execution trees into human-friendly explanations.
- **Actionable Advice:** Recommends index creations and detects costly Cartesian joins.

### 7. Results Table & Dynamic Auto-Charts (Phase 11)
- **Tabular Data Viewer:** Paginated results viewer capable of displaying large datasets cleanly.
- **Intelligent Charting:** Auto-detects numeric vs categorical columns to automatically suggest and render Bar, Line, Pie, and Scatter plots using Chart.js.

### 8. Conversation History & Management (Phase 12)
- **Local History DB:** Conversations and message threads persisted in a local `history.db`.
- **Session Management:** Create new chat sessions, rename existing conversation titles, and delete obsolete threads.

### 9. Data & Chart Export (Phase 13)
- Export query results directly to `.csv` and `.json`.
- Export rendered charts as high-resolution `.png` images.

### 10. UI Polish & Interactivity
- Hover effects and transitions across sidebar navigation items.
- Hoverable, interactive card elevation on the Dashboard.
- Smooth action button reveals on chat history items.

---

## 3. Implementation Progress by Phase

| Phase | Description | Status |
| :--- | :--- | :---: |
| **Phase 1** | Project Foundation (Next.js, Electron, TypeScript, IPC) | ✅ 100% Complete |
| **Phase 2** | User Authentication & Session Management | ✅ 100% Complete |
| **Phase 3** | SQLite Database Manager & Connection | ✅ 100% Complete |
| **Phase 4** | Automated Schema Extraction & DDL Parsing | ✅ 100% Complete |
| **Phase 5** | Schema Explorer UI | ✅ 100% Complete |
| **Phase 6** | AI Provider Integration (Groq Cloud LLM) | ✅ 100% Complete |
| **Phase 7** | Natural Language to SQL Generation | ✅ 100% Complete |
| **Phase 8** | SQL Security Interceptor (Read-Only Enforcement) | ✅ 100% Complete |
| **Phase 9** | Virtual DBA: SQL Optimization Engine | ✅ 100% Complete |
| **Phase 10** | EXPLAIN QUERY PLAN & Human Explanation | ✅ 100% Complete |
| **Phase 11** | Results Table & Dynamic Chart Visualization | 🟡 90% (Final Polish) |
| **Phase 12** | Chat History Persistence (`history.db`) | ✅ 100% Complete |
| **Phase 13** | Export (CSV, JSON, PNG) & UI Interactivity | 🟡 90% (Final Polish) |
| **Phase 14** | Offline Resilience & Fallbacks | 🔄 In Progress |
| **Phase 15** | Security Testing & Automated Test Suites | 🔄 In Progress |
| **Phase 16** | Packaging & Standalone Installer (`.exe`) | ⏳ Next |

---

## 4. Release Version Roadmap

```text
v0.1.0 (Alpha Core) ──► v0.2.0 (Beta AI Engine) ──► v0.3.0 (Data Studio) ──► v1.0.0 (Production GA)
    [COMPLETED]               [COMPLETED]               [CURRENT]               [NEXT]
```

### 🏷️ Version 0.1.0 — Core Desktop & Database Engine (Completed)
*Goal: Solid desktop shell, authentication, and secure local SQLite access.*
- [x] Electron + Next.js context-isolated architecture
- [x] Local User Authentication (Registration, Login, Session expiry)
- [x] SQLite file connection & validation
- [x] Full schema extraction (Tables, Columns, Keys, Indexes)
- [x] Schema Explorer UI
- [x] Read-Only Security Interceptor (AST parsing + readOnly connection)

### 🏷️ Version 0.2.0 — AI Assistant & Virtual DBA (Completed)
*Goal: Natural Language Querying, Plan Explanation, and Persistent Conversations.*
- [x] Groq LLM integration with secured backend API key handling
- [x] Natural Language to SQL query translation
- [x] Ambiguity detection with clarifying prompts
- [x] `EXPLAIN QUERY PLAN` SQLite execution
- [x] AI-powered execution plan translation & index recommendations
- [x] Conversation History database (`history.db`) with create, rename, and delete capabilities

### 🏷️ Version 0.3.0 — Data Studio & Visualization (Current Target)
*Goal: Turn SQL Sensi into a full data exploration and reporting studio.*
- [x] Interactive paginated query results table
- [x] Dynamic charting with Chart.js (Bar, Line, Pie, Scatter)
- [x] Smart chart type suggestion based on column data types
- [x] Results export (CSV, JSON) and chart export (PNG)
- [x] UI micro-interactions (sidebar hover, card hover, chat history hover)
- [ ] Direct "Run in SQL Editor" one-click transfer from Chat to Editor

### 🏷️ Version 1.0.0 — Production Release (Upcoming Milestone)
*Goal: Commercial-ready standalone desktop application.*
- [ ] Offline AI fallback option (support for local Ollama / small GGUF models)
- [ ] Comprehensive test suite passing (100% passing tests for security and query safety)
- [ ] Single-click installer packaging (`.exe` on Windows via `electron-builder`)
- [ ] Auto-updater integration
- [ ] Multi-database tab support (switching between chinook, northwind, etc.)
