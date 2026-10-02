# Clipy server setup (Supabase + YouTube)

This folder is Clipy's small server. It lets the app connect your YouTube channel and post videos to it. Your videos never live on the server: the phone sends them straight to YouTube.

> **Honest status:** none of these steps has been run against the real Supabase or Google services yet. Everything was written from their documentation (October 2026). If a screen looks different from what is written here, trust the screen, and tell the developer what you saw.

A few words used below:

- **Supabase**: the online service that runs Clipy's server and remembers who you are.
- **Project ref**: the short random code in your Supabase address. In `https://abcdefghij.supabase.co`, the ref is `abcdefghij`.
- **Secret**: a private setting stored on the server (like a password). It is never put in the app.
- **PowerShell**: the blue/black command window on Windows. Open it in the `uncool` folder: in File Explorer, open the folder, click the address bar, type `powershell`, press Enter.

Where a button name below could not be checked on the live page, it says *(may be named slightly differently)*.

---

## 1. Create the Supabase project

1. Go to https://supabase.com and sign in (or sign up; the free plan is enough).
2. Click **New project**. Name it `Clipy`. Choose a **database password** and write it down somewhere safe; you need it in step 3.
3. Wait until the project has finished setting up (a minute or two).
4. Click **Connect** at the top of the project page *(may be named slightly differently)*. It shows the **Project URL** and the **publishable key**. (If you only see an "anon" key, that one works too.) You can also find the keys under **Settings → API Keys**.
5. In the `uncool` folder, make a copy of the file `.env.example` and name the copy `.env`.
6. Open `.env` in Notepad and paste the two values:
   - after `EXPO_PUBLIC_SUPABASE_URL=` paste the Project URL,
   - after `EXPO_PUBLIC_SUPABASE_KEY=` paste the publishable (or anon) key.
7. Save. Never share or commit `.env`.

## 2. Turn on Sign in with Apple

1. In the Supabase project, open **Authentication → Sign In / Providers** *(may be named slightly differently; the docs also call it **Authentication → Providers**)*.
2. Click **Apple** and switch it on.
3. In **Client IDs**, type `host.exp.Exponent`. This is the ID Expo Go uses on your iPhone.
4. Later, when Clipy becomes a real App Store app, add `com.clipy.app` to the same list (separated by a comma).
5. The OAuth fields (Services ID, secret key) can stay empty: the Clipy app signs in natively and does not need them.
6. Click **Save**.

## 3. Install the Supabase tool and put the server online

Run these in PowerShell, one at a time. The first time, `npx` may ask `Ok to proceed? (y)`: type `y` and press Enter.

Sign in to Supabase (a browser window opens; approve it):

```powershell
npx.cmd supabase login
```

Connect this folder to your project. Replace `<ref>` with your project ref (see the top of this page):

```powershell
npx.cmd supabase link --project-ref <ref>
```

Create Clipy's tables in the database. It asks for the database password from step 1:

```powershell
npx.cmd supabase db push
```

Upload the server code (all seven functions):

```powershell
npx.cmd supabase functions deploy
```

Docker is not needed: when it is missing, the tool uploads the code another way by itself.

## 4. Set the secrets

Secrets take effect straight away; no need to deploy again.

**a. The encryption key.** Clipy locks your YouTube sign-in with this key before saving it. Make a random one:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

It prints a line of about 44 letters and symbols. Copy it, then run (paste it in place of `<key>`):

```powershell
npx.cmd supabase secrets set TOKEN_ENC_KEY=<key>
```

Keep this key the same forever. If it changes, everyone has to reconnect their accounts.

**b. The YouTube client** (you get these two values in step 5; come back here afterwards):

```powershell
npx.cmd supabase secrets set YOUTUBE_CLIENT_ID=<client id>
```

```powershell
npx.cmd supabase secrets set YOUTUBE_CLIENT_SECRET=<client secret>
```

**c. Only if uploads fail** (see step 6):

```powershell
npx.cmd supabase secrets set YOUTUBE_UPLOAD_TOKEN_ON_PHONE=true
```

Until both YouTube values are set, the app shows YouTube as "Not available yet".

## 5. YouTube: get a Google client

Use the Google account that owns your YouTube channel.

