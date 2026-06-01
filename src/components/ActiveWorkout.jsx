import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, X, Check, Clock, Dumbbell, TrendingUp, Trophy, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Progressive overload: if all sets hit target reps, suggest +5lbs next time
// Here we use last session data to suggest weight
function getSuggested(exercise, history) {
  // Find most recent workout that has this exercise
  for (const w of history) {
    const found = w.exercises?.find(e => e.name?.toLowerCase() === exercise.name?.toLowerCase());
    if (found) {
      // Check if they hit all reps last time (stored as completed_sets metadata via notes hack or just use weight)
      // If weight exists, suggest same or +5 depending on notes flag
      const didComplete = w.notes?.includes(`PO_COMPLETE:${exercise.name}`);
      return {
        weight: didComplete ? (found.weight_lbs || 0) + 5 : (found.weight_lbs || 0),
        reps: found.reps || exercise.reps_target,
        isProgression: didComplete,
      };
    }
  }
  return { weight: 0, reps: exercise.reps_target, isProgression: false };
}

// Parse "8-10" -> { min: 8, max: 10, target: 10 }
function parseReps(repsStr) {
  if (!repsStr) return { min: 8, max: 12, target: 10 };
  const str = String(repsStr);
  if (str.includes("-")) {
    const [min, max] = str.split("-").map(Number);
    return { min, max, target: max };
  }
  const n = parseInt(str);
  return { min: n, max: n, target: n };
}

// Rest timer component
function RestTimer({ seconds, onDone }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (remaining <= 0) { onDone(); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const pct = (remaining / seconds) * 100;
  const r = 28;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Rest</p>
      <div className="relative h-20 w-20">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
          <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="4"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
            className="transition-all duration-1000" strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold font-heading tabular-nums">{remaining}s</span>
        </div>
      </div>
      <button onClick={onDone} className="text-xs text-primary font-medium">Skip rest</button>
    </div>
  );
}

