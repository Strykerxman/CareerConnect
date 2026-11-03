# CareerConnect

[![CI](https://github.com/Strykerxman/CareerConnect/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/Strykerxman/CareerConnect/actions/workflows/ci.yml)

CareerConnect is a React and Express application that helps job seekers manage profiles, resumes, job searches, and applications.

## Branch workflow

- `dev` is the default integration branch.
- Feature and fix branches are created from `dev` and merged into `dev` through pull requests.
- `main` is the stable release branch. Promote `dev` to `main` with a reviewed pull request.
- Do not push feature work directly to `dev` or `main`.

Example:

```bash
git switch dev
git pull origin dev
git switch -c feature/issue-42-job-filters

# Make and commit the change, then publish the branch.
git push -u origin feature/issue-42-job-filters
```

## Local development

### Requirements

- Node.js 24
- npm

### Server

```bash
cd server
npm ci
npm run dev
```

For local configuration, copy `server/.env.example` to `server/.env` and replace `JWT_SECRET` with a private value. The API runs at `http://localhost:4000` by default. Multer and the other server dependencies are already installed by `npm ci`; do not install them separately.

### Client

In another terminal:

```bash
cd client
npm ci
npm run dev
```

Vite serves the client at `http://localhost:5173` by default. Run the client and server together for the complete application.

## Local quality checks

Run the same checks used by CI before opening a pull request:

```bash
cd server
npm ci
npm test -- --ci
```

```bash
cd client
npm ci
npm test -- --run
npm run build
```

## CI/CD

GitHub Actions CI is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). On pull requests and pushes to `dev` or `main`, it:

- installs locked dependencies with `npm ci`;
- runs the backend Jest suite;
- runs the frontend Vitest suite; and
- verifies the frontend production build.

The workflow can also be started manually from the Actions tab.

## Repository layout

```text
.github/workflows/   GitHub Actions workflows
client/              React and Vite frontend
docs/                Technical and process documentation
meeting-minutes/     Historical team meeting records
server/              Express, SQLite, and Jest backend
```
