# App Store Final Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix video upload reliability (ffmpeg compression + TUS resumable + background UX), fix cross-platform barcode scanning, and add a first-time tooltip tour.

**Architecture:** Three independent subsystems. Video upload uses a compress-then-upload pipeline: ffmpeg.wasm compresses in-browser, tus-js-client uploads resumably to Supabase, and a global UploadContext drives a persistent banner so the user can navigate freely during upload. Barcode scanning branches on platform to handle Android's Google ML Kit module requirement and iOS's camera pre-warm requirement. The tooltip tour is a React portal overlay that reads/writes localStorage and uses `getBoundingClientRect()` to position spotlights over `data-tour` marked elements.

**Tech Stack:** React 18, Capacitor 8, `@ffmpeg/ffmpeg` + `@ffmpeg/util`, `tus-js-client`, `@capacitor-mlkit/barcode-scanning` v8, `@capacitor/core` (for `Capacitor.getPlatform()`), Supabase JS v2, TailwindCSS, sonner (toasts)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/uploadContext.jsx` | **Create** | Global upload state: status, progress, retry fn, feed invalidation |
| `src/lib/tusUpload.js` | **Create** | TUS upload to Supabase resumable endpoint, returns `{ start, abort }` |
| `src/components/UploadBanner.jsx` | **Create** | Persistent bottom banner showing compress/upload progress |
| `src/components/TourOverlay.jsx` | **Create** | Spotlight tooltip tour, 5 stops, portal-rendered |
| `src/components/CreatePostDialog.jsx` | **Modify** | Duration check, ffmpeg compression, hand-off to UploadContext |
| `src/components/Layout.jsx` | **Modify** | Add `data-tour` attrs to nav items, render `<UploadBanner />` |
| `src/components/FoodLookupDialog.jsx` | **Modify** | `startScan()` — Android module check + iOS prepare() |
| `src/App.jsx` | **Modify** | Wrap with `<UploadProvider>`, render `<TourOverlay />` |

---

## Task 1: Install dependencies

**Files:** `package.json`

- [ ] **Step 1: Install packages**

```bash
cd D:/gymapp
npm install tus-js-client @ffmpeg/ffmpeg @ffmpeg/util
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Step 2: Verify ffmpeg wasm assets are accessible**

```bash
ls node_modules/@ffmpeg/core/dist/esm/ 2>/dev/null || ls node_modules/@ffmpeg/ffmpeg/dist/ | head -5
```

Note: `@ffmpeg/ffmpeg` loads wasm from a CDN by default when `coreURL` is not specified — this is fine for now. We'll use `toBlobURL` from `@ffmpeg/util` to load from CDN.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tus-js-client and ffmpeg dependencies"
```

---

## Task 2: Create UploadContext

**Files:**
- Create: `src/lib/uploadContext.jsx`

- [ ] **Step 1: Create the context and provider**

Create `src/lib/uploadContext.jsx`:

```jsx
import { createContext, useContext, useState, useRef, useCallback } from "react";
import { queryClientInstance } from "@/lib/query-client";

// status: 'idle' | 'compressing' | 'uploading' | 'success' | 'error'
const UploadContext = createContext(null);

