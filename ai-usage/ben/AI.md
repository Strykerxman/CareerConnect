## November 19, 2026 — Job deadlines (#139)

- Task: Add a deadline field to the recruiter job form and API.
- AI use: Codex helped write the form changes, date validation, and tests.
- Request: Implement deadline management on dev and record the work on GitHub.
- Result: Recruiters can set, edit, or clear the deadline used by reminders.
- Checks: Reviewed the diff, ran the backend and frontend tests and build, and checked the form, reminder, and notification in the browser using a separate demo database.
- Decision: Used the changes after testing. No user database was changed for the demo.
- Responsible member: Benjamin Senay.

## November 19, 2026 — Candidate review (#141)

- Task: Let recruiters review a candidate and the resume attached to an application.
- AI use: Codex helped build the profile panel, protected API routes, and tests.
- Request: Implement candidate review on dev and record the work on GitHub.
- Result: The posting's recruiter can open the candidate's profile and preview or download the submitted resume.
- Checks: Code review, automated access and UI tests, and a browser check using demo accounts.
- Decision: Used after review and testing. The panel uses the submitted resume, not a newer upload.
- Responsible member: Benjamin Senay.
