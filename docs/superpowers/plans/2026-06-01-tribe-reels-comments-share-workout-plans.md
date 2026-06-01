# Tribe — Reels Polish, Comments, Share & Workout Plan Builder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Reels feed with smooth playback, real comments (side drawer) and sharing (bottom sheet); add a full-screen workout plan builder with community sharing.

**Architecture:** New Supabase tables (`comments`, `workout_plans`) + schema additions to `posts`. New isolated components (CommentsDrawer, ShareSheet, PlanEditor, WorkoutPlanCard) wired into ReelCard and Workouts. Feed switches to IntersectionObserver for snap detection.

**Tech Stack:** React, Supabase JS v2, TanStack Query v5, Tailwind CSS, shadcn/ui, lucide-react, sonner

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/CommentsDrawer.jsx` | Right-side drawer: comment list + optimistic insert |
| Create | `src/components/ShareSheet.jsx` | Bottom sheet: copy link, repost, native share |
| Create | `src/components/WorkoutPlanCard.jsx` | Feed card for `post_type = 'workout_plan'` with copy CTA |
| Create | `src/components/PlanEditor.jsx` | Full-screen overlay editor for creating/editing plans |
| Modify | `src/components/ReelCard.jsx` | Wire CommentsDrawer + ShareSheet, add double-tap like, progress bar |
| Modify | `src/pages/Feed.jsx` | Switch to IntersectionObserver, render WorkoutPlanCard for plan posts |
| Modify | `src/components/BodybuildingPlan.jsx` | Rename to Templates section, keep hardcoded plans read-only |
| Modify | `src/pages/Workouts.jsx` | Add My Plans + Community sections, wire PlanEditor |

---

## Task 1: DB Migrations

**Files:** None (SQL run in Supabase dashboard)

- [ ] **Step 1: Run migrations in Supabase SQL editor**

```sql
-- 1. Comments table
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  user_id uuid references auth.users(id),
  author_name text,
  author_image text,
  content text not null,
  created_at timestamptz default now()
);

-- 2. Workout plans table
create table if not exists workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text not null,
  description text,
  days jsonb not null default '[]',
  is_public boolean default false,
  created_at timestamptz default now()
);

