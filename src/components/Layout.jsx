import { Outlet, Link, useLocation } from "react-router-dom";
import { Home, Dumbbell, UtensilsCrossed, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";
import UploadBanner from "@/components/UploadBanner";

const navItems = [
  { path: "/",          icon: Home,            label: "Feed",      tour: "feed"      },
  { path: "/workouts",  icon: Dumbbell,        label: "Workouts",  tour: "workouts"  },
  { path: "/nutrition", icon: UtensilsCrossed, label: "Nutrition", tour: "nutrition" },
  { path: "/discover",  icon: Users,           label: "Discover",  tour: null        },
  { path: "/profile",   icon: User,            label: "Profile",   tour: "profile"   },
];

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="bg-background flex flex-col overflow-hidden" style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)" }}>
      <main className={pathname === "/" ? "flex-1 overflow-hidden" : "flex-1 overflow-y-auto pb-20"}>
        <Outlet />
      </main>
      <UploadBanner />
      <nav className="bg-card/95 backdrop-blur-xl border-t border-border z-50 flex-shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-lg mx-auto flex items-center justify-around py-2 px-2">
          {navItems.map(({ path, icon: Icon, label, tour }) => {
            const active = path === "/" ? pathname === "/" : pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                data-tour={tour || undefined}
                className={cn("flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_hsl(175,85%,50%)]")} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
