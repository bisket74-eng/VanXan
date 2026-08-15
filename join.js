import { createApi, games, itinerary, anytimeActivities, getPartyTime, minutesFrom24h, config } from "./shared.js?v=8.0.0";

const api = await createApi();
const cfg = config();
const $ = (selector) => document.querySelector(selector);
let deviceState = { guestbook_open: true, games_open: true, guestbook_message: "", guestbook_photo_path: "", guests: [] };
let activeGame = null;
let toastTimer = null;
let selectedPhotoBlob = null;
let selectedPhotoUrl = "";
let existingPhotoPath = "";
let removeExistingPhoto = false;

const guestbookDialog = $("#guestbookDialog");
const gameDialog = $("#gameDialog");
if (api.mode === "local") $("#previewBanner").hidden = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
}

function showConnectionError(error) {
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

function renderAnytime() {
  $("#anytimeList").innerHTML = anytimeActivities.map((item) => `
    <article class="anytime-item">
      <span class="anytime-icon" aria-hidden="true">${item.icon}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.where)}</small>
        <p>${escapeHtml(item.detail)}</p>
      </div>
    </article>
  `).join("");
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

function clearPreviewObjectUrl() {
  if (selectedPhotoUrl?.startsWith("blob:")) URL.revokeObjectURL(selectedPhotoUrl);
  selectedPhotoUrl = "";
}

function showPhotoPreview(source) {
  const wrap = $("#photoPreviewWrap");
  const image = $("#photoPreview");
  if (!source) {
    wrap.hidden = true;
    image.removeAttribute("src");
    $("#addPhotoButton span:last-child").textContent = "Add a Photo";
    return;
  }
  image.src = source;
  wrap.hidden = false;
  $("#addPhotoButton span:last-child").textContent = "Choose a Different Photo";
}

async function imageToCompressedBlob(file) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 25 * 1024 * 1024) throw new Error("That photo is too large. Please choose a smaller photo.");

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    bitmap = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("That photo could not be opened."));
      image.src = url;
    }).finally(() => URL.revokeObjectURL(url));
  }

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let quality = 0.84;
  let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  while (blob && blob.size > 4.5 * 1024 * 1024 && quality > 0.55) {
    quality -= 0.1;
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  }
  if (!blob) throw new Error("That photo could not be prepared for upload.");
  return blob;
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

  clearPreviewObjectUrl();
  selectedPhotoBlob = null;
  removeExistingPhoto = false;
  existingPhotoPath = deviceState.guestbook_photo_path || "";
  showPhotoPreview(existingPhotoPath ? api.publicPhotoUrl(existingPhotoPath) : "");
  $("#guestPhotoInput").value = "";

  guestbookDialog.showModal();
  $("#guestbookDialog .modal-scroll")?.scrollTo({ top: 0, behavior: "auto" });
}

async function refreshDeviceState() {
  deviceState = await api.getDeviceState();
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
  $("#gameDialogTitle").textContent = `${activeGame.title} • ${activeGame.detail.split("•")[0].trim()}`;
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
$("#addPhotoButton").addEventListener("click", () => $("#guestPhotoInput").click());
$("#guestPhotoInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const errorLine = $("#guestbookFormError");
  errorLine.hidden = true;
  try {
    $("#addPhotoButton").disabled = true;
    $("#addPhotoButton span:last-child").textContent = "Preparing Photo…";
    selectedPhotoBlob = await imageToCompressedBlob(file);
    removeExistingPhoto = false;
    clearPreviewObjectUrl();
    selectedPhotoUrl = URL.createObjectURL(selectedPhotoBlob);
    showPhotoPreview(selectedPhotoUrl);
  } catch (error) {
    selectedPhotoBlob = null;
    errorLine.textContent = error.message || "The photo could not be prepared.";
    errorLine.hidden = false;
  } finally {
    $("#addPhotoButton").disabled = false;
  }
});
$("#removePhotoButton").addEventListener("click", () => {
  clearPreviewObjectUrl();
  selectedPhotoBlob = null;
  existingPhotoPath = "";
  removeExistingPhoto = true;
  $("#guestPhotoInput").value = "";
  showPhotoPreview("");
});
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
    $("#guestbookDialog .modal-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    return $("#guestNameFields input")?.focus();
  }

  const button = $("#submitGuestbookButton");
  button.disabled = true;
  try {
    let photoPath = removeExistingPhoto ? "" : existingPhotoPath;
    if (selectedPhotoBlob) {
      button.textContent = "Adding Photo…";
      photoPath = await api.uploadGuestbookPhoto(selectedPhotoBlob);
    }
    button.textContent = "Checking Everyone In…";
    const result = await api.registerGuests(names, message, photoPath);
    const rows = Array.isArray(result) ? result : (result?.rows || []);
    await refreshDeviceState();
    document.activeElement?.blur?.();
    clearPreviewObjectUrl();
    guestbookDialog.close();
    const count = rows.length || names.length;
    showToast(`${count} ${count === 1 ? "person is" : "people are"} checked in.`);
  } catch (error) {
    const rawMessage = error?.message || "The names could not be saved.";
    const needsUpgrade = /webbing_check_in_v6|p_photo_path|schema cache|could not find the function/i.test(rawMessage);
    errorLine.textContent = needsUpgrade
      ? "The website files are updated, but Supabase still needs the Version 6 upgrade SQL. Run that file once, refresh this page, and try again."
      : `Check-in was not saved: ${rawMessage}`;
    errorLine.hidden = false;
    $("#guestbookDialog .modal-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Check-in was not saved. The exact error is shown inside the guestbook.");
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
renderAnytime();
renderGames();
try { await refreshDeviceState(); }
catch (error) { showConnectionError(error); }
setInterval(updateItineraryHighlight, 30000);
