import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { presentCustomerCenter, restorePurchases } from "@/lib/revenueCat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings, LogOut, Dumbbell, UtensilsCrossed, Users, Loader2, MapPin, Camera, Shield, Scale, Target, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ProBadge } from "@/components/PremiumGate";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts";

export default function Profile() {
  const { user, logout, updateProfile, isPremium, refreshPremium } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", bio: "", city: "", gym_name: "", fitness_interests: "" });
  const [goals, setGoals] = useState({ calorie_goal: 2000, protein_goal: 150, carbs_goal: 200, fat_goal: 65 });
  const [weightInput, setWeightInput] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user) {
      setForm({ full_name: user.full_name||"", bio: user.bio||"", city: user.city||"", gym_name: user.gym_name||"", fitness_interests: (user.fitness_interests||[]).join(", ") });
      setGoals({ calorie_goal: user.calorie_goal||2000, protein_goal: user.protein_goal||150, carbs_goal: user.carbs_goal||200, fat_goal: user.fat_goal||65 });
    }
  }, [user]);

  const { data: workouts = [] } = useQuery({ queryKey: ["workouts"], queryFn: async () => { const { data } = await supabase.from('workouts').select('id').eq('user_id', user.id); return data || []; }, enabled: !!user });
  const { data: meals = [] } = useQuery({ queryKey: ["meals"], queryFn: async () => { const { data } = await supabase.from('meals').select('id').eq('user_id', user.id); return data || []; }, enabled: !!user });
  const { data: posts = [] } = useQuery({ queryKey: ["my-posts"], queryFn: async () => { const { data } = await supabase.from('posts').select('*').eq('user_id', user.id).order('created_at', { ascending: false }); return data || []; }, enabled: !!user });
  const { data: myTribes = [] } = useQuery({ queryKey: ["my-tribes"], queryFn: async () => { const { data } = await supabase.from('tribe_members').select('tribe_id, tribes(name)').eq('user_id', user.id); return data || []; }, enabled: !!user });
  const { data: bodyMeasurements = [] } = useQuery({ queryKey: ["body-measurements"], queryFn: async () => { const { data } = await supabase.from('body_measurements').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(14); return data || []; }, enabled: !!user && isPremium });

  const logWeightMutation = useMutation({
    mutationFn: async (kg) => {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from('body_measurements').upsert({ user_id: user.id, date: today, weight_kg: kg }, { onConflict: 'user_id,date' });
      if (error) throw error;
      return { date: today, weight_kg: kg };
    },
    onMutate: async (kg) => {
      await queryClient.cancelQueries({ queryKey: ["body-measurements"] });
      const prev = queryClient.getQueryData(["body-measurements"]);
      const today = new Date().toISOString().split("T")[0];
      queryClient.setQueryData(["body-measurements"], (old = []) => {
        const filtered = old.filter(m => m.date !== today);
        return [{ user_id: user.id, date: today, weight_kg: kg }, ...filtered];
      });
      setWeightInput("");
      toast.success("Weight logged!");
      return { prev };
    },
    onError: (_err, _kg, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["body-measurements"], ctx.prev);
      toast.error("Failed to log weight");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["body-measurements"] }),
  });

  const ADMINS = ["gahipov@gmail.com"];
  const isAdmin = ADMINS.includes(user?.email);

  const grantPro = async (email) => {
    const { error } = await supabase.from("profiles").update({ is_premium: true }).eq("email", email);
    if (error) toast.error("Failed: " + error.message);
    else toast.success(`Pro granted to ${email}`);
  };

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ full_name: form.full_name, bio: form.bio, city: form.city, gym_name: form.gym_name, fitness_interests: form.fitness_interests.split(",").map(s => s.trim()).filter(Boolean) });
    toast.success("Profile updated!"); setSaving(false); setEditOpen(false);
  };

  const handleSaveGoals = async () => {
    setSaving(true);
    await updateProfile(goals);
    toast.success("Goals updated!"); setSaving(false); setGoalsOpen(false);
  };

  const handleRestore = async () => {
    const isNowPremium = await restorePurchases();
    await refreshPremium();
    if (isNowPremium) {
      toast.success("Purchases restored!");
    } else {
      toast.info("No active subscription found.");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const ext = file.name.split('.').pop();
    const path = user.id + '/avatar.' + ext;
    const { error } = await supabase.storage.from('media').upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed"); return; }
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path);
    await updateProfile({ profile_image: publicUrl });
    toast.success("Profile photo updated!");
  };

  if (!user) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>;

  const stats = [{ label: "Workouts", value: workouts.length, icon: Dumbbell }, { label: "Meals", value: meals.length, icon: UtensilsCrossed }, { label: "Posts", value: posts.length, icon: Users }];
  const weightData = [...bodyMeasurements].reverse().map(m => ({ date: m.date.slice(5), weight: m.weight_kg }));
  const latestWeight = bodyMeasurements[0]?.weight_kg;

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-4 flex items-center justify-between border-b border-border">
        <h1 className="font-display text-xl font-bold tracking-tight">Profile</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => setGoalsOpen(true)}><Target className="h-5 w-5"/></Button>
          <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}><Settings className="h-5 w-5"/></Button>
          <Button variant="ghost" size="icon" onClick={logout}><LogOut className="h-5 w-5"/></Button>
        </div>
      </div>
      <div className="p-6 flex flex-col items-center">
        <div className="relative group">
          <div className="h-24 w-24 rounded-full bg-secondary overflow-hidden border-2 border-primary/30">
            {user.profile_image ? <img src={user.profile_image} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-primary font-heading font-bold text-3xl">{(user.full_name||user.email||"?")[0]?.toUpperCase()}</div>}
          </div>
          <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
            <Camera className="h-6 w-6 text-white"/><input type="file" accept="image/*" className="hidden" onChange={handleImageUpload}/>
          </label>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <h2 className="font-heading font-bold text-xl">{user.full_name || user.email}</h2>
          {isPremium && <ProBadge />}
        </div>
        {user.bio && <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">{user.bio}</p>}
        {user.city && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="h-3 w-3"/> {user.city}{user.gym_name && <span>· {user.gym_name}</span>}</p>}
        {user.fitness_interests?.length > 0 && <div className="flex flex-wrap gap-1.5 mt-3 justify-center">{user.fitness_interests.map(i => <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">{i}</span>)}</div>}

        {/* Tribes */}
        {myTribes.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 justify-center">
            {myTribes.map(m => (
              <span key={m.tribe_id} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-secondary border border-border text-muted-foreground">
                <Shield className="h-3 w-3 text-primary"/>{m.tribes?.name}
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 w-full mt-6">
          {stats.map(({ label, value, icon: Icon }) => <div key={label} className="bg-card rounded-2xl border border-border p-4 text-center"><Icon className="h-5 w-5 text-primary mx-auto mb-1"/><p className="text-2xl font-heading font-bold">{value}</p><p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p></div>)}
        </div>

        {/* Body weight (premium) */}
        {isPremium && (
          <div className="w-full mt-6 bg-card rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-primary"/>
                <p className="font-heading font-semibold text-sm">Body Weight</p>
              </div>
              {latestWeight && <span className="font-heading font-bold text-primary">{latestWeight} kg</span>}
            </div>
            {weightData.length > 1 && (
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={weightData}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "none", borderRadius: 8, fontSize: 12 }} cursor={false}/>
                  <Bar dataKey="weight" fill="hsl(var(--primary))" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="flex gap-2 mt-3">
              <Input value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="Today's weight (kg)" type="number" className="bg-secondary border-border flex-1 h-9 text-sm"/>
              <Button size="sm" onClick={() => logWeightMutation.mutate(parseFloat(weightInput))} disabled={!weightInput || logWeightMutation.isPending} className="h-9 rounded-xl font-heading">Log</Button>
            </div>
          </div>
        )}

        {/* Admin panel */}
        {isAdmin && (
          <div className="w-full mt-6 bg-card rounded-2xl border border-primary/30 p-4">
            <p className="text-xs font-heading font-bold text-primary uppercase tracking-wider mb-3">⚡ Admin — Grant Pro</p>
            <div className="flex gap-2">
              <Input id="admin-email" placeholder="user@email.com" className="bg-secondary border-border flex-1 h-9 text-sm" />
              <Button size="sm" className="h-9 rounded-xl font-heading" onClick={() => {
                const val = document.getElementById("admin-email").value.trim();
                if (val) grantPro(val);
              }}>Grant Pro</Button>
            </div>
          </div>
        )}

        {/* Subscription management */}
        <div className="w-full mt-4">
          {isPremium && (
            <button
              onClick={() => presentCustomerCenter()}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
            >
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Manage Subscription</span>
            </button>
          )}
          <button
            onClick={handleRestore}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
          >
            <span className="text-sm text-muted-foreground">Restore Purchases</span>
          </button>
        </div>

        {posts.length > 0 && <div className="w-full mt-6"><p className="text-xs text-muted-foreground font-heading font-medium uppercase tracking-wider mb-3">Your Posts</p><div className="grid grid-cols-3 gap-1.5">{posts.filter(p => p.media_url).map(p => <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-secondary">{p.media_type==="video" ? <video src={p.media_url} className="w-full h-full object-cover" preload="metadata"/> : <img src={p.media_url} alt="" className="w-full h-full object-cover"/>}</div>)}</div></div>}
      </div>
      <Dialog open={goalsOpen} onOpenChange={setGoalsOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><Target className="h-4 w-4"/>Daily Goals</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            {[["Calories (kcal)","calorie_goal"],["Protein (g)","protein_goal"],["Carbs (g)","carbs_goal"],["Fat (g)","fat_goal"]].map(([label, key]) => (
              <div key={key}>
                <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
                <Input type="number" value={goals[key]} onChange={e => setGoals(g => ({...g, [key]: parseInt(e.target.value)||0}))} className="bg-secondary border-border"/>
              </div>
            ))}
            <Button onClick={handleSaveGoals} disabled={saving} className="w-full font-heading font-semibold">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}Save Goals</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Edit Profile</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><Label className="text-xs text-muted-foreground mb-1.5 block">Name</Label><Input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder="Your name" className="bg-secondary border-border"/></div>
            <div><Label className="text-xs text-muted-foreground mb-1.5 block">Bio</Label><Textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} placeholder="Tell your tribe about you" className="bg-secondary border-border resize-none"/></div>
            <div><Label className="text-xs text-muted-foreground mb-1.5 block">City</Label><Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="Los Angeles" className="bg-secondary border-border"/></div>
            <div><Label className="text-xs text-muted-foreground mb-1.5 block">Gym</Label><Input value={form.gym_name} onChange={e => setForm({...form, gym_name: e.target.value})} placeholder="Gold's Gym" className="bg-secondary border-border"/></div>
            <div><Label className="text-xs text-muted-foreground mb-1.5 block">Fitness interests (comma separated)</Label><Input value={form.fitness_interests} onChange={e => setForm({...form, fitness_interests: e.target.value})} placeholder="powerlifting, running, yoga" className="bg-secondary border-border"/></div>
            <Button onClick={handleSave} disabled={saving} className="w-full font-heading font-semibold">{saving ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
