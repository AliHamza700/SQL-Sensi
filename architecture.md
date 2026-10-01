# System Architecture

## 1. Architecture Objective

The architecture must produce a secure, modular, maintainable, and extensible AI-powered SQLite analytics application.

The application must separate:

* UI
* Application logic
* Database operations
* AI services
* Security
* Query optimization
* Query-plan analysis
* Visualization
* Conversation management
* Export

No module should become a giant monolithic service.

---

# 2. High-Level Architecture

```text
┌──────────────────────────────────────────────┐
│              Electron Desktop App            │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │        Next.js / React / TypeScript    │  │
│  │                                        │  │
│  │ Login                                  │  │
│  │ Database Upload                        │  │
│  │ Schema Explorer                        │  │
│  │ Chat Interface                         │  │
│  │ SQL Editor                             │  │
│  │ Results                                │  │
│  │ Charts                                 │  │
│  │ Query Plan                             │  │
│  └────────────────────────────────────────┘  │
│                     │                        │
│                     ▼                        │
│  ┌────────────────────────────────────────┐  │
│  │          Application Services          │  │
│  │                                        │  │
│  │ Auth Service                           │  │
│  │ Database Service                       │  │
│  │ Schema Service                         │  │
│  │ AI Service                             │  │
│  │ Query Service                          │  │
│  │ Optimization Service                   │  │
│  │ Query Plan Service                     │  │
│  │ Conversation Service                   │  │
│  │ Export Service                         │  │
│  └────────────────────────────────────────┘  │
│                     │                        │
│          ┌──────────┼──────────┐             │
│          ▼          ▼          ▼             │
│       SQLite    AI Provider  Local Storage   │
│                  Interface                    │
└──────────────────────────────────────────────┘
```

---

# 3. Architectural Principles

## Principle 1 — Security First

Never execute AI-generated SQL without validation.

```text
AI Output ≠ Trusted Input
```

---

## Principle 2 — Read-Only by Default

The database execution layer must reject write/destructive operations.

---

## Principle 3 — Provider Independence

Business logic must not depend directly on Gemini, OpenAI, or another provider.

Use:

```typescript
AIProvider
```

---

## Principle 4 — Separation of Concerns

UI components should not directly execute SQL.

Bad:

```typescript
button.onClick(() => sqlite.run(sql));
```

Preferred:

```text
UI
 ↓
Query Service
 ↓
Security Validator
 ↓
Database Service
 ↓
SQLite
```

---

## Principle 5 — Validate at Boundaries

Validate:

* Uploaded files
* Database connections
* User input
* AI responses
* SQL
* Export requests
* Authentication/session information

---

# 4. Recommended Project Structure

```text
project-root/
│
├── apps/
│   ├── desktop/
│   │   ├── electron/
│   │   └── renderer/
│   │
│   └── web/
│
├── src/
│   ├── components/
│   ├── features/
│   │   ├── auth/
│   │   ├── database/
│   │   ├── schema/
│   │   ├── chat/
│   │   ├── sql/
│   │   ├── optimization/
│   │   ├── query-plan/
│   │   ├── visualization/
│   │   ├── export/
│   │   └── history/
│   │
│   ├── services/
│   │   ├── auth/
│   │   ├── database/
│   │   ├── schema/
│   │   ├── ai/
│   │   ├── query/
│   │   ├── optimization/
│   │   ├── query-plan/
│   │   ├── conversation/
│   │   └── export/
│   │
│   ├── security/
│   ├── types/
│   ├── utils/
│   └── config/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── security/
│
├── docs/
│
├── PRD.md
├── architect.md
├── implement-plan.md
└── rules.md
```

The exact folder structure may be adjusted during implementation if there is a documented architectural reason.

---

# 5. Core Data Flow

## Database Upload

```text
User selects .db
       ↓
File validation
       ↓
SQLite validation
       ↓
Database connection
       ↓
Schema extraction
       ↓
DatabaseSchema object
       ↓
Schema Explorer
```

---

# 6. Natural Language Query Flow

```text
User Question
      ↓
Conversation Context
      ↓
Schema Context
      ↓
AI Intent Analysis
      ↓
Ambiguous?
 ┌────┴─────┐
Yes         No
 ↓           ↓
Clarify     Generate SQL
              ↓
        SQL Validation
              ↓
        Optimization
              ↓
        EXPLAIN PLAN
              ↓
        User Review
              ↓
        Revalidation
              ↓
        Read-Only Execute
              ↓
        Query Results
              ↓
     ┌────────┴─────────┐
     ↓                  ↓
Explanation          Chart
     ↓                  ↓
     └────────┬─────────┘
              ↓
       Save Conversation
```

---

# 7. Database Layer

The database layer should be the only layer responsible for direct SQLite interaction.

Responsibilities:

* Open database
* Close database
* Execute read-only queries
* Retrieve schema metadata
* Retrieve indexes
* Retrieve views
* Execute EXPLAIN QUERY PLAN
* Return structured results

The UI must never directly access SQLite.

---

# 8. Schema Layer

Create a normalized schema representation.

Example:

```typescript
interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  primaryKeys: string[];
  foreignKeys: ForeignKeySchema[];
}

interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string | null;
}

interface RelationshipSchema {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

interface IndexSchema {
  name: string;
  tableName: string;
  columns: string[];
  unique: boolean;
}

interface ViewSchema {
  name: string;
  sql?: string;
}
```

---

# 9. AI Architecture

Use an adapter pattern.