export function UploadProvider({ children }) {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0); // 0-100
  const [error, setError] = useState(null);
  const retryRef = useRef(null); // stores () => void to retry upload

  const startUpload = useCallback((tusStartFn) => {
    // tusStartFn: () => void — call to begin/resume the TUS upload
    retryRef.current = tusStartFn;
    setStatus("uploading");
    setProgress(0);
    setError(null);
    tusStartFn();
  }, []);

  const setCompressing = useCallback((pct) => {
    setStatus("compressing");
    setProgress(pct);
  }, []);

  const onUploadProgress = useCallback((pct) => {
    setStatus("uploading");
    setProgress(pct);
  }, []);

  const onSuccess = useCallback(() => {
    setStatus("success");
    setProgress(100);
    queryClientInstance.invalidateQueries({ queryKey: ["posts"] });
    setTimeout(() => setStatus("idle"), 3000);
  }, []);

  const onError = useCallback((err) => {
    setStatus("error");
    setError(err?.message || "Upload failed");
  }, []);

  const retry = useCallback(() => {
    if (retryRef.current) {
      setStatus("uploading");
      setProgress(0);
      setError(null);
      retryRef.current();
    }
  }, []);

  return (
    <UploadContext.Provider value={{ status, progress, error, startUpload, setCompressing, onUploadProgress, onSuccess, onError, retry }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUpload must be used inside UploadProvider");
  return ctx;
}
```

- [ ] **Step 2: Verify `query-client` export path**

```bash
grep -n "queryClientInstance\|export" D:/gymapp/src/lib/query-client.js 2>/dev/null || grep -n "queryClientInstance\|export" D:/gymapp/src/lib/query-client.ts 2>/dev/null
```

If the export name differs, update the import in `uploadContext.jsx` to match.

- [ ] **Step 3: Commit**

```bash
git add src/lib/uploadContext.jsx
git commit -m "feat: add UploadContext for global background upload state"
```

---

## Task 3: Create tusUpload.js

**Files:**
- Create: `src/lib/tusUpload.js`

- [ ] **Step 1: Create TUS upload helper**

Create `src/lib/tusUpload.js`:

```js
import * as tus from "tus-js-client";
import { supabase } from "@/api/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BUCKET = "media";
const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB — Supabase requirement

/**
 * Creates a TUS upload for a file to Supabase resumable storage.
 * Returns { start } — call start() to begin or resume.
 *
 * @param {File|Blob} file
 * @param {string} objectPath  e.g. "userId/timestamp.mp4"
 * @param {{ onProgress, onSuccess, onError }} callbacks
 */
export function createTusUpload(file, objectPath, { onProgress, onSuccess, onError }) {
  let uploadInstance = null;

  async function start() {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    uploadInstance = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: CHUNK_SIZE,
      allowedFileTypes: ["image/*", "video/*"],
      headers: {
        authorization: `Bearer ${token}`,
        "x-upsert": "true",
      },
      metadata: {
        bucketName: BUCKET,
        objectName: objectPath,
        contentType: file.type,
        cacheControl: "3600",
      },
      onProgress(bytesUploaded, bytesTotal) {
        const pct = Math.round((bytesUploaded / bytesTotal) * 100);
        onProgress?.(pct);
      },
      onSuccess() {
        onSuccess?.();
      },
      onError(err) {
        onError?.(err);
      },
    });

    const previous = await uploadInstance.findPreviousUploads();
    if (previous.length > 0) {
      uploadInstance.resumeFromPreviousUpload(previous[0]);
    }

    uploadInstance.start();
  }

  function abort() {
    uploadInstance?.abort();
  }

  return { start, abort };
}

/**
 * Returns the Supabase public URL for an object path in the media bucket.
 */
