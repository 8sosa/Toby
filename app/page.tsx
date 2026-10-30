"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import AuthScreen from "@/components/AuthScreen";
import AppShell from "@/components/AppShell";

export default function Home() {
  // undefined = still checking, null = signed out
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) {
    return (
      <div className="wrap auth">
        <div className="box">
          <h1>Almost there</h1>
          <p>
            Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your
            environment variables, then redeploy. The README walks through it.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) return <div className="splash">Loading…</div>;
  if (!session || recovering) {
    return <AuthScreen mode={recovering ? "newPassword" : "signIn"} onPasswordSet={() => setRecovering(false)} />;
  }
  return <AppShell key={session.user.id} userId={session.user.id} email={session.user.email ?? ""} />;
}
