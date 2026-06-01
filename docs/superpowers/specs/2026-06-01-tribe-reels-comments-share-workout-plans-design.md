# Tribe — Reels Polish, Comments, Sharing & Workout Plan Builder

**Date:** 2026-06-01  
**Status:** Approved

---

## Overview

Three feature areas across the Tribe app:
1. **Reels** — smooth premium video experience with side-drawer comments and share sheet
2. **Comments & Sharing** — real working features backed by Supabase
3. **Workout Plan Builder** — full-screen editor to create, save, and share custom plans

---

## 1. Reels — Smooth & Premium

### Playback improvements
- Replace scroll-event detection with **IntersectionObserver** (threshold 0.6) for precise snap detection without jank
- **Preload strategy**: preload `<video>` for current + 1 ahead; pause and release src for items 2+ behind. Eliminates buffering stutter on scroll.
- Thin **video progress bar** at the bottom of each reel (updates via `timeupdate`)
- **Double-tap to like** anywhere on the video: optimistic heart-burst animation (CSS keyframe, 3 hearts fan out and fade), then Supabase update

### Comments drawer (side drawer, Instagram-style)
- Tap comment icon → drawer slides in from the **right edge**, full viewport height
- On mobile: video area shrinks to top **35%** of screen; drawer fills bottom 65%. Smooth CSS transition (300ms ease-out).
- Drawer contains: header with post title + close button, scrollable comment list, input row pinned at bottom (avatar + text field + send button)
- Backdrop tap closes the drawer; video resumes full-size

### Share bottom sheet
- Tap share icon → sheet slides up from **bottom**, ~260px tall
- Three actions: **Copy Link** (`/post/:id`), **Share to Tribe** (repost), **Native Share** (`navigator.share`, graceful fallback)
- Dismisses on backdrop tap or after action completes
- Toast confirms each action

---

## 2. Comments — Data & Behavior

### Supabase schema
```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references auth.users(id),
  author_name text,
  author_image text,
  content text not null,
  created_at timestamptz default now()
);
```

### Behavior
- Comments are **loaded on drawer open**, not upfront — keeps feed query fast
- **Optimistic insert**: comment appears in list immediately, Supabase insert fires in background
- Comment count on the reel sidebar icon: fetched alongside post data (`comments_count` column on `posts`, incremented via trigger or client-side after insert)
- Empty state: "Be the first to comment" with a ghost icon

---

## 3. Sharing — Data & Behavior

### Schema addition to `posts`
```sql
alter table posts add column post_type text not null default 'reel';
alter table posts add column plan_data jsonb;
alter table posts add column original_post_id uuid references posts(id);
```

### Share to Tribe (repost)
- Inserts new post row: `post_type = 'repost'`, `original_post_id = <source id>`, `content = user's caption (optional)`, `author_name/image` from current user
- Feed renders repost cards with "↩ reposted by @username" label above the original content

### Copy Link
- Copies `window.location.origin + '/post/' + post.id` to clipboard
- Toast: "Link copied!"

### Native Share
- `navigator.share({ title: post.author_name, text: post.content, url: ... })`
- If not supported: silently omit the option from the sheet

---

## 4. Workout Plan Builder

### Supabase schema
```sql
create table workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text not null,
  description text,
  days jsonb not null default '[]',
  is_public boolean default false,
  created_at timestamptz default now()
);
```

`days` shape:
```json
[
  {
    "day": "Day 1",
    "focus": "Chest & Triceps",
    "color": "text-blue-400 bg-blue-400/10",
    "exercises": [
      { "name": "Bench Press", "sets": 4, "reps": "8-10", "rest": "90s", "notes": "" }
    ]
  }
]
```

### Full-screen editor
- Triggered by "+ New Plan" button in Plans tab
- Implemented as a **full-screen slide-up panel** (fixed overlay, z-50, dark background, close button top-left)
- **Step flow within single screen** (no wizard pagination — all visible, scroll down to add more):
  - Plan name (required) + description (optional)
  - "+ Add Day" → appends a day card with: day label, focus/muscle group, exercise list
  - Per exercise: name, sets (number), reps (text), rest (text), notes (optional)
  - Delete day (trash icon), delete exercise (× button per row)
  - "Save Plan" button at bottom → inserts to `workout_plans`, closes editor, invalidates query
- Existing hardcoded plans (DEFAULT_PLAN, PPL_PLAN) move to a "Templates" section, separate from user-created plans

### Plans tab layout
Three sub-sections (scrollable, no tab switch needed):
1. **My Plans** — user's custom plans from `workout_plans` table + "+ New Plan" card
2. **Templates** — existing hardcoded bodybuilding/PPL plans (read-only, can start workout)
3. **Community** — feed posts where `post_type = 'workout_plan'`, rendered as plan cards with "Copy to My Plans" button

### Share plan
- Share button on each custom plan card
- Posts to feed: `post_type = 'workout_plan'`, `plan_data = <plan JSONB snapshot>`, `content = plan name + description`
- Sets `is_public = true` on the plan
- Feed renders `workout_plan` posts as a special card (not video): plan name, day count, exercise count, "Copy to My Plans" CTA

---

## Component map

| New / Changed | File | Notes |
|---|---|---|
| Changed | `src/components/ReelCard.jsx` | Add drawer, share sheet, double-tap, progress bar, IntersectionObserver |
| New | `src/components/CommentsDrawer.jsx` | Right-side drawer with comment list + input |
| New | `src/components/ShareSheet.jsx` | Bottom sheet with 3 share actions |
| Changed | `src/pages/Feed.jsx` | Switch to IntersectionObserver, pass comments/share handlers down |
| Changed | `src/components/BodybuildingPlan.jsx` | Split into Templates section; add My Plans + Community sections |
| New | `src/components/PlanEditor.jsx` | Full-screen plan editor overlay |
| New | `src/components/WorkoutPlanCard.jsx` | Card for displaying a plan in feed or community list |
| Changed | `src/pages/Workouts.jsx` | Wire up plan editor, pass handlers |

---

## DB migrations (manual, run in Supabase dashboard)

1. Create `comments` table
2. Create `workout_plans` table
3. `ALTER TABLE posts ADD COLUMN post_type text NOT NULL DEFAULT 'reel'`
4. `ALTER TABLE posts ADD COLUMN plan_data jsonb`
5. `ALTER TABLE posts ADD COLUMN original_post_id uuid REFERENCES posts(id)`
6. `ALTER TABLE posts ADD COLUMN comments_count integer NOT NULL DEFAULT 0`

---

## Out of scope
- Real-time comment subscriptions (polling on drawer open is sufficient for now)
- Push notifications for comments/likes
- Plan versioning or editing after sharing
- `/post/:id` permalink route (link copied but route not built)
