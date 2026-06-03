// src/components/PlanEditor.jsx
import { useState, useEffect } from "react";
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

  useEffect(() => {
    setName(editPlan?.name || "");
    setDescription(editPlan?.description || "");
    setDays(editPlan?.days || []);
  }, [editPlan, open]);

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
      if (!user?.id) throw new Error("Not authenticated");
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
      if (!user?.id) throw new Error("Not authenticated");
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
    <div className="fixed inset-0 z-50 bg-background flex flex-col pt-safe pb-safe">
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
