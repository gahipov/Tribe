// src/components/CommentsDrawer.jsx
import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Send, Loader2, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function CommentsDrawer({ post, open, onClose }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["comments", post?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("*")
        .eq("post_id", post.id)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: open && !!post?.id,
  });

  const addComment = useMutation({
    mutationFn: async (content) => {
      if (!user?.id) throw new Error("Not authenticated");
      if (!post?.id) throw new Error("Invalid post");
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
      await queryClient.cancelQueries({ queryKey: ["comments", post.id] });
      const previous = queryClient.getQueryData(["comments", post.id]);
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
      return { previous };
    },
    onError: (_err, _content, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["comments", post.id], context.previous);
      }
      toast.error("Failed to post comment");
    },
    onSuccess: () => {
      setText("");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", post.id] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const handleSubmit = () => {
    if (!text.trim()) return;
    if (!user) {
      toast.error("Please sign in to add a comment.");
      return;
    }
    if (addComment.isPending) return;
    addComment.mutate(text.trim());
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
          "fixed top-0 right-0 bottom-0 z-[60] w-80 bg-card border-l border-border flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
        onClick={e => e.stopPropagation()}
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
            type="button"
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
