// src/pages/Feed.jsx
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/api/supabaseClient";
import ReelCard from "../components/ReelCard";
import WorkoutPlanCard from "../components/WorkoutPlanCard";
import CommentsDrawer from "../components/CommentsDrawer";
import ShareSheet from "../components/ShareSheet";
import CreatePostDialog from "../components/CreatePostDialog";
import { Loader2, Flame } from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";

export default function Feed() {
  const { user } = useAuth();
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [activeCommentPost, setActiveCommentPost] = useState(null);
  const [activeSharePost, setActiveSharePost] = useState(null);
  const containerRef = useRef(null);

  // Load blocked ids from DB on mount so they persist across navigation
  const { data: blockedData = [], refetch: refetchBlocked } = useQuery({
    queryKey: ["blocked-ids"],
    queryFn: async () => {
      const { data } = await supabase.from("blocked_users").select("blocked_user_id").eq("user_id", user.id);
      return data || [];
    },
    enabled: !!user,
  });

  const blockedIds = useMemo(() => new Set(blockedData.map(b => b.blocked_user_id)), [blockedData]);

  const handleBlock = useCallback((userId) => {
    refetchBlocked();
  }, [refetchBlocked]);

  const { data: rawPosts = [], isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const shuffledRef = useRef([]);
  const posts = useMemo(() => {
    if (!rawPosts.length) return [];
    if (shuffledRef.current.length === 0) {
      shuffledRef.current = [...rawPosts].sort(() => Math.random() - 0.5);
    }
    return shuffledRef.current.filter(p => !blockedIds.has(p.user_id));
  }, [rawPosts, blockedIds]);

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
  }, [posts]);

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
        className="h-full overflow-y-scroll snap-y snap-mandatory flex flex-col"
        style={{ scrollbarWidth: "none" }}
      >
        {posts.map((post, i) => (
          <div
            key={post.id}
            data-reel
            data-index={i}
            className="snap-start flex-shrink-0 w-full flex items-center justify-center py-2 px-2"
            style={{ height: "82dvh" }}
          >
            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-xl">
              {post.post_type === "workout_plan" ? (
                <div className="h-full overflow-y-auto bg-background flex items-start justify-center p-4 pt-4">
                  <div className="w-full max-w-lg">
                    <WorkoutPlanCard post={post} />
                  </div>
                </div>
              ) : (
                <ReelCard
                  post={post}
                  isVisible={visibleIndex === i}
                  onOpenComments={() => setActiveCommentPost(post)}
                  onOpenShare={() => setActiveSharePost(post)}
                  onBlock={handleBlock}
                />
              )}
            </div>
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

      {/* Drawers rendered at Feed level — outside scroll container so fixed positioning works */}
      <CommentsDrawer
        post={activeCommentPost}
        open={!!activeCommentPost}
        onClose={() => setActiveCommentPost(null)}
      />
      <ShareSheet
        post={activeSharePost}
        open={!!activeSharePost}
        onClose={() => setActiveSharePost(null)}
      />

      {/* Scroll indicator dots */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1.5">
        {posts.slice(0, 8).map((_, i) => (
          <div
            key={i}
            className={
              "w-1 rounded-full transition-all duration-300 " +
              (Math.min(visibleIndex, 7) === i ? "h-5 bg-primary" : "h-1.5 bg-white/30")
            }
          />
        ))}
      </div>
    </div>
  );
}
