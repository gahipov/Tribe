import { useState } from "react";
import { ChevronDown, ChevronUp, Dumbbell, Play, Clock, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_PLAN = {
  id: "default",
  name: "5-Day Bodybuilding Split",
  description: "Classic hypertrophy program. Train 5 days, rest 2. Progressive overload each week.",
  days: [
    {
      day: "Day 1", focus: "Chest & Triceps", color: "text-blue-400 bg-blue-400/10",
      exercises: [
        { name: "Barbell Bench Press", sets: 4, reps: "8-10", rest: "90s", notes: "Main compound movement" },
        { name: "Incline Dumbbell Press", sets: 3, reps: "10-12", rest: "75s" },
        { name: "Cable Fly", sets: 3, reps: "12-15", rest: "60s", notes: "Squeeze at peak" },
        { name: "Tricep Pushdown", sets: 3, reps: "12-15", rest: "60s" },
        { name: "Overhead Tricep Extension", sets: 3, reps: "12-15", rest: "60s" },
      ]
    },
    {
      day: "Day 2", focus: "Back & Biceps", color: "text-green-400 bg-green-400/10",
      exercises: [
        { name: "Deadlift", sets: 4, reps: "5-6", rest: "2min", notes: "Keep back straight" },
        { name: "Barbell Row", sets: 4, reps: "8-10", rest: "90s" },
        { name: "Lat Pulldown", sets: 3, reps: "10-12", rest: "75s" },
        { name: "Seated Cable Row", sets: 3, reps: "12-15", rest: "60s" },
        { name: "Barbell Curl", sets: 3, reps: "10-12", rest: "60s" },
        { name: "Hammer Curl", sets: 3, reps: "12-15", rest: "60s" },
      ]
    },
    {
      day: "Day 3", focus: "Legs", color: "text-orange-400 bg-orange-400/10",
      exercises: [
        { name: "Barbell Squat", sets: 4, reps: "8-10", rest: "2min", notes: "King of all exercises" },
        { name: "Leg Press", sets: 4, reps: "10-12", rest: "90s" },
        { name: "Romanian Deadlift", sets: 3, reps: "10-12", rest: "90s", notes: "Feel the hamstring stretch" },
        { name: "Leg Curl", sets: 3, reps: "12-15", rest: "60s" },
        { name: "Calf Raise", sets: 4, reps: "15-20", rest: "45s" },
      ]
    },
    {
      day: "Day 4", focus: "Shoulders & Traps", color: "text-purple-400 bg-purple-400/10",
      exercises: [
        { name: "Overhead Press", sets: 4, reps: "8-10", rest: "90s", notes: "Seated or standing" },
        { name: "Lateral Raise", sets: 4, reps: "12-15", rest: "60s", notes: "Controlled motion" },
        { name: "Face Pull", sets: 3, reps: "15-20", rest: "60s", notes: "Great for rear delts" },
        { name: "Barbell Shrug", sets: 4, reps: "12-15", rest: "60s" },
        { name: "Front Raise", sets: 3, reps: "12-15", rest: "60s" },
      ]
    },
    {
      day: "Day 5", focus: "Arms & Abs", color: "text-cyan-400 bg-cyan-400/10",
      exercises: [
        { name: "EZ Bar Curl", sets: 4, reps: "10-12", rest: "75s" },
        { name: "Incline Dumbbell Curl", sets: 3, reps: "12-15", rest: "60s" },
        { name: "Close-Grip Bench Press", sets: 4, reps: "10-12", rest: "75s" },
        { name: "Skull Crusher", sets: 3, reps: "12-15", rest: "60s" },
        { name: "Cable Crunch", sets: 3, reps: "15-20", rest: "45s" },
        { name: "Hanging Leg Raise", sets: 3, reps: "12-15", rest: "45s" },
      ]
    },
  ]
};

const PPL_PLAN = {
  id: "ppl",
  name: "Push/Pull/Legs (PPL)",
  description: "Run twice per week (6 days on, 1 off). Great for intermediate lifters.",
  days: [
    {
      day: "Push A", focus: "Chest, Shoulders, Triceps", color: "text-red-400 bg-red-400/10",
      exercises: [
        { name: "Barbell Bench Press", sets: 4, reps: "6-8", rest: "2min", notes: "Heavy, progressive overload focus" },
        { name: "Overhead Press", sets: 3, reps: "8-10", rest: "90s" },
        { name: "Incline Dumbbell Press", sets: 3, reps: "10-12", rest: "75s" },
        { name: "Lateral Raise", sets: 4, reps: "15-20", rest: "45s", notes: "Light, strict form" },
        { name: "Tricep Pushdown", sets: 3, reps: "12-15", rest: "60s" },
      ]
    },
    {
      day: "Pull A", focus: "Back & Biceps", color: "text-emerald-400 bg-emerald-400/10",
      exercises: [
        { name: "Deadlift", sets: 3, reps: "5", rest: "3min", notes: "Max effort sets" },
        { name: "Pull-Up", sets: 4, reps: "6-10", rest: "90s", notes: "Add weight if needed" },
        { name: "Barbell Row", sets: 3, reps: "8-10", rest: "90s" },
        { name: "Face Pull", sets: 3, reps: "15-20", rest: "60s" },
        { name: "Barbell Curl", sets: 3, reps: "10-12", rest: "60s" },
        { name: "Hammer Curl", sets: 2, reps: "12-15", rest: "60s" },
      ]
    },
    {
      day: "Legs A", focus: "Quads, Hamstrings, Calves", color: "text-yellow-400 bg-yellow-400/10",
      exercises: [
        { name: "Barbell Squat", sets: 4, reps: "6-8", rest: "2min", notes: "Heavy, go deep" },
        { name: "Romanian Deadlift", sets: 3, reps: "8-10", rest: "90s" },
        { name: "Leg Press", sets: 3, reps: "10-12", rest: "90s" },
        { name: "Leg Curl", sets: 3, reps: "12-15", rest: "60s" },
        { name: "Calf Raise", sets: 5, reps: "15-20", rest: "45s" },
      ]
    },
  ]
};

const PLANS = [DEFAULT_PLAN, PPL_PLAN];

function DayCard({ day, planName, onStart, expanded, onToggle }) {
  const totalSets = day.exercises.reduce((acc, ex) => acc + ex.sets, 0);
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button className="w-full p-4 flex items-center gap-3 text-left" onClick={onToggle}>
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0", day.color)}>
          <Dumbbell className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-heading font-semibold text-sm">{day.day}</p>
          <p className="text-xs text-muted-foreground">{day.focus}</p>
        </div>
        <div className="flex items-center gap-3 mr-1">
          <div className="text-right">
            <p className="text-xs font-heading font-semibold text-foreground">{day.exercises.length} exercises</p>
            <p className="text-[10px] text-muted-foreground">{totalSets} sets</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border">
          <div className="px-4 py-3 space-y-2">
            {day.exercises.map((ex, j) => (
              <div key={j} className="flex items-start justify-between py-1.5 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{ex.name}</p>
                  {ex.notes && <p className="text-[10px] text-muted-foreground italic">{ex.notes}</p>}
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-xs font-heading font-semibold text-primary">{ex.sets} × {ex.reps}</p>
                  <p className="text-[10px] text-muted-foreground">Rest {ex.rest}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4">
            <Button size="sm" className="w-full font-heading font-semibold rounded-xl" onClick={() => onStart(day)}>
              <Play className="h-3.5 w-3.5 mr-1.5" /> Start {day.day}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BodybuildingPlan({ onStartWorkout }) {
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [expandedDay, setExpandedDay] = useState(null);

  return (
    <div className="space-y-4">
      {PLANS.map((plan, pi) => (
        <div key={plan.id} className="space-y-2">
          {/* Plan header */}
          <button
            className="w-full bg-card rounded-2xl border border-border p-4 text-left flex items-center justify-between"
            onClick={() => setExpandedPlan(expandedPlan === pi ? null : pi)}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <BarChart2 className="h-4 w-4 text-primary" />
                <h3 className="font-heading font-bold text-sm">{plan.name}</h3>
              </div>
              <p className="text-xs text-muted-foreground">{plan.description}</p>
            </div>
            {expandedPlan === pi
              ? <ChevronUp className="h-4 w-4 text-muted-foreground ml-3 flex-shrink-0" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground ml-3 flex-shrink-0" />}
          </button>

          {expandedPlan === pi && (
            <div className="space-y-2 pl-1">
              {plan.days.map((day, di) => {
                const key = `${pi}-${di}`;
                return (
                  <DayCard
                    key={key}
                    day={day}
                    planName={plan.name}
                    expanded={expandedDay === key}
                    onToggle={() => setExpandedDay(expandedDay === key ? null : key)}
                    onStart={(day) => onStartWorkout(day, plan)}
                  />
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
