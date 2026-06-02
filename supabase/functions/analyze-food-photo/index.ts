import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Auth: verify Supabase JWT using the recommended pattern ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pass the auth header directly to the client — Supabase's official pattern
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized: " + (authError?.message ?? "no user") }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Parse body ──
    const { image_base64, media_type, hint } = await req.json();
    if (!image_base64 && !hint) {
      return new Response(JSON.stringify({ error: "Provide an image or a text description" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (image_base64 && image_base64.length > 7_000_000) {
      return new Response(JSON.stringify({ error: "Image too large. Use a photo under 5MB." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Call GPT-4o (with image) or GPT-4o-mini (text only) ──
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured on server" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jsonSchema = `Return ONLY this JSON (no markdown, no extra text):
{
  "name": "specific food name",
  "serving_size": "estimated total portion e.g. 250g",
  "calories": <total kcal as number>,
  "protein_g": <grams as number>,
  "carbs_g": <grams as number>,
  "fat_g": <grams as number>,
  "confidence": "high" or "medium" or "low",
  "notes": "brief note if relevant"
}`;

    // Build message content — photo + text, photo only, or text only
    let userContent: any;
    if (image_base64 && media_type) {
      userContent = [
        { type: "image_url", image_url: { url: `data:${media_type};base64,${image_base64}`, detail: "low" } },
        { type: "text", text: `Analyze the food in this image. Estimate nutritional content for the ENTIRE portion visible.${hint ? `\n\nUser says: "${hint}" — use this to improve accuracy.` : ""}\n\n${jsonSchema}\n\nIf no food visible: {"error": "No food detected in image"}` },
      ];
    } else {
      userContent = `Estimate the nutritional content for: "${hint}".\n\nAssume a standard single serving unless a quantity is specified.\n\n${jsonSchema}`;
    }

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: image_base64 ? "gpt-4o" : "gpt-4o-mini",
        max_tokens: 300,
        messages: [
          { role: "system", content: "You are a precise nutrition analyst. Return valid JSON only — no markdown, no explanation." },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ error: `OpenAI error ${aiRes.status}: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return new Response(JSON.stringify({ error: "Empty response from AI" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clean = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const result = JSON.parse(clean);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
