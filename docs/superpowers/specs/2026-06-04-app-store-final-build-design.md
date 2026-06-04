# App Store Final Build — Design Spec
**Date:** 2026-06-04  
**Scope:** Video upload reliability, barcode scanning fix, first-time tooltip tour

---

## 1. Video Upload — TUS Resumable Uploads

### Problem
Direct `supabase.storage.upload()` has no retry, no progress, and silently fails on large files or slow connections. Supabase default file size limit is 50MB.

### Solution
Use `tus-js-client` for resumable uploads over TUS protocol. Works identically on iOS and Android (pure JS/HTTP — no native plugin required). Small files stay on the fast direct path.

### Architecture

**Threshold:** Files ≤ 2MB use direct Supabase upload. Files > 2MB use TUS.

**Size gate:** Reject files > 100MB client-side before any upload attempt, with a toast: `"Video is too large (max 100MB). Trim it and try again."`

**TUS endpoint:** `{SUPABASE_URL}/storage/v1/upload/resumable`

**Chunk size:** 6MB (Supabase requirement — do not change).

**Auth:** Pass `Authorization: Bearer {session.access_token}` header.

**Metadata:** `bucketName`, `objectName`, `contentType`, `cacheControl: '3600'`.

**Progress:** `onProgress(bytesUploaded, bytesTotal)` → drives a `<progress>` bar shown inline in `CreatePostDialog` while uploading. Hide on success/error.

**Resume:** Call `upload.findPreviousUploads()` on start; if found, call `upload.resumeFromPreviousUpload(previous[0])` before starting.

**Error:** On `onError`, show toast `"Upload failed — tap Post to retry"`. Store the `tus.Upload` instance in a ref so retry re-uses the same resumable session.

### Files changed
- `src/components/CreatePostDialog.jsx` — replace upload logic with `uploadMedia()` helper
- `src/lib/tusUpload.js` — new file encapsulating TUS upload logic

### Dependencies
- `tus-js-client` (install via npm)

---

## 2. Barcode Scanning — Cross-Platform Fix

### Problem
`@capacitor-mlkit/barcode-scanning` v8:
- **Android**: requires Google Barcode Scanner Module to be installed separately. If missing, camera opens but never returns scan results.
- **iOS**: `scan()` can silently fail on some versions if the camera isn't pre-warmed.

### Solution

**Android path:**
1. Call `BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()`
2. If `{ available: false }`: call `BarcodeScanner.installGoogleBarcodeScannerModule()`, show toast `"Preparing scanner for first use…"`, wait for `BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', cb)` to report `COMPLETED`, then proceed
3. Call `BarcodeScanner.scan({ formats: [...] })` as before

**iOS path:**
1. Call `BarcodeScanner.prepare()` to pre-warm camera before `scan()`
2. Then call `BarcodeScanner.scan({ formats: [...] })` as before

**Platform detection:** Use `Capacitor.getPlatform()` to branch Android vs iOS logic.

**Fallback:** Existing manual entry fallback unchanged — shown on any error.

### Files changed
- `src/components/FoodLookupDialog.jsx` — update `startScan()` function only

---

## 3. First-Time Tooltip Tour

### Problem
New users have no guidance on what each section of the app does after completing the profile onboarding.

### Solution
A 5-stop spotlight tooltip tour triggered once after onboarding completes. Built with a React portal — no library dependencies.

### Trigger
- After `onboarding_done` is saved, check `localStorage.getItem('tribe_tour_done')`
- If absent: render `<TourOverlay />` as a portal into `document.body`
- On tour complete or skip: `localStorage.setItem('tribe_tour_done', '1')`

### Tour Stops (in order)

| # | Target `data-tour` | Title | Description |
|---|---|---|---|
| 1 | `feed` | Welcome to Tribe 👋 | Your tribe's posts, workouts, and wins appear here |
| 2 | `create-post` | Share your progress | Post photos, videos, and updates with your tribe |
| 3 | `nutrition` | Track your nutrition | Log meals, scan barcodes, and hit your macro goals |
| 4 | `workouts` | Log your workouts | Build plans, track sets, and watch your strength grow |
| 5 | `profile` | Your profile | View your stats, goals, and premium features |

### Overlay Implementation

- **Dark overlay:** `position: fixed; inset: 0; background: rgba(0,0,0,0.75); z-index: 9999` — rendered via `ReactDOM.createPortal`
- **Spotlight cutout:** Use `clip-path: path()` or SVG `<mask>` to punch a rounded-rect hole over the target element rect (from `getBoundingClientRect()`)
- **Tooltip card:** Positioned above or below the target (auto-flip if near screen edge). Contains title, description, step counter (`1 of 5`), Skip button (stop 1 only), Next/Done button
- **Target marking:** Add `data-tour="feed"` etc. to nav tab elements and the FAB `+` button
- **Scroll:** Tour elements are all in the bottom nav — no scrolling needed
- **Animation:** Fade-in overlay on mount, spotlight slides between stops with a 200ms CSS transition on `clip-path`

### Files changed
- `src/components/TourOverlay.jsx` — new component
- `src/App.jsx` — render `<TourOverlay />` after onboarding is done and tour not yet seen
- `src/components/Layout.jsx` — add `data-tour` attributes to nav items
- `src/components/CreatePostDialog.jsx` — add `data-tour="create-post"` to FAB trigger button

---

## Data / Storage Notes

- **Supabase bucket `media`**: Update max file size policy to 100MB in Supabase dashboard (Storage → Policies). No code change needed.
- **Tour state**: `localStorage` only — no DB column needed. Fast, no network round-trip, survives app restarts.
- **Barcode module install**: One-time, persists in native app — no tracking needed.
