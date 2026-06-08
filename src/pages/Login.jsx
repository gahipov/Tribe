import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { signInWithApple } from "@/lib/appleAuth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); }
    else navigate("/");
  };

  const handleGoogle = async () => {
    const { Capacitor } = await import('@capacitor/core');
    const redirectTo = Capacitor.isNativePlatform()
      ? 'com.tribe.fitness://login'
      : window.location.origin;
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  };

  const handleApple = async () => {
    setError("");
    setLoading(true);
    try {
      await signInWithApple();
      navigate("/");
    } catch (e) {
      setError(e.message || "Apple Sign In failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout icon={LogIn} title="Welcome back" subtitle="Log in to your account"
      footer={<>Don't have an account? <Link to="/register" className="text-primary font-medium hover:underline">Create one</Link></>}>
      <Button variant="outline" className="w-full h-12 text-sm font-medium mb-3" onClick={handleGoogle}>
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continue with Google
      </Button>
      <Button variant="outline" className="w-full h-12 text-sm font-medium mb-6" onClick={handleApple} disabled={loading}>
        <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.39.07 2.35.74 3.15.8 1.2-.22 2.35-.93 3.62-.84 1.54.13 2.7.77 3.44 1.94-3.13 1.87-2.39 5.98.53 7.14-.62 1.61-1.44 3.21-2.74 3.82zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
        Continue with Apple
      </Button>
      <div className="relative mb-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"/></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-3 text-muted-foreground">or</span></div></div>
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="email">Email</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input id="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className="pl-10 h-12" required/></div></div>
        <div className="space-y-2">
          <div className="flex items-center justify-between"><Label htmlFor="password">Password</Label><Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link></div>
          <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/><Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="pl-10 h-12" required/></div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/>Logging in...</> : "Log in"}</Button>
      </form>
    </AuthLayout>
  );
}
