import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock, RefreshCw, Plus, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

async function fetchPlan({ goals, todayMeals, user }) {
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0];

  const { data: recentMeals } = await supabase
    .from("meals").select("name").eq("user_id", user.id)
    .gte("date", sevenDaysAgo).limit(60);

  const nameCounts = {};
  (recentMeals || []).forEach(m => { nameCounts[m.name] = (nameCounts[m.name] || 0) + 1; });
  const frequent_foods = Object.entries(nameCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name]) => name);

  const goalType = user.calorie_goal <= 1800 ? "lose_fat"
    : user.calorie_goal >= 2800 ? "build_muscle" : "maintain";

  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-meal-plan`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        goals,
        today_intake: {
          calories: todayMeals.reduce((s, m) => s + (m.calories || 0), 0),
          meals_count: todayMeals.length,
        },
        frequent_foods,
        interests: user.fitness_interests ?? [],
        goal_type: goalType,
        name: user.full_name?.split(" ")[0],
      }),
    }
  );
  if (!res.ok) throw new Error("Failed to generate plan");
  return res.json();
}

function MealCard({ meal, onLog }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-secondary rounded-2xl border border-border overflow-hidden">
      <div className="p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-heading font-bold text-primary uppercase tracking-wider">{meal.meal_type}</span>
          </div>
          <p className="font-heading font-semibold text-sm">{meal.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-semibold text-primary">{meal.calories} kcal</span>
            <span className="text-[11px] text-muted-foreground">{meal.protein_g}g P · {meal.carbs_g}g C · {meal.fat_g}g F</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onLog}
            className="h-7 w-7 rounded-xl bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setExpanded(e => !e)}
            className="h-7 w-7 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          <div className="flex flex-wrap gap-1">
            {meal.ingredients.map((ing, i) => (
              <span key={i} className="text-[11px] bg-background px-2 py-0.5 rounded-full text-muted-foreground border border-border">{ing}</span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{meal.prep}</p>
        </div>
      )}
    </div>
  );
}

export default function MealPlan({ goals, todayMeals }) {
  const { user, isPremium } = useAuth();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["meal-plan", user?.id],
    queryFn: () => fetchPlan({ goals, todayMeals, user }),
    enabled: !!user && isPremium && enabled,
    staleTime: 6 * 60 * 60 * 1000, // 6hr cache
    retry: 1,
  });

  const regenerate = () => {
    queryClient.removeQueries({ queryKey: ["meal-plan", user?.id] });
    setEnabled(true);
  };

  const logMeal = async (meal) => {
    const tomorrow = new Date(Date.now() + 864e5).toISOString().split("T")[0];
    const { error } = await supabase.from("meals").insert({
      user_id: user.id,
      name: meal.name,
      calories: meal.calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      date: tomorrow,
      serving_size: "1 serving",
    });
    if (error) toast.error("Failed to log meal");
    else toast.success(`${meal.name} logged for tomorrow`);
  };

  if (!isPremium) {
    return (
      <div className="m-4 bg-card rounded-2xl border border-border p-5 flex flex-col items-center text-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="font-heading font-bold text-sm">AI Meal Planning</p>
          <p className="text-xs text-muted-foreground mt-1">Get a personalized daily meal plan built around your exact macro targets</p>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-heading font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-full">
          <Lock className="h-3 w-3" />Tribe Pro Feature
        </div>
      </div>
    );
  }

  if (!enabled && !data) {
    return (
      <div className="m-4 bg-card rounded-2xl border border-border p-5 flex flex-col items-center text-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="font-heading font-bold text-sm">Tomorrow's Meal Plan</p>
          <p className="text-xs text-muted-foreground mt-1">AI builds a full day of meals matching your {goals.calories} kcal target</p>
        </div>
        <Button onClick={() => setEnabled(true)} className="rounded-full font-heading font-semibold" size="sm">
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Plan
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="m-4 bg-card rounded-2xl border border-border p-5 flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-heading">Building your meal plan…</p>
        <div className="w-full space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-16 bg-secondary rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error || !data?.meals) {
    return (
      <div className="m-4 bg-card rounded-2xl border border-border p-4 text-center">
        <p className="text-sm text-muted-foreground">Couldn't generate plan. <button onClick={regenerate} className="text-primary underline">Try again</button></p>
      </div>
    );
  }

  const t = data.total ?? {};

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-heading font-bold text-sm">Tomorrow's Plan</p>
          <p className="text-[11px] text-muted-foreground">{t.calories} kcal · {t.protein_g}g P · {t.carbs_g}g C · {t.fat_g}g F</p>
        </div>
        <button onClick={regenerate}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />Regenerate
        </button>
      </div>
      {data.meals.map((meal, i) => (
        <MealCard key={i} meal={meal} onLog={() => logMeal(meal)} />
      ))}
      <p className="text-[10px] text-muted-foreground text-center pt-1">Tap + to log any meal for tomorrow</p>
    </div>
  );
}
