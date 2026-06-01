import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 1. Verify auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: supabaseAnonKey },
    });
    const userData = await userRes.json();
    if (!userRes.ok || !userData.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Create Paddle transaction (Billing API) ──
    const { price_id, success_url } = await req.json();

    const paddleKey = Deno.env.get("PADDLE_API_KEY")!;
    // Use sandbox URL during testing, live URL for production
    const paddleBase = Deno.env.get("PADDLE_ENV") === "production"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";

    const paddleRes = await fetch(`${paddleBase}/transactions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${paddleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ price_id, quantity: 1 }],
        checkout: { url: success_url },
        customer: { email: userData.email },
        custom_data: { user_id: userData.id },
      }),
    });

    const paddleData = await paddleRes.json();

    if (!paddleRes.ok) {
      throw new Error(paddleData?.error?.detail || "Paddle API error");
    }

    const checkoutUrl = paddleData?.data?.checkout?.url;
    if (!checkoutUrl) throw new Error("No checkout URL returned from Paddle");

    return new Response(JSON.stringify({ url: checkoutUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
