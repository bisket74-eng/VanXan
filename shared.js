const CONFIG = window.WEBBING_CONFIG || {};
const LOCAL_DB_KEY = "webbing_local_db_v1";
const DEVICE_KEY = "webbing_device_id_v1";
const VALID_GAMES = ["saran", "house", "bingo", "pinata"];

export const games = [
  { key: "saran", title: "Saran Wrap Ball", icon: "◉", detail: "Tap to choose players" },
  { key: "house", title: "Build Us a House", icon: "⌂", detail: "Spaghetti-and-marshmallow challenge" },
  { key: "bingo", title: "Bingo", icon: "▦", detail: "Play during dessert" },
  { key: "pinata", title: "Piñata", icon: "☆", detail: "Tap to choose players" }
];

export const itinerary = [
  { start: "15:00", end: "15:45", time: "3:00–3:45 PM", title: "Arrival, Mingling & Hidden Ring Search Begins" },
  { start: "15:45", end: "16:15", time: "3:45–4:15 PM", title: "Breaking Bread with Savannah & Xander" },
  { start: "16:15", end: "16:45", time: "4:15–4:45 PM", title: "Saran Wrap Ball" },
  { start: "16:45", end: "17:30", time: "4:45–5:30 PM", title: "Build Us a House, Piñata, Dancing & Outdoor Fun" },
  { start: "17:30", end: "18:15", time: "5:30–6:15 PM", title: "Dinner & Guest Toasts" },
  { start: "18:15", end: "18:45", time: "6:15–6:45 PM", title: "Dessert & Bingo" },
  { start: "18:45", end: "19:00", time: "6:45–7:00 PM", title: "Ring Count & Prizes" },
  { start: "19:00", end: "20:00", time: "7:00–8:00 PM", title: "A Special Ending" }
];

function isConfigured() {
  return Boolean(
    CONFIG.supabaseUrl &&
    CONFIG.supabaseAnonKey &&
    !CONFIG.supabaseUrl.includes("PASTE_") &&
    !CONFIG.supabaseAnonKey.includes("PASTE_")
  );
}

function getDeviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function readLocalDb() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_DB_KEY)) || {
      pin: CONFIG.initialHostPin || "4826",
      guestbookOpen: true,
      gamesOpen: true,
      guests: [],
      signups: []
    };
  } catch {
    return { pin: CONFIG.initialHostPin || "4826", guestbookOpen: true, gamesOpen: true, guests: [], signups: [] };
  }
}
function writeLocalDb(db) { localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db)); }
function cleanName(value) { return value.trim().replace(/\s+/g, " ").slice(0, 80); }
function gameCheck(key) { if (!VALID_GAMES.includes(key)) throw new Error("Unknown game"); }

async function createSupabaseApi() {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const call = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || "The request could not be completed.");
    return data;
  };
  return {
    mode: "supabase",
    deviceId: getDeviceId(),
    registerGuests: (names) => call("webbing_register_guests", { p_device_id: getDeviceId(), p_names: names }),
    getDeviceState: () => call("webbing_get_device_state", { p_device_id: getDeviceId() }),
    saveGame: (gameKey, guestIds) => call("webbing_save_game", { p_device_id: getDeviceId(), p_game_key: gameKey, p_guest_ids: guestIds }),
    hostDashboard: (pin) => call("webbing_host_dashboard", { p_pin: pin }),
    hostAddGuest: (pin, name) => call("webbing_host_add_guest", { p_pin: pin, p_name: name }),
    hostUpdateGuest: (pin, id, name, gameKeys) => call("webbing_host_update_guest", { p_pin: pin, p_guest_id: id, p_name: name, p_games: gameKeys }),
    hostDeleteGuest: (pin, id) => call("webbing_host_delete_guest", { p_pin: pin, p_guest_id: id }),
    hostSetOpen: (pin, guestbookOpen, gamesOpen) => call("webbing_host_set_open", { p_pin: pin, p_guestbook_open: guestbookOpen, p_games_open: gamesOpen }),
    hostChangePin: (oldPin, newPin) => call("webbing_host_change_pin", { p_old_pin: oldPin, p_new_pin: newPin })
  };
}

