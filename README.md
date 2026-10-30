# Toby

A personal assistant web app for your phone: tasks and planning, habits, a daily journal, money tracking, a calculator with quick tools, and notes. Sign in on any device and everything stays in sync.

- **Next.js** app, installable on iPhone from Safari (Add to Home Screen) and works offline
- **Supabase** for sign-in and the database (free tier is plenty for personal use)
- **Vercel** for hosting (free hobby plan)

## Setup (about 15 minutes, once)

### 1. Create the database

1. Sign up at [supabase.com](https://supabase.com) and create a new project. Pick the region closest to you and save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste everything in [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates one table and locks it so each account can only read its own data.
3. Open **Project Settings → API** (or the **Connect** button) and copy:
   - the **Project URL**
   - the **anon / publishable** key

   Never use the `service_role` / secret key in this app.

### 2. Put it online

1. Sign up at [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New → Project**, import this repository.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon / publishable key
4. Click **Deploy**. You'll get a link like `https://your-app.vercel.app`.

### 3. Point sign-in emails at your site

In Supabase, open **Authentication → URL Configuration**:

- **Site URL**: your Vercel link, e.g. `https://your-app.vercel.app`
- **Redirect URLs**: add the same link

This makes the confirmation and password-reset emails open your app.

### 4. Create your account, then close the door

1. Open your Vercel link, tap **Create an account**, and confirm your email.
2. Since this app is just for you, go to Supabase **Authentication → Sign In / Providers** and turn off **Allow new users to sign up**. Your account keeps working; nobody else can create one.

### 5. Install on your iPhone

Open your link in **Safari**, sign in, tap **Share → Add to Home Screen**. It gets its own icon and opens full screen.

## Moving data from the offline version

If you used the earlier offline-only version: in that app go to **Tools → Settings → Export backup**, then in this app go to **Tools → Settings → Import backup** and pick the file.

## How sync works

Each section (tasks, habits, journal, money, notes, settings) is saved as one row in the `user_data` table. The app also keeps a copy on the device, so it opens instantly and works without a connection; changes upload when you're back online. When the same section is edited on two devices at once, the most recent save wins.

## Notifications

Toby can send a morning briefing, a reminder for each task that has a time, and an evening check-in on your habits and open tasks. They arrive even when the app is closed. Times and reminder lead are set in **Tools → Settings → Notifications**.

### One-time setup

1. **Database.** In Supabase, open **SQL Editor → New query**, paste [`supabase/notifications.sql`](supabase/notifications.sql), and run it.
2. **Keys.** In Vercel, open your project → **Settings → Environment Variables** and add:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public push key (generate with `npx web-push generate-vapid-keys`) |
   | `VAPID_PRIVATE_KEY` | Private push key from the same command |
   | `VAPID_SUBJECT` | `mailto:` followed by your email, e.g. `mailto:you@example.com` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase **secret** (or `service_role`) key, from Project Settings → API Keys |
   | `CRON_SECRET` | Any long random password, used only by the scheduler |

   The secret key and private key have no `NEXT_PUBLIC_` prefix, so they stay on the server. Then **Deployments → ⋯ → Redeploy** so the app picks them up.
3. **Schedule.** Open [`supabase/schedule.sql`](supabase/schedule.sql), replace `YOUR_CRON_SECRET` with your `CRON_SECRET` (and the address if your app isn't at toby-rust.vercel.app), then run it in the Supabase SQL Editor. Supabase will now ask Toby every 5 minutes whether anything is due.
4. **Your iPhone.** Open Toby from its Home Screen icon (notifications only work in the installed app on iPhone), go to **Tools → Settings**, tap **Turn on notifications**, allow them, then tap **Send a test**.

### If notifications don't arrive

- In Supabase SQL Editor, run `select status_code, content from net._http_response order by created desc limit 5;`
  - `200` with `"ok":true` means the schedule works.
  - `401` means the `CRON_SECRET` in `schedule.sql` doesn't match Vercel's.
  - `500` lists anything missing.
- Check iPhone **Settings → Notifications → Toby** is allowed, and Focus modes aren't hiding it.
- Reminders use the time zone of the phone that last opened Toby.

## Run it on your computer

```bash
cp .env.example .env.local   # then fill in the two values
npm install
npm run dev
```

Open http://localhost:3000.

## Project layout

| Path | What it is |
| --- | --- |
| `app/page.tsx` | Decides whether to show sign-in or the app |
| `components/AuthScreen.tsx` | Sign in, create account, reset password |
| `components/AppShell.tsx` | The signed-in app frame |
| `lib/engine.js` | Every screen and interaction in the app |
| `lib/sync.js` | Saving to Supabase, offline copy, live updates |
| `lib/push.ts` | Turning notifications on and off on a device |
| `lib/server/schedule.ts` | Which reminders are due, and their wording |
| `app/api/notify/route.ts` | Sends due reminders (called every 5 minutes) |
| `app/api/push/test/route.ts` | The "Send a test" button |
| `supabase/schema.sql` | Database table and security rules |
| `supabase/notifications.sql` | Tables for devices and sent reminders |
| `supabase/schedule.sql` | The 5-minute schedule |
| `public/sw.js` | Offline support and showing notifications |
