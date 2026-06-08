import { supabase } from "@/api/supabaseClient";

export async function signInWithApple() {
  const { Capacitor } = await import('@capacitor/core');

  if (Capacitor.getPlatform() === 'ios') {
    const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');

    const rawNonce = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const msgBuffer = new TextEncoder().encode(rawNonce);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashedNonce = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    const result = await SignInWithApple.authorize({
      clientId: 'com.tribe.fitness',
      redirectURI: 'https://tsndjmqjobttmzqwffnz.supabase.co/auth/v1/callback',
      scopes: 'email name',
      nonce: hashedNonce,
    });

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: result.response.identityToken,
      nonce: rawNonce,
    });

    if (error) throw error;
  } else {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }
}
