import { supabase } from "@/api/supabaseClient";

export async function signInWithApple() {
  const { Capacitor } = await import('@capacitor/core');
  const redirectTo = Capacitor.isNativePlatform()
    ? 'com.tribe.fitness://login'
    : window.location.origin;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo },
  });

  if (error) throw error;
}