export function getPublicUrl(objectPath) {
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return publicUrl;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tusUpload.js
git commit -m "feat: add TUS resumable upload helper for Supabase storage"
```

---

## Task 4: Create UploadBanner

**Files:**
- Create: `src/components/UploadBanner.jsx`

- [ ] **Step 1: Create the banner component**

Create `src/components/UploadBanner.jsx`:

```jsx
import { useUpload } from "@/lib/uploadContext";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UploadBanner() {
  const { status, progress, error, retry } = useUpload();

  if (status === "idle") return null;

  const isCompressing = status === "compressing";
  const isUploading = status === "uploading";
  const isSuccess = status === "success";
  const isError = status === "error";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
        isSuccess && "bg-primary/20 text-primary",
        isError && "bg-destructive/20 text-destructive cursor-pointer",
        (isCompressing || isUploading) && "bg-card border-t border-border text-foreground"
      )}
      onClick={isError ? retry : undefined}
    >
      {(isCompressing || isUploading) && (
        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0 text-primary" />
      )}
      {isSuccess && <CheckCircle2 className="h-4 w-4 flex-shrink-0" />}
      {isError && <AlertCircle className="h-4 w-4 flex-shrink-0" />}

      <span className="flex-1">
        {isCompressing && `Compressing… ${progress}%`}
        {isUploading && `Posting to your tribe… ${progress}%`}
        {isSuccess && "Posted! ✓"}
        {isError && "Upload failed. Tap to retry."}
      </span>

      {(isCompressing || isUploading) && (
        <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/UploadBanner.jsx
git commit -m "feat: add UploadBanner component for background upload progress"
```

---

## Task 5: Wire UploadProvider and UploadBanner into app shell

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Layout.jsx`

- [ ] **Step 1: Wrap app with UploadProvider in App.jsx**

In `src/App.jsx`, add the import at the top:

```jsx
import { UploadProvider } from "@/lib/uploadContext";
```

Find the `return (` inside `function App()`. It currently looks like:

```jsx
  return (
    <ErrorBoundary>
```

Wrap the inner content with `<UploadProvider>`. The full App return should be:

```jsx
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthProvider>
            <UploadProvider>
              <AuthenticatedApp />
              <Toaster position="top-center" richColors />
            </UploadProvider>
          </AuthProvider>
        </Router>
      </QueryClientProvider>
    </ErrorBoundary>
  );
```

> Note: read the full `function App()` body first to see the exact existing structure, then replicate it with `<UploadProvider>` added around `<AuthenticatedApp />` and `<Toaster />`.

- [ ] **Step 2: Add UploadBanner and data-tour attributes to Layout.jsx**

Replace `src/components/Layout.jsx` entirely with:

```jsx
import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, Dumbbell, UtensilsCrossed, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";
import UploadBanner from "@/components/UploadBanner";

const navItems = [
  { path: "/",          icon: Home,            label: "Feed",      tour: "feed"      },
  { path: "/workouts",  icon: Dumbbell,        label: "Workouts",  tour: "workouts"  },
  { path: "/nutrition", icon: UtensilsCrossed, label: "Nutrition", tour: "nutrition" },
  { path: "/discover",  icon: Users,           label: "Discover",  tour: null        },
  { path: "/profile",   icon: User,            label: "Profile",   tour: "profile"   },
];

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="bg-background flex flex-col overflow-hidden" style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)" }}>
      <main className={pathname === "/" ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto pb-20"}>
        <Outlet />
      </main>
      <UploadBanner />
      <nav className="bg-card/95 backdrop-blur-xl border-t border-border z-50 flex-shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-2">
          {navItems.map(({ path, icon: Icon, label, tour }) => {
            const active = path === "/" ? pathname === "/" : pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                data-tour={tour || undefined}
                className={cn("flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_hsl(175,85%,50%)]")} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx src/components/Layout.jsx
git commit -m "feat: wire UploadProvider into app, add UploadBanner and data-tour nav attrs"
```

---

## Task 6: Update CreatePostDialog — duration check, compression, background handoff

**Files:**
- Modify: `src/components/CreatePostDialog.jsx`

- [ ] **Step 1: Replace CreatePostDialog.jsx entirely**

```jsx
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Loader2, Image } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUpload } from "@/lib/uploadContext";
import { createTusUpload, getPublicUrl } from "@/lib/tusUpload";

const MAX_VIDEO_DURATION = 60; // seconds
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

async function loadFfmpeg() {
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
  const ffmpeg = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  return { ffmpeg, fetchFile };
}

async function compressVideo(file, onProgress) {
  const { ffmpeg, fetchFile } = await loadFfmpeg();
  ffmpeg.on("progress", ({ progress }) => onProgress(Math.round(progress * 100)));
  await ffmpeg.writeFile("input.mp4", await fetchFile(file));
  await ffmpeg.exec([
    "-i", "input.mp4",
    "-vf", "scale=-2:720",
    "-c:v", "libx264",
    "-crf", "28",
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "output.mp4",
  ]);
  const data = await ffmpeg.readFile("output.mp4");
  return new File([data.buffer], "compressed.mp4", { type: "video/mp4" });
}

function checkVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => reject(new Error("Could not read video metadata"));
    video.src = URL.createObjectURL(file);
  });
}

export default function CreatePostDialog() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [mediaType, setMediaType] = useState("image");
  const [compressing, setCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { startUpload, setCompressing: setGlobalCompressing, onUploadProgress, onSuccess, onError } = useUpload();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("video/")) {
      try {
        const duration = await checkVideoDuration(file);
        if (duration > MAX_VIDEO_DURATION) {
          toast.error("Videos must be 60 seconds or less.");
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }
      } catch {
        toast.error("Could not read video. Try another file.");
        return;
      }
      setMediaType("video");
    } else {
      setMediaType("image");
    }

    setMediaFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setMediaPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePost = async () => {
    if (!content && !mediaFile) return;

    let fileToUpload = mediaFile;

    // Compress video before upload
    if (mediaFile && mediaType === "video") {
      setCompressing(true);
      setCompressProgress(0);
      try {
        fileToUpload = await compressVideo(mediaFile, (pct) => {
          setCompressProgress(pct);
          setGlobalCompressing(pct);
        });
      } catch (err) {
        setCompressing(false);
        toast.error("Compression failed. Try a shorter video.");
        return;
      }
      setCompressing(false);
    }

    // Check compressed size
    if (fileToUpload && fileToUpload.size > MAX_FILE_SIZE) {
      toast.error("Video is too large (max 50MB). Trim it and try again.");
      return;
    }

    // Build the post row — we need the media_url before inserting
    const ext = fileToUpload ? (mediaType === "video" ? "mp4" : fileToUpload.name.split(".").pop()) : null;
    const objectPath = fileToUpload ? `${user.id}/${Date.now()}.${ext}` : null;
    const media_url = objectPath ? getPublicUrl(objectPath) : null;

    // Close dialog and hand off to background
    setOpen(false);
    setContent("");
    setMediaFile(null);
    setMediaPreview(null);

    if (!fileToUpload) {
      // Text-only post — insert directly
      const { error } = await supabase.from("posts").insert({
        content,
        media_url: null,
        media_type: null,
        user_id: user.id,
        author_name: user.full_name || user.email,
        author_image: user.profile_image || "",
      });
      if (error) toast.error("Failed to post.");
      else {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        toast.success("Posted to your tribe!");
      }
      return;
    }

    // Insert post row immediately (media_url is the eventual public URL)
    const { error: insertError } = await supabase.from("posts").insert({
      content,
      media_url,
      media_type: mediaType,
      user_id: user.id,
      author_name: user.full_name || user.email,
      author_image: user.profile_image || "",
    });
    if (insertError) {
      toast.error("Failed to create post.");
      return;
    }

    // Start background TUS upload
    const { start } = createTusUpload(fileToUpload, objectPath, {
      onProgress: onUploadProgress,
      onSuccess,
      onError,
    });
    startUpload(start);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-tour="create-post" size="icon" className="rounded-full h-12 w-12 shadow-lg shadow-primary/30">
          <Plus className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Share with your Tribe</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Textarea
            placeholder="What did you crush today?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="bg-secondary border-border min-h-[80px] resize-none"
          />

          {mediaPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              {mediaType === "video"
                ? <video src={mediaPreview} className="w-full max-h-48 object-cover" controls />
                : <img src={mediaPreview} alt="" className="w-full max-h-48 object-cover" />}
              <button onClick={clearMedia} className="absolute top-2 right-2 bg-black/60 rounded-full p-1">
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
              <Image className="h-6 w-6 text-muted-foreground mb-1" />
              <span className="text-sm text-muted-foreground">Add photo or video (max 60s)</span>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
            </label>
          )}

          {compressing && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Compressing video…</span>
                <span>{compressProgress}%</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${compressProgress}%` }} />
              </div>
            </div>
          )}

          <Button
            onClick={handlePost}
            disabled={compressing || (!content && !mediaFile)}
            className="w-full font-heading font-semibold"
          >
            {compressing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {compressing ? `Compressing… ${compressProgress}%` : "Post to Tribe"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/CreatePostDialog.jsx
git commit -m "feat: video duration check, ffmpeg compression, background TUS upload handoff"
```

---

## Task 7: Fix barcode scanning (cross-platform)

**Files:**
- Modify: `src/components/FoodLookupDialog.jsx` — `startScan()` function only (lines ~138–180)

- [ ] **Step 1: Replace the startScan function**

Find the `startScan` function (currently lines ~138–180) and replace it with:

```js
const startScan = async () => {
  if (!isNative()) {
    fileRef.current?.click();
    return;
  }
  setError("");
  setScanning(true);
  try {
    const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");
    const { Capacitor } = await import("@capacitor/core");
    const platform = Capacitor.getPlatform();

    // Android: ensure Google Barcode Scanner Module is installed
    if (platform === "android") {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        toast.info("Preparing scanner for first use…");
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        await new Promise((resolve) => {
          BarcodeScanner.addListener("googleBarcodeScannerModuleInstallProgress", (event) => {
            if (event.state === "COMPLETED") resolve();
          });
        });
      }
    }

    // iOS: pre-warm camera to prevent silent scan failure
    if (platform === "ios") {
      await BarcodeScanner.prepare?.();
    }

    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== "granted" && camera !== "limited") {
      setScanning(false);
      setError("Camera permission denied. Enter barcode manually.");
      return;
    }

    const { barcodes } = await BarcodeScanner.scan({
      formats: [
        BarcodeFormat.Ean13, BarcodeFormat.Ean8,
        BarcodeFormat.UpcA, BarcodeFormat.UpcE,
        BarcodeFormat.Code128, BarcodeFormat.Code39,
        BarcodeFormat.QrCode,
      ],
    });

    setScanning(false);
    if (barcodes.length > 0) {
      const code = barcodes[0].rawValue;
      setBarcode(code);
      setLoading(true);
      try {
        const res = await lookupBarcode(code);
        if (res) setSelected(res);
        else setError("not_found");
      } catch { setError("Lookup failed."); }
      setLoading(false);
    }
  } catch {
    setScanning(false);
    setError("Scan failed. Enter barcode manually.");
  }
};
```

Note: `toast` is already imported in `FoodLookupDialog.jsx` via sonner — verify with `grep -n "toast" src/components/FoodLookupDialog.jsx`. If not imported, add `import { toast } from "sonner";` at the top.

- [ ] **Step 2: Verify toast import**

```bash
grep -n "^import.*toast\|^import.*sonner" D:/gymapp/src/components/FoodLookupDialog.jsx
```

If missing, add `import { toast } from "sonner";` after the existing imports.

- [ ] **Step 3: Commit**

```bash
git add src/components/FoodLookupDialog.jsx
git commit -m "fix: barcode scanner — Android ML Kit module install + iOS camera pre-warm"
```

---

## Task 8: Create TourOverlay component

**Files:**
- Create: `src/components/TourOverlay.jsx`

- [ ] **Step 1: Create TourOverlay.jsx**

```jsx
import { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { Button } from "@/components/ui/button";

const TOUR_KEY = "tribe_tour_done";

const STOPS = [
  { target: "feed",        title: "Welcome to Tribe 👋",    desc: "Your tribe's posts, workouts, and wins appear here." },
  { target: "create-post", title: "Share your progress",    desc: "Post photos, videos, and updates with your tribe." },
  { target: "nutrition",   title: "Track your nutrition",   desc: "Log meals, scan barcodes, and hit your macro goals." },
  { target: "workouts",    title: "Log your workouts",      desc: "Build plans, track sets, and watch your strength grow." },
  { target: "profile",     title: "Your profile",           desc: "View your stats, goals, and premium features." },
];

function getRect(target) {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function buildClipPath(rect, padding = 8) {
  if (!rect) return "none";
  const { left, top, width, height } = rect;
  const x = left - padding;
  const y = top - padding;
  const w = width + padding * 2;
  const h = height + padding * 2;
  const r = 12;
  // Full screen with rounded-rect hole via SVG clip-path polygon approximation
  // Using even-odd fill rule: outer rect fills, inner rect punches hole
  return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x + r}px ${y}px, ${x}px ${y + r}px, ${x}px ${y + h - r}px, ${x + r}px ${y + h}px, ${x + w - r}px ${y + h}px, ${x + w}px ${y + h - r}px, ${x + w}px ${y + r}px, ${x + w - r}px ${y}px, ${x + r}px ${y}px)`;
}

export default function TourOverlay({ onDone }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  const stop = STOPS[step];

  const updateRect = useCallback(() => {
    const r = getRect(stop.target);
    setRect(r);
  }, [stop.target]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [updateRect]);

  const finish = () => {
    localStorage.setItem(TOUR_KEY, "1");
    onDone();
  };

  const next = () => {
    if (step < STOPS.length - 1) setStep(step + 1);
    else finish();
  };

  // Tooltip position: above target if in bottom half of screen, else below
  const tooltipStyle = (() => {
    if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    const screenH = window.innerHeight;
    const inBottomHalf = rect.top > screenH / 2;
    const tooltipTop = inBottomHalf ? rect.top - 8 : rect.bottom + 8;
    const transformY = inBottomHalf ? "-100%" : "0%";
    const left = Math.max(12, Math.min(rect.left + rect.width / 2, window.innerWidth - 12));
    return {
      position: "fixed",
      top: tooltipTop,
      left,
      transform: `translate(-50%, ${transformY})`,
      width: "min(280px, calc(100vw - 24px))",
      zIndex: 10000,
    };
  })();

  const overlay = (
    <div className="fixed inset-0 animate-in fade-in duration-300" style={{ zIndex: 9999 }}>
      {/* Dark overlay with spotlight cutout */}
      <div
        className="absolute inset-0 transition-[clip-path] duration-200"
        style={{
          background: "rgba(0,0,0,0.78)",
          clipPath: buildClipPath(rect),
        }}
      />

      {/* Tooltip card */}
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl p-4 space-y-2"
        style={tooltipStyle}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-heading font-bold text-sm text-foreground">{stop.title}</p>
          <span className="text-xs text-muted-foreground flex-shrink-0">{step + 1} of {STOPS.length}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{stop.desc}</p>
        <div className="flex gap-2 pt-1">
          {step === 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={finish}>
              Skip
            </Button>
          )}
          <Button size="sm" className="text-xs h-7 ml-auto font-heading" onClick={next}>
            {step < STOPS.length - 1 ? "Next" : "Done"}
          </Button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(overlay, document.body);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/TourOverlay.jsx
git commit -m "feat: add TourOverlay spotlight tooltip tour component"
```

---

## Task 9: Wire TourOverlay into App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add TourOverlay to AuthenticatedApp**

At the top of `src/App.jsx`, add:

```jsx
import TourOverlay from "@/components/TourOverlay";
```

Inside `AuthenticatedApp`, add tour state just below the existing destructuring:

```jsx
const { isLoadingAuth, authChecked, isAuthenticated, onboardingDone } = useAuth();
const [showTour, setShowTour] = useState(
  isAuthenticated && onboardingDone && !localStorage.getItem("tribe_tour_done")
);
```

Also add `useState` to the existing `useEffect, Component` import from React:
```jsx
import { useEffect, Component, useState } from 'react';
```

Then, just before the `return (` in `AuthenticatedApp`, add:

```jsx
  // Show tour once after onboarding is complete
  if (showTour) {
    // Render tour on top of the full app, not just the loading state
  }
```

And in the return of `AuthenticatedApp`, wrap the routes portion to overlay the tour:

```jsx
  return (
    <>
      <Routes>
        {/* ... existing routes unchanged ... */}
      </Routes>
      {showTour && <TourOverlay onDone={() => setShowTour(false)} />}
    </>
  );
```

> Read the current `AuthenticatedApp` return carefully before editing. Keep all existing routes exactly as-is. Only wrap the return in `<>...</>` and append `{showTour && <TourOverlay ... />}` at the end.

- [ ] **Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: trigger TourOverlay for first-time users after onboarding"
```

---

## Task 10: Build and verify

- [ ] **Step 1: Build web assets**

```bash
cd D:/gymapp
npm run build
```

Expected: no errors. Warnings about bundle size from ffmpeg are OK.

- [ ] **Step 2: Sync to native**

```bash
npx cap sync
```

Expected: `Sync finished` for both iOS and Android.

- [ ] **Step 3: Manual verification checklist**

Test on device or simulator:

**Video upload:**
- [ ] Pick a video > 60 seconds → toast "Videos must be 60 seconds or less."
- [ ] Pick a video ≤ 60 seconds → compression progress shows in dialog
- [ ] After compression → dialog closes, banner appears above nav with percentage
- [ ] Navigate to Nutrition tab → banner still visible, still updating
- [ ] Upload completes → banner shows "Posted! ✓" then disappears, feed refreshes

**Barcode scanning (Android):**
- [ ] First scan → "Preparing scanner for first use…" toast, then camera opens and scans
- [ ] Second scan → camera opens immediately, scans successfully

**Barcode scanning (iOS):**
- [ ] Camera opens without delay, scan detects barcode and looks up food

**Tooltip tour:**
- [ ] Fresh install (or clear localStorage) → tour appears after login with spotlight on Feed tab
- [ ] Tap Next → spotlight moves to FAB (+) button
- [ ] Continue through all 5 stops → overlay disappears
- [ ] Reload app → tour does not appear again
- [ ] Tap Skip on stop 1 → tour dismissed, does not reappear

- [ ] **Step 4: Commit build artifacts if needed**

```bash
git add -A
git commit -m "chore: sync native build after app store final build features"
```
