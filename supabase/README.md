# Clipy server setup (Supabase, YouTube, TikTok, Instagram, Facebook)

This folder is Clipy's small server. It lets the app connect your YouTube channel and TikTok account and post videos to them (TikTok: as a draft in your TikTok inbox, see section 11; Instagram and Facebook: see section 12). Your videos never live on the server: the phone sends them straight to YouTube, TikTok, Instagram or Facebook.

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
| YouTube shows **Reconnect** | Google ended the connection (app still in "Testing" after 7 days, password change, or access removed in your Google account), or the "upload videos" box was unticked when connecting | Tap Reconnect. If it happens every week, do the **Publish app** part of step 5. |
| **Server is asleep** | The free project was paused after a week unused | Restore it from the Supabase dashboard (step 6), wait a few minutes, try again. |
| Error mentioning **quota** | The Google project used up today's YouTube allowance (about 100 uploads a day) | Wait until tomorrow (the allowance resets once a day). |
| Every action fails with a sign-in error (**401**, **Invalid JWT** or **Sign in to Clipy first**) although you are signed in | Supabase's own sign-in check at the door rejects the app's login (this can happen after Supabase changes its signing keys) | Run `npx.cmd supabase functions deploy --no-verify-jwt`. Clipy still checks your sign-in itself inside each function. If it still fails, tell the developer. |
| Connecting YouTube ends with **redirect_uri_mismatch** | The redirect address in step 5.6 does not match exactly | Fix it in Google's **Clients** page: `https://<ref>.supabase.co/functions/v1/oauth-callback`, no slash at the end. |
| **This Google account has no YouTube channel yet** | The Google account has never created a channel | Open YouTube with that account, create a channel, then connect again. |

## 8. First deploy: things nobody has been able to test yet

Nothing here has run against the real Supabase or Google. Check each of these the first time you use it, and if one fails, tell the developer what you saw.

1. **The sign-in check inside the server functions accepts the app's login.** The functions use `createSupabaseContext` from `@supabase/server` to check who is calling. If every action fails with 401 even after the `--no-verify-jwt` fix in the troubleshooting table, tell the developer.
2. **After connecting an account, the browser hands back to the app.** When Google finishes, Safari should close and Clipy should reopen (the address it returns to starts with `exp://` in Expo Go or `clipy://` in a real build). If you are left on a Supabase or Google page, tell the developer which address you see.
3. **YouTube accepts the phone's upload without a token.** If uploads fail at 0 % with a 401 or 403 error, run `npx.cmd supabase secrets set YOUTUBE_UPLOAD_TOKEN_ON_PHONE=true` and try again (step 4c).
4. **The 4 MB limit is honoured.** Some platforms (not YouTube) pass the video through the server in 4 MB pieces. Whether Supabase's gateway accepts those pieces and respects their declared size has not been checked. It matters for the later platforms; for YouTube nothing is needed now.
5. **The functions bundle `npm:@supabase/server@1`.** The first `npx.cmd supabase functions deploy` has to download this package. If the deploy stops with an error mentioning `@supabase/server` or `npm:`, tell the developer and copy the message.

## 9. Device checklist — posting

After steps 1 to 5 above, on your iPhone in Expo Go:

1. With no `.env`, Accounts shows "Posting isn't set up yet" and the Share button still works.
2. Accounts → Sign in with Apple → Connect YouTube (Google "unverified app" screen → Advanced → continue) → the row shows your channel name.
3. Home → Post a video → pick a short clip. It opens the Post screen (not "This video can't be posted.").
4. Type a caption. The keyboard does not cover the caption field.
5. Post → Preparing → Uploading % → Publishing → Done.
6. While uploading: swipe-back does nothing, and the Back button asks "Stop posting?".
7. View on YouTube opens the (private) video.
8. From a finished export, **Post to…** closes the export sheet and then opens the Post screen.
9. Accounts → Sign out asks you to confirm.

## 10. Security notes

- **The Connect link belongs to you, for a short time, once.** When you tap Connect, Clipy asks the server for a sign-in link that is tied to the Clipy account you are signed in with. The link stops working after 10 minutes and works only once.
- **Your YouTube sign-in is locked on the server.** The server saves it encrypted with your `TOKEN_ENC_KEY` (step 4a). The app never receives it (except the short-lived token of step 4c, if you turn that on).
- **Your TikTok sign-in is locked the same way.** It is saved encrypted with the same key and never sent to the app. The phone uploads to a one-hour TikTok upload address that needs no sign-in, and that address is never saved.
- **Instagram and Facebook: a temporary pass on the phone.** While a video is uploading, Clipy's server gives your phone a temporary pass (your Page's access token) so it can send the video straight to Facebook/Instagram. It is kept only in memory and never saved. The phone sends it only to Meta's upload address (`rupload.facebook.com`); the server refuses to hand it out for any other address. On the server, the pass is saved encrypted like the others.
- **One accepted risk ("login CSRF").** If someone else sent you their own Connect link and you opened it within those 10 minutes and allowed access, your YouTube channel would be connected to *their* Clipy account. For a personal app with one user this is accepted. Only start Connect from inside Clipy, and never open a Connect link someone sends you.

