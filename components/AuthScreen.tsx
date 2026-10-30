"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "signIn" | "signUp" | "forgot" | "newPassword";

const COPY: Record<Mode, { title: string; lead: string; button: string }> = {
  signIn: { title: "Welcome back", lead: "Sign in to pick up where you left off on any device.", button: "Sign in" },
  signUp: { title: "Create your account", lead: "Your tasks, habits, journal and money, synced across your devices.", button: "Create account" },
  forgot: { title: "Reset your password", lead: "We'll email you a link to choose a new password.", button: "Send reset link" },
  newPassword: { title: "Choose a new password", lead: "Use at least 8 characters.", button: "Save password" },
};

export default function AuthScreen({ mode: initial, onPasswordSet }: { mode: Mode; onPasswordSet: () => void }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const c = COPY[mode];

  function go(m: Mode) {
    setMode(m);
    setMsg(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const redirectTo = window.location.origin;
    try {
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signUp") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (!data.session) setMsg({ text: "Check your email and tap the confirmation link, then sign in here." });
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setMsg({ text: "If that email has an account, a reset link is on its way." });
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        onPasswordSet();
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : "Something went wrong. Check your connection and try again.";
      setMsg({ text: text === "Invalid login credentials" ? "That email and password don't match. Try again or reset your password." : text, err: true });
    } finally {
      setBusy(false);
    }
  }

  const needsEmail = mode !== "newPassword";
  const needsPassword = mode !== "forgot";

  return (
    <div className="wrap auth">
      <div className="box">
        <img className="logo" src="/icon-192.png" alt="" width={56} height={56} />
        <div>
          <div className="eyebrow">Chief of Staff</div>
          <h1>{c.title}</h1>
        </div>
        <p>{c.lead}</p>
        <form onSubmit={submit}>
          {needsEmail && (
            <label className="lbl">
              Email
              <input id="authEmail" className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {needsPassword && (
            <label className="lbl">
              {mode === "newPassword" ? "New password" : "Password"}
              <input
                id="authPassword"
                className="field"
                type="password"
                minLength={mode === "signIn" ? undefined : 8}
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {msg && <div className={"msg" + (msg.err ? " err" : "")} role="status">{msg.text}</div>}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "One moment…" : c.button}
          </button>
        </form>
        {mode !== "newPassword" && (
          <div className="alt">
            {mode === "signIn" ? (
              <>
                <button className="link" onClick={() => go("signUp")}>Create an account</button>
                <button className="link" onClick={() => go("forgot")}>Forgot password?</button>
              </>
            ) : (
              <button className="link" onClick={() => go("signIn")}>Back to sign in</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
