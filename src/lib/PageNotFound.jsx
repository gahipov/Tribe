import { useLocation } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';

export default function PageNotFound() {
  const location = useLocation();
  const pageName = location.pathname.substring(1);
  const { data: authData, isFetched } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return { user: session?.user ?? null, isAuthenticated: !!session?.user };
    }
  });
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-7xl font-light text-muted-foreground">404</h1>
        <h2 className="text-2xl font-heading font-medium">Page Not Found</h2>
        <p className="text-muted-foreground">"{pageName}" doesn't exist.</p>
        <button onClick={() => window.location.href = '/'} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-heading font-medium">Go Home</button>
      </div>
    </div>
  );
}