1. Go to https://console.cloud.google.com.
2. Click the project picker at the top → **New project** → name it `Clipy` → **Create**. Make sure the new project is selected at the top.
3. Open the menu (☰) → **APIs & Services → Library** *(may be named slightly differently)*. Search for **YouTube Data API v3**, open it, click **Enable**.
4. Open **Google Auth platform** (also reachable as **APIs & Services → OAuth consent screen**) *(may be named slightly differently)* → **Get started**:
   - App name: `Clipy`; support email: your email.
   - Audience: **External**.
   - Contact email: your email. Accept the policy. **Create**.
5. Go to **Audience**:
   - Under **Test users**, click **Add users**, add your own Google email, **Save**.
   - Then click **Publish app** and confirm. **This matters:** while the app is in "Testing", Google ends the YouTube connection every 7 days and you would have to reconnect each week. Publishing does not make your videos public, and for your own use it should not need Google's review; you will simply see a warning screen when connecting (step 6).
6. Go to **Clients** (or **APIs & Services → Credentials → Create credentials → OAuth client ID**) *(may be named slightly differently)*:
   - Application type: **Web application**. Name: `Clipy server`.
   - Under **Authorized redirect URIs**, click **Add URI** and paste exactly (with your project ref):
     `https://<ref>.supabase.co/functions/v1/oauth-callback`
   - Click **Create**.
7. A box shows the **Client ID** and **Client secret**. Copy both now (the secret may only be shown once; you can also download it as a file). Put them on the server with step 4b.

## 6. What to expect

- **"Google hasn't verified this app"**: the first time you connect YouTube, Google shows this warning. It is normal for a personal app. Click **Advanced → Go to Clipy (unsafe)** *(may be named slightly differently)*, then allow access.
- **Videos arrive PRIVATE.** Google keeps every video uploaded by a new, un-audited app private until the app passes YouTube's API audit. Clipy still sends the privacy you chose, but YouTube overrides it. After posting, tap the link in Clipy, open the video in YouTube (or YouTube Studio), and switch it to **Public** yourself.
- **Shorts:** a square or vertical video up to 3 minutes becomes a Short by itself; no `#Shorts` needed.
- **Limit:** about 100 uploads a day.
- **The server sleeps after a week unused.** On the free plan, Supabase pauses a project after about a week with no activity. Clipy then says "Server is asleep". Open https://supabase.com, open the project and click **Restore** (or **Resume**) *(may be named slightly differently)*. Waking can take a few minutes.
- **Uploads stuck at 0 % with a 401 or 403 error:** Google's documents do not say whether the phone may upload without a token. If it may not, run the command in step 4c and try again. It sends the phone a short-lived (about one hour) YouTube token, kept only in memory.

## 7. Troubleshooting

| What you see | Why | What to do |
| --- | --- | --- |
| YouTube shows **Not available yet** | `YOUTUBE_CLIENT_ID` or `YOUTUBE_CLIENT_SECRET` is not set on the server | Do step 4b. Check with `npx.cmd supabase secrets list` (it shows names, not values). |
| YouTube shows **Reconnect** | Google ended the connection (app still in "Testing" after 7 days, password change, or access removed in your Google account) | Tap Reconnect. If it happens every week, do the **Publish app** part of step 5. |
| **Server is asleep** | The free project was paused after a week unused | Restore it from the Supabase dashboard (step 6), wait a few minutes, try again. |
| Error mentioning **quota** | The Google project used up today's YouTube allowance (about 100 uploads a day) | Wait until tomorrow (the allowance resets once a day). |
| Every action fails with a sign-in error (**401**, **Invalid JWT** or **Sign in to Clipy first**) although you are signed in | Supabase's own sign-in check at the door rejects the app's login (this can happen after Supabase changes its signing keys) | Run `npx.cmd supabase functions deploy --no-verify-jwt`. Clipy still checks your sign-in itself inside each function. |
| Connecting YouTube ends with **redirect_uri_mismatch** | The redirect address in step 5.6 does not match exactly | Fix it in Google's **Clients** page: `https://<ref>.supabase.co/functions/v1/oauth-callback`, no slash at the end. |
| **This Google account has no YouTube channel yet** | The Google account has never created a channel | Open YouTube with that account, create a channel, then connect again. |