## 11. TikTok

Clipy sends your video to TikTok as a **draft in your TikTok inbox**. You then open TikTok, add the caption and post it there. Clipy never posts to TikTok by itself.

> **Honest status:** none of this has run against the real TikTok yet. It was written from TikTok's developer documentation (October 2026). If a screen looks different, trust the screen and tell the developer what you saw.

Do steps 1 to 4a above first (the Supabase project, the server online, the encryption key).

### a. Create the TikTok developer app

Use the TikTok account you will post with.

1. Go to https://developers.tiktok.com and log in with that TikTok account. If it asks you to register as a developer, do so.
2. Open **Manage apps** → **Connect an app**. Choose yourself as the owner and confirm.
3. Fill in the app details: an app icon (a square picture, 1024 × 1024), the name `Clipy`, a short description and a category *(may be named slightly differently)*. If it asks for a Terms of Service or Privacy Policy address, ask the developer.
4. If it asks for a platform, choose **Web** *(may be named slightly differently)*.
5. Under **Products**, click **Add products** and add **Login Kit** and **Content Posting API**.
6. Open **Login Kit**. In **Redirect URI**, paste exactly (with your project ref, no slash at the end):
   `https://<ref>.supabase.co/functions/v1/oauth-callback`
   This is the same address as for YouTube.
7. Open **Content Posting API**. Make sure uploading drafts (the **video.upload** permission) is available. You do **not** need to turn on **Direct Post** *(may be named slightly differently)*.
8. Under **Credentials**, you see the **Client key** and the **Client secret**. Keep this page open for step c.

### b. Sandbox: let your own account use the app

Until TikTok reviews the app, it only works for accounts you add as "target users" in a sandbox.

1. At the top of the app page, switch from **Production** to **Sandbox**.
2. Click **Create Sandbox**, give it a name (for example `Clipy test`) and click **Confirm**.
3. Check that **Login Kit**, **Content Posting API** and the redirect address from step a.6 are in the sandbox too, then click **Apply changes**.
4. Open **Sandbox settings**. Under **Target users**, click **Add account**, log in with your TikTok account and agree to the **TikTok Developer Terms of Service**.
5. Wait. TikTok says it can take **up to an hour** before your account shows up (refresh the page to check).
6. The sandbox may have its own **Client key** and **Client secret** *(may be shown separately for the sandbox)*. Use the ones shown while **Sandbox** is selected.

### c. Put the TikTok client on the server

Run these in PowerShell, one at a time (paste your values in place of `<client key>` and `<client secret>`):

```powershell
npx.cmd supabase secrets set TIKTOK_CLIENT_KEY=<client key>
```

```powershell
npx.cmd supabase secrets set TIKTOK_CLIENT_SECRET=<client secret>
```

Until both are set, the app shows TikTok as "Not available yet".

### d. What to expect

- **The video arrives in your TikTok inbox as a draft.** TikTok sends you a notification. Open TikTok, tap it, add the caption and hashtags, choose who can see it, and post. Clipy cannot post for you, and it cannot send the caption.
- **Nothing is public until you post it in TikTok.** If you never finish the draft, nobody sees it.
- **At most 5 unfinished drafts a day.** TikTok refuses a new upload when 5 drafts from Clipy are still waiting in the last 24 hours. Clipy then says: "TikTok allows 5 unfinished drafts a day. Open TikTok and post or delete some first."
- **No link back.** Because you finish the post in TikTok, the TikTok row ends with "Sent to TikTok — open TikTok to finish posting." and has no "View on TikTok" link.
- **The TikTok connection lasts about a day at a time** and renews itself. If you do not use Clipy for a year, you will need to reconnect.
- **None of this has run against live TikTok yet.** If a step fails, tell the developer what you saw.

### e. TikTok troubleshooting

