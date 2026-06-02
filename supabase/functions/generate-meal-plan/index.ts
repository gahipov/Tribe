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

    const { goals, today_intake, frequent_foods, interests, goal_type, name } = await req.json();

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return new Response(JSON.stringify({ error: "OpenAI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const goalLabel: Record<string, string> = {
      lose_fat: "fat loss",
      build_muscle: "muscle gain",
      maintain: "maintenance",
      performance: "athletic performance",
    };

    const frequentList = frequent_foods?.length
      ? `Foods they commonly eat: ${frequent_foods.join(", ")}`
      : "No meal history yet — use common whole foods";

    const prompt = `You are a fitness nutrition coach. Create a realistic, practical meal plan for tomorrow for ${name || "this athlete"}.

GOAL: ${goalLabel[goal_type] ?? "general fitness"}
DAILY TARGETS: ${goals.calories} kcal | ${goals.protein}g protein | ${goals.carbs}g carbs | ${goals.fat}g fat
FITNESS INTERESTS: ${interests?.join(", ") || "general fitness"}
${frequentList}
TODAY'S INTAKE PATTERN: ${today_intake.meals_count} meals logged, avg ${Math.round(today_intake.calories / Math.max(1, today_intake.meals_count))} kcal/meal

RULES:
- Create exactly 4-5 meals (breakfast, lunch, dinner + 1-2 snacks)
- Total macros must hit within 5% of the daily targets
- Use realistic, accessible whole foods — no exotic ingredients
- Keep ingredient lists short (3-5 items max)
- Prep instructions max 1 sentence
- Vary meals — don't repeat the same protein source twice
- Match the athlete's fitness style (${interests?.[0] ?? "general"} athlete eats differently than a yogi)
- Return ONLY valid JSON in this exact format:
{
  "meals": [
    {
      "meal_type": "Breakfast",
      "name": "meal name",
      "ingredients": ["ingredient 1", "ingredient 2", "ingredient 3"],
      "prep": "one sentence prep instruction",
      "calories": 500,
      "protein_g": 35,
      "carbs_g": 45,
      "fat_g": 15
    }
  ],
  "total": { "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 }
}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 800,
        temperature: 0.7,
        messages: [
          { role: "system", content: "Return only valid JSON. No markdown. No extra text." },
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
