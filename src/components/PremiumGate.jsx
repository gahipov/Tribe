import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { presentPaywall } from "@/lib/revenueCat";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

function UpgradeModal({ open, onClose, feature }) {
  const { refreshPremium } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const result = await presentPaywall();
      if (result?.webFallback) {
        toast.info("Open the app on your iPhone to subscribe.");
        setLoading(false);
        return;
      }
      // Always refresh premium after paywall closes — covers all result codes
      const nowPremium = await refreshPremium();
      if (result?.result === 'PURCHASED' || result?.result === 'RESTORED' || nowPremium) {
        toast.success("Welcome to Tribe Pro!");
        onClose();
      }
    } catch (e) {
      toast.error("Something went wrong. Try again.");
    } finally {
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
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-heading font-bold text-base disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? "Opening…" : "Upgrade to Tribe Pro"}
            </button>
            <p className="text-[11px] text-muted-foreground mt-2">Cancel anytime · Managed by Apple</p>
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
          <button
            onClick={() => setShowModal(true)}
            className="text-xs px-4 py-1.5 rounded-full bg-primary text-primary-foreground font-heading font-medium"
          >
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