export default function ActiveWorkout({ plan, day, onFinish, onCancel }) {
  const queryClient = useQueryClient();
  const [exIdx, setExIdx] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [resting, setResting] = useState(false);
  const [restSeconds, setRestSeconds] = useState(0);
  // setLogs: { [exIdx]: [{ reps, weight, done }] }
  const [logs, setLogs] = useState({});
  const [done, setDone] = useState(false);
  const swipeStartX = useRef(null);

  // Timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const { user } = useAuth();

  const { data: history = [] } = useQuery({
    queryKey: ["workouts"],
    queryFn: async () => {
      const { data } = await supabase.from('workouts').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(20);
      return data || [];
    },
    enabled: !!user,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('workouts').insert({ ...data, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      toast.success("Workout saved! 💪");
      setDone(true);
    },
  });

  const exercises = day.exercises.map(ex => {
    const repsInfo = parseReps(ex.reps);
    return { ...ex, reps_target: repsInfo.target, reps_min: repsInfo.min, reps_max: repsInfo.max, reps_str: ex.reps };
  });

  const current = exercises[exIdx];
  const suggested = getSuggested(current, history);

  // Init log for current exercise if needed
  const currentLog = logs[exIdx] || Array.from({ length: current.sets }, () => ({
    reps: suggested.reps || current.reps_target,
    weight: suggested.weight || 0,
    done: false,
  }));

  const setCurrentLog = (updater) => {
    setLogs(prev => ({
      ...prev,
      [exIdx]: typeof updater === "function" ? updater(prev[exIdx] || currentLog) : updater,
    }));
  };

  const updateSet = (setIdx, field, value) => {
    setCurrentLog(prev => {
      const updated = [...(prev || currentLog)];
      updated[setIdx] = { ...updated[setIdx], [field]: value };
      return updated;
    });
  };

  const toggleSetDone = (setIdx) => {
    const sets = logs[exIdx] || currentLog;
    const allPrevDone = sets.slice(0, setIdx).every(s => s.done);
    if (setIdx > 0 && !allPrevDone) return; // must do in order
    setCurrentLog(prev => {
      const updated = [...(prev || currentLog)];
      updated[setIdx] = { ...updated[setIdx], done: !updated[setIdx].done };
      return updated;
    });
    // Start rest timer after completing a set (not the last one)
    const sets2 = logs[exIdx] || currentLog;
    if (!sets2[setIdx]?.done && setIdx < current.sets - 1) {
      const restSecs = parseRestSeconds(current.rest);
      setRestSeconds(restSecs);
      setResting(true);
    }
  };

  const allSetsDone = (idx) => {
    const l = logs[idx];
    if (!l) return false;
    return l.every(s => s.done);
  };

  const parseRestSeconds = (restStr) => {
    if (!restStr) return 60;
    if (restStr.includes("min")) return parseInt(restStr) * 60;
    return parseInt(restStr) || 60;
  };

  const goNext = () => {
    if (exIdx < exercises.length - 1) setExIdx(i => i + 1);
  };
  const goPrev = () => {
    if (exIdx > 0) setExIdx(i => i - 1);
  };

  // Swipe handling
  const handleTouchStart = (e) => { swipeStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (swipeStartX.current === null) return;
    const diff = swipeStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    swipeStartX.current = null;
  };

  const handleFinish = () => {
    const exercisesData = exercises.map((ex, i) => {
      const sets = logs[i] || [];
      const doneSets = sets.filter(s => s.done);
      const lastSet = doneSets[doneSets.length - 1];
      return {
        name: ex.name,
        sets: doneSets.length,
        reps: lastSet?.reps || ex.reps_target,
        weight_lbs: lastSet?.weight || 0,
      };
    });

    // Build progressive overload notes: mark exercises where all sets completed
    const poFlags = exercises.map((ex, i) => allSetsDone(i) ? `PO_COMPLETE:${ex.name}` : null).filter(Boolean).join(",");

    saveMutation.mutate({
      date: new Date().toISOString().split("T")[0],
      workout_type: "strength",
      duration_minutes: Math.round(elapsed / 60),
      notes: poFlags,
      exercises: exercisesData,
    });
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (done) {
    const totalSets = Object.values(logs).reduce((acc, l) => acc + (l?.filter(s => s.done).length || 0), 0);
    const completedExercises = exercises.filter((_, i) => allSetsDone(i)).length;
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6 z-50">
        <div className="text-center space-y-4 max-w-sm w-full">
          <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
            <Trophy className="h-12 w-12 text-primary" />
          </div>
          <h2 className="font-heading text-3xl font-bold">Crushed it! 💪</h2>
          <p className="text-muted-foreground text-sm">{day.focus} complete</p>
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { label: "Duration", value: formatTime(elapsed) },
              { label: "Exercises", value: `${completedExercises}/${exercises.length}` },
              { label: "Total Sets", value: totalSets },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card rounded-2xl border border-border p-3 text-center">
                <p className="text-lg font-bold font-heading text-primary">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <Button className="w-full font-heading mt-4" onClick={onFinish}>Back to Workouts</Button>
        </div>
      </div>
    );
  }

  const sets = logs[exIdx] || currentLog;
  const completedSets = sets.filter(s => s.done).length;

  return (
    <div
      className="fixed inset-0 bg-background flex flex-col z-50 select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 border-b border-border flex-shrink-0">
        <button onClick={onCancel} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground font-medium">{day.focus}</p>
          <div className="flex items-center gap-1 text-xs text-primary font-heading font-semibold justify-center">
            <Clock className="h-3 w-3" />{formatTime(elapsed)}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleFinish} disabled={saveMutation.isPending}
          className="rounded-xl text-xs font-heading border-primary text-primary hover:bg-primary hover:text-primary-foreground">
          Finish
        </Button>
      </div>

      {/* Exercise progress dots */}
      <div className="flex items-center justify-center gap-1.5 py-3 flex-shrink-0">
        {exercises.map((_, i) => (
          <button key={i} onClick={() => setExIdx(i)}
            className={cn("rounded-full transition-all duration-200",
              i === exIdx ? "w-6 h-2 bg-primary" :
              allSetsDone(i) ? "w-2 h-2 bg-primary/40" :
              "w-2 h-2 bg-secondary"
            )} />
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Exercise header */}
        <div className="mb-4">
          <div className="flex items-start justify-between mb-1">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground font-medium mb-0.5">
                Exercise {exIdx + 1} of {exercises.length}
              </p>
              <h2 className="font-heading font-bold text-2xl leading-tight">{current.name}</h2>
            </div>
            <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 ml-3 text-blue-400 bg-blue-400/10")}>
              <Dumbbell className="h-6 w-6" />
            </div>
          </div>

          {/* Plan target + progressive overload hint */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs bg-secondary text-foreground px-2.5 py-1 rounded-full font-medium">
              {current.sets} sets × {current.reps_str} reps
            </span>
            {current.rest && (
              <span className="text-xs bg-secondary text-muted-foreground px-2.5 py-1 rounded-full">
                Rest {current.rest}
              </span>
            )}
            {suggested.isProgression && (
              <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full flex items-center gap-1 font-medium">
                <TrendingUp className="h-3 w-3" />+5 lbs from last time
              </span>
            )}
          </div>

          {current.notes && (
            <p className="text-xs text-muted-foreground italic mt-1.5">{current.notes}</p>
          )}
        </div>

        {/* Rest timer overlay */}
        {resting && (
          <div className="bg-card border border-border rounded-2xl mb-4">
            <RestTimer seconds={restSeconds} onDone={() => setResting(false)} />
          </div>
        )}

        {/* Sets */}
        <div className="space-y-2.5 mb-4">
          <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 px-1 mb-1">
            <span className="text-[10px] text-muted-foreground text-center">Set</span>
            <span className="text-[10px] text-muted-foreground text-center">Weight (lbs)</span>
            <span className="text-[10px] text-muted-foreground text-center">Reps</span>
            <span />
          </div>

          {sets.map((set, i) => {
            const isActive = !set.done && sets.slice(0, i).every(s => s.done);
            const isPast = set.done;
            return (
              <div key={i}
                className={cn(
                  "grid grid-cols-[2rem_1fr_1fr_2rem] gap-2 items-center p-2 rounded-xl transition-all duration-200",
                  isPast ? "bg-primary/8 opacity-70" : isActive ? "bg-card border border-primary/40 shadow-sm" : "bg-secondary/50 opacity-50"
                )}>
                <span className={cn("text-sm font-bold text-center font-heading",
                  isPast ? "text-primary" : "text-muted-foreground")}>
                  {i + 1}
                </span>
                {/* Weight input */}
                <div className="flex items-center gap-1">
                  <button onClick={() => updateSet(i, "weight", Math.max(0, (set.weight || 0) - 5))}
                    className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
                    disabled={isPast}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <Input
                    type="number"
                    value={set.weight || ""}
                    onChange={e => updateSet(i, "weight", parseFloat(e.target.value) || 0)}
                    disabled={isPast}
                    className="h-8 text-center text-sm font-heading font-semibold bg-secondary border-0 px-1"
                    placeholder="0"
                  />
                  <button onClick={() => updateSet(i, "weight", (set.weight || 0) + 5)}
                    className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
                    disabled={isPast}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Reps input */}
                <div className="flex items-center gap-1">
                  <button onClick={() => updateSet(i, "reps", Math.max(1, (set.reps || 0) - 1))}
                    className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
                    disabled={isPast}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <Input
                    type="number"
                    value={set.reps || ""}
                    onChange={e => updateSet(i, "reps", parseInt(e.target.value) || 0)}
                    disabled={isPast}
                    className="h-8 text-center text-sm font-heading font-semibold bg-secondary border-0 px-1"
                    placeholder="0"
                  />
                  <button onClick={() => updateSet(i, "reps", (set.reps || 0) + 1)}
                    className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
                    disabled={isPast}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Done button */}
                <button
                  onClick={() => toggleSetDone(i)}
                  disabled={!isActive && !isPast}
                  className={cn(
                    "h-8 w-8 rounded-xl flex items-center justify-center transition-all duration-200",
                    isPast ? "bg-primary text-primary-foreground" :
                    isActive ? "bg-secondary border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground" :
                    "bg-secondary text-muted-foreground opacity-40"
                  )}>
                  {isPast ? <Check className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>

        {/* Progress bar for this exercise */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{completedSets} / {current.sets} sets done</span>
            {completedSets === current.sets && <span className="text-primary font-medium">✓ All sets complete</span>}
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${(completedSets / current.sets) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="flex-shrink-0 px-4 pb-safe pb-6 pt-3 border-t border-border bg-background/95 backdrop-blur-xl">
        <div className="flex gap-3">
          <Button variant="outline" onClick={goPrev} disabled={exIdx === 0}
            className="flex-1 rounded-2xl font-heading h-12">
            <ChevronLeft className="h-5 w-5 mr-1" /> Prev
          </Button>
          {exIdx < exercises.length - 1 ? (
            <Button onClick={goNext} className="flex-[2] rounded-2xl font-heading h-12 font-semibold">
              Next <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleFinish} disabled={saveMutation.isPending}
              className="flex-[2] rounded-2xl font-heading h-12 font-semibold bg-primary">
              <Trophy className="h-4 w-4 mr-2" /> Finish Workout
            </Button>
          )}
        </div>
        <p className="text-center text-[10px] text-muted-foreground mt-2">Swipe left/right to switch exercises</p>
      </div>
    </div>
  );
}