```text
Application
     ↓
AIService
     ↓
AIProvider Interface
     ↓
┌──────────┬──────────┬───────────┐
│ Gemini   │ OpenAI   │ Local LLM │
└──────────┴──────────┴───────────┘
```

Example:

```typescript
interface AIProvider {
  generateSQL(input: SQLGenerationInput): Promise<SQLGenerationResult>;

  clarifyQuestion(
    input: ClarificationInput
  ): Promise<ClarificationResult>;

  explainSQL(
    input: SQLExplanationInput
  ): Promise<SQLExplanationResult>;

  optimizeSQL(
    input: OptimizationInput
  ): Promise<OptimizationResult>;

  explainQueryPlan(
    input: QueryPlanInput
  ): Promise<QueryPlanExplanation>;
}
```

---

# 10. AI Context Construction

Do not send the entire database blindly to an external AI service.

Construct relevant context.

Example:

```text
User Question
+
Relevant Schema
+
Relationships
+
Relevant Indexes
+
Conversation Context
+
SQL Rules
```

Do not send complete table contents unless explicitly required and permitted by the architecture.

Prefer metadata and minimal required data.

---

# 11. SQL Security Architecture

The security layer is mandatory.

```text
Generated SQL
     ↓
Parser
     ↓
Statement Type Detection
     ↓
Read-Only Check
     ↓
Dangerous Operation Check
     ↓
Validation Result
```

Example:

```typescript
interface SQLValidationResult {
  valid: boolean;
  statementType?: string;
  errors: string[];
  warnings: string[];
}
```

---

# 12. Query Service

The Query Service coordinates:

```text
SQL
 ↓
Validation
 ↓
Optimization Analysis
 ↓
EXPLAIN
 ↓
User Confirmation
 ↓
Execution
```

It should not contain UI code.

---

# 13. Optimization Architecture

Optimization consists of deterministic rules plus AI assistance.

Recommended flow:

```text
SQL
 ↓
Static Analysis
 ↓
Rule Detection
 ↓
Optimization Suggestions
 ↓
AI-assisted Rewrite
 ↓
Validate Rewritten SQL
 ↓
Present to User
```

Deterministic rules should handle obvious issues where possible.

Examples:

```text
SELECT *
Missing useful filtering
Potential index opportunity
Unnecessary join
```

The optimizer must never silently change and execute a query.

---

# 14. Query Plan Architecture

```text
Validated SELECT
       ↓
EXPLAIN QUERY PLAN
       ↓
SQLite Plan Rows
       ↓
Plan Parser
       ↓
Plan Model
       ↓
Human Explanation
```

Example:

```typescript
interface QueryPlanNode {
  id: number;
  parentId: number;
  detail: string;
  operation?: string;
}
```

---

# 15. Visualization Architecture

```text
QueryResult
    ↓
Result Analyzer
    ↓
Column Type Detection
    ↓
Chart Recommendation
    ↓
Chart Renderer
```

The recommendation should be deterministic where possible.

Example:

```text
Category + Numeric
        ↓
Bar Chart
```

```text
Date + Numeric
        ↓
Line Chart
```

Users must always be able to change the chart type.

---

# 16. Conversation Architecture

Conversation entities:

```text
User
 ↓
Conversation
 ↓
Message
 ↓
AI Response
 ↓
SQL
 ↓
Execution
 ↓
Result Metadata
```

A message may contain:

```typescript
interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  createdAt: string;
}
```

---

# 17. Authentication Architecture

Authentication must be isolated from database query functionality.

```text
Authentication
     ↓
Session
     ↓
Protected Application
```

A user must not be able to access another user's conversations.

---

# 18. Error Handling

Errors should be handled at service boundaries.

Categories:

```text
AUTH_ERROR
DATABASE_ERROR
INVALID_DATABASE
SCHEMA_ERROR
AI_ERROR
SQL_VALIDATION_ERROR
SQL_EXECUTION_ERROR
EXPORT_ERROR
NETWORK_ERROR
```

Never expose:

* API keys
* Database credentials
* Internal filesystem paths unnecessarily
* Raw sensitive provider errors

---

# 19. Offline Architecture

Offline-capable services should not depend on cloud services.

Local:

```text
SQLite
Schema
SQL Validator
Query Execution
EXPLAIN
Charts
```

Online:

```text
Cloud AI
Cloud Authentication
Cloud Synchronization
```

The system should degrade gracefully when internet connectivity is unavailable.

---

# 20. Testing Architecture

Tests must exist at multiple levels.

```text
Unit Tests
Integration Tests
Security Tests
End-to-End Tests
```

Important security tests:

```text
SELECT              → Allowed
INSERT              → Blocked
UPDATE              → Blocked
DELETE              → Blocked
DROP                → Blocked
ALTER               → Blocked
TRUNCATE            → Blocked
CREATE              → Blocked
ATTACH              → Blocked
DETACH              → Blocked
```

---

# 21. Architectural Constraints

Agents must not:

* Introduce a second database engine without approval.
* Bypass SQL validation.
* Execute AI-generated SQL directly.
* Hard-code an AI provider into business logic.
* Put secrets in source code.
* Mix UI and database logic.
* Automatically perform destructive operations.
* Remove existing security checks to make a feature work.
* Replace the architecture with a simpler chatbot implementation.

---

# 22. Architecture Evolution

Architecture can change when necessary.

However, an agent changing a major architectural decision must document:

```text
Problem
Current Design
Proposed Change
Reason
Impact
Migration Required
```

Do not make major architecture changes silently.
