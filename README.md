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

## Job deadlines

Recruiters can set an optional **Application deadline** when creating or editing a job.
Clear the field to remove the deadline. Dates use `YYYY-MM-DD` and UTC.
The recruiter API accepts and returns `application_deadline`; an empty value or `null` clears it.
Leaving the field out of a PATCH keeps the existing date.

Demo: post a job with tomorrow's deadline, sign in as a job seeker, save it, then open
**Reminders** and **Notifications**. The saved job appears in the three-day reminder window.

Tracked in #139.

## Candidate review

Open **View applicants** on your posting, then **View candidate**.
The panel shows the candidate's current name, headline, location, bio, skills, and LinkedIn link.
You can preview or download the PDF/DOCX submitted with that application.
If the resume was not attached or has been deleted, the panel says it is unavailable.
Other recruiters cannot open the candidate or resume through these routes.

Tracked in #141.

## Interview scheduling

Recruiters can open **View applicants** on a posting and schedule an interview
for a candidate. Enter a future date and time, duration, location or meeting link,
and optional notes. The **Interviews** page shows upcoming interviews and lets the
recruiter change or cancel them. Job seekers see their own upcoming interviews on
the same page and receive in-app notifications when an interview is scheduled,
changed, or cancelled. Times are entered and displayed in the browser's local time
zone; the API stores the corresponding UTC instant.

The authenticated interview API provides:

- `GET /api/interviews` returns interviews for the signed-in job seeker or recruiter.
- `POST /api/interviews` schedules an interview for an application on the
  recruiter's own job, with `applicationId`, `scheduledAt` (ISO 8601 with a time
  zone), `durationMinutes`, `location`, and optional `notes`.
- `PATCH /api/interviews/:id` updates scheduling details, and
  `POST /api/interviews/:id/cancel` cancels an interview. These operations are
  restricted to the recruiter who owns the posting.

Cancelled interviews remain in the database for history but are omitted from the
upcoming list. Notifications are in-app; no email delivery is configured.

## Recruiter dashboard application filters

On **Recruiter dashboard**, open **Filters** beside the search and sort controls.
Choose an application status and/or **Applied from** / **Applied to**, then select
**Apply filters**. Only postings with at least one application matching all selected
criteria appear. Dates are inclusive and use UTC. Search, posting-status tabs, and
sorting work alongside these filters; overview totals still describe all postings.
The filter summary stays visible when the panel is collapsed, and **Clear application
filters** resets these criteria while preserving search and sort. Filters persist in
the URL and carry into **View applicants**.

`GET /api/recruiter/jobs` accepts `applicationStatus`, `from`, and `to`. It returns the
owned portfolio with `matchingApplicationCount` on each posting so the dashboard can
filter without changing summary totals. `applicationCount` remains the total count.

## Resume-to-job match

Job seekers can open a job posting, choose an uploaded PDF/DOCX resume, and click
**Compare resume to this job**. The report includes:

- A resume evidence coverage percentage and matched/partial/missing counts.
- Requirement-by-requirement explanations, quoted resume evidence, and suggested next steps.
- Missing keywords from the posting, with a reminder to add only truthful qualifications.

The score gives each AI-extracted requirement equal weight: matched = 1, partial = 0.5,
missing = 0, divided by the number of requirements. It describes resume evidence,
not hiring odds or candidate suitability. AI can miss requirements; review the full
posting. The report supports up to 40 distinct requirements and 20 missing keywords.

This uses the existing `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and optional `GEMINI_MODEL`
in `server/.env`. Without a key, the comparison shows an unavailable message and can
be retried. Resume text and posting details are sent to Google Gemini after contact
redaction; names and other resume content may remain. Google's free tier may use
inputs to improve models. Reports are private, returned with `no-store`, and are not
persisted or shared with recruiters. No application is submitted and no resume is edited.

`POST /api/resume/:id/match` accepts `{ "jobId": 123 }`. It requires an authenticated
job seeker, an owned resume, and an open posting. The server validates structured AI
output and checks that requirement/evidence quotes occur in the input documents before
calculating the score. Tests stub Gemini and never send real resumes to the provider.
