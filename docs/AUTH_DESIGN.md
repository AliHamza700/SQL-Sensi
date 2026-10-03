# Authentication System Architecture & Design
## SQL-Sensi — Phase 2 (Week 2 / Days 8–14)

---

## 1. Overview & Objectives

SQL-Sensi is designed as a secure desktop analytics assistant built with cloud-readiness in mind (PRD §5). Although user-uploaded SQLite files are queried in local read-only mode, the application requires robust authentication to:
1. Provide personalized conversation history, query saves, and preferences per user account.
2. Ensure account isolation across multi-user environments and cloud deployments.
3. Establish clear boundaries between internal system state and untrusted user data.

---

## 2. Core Architectural Principles for Auth

### Principle 1: Strict Database Isolation
The authentication system **never** shares tables or connections with user-uploaded databases.
- **Analytical Databases**: Ephemeral, user-uploaded `.db` files opened in strict read-only mode via `DatabaseService`.
- **Internal Application Database**: Dedicated database (`./data/sensi_app.db`) managed exclusively by internal services (`AuthService`, `ConversationService`).

### Principle 2: Zero Plaintext Secrets
- Passwords are never stored, logged, or transmitted in plaintext.
- Passwords are encrypted using cryptographic hashing (`scrypt` via Node's built-in `node:crypto`) with cryptographically secure random per-user salts.
- Verification uses `crypto.timingSafeEqual` to prevent timing side-channel attacks.

### Principle 3: Safe DTO Projection
- The `passwordHash` and `salt` fields are strictly internal to the database layer.
- All service boundaries, IPC handlers, and UI contexts consume the sanitized `User` interface.

---

## 3. Data Models

### 3.1 User Model

```typescript
/** Safe User representation exposed to UI and external layers */
export interface User {
  id: string;               // UUID v4
  email: string;            // Normalized lowercase email
  createdAt: string;        // ISO 8601 timestamp
  updatedAt?: string;       // ISO 8601 timestamp
  lastLoginAt?: string | null;
}

/** Internal User record stored in the internal SQLite database */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;     // scrypt derived key (64 bytes hex)
  salt: string;             // 16 bytes random salt (hex)
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}
```

#### Password Hashing Specification
- **Algorithm**: `scrypt` (`node:crypto.scryptSync`)
- **Key Length**: 64 bytes (512 bits)
- **Salt**: 16 bytes cryptographically random bytes via `crypto.randomBytes(16)`
- **Cost Parameters**: $N=16384$, $r=8$, $p=1$ (memory-hard, resistant to GPU/ASIC brute forcing)
- **Zero Native Dependencies**: Standard `node:crypto` library built into Node.js (no native compilation issues).

---

### 3.2 Session Model

```typescript
/** Active session entity representing an authenticated client */
export interface Session {
  id: string;               // UUID v4
  userId: string;           // References User.id
  token: string;            // 256-bit cryptographically random token (hex)
  expiresAt: string;        // ISO 8601 timestamp (now + AUTH_JWT_EXPIRES_IN)
  createdAt: string;        // ISO 8601 timestamp
  isActive: boolean;        // Active status flag
}

/** Internal Session record stored in the internal SQLite database */
export interface SessionRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  isActive: number;         // 1 = active, 0 = revoked/expired
  lastActiveAt: string;
}
```

#### Token Lifecycle Rules
1. **Creation**: On successful registration or login, an unguessable 256-bit entropy token is generated using `crypto.randomBytes(32).toString('hex')`.
2. **Duration**: Default expiration is 7 days from creation (`AppConfig.auth.jwtExpiresIn`).
3. **Validation**: Every authenticated action or session restore checks:
   $$\text{now} < \text{expiresAt} \quad \text{AND} \quad \text{isActive} = 1$$
4. **Revocation**: Upon logout, `isActive` is set to `0`, immediately invalidating subsequent requests even if the token has not reached its expiration date.

---

## 4. Internal Database Schema (SQLite)

Located at `AppConfig.database.appDataDir/sensi_app.db`:

```sql
-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_active_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
```

---

## 5. End-to-End Authentication Flows

### Flow 1: User Registration
```text
User / UI                      Renderer                      Main / AuthService              Internal SQLite
   │                              │                                  │                              │
   │─── Enter Email + Password ──►│                                  │                              │
   │                              │─── Validate Format (Regex/Len) ──│                              │
   │                              │─── auth:register(email, pass) ──►│                              │
   │                              │                                  │─── Check email exists? ─────►│
   │                              │                                  │◄── Result (None found) ──────│
   │                              │                                  │─── Generate Salt (16B)       │
   │                              │                                  │─── Hash with scrypt          │
   │                              │                                  │─── INSERT User + Session ───►│
   │                              │                                  │◄── Stored ───────────────────│
   │                              │◄── Return { user, session } ─────│                              │
   │◄── Redirect to /dashboard ───│                                  │                              │
```

### Flow 2: User Login
```text
User / UI                      Renderer                      Main / AuthService              Internal SQLite
   │                              │                                  │                              │
   │─── Enter Credentials ───────►│                                  │                              │
   │                              │─── auth:login(email, pass) ─────►│                              │
   │                              │                                  │─── SELECT user WHERE email ─►│
   │                              │                                  │◄── Return UserRecord ────────│
   │                              │                                  │─── Compute scrypt(pass, salt)│
   │                              │                                  │─── timingSafeEqual(hash, rec)│
   │                              │                                  │─── Generate Session Token    │
   │                              │                                  │─── INSERT Session ──────────►│
   │                              │◄── Return { user, session } ─────│                              │
   │◄── Set Auth State + Navigate─│                                  │                              │
```

### Flow 3: App Boot / Session Restoration
```text
App Launch                     AuthContext / Hook             Main / AuthService              Internal SQLite
   │                                  │                               │                              │
   │─── Boot Application ────────────►│                               │                              │
   │                                  │─── Read token from storage    │                              │
   │                                  │─── auth:validateSession(tok) ─►│                              │
   │                                  │                               │─── Query active session ────►│
   │                                  │                               │◄── SessionRecord + User ─────│
   │                                  │                               │─── Check not expired?        │
   │                                  │◄── Return User / Expired Error│                              │
   │◄── Show App or Redirect /login ──│                               │                              │
```

### Flow 4: Logout
```text
User / UI                      AuthContext                    Main / AuthService              Internal SQLite
   │                                │                                 │                              │
   │─── Click Sign Out ────────────►│                                 │                              │
   │                                │─── auth:logout(token) ─────────►│                              │
   │                                │                                 │─── UPDATE sessions           │
   │                                │                                 │    SET is_active = 0 ───────►│
   │                                │◄── Ok ──────────────────────────│                              │
   │                                │─── Remove stored token          │                              │
   │◄── Redirect to /login ─────────│                                 │                              │
```

---

## 6. Route Protection Architecture

In Next.js App Router with Electron:
- An **AuthProvider** wraps the application hierarchy in `app/layout.tsx`.
- Protected routes (`/dashboard`, `/database`, `/schema`, `/chat`, `/sql-editor`, `/results`, `/settings`) verify `isAuthenticated`.
- Unauthenticated access automatically redirects to `/login`.
- If an already authenticated user navigates to `/login`, they are automatically redirected to `/dashboard`.

---

## 7. Security Controls Checklist

| Threat | Mitigation Mechanism |
|---|---|
| **SQL Injection** | Parameterized queries with `node:sqlite` statement bindings for all auth queries |
| **Timing Attacks** | `crypto.timingSafeEqual()` on password hash comparisons |
| **Rainbow Table Attacks** | 16-byte cryptographically random salt per user record |
| **Session Hijacking** | High-entropy 256-bit random tokens, explicit expiration, and revocation flags |
| **Weak Passwords** | Client & server-side enforcement: $\ge 8$ chars, uppercase, lowercase, numbers |
| **Data Leakage** | `UserRecord.passwordHash` and `salt` never exposed past database layer |

---

## 8. Implementation Roadmap (Days 9–14)

- **Day 9**: Password hashing & verification utilities (`node:crypto`), input validation, registration service logic.
- **Day 10**: User login service logic with timing-safe comparison, session issuance, and login UI feedback.
- **Day 11**: Full `IAuthService` implementation (`src/services/auth/`), IPC handler wiring in main process.
- **Day 12**: Client token persistence, session restore on app launch, and expiration tracking.
- **Day 13**: `AuthProvider` React context, route guard protection, logout revocation.
- **Day 14**: Unit and integration test suite covering registration, duplicate accounts, login, invalid credentials, and session expiry.
