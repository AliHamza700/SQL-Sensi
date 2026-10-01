# SQL Sensi — Developer Architecture Reference

> **Day 2 Deliverable** (implement-plan.md §2)
> This document defines application layers, service boundaries, and data models
> for developers and coding agents working on this project.

---

## 1. Application Layers

The application is divided into **5 strict layers**. Each layer may only depend on layers below it.

```
┌─────────────────────────────────────────────┐
│  Layer 5: UI (Next.js Pages & Components)   │  ← app/ directory
│  Renders state. No business logic.          │
├─────────────────────────────────────────────┤
│  Layer 4: Features & Hooks                  │  ← src/features/
│  Orchestrates services. Manages UI state.   │
├─────────────────────────────────────────────┤
│  Layer 3: Services                          │  ← src/services/
│  Business logic. Implements interfaces.     │
├─────────────────────────────────────────────┤
│  Layer 2: Infrastructure / IPC              │  ← electron/src/
│  SQLite, filesystem, IPC handlers, AI HTTP. │
├─────────────────────────────────────────────┤
│  Layer 1: Types, Config, Utils              │  ← src/types/, src/config/, src/utils/
│  Pure. No side effects. No external deps.   │
└─────────────────────────────────────────────┘
```

### Layer Rules

| From ↓ / To → | L1 Types/Config | L2 Infrastructure | L3 Services | L4 Features | L5 UI |
|---|:---:|:---:|:---:|:---:|:---:|
| **L1 Types/Config** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **L2 Infrastructure** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **L3 Services** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **L4 Features** | ✅ | ❌ | ✅ | ✅ | ❌ |
| **L5 UI** | ✅ | ❌ | ❌ | ✅ | ✅ |

> ⚠️ **UI components must never import from `src/services/` directly.**
> They must go through `src/features/` hooks.

---

## 2. Service Boundaries

Each service has **one responsibility**. The interface contract is defined in
[`src/services/interfaces.ts`](../src/services/interfaces.ts).

| Service | Interface | Responsibility | Phase |
|---|---|---|---|
| `AuthService` | `IAuthService` | User registration, login, session | 2 |
| `DatabaseService` | `IDatabaseService` | Open/close SQLite, read-only execution | 3 |
| `SchemaService` | `ISchemaService` | Extract schema, build AI context | 4 |
| `AIService` | `AIProvider` | Orchestrates the active AI provider | 6 |
| `QueryService` | `IQueryService` | validate → optimize → explain → execute pipeline | 8 |
| `OptimizationService` | `IOptimizationService` | Static analysis + AI-assisted rewrites | 9 |
| `QueryPlanService` | `IQueryPlanService` | Parse & explain EXPLAIN QUERY PLAN | 10 |
| `ConversationService` | `IConversationService` | Store & retrieve conversations | 12 |
| `ExportService` | `IExportService` | CSV, Excel, PDF, PNG export | 13 |

### Communication Pattern

```
UI Component
    ↓
Feature Hook (useChat, useQuery, etc.)
    ↓ calls interface method
Service Implementation
    ↓ IPC invoke (Electron)
Main Process Handler
    ↓
Infrastructure (node:sqlite / AI HTTP / fs)
```

---

## 3. Data Models

All shared types are defined in [`src/types/index.ts`](../src/types/index.ts).

### Core Entities

```typescript
DatabaseSchema        // Full schema: tables, relationships, indexes, views
TableSchema           // One table: columns, PKs, FKs
ColumnSchema          // One column: name, type, nullable, default
RelationshipSchema    // FK relationship between two tables
IndexSchema           // Index: name, table, columns, unique
ViewSchema            // View: name, SQL definition
```

### Query Pipeline

```typescript
QueryResult           // columns[], rows[], rowCount, executionTimeMs
SQLValidationResult   // valid, statementType, errors[], warnings[]
QueryPlan             // nodes[], rawOutput, humanExplanation
OptimizationResult    // issues[], optimizedSql?, indexSuggestions[]
```

### AI Abstractions

```typescript
AIProvider            // Interface — generateSQL, clarifyQuestion, explainSQL, optimizeSQL, explainQueryPlan
SQLGenerationInput    // question + schema + conversationContext
ClarificationResult   // needsClarification, clarificationPrompt?, options[]
```

