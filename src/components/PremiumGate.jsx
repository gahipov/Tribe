import { Sparkles, X, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PRICE_ID = import.meta.env.VITE_PADDLE_PRICE_ID;

// Inline upgrade modal
function UpgradeModal({ open, onClose, feature }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    if (!PRICE_ID) {
      toast.error("Paddle price not configured — add VITE_PADDLE_PRICE_ID to .env");
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-paddle-checkout`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            price_id: PRICE_ID,
            success_url: window.location.origin + "/?upgraded=1",
            cancel_url: window.location.href,
          }),
        }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // redirect to Stripe Checkout
      } else {
        throw new Error(data.error || "Failed to create checkout session");
      }
    } catch (err) {
      toast.error("Checkout error: " + err.message);
      setLoading(false);
    }
  };

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/70" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[71] bg-card rounded-3xl border border-primary/30 p-6 max-w-sm mx-auto shadow-2xl shadow-primary/10">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground"><X className="h-4 w-4" /></button>
        <div className="flex flex-col items-center text-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Tribe Pro</h2>
            <p className="text-sm text-muted-foreground mt-1">Unlock {feature} and all premium features</p>
          </div>
          <div className="w-full space-y-2 text-left">
            {["AI Photo Meal Logging","Custom Macro Goals","Body Measurements & Trends","Advanced Workout Analytics","Unlimited Custom Plans","Priority in Tribe Discovery"].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span className={f === feature ? "text-primary font-medium" : "text-foreground"}>{f}</span>
              </div>
            ))}
          </div>
          <div className="w-full">
            <button onClick={handleUpgrade} disabled={loading}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-heading font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Redirecting to Stripe…</> : "Upgrade to Pro — $8/mo"}
            </button>
            <p className="text-[11px] text-muted-foreground mt-2">Cancel anytime · 7-day free trial</p>
          </div>
        </div>
      </div>
    </>
  );
}

// Wrap any locked section
export default function PremiumGate({ children, feature = "this feature", locked }) {
  const [showModal, setShowModal] = useState(false);
  if (!locked) return children;
  return (
    <>
      <div className="relative">
        <div className="opacity-40 pointer-events-none select-none">{children}</div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-background/60 backdrop-blur-sm">
          <Sparkles className="h-6 w-6 text-primary" />
          <p className="font-heading font-semibold text-sm">Pro Feature</p>
          <button onClick={() => setShowModal(true)}
            className="text-xs px-4 py-1.5 rounded-full bg-primary text-primary-foreground font-heading font-medium">
            Unlock with Tribe Pro
          </button>
        </div>
      </div>
      <UpgradeModal open={showModal} onClose={() => setShowModal(false)} feature={feature} />
    </>
  );
}

export function ProBadge({ className }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-heading font-bold px-1.5 py-0.5 rounded-full bg-primary/20 text-primary", className)}>
      <Sparkles className="h-2.5 w-2.5" />PRO
    </span>
  );
}

export function useUpgradeModal(feature) {
  const [open, setOpen] = useState(false);
  const Modal = () => <UpgradeModal open={open} onClose={() => setOpen(false)} feature={feature} />;
  return { openUpgrade: () => setOpen(true), UpgradeModal: Modal };
}
