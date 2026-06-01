// src/components/ReelCard.jsx
import { Heart, MessageCircle, Share2, MapPin, Play, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import moment from "moment";
import { toast } from "sonner";

export default function ReelCard({ post, isVisible, onOpenComments, onOpenShare }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [liked, setLiked] = useState(false);
  const isOwner = user?.id === post.user_id;
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const [commentsCount, setCommentsCount] = useState(post.comments_count || 0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showHeart, setShowHeart] = useState(false);
  const videoRef = useRef(null);
  const lastTapRef = useRef(0);
  const heartTimerRef = useRef(null);
  const singleTapTimer = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isVisible) {
      videoRef.current.play()
        .then(() => setPlaying(true))
        .catch(() => setPlaying(false));
    } else {
      videoRef.current.pause();
      setPlaying(false);
    }
  }, [isVisible]);

  // Fix 5: cleanup heart and tap timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(heartTimerRef.current);
      clearTimeout(singleTapTimer.current);
    };
  }, []);

  // Fix 3: handleLike with error rollback
  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikesCount((c) => (newLiked ? c + 1 : c - 1));
    const { error } = await supabase
      .from("posts")
      .update({ likes_count: newLiked ? likesCount + 1 : likesCount - 1 })
      .eq("id", post.id);
    if (error) {
      setLiked(!newLiked);
      setLikesCount((c) => (newLiked ? c - 1 : c + 1));
    }
  };

  // Fix 1: unified tap handler distinguishing single vs double tap
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // double-tap
      clearTimeout(singleTapTimer.current);
      lastTapRef.current = 0;
      if (!liked) handleLike();
      setShowHeart(true);
      const t = setTimeout(() => setShowHeart(false), 900);
      heartTimerRef.current = t;
    } else {
      // single-tap: schedule play toggle after 300ms
      singleTapTimer.current = setTimeout(() => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
          videoRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else {
          videoRef.current.pause();
          setPlaying(false);
        }
      }, 300);
      lastTapRef.current = now;
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Delete this post?")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Post deleted");
    queryClient.invalidateQueries({ queryKey: ["posts"] });
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

        <button onClick={() => onOpenComments?.()} className="flex flex-col items-center gap-1">
          <div className="h-11 w-11 rounded-full bg-black/30 flex items-center justify-center">
            <MessageCircle className="h-6 w-6 text-white" />
          </div>
          <span className="text-white text-xs">{commentsCount}</span>
        </button>

        <button onClick={() => onOpenShare?.()} className="flex flex-col items-center gap-1">
          <div className="h-11 w-11 rounded-full bg-black/30 flex items-center justify-center">
            <Share2 className="h-6 w-6 text-white" />
          </div>
        </button>

        {isOwner && (
          <button onClick={handleDelete} className="flex flex-col items-center gap-1">
            <div className="h-11 w-11 rounded-full bg-black/30 flex items-center justify-center">
              <Trash2 className="h-5 w-5 text-white/70" />
            </div>
          </button>
        )}
      </div>

    </div>
  );
}
