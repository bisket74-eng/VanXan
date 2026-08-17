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

PRINT-READY GUESTBOOK LAYOUT
- Print Guestbook creates 11 x 8.5 inch LANDSCAPE sheets.
- Two 5 x 7 inch pages are placed side-by-side with a 1/4 inch center cutting gap.
- Front pages have the wider left binding margin; back pages mirror it with the wider right binding margin.
- Front: Savannah ♥ Xander at the top, the message/signature centered in the remaining body area, and the date anchored at the bottom.
- Message text automatically scales to the largest size that fits without clipping; shorter messages stay larger.
- Optional guest photos remain on the front and are fitted without cropping.
- Back: cream background, matching thin floral border, and two clean 3 x 5 proportion photo boxes stacked vertically.
- Both sides use the purple/lavender flowers, greenery, gold accents, and cream palette of the party design.
- For physical duplex printing: Letter / Landscape / Double-sided / Flip on SHORT EDGE, then cut down the center gap.
- This print-layout update does not delete or modify existing guestbook database entries.
