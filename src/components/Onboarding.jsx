import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Flame, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const INTERESTS = ["Powerlifting","Bodybuilding","CrossFit","Running","Calisthenics","HIIT","Yoga","Swimming","Cycling","Basketball"];

const ACTIVITY_LEVELS = [
  { id: "sedentary",  label: "Sedentary",       desc: "Desk job, little movement",         multiplier: 1.2   },
  { id: "light",      label: "Lightly Active",   desc: "1–3 workouts/week",                 multiplier: 1.375 },
  { id: "moderate",   label: "Moderately Active",desc: "3–5 workouts/week",                 multiplier: 1.55  },
  { id: "active",     label: "Very Active",      desc: "6–7 workouts/week",                 multiplier: 1.725 },
  { id: "athlete",    label: "Athlete",          desc: "Training twice a day",              multiplier: 1.9   },
];

const GOALS = [
  { id: "lose_fat",      label: "Lose Fat",      emoji: "🔥", calAdj: -400, pRatio: 2.2,  cRatio: 2.0, fRatio: 0.8 },
  { id: "build_muscle",  label: "Build Muscle",  emoji: "💪", calAdj: +300, pRatio: 2.0,  cRatio: 3.5, fRatio: 1.0 },
  { id: "maintain",      label: "Stay Fit",      emoji: "⚖️", calAdj:    0, pRatio: 1.8,  cRatio: 2.5, fRatio: 0.9 },
  { id: "performance",   label: "Performance",   emoji: "⚡", calAdj: +500, pRatio: 1.8,  cRatio: 4.5, fRatio: 1.0 },
];

// Mifflin-St Jeor BMR → TDEE → macros
function calcMacros({ gender, age, weight_kg, height_cm, activity_level, goal_id }) {
  const bmr = gender === "female"
    ? 10 * weight_kg + 6.25 * height_cm - 5 * age - 161
    : 10 * weight_kg + 6.25 * height_cm - 5 * age + 5;

  const act = ACTIVITY_LEVELS.find(a => a.id === activity_level) || ACTIVITY_LEVELS[2];
  const tdee = Math.round(bmr * act.multiplier);

  const g = GOALS.find(x => x.id === goal_id) || GOALS[2];
  const calories = Math.max(1200, tdee + g.calAdj);
  const protein  = Math.round(weight_kg * g.pRatio);
  const fat      = Math.round(weight_kg * g.fRatio);
  const carbs    = Math.round((calories - protein * 4 - fat * 9) / 4);

  return { calories, protein, carbs: Math.max(50, carbs), fat, tdee };
}

const TOTAL_STEPS = 5;

