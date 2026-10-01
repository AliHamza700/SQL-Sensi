# Agent Development Rules

## 1. Purpose

This file defines the rules that every coding agent must follow while developing the project.

These rules exist to prevent:

* Architectural drift
* Security vulnerabilities
* Unnecessary dependencies
* Broken functionality
* Uncontrolled scope expansion
* Poor code quality
* AI-generated SQL from being executed unsafely

---

# 2. General Rule

Before modifying code:

1. Understand the existing implementation.
2. Read relevant documentation.
3. Identify dependencies.
4. Check existing tests.
5. Make the smallest reasonable change.
6. Test the change.

Do not rewrite working modules unnecessarily.

---

# 3. Source of Truth

The project documentation is the source of truth.

Priority:

```text
PRD.md
    ↓
architect.md
    ↓
implement-plan.md
    ↓
rules.md
    ↓
Existing Code
```

If the existing code conflicts with the documented architecture, do not silently redesign the system.

Document the conflict and resolve it deliberately.

---

# 4. No Scope Creep

Agents must not introduce features that are outside the current MVP without explicit approval.

Do NOT independently add:

* PostgreSQL
* MySQL
* MongoDB
* Database write operations
* Automatic index creation
* Database administration
* Team collaboration
* Scheduled reports
* Advanced dashboards
* Unrequested AI providers
* Unrequested authentication systems

Future features must remain separate from MVP implementation.

---

# 5. Security Rules

## Rule 5.1 — Never Trust AI Output

AI-generated SQL is untrusted input.

Never execute:

```typescript
db.execute(aiGeneratedSQL);
```

without validation.

Correct:

```text
AI SQL
 ↓
SQL Parser
 ↓
Security Validation
 ↓
User Review
 ↓
Revalidation
 ↓
Execution
```

---

# 6. Read-Only Database Rule

The MVP must be read-only.

Block:

```text
INSERT
UPDATE
DELETE
DROP
ALTER
TRUNCATE
CREATE
REPLACE
ATTACH
DETACH
```

Also reject multi-statement input if the security architecture determines that it could bypass the intended read-only policy.

Allowed operations should be explicitly defined rather than inferred from AI output.

---

# 7. Revalidate Edited SQL

If the user edits generated SQL:

```text
Original SQL
 ↓
Validation
 ↓
User Edit
 ↓
Validation AGAIN
 ↓
Execution
```

Never assume previously validated SQL remains safe after editing.

---

# 8. No Automatic Destructive Actions

Agents must never implement a feature that allows AI to automatically:

* Delete records
* Update records
* Insert records
* Drop tables
* Alter schemas
* Create indexes automatically
* Modify the database

Optimization suggestions may be displayed, but database modifications require explicit future scope approval.

---

# 9. SQL Injection Protection

Never construct SQL using unsafe string interpolation with user-controlled values.

Bad:

```typescript
const sql = `SELECT * FROM users WHERE name = '${name}'`;
```

Use parameterized queries whenever parameters are supported.

---

# 10. AI Provider Rule

Never hard-code the AI provider throughout application logic.

Bad:

```typescript
import Gemini from "...";
```

inside multiple business modules.

Preferred:

```text
Business Logic
      ↓
AIService
      ↓
AIProvider
      ↓
Provider Adapter
```

The provider must be replaceable.

---

# 11. API Key Rule

Never place:

```text
API keys
Passwords
Tokens
Secrets
```

directly inside source code.

Never commit secrets to Git.

Use environment/configuration management.

Never expose secret API keys to the frontend unnecessarily.

---

# 12. Database Privacy

Do not send complete database contents to an external AI provider unnecessarily.

Prefer:

```text
Schema
+
Relevant metadata
+
Relevant context
```

Only send data required for the specific feature and permitted by the application's privacy design.

---

# 13. Schema Context Rule

SQL generation must be schema-aware.

The AI should receive relevant information such as:

```text
Tables
Columns
Types
Primary Keys
Foreign Keys
Relationships
Relevant Indexes
Conversation Context
```

Do not expect the AI to correctly generate SQL without sufficient schema information.

---

# 14. Ambiguity Rule

The AI must ask for clarification when the question is ambiguous.

Example:

```text
Show the best customers.
```

Do not silently decide what "best" means.

Ask:

