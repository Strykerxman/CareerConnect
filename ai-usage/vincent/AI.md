# AI Usage Documentation

**Project:** SOEN 341 – CareerConnect (Sprint 1)
**Scope of this log:** Front-end UI tasks #25 (Profile page), #27 (Resume upload UI), #29 (Resume list UI), and Layout & styling
**Tool used:** Claude (Claude Sonnet 5, by Anthropic) via the claude.ai chat interface
**Date:** September 27, 2026

---

## 1. Summary

Claude was used to generate a **UI-only front-end template** for the Profile, Resumes, and layout tasks. No backend, API, or data logic was requested or produced. The output was first delivered as a single HTML page, then redone as React components matching the project's file names. This document records every prompt, what the AI did in response, and what still requires human work.

## 2. Input provided to the AI

- Uploaded file: `SOEN341_CareerConnect_Project_Sprint1.docx` (project description for context)
- The AI extracted the document text (Python `python-docx`) to understand the project before building.

## 3. Prompt log

### Prompt 1 – Task assignment (with uploaded docx)

> Profile page (#25)
>
> * Own Profile.jsx: loading and saving, the success and error banners, a comma-separated skills field, and a character counter on the About field.
> * Recruiters see a Company field and no Skills field.
>
> Resume upload UI (#27)
>
> * Own the upload area in Resumes.jsx: drag and drop plus a file picker, an "Uploading…" state, and showing the API's error message (wrong type, too big, limit reached).
>
> Resume list UI (#29)
>
> * Own the list: name, size, and date for each resume, the "Primary" tab, and the Download, Make primary, and Delete buttons (Delete asks for confirmation).
>
> Layout and styling
>
> * Own AppLayout.jsx (top bar and navigation) and styles.css.
> * Check the pages at phone width and keyboard focus visibility.
> * Take screenshots of each screen for the demo and for the team's reference in future sprints.
>
> do these tasks associated with the project in the file. just make the front end template. you can have buttons but they must not do anything. just do the ui

**AI output:** A single self-contained HTML file (`careerconnect-ui.html`) containing the Profile page, Resumes page (upload area + list), shared top bar/nav, responsive styles down to phone width, and visible keyboard focus rings. It was also published as a hosted page. Action buttons (Save, Download, Make primary, actual Delete) were left non-functional. Structural UI behaviors were wired: page navigation, role preview toggle (Recruiter shows Company, hides Skills), live About character counter, banner preview toggles, resume tabs, and the Delete confirmation dialog.

### Prompt 2 – View source

> show code

**AI output:** Displayed the full source of the HTML file.

### Prompt 3 – Convert to React

> redo it with react framework

**AI output:** Rebuilt the UI as React source files using the file names from the tickets:

| File | Purpose |
|---|---|
| `src/App.jsx` | Wires layout and pages together; holds page/role state |
| `src/components/AppLayout.jsx` | Top bar, main navigation, role preview select |
| `src/pages/Profile.jsx` | Profile form, About counter, Skills/Company by role, banners |
| `src/pages/Resumes.jsx` | Upload area, static "Uploading…" and error states, resume list, tabs, delete confirmation |
| `src/styles.css` | Shared styles, responsive rules, focus-visible styles |

Uses plain React with `useState` only (no extra libraries). Data is hard-coded sample data.

### Prompt 4 – This document

> make a .md document, documenting ai usage in this chat  including this prompt

**AI output:** This file.

## 4. What the AI did NOT do

- **No real functionality:** No API calls, saving/loading, file upload, download, make-primary, or delete logic (per the instruction "buttons must not do anything").
- **No screenshots:** The "take screenshots of each screen" item remains a manual task for the team.
- **No phone-width / keyboard-accessibility audit:** Responsive rules and focus styles were written into the CSS, but the AI did not run a browser test. The team must verify these manually.
- **React files not compiled or run:** The React version was written but not built or executed in a Vite/CRA project during this chat. It should be tested in the actual project before merging.
- **No integration with the team's real codebase:** Existing routing, auth context, API client, or design tokens in the repo were not seen by the AI and may conflict with the template.

## 5. Human review checklist

- [ ] Run the React files in the project and fix any import/path issues
- [ ] Check layout at phone width (~375px) and with keyboard-only navigation (Tab / Shift+Tab / Enter)
- [ ] Replace hard-coded sample data and demo-only controls (role "Preview as" select, banner preview buttons, static upload state examples) with real state/API wiring
- [ ] Confirm styling matches the team's conventions
- [ ] Capture screenshots of each screen for the demo and future-sprint reference
- [ ] Review and understand all AI-generated code before submitting it as your own work, and follow the course's academic-integrity policy on AI disclosure

## 6. Artifacts produced

- `careerconnect-ui.html` – single-file HTML version (first iteration)
- `careerconnect/src/` – React version (App.jsx, AppLayout.jsx, Profile.jsx, Resumes.jsx, styles.css)
- `AI_USAGE.md` – this document