export default function Onboarding({ onDone }) {
  const { user, updateProfile } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep]               = useState(0);
  const [name, setName]               = useState(
    user?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    ""
  );
  const [gender, setGender]           = useState(null);
  const [age, setAge]                 = useState("");
  const [weight, setWeight]           = useState("");
  const [height, setHeight]           = useState("");
  const [activityLevel, setActivity]  = useState(null);
  const [goal, setGoal]               = useState(null);
  const [interests, setInterests]     = useState([]);
  const [saving, setSaving]           = useState(false);

  const toggleInterest = (i) => setInterests(prev =>
    prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
  );

  const macros = (goal && weight && height && age && gender && activityLevel)
    ? calcMacros({ gender, age: +age, weight_kg: +weight, height_cm: +height, activity_level: activityLevel, goal_id: goal })
    : null;

  const finish = async () => {
    setSaving(true);
    const m = macros || { calories: 2200, protein: 160, carbs: 220, fat: 70 };
    await updateProfile({
      full_name:      name.trim() || user?.email,
      gender,
      age:            age ? +age : null,
      weight_kg:      weight ? +weight : null,
      height_cm:      height ? +height : null,
      activity_level: activityLevel,
      fitness_interests: interests,
      calorie_goal:   m.calories,
      protein_goal:   m.protein,
      carbs_goal:     m.carbs,
      fat_goal:       m.fat,
      onboarding_done: true,
    });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast.success(`Welcome to Tribe, ${name || "athlete"}! 🔥`);
    setSaving(false);
    onDone();
  };

  const steps = [
    // ── 0: Name ──
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
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
          className="bg-secondary border-border text-lg h-12" autoFocus />
      </div>
      <Button onClick={() => setStep(1)} className="w-full h-12 font-heading font-bold rounded-2xl">
        Let's Go <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>,

    // ── 1: Body stats ──
    <div key="body" className="space-y-5">
      <div>
        <h2 className="font-heading font-bold text-xl">Your body stats</h2>
        <p className="text-sm text-muted-foreground mt-1">Used to calculate your exact calorie & macro targets</p>
      </div>

      <div className="flex gap-2">
        {[{ id: "male", label: "Male" }, { id: "female", label: "Female" }, { id: "other", label: "Other" }].map(g => (
          <button key={g.id} onClick={() => setGender(g.id)}
            className={cn("flex-1 py-2.5 rounded-xl text-sm font-heading font-semibold border-2 transition-all",
              gender === g.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary text-muted-foreground")}>
            {g.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Age", placeholder: "25", value: age, set: setAge, unit: "yrs", max: 3 },
          { label: "Weight", placeholder: "75", value: weight, set: setWeight, unit: "kg", max: 4 },
          { label: "Height", placeholder: "175", value: height, set: setHeight, unit: "cm", max: 3 },
        ].map(({ label, placeholder, value, set, unit, max }) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground mb-1.5 font-heading">{label}</p>
            <div className="relative">
              <Input type="number" placeholder={placeholder} value={value}
                onChange={e => e.target.value.length <= max && set(e.target.value)}
                className="bg-secondary border-border pr-8 h-11 text-sm" />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={() => setStep(2)}
        disabled={!gender || !age || !weight || !height}
        className="w-full h-12 font-heading font-bold rounded-2xl">
        Next <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>,

    // ── 2: Activity level ──
    <div key="activity" className="space-y-5">
      <div>
        <h2 className="font-heading font-bold text-xl">How active are you?</h2>
        <p className="text-sm text-muted-foreground mt-1">Outside of planned workouts</p>
      </div>
      <div className="space-y-2">
        {ACTIVITY_LEVELS.map(a => (
          <button key={a.id} onClick={() => setActivity(a.id)}
            className={cn("w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center gap-3",
              activityLevel === a.id ? "border-primary bg-primary/10" : "border-border bg-secondary")}>
            <div className={cn("h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
              activityLevel === a.id ? "border-primary" : "border-muted-foreground")}>
              {activityLevel === a.id && <div className="h-2 w-2 rounded-full bg-primary" />}
            </div>
            <div>
              <p className="font-heading font-semibold text-sm">{a.label}</p>
              <p className="text-[11px] text-muted-foreground">{a.desc}</p>
            </div>
          </button>
        ))}
      </div>
      <Button onClick={() => setStep(3)} disabled={!activityLevel} className="w-full h-12 font-heading font-bold rounded-2xl">
        Next <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>,

    // ── 3: Goal ──
    <div key="goal" className="space-y-5">
      <div>
        <h2 className="font-heading font-bold text-xl">What's your main goal?</h2>
        <p className="text-sm text-muted-foreground mt-1">Targets calculated for your body</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {GOALS.map(g => {
          const m = calcMacros({ gender, age: +age, weight_kg: +weight, height_cm: +height, activity_level: activityLevel, goal_id: g.id });
          return (
            <button key={g.id} onClick={() => setGoal(g.id)}
              className={cn("p-4 rounded-2xl border-2 text-left transition-all",
                goal === g.id ? "border-primary bg-primary/10" : "border-border bg-secondary")}>
              <span className="text-2xl">{g.emoji}</span>
              <p className="font-heading font-bold text-sm mt-2">{g.label}</p>
              <p className="text-[11px] text-primary font-semibold mt-0.5">{m.calories} kcal</p>
              <p className="text-[10px] text-muted-foreground">{m.protein}g P · {m.carbs}g C · {m.fat}g F</p>
            </button>
          );
        })}
      </div>
      {macros && (
        <div className="bg-secondary rounded-2xl p-3 text-center">
          <p className="text-[11px] text-muted-foreground">Your TDEE (maintenance): <span className="text-foreground font-semibold">{macros.tdee} kcal/day</span></p>
        </div>
      )}
      <Button onClick={() => setStep(4)} disabled={!goal} className="w-full h-12 font-heading font-bold rounded-2xl">
        Next <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>,

    // ── 4: Interests ──
    <div key="interests" className="space-y-5">
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
      <div className="flex gap-2 mb-8">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div key={i} className={cn("h-1.5 rounded-full transition-all duration-300",
            i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/50" : "w-4 bg-secondary")} />
        ))}
      </div>
      <div className="w-full max-w-sm overflow-y-auto max-h-[80dvh]">
        {steps[step]}
      </div>
    </div>
  );
}
