import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, UtensilsCrossed, TrendingUp, Calendar } from "lucide-react";
import MealCard from "../components/MealCard";
import MealFormDialog from "../components/MealFormDialog";
import FoodLookupDialog from "../components/FoodLookupDialog";
import NutritionHistory from "../components/NutritionHistory";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export default function Nutrition() {
  const [tab, setTab] = useState("today");
  const [formOpen, setFormOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [editMeal, setEditMeal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: meals = [], isLoading } = useQuery({
    queryKey: ["meals"],
    queryFn: async () => {
      const { data } = await supabase.from('meals').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(200);
      return data || [];
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => { await supabase.from('meals').delete().eq('id', id); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["meals"] }); toast.success("Meal deleted"); setDeleteTarget(null); },
  });

  const today = new Date().toISOString().split("T")[0];
  const todayMeals = meals.filter(m => m.date === today);
  const totalCals = todayMeals.reduce((s,m) => s+(m.calories||0), 0);
  const totalP = todayMeals.reduce((s,m) => s+(m.protein_g||0), 0);
  const totalC = todayMeals.reduce((s,m) => s+(m.carbs_g||0), 0);
  const totalF = todayMeals.reduce((s,m) => s+(m.fat_g||0), 0);
  const macroData = [{ name: "Protein", value: totalP, color: "hsl(175,85%,50%)" }, { name: "Carbs", value: totalC, color: "hsl(35,90%,60%)" }, { name: "Fat", value: totalF, color: "hsl(330,70%,55%)" }].filter(d => d.value > 0);
  const TABS = [{ id: "today", label: "Today", icon: Calendar }, { id: "history", label: "Trends", icon: TrendingUp }];

  // Goals from profile
  const calGoal = user?.calorie_goal || 2000;
  const pGoal = user?.protein_goal || 150;
  const cGoal = user?.carbs_goal || 200;
  const fGoal = user?.fat_goal || 65;
  const calPct = Math.min(100, Math.round((totalCals / calGoal) * 100));

  function MacroRing({ value, goal, color, label }) {
    const pct = Math.min(100, Math.round((value / goal) * 100));
    const r = 20, circ = 2 * Math.PI * r;
    const over = value > goal;
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="relative h-14 w-14">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="4"/>
            <circle cx="24" cy="24" r={r} fill="none" stroke={over ? "#ef4444" : color} strokeWidth="4"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
              strokeLinecap="round" className="transition-all duration-700"/>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] font-heading font-bold" style={{ color: over ? "#ef4444" : color }}>{pct}%</span>
          </div>
        </div>
        <p className="text-xs font-heading font-semibold">{value}g</p>
        <p className="text-[10px] text-muted-foreground">{label} / {goal}g</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h1 className="font-display text-xl font-bold tracking-tight">Nutrition</h1>
          <Button size="sm" onClick={() => setLookupOpen(true)} className="rounded-full font-heading"><Plus className="h-4 w-4 mr-1" /> Log</Button>
        </div>
        <div className="flex gap-1 bg-secondary rounded-xl p-1">
          {TABS.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={"flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-heading font-medium transition-colors " + (tab===id ? "bg-primary text-primary-foreground" : "text-muted-foreground")}><Icon className="h-3.5 w-3.5" />{label}</button>)}
        </div>
      </div>
      {tab === "today" && (<>
        <div className="mx-4 mt-4 bg-card rounded-2xl border border-border p-4">
          {/* Calorie bar */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider">Calories</span>
            <span className="text-xs text-muted-foreground">{totalCals} / {calGoal} kcal</span>
          </div>
          <div className="h-3 bg-secondary rounded-full overflow-hidden mb-4">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${calPct}%`, background: calPct >= 100 ? "#ef4444" : "hsl(var(--primary))" }} />
          </div>
          {/* Macro rings */}
          <div className="flex items-center justify-around">
            <MacroRing value={Math.round(totalP)} goal={pGoal} color="hsl(175,85%,50%)" label="Protein" />
            <MacroRing value={Math.round(totalC)} goal={cGoal} color="hsl(35,90%,60%)" label="Carbs" />
            <MacroRing value={Math.round(totalF)} goal={fGoal} color="hsl(330,70%,55%)" label="Fat" />
            {/* Remaining */}
            <div className="flex flex-col items-center gap-1">
              <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center border-4 border-background">
                <span className={`text-sm font-heading font-bold ${calGoal - totalCals < 0 ? "text-red-400" : "text-primary"}`}>
                  {calGoal - totalCals < 0 ? "+" : ""}{Math.abs(calGoal - totalCals)}
                </span>
              </div>
              <p className="text-xs font-heading font-semibold">{calGoal - totalCals < 0 ? "over" : "left"}</p>
              <p className="text-[10px] text-muted-foreground">kcal</p>
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>
          : todayMeals.length===0 ? <div className="text-center py-20"><div className="h-20 w-20 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4"><UtensilsCrossed className="h-10 w-10 text-primary/50"/></div><h3 className="font-heading font-semibold text-lg">Nothing logged today</h3><p className="text-sm text-muted-foreground mt-1">Start tracking your meals</p><Button onClick={() => setLookupOpen(true)} className="mt-4 rounded-full font-heading" size="sm"><Plus className="h-4 w-4 mr-1"/>Add First Meal</Button></div>
          : todayMeals.map(m => <MealCard key={m.id} meal={m} onEdit={m => { setEditMeal(m); setFormOpen(true); }} onDelete={setDeleteTarget}/>)}
        </div>
      </>)}
      {tab === "history" && <div className="p-4">{meals.length===0 ? <div className="text-center py-20"><TrendingUp className="h-10 w-10 text-primary/50 mx-auto mb-3"/><p className="text-sm text-muted-foreground">Log meals to see your trends</p></div> : <NutritionHistory meals={meals}/>}</div>}
      <FoodLookupDialog open={lookupOpen} onClose={() => setLookupOpen(false)} onSelect={food => { setPrefill(food); setEditMeal(null); setFormOpen(true); }}/>
      <MealFormDialog open={formOpen} onOpenChange={v => { setFormOpen(v); if(!v) setPrefill(null); }} editMeal={editMeal} prefill={prefill}/>
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="bg-card border-border"><AlertDialogHeader><AlertDialogTitle className="font-heading">Delete meal?</AlertDialogTitle><AlertDialogDescription>This action can't be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => deleteMutation.mutate(deleteTarget.id)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
