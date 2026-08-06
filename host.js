import { createApi, games } from "./shared.js";

const api = await createApi();
let hostPin = sessionStorage.getItem("webbing_host_pin") || "";
let dashboardData = null;
let toastTimer = null;
const $ = (selector) => document.querySelector(selector);

if (api.mode === "local") $("#hostPreviewBanner").hidden = false;

function showToast(message) {
  const toast = $("#hostToast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

async function loadDashboard() {
  dashboardData = await api.hostDashboard(hostPin);
  sessionStorage.setItem("webbing_host_pin", hostPin);
  $("#pinGate").hidden = true;
  $("#dashboard").hidden = false;
  renderDashboard();
}

function renderDashboard() {
  const guests = dashboardData.guests || [];
  $("#totalGuests").textContent = guests.length;
  for (const game of games) {
    const count = guests.filter((guest) => (guest.games || []).includes(game.key)).length;
    const target = game.key === "saran" ? "#saranCount" : game.key === "house" ? "#houseCount" : game.key === "bingo" ? "#bingoCount" : "#pinataCount";
    $(target).textContent = count;
  }
  $("#guestbookOpenToggle").checked = Boolean(dashboardData.guestbook_open);
  $("#gamesOpenToggle").checked = Boolean(dashboardData.games_open);
  renderGuestRows();
}

function renderGuestRows() {
  const query = $("#guestSearch").value.trim().toLowerCase();
  const guests = (dashboardData.guests || [])
    .filter((guest) => guest.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  const body = $("#guestTableBody");
  body.innerHTML = guests.map((guest) => `
    <tr data-id="${guest.id}">
      <td><input class="guest-name-input" type="text" maxlength="80" value="${escapeHtml(guest.name)}" aria-label="Guest name"></td>
      ${games.map((game) => `<td><input type="checkbox" data-game="${game.key}" ${(guest.games || []).includes(game.key) ? "checked" : ""} aria-label="${game.title}"></td>`).join("")}
      <td>
        <div class="guest-actions">
          <button class="icon-button save-guest" type="button">Save</button>
          <button class="icon-button danger delete-guest" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
  $("#emptyGuestList").hidden = (dashboardData.guests || []).length > 0;
}

$("#pinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  hostPin = $("#hostPin").value.trim();
  $("#pinError").textContent = "";
  try { await loadDashboard(); }
  catch (error) { $("#pinError").textContent = error.message || "Invalid host PIN."; }
});

$("#refreshButton").addEventListener("click", async () => {
  try { await loadDashboard(); showToast("Guest list refreshed."); }
  catch (error) { showToast(error.message); }
});

$("#guestSearch").addEventListener("input", renderGuestRows);

$("#hostAddGuestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#hostAddGuestName");
  try {
    await api.hostAddGuest(hostPin, input.value);
    input.value = "";
    await loadDashboard();
    showToast("Guest added.");
  } catch (error) { showToast(error.message); }
});

$("#guestTableBody").addEventListener("click", async (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  const id = row.dataset.id;
  if (event.target.closest(".save-guest")) {
    const name = row.querySelector(".guest-name-input").value.trim();
    const selectedGames = [...row.querySelectorAll("input[data-game]:checked")].map((input) => input.dataset.game);
    try {
      await api.hostUpdateGuest(hostPin, id, name, selectedGames);
      await loadDashboard();
      showToast("Guest updated.");
    } catch (error) { showToast(error.message); }
  }
  if (event.target.closest(".delete-guest")) {
    const name = row.querySelector(".guest-name-input").value.trim();
    if (!confirm(`Remove ${name} from the guestbook and all game lists?`)) return;
    try {
      await api.hostDeleteGuest(hostPin, id);
      await loadDashboard();
      showToast("Guest removed.");
    } catch (error) { showToast(error.message); }
  }
});

$("#saveSettingsButton").addEventListener("click", async () => {
  try {
    await api.hostSetOpen(hostPin, $("#guestbookOpenToggle").checked, $("#gamesOpenToggle").checked);
    await loadDashboard();
    showToast("Party settings saved.");
  } catch (error) { showToast(error.message); }
});

$("#copyNamesButton").addEventListener("click", async () => {
  const names = (dashboardData.guests || []).map((guest) => guest.name).sort((a, b) => a.localeCompare(b));
  try { await navigator.clipboard.writeText(names.join("\n")); showToast("All guest names copied."); }
  catch { showToast("Your browser blocked copying. Use Download CSV instead."); }
});

$("#downloadCsvButton").addEventListener("click", () => {
  const header = ["Guest Name", ...games.map((game) => game.title)];
  const rows = (dashboardData.guests || []).sort((a, b) => a.name.localeCompare(b.name)).map((guest) => [
    guest.name,
    ...games.map((game) => (guest.games || []).includes(game.key) ? "Yes" : "")
  ]);
  const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "webbing-party-guest-list.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});

$("#printButton").addEventListener("click", () => window.print());

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

if (hostPin) {
  try { await loadDashboard(); }
  catch { sessionStorage.removeItem("webbing_host_pin"); hostPin = ""; }
}
