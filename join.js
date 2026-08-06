import { createApi, games, itinerary, getPartyTime, minutesFrom24h, config } from "./shared.js?v=5.0.0";

const api = await createApi();
const cfg = config();
const $ = (selector) => document.querySelector(selector);
let deviceState = { guestbook_open: true, games_open: true, guestbook_message: "", guests: [] };
let activeGame = null;
let toastTimer = null;
let connectionOkay = true;

const guestbookDialog = $("#guestbookDialog");
const gameDialog = $("#gameDialog");
if (api.mode === "local") $("#previewBanner").hidden = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
}

function showConnectionError(error) {
  connectionOkay = false;
  const box = $("#connectionError");
  box.hidden = false;
  box.textContent = `The live guest list is not connected: ${error.message || error}`;
}

function renderItinerary() {
  $("#itineraryList").innerHTML = itinerary.map((item, index) => `
    <article class="itinerary-item" data-index="${index}">
      <time>${item.time}</time>
      <div>${escapeHtml(item.title)}</div>
      <span>Happening now</span>
    </article>
  `).join("");
  updateItineraryHighlight();
}

function updateItineraryHighlight() {
  const now = getPartyTime();
  $("#currentTimeLabel").textContent = `Current time: ${now.label}`;
  const demo = new URLSearchParams(location.search).get("demo");
  let currentMinutes = now.minutes;
  let isEventDay = now.date === (cfg.eventDate || "2026-08-15");
  if (demo && /^\d{1,2}:\d{2}$/.test(demo)) {
    currentMinutes = minutesFrom24h(demo.padStart(5, "0"));
    isEventDay = true;
  }
  const rows = [...document.querySelectorAll(".itinerary-item")];
  rows.forEach((row) => row.classList.remove("active", "past"));
  if (!isEventDay) return;
  itinerary.forEach((item, index) => {
    const start = minutesFrom24h(item.start);
    const end = minutesFrom24h(item.end);
    if (currentMinutes >= end) rows[index]?.classList.add("past");
    if (currentMinutes >= start && currentMinutes < end) rows[index]?.classList.add("active");
  });
}

function renderGames() {
  $("#gameList").innerHTML = games.map((game) => `
    <button class="game-row" type="button" data-game="${game.key}">
      <span class="game-icon" aria-hidden="true">${game.icon}</span>
      <span><strong>${escapeHtml(game.title)}</strong><small>${escapeHtml(game.detail)}</small></span>
      <span class="game-arrow" aria-hidden="true">›</span>
    </button>
  `).join("");
}

function addNameField(value = "") {
  const container = $("#guestNameFields");
  if (container.children.length >= 10) return showToast("You can enter up to ten names at once.");
  const row = document.createElement("div");
  row.className = "name-row";
  row.innerHTML = `
    <label class="sr-only">Guest name</label>
    <input type="text" maxlength="80" autocomplete="name" enterkeyhint="next" placeholder="Guest name" value="${escapeHtml(value)}">
    <button class="remove-name-button" type="button" aria-label="Remove this name">×</button>
  `;
  const input = row.querySelector("input");
  row.querySelector("button").addEventListener("click", () => {
    if (container.children.length === 1) input.value = "";
    else row.remove();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!input.value.trim()) return;
    const rows = [...container.querySelectorAll("input")];
    const index = rows.indexOf(input);
    if (index < rows.length - 1) rows[index + 1].focus();
    else if (rows.length < 10) {
      addNameField();
      container.lastElementChild.querySelector("input").focus();
    } else {
      $("#submitGuestbookButton").focus();
    }
  });
  container.appendChild(row);
}

function openGuestbook() {
  const errorLine = $("#guestbookFormError");
  errorLine.textContent = "";
  errorLine.hidden = true;
  const fields = $("#guestNameFields");
  fields.innerHTML = "";
  const existing = deviceState.guests || [];
  if (existing.length) existing.forEach((guest) => addNameField(guest.name));
  else addNameField();
  $("#guestbookMessage").value = deviceState.guestbook_message || "";
  $("#messageCharacterCount").textContent = $("#guestbookMessage").value.length;
  $("#submitGuestbookButton").textContent = existing.length ? "Update Check-In" : "Check Everyone In";
  guestbookDialog.showModal();
  const card = guestbookDialog.querySelector(".modal-card");
  card?.scrollTo({ top: 0, behavior: "auto" });
  setTimeout(() => fields.querySelector("input")?.focus(), 100);
}

async function refreshDeviceState() {
  deviceState = await api.getDeviceState();
  connectionOkay = true;
  $("#connectionError").hidden = true;
  const count = deviceState.guests?.length || 0;
  const button = $("#openGuestbookButton");
  button.disabled = !deviceState.guestbook_open;
  button.textContent = deviceState.guestbook_open ? (count ? "Update My Check-In" : "Sign the Guestbook") : "Guestbook Closed";
  if (!deviceState.guestbook_open) $("#guestbookStatus").textContent = "Guest check-in is currently closed.";
  else if (count) $("#guestbookStatus").textContent = `${count} ${count === 1 ? "person is" : "people are"} checked in from this phone.`;
  else $("#guestbookStatus").textContent = "";
  document.querySelectorAll(".game-row").forEach((row) => row.disabled = !deviceState.games_open);
}

