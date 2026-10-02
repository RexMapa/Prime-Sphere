# PrimeSphere website + admin

Static site (`index.html`, `stores.html`) with Vercel Functions in `/api`, a Neon Postgres database,
and an admin dashboard at `/admin` for reading contact form messages and managing Shopify stores.

```
index.html, stores.html, styles.css, script.js   public website
assets/                                          logos, placeholder screenshots
admin/                                           admin dashboard (yoursite.com/admin)
api/                                             serverless API routes
lib/                                             shared server code (database, login, validation)
```

## One-time setup

1. **Push to GitHub.** Commit everything in this folder (not `node_modules`) to your repo.
2. **Import into Vercel.** On vercel.com, open Add New > Project and pick the repo. Framework preset: Other. Leave the build settings empty.
3. **Connect Neon.** In the project, open Storage > Create Database > Neon (or connect your existing Neon database).
   This adds `DATABASE_URL` automatically. Tables are created by the site on first use; you don't need to run any SQL.
4. **Connect Blob (for screenshot uploads).** Storage > Create > Blob, then connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.
5. **Add your login.** Settings > Environment Variables, add:
   - `ADMIN_EMAIL`: the email you'll sign in with
   - `ADMIN_PASSWORD`: a long, unique password
   - `SESSION_SECRET`: a random string of 32+ characters (run `openssl rand -hex 32`, or use any password generator)
6. **Redeploy** (Deployments > the latest one > Redeploy) so the new variables take effect.
7. Open `https://yoursite.com/admin` and sign in.

## Using the admin

- **Messages**: every contact form submission. New ones are marked with a dot and a count in the tab. Open one to read it,
  reply by email, call, archive or delete. Export CSV downloads the current list.
- **Stores**: add, edit, hide, reorder or delete stores. Upload a screenshot for each page (Homepage, Product, etc.);
  each page becomes a tab in the zoomed view. Large screenshots are compressed in your browser before upload.
  - "Feature on homepage" puts a store in the homepage section (the first 5, in list order).
  - "Show on website" off hides a store everywhere without deleting it.
  - Changes appear on the live site within about 30 seconds (the store list is cached briefly).

The site comes with 9 placeholder stores the first time it connects to the database. Edit or delete them once your real stores are in.

## Changing your password

Change `ADMIN_PASSWORD` in Vercel and redeploy. Anyone signed in (including you) is signed out.

## Security notes

- Login is rate-limited (8 failed tries per 15 minutes per connection) and the session cookie is HttpOnly and signed.
- Admin requests require a header that other websites can't send, which blocks cross-site attacks.
- The contact form has a hidden spam trap and allows 5 messages per connection per 10 minutes.
- IP addresses are stored only as one-way hashes.

## Running locally (optional)

```
npm install
npm i -g vercel
vercel link        # connect to your Vercel project
vercel env pull .env.local
vercel dev
```
