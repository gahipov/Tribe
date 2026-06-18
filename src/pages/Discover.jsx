import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { useState, useEffect } from "react";
import { Loader2, MapPin, Users, Search, Navigation, Shield, Plus, X, UserPlus, Check, MessageCircle, CalendarDays, Clock, Dumbbell, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import BuddyCard from "../components/BuddyCard";
import TribeChat from "../components/TribeChat";
import { toast } from "sonner";

function haversineKm(lat1, lon1, lat2, lon2) {
  const R=6371, dLat=((lat2-lat1)*Math.PI)/180, dLon=((lon2-lon1)*Math.PI)/180;
  const a=Math.sin(dLat/2)**2+Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function distanceLabel(km) { if(km<1) return Math.round(km*1000)+"m away"; if(km<10) return km.toFixed(1)+"km away"; return Math.round(km)+"km away"; }
const RADIUS_OPTIONS=[5,15,50,999], RADIUS_LABELS=["5km","15km","50km","Any"];

export default function Discover() {
  const { user } = useAuth();
  const [tab, setTab] = useState("buddies");
  const [search, setSearch] = useState("");
  const [sentRequests, setSentRequests] = useState(new Set());
  const [myLocation, setMyLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(false);
  const [radiusKm, setRadiusKm] = useState(999);
  const [tribeForm, setTribeForm] = useState({ name: "", description: "", gym_name: "" });
  const [tribeDialogOpen, setTribeDialogOpen] = useState(false);
  const [joinedTribes, setJoinedTribes] = useState(new Set());
  const [selectedTribe, setSelectedTribe] = useState(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ title: "", description: "", gym_name: "", event_date: "", event_time: "" });
  const [rsvpedEvents, setRsvpedEvents] = useState(new Set());
  const [connectPending, setConnectPending] = useState(null);
  const [connectMessage, setConnectMessage] = useState("Hey! Let's hit the gym together.");
  const [inviteBuddy, setInviteBuddy] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => { if (user?.lat && user?.lng) setMyLocation({ lat: user.lat, lng: user.lng }); }, [user]);

  const shareLocation = async () => {
    setLocLoading(true);
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
      const { latitude: lat, longitude: lng } = pos.coords;
      setMyLocation({ lat, lng });
      await supabase.from('profiles').update({ lat, lng }).eq('id', user.id);
      toast.success("Location shared!");
    } catch {
      toast.error("Couldn't get location. Please allow location access.");
    } finally {
      setLocLoading(false);
    }
  };

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => { const { data } = await supabase.from('profiles').select('*'); return data || []; },
  });

  const { data: existingRequests = [] } = useQuery({
    queryKey: ["buddy-requests"],
    queryFn: async () => { const { data } = await supabase.from('buddy_requests').select('*').eq('from_user_id', user.id); return data || []; },
    enabled: !!user,
  });

  const { data: incomingRequests = [] } = useQuery({
    queryKey: ["incoming-buddy-requests"],
    queryFn: async () => {
      const { data: reqs } = await supabase.from('buddy_requests').select('*').eq('to_user_email', user.email).eq('status', 'pending');
      if (!reqs?.length) return [];
      const senderIds = reqs.map(r => r.from_user_id);
      const { data: senderProfiles } = await supabase.from('profiles').select('id, full_name, profile_image, gym_name').in('id', senderIds);
      const profileMap = Object.fromEntries((senderProfiles || []).map(p => [p.id, p]));
      return reqs.map(r => ({ ...r, profiles: profileMap[r.from_user_id] || null }));
    },
    enabled: !!user,
  });

  const acceptRequestMutation = useMutation({
    mutationFn: async (id) => {
      await supabase.from('buddy_requests').update({ status: 'accepted' }).eq('id', id).eq('to_user_email', user.email);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incoming-buddy-requests"] });
      queryClient.invalidateQueries({ queryKey: ["accepted-buddies"] });
      toast.success("Request accepted!");
    },
  });

  const declineRequestMutation = useMutation({
    mutationFn: async (id) => {
      await supabase.from('buddy_requests').update({ status: 'declined' }).eq('id', id).eq('to_user_email', user.email);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["incoming-buddy-requests"] }); toast.success("Request declined"); },
  });

  const { data: acceptedBuddies = [] } = useQuery({
    queryKey: ["accepted-buddies"],
    queryFn: async () => {
      const [{ data: sent }, { data: received }] = await Promise.all([
        supabase.from('buddy_requests').select('to_user_email').eq('from_user_id', user.id).eq('status', 'accepted'),
        supabase.from('buddy_requests').select('from_user_id').eq('to_user_email', user.email).eq('status', 'accepted'),
      ]);
      const emails = (sent || []).map(r => r.to_user_email);
      const ids = (received || []).map(r => r.from_user_id);
      const all = [];
      if (emails.length) { const { data } = await supabase.from('profiles').select('*').in('email', emails); all.push(...(data || [])); }
      if (ids.length)   { const { data } = await supabase.from('profiles').select('*').in('id', ids);    all.push(...(data || [])); }
      return [...new Map(all.map(p => [p.id, p])).values()];
    },
    enabled: !!user,
  });

  useEffect(() => { if (existingRequests.length > 0) setSentRequests(new Set(existingRequests.map(r => r.to_user_email))); }, [existingRequests]);

  const connectMutation = useMutation({
    mutationFn: async ({ profile, message }) => {
      const { error } = await supabase.from('buddy_requests').insert({
        from_user_id: user.id,
        to_user_email: profile.email,
        to_user_name: profile.full_name || profile.email,
        status: "pending",
        message,
      });
      if (error) throw error;
    },
    onSuccess: (_, { profile }) => {
      setSentRequests(prev => new Set([...prev, profile.email]));
      queryClient.invalidateQueries({ queryKey: ["buddy-requests"] });
      setConnectPending(null);
      setConnectMessage("Hey! Let's hit the gym together.");
      toast.success("Connection request sent!");
    },
  });

  const usersWithDistance = profiles.filter(p => p.id !== user?.id)
    .map(p => ({ ...p, distance: (myLocation && p.lat && p.lng) ? haversineKm(myLocation.lat, myLocation.lng, p.lat, p.lng) : null }))
    .filter(p => { if (myLocation && p.lat && p.lng && p.distance > radiusKm) return false; if (!search) return true; const q=search.toLowerCase(); return p.full_name?.toLowerCase().includes(q)||p.city?.toLowerCase().includes(q)||p.gym_name?.toLowerCase().includes(q)||p.fitness_interests?.some(i=>i.toLowerCase().includes(q)); })
    .sort((a,b) => { if(a.distance!==null&&b.distance!==null) return a.distance-b.distance; if(a.distance!==null) return -1; if(b.distance!==null) return 1; return 0; });

  const nearbyCount = usersWithDistance.filter(u => u.distance!==null && u.distance<=15).length;

  // Tribes
  const { data: tribes = [], isLoading: tribesLoading } = useQuery({
    queryKey: ["tribes"],
    queryFn: async () => { const { data } = await supabase.from("tribes").select("*").order("member_count", { ascending: false }); return data || []; },
  });
  const { data: myMemberships = [] } = useQuery({
    queryKey: ["tribe-members-me"],
    queryFn: async () => { const { data } = await supabase.from("tribe_members").select("tribe_id").eq("user_id", user.id); return data || []; },
    enabled: !!user,
  });
  useEffect(() => { if (myMemberships.length) setJoinedTribes(new Set(myMemberships.map(m => m.tribe_id))); }, [myMemberships]);

  const createTribeMutation = useMutation({
    mutationFn: async () => {
      const { data: tribe, error } = await supabase.from("tribes").insert({ name: tribeForm.name, description: tribeForm.description, gym_name: tribeForm.gym_name, creator_id: user.id }).select().single();
      if (error) throw error;
      await supabase.from("tribe_members").insert({ tribe_id: tribe.id, user_id: user.id });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["tribes"] }); queryClient.invalidateQueries({ queryKey: ["tribe-members-me"] }); toast.success("Tribe created!"); setTribeForm({ name: "", description: "", gym_name: "" }); setTribeDialogOpen(false); },
    onError: (err) => toast.error("Failed: " + (err?.message || JSON.stringify(err))),
  });

  const joinTribeMutation = useMutation({
    mutationFn: async (tribeId) => {
      const { error } = await supabase.from("tribe_members").insert({ tribe_id: tribeId, user_id: user.id });
      if (error) throw error;
      // member_count updated by DB trigger
    },
    onSuccess: (_, tribeId) => { setJoinedTribes(prev => new Set([...prev, tribeId])); queryClient.invalidateQueries({ queryKey: ["tribes"] }); toast.success("Joined tribe!"); },
    onError: () => toast.error("Failed to join tribe"),
  });

  const leaveTribeMutation = useMutation({
    mutationFn: async (tribeId) => {
      await supabase.from("tribe_members").delete().eq("tribe_id", tribeId).eq("user_id", user.id);
      // member_count updated by DB trigger
    },
    onSuccess: (_, tribeId) => { setJoinedTribes(prev => { const n=new Set(prev); n.delete(tribeId); return n; }); queryClient.invalidateQueries({ queryKey: ["tribes"] }); toast.success("Left tribe"); },
    onError: () => toast.error("Failed to leave tribe"),
  });

  // Events
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["workout_events"],
    queryFn: async () => {
      const { data } = await supabase.from("workout_events").select("*, workout_event_rsvps(user_id, user_name, user_image)").gte("event_date", new Date().toISOString()).order("event_date", { ascending: true });
      return data || [];
    },
  });

  const { data: myRsvps = [] } = useQuery({
    queryKey: ["my_rsvps"],
    queryFn: async () => { const { data } = await supabase.from("workout_event_rsvps").select("event_id").eq("user_id", user.id); return data || []; },
    enabled: !!user,
  });
  useEffect(() => { if (myRsvps.length) setRsvpedEvents(new Set(myRsvps.map(r => r.event_id))); }, [myRsvps]);

  const createEventMutation = useMutation({
    mutationFn: async () => {
      const event_date = new Date(`${eventForm.event_date}T${eventForm.event_time || "09:00"}`).toISOString();
      const { error } = await supabase.from("workout_events").insert({ title: eventForm.title, description: eventForm.description, gym_name: eventForm.gym_name, event_date, creator_id: user.id, creator_name: user.full_name || user.email, creator_image: user.profile_image || "" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workout_events"] });
      toast.success(inviteBuddy ? `Event created! ${inviteBuddy.full_name || "Your buddy"} can see it in Events.` : "Event created!");
      setEventForm({ title: "", description: "", gym_name: "", event_date: "", event_time: "" });
      setEventDialogOpen(false);
      setInviteBuddy(null);
    },
    onError: (e) => toast.error("Failed: " + e.message),
  });

  const rsvpMutation = useMutation({
    mutationFn: async (eventId) => {
      const { error } = await supabase.from("workout_event_rsvps").insert({ event_id: eventId, user_id: user.id, user_name: user.full_name || user.email, user_image: user.profile_image || "" });
      if (error) throw error;
    },
    onSuccess: (_, eventId) => { setRsvpedEvents(prev => new Set([...prev, eventId])); queryClient.invalidateQueries({ queryKey: ["workout_events"] }); toast.success("You're in!"); },
  });

  const cancelRsvpMutation = useMutation({
    mutationFn: async (eventId) => {
      await supabase.from("workout_event_rsvps").delete().eq("event_id", eventId).eq("user_id", user.id);
    },
    onSuccess: (_, eventId) => { setRsvpedEvents(prev => { const n = new Set(prev); n.delete(eventId); return n; }); queryClient.invalidateQueries({ queryKey: ["workout_events"] }); toast.success("RSVP cancelled"); },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId) => { await supabase.from("workout_events").delete().eq("id", eventId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["workout_events"] }); toast.success("Event deleted"); },
  });

  return (
    <div className="max-w-lg mx-auto">
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 py-4 border-b border-border">
        <h1 className="font-display text-xl font-bold tracking-tight mb-3">Discover</h1>
        <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-3">
          {[{id:"buddies",label:"Buddies",Icon:Users},{id:"tribes",label:"Tribes",Icon:Shield},{id:"events",label:"Events",Icon:CalendarDays}].map(({id,label,Icon})=>(
            <button key={id} onClick={()=>setTab(id)} className={"flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-sm font-heading font-medium transition-colors relative "+(tab===id?"bg-primary text-primary-foreground":"text-muted-foreground")}>
              <Icon className="h-3.5 w-3.5"/>{label}
              {id === "buddies" && incomingRequests.length > 0 && (
                <span className="absolute top-0.5 right-2 h-4 w-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">{incomingRequests.length}</span>
              )}
            </button>
          ))}
        </div>
        {tab === "buddies" && !myLocation ? (
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-3 mb-3">
            <Navigation className="h-5 w-5 text-primary flex-shrink-0"/>
            <div className="flex-1 min-w-0"><p className="text-xs font-heading font-semibold">Share your location</p><p className="text-[11px] text-muted-foreground">Find people training near you</p></div>
            <Button size="sm" onClick={shareLocation} disabled={locLoading} className="rounded-full h-7 text-xs flex-shrink-0">{locLoading ? <Loader2 className="h-3 w-3 animate-spin"/> : "Enable"}</Button>
          </div>
        ) : tab === "buddies" ? (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-full"><MapPin className="h-3 w-3"/><span>{nearbyCount>0 ? nearbyCount+" people nearby" : "Location active"}</span></div>
            <div className="flex gap-1 ml-auto">{RADIUS_OPTIONS.map((r,i) => <button key={r} onClick={() => setRadiusKm(r)} className={"text-[11px] px-2 py-1 rounded-full font-heading font-medium transition-colors "+(radiusKm===r?"bg-primary text-primary-foreground":"bg-secondary text-muted-foreground")}>{RADIUS_LABELS[i]}</button>)}</div>
          </div>
        ) : null}
        {tab === "buddies" && (
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/><Input placeholder="Search by name, city, or interest..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 bg-secondary border-border"/></div>
        )}
      </div>

      {/* Buddies tab */}
      {tab === "buddies" && (
        <div className="p-4 space-y-3">
          {/* My Buddies */}
          {acceptedBuddies.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-heading font-bold text-muted-foreground uppercase tracking-wider">My Buddies · {acceptedBuddies.length}</p>
              {acceptedBuddies.map(buddy => (
                <div key={buddy.id} className="bg-card rounded-2xl border border-primary/20 p-3 flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-primary/10 flex-shrink-0 overflow-hidden">
                    {buddy.profile_image
                      ? <img src={buddy.profile_image} className="w-full h-full object-cover" alt=""/>
                      : <div className="w-full h-full flex items-center justify-center text-primary font-bold">{(buddy.full_name||"?")[0]}</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-heading font-semibold truncate">{buddy.full_name || buddy.email}</p>
                    {(buddy.city || buddy.gym_name) && (
                      <p className="text-[11px] text-muted-foreground truncate">{[buddy.city, buddy.gym_name].filter(Boolean).join(" · ")}</p>
                    )}
                    {buddy.fitness_interests?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {buddy.fitness_interests.slice(0,2).map(i => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{i}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setInviteBuddy(buddy);
                      setEventForm(f => ({ ...f, title: `Workout with ${buddy.full_name || "buddy"}`, gym_name: buddy.gym_name || "" }));
                      setEventDialogOpen(true);
                      setTab("events");
                    }}
                    className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-heading font-semibold"
                  >
                    <Dumbbell className="h-3 w-3"/>Invite
                  </button>
                </div>
              ))}
              <div className="h-px bg-border"/>
            </div>
          )}

          {/* Incoming requests */}
          {incomingRequests.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-heading font-bold text-muted-foreground uppercase tracking-wider">Connection Requests · {incomingRequests.length}</p>
              {incomingRequests.map(req => {
                const sender = req.profiles;
                return (
                  <div key={req.id} className="bg-card rounded-2xl border border-primary/20 p-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {sender?.profile_image ? <img src={sender.profile_image} className="w-full h-full object-cover"/> : <Users className="h-5 w-5 text-primary"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-heading font-semibold truncate">{sender?.full_name || "Someone"}</p>
                      {sender?.gym_name && <p className="text-[11px] text-muted-foreground truncate">{sender.gym_name}</p>}
                      <p className="text-[11px] text-muted-foreground italic truncate">{req.message}</p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button onClick={() => acceptRequestMutation.mutate(req.id)} className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Check className="h-4 w-4"/></button>
                      <button onClick={() => declineRequestMutation.mutate(req.id)} className="h-8 w-8 rounded-full bg-secondary text-muted-foreground flex items-center justify-center"><X className="h-4 w-4"/></button>
                    </div>
                  </div>
                );
              })}
              <div className="h-px bg-border"/>
            </div>
          )}
          {isLoading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>
          : usersWithDistance.length===0 ? <div className="text-center py-20"><div className="h-20 w-20 rounded-full bg-secondary mx-auto flex items-center justify-center mb-4"><Users className="h-10 w-10 text-primary/50"/></div><h3 className="font-heading font-semibold text-lg">No buddies found</h3><p className="text-sm text-muted-foreground mt-1">{myLocation&&radiusKm<999?"Try a wider radius":search?"Try a different search":"Invite friends to grow your tribe"}</p></div>
          : usersWithDistance.map(profile => (
            <div key={profile.id} className="relative">
              {profile.distance!==null && <div className="absolute top-3 right-12 z-10 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] font-heading font-medium text-primary border border-border"><MapPin className="h-2.5 w-2.5"/>{distanceLabel(profile.distance)}</div>}
              <BuddyCard user={profile} onConnect={p => { setConnectMessage("Hey! Let's hit the gym together."); setConnectPending(p); }} connected={sentRequests.has(profile.email)}/>
            </div>
          ))}
        </div>
      )}

      {/* Tribes tab */}
      {tab === "tribes" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{tribes.length} tribe{tribes.length!==1?"s":""} available</p>
            <Dialog open={tribeDialogOpen} onOpenChange={setTribeDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full font-heading"><Plus className="h-4 w-4 mr-1"/>Create Tribe</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-sm">
                <DialogHeader><DialogTitle className="font-heading">Create a Tribe</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <div><Label className="text-xs text-muted-foreground mb-1.5 block">Name *</Label><Input value={tribeForm.name} onChange={e=>setTribeForm(f=>({...f,name:e.target.value}))} placeholder="Beast Mode Squad" className="bg-secondary border-border"/></div>
                  <div><Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label><Textarea value={tribeForm.description} onChange={e=>setTribeForm(f=>({...f,description:e.target.value}))} placeholder="What your tribe is about..." className="bg-secondary border-border resize-none" rows={2}/></div>
                  <div><Label className="text-xs text-muted-foreground mb-1.5 block">Gym (optional)</Label><Input value={tribeForm.gym_name} onChange={e=>setTribeForm(f=>({...f,gym_name:e.target.value}))} placeholder="Gold's Gym, Planet Fitness..." className="bg-secondary border-border"/></div>
                  <Button onClick={()=>createTribeMutation.mutate()} disabled={!tribeForm.name.trim()||createTribeMutation.isPending} className="w-full font-heading">
                    {createTribeMutation.isPending?<Loader2 className="h-4 w-4 animate-spin mr-2"/>:null}Create Tribe
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {tribesLoading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>
          : tribes.length===0 ? (
            <div className="text-center py-20">
              <Shield className="h-16 w-16 text-primary/20 mx-auto mb-3"/>
              <h3 className="font-heading font-semibold">No tribes yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Be the first to create one</p>
            </div>
          ) : tribes.map(tribe => {
            const isMember = joinedTribes.has(tribe.id);
            const isCreator = tribe.creator_id === user?.id;
            return (
              <div key={tribe.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                {/* Tappable body */}
                <button className="w-full p-4 text-left" onClick={() => setSelectedTribe(tribe)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Shield className="h-4 w-4 text-primary"/>
                        </div>
                        <div>
                          <p className="font-heading font-bold text-sm">{tribe.name}</p>
                          {tribe.gym_name && <p className="text-[11px] text-muted-foreground">{tribe.gym_name}</p>}
                        </div>
                      </div>
                      {tribe.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{tribe.description}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3"/>{tribe.member_count||1} member{(tribe.member_count||1)!==1?"s":""}</span>
                        <span className="flex items-center gap-1 text-xs text-primary/70"><MessageCircle className="h-3 w-3"/>Open chat</span>
                        {isCreator && <span className="text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded-full">Creator</span>}
                      </div>
                    </div>
                  </div>
                </button>
                {/* Actions row */}
                <div className="flex items-center gap-2 px-4 pb-3">
                  {!isCreator ? (
                    <button
                      onClick={e => { e.stopPropagation(); isMember ? leaveTribeMutation.mutate(tribe.id) : joinTribeMutation.mutate(tribe.id); }}
                      className={"flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-semibold transition-colors " + (isMember ? "bg-secondary text-muted-foreground hover:text-destructive" : "bg-primary text-primary-foreground")}
                    >
                      {isMember ? <><X className="h-3 w-3"/>Leave</> : <><UserPlus className="h-3 w-3"/>Join</>}
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-primary"><Check className="h-3.5 w-3.5"/>Member</span>
                  )}
                  {isMember && (
                    <button
                      onClick={() => setSelectedTribe(tribe)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-heading font-medium bg-secondary text-foreground"
                    >
                      <MessageCircle className="h-3 w-3"/>Chat
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Events tab */}
      {tab === "events" && (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{events.length} upcoming event{events.length !== 1 ? "s" : ""}</p>
            <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full font-heading"><Plus className="h-4 w-4 mr-1"/>Create Event</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border max-w-sm" onOpenChange={open => { if (!open) setInviteBuddy(null); }}>
                <DialogHeader>
                  <DialogTitle className="font-heading">
                    {inviteBuddy ? `Invite ${inviteBuddy.full_name || "buddy"} to Workout` : "New Workout Event"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div><Label className="text-xs text-muted-foreground mb-1.5 block">Title *</Label><Input value={eventForm.title} onChange={e=>setEventForm(f=>({...f,title:e.target.value}))} placeholder="Chest & Back Session" className="bg-secondary border-border"/></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs text-muted-foreground mb-1.5 block">Date *</Label><Input type="date" value={eventForm.event_date} onChange={e=>setEventForm(f=>({...f,event_date:e.target.value}))} className="bg-secondary border-border"/></div>
                    <div><Label className="text-xs text-muted-foreground mb-1.5 block">Time</Label><Input type="time" value={eventForm.event_time} onChange={e=>setEventForm(f=>({...f,event_time:e.target.value}))} className="bg-secondary border-border"/></div>
                  </div>
                  <div><Label className="text-xs text-muted-foreground mb-1.5 block">Gym / Location</Label><Input value={eventForm.gym_name} onChange={e=>setEventForm(f=>({...f,gym_name:e.target.value}))} placeholder="Gold's Gym, Venice" className="bg-secondary border-border"/></div>
                  <div><Label className="text-xs text-muted-foreground mb-1.5 block">Description</Label><Textarea value={eventForm.description} onChange={e=>setEventForm(f=>({...f,description:e.target.value}))} placeholder="What's the plan? All levels welcome!" className="bg-secondary border-border resize-none" rows={2}/></div>
                  <Button onClick={()=>createEventMutation.mutate()} disabled={!eventForm.title.trim()||!eventForm.event_date||createEventMutation.isPending} className="w-full font-heading">
                    {createEventMutation.isPending?<Loader2 className="h-4 w-4 animate-spin mr-2"/>:null}Create Event
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {eventsLoading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary"/></div>
          : events.length === 0 ? (
            <div className="text-center py-20">
              <CalendarDays className="h-16 w-16 text-primary/20 mx-auto mb-3"/>
              <h3 className="font-heading font-semibold">No events yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Create the first group workout</p>
            </div>
          ) : events.map(event => {
            const isGoing = rsvpedEvents.has(event.id);
            const isCreator = event.creator_id === user?.id;
            const date = new Date(event.event_date);
            const rsvps = event.workout_event_rsvps || [];
            const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
            const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            return (
              <div key={event.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Dumbbell className="h-4 w-4 text-primary"/>
                        </div>
                        <div>
                          <p className="font-heading font-bold text-sm">{event.title}</p>
                          <p className="text-[11px] text-muted-foreground">by {event.creator_name}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="flex items-center gap-1 text-xs text-foreground bg-secondary px-2 py-1 rounded-full"><CalendarDays className="h-3 w-3 text-primary"/>{dateStr}</span>
                        <span className="flex items-center gap-1 text-xs text-foreground bg-secondary px-2 py-1 rounded-full"><Clock className="h-3 w-3 text-primary"/>{timeStr}</span>
                        {event.gym_name && <span className="flex items-center gap-1 text-xs text-foreground bg-secondary px-2 py-1 rounded-full"><MapPin className="h-3 w-3 text-primary"/>{event.gym_name}</span>}
                      </div>
                      {event.description && <p className="text-xs text-muted-foreground mt-2">{event.description}</p>}
                      {rsvps.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-3">
                          <div className="flex -space-x-1.5">
                            {rsvps.slice(0,4).map((r,i) => (
                              <div key={i} className="h-6 w-6 rounded-full bg-primary/20 border-2 border-card flex items-center justify-center text-[9px] font-bold text-primary overflow-hidden">
                                {r.user_image ? <img src={r.user_image} className="w-full h-full object-cover"/> : (r.user_name?.[0]||"?")}
                              </div>
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">{rsvps.length} going{rsvps.length > 4 ? ` · +${rsvps.length - 4} more` : ""}</span>
                        </div>
                      )}
                    </div>
                    {isCreator && (
                      <button onClick={() => deleteEventMutation.mutate(event.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1"><X className="h-4 w-4"/></button>
                    )}
                  </div>
                </div>
                <div className="px-4 pb-4">
                  {!isCreator ? (
                    <button
                      onClick={() => isGoing ? cancelRsvpMutation.mutate(event.id) : rsvpMutation.mutate(event.id)}
                      className={"w-full py-2 rounded-xl text-sm font-heading font-semibold transition-colors " + (isGoing ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground")}
                    >
                      {isGoing ? "✓ You're Going · Cancel" : "I'm In"}
                    </button>
                  ) : (
                    <div className="text-center text-xs text-muted-foreground py-1">Your event · {rsvps.length} RSVP{rsvps.length !== 1 ? "s" : ""}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TribeChat tribe={selectedTribe} open={!!selectedTribe} onClose={() => setSelectedTribe(null)} />

      {/* Connect with message sheet */}
      {connectPending && (
        <>
          <div className="fixed inset-0 z-[59] bg-black/50" onClick={() => setConnectPending(null)}/>
          <div className="fixed bottom-0 left-0 right-0 z-[60] bg-card rounded-t-2xl border-t border-border p-5 pb-8 max-w-lg mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 overflow-hidden flex-shrink-0">
                {connectPending.profile_image
                  ? <img src={connectPending.profile_image} className="w-full h-full object-cover" alt=""/>
                  : <div className="w-full h-full flex items-center justify-center text-primary font-bold">{(connectPending.full_name||"?")[0]}</div>}
              </div>
              <div>
                <p className="font-heading font-semibold text-sm">{connectPending.full_name || connectPending.email}</p>
                <p className="text-[11px] text-muted-foreground">Send a connection request</p>
              </div>
            </div>
            <Textarea
              value={connectMessage}
              onChange={e => setConnectMessage(e.target.value)}
              placeholder="Write a message..."
              className="bg-secondary border-border resize-none mb-3"
              rows={3}
              maxLength={200}
            />
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1 font-heading" onClick={() => setConnectPending(null)}>Cancel</Button>
              <Button
                className="flex-1 font-heading"
                disabled={!connectMessage.trim() || connectMutation.isPending}
                onClick={() => connectMutation.mutate({ profile: connectPending, message: connectMessage.trim() })}
              >
                {connectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1"/> : null}Send Request
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
