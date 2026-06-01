// src/components/ShareSheet.jsx
import { cn } from "@/lib/utils";
import { Link, Share2, RefreshCw, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export default function ShareSheet({ post, open, onClose }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sharing, setSharing] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        window.location.origin + "/post/" + post.id
      );
      toast.success("Link copied!");
    } catch (_) {
      toast.error("Could not copy link");
    }
    onClose();
  };

  const handleShareToTribe = async () => {
    if (sharing) return;
    setSharing(true);
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
    setSharing(false);
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
      onClose();
    } catch (_) {
      // user cancelled — stay on sheet
    }
  };

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[59] bg-black/50 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-2xl border-t border-border p-4 space-y-1 transition-transform duration-300 ease-out",
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
          disabled={sharing}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
            {sharing ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : <RefreshCw className="h-5 w-5 text-primary" />}
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