| What you see | Why | What to do |
| --- | --- | --- |
| TikTok shows **Not available yet** | `TIKTOK_CLIENT_KEY` or `TIKTOK_CLIENT_SECRET` is not set on the server | Do step c. Check with `npx.cmd supabase secrets list`. |
| Connecting TikTok shows an error about the **redirect** | The address in step a.6 does not match exactly | Fix it in Login Kit: `https://<ref>.supabase.co/functions/v1/oauth-callback`, no slash at the end. |
| Connecting TikTok says the app or account is **not allowed** | Your account is not (yet) a sandbox target user | Do step b, then wait up to an hour. |
| TikTok shows **Reconnect** | The connection ended or a permission was not given when connecting | Tap Reconnect and allow everything TikTok asks for. |
| **TikTok allows 5 unfinished drafts a day** | 5 Clipy drafts are waiting in TikTok | Open TikTok, post or delete some drafts, or wait a day. |

### f. Device checklist — TikTok

After steps a to c above, on your iPhone in Expo Go:

1. Accounts → **Connect TikTok** → TikTok asks for permission (allow everything) → back in Clipy, the TikTok row shows your TikTok name.
2. Home → **Post a video** → pick a short clip → tick **TikTok**. There is no options button for TikTok, and the line "TikTok doesn't receive this caption — you'll write it in TikTok." appears under the caption.
3. **Post** → Preparing → Uploading % → the TikTok row reads **"Sent to TikTok — open TikTok to finish posting."** (no View button).
4. TikTok sends a notification and the **draft appears in your TikTok inbox**.
5. **Finish in TikTok:** open the draft, add the caption, choose who can see it, post. Nothing was public before this step.
6. **5 drafts:** with 5 Clipy drafts still unfinished in TikTok, post a sixth. Clipy says "TikTok allows 5 unfinished drafts a day. Open TikTok and post or delete some first." and nothing is uploaded.
7. **Dropped upload:** start a TikTok post and turn on Airplane mode while it is uploading. After a few seconds the row says "The connection dropped. Post again to restart the TikTok upload." Turn Airplane mode off and tap **Retry**: the video uploads again from the start, and only **one** draft ends up in the TikTok inbox.
8. **TikTok busy after the upload:** if the row fails *after* Uploading reached 100 % with a "TikTok is busy" or "TikTok is having trouble" message, tap **Retry**: it should finish without uploading again (no second draft in the inbox).
9. YouTube still posts in the same session (tick both; a long caption holds back only YouTube).

## 12. Instagram and Facebook

Clipy posts your video as a **Reel** on your Instagram professional account and/or as a **Reel on your Facebook Page**. Both go through one Meta app and your Facebook Page.

> **Honest status:** none of this has run against the real Instagram or Facebook yet. No Meta app existed when it was written; everything comes from Meta's developer documentation (October 2026). If a screen looks different, trust the screen and tell the developer what you saw.

Do steps 1 to 4a above first (the Supabase project, the server online, the encryption key).

### a. Make your Instagram account a professional account

1. In the Instagram app, open your profile → menu (☰) → **Settings and activity** → **Account type and tools** → **Switch to professional account** *(may be named slightly differently)*.
2. Choose **Creator** or **Business** (either works) and follow the steps.

If you only want Facebook, skip this step.

### b. Create a Facebook Page and link Instagram to it

1. On Facebook, create a Page if you do not have one: menu → **Pages** → **Create new Page** *(may be named slightly differently)*. A name and a category are enough.
2. Link your Instagram account to the Page. In the Instagram app: **Edit profile** → **Page** → choose your Page. Or on Facebook, in the Page's settings → **Linked accounts** → **Instagram** → **Connect account** *(may be named slightly differently)*.

Instagram posting needs this link even if you never post to Facebook.

### c. Create the Meta app

Use the Facebook account that manages the Page.

1. Go to https://developers.facebook.com/apps and log in. If asked, register as a developer.
2. Click **Create app**. When asked for a use case, pick the one about managing content on Instagram and Pages, or **Other** *(may be named slightly differently)*. When asked for the app type, choose **Business**. Name it `Clipy`.
3. In the app's dashboard, add the product **Facebook Login for Business** *(may be named slightly differently)*.
4. Add the product **Instagram** and choose **API setup with Facebook login** *(may be named slightly differently)*. Not "with Instagram login": only the Facebook-login way lets the phone send the video without storing it somewhere first.
5. Open **Facebook Login for Business → Settings**. In **Valid OAuth Redirect URIs**, paste exactly (with your project ref, no slash at the end) and save *(may be named slightly differently)*:
   `https://<ref>.supabase.co/functions/v1/oauth-callback`
   This is the same address as for YouTube and TikTok.
