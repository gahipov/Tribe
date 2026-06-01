import { Heart, MessageCircle, Share2, MapPin } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { cn } from "@/lib/utils";
import moment from "moment";

export default function PostCard({ post }) {
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count || 0);
  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    const newCount = newLiked ? likesCount + 1 : likesCount - 1;
    setLikesCount(newCount);
    await supabase.from('posts').update({ likes_count: newCount }).eq('id', post.id);
  };
  return (
    <div className="bg-card rounded-2xl overflow-hidden border border-border">
      <div className="flex items-center gap-3 p-4">
        <div className="h-10 w-10 rounded-full bg-secondary overflow-hidden flex-shrink-0">
          {post.author_image ? <img src={post.author_image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm font-bold">{(post.author_name || post.created_by || "?")[0]?.toUpperCase()}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-semibold text-sm text-foreground truncate">{post.author_name || post.created_by}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{moment(post.created_date).fromNow()}</span>
            {post.location && <><span>·</span><span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{post.location}</span></>}
          </div>
        </div>
      </div>
      {post.media_url && (
        <div className="relative aspect-square bg-secondary">
          {post.media_type === "video" ? <video src={post.media_url} className="w-full h-full object-cover" controls playsInline preload="metadata" /> : <img src={post.media_url} alt="" className="w-full h-full object-cover" />}
        </div>
      )}
      {post.content && <div className="px-4 pt-3"><p className="text-sm text-foreground leading-relaxed">{post.content}</p></div>}
      {post.exercise_tags?.length > 0 && <div className="px-4 pt-2 flex flex-wrap gap-1.5">{post.exercise_tags.map(tag => <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">#{tag}</span>)}</div>}
      <div className="flex items-center gap-6 p-4">
        <button onClick={handleLike} className="flex items-center gap-1.5 group">
          <Heart className={cn("h-5 w-5 transition-all duration-200", liked ? "fill-red-500 text-red-500 scale-110" : "text-muted-foreground group-hover:text-red-400")} />
          <span className={cn("text-sm", liked ? "text-red-500" : "text-muted-foreground")}>{likesCount}</span>
        </button>
        <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"><MessageCircle className="h-5 w-5" /><span className="text-sm">0</span></button>
        <button className="text-muted-foreground hover:text-foreground transition-colors"><Share2 className="h-5 w-5" /></button>
      </div>
    </div>
  );
}
