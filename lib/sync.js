// Cloud sync for Chief of Staff.
// Each section of the app (tasks, habits, journal, money, notes, settings) is one
// JSON row in the `user_data` table. A copy is kept in localStorage so the app
// opens instantly and keeps working offline; changes upload when you're back online.

export const KEYS = ["tasks", "habits", "journal", "money", "notes", "settings"];

export function createStore(supabase, user) {
  const uid = user.id;
  const prefix = "cos:" + uid + ":";
  const subs = { remote: [], status: [] };
  const timers = {}, writing = {}, dirty = {}, latest = {}, lastJSON = {};
  let status = "syncing";
  let channel = null;
  let stopped = false;

  const lsGet = (k) => { try { const v = localStorage.getItem(prefix + k); return v ? JSON.parse(v) : null; } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(prefix + k, JSON.stringify(v)); } catch {} };
  const anyDirty = () => KEYS.some((k) => dirty[k] || writing[k]);

  function setStatus(s) {
    if (s === status) return;
    status = s;
    subs.status.forEach((f) => f(s));
  }

  KEYS.forEach((k) => { const v = lsGet(k); if (v) lastJSON[k] = JSON.stringify(v); });

  async function flush(k) {
    if (stopped || writing[k] || !dirty[k]) return;
    writing[k] = true;
    dirty[k] = false;
    setStatus("syncing");
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: uid, key: k, data: latest[k], updated_at: new Date().toISOString() });
    writing[k] = false;
    if (error) {
      dirty[k] = true;
      setStatus("offline");
      clearTimeout(timers[k]);
      timers[k] = setTimeout(() => flush(k), 8000);
      return;
    }
    if (dirty[k]) flush(k);
    else if (!anyDirty()) setStatus("synced");
  }

  function flushAll() {
    return Promise.all(KEYS.map((k) => { clearTimeout(timers[k]); return flush(k); }));
  }

  function applyRow(row) {
    const k = row.key;
    if (!KEYS.includes(k) || dirty[k] || writing[k]) return;
    const json = JSON.stringify(row.data);
    if (json === lastJSON[k]) return;
    lastJSON[k] = json;
    lsSet(k, row.data);
    subs.remote.forEach((f) => f(k, row.data));
  }

  async function pull() {
    if (stopped) return;
    const { data, error } = await supabase.from("user_data").select("key,data,updated_at").eq("user_id", uid);
    if (error) { setStatus("offline"); return; }
    const have = new Set();
    (data || []).forEach((row) => { have.add(row.key); applyRow(row); });
    // Anything that only exists on this device (e.g. created while offline) gets uploaded.
    KEYS.forEach((k) => {
      if (!have.has(k) && lastJSON[k] && !dirty[k]) {
        latest[k] = JSON.parse(lastJSON[k]);
        dirty[k] = true;
        flush(k);
      }
    });
    if (!anyDirty()) setStatus("synced");
  }

  const onVisible = () => {
    if (document.visibilityState === "visible") pull();
    else flushAll();
  };
  const onOnline = () => { flushAll(); pull(); };

  return {
    cached: (k) => lsGet(k),
    save(k, value) {
      const json = JSON.stringify(value);
      latest[k] = JSON.parse(json);
      lastJSON[k] = json;
      lsSet(k, latest[k]);
      dirty[k] = true;
      setStatus("syncing");
      clearTimeout(timers[k]);
      timers[k] = setTimeout(() => flush(k), 700);
    },
    onRemote(fn) { subs.remote.push(fn); },
    onStatus(fn) { subs.status.push(fn); fn(status); },
    start() {
      pull();
      channel = supabase
        .channel("user_data:" + uid)
        .on("postgres_changes", { event: "*", schema: "public", table: "user_data", filter: "user_id=eq." + uid }, (p) => {
          if (p.new && p.new.key) applyRow(p.new);
        })
        .subscribe();
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", onOnline);
    },
    flushAll,
    clearLocal() {
      KEYS.forEach((k) => { try { localStorage.removeItem(prefix + k); } catch {} });
    },
    stop() {
      flushAll(); // send anything pending before shutting down
      stopped = true;
      KEYS.forEach((k) => clearTimeout(timers[k]));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (channel) supabase.removeChannel(channel);
    },
  };
}
