import { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import { Button } from "@/components/ui/button";

const TOUR_KEY = "tribe_tour_done";

const STOPS = [
  { target: "feed",        title: "Welcome to Tribe 👋",    desc: "Your tribe's posts, workouts, and wins appear here." },
  { target: "create-post", title: "Share your progress",    desc: "Post photos, videos, and updates with your tribe." },
  { target: "nutrition",   title: "Track your nutrition",   desc: "Log meals, scan barcodes, and hit your macro goals." },
  { target: "workouts",    title: "Log your workouts",      desc: "Build plans, track sets, and watch your strength grow." },
  { target: "profile",     title: "Your profile",           desc: "View your stats, goals, and premium features." },
];

function getRect(target) {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function buildClipPath(rect, padding = 10) {
  if (!rect) return "none";
  const { left, top, width, height } = rect;
  const x = left - padding;
  const y = top - padding;
  const w = width + padding * 2;
  const h = height + padding * 2;
  const r = 12;
  return `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${x + r}px ${y}px, ${x}px ${y + r}px, ${x}px ${y + h - r}px, ${x + r}px ${y + h}px, ${x + w - r}px ${y + h}px, ${x + w}px ${y + h - r}px, ${x + w}px ${y + r}px, ${x + w - r}px ${y}px, ${x + r}px ${y}px)`;
}

export default function TourOverlay({ onDone }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  const stop = STOPS[step];

  const updateRect = useCallback(() => {
    setRect(getRect(stop.target));
  }, [stop.target]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [updateRect]);

  const finish = () => {
    localStorage.setItem(TOUR_KEY, "1");
    onDone();
  };

  const next = () => {
    if (step < STOPS.length - 1) setStep(step + 1);
    else finish();
  };

  const overlay = (
    <div className="fixed inset-0 animate-in fade-in duration-300" style={{ zIndex: 9999 }}>
      {/* Dark overlay with spotlight cutout */}
      <div
        className="absolute inset-0 transition-[clip-path] duration-300"
        style={{
          background: "rgba(0,0,0,0.78)",
          clipPath: buildClipPath(rect),
        }}
      />
      {/* Tooltip always centered */}
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl p-4 space-y-2"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(280px, calc(100vw - 24px))",
          zIndex: 10000,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-heading font-bold text-sm text-foreground">{stop.title}</p>
          <span className="text-xs text-muted-foreground flex-shrink-0">{step + 1} of {STOPS.length}</span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{stop.desc}</p>
        <div className="flex gap-2 pt-1">
          {step === 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={finish}>
              Skip
            </Button>
          )}
          <Button size="sm" className="text-xs h-7 ml-auto font-heading" onClick={next}>
            {step < STOPS.length - 1 ? "Next" : "Done"}
          </Button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(overlay, document.body);
}
