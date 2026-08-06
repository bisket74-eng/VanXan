SAVANNAH & XANDER ENGAGEMENT PARTY WEBSITE

WHAT IS INCLUDED
- join.html: public guest page for the poster QR code
- host.html: separate private host dashboard
- setup.sql: one-time Supabase database setup
- supabase-config.js: paste your Supabase URL and anon key here
- index.html: sends visitors to join.html
- all design, JavaScript, icons, PWA manifest, and service worker files

PUBLIC URL AFTER GITHUB PAGES IS TURNED ON
https://bisket74-eng.github.io/webbing/join.html

PRIVATE HOST URL
https://bisket74-eng.github.io/webbing/host.html
Do not put the host URL on the poster.

INITIAL HOST PIN
4826
You can change it from the bottom of host.html after Supabase is connected.

SUPABASE SETUP
1. Open the Supabase project you want to use.
2. Open SQL Editor.
3. Create a new query, paste the entire setup.sql file, and click Run.
4. Open Project Settings > API.
5. Copy the Project URL and anon/public key.
6. Open supabase-config.js and replace both PASTE_... values.

GITHUB SETUP
1. Create a repository named webbing under bisket74-eng.
2. Upload every file and the assets folder, keeping the folders exactly as shown.
3. Open repository Settings > Pages.
4. Choose Deploy from a branch, main, /(root), then Save.
5. Wait a minute or two and open the public URL above.

PREVIEW MODE
The files work before Supabase is connected, but data is then stored only in the current browser. A yellow preview warning appears. Connect Supabase before giving guests the QR code.

LIVE ITINERARY HIGHLIGHT
On August 15, 2026, the current activity highlights automatically using Pacific time.
For testing, add ?demo=18:22 to the guest URL, for example:
join.html?demo=18:22

GUESTBOOK AND GAMES
- Guests tap Sign the Guestbook and may enter up to ten individual names.
- Names do not appear publicly.
- The game list stays clean; tapping a game opens the names checked in from that phone.
- The host page can add, edit, delete, and move guests into or out of any game.
- Copy All Names makes it easy to paste attendance into the Bingo app.