function createLocalApi() {
  return {
    mode: "local",
    deviceId: getDeviceId(),
    async registerGuests(names) {
      const db = readLocalDb();
      if (!db.guestbookOpen) throw new Error("The guestbook is currently closed.");
      const deviceId = getDeviceId();
      const rows = [];
      for (const raw of names.slice(0, 10)) {
        const name = cleanName(raw);
        if (!name) continue;
        let guest = db.guests.find((g) => g.device_id === deviceId && g.name.toLowerCase() === name.toLowerCase());
        if (!guest) {
          guest = { id: crypto.randomUUID(), name, device_id: deviceId, created_at: new Date().toISOString() };
          db.guests.push(guest);
        }
        rows.push({ id: guest.id, name: guest.name });
      }
      writeLocalDb(db);
      return rows;
    },
    async getDeviceState() {
      const db = readLocalDb();
      const deviceId = getDeviceId();
      const guests = db.guests.filter((g) => g.device_id === deviceId).map((g) => ({
        id: g.id,
        name: g.name,
        games: db.signups.filter((s) => s.guest_id === g.id).map((s) => s.game_key)
      }));
      return { guestbook_open: db.guestbookOpen, games_open: db.gamesOpen, guests };
    },
    async saveGame(gameKey, guestIds) {
      gameCheck(gameKey);
      const db = readLocalDb();
      if (!db.gamesOpen) throw new Error("Game signups are currently closed.");
      const allowed = new Set(db.guests.filter((g) => g.device_id === getDeviceId()).map((g) => g.id));
      db.signups = db.signups.filter((s) => !(s.game_key === gameKey && allowed.has(s.guest_id)));
      for (const id of guestIds) if (allowed.has(id)) db.signups.push({ guest_id: id, game_key: gameKey, created_at: new Date().toISOString() });
      writeLocalDb(db);
      return { count: guestIds.length };
    },
    async hostDashboard(pin) {
      const db = readLocalDb();
      if (String(pin) !== String(db.pin)) throw new Error("Invalid host PIN.");
      return {
        guestbook_open: db.guestbookOpen,
        games_open: db.gamesOpen,
        guests: db.guests.map((g) => ({ ...g, games: db.signups.filter((s) => s.guest_id === g.id).map((s) => s.game_key) }))
      };
    },
    async hostAddGuest(pin, rawName) {
      const db = readLocalDb();
      if (String(pin) !== String(db.pin)) throw new Error("Invalid host PIN.");
      const name = cleanName(rawName);
      if (!name) throw new Error("Enter a guest name.");
      db.guests.push({ id: crypto.randomUUID(), name, device_id: `host-${crypto.randomUUID()}`, created_at: new Date().toISOString() });
      writeLocalDb(db);
      return true;
    },
    async hostUpdateGuest(pin, id, rawName, gameKeys) {
      const db = readLocalDb();
      if (String(pin) !== String(db.pin)) throw new Error("Invalid host PIN.");
      const guest = db.guests.find((g) => g.id === id);
      if (!guest) throw new Error("Guest not found.");
      guest.name = cleanName(rawName);
      db.signups = db.signups.filter((s) => s.guest_id !== id);
      for (const key of gameKeys.filter((k) => VALID_GAMES.includes(k))) db.signups.push({ guest_id: id, game_key: key, created_at: new Date().toISOString() });
      writeLocalDb(db);
      return true;
    },
    async hostDeleteGuest(pin, id) {
      const db = readLocalDb();
      if (String(pin) !== String(db.pin)) throw new Error("Invalid host PIN.");
      db.guests = db.guests.filter((g) => g.id !== id);
      db.signups = db.signups.filter((s) => s.guest_id !== id);
      writeLocalDb(db);
      return true;
    },
    async hostSetOpen(pin, guestbookOpen, gamesOpen) {
      const db = readLocalDb();
      if (String(pin) !== String(db.pin)) throw new Error("Invalid host PIN.");
      db.guestbookOpen = Boolean(guestbookOpen);
      db.gamesOpen = Boolean(gamesOpen);
      writeLocalDb(db);
      return true;
    },
    async hostChangePin(oldPin, newPin) {
      const db = readLocalDb();
      if (String(oldPin) !== String(db.pin)) throw new Error("Current PIN is incorrect.");
      db.pin = String(newPin);
      writeLocalDb(db);
      return true;
    }
  };
}

export async function createApi() {
  if (!isConfigured()) return createLocalApi();
  try { return await createSupabaseApi(); }
  catch (error) {
    console.error(error);
    return createLocalApi();
  }
}

export function getPartyTime() {
  const timeZone = CONFIG.timeZone || "America/Los_Angeles";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const labelFormatter = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return { date, minutes, label: labelFormatter.format(new Date()) };
}

export function minutesFrom24h(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function config() { return CONFIG; }
