import { Dumbbell, Clock, ChevronDown, ChevronUp, Trash2, Pencil, TrendingUp, Weight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import moment from "moment";

export default function WorkoutCard({ workout, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const typeColors = {
    strength: "text-blue-400 bg-blue-400/10",
    cardio: "text-green-400 bg-green-400/10",
    hiit: "text-orange-400 bg-orange-400/10",
    yoga: "text-purple-400 bg-purple-400/10",
    crossfit: "text-red-400 bg-red-400/10",
    calisthenics: "text-cyan-400 bg-cyan-400/10",
    other: "text-muted-foreground bg-muted",
  };

  // Calculate total volume (sets × reps × weight)
  const totalVolume = workout.exercises?.reduce((acc, ex) => {
    return acc + (ex.sets || 0) * (ex.reps || 0) * (ex.weight_lbs || 0); // weight_lbs stores kg values
  }, 0) || 0;

  const totalSets = workout.exercises?.reduce((acc, ex) => acc + (ex.sets || 0), 0) || 0;

  // Parse plan day from notes if available
  const planDay = workout.notes && !workout.notes.startsWith("PO_COMPLETE")
    ? workout.notes
    : null;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0", typeColors[workout.workout_type] || typeColors.other)}>
          <Dumbbell className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-semibold text-sm capitalize">{workout.workout_type}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>{moment(workout.date).format("MMM D")}</span>
            {workout.duration_minutes > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />{workout.duration_minutes}m
                </span>
              </>
            )}
            {totalSets > 0 && (
              <>
                <span>·</span>
                <span>{totalSets} sets</span>
              </>
            )}
            {totalVolume > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5 text-primary">
                  <TrendingUp className="h-3 w-3" />{(totalVolume).toLocaleString()} kg vol
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(workout)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(workout)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-secondary">
            <Trash2 className="h-4 w-4" />
          </button>
          {workout.exercises?.length > 0 && (
            <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {expanded && workout.exercises?.length > 0 && (
        <div className="px-4 pb-4 pt-1 border-t border-border space-y-2">
          {workout.exercises.map((ex, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1">
              <span className="text-foreground font-medium">{ex.name}</span>
              <div className="text-right">
                <span className="text-muted-foreground text-xs">
                  {ex.sets > 0 && `${ex.sets} × `}{ex.reps > 0 && ex.reps}
                  {ex.weight_lbs > 0 ? ` @ ${ex.weight_lbs} kg` : ""}
                </span>
                {ex.sets > 0 && ex.reps > 0 && ex.weight_lbs > 0 && (
                  <p className="text-[10px] text-primary/70">
                    {(ex.sets * ex.reps * ex.weight_lbs).toLocaleString()} kg vol
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
