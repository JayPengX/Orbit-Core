# Your manual steps

Steps only you can do: they need your accounts, or they delete something for
good. Each one says why, where to click, and how to tell it worked. They're
independent, so do them in any order. About 15 minutes in all.

Tick each box when it's done (or tell Claude, and it will update this
file).

---

## 1. Phone alerts for the Cloudflare bill (2 minutes)

**Why:** the guard tells your phone when any Cloudflare count passes 50%,
75% or 90% of the $5 plan, when it slows things down, and if it stops the
proxy. It doesn't know which account is yours until you tell it.

- [ ] Open the admin panel: https://jaypengx.github.io/Shared-Proxy/admin/
      (sign in with your admin key, from "Quadra 管理金鑰.txt" on your Desktop).
- [ ] Tap the **系統** tab.
- [ ] In **警示通知**, type your own Quadra Pass and tap **設定**.
- [ ] Tap **測試**.

**It worked when:** the panel says 「已送出：看看手機」 and a notice
"Quadra 管理：測試通知" arrives on your phone.

**If it says 「這個帳戶沒有開通知的 App」:** open any Quadra or Orbit app on
your phone, turn notices on in its settings, and tap **測試** again.

---

## 2. An email alert from Cloudflare (3 minutes)

**Why:** a second warning that doesn't depend on our code. Cloudflare can't
cap a bill itself; the guard is what stops spending. This alert only sends
an email.

- [ ] Go to https://dash.cloudflare.com and choose your account.
- [ ] Left menu: **Notifications** → **Add**.
- [ ] Choose **Usage Based Billing** (under Billing).
- [ ] Set the threshold to **$5.01** (or the lowest it allows), with your
      email as the destination, then **Save**.

If you can't find "Usage Based Billing", use **Manage Account → Billing →
Billable Usage** and set a budget alert at $5.01 there instead.

**It worked when:** the alert is listed under Notifications.

---

## 3. Check the plan renews on the 13th (1 minute)

**Why:** the guard counts each billing period from the 13th. If Cloudflare
renews on a different day, the counts would be off.

- [ ] https://dash.cloudflare.com → **Manage Account → Billing** → your
      Workers Paid subscription → look at the next renewal date.

**If it isn't the 13th:** tell Claude the day; it changes `PERIOD_DAY` in
`wrangler.guard.toml`.

---

## 4. Delete the Shared-Data repo (2 minutes, permanent)

**Why:** it's archived and nothing uses it any more. Its data lives in R2,
and its builders run inside the proxy. Its GitHub secrets (`TDX_CLIENT_ID`,
`TDX_CLIENT_SECRET`, `DATA_PUSH_SECRET` copies) go with it; the proxy has its
own.

Either in the browser:

- [ ] https://github.com/JayPengX/Shared-Data → **Settings** → scroll to the
      bottom → **Delete this repository** → type `JayPengX/Shared-Data` →
      confirm.

Or in a terminal:

```bash
gh auth refresh -s delete_repo
```

```bash
gh repo delete JayPengX/Shared-Data --yes
```

**It worked when:** https://github.com/JayPengX/Shared-Data shows 404.

Then on this Mac (optional, frees space):

```bash
rm -rf ~/Documents/GitHub/Shared-Data
```

---

## 5. Delete the Firebase project (2 minutes; recoverable for 30 days)

**Why:** the Pass's store moved to Cloudflare D1 on 2026-10-14. Every
document was copied and compared, and a full backup is in R2
(`private/firestore-backup.jsonl.gz`). Nothing reads Firebase any more.

- [ ] https://console.firebase.google.com → open project
      **orbit-project-76897**.
- [ ] ⚙ (next to Project Overview) → **Project settings** → **General** →
      scroll to the bottom → **Delete project**.
- [ ] Tick the boxes and confirm.

**It worked when:** the project no longer appears in the Firebase console
(Google keeps it restorable for 30 days, then it's gone).

Deleting it doesn't sign anyone out: the old key's only remaining use is a
text string the proxy keeps until 6 December, then removes by itself.

---

## 6. Revoke the old Match Find token (2 minutes)

**Why:** the proxy once used a GitHub token (`MATCH_FIND_DISPATCH_TOKEN`) to
start Orbit Sports' match-list workflow. That route was removed long ago,
and the token is now off Cloudflare, but it may still be valid on GitHub.

- [ ] https://github.com/settings/tokens (classic tokens) and
      https://github.com/settings/personal-access-tokens (fine-grained):
      look for a token named for Match Find, the match dispatch or Orbit
      Sports.
- [ ] **Delete** it.

**If you're unsure which one:** a token whose "Last used" says *never* or
*more than a month ago* and which only has access to Orbit-Sports (or
`workflow` scope) is it. Deleting a token that's still needed would only
break whatever uses it; nothing in these repos does.

---

## Nothing to do: these happen by themselves

- **2026-10-20:** the old `sports-proxy` Worker is deleted by the deploy
  workflow (it's also scheduled to run that day).
- **2026-12-06:** `FIREBASE_PRIVATE_KEY` is removed from the proxy by the
  deploy workflow (it's also scheduled to run that day).

If a step above doesn't look as described, tell Claude what you see.
