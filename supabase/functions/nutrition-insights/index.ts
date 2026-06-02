import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { goals, today, goal_type, name, interests, weight_kg, today_meals, recent_workouts, week_avg } = await req.json();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return new Response(JSON.stringify({ error: "OpenAI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const hour = new Date().getUTCHours();
    const timeOfDay = hour < 11 ? "morning" : hour < 15 ? "midday" : hour < 19 ? "afternoon" : "evening";

    const goalLabel: Record<string, string> = {
      lose_fat: "fat loss",
      build_muscle: "muscle gain",
      maintain: "maintenance",
      performance: "athletic performance",
    };

    // Build meal summary
    const mealsSummary = today_meals?.length
      ? today_meals.map((m: any) => `  - ${m.name}: ${m.cal} kcal, ${m.p}g P, ${m.c}g C, ${m.f}g F`).join("\n")
      : "  - Nothing logged yet";

    // Build workout context
    const todayDate = new Date().toISOString().split("T")[0];
    const yesterdayDate = new Date(Date.now() - 864e5).toISOString().split("T")[0];
    const trainedToday = recent_workouts?.find((w: any) => w.date === todayDate);
    const trainedYesterday = recent_workouts?.find((w: any) => w.date === yesterdayDate);
    const workoutCtx = trainedToday
      ? `Trained TODAY: ${trainedToday.name}`
      : trainedYesterday
      ? `Trained YESTERDAY: ${trainedYesterday.name} (recovery day today)`
      : recent_workouts?.length
      ? `Last workout: ${recent_workouts[0].name} on ${recent_workouts[0].date}`
      : "No recent workouts logged";

    // 7-day trend analysis
    const trendLines: string[] = [];
    if (week_avg) {
      if (week_avg.protein < goals.protein * 0.85) trendLines.push(`consistently under protein target (avg ${week_avg.protein}g vs ${goals.protein}g goal)`);
      if (week_avg.calories < goals.calories * 0.8) trendLines.push(`consistently under calories (avg ${week_avg.calories} kcal)`);
      if (week_avg.calories > goals.calories * 1.15) trendLines.push(`consistently over calories (avg ${week_avg.calories} kcal)`);
      if (week_avg.fat > goals.fat * 1.2) trendLines.push(`high fat intake trend (avg ${week_avg.fat}g)`);
    }
    const trendCtx = trendLines.length ? trendLines.join("; ") : "intake on track this week";

    const prompt = `You are a precise, no-fluff fitness nutrition coach. Give ${name || "this athlete"} exactly 1 highly specific, actionable insight for right now (${timeOfDay}). Pick the single most important thing based on their data.

ATHLETE PROFILE:
- Goal: ${goalLabel[goal_type] ?? "general fitness"}
- Interests: ${interests?.join(", ") || "general fitness"}
${weight_kg ? `- Body weight: ${weight_kg} kg` : ""}
- Daily targets: ${goals.calories} kcal | ${goals.protein}g protein | ${goals.carbs}g carbs | ${goals.fat}g fat

TODAY'S MEALS SO FAR:
${mealsSummary}

TODAY'S TOTALS: ${today.calories} kcal | ${today.protein}g P | ${today.carbs}g C | ${today.fat}g F
REMAINING: ${goals.calories - today.calories} kcal | ${Math.max(0, goals.protein - today.protein)}g protein

WORKOUT CONTEXT: ${workoutCtx}
7-DAY TREND: ${trendCtx}

RULES:
- Reference their ACTUAL meals by name when relevant (e.g. "after your chicken wrap, you still need...")
- Reference their workout if they trained today/yesterday (e.g. "post-leg day — prioritize...")
- Call out the 7-day trend if it's a problem (e.g. "You've been under protein all week...")
- Suggest specific foods with amounts (e.g. "200g Greek yogurt adds 20g protein")
- Each tip max 20 words, brutally specific
- Do NOT give generic advice like "drink more water" or "eat more vegetables"
- Return ONLY valid JSON: {"tips": ["tip1"]}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        temperature: 0.6,
        messages: [
          { role: "system", content: "Return only valid JSON. No markdown. No explanation." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content?.trim() ?? "";
    const clean = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(clean);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
