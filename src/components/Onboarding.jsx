import { useState } from "react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dumbbell, UtensilsCrossed, Users, Flame, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GOALS = [
  { id: "lose_fat", label: "Lose Fat", emoji: "🔥", calories: 1700, protein: 160, carbs: 150, fat: 55 },
  { id: "build_muscle", label: "Build Muscle", emoji: "💪", calories: 2800, protein: 200, carbs: 300, fat: 80 },
  { id: "maintain", label: "Stay Fit", emoji: "⚖️", calories: 2200, protein: 160, carbs: 220, fat: 70 },
  { id: "performance", label: "Performance", emoji: "⚡", calories: 3000, protein: 180, carbs: 350, fat: 85 },
];

const INTERESTS = ["Powerlifting","Bodybuilding","CrossFit","Running","Calisthenics","HIIT","Yoga","Swimming","Cycling","Basketball"];

export default function Onboarding({ onDone }) {
  const { user, updateProfile } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.full_name || "");
  const [goal, setGoal] = useState(null);
  const [interests, setInterests] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggleInterest = (i) => setInterests(prev =>
    prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
  );

  const finish = async () => {
    setSaving(true);
    const g = GOALS.find(x => x.id === goal) || GOALS[2];
    await updateProfile({
      full_name: name.trim() || user?.email,
      fitness_interests: interests,
      calorie_goal: g.calories,
      protein_goal: g.protein,
      carbs_goal: g.carbs,
      fat_goal: g.fat,
      onboarding_done: true,
    });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success(`Welcome to Tribe, ${name || "athlete"}! 🔥`);
    setSaving(false);
    onDone();
  };

  const steps = [
    // Step 0: Name
    <div key="name" className="space-y-6">
      <div className="text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Flame className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold">Welcome to Tribe</h2>
        <p className="text-muted-foreground text-sm mt-1">Your fitness community starts here</p>
      </div>
      <div>
        <p className="text-sm font-medium mb-2">What should we call you?</p>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          className="bg-secondary border-border text-lg h-12"
          autoFocus
        />
      </div>
      <Button onClick={() => setStep(1)} disabled={!name.trim()} className="w-full h-12 font-heading font-bold rounded-2xl">
        Let's Go <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>,

    // Step 1: Goal
    <div key="goal" className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-xl">What's your main goal?</h2>
        <p className="text-sm text-muted-foreground mt-1">We'll set up your nutrition targets automatically</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {GOALS.map(g => (
          <button key={g.id} onClick={() => setGoal(g.id)}
            className={cn("p-4 rounded-2xl border-2 text-left transition-all",
              goal === g.id ? "border-primary bg-primary/10" : "border-border bg-secondary")}>
            <span className="text-2xl">{g.emoji}</span>
            <p className="font-heading font-bold text-sm mt-2">{g.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{g.calories} kcal/day</p>
          </button>
        ))}
      </div>
      <Button onClick={() => setStep(2)} disabled={!goal} className="w-full h-12 font-heading font-bold rounded-2xl">
        Next <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>,

    // Step 2: Interests
    <div key="interests" className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-xl">What do you train?</h2>
        <p className="text-sm text-muted-foreground mt-1">Pick all that apply — helps find your tribe</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {INTERESTS.map(i => (
          <button key={i} onClick={() => toggleInterest(i)}
            className={cn("px-3 py-1.5 rounded-full text-sm font-heading font-medium border transition-all",
              interests.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-secondary border-border text-foreground")}>
            {interests.includes(i) && <Check className="h-3 w-3 inline mr-1" />}{i}
          </button>
        ))}
      </div>
      <Button onClick={finish} disabled={saving} className="w-full h-12 font-heading font-bold rounded-2xl">
        {saving ? "Setting up…" : "Start Training 🔥"}
      </Button>
    </div>,
  ];

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col items-center justify-center p-6">
      {/* Progress dots */}
      <div className="flex gap-2 mb-8">
        {[0, 1, 2].map(i => (
          <div key={i} className={cn("h-1.5 rounded-full transition-all duration-300",
            i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/50" : "w-4 bg-secondary")} />
        ))}
      </div>
      <div className="w-full max-w-sm">
        {steps[step]}
      </div>
    </div>
  );
}
