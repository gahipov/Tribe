// src/pages/Workouts.jsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Dumbbell, BookOpen, Users, Edit2, Trash2, Share2, TrendingUp, Play, ChevronDown, ChevronUp, BarChart2, Flame, Trophy } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import WorkoutCard from "../components/WorkoutCard";
import WorkoutFormDialog from "../components/WorkoutFormDialog";
import BodybuildingPlan from "../components/BodybuildingPlan";
import ActiveWorkout from "../components/ActiveWorkout";
import WorkoutPlanCard from "../components/WorkoutPlanCard";
import PlanEditor from "../components/PlanEditor";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function SectionHeader({ title }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs font-heading font-bold text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

export default function Workouts() {
  const [tab, setTab] = useState("log");
  const [formOpen, setFormOpen] = useState(false);
  const [editWorkout, setEditWorkout] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [editPlan, setEditPlan] = useState(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState(null);
  const [expandedPlanId, setExpandedPlanId] = useState(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: workouts = [], isLoading: workoutsLoading } = useQuery({
    queryKey: ["workouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: myPlans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["workout_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_plans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: communityPosts = [] } = useQuery({
    queryKey: ["community_plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("post_type", "workout_plan")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
  });

  const deleteWorkoutMutation = useMutation({
    mutationFn: async (id) => { await supabase.from("workouts").delete().eq("id", id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workouts"] });
      toast.success("Workout deleted");
      setDeleteTarget(null);
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id) => { await supabase.from("workout_plans").delete().eq("id", id); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_plans"] });
      toast.success("Plan deleted");
      setDeletePlanTarget(null);
    },
  });

  const sharePlanMutation = useMutation({
    mutationFn: async (plan) => {
      await supabase.from("workout_plans").update({ is_public: true }).eq("id", plan.id);
      const { error } = await supabase.from("posts").insert({
        post_type: "workout_plan",
        plan_data: { name: plan.name, description: plan.description, days: plan.days },
        content: plan.name + (plan.description ? " — " + plan.description : ""),
        user_id: user.id,
        author_name: user.full_name || user.email,
        author_image: user.profile_image || "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["community_plans"] });
      toast.success("Plan shared to your tribe!");
    },
    onError: () => toast.error("Failed to share plan"),
  });

  const TABS = [
    { id: "log", Icon: Dumbbell, label: "Log" },
    { id: "plans", Icon: BookOpen, label: "Plans" },
    { id: "progress", Icon: TrendingUp, label: "Progress" },
  ];

  if (activeWorkout)
    return (
      <ActiveWorkout
        plan={activeWorkout.plan}
        day={activeWorkout.day}
        onFinish={() => {
          setActiveWorkout(null);
          setTab("log");
          queryClient.invalidateQueries({ queryKey: ["workouts"] });
        }}
        onCancel={() => setActiveWorkout(null)}
      />
    );

  return (
    <div className="max-w-lg mx-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display text-xl font-bold tracking-tight">Workouts</h1>
          {tab === "log" ? (
            <Button
              size="sm"
              onClick={() => { setEditWorkout(null); setFormOpen(true); }}
              className="rounded-full font-heading"
            >
              <Plus className="h-4 w-4 mr-1" />Log
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => { setEditPlan(null); setPlanEditorOpen(true); }}
              className="rounded-full font-heading"
            >
              <Plus className="h-4 w-4 mr-1" />New Plan
            </Button>
          )}
        </div>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {TABS.map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-heading font-medium transition-colors",
                tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* ── MY WORKOUTS TAB ── */}
        {tab === "log" && (
          workoutsLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : workouts.length === 0 ? (
            <div className="text-center py-20">
              <div className="h-20 w-20 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4">
                <Dumbbell className="h-10 w-10 text-primary/50" />
              </div>
              <h3 className="font-heading font-semibold text-lg">No workouts yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Hit the gym and log your first session</p>
              <Button className="mt-4 font-heading rounded-full" onClick={() => setTab("plans")}>
                <BookOpen className="h-4 w-4 mr-2" />Browse Plans
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {workouts.map((w) => (
                <WorkoutCard
                  key={w.id}
                  workout={w}
                  onEdit={(w) => { setEditWorkout(w); setFormOpen(true); }}
                  onDelete={(w) => setDeleteTarget(w)}
                />
              ))}
            </div>
          )
        )}

        {/* ── PLANS TAB ── */}
        {tab === "plans" && (
          <div className="space-y-5">
            {/* My Plans */}
            <div className="space-y-3">
              <SectionHeader title="My Plans" />
              {plansLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : myPlans.length === 0 ? (
                <div className="text-center py-8 bg-card rounded-2xl border border-border border-dashed">
                  <p className="text-sm text-muted-foreground">No custom plans yet</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 font-heading"
                    onClick={() => { setEditPlan(null); setPlanEditorOpen(true); }}
                  >
                    <Plus className="h-4 w-4 mr-1" />Create your first plan
                  </Button>
                </div>
              ) : (
                myPlans.map((plan) => (
                  <div key={plan.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                    {/* Plan header row */}
                    <div className="p-4 flex items-start justify-between gap-3">
                      <button className="flex-1 min-w-0 text-left" onClick={() => setExpandedPlanId(expandedPlanId === plan.id ? null : plan.id)}>
                        <h3 className="font-heading font-bold text-sm truncate">{plan.name}</h3>
                        {plan.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{plan.description}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {plan.days?.length || 0} days · {plan.days?.reduce((a, d) => a + (d.exercises?.length || 0), 0)} exercises
                          {plan.is_public && <span className="ml-2 text-primary font-medium">· Shared</span>}
                        </p>
                      </button>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!plan.is_public && (
                          <button onClick={() => sharePlanMutation.mutate(plan)} disabled={sharePlanMutation.isPending} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
                            <Share2 className="h-4 w-4" />
                          </button>
                        )}
                        <button onClick={() => { setEditPlan(plan); setPlanEditorOpen(true); }} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeletePlanTarget(plan)} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button onClick={() => setExpandedPlanId(expandedPlanId === plan.id ? null : plan.id)} className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground">
                          {expandedPlanId === plan.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    {/* Expanded days */}
                    {expandedPlanId === plan.id && plan.days?.length > 0 && (
                      <div className="border-t border-border divide-y divide-border">
                        {plan.days.map((day, di) => (
                          <div key={di} className="flex items-center justify-between px-4 py-3 gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="font-heading font-semibold text-sm">{day.day}</p>
                              <p className="text-xs text-muted-foreground">{day.focus} · {day.exercises?.length || 0} exercises</p>
                            </div>
                            <Button size="sm" className="rounded-full font-heading text-xs h-7 flex-shrink-0" onClick={() => setActiveWorkout({ day, plan })}>
                              <Play className="h-3 w-3 mr-1" />Start
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Templates */}
            <div className="space-y-3">
              <SectionHeader title="Templates" />
              <BodybuildingPlan onStartWorkout={(day, plan) => setActiveWorkout({ day, plan })} />
            </div>

            {/* Community */}
            <div className="space-y-3">
              <SectionHeader title="Community" />
              {communityPosts.length === 0 ? (
                <div className="text-center py-6 bg-card rounded-2xl border border-border">
                  <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No community plans yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Share your plan to be the first</p>
                </div>
              ) : (
                communityPosts.map((post) => (
                  <WorkoutPlanCard key={post.id} post={post} />
                ))
              )}
            </div>
          </div>
        )}

        {/* ── PROGRESS TAB ── */}
        {tab === "progress" && (() => {
          const totalWorkouts = workouts.length;
          const totalVolume = workouts.reduce((sum, w) =>
            sum + (w.exercises?.reduce((s, e) => s + (Number(e.sets)||0)*(Number(e.reps)||0)*(Number(e.weight_lbs)||0), 0) || 0), 0);
          const totalDuration = workouts.reduce((s, w) => s + (w.duration_minutes || 0), 0);

          // Weekly frequency: last 8 weeks with real date labels
          const now = new Date();
          const weeks = Array.from({ length: 8 }, (_, i) => {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - (7 * (7 - i)) - now.getDay());
            const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);
            const label = `${weekStart.getMonth()+1}/${weekStart.getDate()}`;
            const count = workouts.filter(w => { const d = new Date(w.date); return d >= weekStart && d < weekEnd; }).length;
            return { label, count };
          });

          // Avg workouts per week (over weeks that have data)
          const weeksWithData = weeks.filter(w => w.count > 0).length || 1;
          const avgPerWeek = (totalWorkouts / Math.max(weeksWithData, 1)).toFixed(1);

          // Streak
          const sortedDates = [...new Set(workouts.map(w => w.date))].sort((a, b) => b.localeCompare(a));
          let streak = 0;
          let check = new Date().toISOString().split("T")[0];
          for (const d of sortedDates) {
            if (d === check || d === new Date(new Date(check) - 86400000).toISOString().split("T")[0]) {
              streak++; check = new Date(new Date(d) - 86400000).toISOString().split("T")[0];
            } else break;
          }

          // Per-exercise stats: volume + PR (max weight) + estimated 1RM (Epley: w*(1+r/30))
          const exStats = {};
          workouts.forEach(w => w.exercises?.forEach(e => {
            const vol = (Number(e.sets)||0)*(Number(e.reps)||0)*(Number(e.weight_lbs)||0);
            const w_lbs = Number(e.weight_lbs) || 0;
            const reps = Number(e.reps) || 1;
            const orm = w_lbs > 0 ? Math.round(w_lbs * (1 + reps / 30)) : 0;
            if (!exStats[e.name]) exStats[e.name] = { volume: 0, pr: 0, orm: 0 };
            exStats[e.name].volume += vol;
            if (w_lbs > exStats[e.name].pr) { exStats[e.name].pr = w_lbs; exStats[e.name].orm = orm; }
          }));
          const topEx = Object.entries(exStats).sort((a, b) => b[1].volume - a[1].volume).slice(0, 5);

          // PRs with 1RM for top exercises
          const prs = Object.entries(exStats)
            .filter(([, s]) => s.pr > 0)
            .sort((a, b) => b[1].orm - a[1].orm)
            .slice(0, 5);

          if (workoutsLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
          if (totalWorkouts === 0) return (
            <div className="text-center py-20">
              <BarChart2 className="h-12 w-12 text-primary/30 mx-auto mb-3" />
              <h3 className="font-heading font-semibold">No data yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Log some workouts to see your progress</p>
            </div>
          );

          return (
            <div className="space-y-4">
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Total Workouts", value: totalWorkouts, icon: Dumbbell, color: "text-primary" },
                  { label: "Current Streak", value: `${streak} days`, icon: Flame, color: "text-orange-400" },
                  { label: "Hours Trained", value: `${Math.round(totalDuration / 60)}h`, icon: Trophy, color: "text-yellow-400" },
                  { label: "Avg / Week", value: avgPerWeek + "x", icon: TrendingUp, color: "text-cyan-400" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="bg-card rounded-2xl border border-border p-3 flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center bg-secondary flex-shrink-0`}>
                      <Icon className={`h-4.5 w-4.5 ${color}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-base leading-tight">{value}</p>
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Weekly frequency chart */}
              <div className="bg-card rounded-2xl border border-border p-4">
                <p className="font-heading font-semibold text-sm mb-3">Workouts per Week</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={weeks} barSize={18}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis hide allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} cursor={false} formatter={(v) => [v, "workouts"]} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {weeks.map((entry, i) => <Cell key={i} fill={entry.count > 0 ? "hsl(var(--primary))" : "hsl(var(--secondary))"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Personal Records */}
              {prs.length > 0 && (
                <div className="bg-card rounded-2xl border border-border p-4">
                  <p className="font-heading font-semibold text-sm mb-3">Personal Records</p>
                  <div className="space-y-2">
                    {prs.map(([name, s]) => (
                      <div key={name} className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium truncate flex-1">{name}</p>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Best set</p>
                            <p className="text-sm font-heading font-bold text-primary">{s.pr} lbs</p>
                          </div>
                          {s.orm > s.pr && (
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Est. 1RM</p>
                              <p className="text-sm font-heading font-bold text-cyan-400">{s.orm} lbs</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total volume + top exercises */}
              {totalVolume > 0 && (
                <div className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between">
                  <div>
                    <p className="font-heading font-semibold text-sm">Total Volume Lifted</p>
                    <p className="text-xs text-muted-foreground mt-0.5">All time · sets × reps × weight</p>
                  </div>
                  <p className="font-heading font-bold text-xl text-primary">{(totalVolume / 1000).toFixed(1)}k lbs</p>
                </div>
              )}

              {topEx.length > 0 && (
                <div className="bg-card rounded-2xl border border-border p-4">
                  <p className="font-heading font-semibold text-sm mb-3">Most Trained Exercises</p>
                  <div className="space-y-2">
                    {topEx.map(([name, s], i) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${(s.volume / topEx[0][1].volume) * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{s.volume >= 1000 ? (s.volume/1000).toFixed(1)+"k" : s.volume} lbs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Dialogs */}
      <WorkoutFormDialog open={formOpen} onOpenChange={setFormOpen} editWorkout={editWorkout} />

      <PlanEditor
        open={planEditorOpen}
        onClose={() => { setPlanEditorOpen(false); setEditPlan(null); }}
        editPlan={editPlan}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Delete workout?</AlertDialogTitle>
            <AlertDialogDescription>This action can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWorkoutMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletePlanTarget} onOpenChange={() => setDeletePlanTarget(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Delete plan?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePlanMutation.mutate(deletePlanTarget.id)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
