import { useMemo, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine } from "recharts";
import moment from "moment";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 text-xs space-y-1">
      <p className="font-heading font-semibold text-foreground mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-bold">{Math.round(p.value)}</span></p>
      ))}
    </div>
  );
};

export default function NutritionHistory({ meals, goals = {} }) {
  const [view, setView] = useState("weekly");

  const calGoal = goals.calories || 2000;
  const pGoal = goals.protein || 150;

  const weeklyData = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = moment().subtract(6 - i, "days").format("YYYY-MM-DD");
      const label = moment().subtract(6 - i, "days").format("ddd");
      const dayMeals = meals.filter(m => m.date === d);
      const logged = dayMeals.length > 0;
      return {
        label,
        Calories: logged ? dayMeals.reduce((s, m) => s + (m.calories || 0), 0) : null,
        Protein: logged ? dayMeals.reduce((s, m) => s + (m.protein_g || 0), 0) : null,
        Carbs: logged ? dayMeals.reduce((s, m) => s + (m.carbs_g || 0), 0) : null,
        Fat: logged ? dayMeals.reduce((s, m) => s + (m.fat_g || 0), 0) : null,
        logged,
      };
    });
  }, [meals]);

  const monthlyData = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const start = moment().subtract(3 - i, "weeks").startOf("isoWeek");
      const end = moment().subtract(3 - i, "weeks").endOf("isoWeek");
      const weekMeals = meals.filter(m => moment(m.date).isBetween(start, end, null, "[]"));
      const days = weekMeals.length > 0 ? [...new Set(weekMeals.map(m => m.date))].length : 1;
      return {
        label: "Wk " + start.format("M/D"),
        Calories: Math.round(weekMeals.reduce((s, m) => s + (m.calories || 0), 0) / days),
        Protein: Math.round(weekMeals.reduce((s, m) => s + (m.protein_g || 0), 0) / days),
        Carbs: Math.round(weekMeals.reduce((s, m) => s + (m.carbs_g || 0), 0) / days),
        Fat: Math.round(weekMeals.reduce((s, m) => s + (m.fat_g || 0), 0) / days),
      };
    });
  }, [meals]);

  const data = view === "weekly" ? weeklyData : monthlyData;
  const loggedDays = weeklyData.filter(d => d.logged);

  // Summary stats over logged days
  const avgCals = loggedDays.length ? Math.round(loggedDays.reduce((s, d) => s + d.Calories, 0) / loggedDays.length) : 0;
  const avgProtein = loggedDays.length ? Math.round(loggedDays.reduce((s, d) => s + d.Protein, 0) / loggedDays.length) : 0;
  const daysHitCalGoal = loggedDays.filter(d => d.Calories >= calGoal * 0.9 && d.Calories <= calGoal * 1.1).length;
  const daysHitProtein = loggedDays.filter(d => d.Protein >= pGoal * 0.9).length;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      {loggedDays.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Avg Daily Calories", value: `${avgCals} kcal`, sub: `Goal: ${calGoal} kcal`, color: avgCals > calGoal * 1.1 ? "text-red-400" : avgCals < calGoal * 0.8 ? "text-amber-400" : "text-primary" },
            { label: "Avg Daily Protein", value: `${avgProtein}g`, sub: `Goal: ${pGoal}g protein`, color: avgProtein >= pGoal * 0.9 ? "text-cyan-400" : "text-amber-400" },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-card rounded-2xl border border-border p-3">
              <p className={`font-heading font-bold text-base ${color}`}>{value}</p>
              <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 bg-secondary rounded-xl p-1 w-fit">
        {["weekly", "monthly"].map(v => (
          <button key={v} onClick={() => setView(v)}
            className={"px-4 py-1.5 rounded-lg text-sm font-heading font-medium transition-colors " + (view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            {v === "weekly" ? "7 Days" : "4 Weeks"}
          </button>
        ))}
      </div>

      {/* Calorie chart with goal line */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <p className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider mb-3">Calorie Intake vs Goal</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,18%)" />
            <XAxis dataKey="label" tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={calGoal} stroke="hsl(var(--primary))" strokeDasharray="4 3" strokeOpacity={0.4}
              label={{ value: "Goal", position: "right", fontSize: 10, fill: "hsl(var(--primary))", fillOpacity: 0.6 }} />
            <Line type="monotone" dataKey="Calories" stroke="hsl(175,85%,50%)" strokeWidth={2}
              dot={{ fill: "hsl(175,85%,50%)", r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Protein chart with goal line */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <p className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider mb-3">Protein Intake vs Goal</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} barSize={16}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,18%)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={pGoal} stroke="hsl(175,85%,50%)" strokeDasharray="4 3" strokeOpacity={0.5}
              label={{ value: "Goal", position: "right", fontSize: 10, fill: "hsl(175,85%,50%)", fillOpacity: 0.6 }} />
            <Bar dataKey="Protein" fill="hsl(175,85%,50%)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Carbs & fat */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <p className="text-xs font-heading font-semibold text-muted-foreground uppercase tracking-wider mb-3">Carbs & Fat (g)</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} barSize={12} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,15%,18%)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(215,15%,55%)", fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215,15%,55%)" }} />
            <Bar dataKey="Carbs" fill="hsl(35,90%,60%)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Fat" fill="hsl(330,70%,55%)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