function openGame(gameKey) {
  if (!deviceState.games_open) return showToast("Game signups are currently closed.");
  activeGame = games.find((game) => game.key === gameKey);
  if (!activeGame) return;
  $("#gameFormError").textContent = "";
  $("#gameDialogTitle").textContent = activeGame.title;
  const choices = $("#gameGuestChoices");
  choices.innerHTML = "";
  const guests = deviceState.guests || [];
  $("#noDeviceGuests").hidden = guests.length > 0;
  $("#gameSubmitBar").hidden = guests.length === 0;
  guests.forEach((guest) => {
    const label = document.createElement("label");
    label.className = "choice-item";
    label.innerHTML = `<input type="checkbox" value="${guest.id}" ${(guest.games || []).includes(gameKey) ? "checked" : ""}><span>${escapeHtml(guest.name)}</span>`;
    choices.appendChild(label);
  });
  gameDialog.showModal();
}

$("#openGuestbookButton").addEventListener("click", openGuestbook);
$("#addGuestFieldButton").addEventListener("click", () => {
  addNameField();
  $("#guestNameFields").lastElementChild.querySelector("input").focus();
});
$("#guestbookMessage").addEventListener("input", (event) => $("#messageCharacterCount").textContent = event.target.value.length);
$("#gameList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-game]");
  if (button) openGame(button.dataset.game);
});
$("#openGuestbookFromGame").addEventListener("click", () => { gameDialog.close(); openGuestbook(); });
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

$("#guestbookForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorLine = $("#guestbookFormError");
  errorLine.textContent = "";
  errorLine.hidden = true;
  const rawNames = [...$("#guestNameFields").querySelectorAll("input")].map((input) => input.value.trim()).filter(Boolean);
  const names = [...new Map(rawNames.map((name) => [name.toLowerCase(), name])).values()];
  const message = $("#guestbookMessage").value.trim();
  if (!names.length) {
    errorLine.textContent = "Please enter at least one guest name.";
    errorLine.hidden = false;
    guestbookDialog.querySelector(".modal-card")?.scrollTo({ top: 0, behavior: "smooth" });
    return $("#guestNameFields input")?.focus();
  }
  const button = $("#submitGuestbookButton");
  button.disabled = true;
  button.textContent = "Checking everyone in…";
  try {
    const result = await api.registerGuests(names, message);
    const rows = Array.isArray(result) ? result : (result?.rows || []);
    await refreshDeviceState();
    document.activeElement?.blur?.();
    guestbookDialog.close();
    $("#guestbookForm").reset();
    $("#messageCharacterCount").textContent = "0";
    const count = rows.length || names.length;
    showToast(result?.messageSaved === false
      ? `${count} ${count === 1 ? "person is" : "people are"} checked in. Run the V5 repair SQL to enable keepsake messages.`
      : `${count} ${count === 1 ? "person is" : "people are"} checked in.`);
  } catch (error) {
    const rawMessage = error?.message || "The names could not be saved.";
    const needsUpgrade = /webbing_register_guests|p_message|schema cache|could not find the function/i.test(rawMessage);
    errorLine.textContent = needsUpgrade
      ? "The guest list is connected, but it still needs the short Version 5 Supabase repair SQL. Run that repair once, refresh this page, and try again."
      : `Check-in was not saved: ${rawMessage}`;
    errorLine.hidden = false;
    guestbookDialog.querySelector(".modal-card")?.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Check-in was not saved. The exact error is shown at the top of the guestbook.");
  } finally {
    button.disabled = false;
    button.textContent = deviceState.guests?.length ? "Update Check-In" : "Check Everyone In";
  }
});

$("#gameForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeGame) return;
  const errorLine = $("#gameFormError");
  errorLine.textContent = "";
  const selectedIds = [...$("#gameGuestChoices").querySelectorAll("input:checked")].map((input) => input.value);
  const button = $("#saveGameButton");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await api.saveGame(activeGame.key, selectedIds);
    await refreshDeviceState();
    gameDialog.close();
    showToast(`${activeGame.title} signup saved.`);
  } catch (error) {
    errorLine.textContent = error.message || "The game signup could not be saved.";
  } finally {
    button.disabled = false;
    button.textContent = "Save Players";
  }
});

function syncVisualViewport() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--visible-height", `${height}px`);
}
window.visualViewport?.addEventListener("resize", syncVisualViewport);
window.addEventListener("resize", syncVisualViewport);
syncVisualViewport();

renderItinerary();
renderGames();
try { await refreshDeviceState(); }
catch (error) { showConnectionError(error); }
setInterval(updateItineraryHighlight, 30000);

