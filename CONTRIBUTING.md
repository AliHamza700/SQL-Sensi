# Contributing to SQL Sensi

## Commit Message Convention

We use **Conventional Commits** format. Every commit message must follow this structure:

```
type(scope): short description

[optional body]

[optional footer]
```

### Types

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `security` | Security fix or hardening |
| `refactor` | Code change with no functional difference |
| `test` | Adding or fixing tests |
| `docs` | Documentation only changes |
| `chore` | Build config, tooling, dependencies |
| `style` | Formatting, whitespace (no logic change) |
| `perf` | Performance improvement |

### Scopes

| Scope | Area |
|---|---|
| `auth` | Authentication module |
| `db` | Database service / SQLite |
| `schema` | Schema extraction / explorer |
| `ai` | AI provider / service |
| `sql` | SQL generation / validation |
| `query` | Query execution pipeline |
| `optimize` | SQL optimization |
| `explain` | Query plan analysis |
| `chat` | Conversation / chat UI |
| `viz` | Visualization / charts |
| `export` | Export (CSV, Excel, PDF, PNG) |
| `electron` | Electron main process / IPC |
| `ui` | UI components |
| `config` | Configuration |
| `types` | Type definitions |
| `test` | Test files |
| `docs` | Documentation |

### Examples

```bash
feat(auth): add user registration with bcrypt hashing
fix(sql): block ATTACH DATABASE in SQL validator
security(sql): revalidate SQL after user edit
test(sql): add security tests for destructive SQL blocking
docs(arch): update service boundary diagram
chore(deps): update electron to v32
refactor(db): extract schema extraction into SchemaService
```

---

## Branch Naming

```
feature/<short-description>     # New feature
fix/<short-description>         # Bug fix
security/<short-description>    # Security fix
docs/<short-description>        # Documentation
chore/<short-description>       # Tooling / config
```

Examples:
```
feature/auth-login-form
fix/sql-validator-attach-bypass
security/revalidate-edited-sql
docs/update-architecture-diagram
```

---

## Branch Strategy

```
main        ← Production-ready. Never commit directly.
develop     ← Integration branch. PRs merge here first.
feature/*   ← Feature development.
fix/*       ← Bug fixes.
```

### Workflow

```
1. Branch off develop:
   git checkout develop
   git pull
   git checkout -b feature/your-feature

2. Develop and commit often:
   git add .
   git commit -m "feat(scope): description"

3. Push and open PR to develop:
   git push origin feature/your-feature
   # Open PR → develop on GitHub

4. After review and CI passes → merge to develop
5. develop → main for releases
```

---

## Code Review Rules (rules.md §Code Review Checklist)

Before approving any PR, verify:

- [ ] Follows naming conventions
- [ ] No hardcoded credentials or sensitive data
- [ ] Appropriate error handling in place
- [ ] Tests written and passing
- [ ] AI-generated SQL goes through SQL Validator
- [ ] No new destructive SQL operations possible
- [ ] No UI component directly accessing SQLite or AI
- [ ] Documentation updated if needed

---

## Stop Conditions (rules.md §46)

An agent/developer **must stop and ask for clarification** when:

- Requirements conflict
- A destructive operation appears necessary
- Architecture needs a major change
- Security cannot be guaranteed
- Required credentials are missing
- The task would significantly expand MVP scope