```text
Do you mean:

1. Highest total spending?
2. Most orders?
3. Highest average order value?
```

---

# 15. Result Truthfulness Rule

Never fabricate database results.

The natural-language answer must be derived from actual query results.

Bad:

```text
There are 10,000 customers.
```

when the query was never executed.

Correct:

```text
SQL executed successfully.

Result:
10,000 customers.

Explanation:
There are 10,000 customers in the database.
```

---

# 16. SQL Display Rule

Whenever practical, show users:

```text
Natural-language answer
+
Generated SQL
```

The system should remain transparent about how an answer was obtained.

---

# 17. User Confirmation Rule

Generated SQL should be reviewable before execution.

The user must have the ability to:

* View SQL
* Edit SQL
* Validate SQL
* Execute SQL

---

# 18. Architecture Rules

UI code must not directly access:

* SQLite
* AI providers
* File system
* Authentication database

Use services.

Preferred:

```text
Component
 ↓
Feature/Hook
 ↓
Service
 ↓
Infrastructure
```

---

# 19. Separation of Concerns

Each module must have one primary responsibility.

Examples:

```text
DatabaseService
→ Database operations

SchemaService
→ Schema extraction

SQLValidator
→ SQL security

AIService
→ AI orchestration

OptimizationService
→ SQL optimization

QueryPlanService
→ EXPLAIN analysis

VisualizationService
→ Chart recommendation

ConversationService
→ Conversation persistence
```

Do not create a single `utils.ts` containing the entire application.

---

# 20. TypeScript Rules

Prefer strong typing.

Avoid:

```typescript
any
```

unless there is a documented reason.

Prefer:

```typescript
unknown
```

and validate the value.

Create shared domain types for:

* Database schema
* SQL results
* SQL validation
* AI responses
* Query plans
* Conversations

---

# 21. Error Handling

Never silently swallow errors.

Bad:

```typescript
try {
  ...
} catch {
}
```

Instead:

```typescript
try {
  ...
} catch (error) {
  // Log safely
  // Return structured error
}
```

Errors shown to users should be understandable.

Internal errors should not expose secrets.

---

# 22. Logging

Logs must not contain:

* API keys
* Passwords
* Authentication tokens
* Sensitive database contents

Use structured logging where possible.

---

# 23. Dependency Rule

Before adding a dependency, check whether existing project dependencies already provide the functionality.

Do not add libraries for trivial functionality.

Every new dependency should have a clear purpose.

---

# 24. UI Rules

The UI should prioritize clarity over decoration.

Important states must be visible:

```text
Loading
Success
Error
Empty
Executing
Validating
AI unavailable
Database unavailable
```

Do not leave the user wondering whether an operation is still running.

---

# 25. Loading State

Long operations must show progress/loading state.

Examples:

```text
Analyzing database...
Generating SQL...
Validating SQL...
Analyzing query plan...
Generating chart...
Exporting report...
```

---

# 26. AI Failure Rule

If the AI provider fails:

The application should not crash.

Show a useful message such as:

```text
The AI service is currently unavailable.
You can still inspect the database and execute validated local queries.
```

Offline/local functionality should continue where possible.

---

# 27. Database Failure Rule

If a database fails to load:

Do not partially initialize the application with invalid schema information.

Show a clear error and allow the user to select another database.

---

# 28. Query Execution Rule

Every execution must have:

```text
Validation
+
Controlled database access
+
Error handling
+
Structured result
```

Return structured results instead of raw driver-specific objects whenever practical.

---

# 29. Query Timeout / Resource Protection

Long-running queries must not be allowed to freeze the application indefinitely.

Where supported, implement:

* query timeout
* cancellation
* row/result limits
* pagination

The exact limits may be configurable.

---

# 30. Large Result Sets

Do not automatically render millions of rows in the UI.

Use:

```text
Pagination
Virtualized tables
Result limits
```

where appropriate.

---

# 31. EXPLAIN Rule

Do not claim a query is optimized merely because it executes successfully.

The optimizer and query-plan analyzer should distinguish:

```text
Execution Success
```

from:

```text
Performance Quality
```

---

# 32. Optimization Rule

Optimization suggestions must be explainable.

Example:

```text
Issue:
The query scans the entire orders table.

Suggestion:
Consider an index on orders.customer_id.

Reason:
The column is used for filtering/joining.
```

