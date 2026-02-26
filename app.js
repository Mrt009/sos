const STORAGE_KEY = "sos.settings.v2";
const LAST_LOCATION_KEY = "sos.lastLocation.v2";
const PANIC_TEST_NUMBER = "+918700523035";

const DEFAULTS = {
  name: "",
  contacts: {
    fire: "101",
    flood: "108",
    earthquake: "112",
    medical: "108",
    unknown: PANIC_TEST_NUMBER
  },
  smsNumber: PANIC_TEST_NUMBER,
  guardianCall: "",
  guardianSms: ""
};

const nameInput = document.getElementById("nameInput");
const guardianCallInput = document.getElementById("guardianCallInput");
const guardianSmsInput = document.getElementById("guardianSmsInput");
const fireInput = document.getElementById("fireInput");
const floodInput = document.getElementById("floodInput");
const earthquakeInput = document.getElementById("earthquakeInput");
const medicalInput = document.getElementById("medicalInput");
const unknownInput = document.getElementById("unknownInput");
const smsInput = document.getElementById("smsInput");
const quickDialInput = document.getElementById("quickDialInput");
const saveBtn = document.getElementById("saveBtn");
const panicBtn = document.getElementById("panicBtn");
const directDialBtn = document.getElementById("directDialBtn");
const guardianCallBtn = document.getElementById("guardianCallBtn");
const guardianSmsBtn = document.getElementById("guardianSmsBtn");
const setupStatus = document.getElementById("setupStatus");
const runtimeStatus = document.getElementById("runtimeStatus");
const categoryButtons = document.querySelectorAll("[data-category]");

let volatileLocation = loadLastLocation();
let locationWatchId = null;

boot();

function boot() {
  hydrateForm();
  registerServiceWorker();
  requestLocationPermission(false);
  startLocationWatch();

  if (saveBtn) saveBtn.addEventListener("click", saveSettings);
  if (panicBtn) panicBtn.addEventListener("click", () => startSOS("unknown"));
  if (directDialBtn) directDialBtn.addEventListener("click", startDirectSOS);
  if (guardianCallBtn) guardianCallBtn.addEventListener("click", callGuardian);
  if (guardianSmsBtn) guardianSmsBtn.addEventListener("click", smsGuardian);

  categoryButtons.forEach((btn) => {
    btn.addEventListener("click", () => startSOS(btn.dataset.category || "unknown"));
  });

  if (volatileLocation) {
    setSetupStatus("Location detected and saved.");
  } else {
    setSetupStatus("Allow location when prompted for better SMS accuracy.");
  }
}

function setSetupStatus(text) {
  if (setupStatus) {
    setupStatus.textContent = text;
  }
}

function setRuntimeStatus(text) {
  if (runtimeStatus) {
    runtimeStatus.textContent = text;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch {
      // Ignore registration errors in demo mode.
    }
  });
}

function sanitizePhone(raw) {
  return String(raw || "")
    .trim()
    .replace(/[^\d+]/g, "")
    .replace(/(?!^)\+/g, "");
}

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return cloneDefaults();
    }

    const parsed = JSON.parse(saved);
    const contacts = parsed.contacts || {};

    return {
      name: parsed.name || "",
      contacts: {
        fire: DEFAULTS.contacts.fire,
        flood: DEFAULTS.contacts.flood,
        earthquake: DEFAULTS.contacts.earthquake,
        medical: DEFAULTS.contacts.medical,
        unknown: contacts.unknown || DEFAULTS.contacts.unknown
      },
      smsNumber: parsed.smsNumber || DEFAULTS.smsNumber,
      guardianCall: parsed.guardianCall || DEFAULTS.guardianCall,
      guardianSms: parsed.guardianSms || DEFAULTS.guardianSms
    };
  } catch {
    return cloneDefaults();
  }
}

