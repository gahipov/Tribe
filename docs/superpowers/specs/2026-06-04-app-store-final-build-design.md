# App Store Final Build — Design Spec
**Date:** 2026-06-04  
**Scope:** Video upload reliability, barcode scanning fix, first-time tooltip tour

---

## 1. Video Upload — TUS Resumable Uploads

### Problem
Direct `supabase.storage.upload()` has no retry, no progress, and silently fails on large files or slow connections. Supabase default file size limit is 50MB.

### Solution
Two-phase pipeline: **compress → upload**.

- **Compress** with `@ffmpeg/ffmpeg` + `@ffmpeg/util` (ffmpeg.wasm). Runs in-browser WebWorker, works on iOS WKWebView and Android Chromium. Re-encodes to H.264 720p at ~1Mbps to keep output well under 50MB.
- **Upload** with `tus-js-client` over TUS protocol to Supabase resumable upload endpoint. Handles retries and progress natively.

### Duration limit
Reject videos longer than 60 seconds before compression starts. Read duration via `<video>` element `loadedmetadata` event. Show toast: `"Videos must be 60 seconds or less."`.

### Compression
- Load ffmpeg.wasm lazily (dynamic import) on first video — avoids ~30MB bundle cost until needed
- Target output: `libx264`, 720p, CRF 28, `aac` audio at 128k
- Show inline progress inside `CreatePostDialog`: `"Compressing… 42%"` driven by ffmpeg `onProgress`
- After compression completes: close the dialog and hand off to background upload

### Background upload UX (Instagram-style)
Once compression finishes and upload starts:
1. Close `CreatePostDialog`
2. Show a persistent bottom banner (above the nav bar) with: uploading spinner + `"Posting to your tribe…"` + progress percentage
3. User can freely navigate to other tabs — banner persists via a global `UploadContext` (`React.createContext`) that holds upload state
4. On success: banner becomes `"Posted! ✓"` for 3 seconds then disappears, feed query invalidated
5. On error: banner becomes `"Upload failed. Tap to retry."` — tap re-triggers TUS resume

### TUS upload details
**Endpoint:** `{SUPABASE_URL}/storage/v1/upload/resumable`  
**Chunk size:** 6MB  
**Auth:** `Authorization: Bearer {session.access_token}`  
**Metadata:** `bucketName`, `objectName`, `contentType`, `cacheControl: '3600'`  
**Resume:** `findPreviousUploads()` → `resumeFromPreviousUpload()` on retry

### Files changed
- `src/components/CreatePostDialog.jsx` — add duration check, compression phase, hand off to context
- `src/lib/uploadContext.jsx` — new: global `UploadContext` + `UploadProvider` + `useUpload` hook
- `src/lib/tusUpload.js` — new: TUS upload logic
- `src/components/UploadBanner.jsx` — new: persistent bottom banner
- `src/components/Layout.jsx` — render `<UploadBanner />` above nav

### Dependencies
- `tus-js-client`
- `@ffmpeg/ffmpeg` + `@ffmpeg/util`

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

- **Supabase bucket `media`**: Free tier hard limit is 50MB per file. No policy change needed — client-side gate matches this limit.
- **Tour state**: `localStorage` only — no DB column needed. Fast, no network round-trip, survives app restarts.
- **Barcode module install**: One-time, persists in native app — no tracking needed.