### Conversation

```typescript
Conversation          // id, userId, databaseName, title, messages[]
ConversationMessage   // id, role, content, sql?, queryResult?, createdAt
```

### Cross-cutting

```typescript
ServiceResult<T>      // { success: true, data: T } | { success: false, error: AppError }
AppError              // code: AppErrorCode, message, details?
AppErrorCode          // 'AUTH_ERROR' | 'DATABASE_ERROR' | 'SQL_VALIDATION_ERROR' | ...
```

---

## 4. IPC Architecture (Renderer ↔ Main)

Electron separates the renderer (Next.js UI) from the main process (Node.js).
All cross-process calls go through **IPC channels** defined in
[`src/config/ipc-channels.ts`](../src/config/ipc-channels.ts).

```
Renderer (Next.js)          Main Process (Electron)
─────────────────           ─────────────────────────
Feature Hook                IPC Handler
    │                            │
    │ ipcRenderer.invoke()       │
    │ ─────────────────────────► │
    │                       Service (DatabaseService, etc.)
    │                            │
    │ ◄───────────────────────── │
    │  ServiceResult<T>          │
```

**Security rules:**
- `contextIsolation: true` — renderer has NO direct Node.js access
- `nodeIntegration: false` — enforced
- Preload bridge ([`electron/src/preload.ts`](../electron/src/preload.ts)) exposes only explicit channels

---

## 5. Security Layer

The **SQL Validator** (`src/security/sql-validator.ts`) is a mandatory gate.

```
AI generates SQL
      ↓
ISQLValidator.validate(sql)       ← ALWAYS run this
      ↓ valid=false?
      → Return error to user
      ↓ valid=true?
User reviews & optionally edits
      ↓
ISQLValidator.validate(sql)       ← Run AGAIN after any edit
      ↓ valid=true?
IDatabaseService.executeReadOnly(sql)
```

**Blocked statements (MVP):**
`INSERT` · `UPDATE` · `DELETE` · `DROP` · `ALTER` · `TRUNCATE` · `CREATE` · `REPLACE` · `ATTACH` · `DETACH`

---

## 6. AI Provider Abstraction

Business logic depends on `AIProvider` interface, never on a specific SDK.

```
AIService
    ↓
AIProvider (interface)
    ├── GeminiProvider   (implements AIProvider)
    ├── OpenAIProvider   (implements AIProvider)
    └── LocalLLMProvider (implements AIProvider)
```

Active provider is selected via `AppConfig.ai.provider` from `.env.local`.
Swapping providers requires only a config change — zero business logic changes.

---

## 7. Offline vs Online Capabilities

| Feature | Offline | Online Required |
|---|:---:|:---:|
| SQLite file loading | ✅ | |
| Schema extraction | ✅ | |
| Schema Explorer UI | ✅ | |
| SQL validation | ✅ | |
| Read-only query execution | ✅ | |
| EXPLAIN QUERY PLAN | ✅ | |
| Charts / visualization | ✅ | |
| Local conversation storage | ✅ | |
| AI SQL generation | | ✅ |
| AI clarification | | ✅ |
| AI optimization | | ✅ |
| AI result explanation | | ✅ |

---

## 8. Key Files Quick Reference

| File | Purpose |
|---|---|
| [`src/types/index.ts`](../src/types/index.ts) | All domain types |
| [`src/services/interfaces.ts`](../src/services/interfaces.ts) | Service contracts |
| [`src/services/ai/ai-provider.interface.ts`](../src/services/ai/ai-provider.interface.ts) | AIProvider interface |
| [`src/config/index.ts`](../src/config/index.ts) | App configuration |
| [`src/config/ipc-channels.ts`](../src/config/ipc-channels.ts) | IPC channel registry |
| [`src/utils/errors.ts`](../src/utils/errors.ts) | Error factories + ok()/fail()/tryCatch() |
| [`src/utils/index.ts`](../src/utils/index.ts) | Pure utility functions |
| [`src/security/sql-validator.ts`](../src/security/sql-validator.ts) | SQL security gate |
| [`electron/src/main.ts`](../electron/src/main.ts) | Electron main process |
| [`electron/src/preload.ts`](../electron/src/preload.ts) | Secure IPC bridge |
