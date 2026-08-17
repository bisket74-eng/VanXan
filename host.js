import { createApi, games, itinerary, anytimeActivities, getPartyTime, minutesFrom24h, config } from "./shared.js?v=8.0.0";

const api = await createApi();
const cfg = config();
const $ = (selector) => document.querySelector(selector);
let hostPin = sessionStorage.getItem("webbing_host_pin") || "";
let data = { guests: [], guestbook_open: true, games_open: true };
let bookEntries = [];
let activeBookIndex = 0;
let editingEntry = null;
let toastTimer = null;

if (api.mode === "local") $("#hostPreviewBanner").hidden = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function showToast(message) {
  const toast = $("#hostToast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.timeZone || "America/Los_Angeles",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatPrintDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: cfg.timeZone || "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function groupGuestbookEntries(guests) {
  const grouped = new Map();
  for (const guest of guests) {
    if (!guest.guestbook_entry_id) continue;
    const id = guest.guestbook_entry_id;
    if (!grouped.has(id)) {
      grouped.set(id, {
        id,
        names: [],
        message: guest.guestbook_message || "",
        photoPath: guest.guestbook_photo_path || "",
        created_at: guest.created_at,
        updated_at: guest.updated_at || guest.created_at
      });
    }
    const entry = grouped.get(id);
    entry.names.push(guest.name);
    if (guest.guestbook_message || !entry.message) entry.message = guest.guestbook_message || "";
    if (guest.guestbook_photo_path || !entry.photoPath) entry.photoPath = guest.guestbook_photo_path || "";
    if (String(guest.created_at || "") < String(entry.created_at || "")) entry.created_at = guest.created_at;
    if (String(guest.updated_at || "") > String(entry.updated_at || "")) entry.updated_at = guest.updated_at;
  }
  return [...grouped.values()]
    .map((entry) => ({ ...entry, names: [...new Set(entry.names)] }))
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

async function loadDashboard() {
  data = await api.hostDashboard(hostPin);
  sessionStorage.setItem("webbing_host_pin", hostPin);
  $("#pinGate").hidden = true;
  $("#dashboard").hidden = false;
  renderAll();
}

function getCurrentScheduleState() {
  const now = getPartyTime();
  const demo = new URLSearchParams(location.search).get("demo");
  let currentMinutes = now.minutes;
  let isEventDay = now.date === (cfg.eventDate || "2026-08-15");
  if (demo && /^\d{1,2}:\d{2}$/.test(demo)) {
    currentMinutes = minutesFrom24h(demo.padStart(5, "0"));
    isEventDay = true;
  }
  return { now, currentMinutes, isEventDay };
}

function renderAll() {
  const guests = data.guests || [];
  bookEntries = groupGuestbookEntries(guests);
  $("#signedInCount").textContent = guests.length;
  $("#signedInHeadingCount").textContent = guests.length;
  $("#guestbookEntryCount").textContent = bookEntries.length;
  $("#totalGameSignups").textContent = guests.reduce((sum, guest) => sum + (guest.games || []).length, 0);
  $("#guestbookOpenToggle").checked = Boolean(data.guestbook_open);
  $("#gamesOpenToggle").checked = Boolean(data.games_open);
  renderItinerary();
  renderGuestNames();
  renderGameLists();
  renderGuestbook();
}

function renderItinerary() {
  $("#hostItinerary").innerHTML = itinerary.map((item, index) => `
    <div class="host-itinerary-row" data-index="${index}">
      <time>${item.time}</time>
      <span>${escapeHtml(item.title)}</span>
      <em>Happening now</em>
    </div>
  `).join("");
  const anytimeBox = $("#hostAnytime");
  if (anytimeBox) {
    anytimeBox.innerHTML = anytimeActivities.map((item) => `
      <div class="host-anytime-row">
        <b aria-hidden="true">${item.icon}</b>
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.where)}</small></span>
      </div>
    `).join("");
  }
  updateHostItineraryHighlight();
}

function updateHostItineraryHighlight() {
  const { now, currentMinutes, isEventDay } = getCurrentScheduleState();
  $("#hostSummaryTime").textContent = now.label;
  $("#hostOpenTime").textContent = `Current time: ${now.label}`;
  const rows = [...document.querySelectorAll(".host-itinerary-row")];
  rows.forEach((row) => row.classList.remove("active", "past"));
  if (!isEventDay) return;
  itinerary.forEach((item, index) => {
    const start = minutesFrom24h(item.start);
    const end = minutesFrom24h(item.end);
    if (currentMinutes >= end) rows[index]?.classList.add("past");
    if (currentMinutes >= start && currentMinutes < end) rows[index]?.classList.add("active");
  });
}

function renderGuestNames() {
  const guests = (data.guests || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  $("#guestCards").innerHTML = guests.map((guest, index) => `
    <div class="host-name-row">
      <span>${index + 1}</span>
      <strong>${escapeHtml(guest.name)}</strong>
      <button class="host-delete-guest" type="button" data-delete-guest="${escapeHtml(guest.id)}" data-delete-name="${escapeHtml(guest.name)}" aria-label="Remove ${escapeHtml(guest.name)}">×</button>
    </div>
  `).join("");
  $("#emptyGuestList").hidden = guests.length > 0;
}

function renderGameLists() {
  const guests = (data.guests || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  $("#hostGameLists").innerHTML = games.map((game) => {
    const players = guests.filter((guest) => (guest.games || []).includes(game.key));
    return `
      <details class="host-game-card" data-game="${game.key}">
        <summary>
          <span><b aria-hidden="true">${game.icon}</b><span><strong>${escapeHtml(game.title)}</strong><small>${escapeHtml(game.detail)}</small></span></span>
          <strong class="game-count">${players.length}</strong>
        </summary>
        <div class="host-game-body">
          <div class="static-player-list">
            ${players.length ? players.map((guest, index) => `<div><span>${index + 1}</span><strong>${escapeHtml(guest.name)}</strong></div>`).join("") : `<p class="empty-state">No one is signed up yet.</p>`}
          </div>
          <button class="round-add-button game-add-toggle" type="button" data-game="${game.key}" aria-label="Add a player to ${escapeHtml(game.title)}">+</button>
          <form class="compact-add-form game-add-form" data-game="${game.key}" hidden>
            <label>Add a player manually</label>
            <div><input type="text" maxlength="80" placeholder="Player name" required><button class="primary-button" type="submit">Save</button></div>
          </form>
        </div>
      </details>`;
  }).join("");
}

function renderGuestbook() {
  const book = $("#guestbookBook");
  book.innerHTML = bookEntries.map((entry, index) => {
    const photoUrl = entry.photoPath ? api.publicPhotoUrl(entry.photoPath) : "";
    return `
      <article class="guestbook-page" data-entry-id="${entry.id}" data-index="${index}">
        <span class="page-web top-left" aria-hidden="true"></span><span class="page-web bottom-right" aria-hidden="true"></span>
        <div class="page-ornament">❦ ♡ ❦</div>
        <p class="guestbook-page-label">Savannah &amp; Xander’s Guestbook</p>
        ${photoUrl ? `<img class="guestbook-photo" src="${escapeHtml(photoUrl)}" alt="Guestbook photo from ${escapeHtml(entry.names.join(" and "))}">` : ""}
        <blockquote>${entry.message ? escapeHtml(entry.message) : "Congratulations and best of luck!"}</blockquote>
        <div class="guestbook-signature">${entry.names.map(escapeHtml).join(" &amp; ")}</div>
        <time>${escapeHtml(formatDate(entry.created_at))}</time>
        <button class="edit-book-message secondary-button" type="button">Edit Message</button>
      </article>`;
  }).join("");
  $("#emptyGuestbook").hidden = bookEntries.length > 0;
  if (!bookEntries.length) activeBookIndex = 0;
  else activeBookIndex = Math.min(activeBookIndex, bookEntries.length - 1);
  requestAnimationFrame(() => scrollBookTo(activeBookIndex, false));
  updateBookCounter();
}

function updateBookCounter() {
  $("#guestbookPageCounter").textContent = bookEntries.length ? `${activeBookIndex + 1} of ${bookEntries.length}` : "0 of 0";
  $("#previousPageButton").disabled = activeBookIndex <= 0;
  $("#nextPageButton").disabled = activeBookIndex >= bookEntries.length - 1;
}

function scrollBookTo(index, smooth = true) {
  const page = $("#guestbookBook").querySelector(`[data-index="${index}"]`);
  if (!page) return;
  activeBookIndex = index;
  page.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest", inline: "start" });
  updateBookCounter();
}

function downloadCsv() {
  const header = ["Guest Name", "Guestbook Message", "Photo", "Checked In", ...games.map((game) => game.title)];
  const rows = (data.guests || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((guest) => [
    guest.name,
    guest.guestbook_message || "",
    guest.guestbook_photo_path ? api.publicPhotoUrl(guest.guestbook_photo_path) : "",
    guest.created_at || "",
    ...games.map((game) => (guest.games || []).includes(game.key) ? "Yes" : "")
  ]);
  const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "webbing-party-guest-list.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

function buildGuestbookPrint() {
  let printRoot = document.getElementById("guestbookPrintRoot");
  if (!printRoot) {
    printRoot = document.createElement("div");
    printRoot.id = "guestbookPrintRoot";
    document.body.appendChild(printRoot);
  }

  const esc = escapeHtml;
  const chunks = [];
  for (let i = 0; i < bookEntries.length; i += 2) chunks.push(bookEntries.slice(i, i + 2));

  printRoot.innerHTML = chunks.map((pair, sheetIndex) => {
    const fronts = pair.map((entry) => {
      const photoUrl = entry.photoPath ? api.publicPhotoUrl(entry.photoPath) : "";
      const message = entry.message ? entry.message : "Congratulations and best of luck!";
      return `
        <article class="print-card print-front">
          <span class="print-floral print-floral-tl" aria-hidden="true"></span><span class="print-floral print-floral-tr" aria-hidden="true"></span><span class="print-floral print-floral-bl" aria-hidden="true"></span><span class="print-floral print-floral-br" aria-hidden="true"></span>
          <header class="print-page-header">
            <div class="print-page-title">Savannah <span aria-hidden="true">♥</span> Xander</div>
          </header>
          <div class="print-front-content">
            <div class="print-body-group">
              ${photoUrl ? `<img class="guestbook-photo" src="${esc(photoUrl)}" alt="Guestbook photo from ${esc(entry.names.join(" and "))}">` : ""}
              <blockquote class="print-message">${esc(message)}</blockquote>
              <div class="guestbook-signature">${entry.names.map(esc).join(" &amp; ")}</div>
            </div>
          </div>
          <time class="print-page-date">${esc(formatPrintDate(entry.created_at))}</time>
        </article>`;
    }).join("");

    const backs = pair.map(() => `
      <article class="print-card print-back">
        <span class="print-floral print-floral-tl" aria-hidden="true"></span><span class="print-floral print-floral-tr" aria-hidden="true"></span><span class="print-floral print-floral-bl" aria-hidden="true"></span><span class="print-floral print-floral-br" aria-hidden="true"></span>
        <div class="photo-stack" aria-label="Two 3 by 5 photo spots">
          <div class="photo-placeholder photo-one" aria-label="Top 3 by 5 photo spot"></div>
          <div class="photo-placeholder photo-two" aria-label="Bottom 3 by 5 photo spot"></div>
        </div>
      </article>`).join("");

    return `
      <section class="print-sheet print-sheet-front" data-sheet="${sheetIndex + 1}">${fronts}</section>
      <section class="print-sheet print-sheet-back" data-sheet="${sheetIndex + 1}">${backs}</section>`;
  }).join("");

  return printRoot;
}

async function waitForGuestbookPrintImages(root) {
  const images = [...root.querySelectorAll("img.guestbook-photo")];
  await Promise.all(images.map((img) => {
    if (img.complete) return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }));
}

function fitGuestbookPrintText() {
  const root = document.getElementById("guestbookPrintRoot");
  if (!root) return;

  const IN = 96;
  const MIN_MESSAGE = 12;
  const MAX_MESSAGE = 64;
  const MIN_SIGNATURE = 11;
  const MAX_SIGNATURE = 24;

  const measure = document.createElement("div");
  measure.setAttribute("aria-hidden", "true");
  measure.style.cssText = [
    "position:absolute",
    "left:-100000px",
    "top:0",
    "visibility:hidden",
    "box-sizing:border-box",
    "white-space:pre-wrap",
    "overflow-wrap:break-word",
    "word-break:normal",
    "text-align:center",
    "padding:0",
    "margin:0",
    "border:0"
  ].join(";");
  document.body.appendChild(measure);

  const fits = (fontSize, fontFamily, fontWeight, fontStyle, width, maxHeight, lineHeight, text) => {
    measure.style.width = `${width}px`;
    measure.style.fontFamily = fontFamily;
    measure.style.fontWeight = fontWeight;
    measure.style.fontStyle = fontStyle;
    measure.style.fontSize = `${fontSize}pt`;
    measure.style.lineHeight = String(lineHeight);
    measure.textContent = text || "";
    return measure.scrollHeight <= maxHeight + 1 && measure.scrollWidth <= width + 1;
  };

  const bestFontSize = ({ text, fontFamily, fontWeight, fontStyle, width, maxHeight, low, high, lineHeight }) => {
    let lo = low;
    let hi = high;
    let best = low;
    while (hi - lo > 0.10) {
      const mid = (lo + hi) / 2;
      if (fits(mid, fontFamily, fontWeight, fontStyle, width, maxHeight, lineHeight, text)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return best;
  };

  root.querySelectorAll(".print-front").forEach((card) => {
    const content = card.querySelector(".print-front-content");
    const group = card.querySelector(".print-body-group");
    const message = card.querySelector(".print-message");
    const signature = card.querySelector(".guestbook-signature");
    const photo = card.querySelector(".guestbook-photo");
    if (!content || !group || !message || !signature) return;

    // Use the actual laid-out 5x7 geometry. The front has a larger left
    // binding margin, so the usable writing width is the group's real width.
    const width = Math.max(220, group.getBoundingClientRect().width - 2);
    const contentHeight = Math.max(250, content.getBoundingClientRect().height);

    const sigStyle = getComputedStyle(signature);
    const sigMaxHeight = Math.max(28, Math.min(0.62 * IN, contentHeight * 0.14));
    const sigSize = bestFontSize({
      text: signature.textContent || "",
      fontFamily: sigStyle.fontFamily,
      fontWeight: sigStyle.fontWeight,
      fontStyle: sigStyle.fontStyle,
      width,
      maxHeight: sigMaxHeight,
      low: MIN_SIGNATURE,
      high: MAX_SIGNATURE,
      lineHeight: 1
    });
    signature.style.fontSize = `${sigSize.toFixed(2)}pt`;
    signature.style.lineHeight = "1";

    let photoHeight = 0;
    if (photo) {
      const naturalRatio = photo.naturalWidth && photo.naturalHeight
        ? photo.naturalHeight / photo.naturalWidth
        : 0.6;
      photoHeight = Math.min(1.25 * IN, Math.max(0.5 * IN, width * naturalRatio));
      photo.style.width = `${Math.min(3.55 * IN, width)}px`;
      photo.style.maxHeight = `${photoHeight}px`;
      photo.style.height = "auto";
      photo.style.objectFit = "contain";
    }

    const photoGap = photo ? 0.07 * IN : 0;
    const signatureGap = 0.10 * IN;
    // Give the message nearly all of the available vertical space. The
    // flex container then centers the complete message + signature group.
    const messageHeight = Math.max(
      1.15 * IN,
      contentHeight - photoHeight - photoGap - sigMaxHeight - signatureGap - 0.05 * IN
    );

    const msgStyle = getComputedStyle(message);
    const messageSize = bestFontSize({
      text: message.textContent || "",
      fontFamily: msgStyle.fontFamily,
      fontWeight: msgStyle.fontWeight,
      fontStyle: msgStyle.fontStyle,
      width,
      maxHeight: messageHeight,
      low: MIN_MESSAGE,
      high: MAX_MESSAGE,
      lineHeight: 1.03
    });

    message.style.fontSize = `${messageSize.toFixed(2)}pt`;
    message.style.lineHeight = "1.03";
    message.style.maxHeight = `${messageHeight}px`;
  });

  measure.remove();
}
function printMode(className) {
  if (className === "print-guestbook") buildGuestbookPrint();
  document.body.classList.add(className);
  const cleanup = () => {
    document.body.classList.remove(className);
    document.getElementById("guestbookPrintRoot")?.remove();
  };
  addEventListener("afterprint", cleanup, { once: true });
  requestAnimationFrame(async () => {
    requestAnimationFrame(async () => {
      if (className === "print-guestbook") {
        const root = document.getElementById("guestbookPrintRoot");
        await waitForGuestbookPrintImages(root);
        if (document.fonts?.ready) await document.fonts.ready;
        // Allow one layout frame after the web fonts are ready so the fitting
        // calculation uses the same typography that will actually print.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        fitGuestbookPrintText();
      }
      print();
      setTimeout(cleanup, 1500);
    });
  });
}

function toggleCompactForm(id) {
  const form = document.getElementById(id);
  if (!form) return;
  form.hidden = !form.hidden;
  if (!form.hidden) setTimeout(() => form.querySelector("input")?.focus(), 50);
}

$("#pinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  hostPin = $("#hostPin").value.trim();
  $("#pinError").textContent = "";
  try { await loadDashboard(); }
  catch (error) { $("#pinError").textContent = error.message || "The host page could not be opened."; }
});

$("#refreshButton").addEventListener("click", async () => {
  try { await loadDashboard(); showToast("Everything is refreshed."); }
  catch (error) { showToast(error.message); }
});

document.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-guest]");
  if (deleteButton) {
    const guestId = deleteButton.dataset.deleteGuest;
    const guestName = deleteButton.dataset.deleteName || "this guest";
    if (!guestId) return;
    const confirmed = confirm(`Remove ${guestName} completely?\n\nThis will remove the guest from the signed-in list and all game signups, and remove their guestbook entry from the host page.`);
    if (!confirmed) return;
    deleteButton.disabled = true;
    try {
      await api.hostDeleteGuest(hostPin, guestId);
      await loadDashboard();
      showToast(`${guestName} was removed.`);
    } catch (error) {
      deleteButton.disabled = false;
      showToast(error.message || "The guest could not be removed.");
    }
    return;
  }

  const toggle = event.target.closest("[data-toggle-form]");
  if (toggle) toggleCompactForm(toggle.dataset.toggleForm);

  const gameToggle = event.target.closest(".game-add-toggle[data-game]");
  if (gameToggle) {
    const card = gameToggle.closest(".host-game-card");
    const form = card?.querySelector(".game-add-form");
    if (form) {
      form.hidden = !form.hidden;
      if (!form.hidden) setTimeout(() => form.querySelector("input")?.focus(), 50);
    }
  }
});

$("#hostAddGuestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#hostAddGuestName");
  try {
    await api.hostAddGuest(hostPin, input.value);
    input.value = "";
    event.target.hidden = true;
    await loadDashboard();
    showToast("Guest added.");
  } catch (error) { showToast(error.message); }
});

$("#hostGameLists").addEventListener("submit", async (event) => {
  const form = event.target.closest(".game-add-form[data-game]");
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector("input");
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    await api.hostAddGameGuest(hostPin, form.dataset.game, input.value);
    input.value = "";
    form.hidden = true;
    await loadDashboard();
    showToast("Player added to the game.");
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; }
});

$("#copyNamesButton").addEventListener("click", async () => {
  const names = (data.guests || []).map((guest) => guest.name).sort((a, b) => a.localeCompare(b)).join("\n");
  try { await navigator.clipboard.writeText(names); showToast("All names copied."); }
  catch { showToast("Copy was blocked. Use Download instead."); }
});
$("#downloadCsvButton").addEventListener("click", downloadCsv);
$("#printListButton").addEventListener("click", () => printMode("print-signed-names"));
$("#printGuestbookButton").addEventListener("click", () => printMode("print-guestbook"));

$("#saveSettingsButton").addEventListener("click", async () => {
  try {
    await api.hostSetOpen(hostPin, $("#guestbookOpenToggle").checked, $("#gamesOpenToggle").checked);
    await loadDashboard();
    showToast("Access settings saved.");
  } catch (error) { showToast(error.message); }
});

$("#changePinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const oldPin = $("#oldPin").value.trim();
  const newPin = $("#newPin").value.trim();
  try {
    await api.hostChangePin(oldPin, newPin);
    hostPin = newPin;
    sessionStorage.setItem("webbing_host_pin", newPin);
    event.target.reset();
    showToast("Host PIN changed.");
  } catch (error) { showToast(error.message); }
});

$("#previousPageButton").addEventListener("click", () => scrollBookTo(Math.max(0, activeBookIndex - 1)));
$("#nextPageButton").addEventListener("click", () => scrollBookTo(Math.min(bookEntries.length - 1, activeBookIndex + 1)));
$("#guestbookBook").addEventListener("scroll", () => {
  const book = $("#guestbookBook");
  if (!bookEntries.length) return;
  const pageWidth = book.querySelector(".guestbook-page")?.getBoundingClientRect().width || book.clientWidth;
  const index = Math.round(book.scrollLeft / Math.max(1, pageWidth + 16));
  if (index !== activeBookIndex && index >= 0 && index < bookEntries.length) {
    activeBookIndex = index;
    updateBookCounter();
  }
}, { passive: true });

$("#guestbookBook").addEventListener("click", (event) => {
  const page = event.target.closest(".guestbook-page[data-entry-id]");
  if (!page || !event.target.closest(".edit-book-message")) return;
  editingEntry = bookEntries.find((entry) => entry.id === page.dataset.entryId);
  if (!editingEntry) return;
  $("#editMessageNames").textContent = editingEntry.names.join(" & ");
  $("#editMessageText").value = editingEntry.message || "";
  $("#editMessageError").textContent = "";
  $("#editMessageDialog").showModal();
});

$("#editMessageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editingEntry) return;
  try {
    await api.hostUpdateMessage(hostPin, editingEntry.id, $("#editMessageText").value);
    $("#editMessageDialog").close();
    await loadDashboard();
    showToast("Guestbook message saved.");
  } catch (error) { $("#editMessageError").textContent = error.message; }
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

setInterval(updateHostItineraryHighlight, 30000);

if (hostPin) {
  try { await loadDashboard(); }
  catch { sessionStorage.removeItem("webbing_host_pin"); hostPin = ""; }
}
