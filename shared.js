const CONFIG = window.WEBBING_CONFIG || {};
const DEVICE_KEY = "webbing_party_device_v3";
const LOCAL_DB_KEY = "webbing_party_preview_v3";
const VALID_GAMES = ["saran", "house", "bingo", "pinata"];

export const itinerary = [
  { time: "3:00–3:45 PM", start: "15:00", end: "15:45", title: "Arrival, Mingling & Hidden Ring Search Begins" },
  { time: "3:45–4:15 PM", start: "15:45", end: "16:15", title: "Breaking Bread with Savannah & Xander" },
  { time: "4:15–4:45 PM", start: "16:15", end: "16:45", title: "Saran Wrap Ball" },
  { time: "4:45–5:30 PM", start: "16:45", end: "17:30", title: "Build Us a House, Piñata, Dancing & Outdoor Fun" },
  { time: "5:30–6:15 PM", start: "17:30", end: "18:15", title: "Dinner & Guest Toasts" },
  { time: "6:15–6:45 PM", start: "18:15", end: "18:45", title: "Dessert & Bingo" },
  { time: "6:45–7:00 PM", start: "18:45", end: "19:00", title: "Ring Count & Prizes" },
  { time: "7:00–8:00 PM", start: "19:00", end: "20:00", title: "A Special Ending" }
];

export const games = [
  { key: "saran", title: "Saran Wrap Ball", icon: "🧶", detail: "4:15–4:45 PM" },
  { key: "house", title: "Build Us a House", icon: "🏠", detail: "Spaghetti-and-marshmallow challenge" },
  { key: "bingo", title: "Bingo", icon: "▦", detail: "Played during dessert" },
  { key: "pinata", title: "Piñata", icon: "★", detail: "During the 4:45 activity block" }
];

function configured() {
  return Boolean(
    CONFIG.supabaseUrl &&
    CONFIG.supabaseAnonKey &&
    !String(CONFIG.supabaseUrl).includes("PASTE_") &&
    !String(CONFIG.supabaseAnonKey).includes("PASTE_")
  );
}

function getDeviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function cleanMessage(value) {
  return String(value || "").trim().slice(0, 1000);
}

function emptyLocalDb() {
  return {
    pin: CONFIG.initialHostPin || "4826",
    guestbookOpen: true,
    gamesOpen: true,
    guests: [],
    signups: []
  };
}

function readLocalDb() {
  try {
    return { ...emptyLocalDb(), ...(JSON.parse(localStorage.getItem(LOCAL_DB_KEY)) || {}) };
  } catch {
    return emptyLocalDb();
  }
}

function writeLocalDb(db) {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
}

