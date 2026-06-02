import { Sparkles, X, Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const CLIENT_TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
const PRICE_ID = import.meta.env.VITE_PADDLE_PRICE_ID;
const PADDLE_ENV = import.meta.env.VITE_PADDLE_ENV;

// Ref to call after checkout.completed — allows dynamic handler per open()
const onCompleteRef = { current: null };

function initPaddle() {
  const paddle = window.Paddle;
  if (!paddle || !CLIENT_TOKEN || paddle._initialized) return;
  try {
    if (PADDLE_ENV !== "production") paddle.Environment.set("sandbox");
    paddle.Setup({
      token: CLIENT_TOKEN,
      eventCallback(event) {
        if (event.name === "checkout.completed") {
          onCompleteRef.current?.();
        }
      },
    });
    paddle._initialized = true;
  } catch (e) {
    console.error("Paddle init failed:", e);
  }
}

function usePaddle() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.Paddle) { initPaddle(); setReady(true); return; }
    // Paddle.js loads async — poll briefly
    let tries = 0;
    const t = setInterval(() => {
      if (window.Paddle) { initPaddle(); setReady(true); clearInterval(t); }
      if (++tries > 20) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, []);
  return ready;
}

function UpgradeModal({ open, onClose, feature }) {
  const { user, refreshProfile } = useAuth();
  const paddleReady = usePaddle();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = () => {
    if (!CLIENT_TOKEN || !PRICE_ID) {
      toast.error("Paddle not configured — add VITE_PADDLE_CLIENT_TOKEN and VITE_PADDLE_PRICE_ID to .env");
      return;
    }
    if (!paddleReady || !window.Paddle) {
      toast.error("Paddle failed to load. Check your connection.");
      return;
    }
    setLoading(true);

    // Set what happens after checkout.completed event fires
    onCompleteRef.current = async () => {
      onCompleteRef.current = null;
      onClose();
      toast.success("Welcome to Tribe Pro!");
      // Poll until webhook fires and is_premium flips
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 2000));
        await refreshProfile();
      }
    };

    window.Paddle.Checkout.open({
      items: [{ priceId: PRICE_ID, quantity: 1 }],
      customer: { email: user?.email },
      customData: { user_id: user?.id },
      settings: {
        displayMode: "overlay",
        theme: "dark",
      },
    });

    setLoading(false);
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
            <button onClick={handleUpgrade} disabled={loading || !paddleReady}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-heading font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Opening checkout…</> : "Upgrade to Pro — $8/mo"}
            </button>
            <p className="text-[11px] text-muted-foreground mt-2">Cancel anytime · 7-day free trial</p>
          </div>
        </div>
      </div>
    </>
  );
}

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
