WEBBING HOST DELETE UPDATE

Replace these three files in the root of the GitHub webbing repository:
- host.html
- host.js
- styles.css

No assets folder is required.
No Supabase SQL rerun is required IF the Version 6 SQL was successfully run, because the existing webbing_host_delete_guest RPC is used.

What this adds:
- A small X beside every signed-in name on the Host > Signed-In Names panel.
- Confirmation before deletion.
- Deleting the guest removes the database guest record and all game signups through the existing host delete RPC, and therefore removes the guest from the host guestbook view too.
- The delete control exists only on the host page.
- Versioned URLs are bumped to 7.0.0 to reduce stale browser caching.
