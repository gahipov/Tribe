import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const mealTypes = ["breakfast", "lunch", "dinner", "snack"];

export default function MealFormDialog({ open, onOpenChange, editMeal, prefill }) {
  const [date, setDate] = useState("");
  const [mealType, setMealType] = useState("lunch");
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (editMeal) { setDate(editMeal.date||""); setMealType(editMeal.meal_type||"lunch"); setName(editMeal.name||""); setCalories(editMeal.calories?.toString()||""); setProtein(editMeal.protein_g?.toString()||""); setCarbs(editMeal.carbs_g?.toString()||""); setFat(editMeal.fat_g?.toString()||""); setNotes(editMeal.notes||""); }
    else if (prefill) { setDate(new Date().toISOString().split("T")[0]); setMealType("lunch"); setName(prefill.name||""); setCalories(prefill.calories?.toString()||""); setProtein(prefill.protein_g?.toString()||""); setCarbs(prefill.carbs_g?.toString()||""); setFat(prefill.fat_g?.toString()||""); setNotes(""); }
    else { setDate(new Date().toISOString().split("T")[0]); setMealType("lunch"); setName(""); setCalories(""); setProtein(""); setCarbs(""); setFat(""); setNotes(""); }
  }, [editMeal, prefill, open]);

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (editMeal) { const { error } = await supabase.from('meals').update(data).eq('id', editMeal.id); if (error) throw error; }
      else { const { error } = await supabase.from('meals').insert({ ...data, user_id: user.id }); if (error) throw error; }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["meals"] }); toast.success(editMeal ? "Meal updated!" : "Meal logged!"); onOpenChange(false); },
  });

  const handleSubmit = () => mutation.mutate({ date, meal_type: mealType, name, calories: parseInt(calories)||0, protein_g: parseInt(protein)||0, carbs_g: parseInt(carbs)||0, fat_g: parseInt(fat)||0, notes });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader><DialogTitle className="font-heading">{editMeal ? "Edit Meal" : "Log Meal"}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex gap-3">
            <div className="flex-1"><Label className="text-xs text-muted-foreground mb-1.5 block">Date</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-secondary border-border"/></div>
            <div className="flex-1"><Label className="text-xs text-muted-foreground mb-1.5 block">Meal</Label><Select value={mealType} onValueChange={setMealType}><SelectTrigger className="bg-secondary border-border capitalize"><SelectValue/></SelectTrigger><SelectContent>{mealTypes.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label className="text-xs text-muted-foreground mb-1.5 block">Food name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Grilled chicken & rice" className="bg-secondary border-border"/></div>
          <div className="grid grid-cols-4 gap-2">
            <div><Label className="text-[10px] text-muted-foreground mb-1 block">Calories</Label><Input type="number" value={calories} onChange={e => setCalories(e.target.value)} className="bg-secondary border-border text-sm"/></div>
            <div><Label className="text-[10px] text-muted-foreground mb-1 block">Protein</Label><Input type="number" value={protein} onChange={e => setProtein(e.target.value)} className="bg-secondary border-border text-sm"/></div>
            <div><Label className="text-[10px] text-muted-foreground mb-1 block">Carbs</Label><Input type="number" value={carbs} onChange={e => setCarbs(e.target.value)} className="bg-secondary border-border text-sm"/></div>
            <div><Label className="text-[10px] text-muted-foreground mb-1 block">Fat</Label><Input type="number" value={fat} onChange={e => setFat(e.target.value)} className="bg-secondary border-border text-sm"/></div>
          </div>
          <Textarea placeholder="Notes..." value={notes} onChange={e => setNotes(e.target.value)} className="bg-secondary border-border resize-none"/>
          <Button onClick={handleSubmit} disabled={mutation.isPending || !name || !date} className="w-full font-heading font-semibold">{mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}{editMeal ? "Update Meal" : "Log Meal"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
