"use client";

// A shared list (e.g. Shopping) that family can open from a link, no account needed.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";

type Item = { id: string; text: string; done: boolean };

export default function SharedList() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const busy = useRef(false);

  const apply = (body: { name?: string; items?: Item[]; error?: string }) => {
    if (body.error) { setError(body.error); return; }
    setError("");
    setName(body.name || "List");
    setItems(body.items || []);
  };

  const load = useCallback(async () => {
    if (busy.current) return;
    try {
      const res = await fetch(`/api/shared/${token}`, { cache: "no-store" });
      apply(await res.json());
    } catch {
      setError("You're offline. The list will refresh when you're connected.");
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 5000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  async function send(op: Record<string, unknown>) {
    busy.current = true;
    try {
      const res = await fetch(`/api/shared/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(op) });
      apply(await res.json());
    } catch {
      setError("Couldn't save that. Check your connection and try again.");
    } finally {
      busy.current = false;
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    const texts = text.split(/,|\n/).map((s) => s.trim()).filter(Boolean);
    if (!texts.length) return;
    setText("");
    send({ op: "add", texts });
  }

  function toggle(it: Item) {
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
    send({ op: "toggle", id: it.id, done: !it.done });
  }

  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">Shared from Toby</div>
            <h1>{name || (loaded ? "List" : "Loading…")}</h1>
          </div>
        </div>
      </header>
      <main style={{ paddingBottom: 40 }}>
        <div className="wrap view">
          {error && <div className="card" role="status" style={{ color: "var(--bad)" }}>{error}</div>}
          {!error || items.length ? (
            <>
              <section className="card">
                <form className="row" onSubmit={add}>
                  <input id="sharedAdd" className="field" placeholder="Add items, separated by commas" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" enterKeyHint="done" />
                  <button className="btn primary" type="submit">Add</button>
                </form>
              </section>
              <section className="card">
                <div className="list">
                  {!open.length && !done.length && loaded && <div className="empty"><b>Nothing on the list.</b>Add the first item above.</div>}
                  {open.map((it) => (
                    <div className="item" key={it.id}>
                      <button className="check" onClick={() => toggle(it)} aria-label="Mark done"><Tick /></button>
                      <div className="body"><div className="t">{it.text}</div></div>
                    </div>
                  ))}
                  {done.length > 0 && <div className="group-h">Done</div>}
                  {done.map((it) => (
                    <div className="item done" key={it.id}>
                      <button className="check on" onClick={() => toggle(it)} aria-label="Mark not done"><Tick /></button>
                      <div className="body"><div className="t">{it.text}</div></div>
                    </div>
                  ))}
                </div>
                {done.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <button className="btn" onClick={() => send({ op: "clearDone" })}>Clear done items</button>
                  </div>
                )}
              </section>
              <p className="small muted" style={{ margin: 0 }}>Changes show up for everyone with this link within a few seconds.</p>
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  );
}
