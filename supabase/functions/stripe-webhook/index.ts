import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      Deno.env.get("STRIPE_WEBHOOK_SECRET")!
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Webhook signature error:", msg);
    return new Response(`Webhook error: ${msg}`, { status: 400 });
  }

  // Use service role key for DB writes — bypasses RLS
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  console.log("Stripe event:", event.type);

  // ── Payment succeeded → grant Pro ──
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id || session.client_reference_id;

    if (userId) {
      const { error } = await supabase
        .from("profiles")
        .update({ is_premium: true })
        .eq("id", userId);

      if (error) console.error("Failed to grant pro:", error.message);
      else console.log("Pro granted to user:", userId);
    }
  }

  // ── Subscription cancelled → revoke Pro ──
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = subscription.metadata?.user_id;

    if (userId) {
      await supabase
        .from("profiles")
        .update({ is_premium: false })
        .eq("id", userId);
      console.log("Pro revoked for user:", userId);
    }
  }

  // ── Payment failed → revoke Pro ──
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    // Get user_id from subscription metadata
    if (invoice.subscription) {
      const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
      const userId = sub.metadata?.user_id;
      if (userId) {
        await supabase
          .from("profiles")
          .update({ is_premium: false })
          .eq("id", userId);
        console.log("Pro revoked (payment failed) for user:", userId);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