async function createSupabaseApi() {
  const base = String(CONFIG.supabaseUrl).replace(/\/$/, "");
  const key = CONFIG.supabaseAnonKey;

  async function rpc(name, args) {
    let response;
    try {
      response = await fetch(`${base}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(args || {})
      });
    } catch {
      throw new Error("The party database could not be reached. Check the internet connection and try again.");
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); }
      catch { payload = text; }
    }

    if (!response.ok) {
      const message = payload?.message || payload?.details || payload?.hint || `Database request failed (${response.status}).`;
      throw new Error(message);
    }
    return payload;
  }

  return {
    mode: "supabase",
    deviceId: getDeviceId(),
    registerGuests: (names, message) => rpc("webbing_register_guests", {
      p_device_id: getDeviceId(),
      p_names: names,
      p_message: message
    }),
    getDeviceState: () => rpc("webbing_get_device_state", { p_device_id: getDeviceId() }),
    saveGame: (gameKey, guestIds) => rpc("webbing_save_game", {
      p_device_id: getDeviceId(),
      p_game_key: gameKey,
      p_guest_ids: guestIds
    }),
    hostDashboard: (pin) => rpc("webbing_host_dashboard", { p_pin: pin }),
    hostAddGuest: (pin, name) => rpc("webbing_host_add_guest", { p_pin: pin, p_name: name }),
    hostUpdateGuest: (pin, id, name, gameKeys) => rpc("webbing_host_update_guest", {
      p_pin: pin,
      p_guest_id: id,
      p_name: name,
      p_games: gameKeys
    }),
    hostDeleteGuest: (pin, id) => rpc("webbing_host_delete_guest", { p_pin: pin, p_guest_id: id }),
    hostUpdateMessage: (pin, entryId, message) => rpc("webbing_host_update_message", {
      p_pin: pin,
      p_entry_id: entryId,
      p_message: message
    }),
    hostSetOpen: (pin, guestbookOpen, gamesOpen) => rpc("webbing_host_set_open", {
      p_pin: pin,
      p_guestbook_open: guestbookOpen,
      p_games_open: gamesOpen
    }),
    hostChangePin: (oldPin, newPin) => rpc("webbing_host_change_pin", {
      p_old_pin: oldPin,
      p_new_pin: newPin
    })
  };
}

function createLocalApi() {
  return {
    mode: "local",
    deviceId: getDeviceId(),

    async registerGuests(rawNames, rawMessage) {
      const db = readLocalDb();
      if (!db.guestbookOpen) throw new Error("The guestbook is currently closed.");
      const names = [...new Map(rawNames.map(cleanName).filter(Boolean).map((name) => [name.toLowerCase(), name])).values()].slice(0, 10);
      if (!names.length) throw new Error("Please enter at least one guest name.");

      const deviceId = getDeviceId();
      const message = cleanMessage(rawMessage);
      const entryId = globalThis.crypto?.randomUUID?.() || `entry-${Date.now()}`;
      const now = new Date().toISOString();
      const wanted = new Set(names.map((name) => name.toLowerCase()));
      db.guests = db.guests.filter((guest) => guest.device_id !== deviceId || wanted.has(guest.name.toLowerCase()));
      const rows = [];

      for (const name of names) {
        let guest = db.guests.find((item) => item.device_id === deviceId && item.name.toLowerCase() === name.toLowerCase());
        if (!guest) {
          guest = {
            id: globalThis.crypto?.randomUUID?.() || `guest-${Date.now()}-${Math.random()}`,
            name,
            device_id: deviceId,
            guestbook_entry_id: entryId,
            guestbook_message: message,
            created_at: now,
            updated_at: now
          };
          db.guests.push(guest);
        } else {
          guest.name = name;
          guest.guestbook_entry_id = entryId;
          guest.guestbook_message = message;
          guest.updated_at = now;
        }
        rows.push({ id: guest.id, name: guest.name });
      }
      writeLocalDb(db);
      return rows;
    },

    async getDeviceState() {
      const db = readLocalDb();
      const own = db.guests.filter((guest) => guest.device_id === getDeviceId()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      const latest = [...own].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
      return {
        guestbook_open: db.guestbookOpen,
        games_open: db.gamesOpen,
        guestbook_message: latest?.guestbook_message || "",
        guests: own.map((guest) => ({
          id: guest.id,
          name: guest.name,
          games: db.signups.filter((item) => item.guest_id === guest.id).map((item) => item.game_key)
        }))
      };
    },

    async saveGame(gameKey, guestIds) {
      if (!VALID_GAMES.includes(gameKey)) throw new Error("Unknown game.");
      const db = readLocalDb();
      if (!db.gamesOpen) throw new Error("Game signups are currently closed.");
      const allowed = new Set(db.guests.filter((guest) => guest.device_id === getDeviceId()).map((guest) => guest.id));
      db.signups = db.signups.filter((item) => !(item.game_key === gameKey && allowed.has(item.guest_id)));
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
        guests: db.guests.map((guest) => ({
          ...guest,
          games: db.signups.filter((item) => item.guest_id === guest.id).map((item) => item.game_key)
        }))
      };
    },

    async hostAddGuest(pin, rawName) {
      const db = readLocalDb();
      if (String(pin) !== String(db.pin)) throw new Error("Invalid host PIN.");
      const name = cleanName(rawName);
      if (!name) throw new Error("Enter a guest name.");
      const now = new Date().toISOString();
      db.guests.push({
        id: globalThis.crypto?.randomUUID?.() || `guest-${Date.now()}`,
        name,
        device_id: `host-${Date.now()}-${Math.random()}`,
        guestbook_entry_id: null,
        guestbook_message: "",
        created_at: now,
        updated_at: now
      });
      writeLocalDb(db);
      return true;
    },

    async hostUpdateGuest(pin, id, rawName, gameKeys) {
      const db = readLocalDb();
      if (String(pin) !== String(db.pin)) throw new Error("Invalid host PIN.");
      const guest = db.guests.find((item) => item.id === id);
      if (!guest) throw new Error("Guest not found.");
      const name = cleanName(rawName);
      if (!name) throw new Error("Enter a guest name.");
      guest.name = name;
      guest.updated_at = new Date().toISOString();
      db.signups = db.signups.filter((item) => item.guest_id !== id);
      for (const key of gameKeys.filter((item) => VALID_GAMES.includes(item))) db.signups.push({ guest_id: id, game_key: key, created_at: new Date().toISOString() });
      writeLocalDb(db);
      return true;
    },

    async hostDeleteGuest(pin, id) {
      const db = readLocalDb();
      if (String(pin) !== String(db.pin)) throw new Error("Invalid host PIN.");
      db.guests = db.guests.filter((guest) => guest.id !== id);
      db.signups = db.signups.filter((item) => item.guest_id !== id);
      writeLocalDb(db);
      return true;
    },

    async hostUpdateMessage(pin, entryId, rawMessage) {
      const db = readLocalDb();
      if (String(pin) !== String(db.pin)) throw new Error("Invalid host PIN.");
      let changed = false;
      for (const guest of db.guests) {
        if (guest.guestbook_entry_id === entryId) {
          guest.guestbook_message = cleanMessage(rawMessage);
          guest.updated_at = new Date().toISOString();
          changed = true;
        }
      }
      if (!changed) throw new Error("Guestbook entry not found.");
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
  return configured() ? createSupabaseApi() : createLocalApi();
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
  const label = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date());
  return { date, minutes, label };
}

export function minutesFrom24h(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function config() {
  return CONFIG;
}
