import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { restorePurchases, isNative } from "@/lib/revenueCat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Settings, LogOut, Dumbbell, UtensilsCrossed, Users, Loader2, MapPin, Camera, Shield, Scale, Target, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ProBadge } from "@/components/PremiumGate";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Dot } from "recharts";
import { X as XIcon } from "lucide-react";

export default function Profile() {
  const { user, logout, deleteAccount, updateProfile, isPremium, refreshPremium, refreshPremiumRC } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", bio: "", city: "", gym_name: "", fitness_interests: "" });
  const [goals, setGoals] = useState({ calorie_goal: 2000, protein_goal: 150, carbs_goal: 200, fat_goal: 65 });
  const [weightInput, setWeightInput] = useState("");
  const [weightPhoto, setWeightPhoto] = useState(null); // { file, previewUrl }
  const [selectedPoint, setSelectedPoint] = useState(null); // { date, weight_kg, photo_url }
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
  const { data: blockedUsers = [], refetch: refetchBlocked } = useQuery({
    queryKey: ["blocked-users"],
    queryFn: async () => {
      const { data: blocks } = await supabase.from('blocked_users').select('blocked_user_id').eq('user_id', user.id);
      if (!blocks?.length) return [];
      const ids = blocks.map(b => b.blocked_user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, profile_image').in('id', ids);
      return blocks.map(b => ({ ...b, profile: profiles?.find(p => p.id === b.blocked_user_id) }));
    },
    enabled: !!user,
  });

  const handleUnblock = async (blockedUserId) => {
    await supabase.from('blocked_users').delete().eq('user_id', user.id).eq('blocked_user_id', blockedUserId);
    refetchBlocked();
    queryClient.invalidateQueries({ queryKey: ["blocked-ids"] });
    toast.success("User unblocked.");
  };

  const logWeightMutation = useMutation({
    mutationFn: async ({ kg, photoFile }) => {
      const today = new Date().toISOString().split("T")[0];
      let photo_url = null;
      if (photoFile) {
        try {
          const ext = photoFile.name.split(".").pop();
          const path = `weight/${user.id}/${today}.${ext}`;
          const { error: upErr } = await supabase.storage.from("body-photos").upload(path, photoFile, { upsert: true });
          if (!upErr) {
            const { data } = supabase.storage.from("body-photos").getPublicUrl(path);
            photo_url = data.publicUrl;
          }
        } catch { /* photo upload failed — log weight anyway */ }
      }
      const { error } = await supabase.from('body_measurements').upsert({ user_id: user.id, date: today, weight_kg: kg, photo_url }, { onConflict: 'user_id,date' });
      if (error) throw error;
      return { date: today, weight_kg: kg, photo_url };
    },
    onMutate: async ({ kg }) => {
      await queryClient.cancelQueries({ queryKey: ["body-measurements"] });
      const prev = queryClient.getQueryData(["body-measurements"]);
      const today = new Date().toISOString().split("T")[0];
      queryClient.setQueryData(["body-measurements"], (old = []) => {
        const filtered = old.filter(m => m.date !== today);
        return [{ user_id: user.id, date: today, weight_kg: kg }, ...filtered];
      });
      setWeightInput("");
      setWeightPhoto(null);
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
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/grant-pro`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ targetEmail: email }),
    });
    const result = await res.json();
    if (!res.ok) toast.error("Failed: " + result.error);
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

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      toast.success("Account deleted");
    } catch (err) {
      toast.error("Failed to delete account: " + (err?.message || "unknown error"));
      setDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!isNative()) {
      toast.info("Open the app on your phone to restore purchases.");
      return false;
    }
    // restorePurchases contacts Apple/Google and returns RC entitlement result only
    const isNowPremium = await restorePurchases();
    // refreshPremiumRC uses RC result only — no DB fallback that could give false pro
    await refreshPremiumRC();
    if (isNowPremium) toast.success("Purchases restored!");
    else toast.info("No active subscription found.");
    return isNowPremium;
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
  const weightData = [...bodyMeasurements].reverse().map(m => ({ date: m.date.slice(5), weight: m.weight_kg, photo_url: m.photo_url, full: m }));
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
          <div className="w-full mt-6 bg-card rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-primary"/>
                <p className="font-heading font-semibold text-sm">Body Weight</p>
              </div>
              {latestWeight && <span className="font-heading font-bold text-primary">{latestWeight} kg</span>}
            </div>

            {/* Graph */}
            {weightData.length > 1 && (
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={weightData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v} kg`, "Weight"]}/>
                  <Line
                    type="monotone"
                    dataKey="weight"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={(props) => {
                      const { cx, cy, payload } = props;
                      return (
                        <circle
                          key={payload.date}
                          cx={cx} cy={cy} r={payload.photo_url ? 6 : 4}
                          fill={payload.photo_url ? "hsl(var(--primary))" : "hsl(var(--card))"}
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          style={{ cursor: "pointer" }}
                          onClick={() => setSelectedPoint(payload.full)}
                        />
                      );
                    }}
                    activeDot={{ r: 7, onClick: (_, payload) => setSelectedPoint(payload?.payload?.full) }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}

            {/* Log input */}
            <div className="flex gap-2">
              <Input
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                placeholder="Today's weight (kg)"
                type="number"
                className="bg-secondary border-border flex-1 h-9 text-sm"
              />
              <label className="h-9 w-9 flex items-center justify-center rounded-xl bg-secondary border border-border cursor-pointer flex-shrink-0 hover:border-primary/40 transition-colors">
                <Camera className="h-4 w-4 text-muted-foreground"/>
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) setWeightPhoto({ file: f, previewUrl: URL.createObjectURL(f) });
                  e.target.value = "";
                }}/>
              </label>
              <Button
                size="sm"
                onClick={() => logWeightMutation.mutate({ kg: parseFloat(weightInput), photoFile: weightPhoto?.file })}
                disabled={!weightInput || logWeightMutation.isPending}
                className="h-9 rounded-xl font-heading"
              >
                {logWeightMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : "Log"}
              </Button>
            </div>

            {/* Photo preview */}
            {weightPhoto && (
              <div className="relative rounded-xl overflow-hidden h-24">
                <img src={weightPhoto.previewUrl} alt="progress" className="w-full h-full object-cover"/>
                <button onClick={() => setWeightPhoto(null)} className="absolute top-1.5 right-1.5 bg-black/60 rounded-full p-1">
                  <XIcon className="h-3 w-3 text-white"/>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Weight point popup */}
        {selectedPoint && (
          <Dialog open onOpenChange={() => setSelectedPoint(null)}>
            <DialogContent className="bg-card border-border max-w-xs">
              <DialogHeader>
                <DialogTitle className="font-heading text-sm">{selectedPoint.date} — {selectedPoint.weight_kg} kg</DialogTitle>
              </DialogHeader>
              {selectedPoint.photo_url
                ? <img src={selectedPoint.photo_url} alt="progress" className="w-full rounded-xl object-cover max-h-72"/>
                : <p className="text-sm text-muted-foreground text-center py-6">No photo for this entry.</p>
              }
            </DialogContent>
          </Dialog>
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

        {/* Subscription management — only for verified pro users */}
        <div className="w-full mt-4">
          {isPremium && (
            <button
              onClick={() => setManageOpen(true)}
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
            <Settings className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">Restore Purchases</span>
          </button>
          {blockedUsers.length > 0 && (
            <div className="w-full mt-2 mb-1">
              <p className="text-xs text-muted-foreground font-medium px-3 mb-1">Blocked Users</p>
              {blockedUsers.map(b => (
                <div key={b.blocked_user_id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-secondary transition-colors">
                  <div className="h-8 w-8 rounded-full bg-secondary overflow-hidden flex-shrink-0">
                    {b.profile?.profile_image
                      ? <img src={b.profile.profile_image} alt="" className="w-full h-full object-cover"/>
                      : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">{(b.profile?.full_name||"?")[0]?.toUpperCase()}</div>
                    }
                  </div>
                  <span className="flex-1 text-sm">{b.profile?.full_name || "Unknown user"}</span>
                  <button onClick={() => handleUnblock(b.blocked_user_id)} className="text-xs text-primary font-medium px-3 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
                    Unblock
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setDeleteOpen(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-destructive/10 transition-colors text-left"
          >
            <Trash2 className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium text-destructive">Delete Account</span>
          </button>
          <div className="flex gap-4 px-3 pt-1 pb-2 flex-wrap">
            <a href="https://doc-hosting.flycricket.io/tribe-privacy-policy/7e096891-025c-41fc-8151-f9a99d5c962f/privacy" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a>
            <span className="text-xs text-muted-foreground">·</span>
            <a href="https://doc-hosting.flycricket.io/tribe-terms-of-use/62be134f-66f3-4e9c-9ccf-3e5070a1cf81/terms" target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms of Use</a>
            <span className="text-xs text-muted-foreground">·</span>
            <a href="mailto:support@tribe.fit" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Contact Support</a>
          </div>
        </div>

        {posts.length > 0 && <div className="w-full mt-6"><p className="text-xs text-muted-foreground font-heading font-medium uppercase tracking-wider mb-3">Your Posts</p><div className="grid grid-cols-3 gap-1.5">{posts.filter(p => p.media_url).map(p => <div key={p.id} className="aspect-square rounded-xl overflow-hidden bg-secondary">{p.media_type==="video" ? <video src={p.media_url} className="w-full h-full object-cover" preload="metadata"/> : <img src={p.media_url} alt="" className="w-full h-full object-cover"/>}</div>)}</div></div>}
      </div>
      {/* Manage Subscription sheet — only reachable if isPremium is true */}
      {manageOpen && isPremium && (
        <>
          <div className="fixed inset-0 z-[59] bg-black/50" onClick={() => setManageOpen(false)}/>
          <div className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-2xl border-t border-border p-5 pb-10 max-w-lg mx-auto">
            <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5"/>
            <p className="font-heading font-bold text-base mb-1">Manage Subscription</p>
            <p className="text-xs text-muted-foreground mb-4">Your Tribe Pro subscription is active. If you cancel, you keep access until the end of the current billing period.</p>
            <button
              className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-destructive/10 hover:bg-destructive/20 transition-colors text-left"
              onClick={async () => {
                setManageOpen(false);
                const { Browser } = await import('@capacitor/browser');
                const { Capacitor } = await import('@capacitor/core');
                const url = Capacitor.getPlatform() === 'android'
                  ? 'https://play.google.com/store/account/subscriptions'
                  : 'https://apps.apple.com/account/subscriptions';
                await Browser.open({ url });
              }}
            >
              <XIcon className="h-5 w-5 text-destructive flex-shrink-0"/>
              <div>
                <p className="text-sm font-medium text-destructive">Cancel Subscription</p>
                <p className="text-xs text-muted-foreground">Opens your device's subscription settings</p>
              </div>
            </button>
          </div>
        </>
      )}

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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive">Delete Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              This permanently deletes your account and all your data — workouts, meals, posts, tribes, and progress photos. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={handleDeleteAccount} disabled={deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : null}Delete
              </Button>
            </div>
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
