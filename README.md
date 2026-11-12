# Credit-to-Keys Roadmap landing page

Static rebuild of the Lovable lead magnet page for Responsive Mortgage. Free to host on GitHub Pages. Signups go to a Google Sheet through a Google Apps Script.

- `docs/` is the website. GitHub Pages serves this folder.
- `apps-script/Code.gs` is the signup handler. It is pasted into the Google Sheet, not served by the site.

No lead data, API keys, or guide PDF belong in this repo.

## Part 1: Google Sheet and Apps Script

1. In Google Drive, create a new Google Sheet. Name it something like "Credit-to-Keys Signups".
2. In the Sheet, open **Extensions > Apps Script**. Delete the sample code and paste in all of `apps-script/Code.gs`. Save.
3. Open **Project Settings** (gear icon) **> Script Properties** and add:
   - `GUIDE_URL_EN`: the Drive share link to the English guide PDF (shared as "anyone with the link").
   - `GUIDE_URL_ES`: the Spanish guide link, when it exists. Until then Spanish signups get the English link.
   - `FUB_API_KEY`: the Follow Up Boss API key (FUB: Admin > API). Leave it out until you are ready. Signups still save to the Sheet.
   - `NOTIFY_EMAIL`: optional. Where new-lead alerts go. Defaults to the Google account that owns the script.
4. Back in the editor, choose the `setup` function and click **Run**. Approve the permission prompt. This creates the "Signups" tab with headers.
5. Click **Deploy > New deployment**. Type: **Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy, then copy the web app URL (it ends in `/exec`).

When you change the script later, use **Deploy > Manage deployments > Edit > New version** so the URL stays the same.

## Part 2: Connect the page

Open `docs/assets/config.js` and paste the web app URL between the quotes:

```js
signupEndpoint: "https://script.google.com/macros/s/XXXX/exec",
```

## Part 3: GitHub Pages

1. Push this folder to a GitHub repo.
2. In the repo: **Settings > Pages**. Source: **Deploy from a branch**. Branch: `main`, folder: `/docs`. Save.
3. The site appears at `https://<username>.github.io/<repo>/` after a minute or two.

## What happens on each signup

1. The row is saved to the Sheet (timestamp, name, email, phone, credit challenge, language).
2. The guide link is emailed to the person in their language. The "Guide emailed" column shows the date, or why it was not sent.
3. The lead is sent to Follow Up Boss with the source and tag `credit repair lead magnet`. The "Added to FUB" column shows the date.
4. An alert email goes to Manny.

If a signup came in before the FUB key was added, run the `retryFub` function in the script editor. Rows that already have a date are skipped.

## Before going live

- Add the hero photo as `docs/assets/tampa-home.jpg`. Without it the hero shows a plain dark blue background.
- Set `GUIDE_URL_EN`. Without it the thank-you page says the guide is on its way but no email is sent.
- Swap in the real logo and brand colors (colors are at the top of `docs/assets/styles.css`).
- Have compliance review the consent line under the form and the guide email text in `Code.gs`.
- Send one English and one Spanish test signup and check the Sheet, both emails, and FUB.

Google limits a personal Gmail account to about 100 script-sent emails a day. Each signup uses two.
