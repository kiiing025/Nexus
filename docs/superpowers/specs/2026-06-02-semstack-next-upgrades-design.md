# SemStack next upgrades design

Date: 2026-06-02

## Goal

Turn SemStack from a working coursework dashboard into a durable personal university hub that is safe to use daily on phone and laptop. The first priority is data permanence, then better coursework organization, then phone-native polish.

## Current app context

SemStack is a single Express app deployed to Vercel. The frontend lives in `index.html`, the API lives in `server.js`, and the current models are `User`, `Task`, and `Note`. Authentication uses JWT. The current database layer uses `sql.js` with a SQLite file, which works for demos and local development but is not durable on Vercel because serverless file storage can be temporary.

## Recommended approach

Use a phased upgrade.

1. Durable database foundation.
2. Subject folders and editable resource links.
3. Schedule and reminders.
4. PWA installability and offline shell.

This order avoids building more important user data on temporary storage. It also keeps each release small enough to test.

## Architecture

### Database

Replace the Vercel runtime SQLite storage with a hosted Postgres-compatible database reached through `DATABASE_URL`.

The code should use a small database adapter boundary:

- `models/database.js` exposes query helpers.
- Existing model files keep calling the adapter.
- Local development can keep a lightweight fallback only if `DATABASE_URL` is missing.
- Production should require `DATABASE_URL` so live data is never silently written to temporary storage.

The exact provider can be Neon, Supabase, Vercel-managed Postgres, or another Postgres host. The implementation should not hardcode provider-specific APIs.

### Data model

Add these tables or equivalent model structures:

- `subjects`: user-owned subject records seeded from the current hardcoded IT subjects.
- `subject_links`: per-subject links for syllabus, Drive, GitHub, Messenger/Facebook, Meet/Zoom, instructor contact, and custom links.
- `folders`: per-subject folders such as Modules, Lectures, Assignments, Projects, Links, Exams, and Custom.
- `folder_items`: folder entries with title, description, url, type, due date, and completion state where useful.
- `events`: dated items for deadlines, exams, meetings, defenses, and lab submissions.

Existing `tasks` and `notes` remain, but subjects should become editable data instead of fixed server constants.

## Product design

### Subject folders

Each subject card gets a compact folder strip: Modules, Lectures, Assignments, Projects, Links, Exams. Tapping a folder opens an in-app panel with entries for that subject. Entries can be links, plain notes, deadlines, or checklist-like deliverables.

### Editable resource links

Add a subject settings panel where the user can paste and save:

- Syllabus
- Google Drive
- GitHub Repository
- Messenger or Facebook group
- Google Meet or Zoom
- Instructor contact
- Custom link labels

Links should open in the current in-app resource panel when the target site allows embedding. If a site blocks embedding, the panel should show a clear fallback button to open it in a new tab.

### Schedule and reminders

Add a schedule panel connected to `events`. Events should support subject, title, date/time, type, and optional folder item association. The dashboard should show:

- Today
- This week
- Upcoming major deadlines
- Subject-specific schedule views

Browser notifications can be a later step. The first version should focus on showing upcoming work reliably.

### PWA phone install

Add:

- `manifest.webmanifest`
- app icons
- service worker for the app shell
- mobile-safe theme colors
- install guidance for iPhone home screen use

The first offline version should cache the shell only. Authenticated API data can still require network access until a later offline-sync design exists.

## API design

Keep the existing auth routes.

Add authenticated routes:

- `GET /api/subjects`
- `PUT /api/subjects/:subjectId`
- `GET /api/subjects/:subjectId/links`
- `PUT /api/subjects/:subjectId/links`
- `GET /api/subjects/:subjectId/folders`
- `POST /api/folders`
- `PUT /api/folders/:id`
- `DELETE /api/folders/:id`
- `POST /api/folder-items`
- `PUT /api/folder-items/:id`
- `DELETE /api/folder-items/:id`
- `GET /api/events`
- `POST /api/events`
- `PUT /api/events/:id`
- `DELETE /api/events/:id`

`GET /api/dashboard` should return the same top-level dashboard payload plus subjects, links, folders, folder item summaries, events, tasks, and notes needed for first render.

## Frontend design

Keep the current LearnIQ-inspired visual direction. Add functionality without making the dashboard dense.

Primary additions:

- Folder strip inside each subject card.
- In-app folder panel.
- Subject settings panel.
- Resource preview panel with embed fallback.
- Schedule panel connected to events.
- PWA install metadata and icons.

Mobile behavior:

- Panels become bottom sheets or full-screen overlays.
- Folder entries remain single-column and touch-friendly.
- No horizontal scrolling except the existing compact top icon rail.

## Error handling

- If `DATABASE_URL` is missing in production, startup should fail loudly.
- If a link cannot be embedded, show an in-app message and an external open button.
- If saving fails, keep the entered data visible and show a retry state.
- If the JWT expires, keep the existing login overlay behavior.
- If a folder or event no longer exists, show a direct not-found message.

## Migration plan

1. Add Postgres dependency and adapter.
2. Create schema migration script.
3. Seed the five existing subjects for each new user.
4. Keep existing task and note behavior working through the new adapter.
5. Add links/folders/events API models.
6. Update dashboard API response.
7. Add frontend panels and editing controls.
8. Add PWA files.
9. Deploy with `DATABASE_URL` configured.

## Testing plan

Run local API tests for:

- register and login
- dashboard fetch
- task add, toggle, delete
- note save
- subject link save
- folder create, update, delete
- folder item create, update, delete
- event create, update, delete

Run browser smoke tests for:

- desktop dashboard render
- iPhone dashboard render
- no horizontal scroll
- folder panel interaction
- link settings save
- schedule event creation
- PWA manifest reachable

Run deployment checks:

- Vercel build
- live API register/dashboard
- live browser smoke test on production alias

## Open dependency

Implementation of durable live storage needs a real `DATABASE_URL` from the chosen hosted database provider. The code can be prepared locally before that, but production durability is only complete after the live environment variable is configured.
