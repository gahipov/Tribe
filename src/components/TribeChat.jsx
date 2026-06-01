import { useState, useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Send, Loader2, MessageCircle, Shield, Users, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import moment from "moment";

const MEETUP_TEMPLATES = [
  "Anyone down to train together this week? 💪",
  "Meeting at the gym tomorrow morning — who's in?",
  "Looking for a spotter for heavy bench day. Anyone available?",
  "Let's plan a group session this weekend!",
];

export default function TribeChat({ tribe, open, onClose }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const queryClient = useQueryClient();
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["tribe-messages", tribe?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tribe_messages")
        .select("*")
        .eq("tribe_id", tribe.id)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!tribe?.id,
    refetchInterval: open ? 5000 : false,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["tribe-members", tribe?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("tribe_members")
        .select("user_id, profiles(full_name, profile_image)")
        .eq("tribe_id", tribe.id);
      return data || [];
    },
    enabled: open && !!tribe?.id,
  });

  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [messages.length, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const sendMutation = useMutation({
    mutationFn: async (content) => {
      const { error } = await supabase.from("tribe_messages").insert({
        tribe_id: tribe.id,
        user_id: user.id,
        author_name: user.full_name || user.email,
        author_image: user.profile_image || "",
        content,
      });
      if (error) throw error;
    },
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: ["tribe-messages", tribe.id] });
      const previous = queryClient.getQueryData(["tribe-messages", tribe.id]);
      const optimistic = {
        id: "temp-" + Date.now(),
        tribe_id: tribe.id,
        user_id: user.id,
        author_name: user.full_name || user.email,
        author_image: user.profile_image || "",
        content,
        created_at: new Date().toISOString(),
      };
      queryClient.setQueryData(["tribe-messages", tribe.id], (old) => [...(old || []), optimistic]);
      return { previous };
    },
    onError: (_err, _content, context) => {
      if (context?.previous) queryClient.setQueryData(["tribe-messages", tribe.id], context.previous);
      toast.error("Failed to send: " + (_err?.message || "unknown error"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tribe-messages", tribe.id] });
    },
  });

  const send = (content) => {
    const msg = content?.trim() || text.trim();
    if (!msg || sendMutation.isPending) return;
    sendMutation.mutate(msg);
    setText("");
    setShowTemplates(false);
  };

  if (!tribe) return null;

  return (
    <>
      <div
        className={cn("fixed inset-0 z-[59] bg-black/60 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")}
        onClick={onClose}
      />
      <div
        className={cn("fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-3xl flex flex-col transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "translate-y-full")}
        style={{ height: "88vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-sm truncate">{tribe.name}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{tribe.member_count || 1} members</span>
              {tribe.gym_name && <span className="flex items-center gap-1"><Dumbbell className="h-3 w-3" />{tribe.gym_name}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Members strip */}
        {members.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {members.slice(0, 12).map((m, i) => (
              <div key={i} className="h-7 w-7 rounded-full bg-secondary flex-shrink-0 overflow-hidden border-2 border-background">
                {m.profiles?.profile_image
                  ? <img src={m.profiles.profile_image} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">{(m.profiles?.full_name || "?")[0].toUpperCase()}</div>}
              </div>
            ))}
            {members.length > 12 && <span className="text-xs text-muted-foreground flex-shrink-0">+{members.length - 12}</span>}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center pb-8">
              <MessageCircle className="h-10 w-10 text-muted-foreground/20 mb-3" />
              <p className="font-heading font-semibold text-sm">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start coordinating with your tribe</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const isMe = msg.user_id === user?.id;
                return (
                  <div key={msg.id} className={cn("flex gap-2 items-end", isMe ? "flex-row-reverse" : "flex-row")}>
                    {!isMe && (
                      <div className="h-7 w-7 rounded-full bg-secondary flex-shrink-0 overflow-hidden mb-4">
                        {msg.author_image
                          ? <img src={msg.author_image} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-muted-foreground">{(msg.author_name || "?")[0].toUpperCase()}</div>}
                      </div>
                    )}
                    <div className={cn("max-w-[75%] flex flex-col gap-0.5", isMe ? "items-end" : "items-start")}>
                      {!isMe && <p className="text-[10px] text-muted-foreground ml-1">{msg.author_name}</p>}
                      <div className={cn("px-3 py-2 rounded-2xl text-sm leading-snug break-words",
                        isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary text-foreground rounded-bl-sm")}>
                        {msg.content}
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 mx-1">{moment(msg.created_at).fromNow()}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Quick templates — tapping sends immediately */}
        {showTemplates && (
          <div className="px-3 pb-2 flex flex-col gap-1.5 flex-shrink-0 border-t border-border pt-2">
            <p className="text-[10px] text-muted-foreground uppercase font-medium px-1 mb-0.5">Quick messages — tap to send</p>
            {MEETUP_TEMPLATES.map((t, i) => (
              <button
                key={i}
                onClick={() => send(t)}
                className="text-left text-xs px-3 py-2.5 bg-secondary rounded-xl text-foreground hover:bg-primary/10 active:scale-[0.98] transition-all"
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="p-3 border-t border-border flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowTemplates(s => !s)}
            className={cn("h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
              showTemplates ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}
          >
            <Dumbbell className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Plan a meetup..."
            className="flex-1 bg-secondary rounded-full px-4 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => send()}
            disabled={!text.trim() || sendMutation.isPending}
            className="h-9 w-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
          >
            {sendMutation.isPending
              ? <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
              : <Send className="h-4 w-4 text-primary-foreground" />}
          </button>
        </div>
      </div>
    </>
  );
}
