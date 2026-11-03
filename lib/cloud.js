// Everything the app reads from or writes to Supabase directly, apart from the main
// synced sections (see sync.js): shared lists, the Siri inbox, Shortcut keys and calendars.

const UPDATE_MSG = "This needs the latest database update. Run supabase/v3.sql in Supabase (see the README).";

function friendly(error) {
  if (!error) return null;
  const msg = error.message || String(error);
  if (error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table|schema cache/i.test(msg)) return new Error(UPDATE_MSG);
  if (/fetch|network/i.test(msg)) return new Error("You're offline. Try again when you're connected.");
  return new Error(msg);
}
async function run(q) {
  const { data, error } = await q;
  if (error) throw friendly(error);
  return data;
}

function randomToken(bytes = 24) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createCloud(supabase, userId) {
  const channels = [];
  const authHeader = async () => {
    const { data } = await supabase.auth.getSession();
    return { Authorization: "Bearer " + (data.session?.access_token || "") };
  };

  /** Calls `fn` whenever a row in one of these tables changes for this person. */
  function watch(tables, fn) {
    const ch = supabase.channel("cloud:" + tables.join(",") + ":" + Math.random().toString(36).slice(2));
    tables.forEach((t) => ch.on("postgres_changes", { event: "*", schema: "public", table: t, filter: "user_id=eq." + userId }, fn));
    ch.subscribe();
    channels.push(ch);
    return () => { supabase.removeChannel(ch); const i = channels.indexOf(ch); if (i >= 0) channels.splice(i, 1); };
  }

  const lists = {
    async all() {
      const [ls, items] = await Promise.all([
        run(supabase.from("lists").select("id,name,position,share_token,created_at").order("position").order("created_at")),
        run(supabase.from("list_items").select("id,list_id,text,done,added_by,created_at").order("created_at")),
      ]);
      return ls.map((l) => ({ ...l, items: items.filter((i) => i.list_id === l.id) }));
    },
    create: (name, position = 0) => run(supabase.from("lists").insert({ name, position, user_id: userId }).select().single()),
    rename: (id, name) => run(supabase.from("lists").update({ name }).eq("id", id)),
    remove: (id) => run(supabase.from("lists").delete().eq("id", id)),
    addItems: (listId, texts) => run(supabase.from("list_items").insert(texts.map((text) => ({ list_id: listId, text, user_id: userId })))),
    setDone: (id, done) => run(supabase.from("list_items").update({ done }).eq("id", id)),
    editItem: (id, text) => run(supabase.from("list_items").update({ text }).eq("id", id)),
    removeItem: (id) => run(supabase.from("list_items").delete().eq("id", id)),
    clearDone: (listId) => run(supabase.from("list_items").delete().eq("list_id", listId).eq("done", true)),
    async share(id) {
      const token = randomToken(12);
      await run(supabase.from("lists").update({ share_token: token }).eq("id", id));
      return token;
    },
    unshare: (id) => run(supabase.from("lists").update({ share_token: null }).eq("id", id)),
    watch: (fn) => watch(["lists", "list_items"], fn),
  };

  const inbox = {
    async take() {
      return run(supabase.from("inbox").select("id,kind,payload,created_at").order("created_at"));
    },
    remove: (ids) => (ids.length ? run(supabase.from("inbox").delete().in("id", ids)) : Promise.resolve()),
    watch: (fn) => watch(["inbox"], fn),
  };

  const keys = {
    async count() {
      const rows = await run(supabase.from("api_tokens").select("token_hash,created_at,last_used"));
      return rows;
    },
    async create() {
      const token = "toby_" + randomToken(24);
      await run(supabase.from("api_tokens").insert({ token_hash: await sha256Hex(token), user_id: userId }));
      return token;
    },
    revokeAll: () => run(supabase.from("api_tokens").delete().eq("user_id", userId)),
  };

  const calendar = {
    async events(from, to) {
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`, { headers: await authHeader() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't load your calendar.");
      return body;
    },
  };

  return { lists, inbox, keys, calendar, stop: () => channels.splice(0).forEach((c) => supabase.removeChannel(c)) };
}
