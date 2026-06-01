import { useMemo, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import moment from "moment";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return <div className="bg-card border border-border rounded-xl p-3 text-xs space-y-1"><p className="font-heading font-semibold text-foreground mb-1">{label}</p>{payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-bold">{Math.round(p.value)}</span></p>)}</div>;
};

export default function NutritionHistory({ meals }) {
  const [view, setView] = useState("weekly");
  const weeklyData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = moment().subtract(6 - i, "days").format("YYYY-MM-DD");
      const label = moment().subtract(6 - i, "days").format("ddd");
      const dayMeals = meals.filter(m => m.date === d);
      return { label, Calories: dayMeals.reduce((s,m) => s+(m.calories||0),0), Protein: dayMeals.reduce((s,m) => s+(m.protein_g||0),0), Carbs: dayMeals.reduce((s,m) => s+(m.carbs_g||0),0), Fat: dayMeals.reduce((s,m) => s+(m.fat_g||0),0) };
    });
  }, [meals]);
  const monthlyData = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const start = moment().subtract(3-i, "weeks").startOf("isoWeek"), end = moment().subtract(3-i, "weeks").endOf("isoWeek");
      const weekMeals = meals.filter(m => moment(m.date).isBetween(start, end, null, "[]"));
      const days = weekMeals.length > 0 ? [...new Set(weekMeals.map(m => m.date))].length : 1;
      return { label: "Wk "+start.format("M/D"), Calories: Math.round(weekMeals.reduce((s,m) => s+(m.calories||0),0)/days), Protein: Math.round(weekMeals.reduce((s,m) => s+(m.protein_g||0),0)/days), Carbs: Math.round(weekMeals.reduce((s,m) => s+(m.carbs_g||0),0)/days), Fat: Math.round(weekMeals.reduce((s,m) => s+(m.fat_g||0),0)/days) };
    });
  }, [meals]);
  const data = view === "weekly" ? weeklyData : monthlyData;
  return (
    <div className="space-y-5">
      <div className="flex gap-2 bg-secondary rounded-xl p-1 w-fit">
        {["weekly", "monthly"].map(v => <button key={v} onClick={() => setView(v)} className={"px-4 py-1.5 rounded-lg text-sm font-heading font-medium transition-colors " + (view===v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{v==="weekly" ? "7 Days" : "4 Weeks"}</button>)}
      </div>
      <div className="bg-card rounded-2xl border border-border p-4">
        <p className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider mb-3">Calorie Intake</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,18%)" /><XAxis dataKey="label" tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} /><Tooltip content={<CustomTooltip />} /><Line type="monotone" dataKey="Calories" stroke="hsl(175,85%,50%)" strokeWidth={2} dot={{ fill: "hsl(175,85%,50%)", r: 3 }} /></LineChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-card rounded-2xl border border-border p-4">
        <p className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider mb-3">Macro Breakdown (g)</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} barSize={12} barGap={2}><CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,18%)" vertical={false} /><XAxis dataKey="label" tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} width={35} /><Tooltip content={<CustomTooltip />} /><Legend wrapperStyle={{ fontSize: 11, color: "hsl(215,15%,55%)" }} /><Bar dataKey="Protein" fill="hsl(175,85%,50%)" radius={[3,3,0,0]} /><Bar dataKey="Carbs" fill="hsl(35,90%,60%)" radius={[3,3,0,0]} /><Bar dataKey="Fat" fill="hsl(330,70%,55%)" radius={[3,3,0,0]} /></BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