-- 3. Posts schema additions
alter table posts add column if not exists post_type text not null default 'reel';
alter table posts add column if not exists plan_data jsonb;
alter table posts add column if not exists original_post_id uuid references posts(id);
alter table posts add column if not exists comments_count integer not null default 0;
```

- [ ] **Step 2: Verify tables exist**

In Supabase Table Editor, confirm `comments` and `workout_plans` appear. Confirm `posts` has the 4 new columns.

---

## Task 2: CommentsDrawer

**Files:**
- Create: `src/components/CommentsDrawer.jsx`

- [ ] **Step 1: Create the component**

```jsx
// src/components/CommentsDrawer.jsx
import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Send, Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CommentsDrawer({ post, open, onClose }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", post.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("*")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: open,
  });

  const addComment = useMutation({
    mutationFn: async (content) => {
      const { error } = await supabase.from("comments").insert({
        post_id: post.id,
        user_id: user.id,
        author_name: user.full_name || user.email,
        author_image: user.profile_image || "",
        content,
      });
      if (error) throw error;
    },
    onMutate: async (content) => {
      const optimistic = {
        id: "temp-" + Date.now(),
        post_id: post.id,
        author_name: user.full_name || user.email,
        author_image: user.profile_image || "",
        content,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData(["comments", post.id], (old) => [
        ...(old || []),
        optimistic,
      ]);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", post.id] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const handleSubmit = () => {
    if (!text.trim()) return;
    addComment.mutate(text.trim());
    setText("");
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50 w-80 bg-card border-l border-border flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <span className="font-heading font-semibold text-sm">Comments</span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Be the first to comment</p>
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-secondary flex-shrink-0 overflow-hidden">
                  {c.author_image ? (
                    <img src={c.author_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                      {(c.author_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-heading font-semibold text-foreground">
                    {c.author_name}
                  </p>
                  <p className="text-sm text-foreground/80 mt-0.5 break-words">
                    {c.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-border flex items-center gap-2 flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-secondary flex-shrink-0 overflow-hidden">
            {user?.profile_image ? (
              <img src={user.profile_image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                {(user?.full_name || user?.email || "?")[0].toUpperCase()}
              </div>
            )}
          </div>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Add a comment..."
            className="flex-1 bg-secondary rounded-full px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="text-primary disabled:text-muted-foreground transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:5173. No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CommentsDrawer.jsx
git commit -m "feat: add CommentsDrawer component"
```

---

## Task 3: ShareSheet

**Files:**
- Create: `src/components/ShareSheet.jsx`

- [ ] **Step 1: Create the component**

```jsx
// src/components/ShareSheet.jsx
import { cn } from "@/lib/utils";
import { Link, Share2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

export default function ShareSheet({ post, open, onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(
      window.location.origin + "/post/" + post.id
    );
    toast.success("Link copied!");
    onClose();
  };

  const handleShareToTribe = async () => {
    const { error } = await supabase.from("posts").insert({
      post_type: "repost",
      original_post_id: post.id,
      content: post.content,
      media_url: post.media_url,
      media_type: post.media_type,
      user_id: user.id,
      author_name: user.full_name || user.email,
      author_image: user.profile_image || "",
    });
    if (error) { toast.error("Failed to share"); return; }
    queryClient.invalidateQueries({ queryKey: ["posts"] });
    toast.success("Shared to your tribe!");
    onClose();
  };

  const handleNativeShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: post.author_name,
        text: post.content || "",
        url: window.location.origin + "/post/" + post.id,
      });
    } catch (_) {}
    onClose();
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl border-t border-border p-4 space-y-1 transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-heading font-semibold text-sm">Share</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={handleCopyLink}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
        >
          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <Link className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-heading font-medium text-sm">Copy Link</p>
            <p className="text-xs text-muted-foreground">Share the post URL</p>
          </div>
        </button>

        <button
          onClick={handleShareToTribe}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
        >
          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            <RefreshCw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-heading font-medium text-sm">Share to Tribe</p>
            <p className="text-xs text-muted-foreground">Repost to your feed</p>
          </div>
        </button>

        {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <button
            onClick={handleNativeShare}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
          >
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
              <Share2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-heading font-medium text-sm">Share via…</p>
              <p className="text-xs text-muted-foreground">Use device share sheet</p>
            </div>
          </button>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify in browser**

No console errors at http://localhost:5173.

- [ ] **Step 3: Commit**

```bash
git add src/components/ShareSheet.jsx
git commit -m "feat: add ShareSheet component"
```

---

## Task 4: ReelCard upgrade

**Files:**
- Modify: `src/components/ReelCard.jsx`

- [ ] **Step 1: Replace ReelCard with upgraded version**

```jsx
// src/components/ReelCard.jsx
import { Heart, MessageCircle, Share2, MapPin, Play } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { cn } from "@/lib/utils";
import moment from "moment";
import CommentsDrawer from "./CommentsDrawer";
import ShareSheet from "./ShareSheet";

export default function ReelCard({ post, isVisible }) {
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const videoRef = useRef(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isVisible) {
      videoRef.current.play().catch(() => {});
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  }, [isVisible]);

  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    const newCount = newLiked ? likesCount + 1 : likesCount - 1;
    setLikesCount(newCount);
    await supabase.from("posts").update({ likes_count: newCount }).eq("id", post.id);
  };

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (!liked) handleLike();
      setShowHeart(true);
      setTimeout(() => setShowHeart(false), 900);
    }
    lastTapRef.current = now;
  };

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setPlaying(true);
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || !videoRef.current.duration) return;
    setProgress(videoRef.current.currentTime / videoRef.current.duration);
  };

  return (
    <div className="relative w-full h-full bg-black flex-shrink-0 overflow-hidden">
      {/* Media */}
      {post.media_url ? (
        post.media_type === "video" ? (
          <div className="relative w-full h-full" onClick={handleTap}>
            <video
              ref={videoRef}
              src={post.media_url}
              className="w-full h-full object-cover"
              loop
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onClick={togglePlay}
            />
            {!playing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/40 rounded-full p-5">
                  <Play className="h-10 w-10 text-white fill-white" />
                </div>
              </div>
            )}
            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20 pointer-events-none">
              <div
                className="h-full bg-primary"
                style={{ width: `${progress * 100}%`, transition: "width 0.25s linear" }}
              />
            </div>
          </div>
        ) : (
          <img
            src={post.media_url}
            alt=""
            className="w-full h-full object-cover"
            onClick={handleTap}
          />
        )
      ) : (
        <div
          className="w-full h-full bg-gradient-to-br from-secondary to-card flex items-center justify-center p-8"
          onClick={handleTap}
        >
          <p className="text-foreground text-xl font-heading font-bold text-center leading-relaxed">
            {post.content}
          </p>
        </div>
      )}

      {/* Double-tap heart burst */}
      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Heart className="h-24 w-24 text-white fill-white animate-ping" />
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

      {/* Bottom left: author + caption */}
      <div className="absolute bottom-0 left-0 right-14 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-secondary overflow-hidden border border-white/30">
            {post.author_image ? (
              <img src={post.author_image} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                {(post.author_name || "?")[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <span className="text-white font-heading font-semibold text-sm">{post.author_name}</span>
          {post.location && (
            <span className="text-white/60 text-xs flex items-center gap-0.5">
              <MapPin className="h-3 w-3" />
              {post.location}
            </span>
          )}
        </div>
        {post.media_url && post.content && (
          <p className="text-white text-sm leading-snug line-clamp-2">{post.content}</p>
        )}
        {post.exercise_tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {post.exercise_tags.map((tag) => (
              <span key={tag} className="text-xs text-primary font-medium">
                #{tag}
              </span>
            ))}
          </div>
        )}
        <p className="text-white/40 text-xs mt-1">{moment(post.created_date).fromNow()}</p>
      </div>

      {/* Right sidebar: action buttons */}
      <div className="absolute right-3 bottom-16 flex flex-col items-center gap-5">
        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <div
            className={cn(
              "h-11 w-11 rounded-full flex items-center justify-center",
              liked ? "bg-red-500/20" : "bg-black/30"
            )}
          >
            <Heart
              className={cn(
                "h-6 w-6 transition-transform duration-150",
                liked ? "fill-red-500 text-red-500 scale-110" : "text-white"
              )}
            />
          </div>
          <span className="text-white text-xs">{likesCount}</span>
        </button>

        <button
          onClick={() => setShowComments(true)}
          className="flex flex-col items-center gap-1"
        >
          <div className="h-11 w-11 rounded-full bg-black/30 flex items-center justify-center">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
          <span className="text-white text-xs">{commentsCount}</span>
        </button>

        <button
          onClick={() => setShowShare(true)}
          className="flex flex-col items-center gap-1"
        >
          <div className="h-11 w-11 rounded-full bg-black/30 flex items-center justify-center">
            <Share2 className="h-6 w-6 text-white" />
          </div>
        </button>
      </div>

      {/* Drawers / sheets */}
      <CommentsDrawer
        post={post}
        open={showComments}
        onClose={() => setShowComments(false)}
      />
      <ShareSheet
        post={post}
        open={showShare}
        onClose={() => setShowShare(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open http://localhost:5173. Log in. On the feed:
- Tap video → plays/pauses. Progress bar moves.
- Double-tap → heart burst animation.
- Tap comment icon → drawer slides in from right with empty state.
- Tap share icon → sheet slides up from bottom with 3 options.
- Tap backdrop → both close cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/components/ReelCard.jsx
git commit -m "feat: upgrade ReelCard with comments drawer, share sheet, double-tap like, progress bar"
```

---

## Task 5: Feed — IntersectionObserver

**Files:**
- Modify: `src/pages/Feed.jsx`

- [ ] **Step 1: Replace Feed with IntersectionObserver version**

```jsx
// src/pages/Feed.jsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import ReelCard from "../components/ReelCard";
import WorkoutPlanCard from "../components/WorkoutPlanCard";
import CreatePostDialog from "../components/CreatePostDialog";
import { Loader2, Flame } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";

export default function Feed() {
  const [visibleIndex, setVisibleIndex] = useState(0);
  const containerRef = useRef(null);

  const { data: rawPosts = [], isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const posts = useMemo(() => {
    if (!rawPosts.length) return [];
    return [...rawPosts].sort(() => Math.random() - 0.5);
  }, [rawPosts.length]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !posts.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleIndex(Number(entry.target.dataset.index));
          }
        });
      },
      { root: container, threshold: 0.6 }
    );
    const items = container.querySelectorAll("[data-reel]");
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [posts.length]);

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  if (posts.length === 0)
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="h-20 w-20 rounded-full bg-secondary flex items-center justify-center">
          <Flame className="h-10 w-10 text-primary/50" />
        </div>
        <div className="text-center">
          <h3 className="font-heading font-semibold text-lg">Your feed is empty</h3>
          <p className="text-sm text-muted-foreground mt-1">Be the first to share with your tribe</p>
        </div>
        <CreatePostDialog />
      </div>
    );

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: "none" }}
      >
        {posts.map((post, i) => (
          <div
            key={post.id}
            data-reel
            data-index={i}
            className="snap-start h-full w-full"
          >
            {post.post_type === "workout_plan" ? (
              <div className="h-full overflow-y-auto bg-background flex items-start justify-center p-4 pt-16">
                <div className="w-full max-w-lg">
                  <WorkoutPlanCard post={post} />
                </div>
              </div>
            ) : (
              <ReelCard post={post} isVisible={visibleIndex === i} />
            )}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-50 px-4 pt-4 pb-2 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <Flame className="h-6 w-6 text-primary drop-shadow" />
          <h1 className="font-display text-xl font-bold tracking-tight text-white drop-shadow">TRIBE</h1>
        </div>
        <div className="pointer-events-auto">
          <CreatePostDialog />
        </div>
      </div>

      {/* Scroll indicator dots */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1.5">
        {posts.slice(0, 8).map((_, i) => (
          <div
            key={i}
            className={
              "w-1 rounded-full transition-all duration-300 " +
              (visibleIndex === i ? "h-5 bg-primary" : "h-1.5 bg-white/30")
            }
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Scroll through feed — snap is precise, no visible jank. Plan posts (if any) render as cards instead of reels.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Feed.jsx
git commit -m "feat: switch Feed to IntersectionObserver, render WorkoutPlanCard for plan posts"
```

---

## Task 6: WorkoutPlanCard

**Files:**
- Create: `src/components/WorkoutPlanCard.jsx`

- [ ] **Step 1: Create the component**

```jsx
// src/components/WorkoutPlanCard.jsx
import { Dumbbell, Calendar, Copy, CheckCheck } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function WorkoutPlanCard({ post }) {
  const plan = post.plan_data;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  if (!plan) return null;

  const totalExercises = plan.days?.reduce(
    (acc, d) => acc + (d.exercises?.length || 0),
    0
  ) ?? 0;

  const handleCopy = async () => {
    const { error } = await supabase.from("workout_plans").insert({
      user_id: user.id,
      name: plan.name + " (copy)",
      description: plan.description,
      days: plan.days,
      is_public: false,
    });
    if (error) { toast.error("Failed to copy plan"); return; }
    queryClient.invalidateQueries({ queryKey: ["workout_plans"] });
    toast.success("Plan copied to My Plans!");
    setCopied(true);
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Author row */}
      <div className="flex items-center gap-3 p-4">
        <div className="h-10 w-10 rounded-full bg-secondary flex-shrink-0 overflow-hidden">
          {post.author_image ? (
            <img src={post.author_image} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
              {(post.author_name || "?")[0].toUpperCase()}
            </div>
          )}
        </div>
        <div>
          <p className="font-heading font-semibold text-sm">{post.author_name}</p>
          <p className="text-xs text-muted-foreground">shared a workout plan</p>
        </div>
      </div>

      {/* Plan card */}
      <div className="px-4 pb-4">
        <div className="bg-secondary rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-heading font-bold text-base truncate">{plan.name}</h3>
              {plan.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {plan.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {plan.days?.length || 0} days
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Dumbbell className="h-3 w-3" />
                  {totalExercises} exercises
                </span>
              </div>
            </div>
            <button
              onClick={handleCopy}
              disabled={copied}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-semibold transition-colors flex-shrink-0",
                copied
                  ? "bg-primary/20 text-primary cursor-default"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {copied ? (
                <><CheckCheck className="h-3.5 w-3.5" />Copied</>
              ) : (
                <><Copy className="h-3.5 w-3.5" />Copy Plan</>
              )}
            </button>
          </div>

          {/* Day preview */}
          <div className="mt-3 space-y-1.5">
            {plan.days?.slice(0, 3).map((day, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-heading font-semibold text-foreground w-12 flex-shrink-0">
                  {day.day}
                </span>
                <span className="text-muted-foreground truncate">{day.focus}</span>
                <span className="text-muted-foreground/50 flex-shrink-0">
                  {day.exercises?.length || 0} ex
                </span>
              </div>
            ))}
            {(plan.days?.length || 0) > 3 && (
              <p className="text-xs text-muted-foreground/60">
                +{plan.days.length - 3} more days
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

No console errors. (Card renders in feed when a workout_plan post exists.)

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkoutPlanCard.jsx
git commit -m "feat: add WorkoutPlanCard component for feed"
```

---

## Task 7: PlanEditor

**Files:**
- Create: `src/components/PlanEditor.jsx`

- [ ] **Step 1: Create the component**

```jsx
// src/components/PlanEditor.jsx
import { useState } from "react";
import { X, Plus, Trash2, ChevronDown, ChevronUp, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DAY_COLORS = [
  "text-blue-400 bg-blue-400/10",
  "text-green-400 bg-green-400/10",
  "text-orange-400 bg-orange-400/10",
  "text-purple-400 bg-purple-400/10",
  "text-cyan-400 bg-cyan-400/10",
  "text-red-400 bg-red-400/10",
  "text-yellow-400 bg-yellow-400/10",
];

function ExerciseRow({ ex, onChange, onDelete }) {
  return (
    <div className="bg-background/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={ex.name}
          onChange={(e) => onChange({ ...ex, name: e.target.value })}
          placeholder="Exercise name"
          className="flex-1 h-8 text-sm bg-secondary border-border"
        />
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">Sets</Label>
          <Input
            value={ex.sets}
            onChange={(e) => onChange({ ...ex, sets: e.target.value })}
            placeholder="4"
            className="h-7 text-xs bg-secondary border-border"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">Reps</Label>
          <Input
            value={ex.reps}
            onChange={(e) => onChange({ ...ex, reps: e.target.value })}
            placeholder="8-10"
            className="h-7 text-xs bg-secondary border-border"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground mb-1 block">Rest</Label>
          <Input
            value={ex.rest}
            onChange={(e) => onChange({ ...ex, rest: e.target.value })}
            placeholder="60s"
            className="h-7 text-xs bg-secondary border-border"
          />
        </div>
      </div>
    </div>
  );
}

function DaySection({ day, index, onChange, onDelete }) {
  const [expanded, setExpanded] = useState(true);

  const addExercise = () =>
    onChange({
      ...day,
      exercises: [...day.exercises, { name: "", sets: "", reps: "", rest: "", notes: "" }],
    });

  const updateExercise = (i, ex) =>
    onChange({ ...day, exercises: day.exercises.map((e, j) => (j === i ? ex : e)) });

  const deleteExercise = (i) =>
    onChange({ ...day, exercises: day.exercises.filter((_, j) => j !== i) });

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 p-3">
        <div
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0",
            DAY_COLORS[index % DAY_COLORS.length]
          )}
        >
          {index + 1}
        </div>
        <Input
          value={day.day}
          onChange={(e) => onChange({ ...day, day: e.target.value })}
          placeholder="Day 1"
          className="flex-1 h-8 text-sm font-heading font-semibold bg-secondary border-border"
        />
        <Input
          value={day.focus}
          onChange={(e) => onChange({ ...day, focus: e.target.value })}
          placeholder="Chest & Triceps"
          className="flex-1 h-8 text-sm bg-secondary border-border"
        />
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-muted-foreground flex-shrink-0"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 pt-3 pb-3 space-y-2">
          {day.exercises.map((ex, i) => (
            <ExerciseRow
              key={i}
              ex={ex}
              onChange={(updated) => updateExercise(i, updated)}
              onDelete={() => deleteExercise(i)}
            />
          ))}
          <button
            onClick={addExercise}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Exercise
          </button>
        </div>
      )}
    </div>
  );
}

export default function PlanEditor({ open, onClose, editPlan = null }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editPlan?.name || "");
  const [description, setDescription] = useState(editPlan?.description || "");
  const [days, setDays] = useState(editPlan?.days || []);

  const addDay = () =>
    setDays((d) => [
      ...d,
      {
        day: `Day ${d.length + 1}`,
        focus: "",
        exercises: [],
        color: DAY_COLORS[d.length % DAY_COLORS.length],
      },
    ]);

  const updateDay = (i, day) => setDays((d) => d.map((x, j) => (j === i ? day : x)));
  const deleteDay = (i) => setDays((d) => d.filter((_, j) => j !== i));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { user_id: user.id, name, description, days, is_public: false };
      if (editPlan) {
        const { error } = await supabase
          .from("workout_plans")
          .update(payload)
          .eq("id", editPlan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("workout_plans").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_plans"] });
      toast.success(editPlan ? "Plan updated!" : "Plan saved!");
      onClose();
    },
    onError: () => toast.error("Failed to save plan"),
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      if (editPlan) {
        await supabase.from("workout_plans").update({ is_public: true }).eq("id", editPlan.id);
      } else {
        await supabase.from("workout_plans").insert({
          user_id: user.id,
          name,
          description,
          days,
          is_public: true,
        });
      }
      const { error } = await supabase.from("posts").insert({
        post_type: "workout_plan",
        plan_data: { name, description, days },
        content: name + (description ? " — " + description : ""),
        user_id: user.id,
        author_name: user.full_name || user.email,
        author_image: user.profile_image || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_plans"] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Plan shared to your tribe!");
      onClose();
    },
    onError: () => toast.error("Failed to share plan"),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-xl flex-shrink-0">
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-heading font-bold">{editPlan ? "Edit Plan" : "New Plan"}</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => shareMutation.mutate()}
            disabled={!name.trim() || shareMutation.isPending}
            className="rounded-full font-heading text-xs h-8"
          >
            {shareMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Share2 className="h-3 w-3 mr-1" />
                Share
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!name.trim() || saveMutation.isPending}
            className="rounded-full font-heading text-xs h-8"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Plan Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My 5-Day Split"
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this plan about?"
              className="bg-secondary border-border resize-none"
              rows={2}
            />
          </div>
        </div>

        <div className="space-y-3">
          {days.map((day, i) => (
            <DaySection
              key={i}
              day={day}
              index={i}
              onChange={(d) => updateDay(i, d)}
              onDelete={() => deleteDay(i)}
            />
          ))}
          <button
            onClick={addDay}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border-2 border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Day
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

No console errors at http://localhost:5173.

- [ ] **Step 3: Commit**

```bash
git add src/components/PlanEditor.jsx
git commit -m "feat: add full-screen PlanEditor component"
```

---

## Task 8: Workouts page — My Plans, Templates, Community

**Files:**
- Modify: `src/pages/Workouts.jsx`
- Modify: `src/components/BodybuildingPlan.jsx`

- [ ] **Step 1: Update BodybuildingPlan.jsx — add `sectionTitle` prop and remove outer wrapper**

Replace the last 15 lines of `BodybuildingPlan.jsx` (the `export default function BodybuildingPlan` function) with:

```jsx
export default function BodybuildingPlan({ onStartWorkout }) {
  const [expandedPlan, setExpandedPlan] = useState(0);
  const [expandedDay, setExpandedDay] = useState(null);

  return (
    <div className="space-y-2">
      {PLANS.map((plan, pi) => (
        <div key={plan.id} className="space-y-2">
          <button
            className="w-full bg-card rounded-2xl border border-border p-4 text-left flex items-center justify-between"
            onClick={() => setExpandedPlan(expandedPlan === pi ? null : pi)}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <BarChart2 className="h-4 w-4 text-primary" />
                <h3 className="font-heading font-bold text-sm">{plan.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{plan.description}</p>
            </div>
            {expandedPlan === pi
              ? <ChevronUp className="h-4 w-4 text-muted-foreground ml-3 flex-shrink-0" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground ml-3 flex-shrink-0" />}
          </button>
          {expandedPlan === pi && (
            <div className="space-y-2 pl-1">
              {plan.days.map((day, di) => {
                const key = `${pi}-${di}`;
                return (
                  <DayCard
                    key={key}
                    day={day}
                    planName={plan.name}
                    expanded={expandedDay === key}
                    onToggle={() => setExpandedDay(expandedDay === key ? null : key)}
                    onStart={(day) => onStartWorkout(day, plan)}
                  />
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Replace Workouts.jsx**

```jsx
// src/pages/Workouts.jsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Dumbbell, BookOpen, Users, Edit2, Trash2, Share2 } from "lucide-react";
import WorkoutCard from "../components/WorkoutCard";
import WorkoutFormDialog from "../components/WorkoutFormDialog";
import BodybuildingPlan from "../components/BodybuildingPlan";
import ActiveWorkout from "../components/ActiveWorkout";
import WorkoutPlanCard from "../components/WorkoutPlanCard";
import PlanEditor from "../components/PlanEditor";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function SectionHeader({ title }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs font-heading font-bold text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function Workouts() {
  const [tab, setTab] = useState("log");
  const [formOpen, setFormOpen] = useState(false);
  const [editWorkout, setEditWorkout] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: workouts = [], isLoading: workoutsLoading } = useQuery({
    queryKey: ["workouts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: !!user,
  });

  const { data: myPlans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["workout_plans"],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const { data: communityPosts = [] } = useQuery({
    queryKey: ["community_plans"],
    queryFn: async () => {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("post_type", "workout_plan")
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const deleteWorkoutMutation = useMutation({
    mutationFn: async (id) => { await supabase.from("workouts").delete().eq("id", id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      toast.success("Workout deleted");
      setDeleteTarget(null);
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id) => { await supabase.from("workout_plans").delete().eq("id", id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_plans"] });
      toast.success("Plan deleted");
      setDeletePlanTarget(null);
    },
  });

  const sharePlanMutation = useMutation({
    mutationFn: async (plan) => {
      await supabase.from("workout_plans").update({ is_public: true }).eq("id", plan.id);
      const { error } = await supabase.from("posts").insert({
        post_type: "workout_plan",
        plan_data: { name: plan.name, description: plan.description, days: plan.days },
        content: plan.name + (plan.description ? " — " + plan.description : ""),
        user_id: user.id,
        author_name: user.full_name || user.email,
        author_image: user.profile_image || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      toast.success("Plan shared to your tribe!");
    },
    onError: () => toast.error("Failed to share plan"),
  });

  const TABS = [
    { id: "log", Icon: Dumbbell, label: "My Workouts" },
    { id: "plans", Icon: BookOpen, label: "Plans" },
  ];

  if (activeWorkout)
    return (
      <ActiveWorkout
        plan={activeWorkout.plan}
        day={activeWorkout.day}
        onFinish={() => {
          setActiveWorkout(null);
          setTab("log");
          queryClient.invalidateQueries({ queryKey: ["workouts"] });
        }}
        onCancel={() => setActiveWorkout(null)}
      />
    );

  return (
    <div className="max-w-lg mx-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display text-xl font-bold tracking-tight">Workouts</h1>
          {tab === "log" ? (
            <Button
              size="sm"
              onClick={() => { setEditWorkout(null); setFormOpen(true); }}
              className="rounded-full font-heading"
            >
              <Plus className="h-4 w-4 mr-1" />Log
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => { setEditPlan(null); setPlanEditorOpen(true); }}
              className="rounded-full font-heading"
            >
              <Plus className="h-4 w-4 mr-1" />New Plan
            </Button>
          )}
        </div>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {TABS.map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-heading font-medium transition-colors",
                tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── MY WORKOUTS TAB ── */}
        {tab === "log" && (
          workoutsLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : workouts.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-20 w-20 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4">
                <Dumbbell className="h-10 w-10 text-primary/50" />
              </div>
              <h3 className="font-heading font-semibold text-lg">No workouts yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Hit the gym and log your first session</p>
              <Button className="mt-4 font-heading rounded-full" onClick={() => setTab("plans")}>
                <BookOpen className="h-4 w-4 mr-2" />Browse Plans
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {workouts.map((w) => (
                <WorkoutCard
                  key={w.id}
                  workout={w}
                  onEdit={(w) => { setEditWorkout(w); setFormOpen(true); }}
                  onDelete={(w) => setDeleteTarget(w)}
                />
              ))}
            </div>
          )
        )}

        {/* ── PLANS TAB ── */}
        {tab === "plans" && (
          <div className="space-y-5">
            {/* My Plans */}
            <div className="space-y-3">
              <SectionHeader title="My Plans" />
              {plansLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : myPlans.length === 0 ? (
                <div className="text-center py-8 bg-card rounded-2xl border border-border border-dashed">
                  <p className="text-sm text-muted-foreground">No custom plans yet</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 font-heading"
                    onClick={() => { setEditPlan(null); setPlanEditorOpen(true); }}
                  >
                    <Plus className="h-4 w-4 mr-1" />Create your first plan
                  </Button>
                </div>
              ) : (
                myPlans.map((plan) => (
                  <div key={plan.id} className="bg-card rounded-2xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-heading font-bold text-sm truncate">{plan.name}</h3>
                        {plan.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{plan.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {plan.days?.length || 0} days ·{" "}
                          {plan.days?.reduce((a, d) => a + (d.exercises?.length || 0), 0)} exercises
                          {plan.is_public && (
                            <span className="ml-2 text-primary font-medium">· Shared</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!plan.is_public && (
                          <button
                            onClick={() => sharePlanMutation.mutate(plan)}
                            disabled={sharePlanMutation.isPending}
                            className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                          >
                            <Share2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => { setEditPlan(plan); setPlanEditorOpen(true); }}
                          className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletePlanTarget(plan)}
                          className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Templates */}
            <div className="space-y-3">
              <SectionHeader title="Templates" />
              <BodybuildingPlan onStartWorkout={(day, plan) => setActiveWorkout({ day, plan })} />
            </div>

            {/* Community */}
            <div className="space-y-3">
              <SectionHeader title="Community" />
              {communityPosts.length === 0 ? (
                <div className="text-center py-6 bg-card rounded-2xl border border-border">
                  <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No community plans yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Share your plan to be the first</p>
                </div>
              ) : (
                communityPosts.map((post) => (
                  <WorkoutPlanCard key={post.id} post={post} />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <WorkoutFormDialog open={formOpen} onOpenChange={setFormOpen} editWorkout={editWorkout} />

      <PlanEditor
        open={planEditorOpen}
        onClose={() => { setPlanEditorOpen(false); setEditPlan(null); }}
        editPlan={editPlan}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Delete workout?</AlertDialogTitle>
            <AlertDialogDescription>This action can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWorkoutMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletePlanTarget} onOpenChange={() => setDeletePlanTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Delete plan?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePlanMutation.mutate(deletePlanTarget.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Navigate to Workouts tab:
- "My Workouts" shows logged workouts as before
- "Plans" shows 3 sections: My Plans (empty state with create CTA), Templates (existing plans), Community (empty state)
- "+ New Plan" opens PlanEditor full-screen
- Create a plan with 2 days and 3 exercises each → Save → appears in My Plans
- Edit icon on plan card → PlanEditor opens pre-filled
- Share icon → plan appears in Community section and feed
- Delete plan → confirmation dialog → removed

- [ ] **Step 4: Commit**

```bash
git add src/pages/Workouts.jsx src/components/BodybuildingPlan.jsx
git commit -m "feat: restructure Workouts with My Plans, Templates, Community; wire PlanEditor"
```

---

## Self-Review

**Spec coverage:**
- ✅ Reels IntersectionObserver — Task 5
- ✅ Double-tap like with heart burst — Task 4
- ✅ Video progress bar — Task 4
- ✅ Comments side drawer (slide from right) — Tasks 2, 4
- ✅ Share bottom sheet (copy link, repost, native) — Tasks 3, 4
- ✅ Comments table + optimistic insert — Task 2
- ✅ Workout plans table — Task 1
- ✅ posts schema additions (post_type, plan_data, original_post_id, comments_count) — Task 1
- ✅ Full-screen PlanEditor — Task 7
- ✅ My Plans / Templates / Community sections — Task 8
- ✅ Share plan to feed as workout_plan card — Tasks 7, 8
- ✅ WorkoutPlanCard with Copy CTA — Task 6
- ✅ Feed renders WorkoutPlanCard for plan posts — Task 5

**No placeholders found.**

**Type consistency:** `plan_data` JSONB shape `{name, description, days}` is consistent across PlanEditor (write), WorkoutPlanCard (read), and SQL migration.
