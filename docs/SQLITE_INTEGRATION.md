# SQLite Integration Architecture

This document describes how SQL-Sensi integrates with SQLite databases, following the architecture and security constraints.

## 1. Engine
We use the native `node:sqlite` module (introduced in Node.js v22+) instead of `better-sqlite3`.
* **Reason:** It is built-in, requiring no native compilation (no `node-gyp`), which vastly simplifies building cross-platform Electron binaries.
* **Limitations:** It is currently experimental and synchronous. All database interactions will happen in the Electron Main process to avoid blocking the Renderer UI thread.

## 2. Process Architecture
* **Main Process (Node.js):** Opens `.db` files, executes queries using `node:sqlite`, applies safety checks, and manages connections.
* **Renderer Process (React UI):** Requests query execution or schema info via IPC. Never directly accesses the filesystem.
* **IPC Bridge (Preload):** Exposes a typed API (`window.electronAPI.database`) to the renderer.

## 3. Database Service (Phase 3)
The `DatabaseService` is a singleton class running in the Main process.
* **Connection Management:** Maintains an open connection to the currently active `.db` file. Only one database is open at a time.
* **Connection Mode:** `sqlite.DatabaseSync(dbPath, { readOnly: true })`.
* **Lifecycle:** Allows opening, reading schema, executing queries, and safely closing the connection.

## 4. Security & Governance (Read-Only Safety)
Since SQL-Sensi allows users and AI to generate and execute SQL queries on uploaded databases, strict read-only safety must be enforced:
1. **Connection Level:** The database is opened in `readOnly: true` mode. This is the first line of defense.
2. **AST Validation Level:** Before any query string is sent to SQLite, it is parsed by `SQLValidator` (Phase 8). The validator ensures:
    * The statement type is `SELECT` or `PRAGMA`.
    * Destructive commands (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `ATTACH`, `DETACH`) are blocked.
    * Multi-statement queries containing trailing destructive commands are blocked.
3. **Execution Level:** PRAGMA commands are restricted (e.g., preventing PRAGMA schema_version edits).

## 5. Performance & Concurrency
* **Synchronous Execution:** Because `node:sqlite` is synchronous, long-running queries will block the Main process event loop.
* **Mitigation Strategy:** We limit query execution time using SQLite's `PRAGMA max_page_count` or by setting a progress handler if supported. In future iterations, we may spawn a dedicated Worker thread within the Main process to execute queries asynchronously.
* **Pagination:** The `DatabaseService` enforces `LIMIT` clauses on all user/AI queries to prevent memory exhaustion and UI freezes when fetching large result sets (e.g., maximum 500 rows per query).

## 6. Error Handling
* Any SQLite error (e.g., syntax error, table not found) is caught by the `DatabaseService` and mapped to a standard `AppError` object.
* `AppError` is returned across the IPC bridge as a `ServiceResult<T>` with `{ success: false, error: AppError }`.
* The UI displays the precise error message to help the user (and the AI) correct the query.

## 7. Next Steps (Days 16-20)
* Create the database upload/selection UI (Day 16).
* Validate the selected file (Day 17).
* Connect and inspect basic properties (Day 18).
* Implement `DatabaseService` (Day 19).
* Wire up safe internal query execution (Day 20).
