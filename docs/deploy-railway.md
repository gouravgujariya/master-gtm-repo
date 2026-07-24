# Deploy the GTM Console to the web (Railway)

This hosts the **full operating app** (not just the read-only view) on the internet, so you can run the
whole pipeline from any computer. It uses Railway (an always-on server host — unlike Vercel, it can run
the multi-minute find/verify jobs).

You do this once, in Railway's website. ~15 minutes. Cost: free trial, then ~$5/month for always-on.

## Before you start
The app is already cloud-ready and pushed to GitHub. On the web version, "Source companies" uses **AI Ark
lookalikes** (no local files needed). Everything saves to Supabase.

## Steps

### 1. Create the project
1. Go to **https://railway.app** and **Sign in with GitHub** (the `krishna-designwork` account).
2. Click **New Project → Deploy from GitHub repo**.
3. If asked, **authorize Railway** to see your repos, then pick **`master-gtm-repo`**.
4. Railway starts building it automatically. Let it run.

### 2. Add your keys (Variables)
1. Click the service (the box named after the repo) → the **Variables** tab.
2. Click **Raw Editor**.
3. Open your local **`.env`** file (in `Master GTM Repo`, open it with TextEdit) and **paste its entire
   contents** into the Raw Editor.
4. Add **one more line** at the bottom — your team password:
   ```
   APP_PASSWORD=choose-a-strong-password-here
   ```
5. Click **Save/Update**. (Do NOT add a `PORT` line — Railway sets that itself.)
   Railway will automatically rebuild with the keys.

### 3. Get your public URL
1. Go to the service → **Settings → Networking**.
2. Click **Generate Domain**.
3. You'll get a URL like **`gtm-console-production.up.railway.app`**.

### 4. Use it
- Open that URL in any browser → you'll see a **login screen** → enter your `APP_PASSWORD`.
- Now you (and anyone you share the URL + password with) can run the full pipeline from the web.

## Notes
- **Two versions now exist:** the local app (`npm run app`, has the bulk-data sourcing) and this web app
  (AI Ark sourcing). Both write to the same Supabase, so data is shared.
- **To change the password:** Railway → Variables → edit `APP_PASSWORD` → it redeploys.
- **To update the app later:** just push to GitHub — Railway auto-redeploys.
- **Security:** your keys live only in Railway's Variables (encrypted), never in the browser. The app is
  gated by `APP_PASSWORD`. Keep the repo private.
