import { createApi, games, itinerary, getPartyTime, minutesFrom24h, config } from "./shared.js?v=6.0.0";

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
    <div class="host-name-row"><span>${index + 1}</span><strong>${escapeHtml(guest.name)}</strong></div>
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
        <blockquote>${entry.message ? escapeHtml(entry.message) : "Thank you for celebrating with us!"}</blockquote>
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

function printMode(className) {
  document.body.classList.add(className);
  const cleanup = () => document.body.classList.remove(className);
  addEventListener("afterprint", cleanup, { once: true });
  print();
  setTimeout(cleanup, 1500);
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

document.addEventListener("click", (event) => {
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
