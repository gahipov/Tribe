import React from "react";
import { supabase } from "@/api/supabaseClient";

export default function UserNotRegisteredError() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-background p-6">
      <div className="max-w-md w-full p-8 bg-card rounded-2xl border border-border text-center">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-4">Access Restricted</h1>
        <p className="text-muted-foreground mb-6">You are not registered to use this application.</p>
        <button onClick={() => supabase.auth.signOut()} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-heading font-medium">Sign Out</button>
      </div>
    </div>
  );
}
