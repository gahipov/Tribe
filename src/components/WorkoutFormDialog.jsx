import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const workoutTypes = ["strength", "cardio", "hiit", "yoga", "crossfit", "calisthenics", "other"];

export default function WorkoutFormDialog({ open, onOpenChange, editWorkout }) {
  const [date, setDate] = useState("");
  const [workoutType, setWorkoutType] = useState("strength");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [exercises, setExercises] = useState([{ name: "", sets: "", reps: "", weight_lbs: "" }]);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (editWorkout) {
      setDate(editWorkout.date || ""); setWorkoutType(editWorkout.workout_type || "strength");
      setDuration(editWorkout.duration_minutes?.toString() || ""); setNotes(editWorkout.notes || "");
      setExercises(editWorkout.exercises?.length ? editWorkout.exercises.map(e => ({ name: e.name||"", sets: e.sets?.toString()||"", reps: e.reps?.toString()||"", weight_lbs: e.weight_lbs?.toString()||"" })) : [{ name: "", sets: "", reps: "", weight_lbs: "" }]);
    } else {
      setDate(new Date().toISOString().split("T")[0]); setWorkoutType("strength"); setDuration(""); setNotes(""); setExercises([{ name: "", sets: "", reps: "", weight_lbs: "" }]);
    }
  }, [editWorkout, open]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (editWorkout) {
        const { error } = await supabase.from('workouts').update(data).eq('id', editWorkout.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('workouts').insert({ ...data, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["workouts"] }); toast.success(editWorkout ? "Workout updated!" : "Workout logged!"); onOpenChange(false); },
  });

  const handleSubmit = () => {
    const exList = exercises.filter(e => e.name.trim()).map(e => ({ name: e.name, sets: parseInt(e.sets)||0, reps: parseInt(e.reps)||0, weight_lbs: parseFloat(e.weight_lbs)||0 }));
    mutation.mutate({ date, workout_type: workoutType, duration_minutes: parseInt(duration)||0, notes, exercises: exList });
  };

  const updateExercise = (i, field, value) => { const u = [...exercises]; u[i][field] = value; setExercises(u); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading">{editWorkout ? "Edit Workout" : "Log Workout"}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-3">
            <div className="flex-1"><Label className="text-xs text-muted-foreground mb-1.5 block">Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border" /></div>
            <div className="flex-1"><Label className="text-xs text-muted-foreground mb-1.5 block">Type</Label><Select value={workoutType} onValueChange={setWorkoutType}><SelectTrigger className="bg-secondary border-border capitalize"><SelectValue /></SelectTrigger><SelectContent>{workoutTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Duration (minutes)</Label><Input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="45" className="bg-secondary border-border" /></div>
          <div>
            <div className="flex items-center justify-between mb-2"><Label className="text-xs text-muted-foreground">Exercises</Label><Button variant="ghost" size="sm" onClick={() => setExercises([...exercises, { name: "", sets: "", reps: "", weight_lbs: "" }])} className="text-primary text-xs h-7"><Plus className="h-3 w-3 mr-1" /> Add</Button></div>
            <div className="space-y-2">{exercises.map((ex, i) => <div key={i} className="flex gap-2 items-start"><Input placeholder="Exercise" value={ex.name} onChange={e => updateExercise(i, "name", e.target.value)} className="bg-secondary border-border flex-[2]" /><Input placeholder="Sets" type="number" value={ex.sets} onChange={e => updateExercise(i, "sets", e.target.value)} className="bg-secondary border-border flex-1" /><Input placeholder="Reps" type="number" value={ex.reps} onChange={e => updateExercise(i, "reps", e.target.value)} className="bg-secondary border-border flex-1" /><Input placeholder="lbs" type="number" value={ex.weight_lbs} onChange={e => updateExercise(i, "weight_lbs", e.target.value)} className="bg-secondary border-border flex-1" />{exercises.length > 1 && <button onClick={() => setExercises(exercises.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive mt-2"><X className="h-4 w-4" /></button>}</div>)}</div>
          </div>
          <Textarea placeholder="Notes..." value={notes} onChange={e => setNotes(e.target.value)} className="bg-secondary border-border resize-none" />
          <Button onClick={handleSubmit} disabled={mutation.isPending || !date} className="w-full font-heading font-semibold">{mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{editWorkout ? "Update Workout" : "Log Workout"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
