# CI and delivery

## Current status

- **Continuous integration:** configured in `.github/workflows/ci.yml`.

## Pipeline

```text
feature/fix branch
        |
        v
pull request to dev ----> CI: backend tests + frontend tests/build
        |                                  |
        |<--------- review/fix ------------|
        v
       dev
        |
        v
release pull request to main ----> same CI checks ----> main
```

The `CI` workflow runs for:

| Event | Branches | Purpose |
| --- | --- | --- |
| `pull_request` | `dev`, `main` | Validate a change before merge |
| `push` | `dev`, `main` | Verify the merged branch state |
| `workflow_dispatch` | selected manually | Re-run checks from the Actions tab |

Concurrent runs for the same branch or pull request are cancelled when a newer commit is pushed.

## CI jobs

Both jobs use Ubuntu and Node.js 24. Dependencies are installed from the committed lockfiles with `npm ci` and cached by `actions/setup-node`.

### Backend tests

Working directory: `server/`

```bash
npm ci
npm test -- --ci
```

This runs the Jest API test suite.

### Frontend checks

Working directory: `client/`

```bash
npm ci
npm test -- --run
npm run build
```

This runs the Vitest suite and confirms that Vite can produce a production bundle.