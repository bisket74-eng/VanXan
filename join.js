import { createApi, games, itinerary, getPartyTime, minutesFrom24h, config } from "./shared.js";

const api = await createApi();
const cfg = config();
let deviceState = { guestbook_open: true, games_open: true, guests: [] };
let activeGame = null;
let toastTimer = null;

const $ = (selector) => document.querySelector(selector);
const guestbookDialog = $("#guestbookDialog");
const gameDialog = $("#gameDialog");

if (api.mode === "local") $("#previewBanner").hidden = false;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function renderItinerary() {
  const list = $("#itineraryList");
  list.innerHTML = itinerary.map((item, index) => `
    <article class="itinerary-item" data-index="${index}">
      <time class="itinerary-time">${item.time}</time>
      <div class="itinerary-title">${item.title}</div>
      <span class="itinerary-badge">Happening now</span>
    </article>
  `).join("");
  updateItineraryHighlight();
}

function updateItineraryHighlight() {
  const now = getPartyTime();
  $("#currentTimeLabel").textContent = `Current time: ${now.label}`;
  const demo = new URLSearchParams(location.search).get("demo");
  const eventDate = cfg.eventDate || "2026-08-15";
  let currentMinutes = now.minutes;
  let isEventDay = now.date === eventDate;
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
      <span><strong>${game.title}</strong><small>${game.detail}</small></span>
      <span class="game-arrow" aria-hidden="true">›</span>
    </button>
  `).join("");
}

function addNameField(value = "") {
  const container = $("#guestNameFields");
  if (container.children.length >= 10) {
    showToast("You can enter up to ten names at once.");
    return;
  }
  const row = document.createElement("div");
  row.className = "name-row";
  row.innerHTML = `
    <label class="sr-only">Guest name</label>
    <input type="text" maxlength="80" autocomplete="name" placeholder="Guest name" value="${escapeHtml(value)}" required>
    <button class="remove-name-button" type="button" aria-label="Remove this name">×</button>
  `;
  row.querySelector(".remove-name-button").addEventListener("click", () => {
    if (container.children.length === 1) row.querySelector("input").value = "";
    else row.remove();
  });
  container.appendChild(row);
}

function openGuestbook() {
  const fields = $("#guestNameFields");
  fields.innerHTML = "";
  addNameField();
  guestbookDialog.showModal();
  setTimeout(() => fields.querySelector("input")?.focus(), 60);
}

async function refreshDeviceState() {
  deviceState = await api.getDeviceState();
  const count = deviceState.guests?.length || 0;
  $("#guestbookStatus").textContent = count ? `${count} ${count === 1 ? "guest is" : "guests are"} checked in from this phone.` : "";
}

function openGame(gameKey) {
  activeGame = games.find((game) => game.key === gameKey);
  if (!activeGame) return;
  $("#gameDialogTitle").textContent = activeGame.title;
  $("#gameDialogCopy").textContent = "Select everyone from this phone who wants to play.";
  const choices = $("#gameGuestChoices");
  choices.innerHTML = "";
  const guests = deviceState.guests || [];
  $("#noDeviceGuests").hidden = guests.length > 0;
  $("#gameModalActions").hidden = guests.length === 0;
  for (const guest of guests) {
    const label = document.createElement("label");
    label.className = "choice-item";
    const checked = (guest.games || []).includes(gameKey) ? "checked" : "";
    label.innerHTML = `<input type="checkbox" value="${guest.id}" ${checked}><span>${escapeHtml(guest.name)}</span>`;
    choices.appendChild(label);
  }
  gameDialog.showModal();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

$("#openGuestbookButton").addEventListener("click", openGuestbook);
$("#addGuestFieldButton").addEventListener("click", () => addNameField());
$("#gameList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-game]");
  if (button) openGame(button.dataset.game);
});
$("#openGuestbookFromGame").addEventListener("click", () => {
  gameDialog.close();
  openGuestbook();
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});

$("#guestbookForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#submitGuestbookButton");
  const names = [...$("#guestNameFields").querySelectorAll("input")].map((input) => input.value.trim()).filter(Boolean);
  if (!names.length) return showToast("Please enter at least one name.");
  button.disabled = true;
  button.textContent = "Checking In…";
  try {
    const rows = await api.registerGuests(names);
    await refreshDeviceState();
    guestbookDialog.close();
    showToast(`${rows.length} ${rows.length === 1 ? "guest was" : "guests were"} checked in.`);
  } catch (error) {
    showToast(error.message || "The guestbook could not be saved.");
  } finally {
    button.disabled = false;
    button.textContent = "Check Everyone In";
  }
});

$("#gameForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeGame) return;
  const button = $("#saveGameButton");
  const selectedIds = [...$("#gameGuestChoices").querySelectorAll("input:checked")].map((input) => input.value);
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await api.saveGame(activeGame.key, selectedIds);
    await refreshDeviceState();
    gameDialog.close();
    showToast(`${activeGame.title} signup saved.`);
  } catch (error) {
    showToast(error.message || "The signup could not be saved.");
  } finally {
    button.disabled = false;
    button.textContent = "Save Players";
  }
});

renderItinerary();
renderGames();
await refreshDeviceState();
setInterval(updateItineraryHighlight, 30000);

if ("serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
}
