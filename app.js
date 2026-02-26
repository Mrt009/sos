const STORAGE_KEY = "sos.settings.v1";
const LAST_LOCATION_KEY = "sos.lastLocation.v1";

const DEFAULTS = {
  name: "",
  contacts: {
    fire: "101",
    flood: "108",
    earthquake: "112",
    medical: "108",
    unknown: "112"
  },
  smsNumber: "112"
};

const nameInput = document.getElementById("nameInput");
const fireInput = document.getElementById("fireInput");
const floodInput = document.getElementById("floodInput");
const earthquakeInput = document.getElementById("earthquakeInput");
const medicalInput = document.getElementById("medicalInput");
const unknownInput = document.getElementById("unknownInput");
const smsInput = document.getElementById("smsInput");
const saveBtn = document.getElementById("saveBtn");
const locBtn = document.getElementById("locBtn");
const setupStatus = document.getElementById("setupStatus");
const runtimeStatus = document.getElementById("runtimeStatus");
const categoryButtons = document.querySelectorAll("[data-category]");

let volatileLocation = loadLastLocation();

boot();

function boot() {
  hydrateForm();
  registerServiceWorker();
  warmLocation();

  saveBtn.addEventListener("click", saveSettings);
  locBtn.addEventListener("click", requestLocationPermission);
  categoryButtons.forEach((btn) => {
    btn.addEventListener("click", () => startSOS(btn.dataset.category || "unknown"));
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch {
      // Ignore registration errors for demo mode.
    }
  });
}

function sanitizePhone(raw) {
  return String(raw || "")
    .trim()
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return cloneDefaults();
    }
    const parsed = JSON.parse(saved);
    return {
      name: parsed.name || "",
      contacts: {
        fire: parsed.contacts?.fire || DEFAULTS.contacts.fire,
        flood: parsed.contacts?.flood || DEFAULTS.contacts.flood,
        earthquake: parsed.contacts?.earthquake || DEFAULTS.contacts.earthquake,
        medical: parsed.contacts?.medical || DEFAULTS.contacts.medical,
        unknown: parsed.contacts?.unknown || DEFAULTS.contacts.unknown
      },
      smsNumber: parsed.smsNumber || DEFAULTS.smsNumber
    };
  } catch {
    return cloneDefaults();
  }
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function saveSettings() {
  const next = {
    name: nameInput.value.trim(),
    contacts: {
      fire: sanitizePhone(fireInput.value) || DEFAULTS.contacts.fire,
      flood: sanitizePhone(floodInput.value) || DEFAULTS.contacts.flood,
      earthquake: sanitizePhone(earthquakeInput.value) || DEFAULTS.contacts.earthquake,
      medical: sanitizePhone(medicalInput.value) || DEFAULTS.contacts.medical,
      unknown: sanitizePhone(unknownInput.value) || DEFAULTS.contacts.unknown
    },
    smsNumber: sanitizePhone(smsInput.value) || DEFAULTS.smsNumber
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  setupStatus.textContent = "Saved offline settings.";
}

function hydrateForm() {
  const config = loadSettings();
  nameInput.value = config.name;
  fireInput.value = config.contacts.fire;
  floodInput.value = config.contacts.flood;
  earthquakeInput.value = config.contacts.earthquake;
  medicalInput.value = config.contacts.medical;
  unknownInput.value = config.contacts.unknown;
  smsInput.value = config.smsNumber;
}

function loadLastLocation() {
  try {
    const saved = localStorage.getItem(LAST_LOCATION_KEY);
    if (!saved) {
      return null;
    }
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function storeLastLocation(coords) {
  const snapshot = {
    lat: Number(coords.latitude.toFixed(6)),
    lng: Number(coords.longitude.toFixed(6)),
    ts: Date.now()
  };
  volatileLocation = snapshot;
  localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(snapshot));
}

function warmLocation() {
  if (!("geolocation" in navigator)) {
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => storeLastLocation(pos.coords),
    () => {},
    { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 }
  );
}

async function requestLocationPermission() {
  if (!("geolocation" in navigator)) {
    setupStatus.textContent = "Geolocation not supported on this device/browser.";
    return;
  }

  setupStatus.textContent = "Requesting location permission...";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      storeLastLocation(pos.coords);
      setupStatus.textContent = "Location access granted and saved.";
    },
    () => {
      setupStatus.textContent = "Location permission denied or unavailable.";
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function formatLocationForMessage() {
  const loc = volatileLocation;
  if (!loc) {
    return "unavailable";
  }
  const ageMs = Date.now() - loc.ts;
  const ageSec = Math.max(1, Math.round(ageMs / 1000));
  return `${loc.lat},${loc.lng} (age ${ageSec}s)`;
}

function getCallNumberForCategory(category, config) {
  return config.contacts[category] || config.contacts.unknown || "112";
}

function smsHref(number, body) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const separator = isIOS ? "&" : "?";
  return `sms:${number}${separator}body=${encodeURIComponent(body)}`;
}

function startSOS(category) {
  const config = loadSettings();
  const selectedCategory = category || "unknown";
  const callNumber = getCallNumberForCategory(selectedCategory, config);
  const smsNumber = config.smsNumber || callNumber;
  const locationText = formatLocationForMessage();
  const now = new Date().toLocaleString();
  const reporter = config.name ? `${config.name}` : "Unknown person";
  const body = `SOS from ${reporter}. Category: ${selectedCategory}. Time: ${now}. Location: ${locationText}.`;

  runtimeStatus.textContent = `Opening call to ${callNumber} and SMS to ${smsNumber}...`;

  // Update location opportunistically for next attempt.
  warmLocation();

  window.location.href = `tel:${callNumber}`;
  setTimeout(() => {
    window.location.href = smsHref(smsNumber, body);
  }, 1200);
}
