import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Sparkles, Zap, Lock } from "lucide-react";
import { useUpgradeModal } from "@/components/PremiumGate";

async function fetchContext(userId) {
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0];

  const [mealsRes, workoutsRes, measurementsRes] = await Promise.all([
    supabase.from("meals").select("name,calories,protein_g,carbs_g,fat_g,date").eq("user_id", userId).gte("date", sevenDaysAgo).order("date", { ascending: false }).limit(60),
    supabase.from("workouts").select("date,name,notes").eq("user_id", userId).gte("date", sevenDaysAgo).order("date", { ascending: false }).limit(10),
    supabase.from("body_measurements").select("date,weight_kg").eq("user_id", userId).order("date", { ascending: false }).limit(1),
  ]);

  const meals = mealsRes.data || [];
  const workouts = workoutsRes.data || [];
  const weight = measurementsRes.data?.[0]?.weight_kg ?? null;

  const todayMeals = meals.filter(m => m.date === today);
  const pastMeals = meals.filter(m => m.date !== today);

  // 7-day averages
  const dayMap = {};
  pastMeals.forEach(m => {
    if (!dayMap[m.date]) dayMap[m.date] = { cal: 0, p: 0, c: 0, f: 0 };
    dayMap[m.date].cal += m.calories || 0;
    dayMap[m.date].p += m.protein_g || 0;
    dayMap[m.date].c += m.carbs_g || 0;
    dayMap[m.date].f += m.fat_g || 0;
  });
  const days = Object.values(dayMap);
  const avg = days.length ? {
    calories: Math.round(days.reduce((s, d) => s + d.cal, 0) / days.length),
    protein: Math.round(days.reduce((s, d) => s + d.p, 0) / days.length),
    carbs: Math.round(days.reduce((s, d) => s + d.c, 0) / days.length),
    fat: Math.round(days.reduce((s, d) => s + d.f, 0) / days.length),
  } : null;

  return { todayMeals, workouts, weight, avg };
}

export default function NutritionInsights({ today, goals, mealsCount }) {
  const { user, isPremium } = useAuth();
  const { openUpgrade, UpgradeModal } = useUpgradeModal("AI Nutrition Coach");

  const goalType = user?.calorie_goal <= 1800 ? "lose_fat"
    : user?.calorie_goal >= 2800 ? "build_muscle"
    : "maintain";

  const { data, isLoading } = useQuery({
    queryKey: ["nutrition-insights", today.calories, today.protein, mealsCount],
    queryFn: async () => {
      const ctx = await fetchContext(user.id);
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/nutrition-insights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            goals,
            today,
            goal_type: goalType,
            name: user?.full_name?.split(" ")[0],
            interests: user?.fitness_interests ?? [],
            weight_kg: ctx.weight,
            today_meals: ctx.todayMeals.map(m => ({ name: m.name, cal: m.calories, p: Math.round(m.protein_g), c: Math.round(m.carbs_g), f: Math.round(m.fat_g) })),
            recent_workouts: ctx.workouts.map(w => ({ date: w.date, name: w.name })),
            week_avg: ctx.avg,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user && isPremium,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (!isPremium) {
    return (
      <>
        <UpgradeModal />
        <button onClick={openUpgrade} className="mx-4 mt-3 w-[calc(100%-2rem)] bg-card rounded-2xl border border-border p-3 flex items-center gap-3 active:opacity-80 transition-opacity">
          <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-heading font-semibold text-foreground">AI Nutrition Coach</p>
            <p className="text-[11px] text-muted-foreground">Personalized tips based on your goals & history</p>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-heading font-bold text-primary bg-primary/10 px-2 py-1 rounded-full flex-shrink-0">
            <Lock className="h-3 w-3" />PRO
          </div>
        </button>
      </>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-4 mt-3 bg-card rounded-2xl border border-border p-3 flex items-center gap-3">
        <Sparkles className="h-4 w-4 text-primary animate-pulse flex-shrink-0" />
        <div className="h-3 bg-secondary rounded-full animate-pulse flex-1" />
      </div>
    );
  }

  const tips = data?.tips ?? [];
  if (!tips.length) return (
    <div className="mx-4 mt-3 bg-card rounded-2xl border border-border p-3 flex items-center gap-3 opacity-60">
      <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
      <p className="text-xs text-muted-foreground">AI coaching unavailable right now</p>
    </div>
  );

  return (
    <div className="mx-4 mt-3 bg-card rounded-2xl border border-primary/20 p-3 flex items-start gap-3">
      <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Zap className="h-3.5 w-3.5 text-primary" />
      </div>
      <p className="text-xs text-foreground leading-relaxed">{tips[0]}</p>
    </div>
  );
}
