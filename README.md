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

AI resume feedback (US-15) uses the Google Gemini API. To enable it, create a free key at https://aistudio.google.com/apikey and add `GEMINI_API_KEY=<your key>` to `server/.env`. On Gemini's free tier, Google may use the text it receives to improve its models; contact details are removed before resumes are sent. Without a key the rest of the app works normally and the feedback button shows an "unavailable" message. The tests never call the real API.

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

## Recruiter applicants (Sprint 3)

Recruiters can open **View applicants** on any of their dashboard postings, including closed postings.
The page shows candidate names, application dates (UTC), and saved statuses. Choose Applied,
Under Review, Interview, Offered, or Rejected and click **Save**. Saving disables that applicant's
controls and reports success or failure. Failed changes can be retried.

The authenticated recruiter API provides:

- `GET /api/recruiter/jobs/:id/applications` → `{ job, applications }` (an empty array when nobody has applied).
- `PATCH /api/recruiter/jobs/:id/applications/:applicationId` with `{ "status": "Interview" }` → `{ message, application }`.

Both routes require the recruiter role and an owned posting. Another recruiter's posting returns
404, as does an application outside the selected posting; malformed IDs and invalid statuses return
400. The existing SQLite applications table stores the change; no migration is required.

To demonstrate locally, start the server and client using the instructions above, then:

1. Register a recruiter, open **Dashboard**, and publish a job. Note its numeric ID in the listing URL.
2. In a separate browser profile or private window, register a job seeker, upload a PDF or DOCX under
   **Resumes**, then open **Jobs**, select that posting, choose the resume, and apply.
3. In the recruiter window, refresh **Dashboard**, open **View applicants**, choose **Interview**, and
   click **Save**. Confirm the saved status and success message. Closing the posting still allows this.
4. In the seeker window, open or refresh **My Applications** and **Statistics**. The application shows
   Interview, and its count moves from Applied to Interview.
5. In a third browser profile, register a different recruiter. Visit
   `http://localhost:5173/recruiter/jobs/JOB_ID/applications` using the first posting's ID.
   The page reports “Job not found.” API modification attempts are also denied (covered by backend tests).

Updates appear for the job seeker after refreshing or revisiting the page. Concurrent recruiter
sessions use the last saved status; there is no live update or conflict detection.
