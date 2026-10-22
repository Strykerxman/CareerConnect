# CI and delivery

## Current status

- **Continuous integration:** configured in `.github/workflows/ci.yml`.
- **Continuous deployment:** not configured. No production host or deployment environment has been selected.

Do not describe the project as having CD until a workflow deploys a verified revision to a real environment.

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

## Required GitHub settings

A workflow reports checks, but it does not prevent someone from bypassing them. Configure branch protection or repository rulesets under **Settings → Rules → Rulesets**.

Recommended rules for both `dev` and `main`:

1. Require changes through a pull request.
2. Require at least one approval from someone other than the author.
3. Require the **Backend tests** and **Frontend checks** status checks.
4. Require branches to be up to date before merging.
5. Require all review conversations to be resolved.
6. Block force pushes and branch deletion.

For `main`, only merge release pull requests from `dev`. Administrators should follow the same rules unless an emergency procedure is documented.

> GitHub only lets you select a status check after that check has run at least once. Push this workflow, wait for its first run, and then add both checks to the rulesets.

## Adding continuous deployment

A safe deploy workflow cannot be added until the team chooses where the frontend and backend will run. Before implementing CD, decide and document:

1. the frontend and backend hosting providers;
2. staging and/or production environment URLs;
3. how production SQLite data and uploaded resumes will persist across releases, or which managed storage will replace them;
4. production values for `JWT_SECRET`, `CLIENT_ORIGIN`, `DB_PATH`, `UPLOAD_DIR`, and `VITE_API_URL`;
5. who can approve production deployments and how rollback works.

Store credentials in GitHub **Environments** or **Actions secrets**, never in the repository. A future deployment job should:

1. run only after both CI jobs pass;
2. deploy an immutable revision from `main`;
3. use a protected `production` environment;
4. run a health check after deployment; and
5. preserve or migrate production data safely.

## Pull request and sprint checklist

For each pull request:

- link its issue (for example, `Closes #42`);
- confirm the issue has testable acceptance criteria;
- keep the project-board status and assignee current;
- include the validation performed;
- obtain review from someone other than the author; and
- merge only with green CI.

At sprint or release close:

- reconcile merged pull requests with open issues and board columns;
- verify acceptance tests, not only implementation tasks;
- open a `dev` → `main` release pull request;
- record known defects and incomplete stories; and
- tag the release if the team is producing versioned releases.
