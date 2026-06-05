import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { getIsPremium, initRevenueCat } from '@/lib/revenueCat';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState({});
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setIsAuthenticated(true);
        fetchProfile(session.user.id);
      }
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setIsAuthenticated(true);
        fetchProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setIsAuthenticated(false);
      }
      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
    await initRevenueCat(userId);
    const rcPremium = await getIsPremium();
    setIsPremium(rcPremium || !!data?.is_premium);
  };

  const refreshProfile = async () => {
    if (user?.id) await fetchProfile(user.id);
  };

  const refreshPremium = async () => {
    // Check RevenueCat first, fall back to Supabase is_premium field
    const rcPremium = await getIsPremium();
    if (rcPremium) {
      setIsPremium(true);
      return true;
    }
    if (user?.id) {
      const { data } = await supabase.from("profiles").select("is_premium").eq("id", user.id).single();
      const premium = !!data?.is_premium;
      setIsPremium(premium);
      return premium;
    }
    setIsPremium(false);
    return false;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => { window.location.href = '/login'; };

  const updateProfile = async (updates) => {
    if (!user) return;
    const { data, error } = await supabase.from('profiles').update(updates).eq('id', user.id).select().single();
    if (!error && data) setProfile(data);
    return { data, error };
  };

  const checkUserAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      setIsAuthenticated(true);
      await fetchProfile(session.user.id);
    }
    setAuthChecked(true);
    setIsLoadingAuth(false);
  };

  const checkAppState = async () => { await checkUserAuth(); };

  const mergedUser = user ? { ...user, ...(profile || {}), email: user.email, id: user.id } : null;
  const onboardingDone = !!(profile?.onboarding_done);

  return (
    <AuthContext.Provider value={{
      user: mergedUser,
      isPremium,
      onboardingDone,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState,
      updateProfile,
      refreshProfile,
      refreshPremium,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
