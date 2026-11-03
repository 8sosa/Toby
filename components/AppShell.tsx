"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { createStore } from "@/lib/sync";
import { startApp } from "@/lib/engine";
import { push } from "@/lib/push";
import { createCloud } from "@/lib/cloud";

/**
 * The signed-in app. React renders the frame once; lib/engine.js fills it in
 * and handles every tap, saving through the sync store.
 */
export default function AppShell({ userId, email }: { userId: string; email: string }) {
  useEffect(() => {
    const store = createStore(supabase, { id: userId });
    const cloud = createCloud(supabase, userId);
    const stopApp = startApp({
      store,
      email,
      push,
      cloud,
      uid: userId,
      onSignOut: async () => {
        await store.flushAll();
        await push.disable().catch(() => undefined); // stop this device getting your reminders
        store.clearLocal();
        await supabase.auth.signOut();
      },
    });
    return () => {
      stopApp();
      store.stop();
      cloud.stop();
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
          <div className="top-actions">
            <button className="icon-btn" data-act="search" aria-label="Search everything">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
            </button>
            <span className="sync connecting" id="sync" role="status">
              <i />
              <span>Syncing</span>
            </span>
          </div>
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
