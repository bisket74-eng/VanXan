SAVANNAH & XANDER ENGAGEMENT PARTY WEBSITE — VERSION 4

THIS VERSION FIXES
- Guest names save when Check Everyone In is pressed.
- The guestbook window closes automatically after a successful save.
- Guests may enter up to ten names and one keepsake message.
- The host page has simple expandable sections: Itinerary, Signed-In Names, Game Signups, Guestbook, and Party Controls.
- The Guestbook opens as decorated swipeable pages with the message in script and the signers' names.
- Spider artwork is inline in the HTML so it cannot break because an image file is missing.
- Old service-worker caches are removed so phones do not keep showing the earlier broken version.
- The blurry modal backdrop and hidden sticky bottom button were removed.

IMPORTANT UPDATE ORDER
1. In Supabase, open SQL Editor > New query.
2. Paste the ENTIRE setup-or-upgrade.sql file and press Run.
3. Wait for a success message.
4. In GitHub, open the webbing repository.
5. Delete or replace the old site files with every file and folder from this package. Keep the assets folder.
6. Commit the changes.
7. Wait about two minutes for GitHub Pages.
8. On the phone, close the old tab completely and reopen join.html with ?v=4 added once.

GUEST PAGE
https://bisket74-eng.github.io/webbing/join.html?v=4

HOST PAGE
https://bisket74-eng.github.io/webbing/host.html?v=4
Initial PIN: 4826

TEST
- Open the guest page.
- Tap Sign the Guestbook.
- Enter a name and optional message.
- Tap Check Everyone In.
- The window should close and a success message should appear.
- Open the host page, enter 4826, open Signed-In Names, and confirm the name is present.
- Open Guestbook and swipe through the decorated message pages.
