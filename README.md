# Horror Movie Madness — party site

A one-page invite + RSVP/potluck sign-up, hosted free on GitHub Pages.
RSVPs are stored in a Google Sheet you own (via a tiny Google Apps Script).

```
index.html          the page
styles.css          the look
app.js              loads/saves RSVPs, renders the feast + body count
config.js           ← the file you edit (sheet URL, invited/expected counts)
apps-script/Code.gs ← paste into Google Apps Script (not used by the site itself)
```

Until `sheetUrl` is filled in, the page runs in **demo mode** with sample entries,
so you can open `index.html` locally and see it right away.

---

## 1. Hook up the Google Sheet (≈5 min)

1. Create a new Google Sheet (name it whatever, e.g. *Halloween 2026 RSVPs*).
2. In the sheet: **Extensions → Apps Script**.
3. Delete the starter code, paste in everything from `apps-script/Code.gs`, click **Save**.
4. **Deploy → New deployment** → gear icon → **Web app**.
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
5. Click **Deploy**, approve the permissions prompt (Google will warn that the app
   is unverified — it's your own script; choose *Advanced → Go to … (unsafe)*).
6. Copy the **Web app URL** (ends in `/exec`) and paste it into `config.js`:
   ```js
   sheetUrl: "https://script.google.com/macros/s/XXXXXXXX/exec",
   ```

An **RSVPs** tab is created automatically on the first submission.

7. **Fast loading (recommended):** in the script editor, pick **setUp** in the function
   dropdown and click **Run** (approve the permission prompt). This creates a **Public**
   tab holding only guest counts, attending, category and dish — no names, no notes —
   and makes your hand edits refresh the site's cached list.
8. In the Sheet: **File → Share → Publish to web** → choose the **Public** tab (not
   "Entire document") and **Comma-separated values (.csv)** → **Publish**. Paste that link
   into `publicCsvUrl` in `config.js`. The site then loads in about a second; the
   published copy lags the Sheet by a few minutes.

**Managing entries:** edit or delete rows right in the sheet. To hide a row from the
website without deleting it, type anything in its **Hide** column. The
*Note to hosts* column is never shown on the site.

> If you ever edit `Code.gs`, use **Deploy → Manage deployments → ✏️ → Version: New version**
> so the URL stays the same.

## 2. Publish on GitHub Pages

1. Create a new **public** repository on GitHub (e.g. `halloween-party`).
2. Upload the contents of this `party-site` folder (drag-and-drop on the repo page works,
   or use git — see below).
3. Repo **Settings → Pages** → *Source:* **Deploy from a branch** → *Branch:* `main` / `(root)` → **Save**.
4. After a minute, your site is live at `https://<your-username>.github.io/halloween-party/`.
   Put that link (or a QR code of it) where the invite says *RSVP page link*.

With git:

```bash
cd party-site
git init
git add .
git commit -m "Halloween party site"
git branch -M main
git remote add origin https://github.com/<your-username>/halloween-party.git
git push -u origin main
```

> Only push the `party-site` folder — keep the planning spreadsheets out of the repo.

## 3. Updating the Body Count

Open `config.js`, change `invited`, `expected`, and `lastUpdated`, then commit & push
(or edit the file directly on github.com with the ✏️ pencil icon). "Souls confirmed"
and the countdown update themselves from the RSVPs and the date.

## Notes

- The Apps Script URL is visible in the page source — anyone with the link could
  submit an entry, which is the point. The hidden honeypot field filters basic bots;
  use the **Hide** column for anything silly.
- Guest names and dishes are public to anyone with the page link. Private notes stay in the sheet.
