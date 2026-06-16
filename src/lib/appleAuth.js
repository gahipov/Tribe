import { supabase } from "@/api/supabaseClient";

// Runs the OAuth flow in an in-app browser (SFSafariViewController on iOS)
// instead of handing off to the system Safari app. Apple rejects apps that
// bounce users out to Safari for sign-in — this keeps them inside Tribe.
async function oauthSignIn(provider) {
  const { Capacitor } = await import('@capacitor/core');

  if (!Capacitor.isNativePlatform()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return;
  }

  const { Browser } = await import('@capacitor/browser');
  const { App: CapApp } = await import('@capacitor/app');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: 'com.tribe.fitness://login', skipBrowserRedirect: true },
  });
  if (error) throw error;

  return new Promise((resolve, reject) => {
    let listenerHandle;
    const cleanup = () => listenerHandle?.remove();

    CapApp.addListener('appUrlOpen', async ({ url }) => {
      const hash = url.split('#')[1];
      if (!hash) return;
      const params = new URLSearchParams(hash);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      await Browser.close().catch(() => {});
      cleanup();
      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
        if (sessionError) reject(sessionError);
        else resolve();
      } else {
        reject(new Error(`${provider} sign in failed`));
      }
    }).then(handle => { listenerHandle = handle; });

    Browser.open({ url: data.url });
  });
}

export async function signInWithApple() {
  await oauthSignIn('apple');
}

export async function signInWithGoogle() {
  await oauthSignIn('google');
}