function saveSettings() {
  const next = {
    name: nameInput.value.trim(),
    contacts: {
      fire: DEFAULTS.contacts.fire,
      flood: DEFAULTS.contacts.flood,
      earthquake: DEFAULTS.contacts.earthquake,
      medical: DEFAULTS.contacts.medical,
      unknown: sanitizePhone(unknownInput.value) || PANIC_TEST_NUMBER
    },
    smsNumber: sanitizePhone(smsInput.value) || PANIC_TEST_NUMBER,
    guardianCall: sanitizePhone(guardianCallInput.value),
    guardianSms: sanitizePhone(guardianSmsInput.value)
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  setSetupStatus("Saved offline settings.");
}

function hydrateForm() {
  const config = loadSettings();
  nameInput.value = config.name;
  guardianCallInput.value = config.guardianCall;
  guardianSmsInput.value = config.guardianSms;
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
    return saved ? JSON.parse(saved) : null;
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

function requestLocationPermission(showStatus) {
  if (!("geolocation" in navigator)) {
    if (showStatus) {
      setSetupStatus("Geolocation is not supported on this device/browser.");
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      storeLastLocation(pos.coords);
      if (showStatus) {
        setSetupStatus("Location updated.");
      }
    },
    () => {
      if (showStatus && !volatileLocation) {
        setSetupStatus("Location unavailable. SOS still works.");
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function startLocationWatch() {
  if (!("geolocation" in navigator) || locationWatchId !== null) {
    return;
  }

  locationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      storeLastLocation(pos.coords);
    },
    () => {},
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }
  );
}

function getLocationPayload() {
  if (!volatileLocation) {
    return {
      text: "unavailable",
      mapLink: ""
    };
  }

  const coords = `${volatileLocation.lat},${volatileLocation.lng}`;
  return {
    text: coords,
    mapLink: `https://maps.google.com/?q=${coords}`
  };
}

function getCallNumberForCategory(category, config) {
  return config.contacts[category] || config.contacts.unknown || PANIC_TEST_NUMBER;
}

function smsHref(number, body) {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const separator = isIOS ? "&" : "?";
  return `sms:${number}${separator}body=${encodeURIComponent(body)}`;
}

function buildSosMessage(category, config) {
  const location = getLocationPayload();
  const reporter = config.name || "Unknown person";
  const timestamp = new Date().toLocaleString();
  const networkHint = navigator.onLine
    ? "Internet available."
    : "Internet not available. Sending through cellular network.";

  return `SOS from ${reporter}. Category: ${category}. Time: ${timestamp}. GPS: ${location.text}. ${location.mapLink} ${networkHint}`;
}

function dialNumber(number) {
  const clean = sanitizePhone(number);
  if (!clean) {
    return false;
  }
  window.location.href = `tel:${clean}`;
  return true;
}

function openSms(number, message) {
  const clean = sanitizePhone(number);
  if (!clean) {
    return false;
  }
  window.location.href = smsHref(clean, message);
  return true;
}

function startSOS(category, directNumber) {
  const config = loadSettings();
  const selectedCategory = category || "unknown";
  const overrideNumber = sanitizePhone(directNumber || "");
  const callNumber = overrideNumber || getCallNumberForCategory(selectedCategory, config);
  const smsNumber = sanitizePhone(config.smsNumber) || callNumber;

  if (!callNumber) {
    setRuntimeStatus("No call number set. Add one in Setup first.");
    return;
  }

  requestLocationPermission(false);
  const smsBody = buildSosMessage(selectedCategory, config);

  setRuntimeStatus(`Dialing ${callNumber}. Then opening SMS to ${smsNumber}.`);

  dialNumber(callNumber);
  setTimeout(() => {
    openSms(smsNumber, smsBody);
  }, 1200);
}

function startDirectSOS() {
  const directNumber = sanitizePhone(quickDialInput ? quickDialInput.value : "");
  if (!directNumber) {
    setRuntimeStatus("Enter a direct emergency number first.");
    return;
  }
  startSOS("direct", directNumber);
}

function callGuardian() {
  const config = loadSettings();
  const number = sanitizePhone(config.guardianCall) || sanitizePhone(config.contacts.unknown);

  if (!number) {
    setRuntimeStatus("Guardian call number not set.");
    return;
  }

  setRuntimeStatus(`Dialing guardian: ${number}.`);
  dialNumber(number);
}

function smsGuardian() {
  const config = loadSettings();
  const number =
    sanitizePhone(config.guardianSms) ||
    sanitizePhone(config.guardianCall) ||
    sanitizePhone(config.smsNumber) ||
    sanitizePhone(config.contacts.unknown);

  if (!number) {
    setRuntimeStatus("Guardian SMS number not set.");
    return;
  }

  requestLocationPermission(false);
  const message = buildSosMessage("guardian-alert", config);
  setRuntimeStatus(`Opening SMS to guardian: ${number}.`);
  openSms(number, message);
}
