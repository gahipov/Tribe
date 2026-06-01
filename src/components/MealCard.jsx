import { UtensilsCrossed, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
export default function MealCard({ meal, onEdit, onDelete }) {
  const typeColors = { breakfast: "text-amber-400 bg-amber-400/10", lunch: "text-green-400 bg-green-400/10", dinner: "text-blue-400 bg-blue-400/10", snack: "text-purple-400 bg-purple-400/10" };
  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0", typeColors[meal.meal_type] || typeColors.snack)}><UtensilsCrossed className="h-5 w-5" /></div>
      <div className="flex-1 min-w-0">
        <p className="font-heading font-semibold text-sm truncate">{meal.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5"><span className="capitalize">{meal.meal_type}</span><span>·</span><span>{meal.calories || 0} cal</span></div>
        <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground"><span>P: {meal.protein_g || 0}g</span><span>C: {meal.carbs_g || 0}g</span><span>F: {meal.fat_g || 0}g</span></div>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onEdit(meal)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary"><Pencil className="h-4 w-4" /></button>
        <button onClick={() => onDelete(meal)} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-secondary"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
