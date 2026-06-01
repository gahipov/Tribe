import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Verify Paddle webhook signature
async function verifyPaddleSignature(body: string, signatureHeader: string, secret: string): Promise<boolean> {
  try {
    // Paddle-Signature: ts=1234567890;h1=abc123...
    const parts: Record<string, string> = {};
    signatureHeader.split(";").forEach(p => {
      const [k, v] = p.split("=");
      parts[k] = v;
    });
    const { ts, h1 } = parts;
    if (!ts || !h1) return false;

    const signedPayload = `${ts}:${body}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    return computed === h1;
  } catch {
    return false;
  }
}

serve(async (req) => {
  const body = await req.text();
  const signatureHeader = req.headers.get("Paddle-Signature");

  if (!signatureHeader) {
    return new Response("Missing Paddle-Signature", { status: 400 });
  }

  const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")!;
  const valid = await verifyPaddleSignature(body, signatureHeader, webhookSecret);

  if (!valid) {
    console.error("Invalid Paddle webhook signature");
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(body);
  console.log("Paddle event:", event.event_type);

  // Use service role key — bypasses RLS for server-side writes
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const eventType: string = event.event_type;
  const data = event.data;

  // ── Payment completed → grant Pro ──
  if (eventType === "transaction.completed") {
    const userId = data?.custom_data?.user_id;
    if (userId) {
      const { error } = await supabase
        .from("profiles")
        .update({ is_premium: true })
        .eq("id", userId);
      if (error) console.error("Grant pro failed:", error.message);
      else console.log("Pro granted:", userId);
    }
  }

  // ── Subscription cancelled → revoke Pro ──
  if (eventType === "subscription.canceled") {
    const userId = data?.custom_data?.user_id;
    if (userId) {
      const { error } = await supabase
        .from("profiles")
        .update({ is_premium: false })
        .eq("id", userId);
      if (error) console.error("Revoke pro failed:", error.message);
      else console.log("Pro revoked:", userId);
    }
  }

  // ── Payment failed → revoke Pro ──
  if (eventType === "subscription.payment_failed") {
    const userId = data?.custom_data?.user_id;
    if (userId) {
      await supabase.from("profiles").update({ is_premium: false }).eq("id", userId);
      console.log("Pro revoked (payment failed):", userId);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