6. Open **Facebook Login for Business → Configurations** → **Create configuration**:
   - Name: `Clipy`.
   - Access token type: **User access token**.
   - Assets: your Page (and its Instagram account, if offered).
   - Permissions: tick all five: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`.
   - Click **Create**, then copy the **Configuration ID** it shows.
7. Open **App settings → Basic**. Copy the **App ID**, then click **Show** next to **App Secret** and copy it.

### d. Put the Meta app on the server

Run these in PowerShell, one at a time (paste your values in place of the `<...>` parts):

```powershell
npx.cmd supabase secrets set META_APP_ID=<app id>
```

```powershell
npx.cmd supabase secrets set META_APP_SECRET=<app secret>
```

```powershell
npx.cmd supabase secrets set META_LOGIN_CONFIG_ID=<configuration id>
```

Until the first two are set, the app shows Instagram and Facebook as "Not available yet".

### e. Connect

In Clipy, Accounts → **Connect Instagram** (or **Connect Facebook**). Facebook's dialog asks which Pages (and Instagram accounts) Clipy may use: **choose exactly one Page**, the one linked to your Instagram account. Clipy uses the first suitable Page it receives, so choosing only one avoids surprises.

### f. What to expect

- **Instagram posts as a Reel and can take a few minutes to process.** After the upload, Instagram works on the video before it can be published. Keep the Post screen open. If Clipy runs out of time it offers **Resume**: press it later and Clipy finishes the post without uploading again.
- **Facebook Reels must be 3 to 90 seconds long.** Facebook refuses longer or shorter videos. (Instagram Reels can be 3 seconds to 15 minutes.)
- **Facebook posts may be visible only to you at first.** While the Meta app is in **Development** mode, a Facebook post may be shown only to you (and others with a role on the app) until you switch the app to **Live** at the top of the app dashboard *(may be named slightly differently)*.
- **Limits:** about 30 Facebook Reels a day per Page. Instagram's daily limit is whatever Meta enforces (its own documents say 50 or 100 posts a day). Clipy shows Meta's message when you hit one.
- **A temporary pass on the phone.** While a video is uploading, Clipy's server gives your phone a temporary pass (your Page's access token) so it can send the video straight to Facebook/Instagram. It is kept only in memory and never saved.
- **The connection does not expire on its own.** If you change your Facebook password or remove the app, tap Reconnect.
- **To remove Clipy's access:** on Facebook, **Settings & privacy → Settings → Business integrations** → Clipy → **Remove** *(may be named slightly differently)*. Disconnecting in Clipy only makes Clipy forget the connection.
- **None of this has run against live Meta yet.** If a step fails, tell the developer what you saw.

### g. Instagram and Facebook troubleshooting

| What you see | Why | What to do |
| --- | --- | --- |
| Instagram or Facebook shows **Not available yet** | `META_APP_ID` or `META_APP_SECRET` is not set on the server | Do step d. Check with `npx.cmd supabase secrets list`. |
| Connecting shows an error about the **redirect** or **URL blocked** | The address in step c.5 does not match exactly | Fix it in Facebook Login for Business → Settings: `https://<ref>.supabase.co/functions/v1/oauth-callback`, no slash at the end. |
| **No Instagram professional account is linked to your Facebook Page** | The Instagram account is not professional, not linked to the Page, or that Page was not chosen in the Facebook dialog | Do steps a and b, then connect again and choose that Page. |
| **No Facebook Page you can post to was found** | No Page was chosen in the Facebook dialog, or you cannot create content on it | Connect again and choose your Page. |
| Instagram or Facebook shows **Reconnect** | The connection ended (password change, app removed) or a permission was not given | Tap Reconnect and allow everything Facebook asks for. |
| Instagram stays on **Publishing** and then offers **Resume** | Instagram is still processing the video | Wait a few minutes, then press Resume. |

### h. First live run: Instagram/Facebook

Nothing here has run against live Meta. Check each of these the first time, and if one fails, tell the developer what you saw (copy any error message).

1. **Login with the configuration.** Connecting opens Facebook's dialog with the permissions from step c.6. If the dialog complains about the configuration, remove it and try again; Clipy then asks for the permissions directly (`scope` instead of `config_id`). Tell the developer which way worked.

   ```powershell
   npx.cmd supabase secrets unset META_LOGIN_CONFIG_ID
   ```

2. **The Page's pass works for Instagram.** After connecting Instagram, the row shows `@yourname`. When posting, Preparing finishes (Meta accepted the Page's pass for Instagram) and Uploading starts (the upload address accepted it too).
3. **The single-request upload succeeds.** Uploading reaches 100 % for both Instagram and Facebook without an error.
4. **Publish after processing.** The Instagram row goes Publishing → Done within a few minutes (or after Resume), the Reel appears on your Instagram profile exactly once, and **View on Instagram** opens it.
5. **The Facebook Reel link opens.** The Facebook row reaches Done, and **View on Facebook** opens the Reel on your Page (it may be visible only to you while the app is in Development mode).
