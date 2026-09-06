# Household Ledger

A small, mobile-friendly budget app for tracking income, bills, and receipts.
It's a static site (works on GitHub Pages) backed by a Google Sheet — the
sheet *is* the database, and a small Apps Script turns it into an API.

No build step, no server to pay for, no framework. Just open the site and go.

## What it does

- **Dashboard** — income vs. committed bills vs. savings, "left to spend"
  this month, spending by category, upcoming due dates.
- **Bills** — add, edit, or delete any expense: name, category, amount,
  frequency (weekly/monthly/yearly), the day of the month it's taken, and
  who it's paid by. Change your SIM plan's price the moment it changes.
- **Receipts** — log what you actually spent on food, fuel, etc., with date,
  category, amount, and a note.
- **History** — a running log of every change made, by whom, and when.
- **Settings** — connect your Google Sheet, edit weekly income for each
  person.

It comes pre-loaded with the categories and bills from your existing budget
(rent, fuel, food, insurance, subscriptions, gym, personal spending,
investing, emergency fund) so it's usable on day one — everything is
editable from there.

## 1. Set up the Google Sheet (the database)

1. Go to [sheets.google.com](https://sheets.google.com) and create a new,
   blank spreadsheet. Name it something like "Household Ledger Data".
2. Open **Extensions → Apps Script**.
3. Delete the placeholder code in `Code.gs` and paste in the entire contents
   of [`apps-script/Code.gs`](apps-script/Code.gs) from this project.
4. Click **Save** (the disk icon), then **Deploy → New deployment**.
5. Click the gear icon next to "Select type" and choose **Web app**.
6. Set:
   - **Execute as:** Me
   - **Who has access:** Anyone with the link
7. Click **Deploy**. Google will ask you to authorize the script — accept
   (it's your own script acting on your own sheet).
8. Copy the **Web app URL** it gives you (ends in `/exec`). You'll paste
   this into the app's Settings tab.
9. Switch back to the spreadsheet — you'll see it automatically created
   `Income`, `Expenses`, `Receipts`, and `History` sheets, pre-filled with
   your current bills.

> Any time you change `Code.gs` later, use **Deploy → Manage deployments →
> Edit → New version** so the changes take effect.

## 2. Publish the site on GitHub Pages

1. Create a new GitHub repository (public or private, both work with Pages
   on a paid plan; public is fine for a budget app since none of your real
   numbers live in the code — they live in your private Google Sheet).
2. Upload everything in this folder (`index.html`, `css/`, `js/`) to the
   repo root — the `apps-script/` folder isn't needed on GitHub, it's just
   for reference.
3. Go to the repo's **Settings → Pages**.
4. Under "Build and deployment", set **Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
5. GitHub will give you a URL like
   `https://yourusername.github.io/household-ledger/`. That's your app.

## 3. Connect them

1. Open your GitHub Pages URL on your phone or laptop.
2. Go to the **Settings** tab in the app.
3. Paste the Apps Script Web App URL from step 1.9 above and tap
   **Save & sync**.
4. You should see your bills appear immediately. Add it to your home screen
   (Share → Add to Home Screen on iOS/Android) for an app-like icon.

Both of you can use the same GitHub Pages link — just connect the same
Web App URL on each phone, and Settings → income lets each of you keep your
own weekly figure up to date.

## Notes & honest limitations

- **Receipt photos aren't captured yet.** Receipts are logged manually
  (date, category, amount, note). Attaching and OCR-scanning photos would
  need a Drive upload + a text-recognition API — doable as a follow-up, but
  it's a separate piece of work from this first version.
- **No login.** Anyone with the Web App URL can read/write the data — that's
  fine for a private link only the two of you have, but don't post the URL
  publicly.
- **Currency is fixed to £.** Easy to change in `js/app.js` (`money()`
  function) if that ever changes.
- The app caches your last sync in the browser, so it still shows your data
  if you open it with no signal — new edits just won't save until you're
  back online.
