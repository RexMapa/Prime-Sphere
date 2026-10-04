# PrimeSphere website + admin

Static site (`index.html`, `stores.html`) with Vercel Functions in `/api`, a Neon Postgres database,
and an admin dashboard at `/admin` for reading contact form messages and managing Shopify stores.

```
index.html, stores.html, contact.html, blog.html  public pages
styles.css, script.js, chat.js, booking.js, blog.js
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

## Contact page and booked calls

`contact.html` has two tabs: **Send a message** (goes to admin > Messages) and **Book a call** (goes to admin > Bookings).
Visitors pick a date and time on a calendar. Times are shown in their own time zone, and a time that's already booked can't be booked again.
Link straight to the booking tab with `contact.html#book`.

In **admin > Bookings** you can confirm, cancel (the time opens up again), mark as completed, email the visitor or add the call to Google Calendar.
Set your days, start times, call length, time zone and notice period in **admin > Content > Booking settings**.

## Website content

**admin > Content** controls these homepage sections: Projects, Services, Testimonials, Client logos and Blog posts.
Add, edit, reorder, hide or delete items; upload images straight from the editor. A section with no visible items is hidden on the site.
Blog posts get their own page at `blog.html?post=ID`, and the 2 newest also show on the homepage.

## Live chat

The chat button sits on the bottom right of every public page. When a visitor sends a message it appears in
**/admin > Live chat** with an unread count, a sound and a count in the browser tab title. Reply there; the visitor sees it
within about 3 seconds. You can end, reopen or delete chats, and you can see the visitor's email (if they left it), the page they
started on and their thumbs up/down rating.

- Chats work by checking for new messages every few seconds (Vercel functions can't hold a live connection open).
  Checks only run while a chat is open, and they slow down when the tab is in the background.
- Visitors keep their chat across pages and reloads in the same browser.
- Keep the admin open in a tab to get the sound alerts. The badge checks every 15 seconds on any admin tab.
- To change the greeting, edit `GREETING` at the top of `chat.js`.

## Admin accounts (Team)

The account in `ADMIN_EMAIL` / `ADMIN_PASSWORD` is the **owner**. It always works, so you can't lock yourself out.
Sign in with it, open **My account** (your name, top right) and set your display name, since visitors see it in the chat.

Open **/admin > Team** to add more admins (name, email, password, role):

- **Admin**: messages, bookings, live chat, content and stores.
- **Super admin**: everything above, plus the Team page and taking over any chat.

Disabling an admin or setting a new password for them signs them out right away. Deleting or disabling an admin puts their open chats back in Unassigned.
Each admin can change their own name and password from **My account**.

## Live chat ownership

A new chat starts **Unassigned**. The first admin to select **Take this chat** (or simply reply) owns it; the visitor sees
"Alex joined the chat" and the admin's name on each reply. Other admins can still read the chat, but they can't reply, end it or delete it.

- **Mine** / **Unassigned** filters show what's yours and what still needs someone.
- The unread badge and sound only count chats that are yours or unassigned.
- **Release** puts a chat back in Unassigned. Super admins can **Take over** or **Unassign** any chat.
- Takeovers and releases are logged in the thread as notes that only admins can see.

## Live updates (no refresh needed)

Everything updates on its own while the page is open:

| Where | What updates | How often |
| --- | --- | --- |
| Admin > Live chat | chat list, open thread, who has each chat | every 3-4 seconds |
| Admin, any tab | Messages, Bookings and Live chat badges; your name and role | every 8 seconds |
| Admin > the section you're on | Messages, Bookings, Content, Stores, Team | every 8 seconds (paused while an editor is open) |
| Website: homepage, stores, blog | stores, projects, services, testimonials, client logos, posts | every 30 seconds |
| Contact > Book a call | available times (a slot someone just booked disappears) | every 30 seconds |
| Chat widget | replies, chat ended, and sync between the visitor's open tabs | every 3 seconds open, 15 seconds minimised |

Checks pause while the tab is in the background and run straight away when you come back to it.
Lists only redraw when something actually changed, so nothing jumps while you're reading or typing.

## Changing your password

Owner: change `ADMIN_PASSWORD` in Vercel and redeploy. Everyone signed in is signed out. Other admins: use **My account** in the dashboard.

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
