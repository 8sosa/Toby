"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { createStore } from "@/lib/sync";
import { startApp } from "@/lib/engine";

/**
 * The signed-in app. React renders the frame once; lib/engine.js fills it in
 * and handles every tap, saving through the sync store.
 */
export default function AppShell({ userId, email }: { userId: string; email: string }) {
  useEffect(() => {
    const store = createStore(supabase, { id: userId });
    const stopApp = startApp({
      store,
      email,
      onSignOut: async () => {
        await store.flushAll();
        store.clearLocal();
        await supabase.auth.signOut();
      },
    });
    return () => {
      stopApp();
      store.stop();
    };
  }, [userId, email]);

  return (
    <>
      <header className="top" id="top">
        <div className="wrap">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow" id="eyebrow" />
            <h1 id="title">Today</h1>
          </div>
          <span className="sync connecting" id="sync" role="status">
            <i />
            <span>Syncing</span>
          </span>
        </div>
      </header>
      <main>
        <div className="wrap" id="main" />
      </main>
      <nav className="tabs" aria-label="Sections">
        <div className="in" id="nav" />
      </nav>
      <div id="sheetRoot" />
      <div className="toast" id="toast" role="status" aria-live="polite" />
    </>
  );
}
