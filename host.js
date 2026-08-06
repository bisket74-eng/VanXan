import { createApi, games, itinerary } from "./shared.js?v=4.0.0";

const api = await createApi();
const $ = (selector) => document.querySelector(selector);
let hostPin = sessionStorage.getItem("webbing_host_pin") || "";
let data = { guests: [], guestbook_open: true, games_open: true };
let bookEntries = [];
let activeBookIndex = 0;
let editingEntry = null;
let toastTimer = null;

if (api.mode === "local") $("#hostPreviewBanner").hidden = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
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
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function groupGuestbookEntries(guests) {
  const grouped = new Map();
  for (const guest of guests) {
    if (!guest.guestbook_entry_id) continue;
    const id = guest.guestbook_entry_id;
    if (!grouped.has(id)) grouped.set(id, { id, names: [], message: guest.guestbook_message || "", created_at: guest.created_at, updated_at: guest.updated_at || guest.created_at });
    const entry = grouped.get(id);
    entry.names.push(guest.name);
    if (guest.guestbook_message || !entry.message) entry.message = guest.guestbook_message || "";
    if (String(guest.created_at || "") < String(entry.created_at || "")) entry.created_at = guest.created_at;
    if (String(guest.updated_at || "") > String(entry.updated_at || "")) entry.updated_at = guest.updated_at;
  }
  return [...grouped.values()].map((entry) => ({ ...entry, names: [...new Set(entry.names)] })).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

async function loadDashboard() {
  data = await api.hostDashboard(hostPin);
  sessionStorage.setItem("webbing_host_pin", hostPin);
  $("#pinGate").hidden = true;
  $("#dashboard").hidden = false;
  renderAll();
}

function renderAll() {
  const guests = data.guests || [];
  bookEntries = groupGuestbookEntries(guests);
  $("#totalGuests").textContent = guests.length;
  $("#messageCount").textContent = bookEntries.length;
  $("#guestbookOpenToggle").checked = Boolean(data.guestbook_open);
  $("#gamesOpenToggle").checked = Boolean(data.games_open);
  renderItinerary();
  renderGuestCards();
  renderGameLists();
  renderGuestbook();
}

function renderItinerary() {
  $("#hostItinerary").innerHTML = itinerary.map((item) => `<div><time>${item.time}</time><span>${escapeHtml(item.title)}</span></div>`).join("");
}

function renderGuestCards() {
  const query = $("#guestSearch").value.trim().toLowerCase();
  const guests = (data.guests || []).filter((guest) => guest.name.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name));
  $("#guestCards").innerHTML = guests.map((guest) => `
    <article class="host-guest-card" data-id="${guest.id}">
      <input class="guest-name-input" maxlength="80" value="${escapeHtml(guest.name)}" aria-label="Guest name">
      <div class="guest-card-actions"><button class="secondary-button save-guest" type="button">Save Name</button><button class="danger-button delete-guest" type="button">Delete</button></div>
    </article>
  `).join("");
  $("#emptyGuestList").hidden = guests.length > 0;
}