Do not produce unexplained "magic" optimizations.

---

# 33. Index Recommendation Rule

Index suggestions must not automatically modify the database.

The application may display:

```sql
CREATE INDEX ...
```

as a recommendation.

It must not execute it in the MVP.

---

# 34. Visualization Rule

Charts must be generated from actual query results.

Never generate a chart from imagined or AI-generated values.

---

# 35. Conversation Context Rule

Follow-up questions should use relevant conversation context.

Example:

```text
User:
Show top 10 products.

User:
Only in 2026.
```

The system should understand that "only in 2026" refers to the previous query context.

Do not include unlimited conversation history in every AI request.

Use relevant context.

---

# 36. Export Rule

Exports must use actual application results.

Do not export data that was not produced by the current query/result state.

---

# 37. Testing Rule

Every significant feature requires tests.

At minimum:

```text
Happy Path
Invalid Input
Edge Case
Error Case
Security Case
```

---

# 38. Security Test Cases

At minimum test:

```sql
SELECT * FROM users;
```

Expected:

```text
Allowed
```

Test:

```sql
DELETE FROM users;
```

Expected:

```text
Blocked
```

Test:

```sql
DROP TABLE users;
```

Expected:

```text
Blocked
```

Test:

```sql
UPDATE users SET name = 'test';
```

Expected:

```text
Blocked
```

Test:

```sql
INSERT INTO users VALUES (...);
```

Expected:

```text
Blocked
```

---

# 39. Git Rules

Use meaningful commits.

Good:

```text
feat: add sqlite schema extraction
feat: add sql validation service
fix: block multi-statement queries
test: add destructive sql security tests
```

Avoid:

```text
update
changes
final
new
stuff
```

---

# 40. No Fake Implementations

Do not use fake implementations disguised as production functionality.

Bad:

```typescript
return {
  answer: "There are 100 products"
};
```

unless it is explicitly part of a test/mock.

---

# 41. No Silent Fallbacks

Do not silently replace:

* AI-generated SQL with hard-coded SQL
* database results with mock data
* authentication with fake authentication
* query plans with fake explanations

If a service is unavailable, report the actual state.

---

# 42. Documentation Rule

When adding a major feature, update relevant documentation.

Document:

* Purpose
* Inputs
* Outputs
* Dependencies
* Security considerations
* Testing

---

# 43. Breaking Change Rule

Before making a breaking change, identify:

```text
What changes?
Why?
Which modules are affected?
Which tests must change?
Does documentation need updating?
```

---

# 44. Refactoring Rule

Do not refactor unrelated code while implementing a feature unless the refactor is necessary.

Keep changes focused.

---

# 45. Agent Communication Rule

When an agent finishes a task, report:

```text
Implemented:
- ...

Files changed:
- ...

Tests:
- ...

Known issues:
- ...

Next recommended step:
- ...
```

---

# 46. Stop Conditions

An agent should stop and ask for clarification when:

* Requirements conflict.
* A destructive operation appears necessary.
* Architecture needs a major change.
* Security cannot be guaranteed.
* Required credentials are missing.
* A third-party service must be introduced unexpectedly.
* The task would significantly expand MVP scope.

Do not guess on major architectural or security decisions.

---

# 47. Final Quality Gate

Before declaring the project ready, verify:

```text
[ ] Application builds
[ ] TypeScript checks pass
[ ] Tests pass
[ ] Authentication works
[ ] SQLite upload works
[ ] Schema extraction works
[ ] Schema Explorer works
[ ] AI SQL generation works
[ ] Ambiguity handling works
[ ] SQL validation works
[ ] Destructive SQL is blocked
[ ] Edited SQL is revalidated
[ ] Read-only execution works
[ ] Results are real
[ ] SQL optimization works
[ ] EXPLAIN works
[ ] Query-plan explanation works
[ ] Charts use real data
[ ] Conversation context works
[ ] Export works
[ ] Offline functionality works where specified
[ ] Secrets are protected
[ ] No obvious security bypass exists
[ ] Documentation is updated
```

---

# 48. Golden Rule

## Never sacrifice security or data correctness for convenience.

If there is a choice between:

```text
Fast implementation
```

and:

```text
Safe and correct implementation
```

choose the safe and correct implementation.
