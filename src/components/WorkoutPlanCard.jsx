// src/components/WorkoutPlanCard.jsx
import { Dumbbell, Calendar, Copy, CheckCheck, Loader2 } from "lucide-react";
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
  const [copying, setCopying] = useState(false);

  if (!plan) return null;

  const totalExercises = plan.days?.reduce(
    (acc, d) => acc + (d.exercises?.length || 0),
    0
  ) ?? 0;

  const handleCopy = async () => {
    if (copying || copied) return;
    if (!user?.id) {
      toast.error("Unable to save plan. Please sign in again.");
      return;
    }
    setCopying(true);
    const { error } = await supabase.from("workout_plans").insert({
      user_id: user.id,
      name: plan.name + " (copy)",
      description: plan.description,
      days: plan.days,
      is_public: false,
    });
    setCopying(false);
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
              disabled={copying || copied}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-semibold transition-colors flex-shrink-0",
                copied || copying
                  ? "bg-primary/20 text-primary cursor-default"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {copied ? (
                <><CheckCheck className="h-3.5 w-3.5" />Copied</>
              ) : copying ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" />Copying...</>
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