function renderGameLists() {
  const guests = (data.guests || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  $("#hostGameLists").innerHTML = games.map((game) => {
    const count = guests.filter((guest) => (guest.games || []).includes(game.key)).length;
    return `
      <details class="host-game-card" data-game="${game.key}">
        <summary><span>${game.icon} ${escapeHtml(game.title)}</span><strong>${count}</strong></summary>
        <div class="host-game-body">
          ${guests.length ? guests.map((guest) => `<label><input type="checkbox" value="${guest.id}" ${(guest.games || []).includes(game.key) ? "checked" : ""}><span>${escapeHtml(guest.name)}</span></label>`).join("") : `<p class="empty-state">No guests are signed in yet.</p>`}
          ${guests.length ? `<button class="primary-button save-game-list" type="button">Save ${escapeHtml(game.title)} List</button>` : ""}
        </div>
      </details>`;
  }).join("");
}

function renderGuestbook() {
  const book = $("#guestbookBook");
  book.innerHTML = bookEntries.map((entry, index) => `
    <article class="guestbook-page" data-entry-id="${entry.id}" data-index="${index}">
      <span class="page-web top-left" aria-hidden="true"></span><span class="page-web bottom-right" aria-hidden="true"></span>
      <div class="page-ornament">✦ ♡ ✦</div>
      <p class="guestbook-page-label">Savannah &amp; Xander’s Guestbook</p>
      <blockquote>${entry.message ? escapeHtml(entry.message) : "We were here to celebrate with you!"}</blockquote>
      <div class="guestbook-signature">${entry.names.map(escapeHtml).join(" &amp; ")}</div>
      <time>${escapeHtml(formatDate(entry.created_at))}</time>
      <button class="edit-book-message secondary-button" type="button">Edit This Message</button>
    </article>
  `).join("");
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
  const header = ["Guest Name", "Guestbook Message", "Checked In", ...games.map((game) => game.title)];
  const rows = (data.guests || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((guest) => [guest.name, guest.guestbook_message || "", guest.created_at || "", ...games.map((game) => (guest.games || []).includes(game.key) ? "Yes" : "")]);
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

$("#guestSearch").addEventListener("input", renderGuestCards);

$("#hostAddGuestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#hostAddGuestName");
  try { await api.hostAddGuest(hostPin, input.value); input.value = ""; await loadDashboard(); showToast("Guest added."); }
  catch (error) { showToast(error.message); }
});

$("#guestCards").addEventListener("click", async (event) => {
  const card = event.target.closest(".host-guest-card[data-id]");
  if (!card) return;
  const id = card.dataset.id;
  const guest = (data.guests || []).find((item) => item.id === id);
  if (!guest) return;
  if (event.target.closest(".save-guest")) {
    try { await api.hostUpdateGuest(hostPin, id, card.querySelector("input").value, guest.games || []); await loadDashboard(); showToast("Name saved."); }
    catch (error) { showToast(error.message); }
  }
  if (event.target.closest(".delete-guest")) {
    if (!confirm(`Delete ${guest.name} from attendance and every game list?`)) return;
    try { await api.hostDeleteGuest(hostPin, id); await loadDashboard(); showToast("Guest deleted."); }
    catch (error) { showToast(error.message); }
  }
});

$("#hostGameLists").addEventListener("click", async (event) => {
  const card = event.target.closest(".host-game-card[data-game]");
  if (!card || !event.target.closest(".save-game-list")) return;
  const gameKey = card.dataset.game;
  const selected = new Set([...card.querySelectorAll("input:checked")].map((input) => input.value));
  try {
    for (const guest of data.guests || []) {
      const current = new Set(guest.games || []);
      if (selected.has(guest.id)) current.add(gameKey); else current.delete(gameKey);
      await api.hostUpdateGuest(hostPin, guest.id, guest.name, [...current]);
    }
    await loadDashboard();
    showToast("Game list saved.");
  } catch (error) { showToast(error.message); }
});

$("#copyNamesButton").addEventListener("click", async () => {
  const names = (data.guests || []).map((guest) => guest.name).sort((a, b) => a.localeCompare(b)).join("\n");
  try { await navigator.clipboard.writeText(names); showToast("All names copied."); }
  catch { showToast("Copy was blocked. Use Download CSV instead."); }
});
$("#downloadCsvButton").addEventListener("click", downloadCsv);
$("#printListButton").addEventListener("click", () => printMode("print-signed-names"));
$("#printGuestbookButton").addEventListener("click", () => printMode("print-guestbook"));

$("#saveSettingsButton").addEventListener("click", async () => {
  try { await api.hostSetOpen(hostPin, $("#guestbookOpenToggle").checked, $("#gamesOpenToggle").checked); await loadDashboard(); showToast("Access settings saved."); }
  catch (error) { showToast(error.message); }
});

$("#changePinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const oldPin = $("#oldPin").value.trim();
  const newPin = $("#newPin").value.trim();
  try { await api.hostChangePin(oldPin, newPin); hostPin = newPin; sessionStorage.setItem("webbing_host_pin", newPin); event.target.reset(); showToast("Host PIN changed."); }
  catch (error) { showToast(error.message); }
});

$("#previousPageButton").addEventListener("click", () => scrollBookTo(Math.max(0, activeBookIndex - 1)));
$("#nextPageButton").addEventListener("click", () => scrollBookTo(Math.min(bookEntries.length - 1, activeBookIndex + 1)));
$("#guestbookBook").addEventListener("scroll", () => {
  const book = $("#guestbookBook");
  if (!bookEntries.length) return;
  const index = Math.round(book.scrollLeft / Math.max(1, book.clientWidth));
  if (index !== activeBookIndex && index >= 0 && index < bookEntries.length) { activeBookIndex = index; updateBookCounter(); }
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
  try { await api.hostUpdateMessage(hostPin, editingEntry.id, $("#editMessageText").value); $("#editMessageDialog").close(); await loadDashboard(); showToast("Guestbook message saved."); }
  catch (error) { $("#editMessageError").textContent = error.message; }
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

if (hostPin) {
  try { await loadDashboard(); }
  catch { sessionStorage.removeItem("webbing_host_pin"); hostPin = ""; }
}
