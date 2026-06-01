import { MapPin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export default function BuddyCard({ user, onConnect, connected }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex items-center gap-4">
      <div className="h-14 w-14 rounded-full bg-secondary overflow-hidden flex-shrink-0">
        {user.profile_image ? <img src={user.profile_image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-primary font-heading font-bold text-lg">{(user.full_name || user.email || "?")[0]?.toUpperCase()}</div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-heading font-semibold text-foreground truncate">{user.full_name || user.email}</p>
        {user.city && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" /> {user.city}{user.gym_name && <span>· {user.gym_name}</span>}</p>}
        {user.fitness_interests?.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{user.fitness_interests.slice(0, 3).map(i => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{i}</span>)}</div>}
      </div>
      <Button size="sm" variant={connected ? "secondary" : "default"} onClick={() => onConnect(user)} disabled={connected} className={cn("rounded-full font-heading text-xs", connected && "opacity-60")}>
        {connected ? "Sent" : <><Send className="h-3.5 w-3.5 mr-1" /> Connect</>}
      </Button>
    </div>
  );
}
