// src/state/derive.ts
var ANC_SUB_FEATURES = {
  classic: { level: false, scenes: true, transVocal: true, wind: false, adaptive: false },
  "classic-a3035": { level: true, scenes: false, transVocal: false, wind: true, adaptive: true },
  "classic-a3040": { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  "tws-p30i": { level: true, scenes: true, transVocal: false, wind: true, adaptive: true },
  "tws-l4nc": { level: true, scenes: true, transVocal: true, wind: true, adaptive: true },
  "tws-l3pro": { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  "tws-a3062": { level: true, scenes: false, transVocal: false, wind: true, adaptive: true },
  "tws-a3936": { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  "tws-l4pro": { level: true, scenes: false, transVocal: false, wind: true, adaptive: false },
  "tws-p40i": { level: true, scenes: true, transVocal: true, wind: true, adaptive: true },
  "tws-l5": { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  "tws-a3968": { level: true, scenes: false, transVocal: true, wind: true, adaptive: true },
  "tws-d1202": { level: true, scenes: true, transVocal: true, wind: true, adaptive: true }
};
var NO_ANC_SUB = {
  level: false,
  scenes: false,
  transVocal: false,
  wind: false,
  adaptive: false
};
function deriveCapabilities(profile) {
  const tws = (profile.kind === "earbuds" || profile.kind === "open-ear") && profile.state.batteryRight !== null;
  return {
    supportsNoiseControl: profile.ancLayout !== "none",
    supportsEqualizer: profile.eqCommand !== null,
    supportsCustomEq: profile.eqCommand !== null && profile.customEq,
    supportsVolume: false,
    supportsGestures: false,
    supportsFactoryReset: profile.factoryReset === true,
    supportsEarbudState: tws,
    supportsPerEarbudBattery: tws,
    // `01:05` (serial + firmware) is implemented by every supported model.
    supportsFirmwareInfo: true,
    supportsGaming: profile.gaming,
    supportsSurround: profile.surround,
    supportsDual: profile.dual,
    supportsLdac: profile.ldac,
    ancSub: profile.ancLayout === "none" ? NO_ANC_SUB : (() => {
      const layout = ANC_SUB_FEATURES[profile.ancLayout];
      return {
        ...layout,
        // The layout describes which bytes exist; the profile describes
        // which values this exact SKU exposes in its OpenSCQ30 module.
        level: layout.level && profile.ancLevels,
        scenes: layout.scenes && profile.scenes,
        transVocal: layout.transVocal && profile.transparency,
        wind: layout.wind && profile.wind,
        adaptive: layout.adaptive && profile.ancLevels
      };
    })()
  };
}
function batteryLevel(value) {
  if (value === void 0 || value === 255 || value > 100) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}
function batteryPercent(level, scale, offset = 0) {
  if (level === null || level === void 0) return null;
  if (!Number.isFinite(level) || level < 0) return null;
  if (!Number.isFinite(offset) || offset < 0) return null;
  if (scale === "unknown") return null;
  if (scale !== null && scale !== void 0 && (!Number.isFinite(scale) || scale <= 0)) return null;
  const adjusted = level + offset;
  if (scale === null || scale === void 0 || adjusted > scale) {
    return Math.max(0, Math.min(100, Math.round(adjusted)));
  }
  return Math.round(adjusted * 100 / scale);
}
function presenceFromRaw(rawLeft, rawRight) {
  const side = (raw) => {
    if (raw === void 0) return "unknown";
    if (raw === 255) return "absent";
    if (!Number.isFinite(raw) || raw < 0 || raw > 100) return "unknown";
    return "present";
  };
  const left = side(rawLeft);
  const right = side(rawRight);
  if (left === "unknown" || right === "unknown") return "unknown";
  if (left === "present" && right === "present") return "both";
  if (left === "present") return "left";
  if (right === "present") return "right";
  return "none";
}
function emptyBattery() {
  return {
    left: null,
    right: null,
    casePercent: null,
    leftCharging: void 0,
    rightCharging: void 0,
    batteryScale: null,
    presence: "unknown"
  };
}
function mergeBatteryTelemetry(previous, frame) {
  const side = (raw) => {
    const level = batteryLevel(raw);
    return {
      trusted: level !== null,
      level
    };
  };
  const l = side(frame.rawLeft);
  const r = side(frame.rawRight);
  return {
    left: l.level,
    right: r.level,
    casePercent: frame.casePercent === void 0 ? previous.casePercent ?? null : frame.casePercent,
    // `undefined` means this frame legitimately carried no charging field, so
    // keep the last confirmed value. `null` means a charging field was present
    // but malformed, so clear it rather than retaining a misleading `true`.
    leftCharging: l.trusted ? frame.chargingLeft === void 0 ? previous.leftCharging : frame.chargingLeft : void 0,
    rightCharging: r.trusted ? frame.chargingRight === void 0 ? previous.rightCharging : frame.chargingRight : void 0,
    batteryScale: frame.scale,
    batteryOffset: frame.offset ?? previous.batteryOffset ?? 0,
    // Host-reported percentage is independent from the device's raw
    // telemetry and must survive protocol refreshes for the dedicated
    // Windows/Linux battery box.
    hostPercent: previous.hostPercent ?? null,
    presence: presenceFromRaw(frame.rawLeft, frame.rawRight)
  };
}
function deriveEarbudState(battery, caps) {
  if (!caps.supportsEarbudState) {
    const unavailable = { state: "unavailable", battery: null, charging: null };
    return { left: unavailable, right: unavailable, connection: "unavailable", supported: false };
  }
  const presence = battery.presence ?? "unknown";
  const side = (which) => {
    let state;
    if (presence === "unknown") state = "unknown";
    else if (presence === "both") state = "connected";
    else if (presence === "none") state = "disconnected";
    else state = presence === which ? "connected" : "disconnected";
    const raw = which === "left" ? battery.left : battery.right;
    const charging = which === "left" ? battery.leftCharging : battery.rightCharging;
    return {
      state,
      battery: state === "connected" ? batteryPercent(raw, battery.batteryScale, battery.batteryOffset ?? 0) : null,
      charging: state === "connected" && charging !== void 0 && charging !== null ? charging : null
    };
  };
  return { left: side("left"), right: side("right"), connection: presence, supported: true };
}
function parseSoundModes(payload, layout) {
  if (layout === "none") return null;
  const minimumLength = {
    classic: 4,
    "classic-a3035": 6,
    "classic-a3040": 6,
    "tws-p30i": 7,
    "tws-l4nc": 7,
    "tws-l3pro": 6,
    "tws-a3062": 6,
    "tws-a3936": 6,
    "tws-l4pro": 4,
    "tws-p40i": 7,
    "tws-l5": 7,
    "tws-a3968": 6,
    "tws-d1202": 8
  };
  if (payload.length < minimumLength[layout]) return null;
  const b0 = payload[0];
  if (b0 !== 0 && b0 !== 1 && b0 !== 2) return null;
  const report = {
    mode: b0 === 0 ? "anc" : b0 === 1 ? "transparency" : "normal"
  };
  const manual = payload[1] >> 4 & 15;
  if (layout === "tws-l4pro" && payload[1] >= 1 && payload[1] <= 5) {
    report.level = 6 - payload[1];
  } else if (layout === "tws-l4pro" && payload[1] >= 7 && payload[1] <= 11) {
    report.level = payload[1] - 6;
  } else if (manual >= 1 && manual <= 5) {
    report.level = manual;
  }
  if (b0 === 0 && (layout === "tws-p30i" || layout === "tws-l4nc" || layout === "tws-l3pro" || layout === "tws-a3062" || layout === "tws-a3936" || layout === "tws-p40i" || layout === "tws-l5" || layout === "tws-a3968" || layout === "tws-d1202" || layout === "classic-a3035" || layout === "classic-a3040") && payload.length >= 4 && payload[3] === 1) {
    report.mode = "adaptive";
  }
  if ((layout === "tws-l4nc" || layout === "tws-a3936" || layout === "tws-p40i" || layout === "tws-l5" || layout === "tws-a3968" || layout === "tws-d1202") && payload.length >= 5) {
    report.transVocal = (payload[2] & 1) !== 0;
    report.wind = (payload[4] & 1) !== 0;
  } else if ((layout === "tws-p30i" || layout === "tws-l3pro" || layout === "tws-a3062" || layout === "classic-a3035" || layout === "classic-a3040") && payload.length >= 5) {
    report.wind = (payload[4] & 1) !== 0;
    if (layout === "classic-a3040") report.transVocal = payload[2] === 0;
  } else if (layout === "tws-l4pro" && payload.length >= 4) {
    report.wind = (payload[3] & 1) !== 0;
  }
  if (layout === "classic" && payload.length >= 4) {
    report.transVocal = (payload[2] & 1) !== 0;
    const scene = payload[1];
    report.scene = scene === 0 ? "transport" : scene === 2 ? "indoor" : "outdoor";
  } else if (layout === "tws-p30i" || layout === "tws-p40i" || layout === "tws-d1202") {
    const scene = payload.length >= 7 ? payload[6] : 0;
    report.scene = scene === 0 ? "transport" : scene === 2 ? "indoor" : "outdoor";
  } else if (layout === "tws-l4nc" && payload.length >= 7) {
    const scene = payload[6];
    report.scene = scene === 0 ? "transport" : "outdoor";
  }
  return report;
}
function deriveConnectionPhase(input) {
  if (input.connected) return "connected";
  if (input.connecting) return "connecting";
  if (input.error) return "error";
  return "disconnected";
}
var INITIAL_SCAN_STATE = {
  helper: "checking",
  status: "idle",
  devices: [],
  message: null,
  lastScanAt: null
};
var EMPTY_SCAN_MESSAGE = "No paired Soundcore devices found. Pair them once in this computer\u2019s Bluetooth settings, then keep them connected and try again.";
function nextScanState(prev, event) {
  switch (event.type) {
    case "start":
      return { ...prev, status: "scanning", message: null };
    case "helper":
      return { ...prev, helper: event.online ? "online" : "offline" };
    case "results":
      return {
        ...prev,
        helper: "online",
        status: event.devices.length > 0 ? "results" : "empty",
        devices: event.devices,
        message: event.devices.length > 0 ? null : EMPTY_SCAN_MESSAGE,
        lastScanAt: event.at
      };
    case "error":
      return { ...prev, status: "error", message: event.message };
    case "helper-offline":
      return {
        ...prev,
        helper: "offline",
        status: "error",
        devices: [],
        message: event.message
      };
  }
}

// src/protocol/devices.ts
var P30I_STATE = {
  batteryLeft: 2,
  batteryRight: 3,
  batteryChargingLeft: 4,
  batteryChargingRight: 5,
  batteryCase: null,
  firmware: { at: 6, length: 10 },
  serial: { at: 16, length: 16 },
  eqPresetId: 32,
  eqBands: { at: 34, count: 10 },
  soundModes: 64,
  // Trailing block (OpenSCQ30 a3959 state_update.rs, Phase 18): buttons(8)
  // at 55…62, ambient_cycle 63, sound_modes 64…70, unknown 71, touch_tone
  // 72, dual_connections_enabled 73, surround_sound 74, auto_power_off 75,
  // low_battery_prompt 76, gaming_mode 77 (only when min firmware >= 01.60),
  // unknown(12) → payload is 90 bytes.
  dualConnections: 73,
  surround: 74,
  gaming: 77,
  gamingMinFirmware: "01.60"
};
var P20I_STATE = {
  batteryLeft: 2,
  batteryRight: 3,
  batteryChargingLeft: 4,
  batteryChargingRight: 5,
  batteryCase: null,
  firmware: { at: 6, length: 10 },
  serial: { at: 16, length: 16 },
  eqPresetId: 32,
  eqBands: { at: 34, count: 10 },
  soundModes: null,
  // Trailing block (OpenSCQ30 a3949 state_update.rs, Phase 18): unknown(11)
  // at 44…54, buttons(6) 55…60, unknown(4) 61…64, gaming_mode 65,
  // touch_tone 66 → payload is 67 bytes.
  gaming: 65
};
var LIBERTY4NC_STATE = {
  batteryLeft: 2,
  batteryRight: 3,
  batteryChargingLeft: 4,
  batteryChargingRight: 5,
  batteryCase: 139,
  firmware: { at: 6, length: 10 },
  serial: { at: 16, length: 16 },
  eqPresetId: 37,
  eqBands: { at: 39, count: 10 },
  soundModes: 126,
  soundModeLength: 7
};
var LIBERTY3PRO_STATE = {
  batteryLeft: 2,
  batteryRight: 3,
  batteryChargingLeft: 4,
  batteryChargingRight: 5,
  batteryCase: 129,
  firmware: { at: 6, length: 10 },
  serial: { at: 16, length: 16 },
  eqPresetId: 32,
  eqBands: { at: 34, count: 10 },
  soundModes: 120,
  soundModeLength: 6
};
var LIFE_P2_MINI_STATE = {
  batteryLeft: 2,
  batteryRight: 3,
  batteryChargingLeft: 4,
  batteryChargingRight: 5,
  batteryCase: 139,
  firmware: { at: 6, length: 10 },
  serial: { at: 16, length: 16 },
  eqPresetId: 37,
  eqBands: { at: 39, count: 10 },
  soundModes: 126,
  soundModeLength: 7,
  dualConnections: 121,
  surround: 125,
  gaming: 142
};
function overEarState(batteryAt = 0) {
  return {
    batteryLeft: batteryAt,
    batteryRight: null,
    batteryChargingLeft: null,
    batteryChargingRight: null,
    batteryCase: null,
    firmware: null,
    serial: null,
    eqPresetId: null,
    eqBands: null,
    soundModes: null
  };
}
var OPENSCQ30 = "OpenSCQ30 device definition";
function twsState(overrides = {}) {
  return {
    batteryLeft: 2,
    batteryRight: 3,
    batteryChargingLeft: 4,
    batteryChargingRight: 5,
    batteryCase: null,
    firmware: { at: 6, length: 10 },
    serial: { at: 16, length: 16 },
    eqPresetId: null,
    eqBands: null,
    soundModes: null,
    soundModeLength: 7,
    ...overrides
  };
}
function singleBodyState(firmware, serial, overrides = {}) {
  return {
    batteryLeft: 0,
    batteryRight: null,
    batteryChargingLeft: 1,
    batteryChargingRight: null,
    batteryCase: null,
    firmware,
    serial,
    eqPresetId: null,
    eqBands: null,
    soundModes: null,
    soundModeLength: 7,
    ...overrides
  };
}
function twsLevelState(overrides = {}) {
  return {
    batteryLeft: 2,
    batteryRight: 3,
    batteryChargingLeft: null,
    batteryChargingRight: null,
    batteryCase: null,
    firmware: { at: 4, length: 10 },
    serial: { at: 14, length: 16 },
    eqPresetId: null,
    eqBands: null,
    soundModes: null,
    soundModeLength: 7,
    ...overrides
  };
}
function catalogTwsState() {
  return {
    batteryLeft: 2,
    batteryRight: 3,
    batteryChargingLeft: null,
    batteryChargingRight: null,
    batteryCase: null,
    firmware: null,
    serial: null,
    eqPresetId: null,
    eqBands: null,
    soundModes: null
  };
}
var SPACE_A40_STATE = twsState({
  batteryCase: 118,
  eqPresetId: 32,
  eqBands: { at: 34, count: 20 },
  soundModes: 111,
  soundModeLength: 6,
  dualConnections: 121,
  gaming: 124
});
var LIBERTY4PRO_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 44,
  eqBands: { at: 46, count: 20 },
  soundModes: 125,
  soundModeLength: 4,
  dualConnections: 142
});
var P40I_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 38,
  eqBands: { at: 40, count: 20 },
  soundModes: 119,
  soundModeLength: 7,
  dualConnections: 135
});
var LIBERTY5_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 38,
  eqBands: { at: 40, count: 20 },
  soundModes: 119,
  dualConnections: 130,
  gaming: 146
});
var SPACE_ONE_PRO_STATE = singleBodyState(
  { at: 2, length: 5 },
  { at: 7, length: 16 },
  {
    eqPresetId: 23,
    eqBands: { at: 25, count: 10 },
    soundModes: 69,
    soundModeLength: 6,
    dualConnections: 79
  }
);
var Q11I_STATE = singleBodyState(
  { at: 2, length: 5 },
  { at: 7, length: 16 },
  {
    eqPresetId: 23,
    eqBands: { at: 25, count: 10 },
    dualConnections: 41
  }
);
var SPACE2_STATE = singleBodyState(
  { at: 2, length: 5 },
  { at: 11, length: 12 },
  { batteryChargingLeft: null }
);
var Q20I_STATE = {
  batteryLeft: 0,
  batteryRight: null,
  batteryChargingLeft: 1,
  batteryChargingRight: null,
  batteryCase: null,
  firmware: { at: 2, length: 5 },
  serial: { at: 7, length: 16 },
  eqPresetId: 23,
  eqBands: { at: 25, count: 10 },
  soundModes: 35,
  soundModeLength: 4
};
var LIFE_Q_STATE = {
  batteryLeft: 0,
  batteryRight: null,
  batteryChargingLeft: 1,
  batteryChargingRight: null,
  batteryCase: null,
  firmware: { at: 39, length: 5 },
  serial: { at: 44, length: 16 },
  eqPresetId: 2,
  eqBands: { at: 4, count: 8 },
  soundModes: 35,
  soundModeLength: 4
};
var LIFE_NOTE_3S_STATE = twsState({
  minimumLength: 72,
  exactLength: 72,
  eqPresetId: 32,
  eqBands: { at: 34, count: 20 },
  batteryCase: 69,
  gaming: 68
});
var C30I_STATE = twsLevelState({
  // A3330/C30i's level-only head is followed by the case byte at 35. The
  // late fields below are the offsets in the captured 01:01 state payload;
  // do not shift them to match the outbound 02:83 frame shape.
  batteryCase: 35,
  eqPresetId: 50,
  eqBands: { at: 52, count: 10 },
  // OpenSCQ30 parses this readable flag, but exposes no surround write module.
  surround: 44,
  dualConnections: 47
});
var AEROCLIP_STATE = twsLevelState({
  // A3388/AeroClip has one ten-band EQ block in its state update. Its outbound
  // 02:83 command is two-channel, but that command shape must not be reused
  // as a state-payload length or the real 66-byte telemetry frame is rejected.
  batteryCase: 35,
  eqPresetId: 50,
  eqBands: { at: 52, count: 10 },
  // Readable in the state packet only; the A3388 module does not document
  // SET_SURROUND_SOUND (02:86), so the profile capability remains false.
  surround: 44,
  dualConnections: 47
});
var V20I_STATE = twsLevelState({
  eqPresetId: 36,
  eqBands: { at: 38, count: 20 },
  gaming: 72,
  dualConnections: 74
});
var SPORT_X20_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 38,
  eqBands: { at: 40, count: 20 },
  soundModes: 117,
  soundModeLength: 6,
  surround: 126,
  dualConnections: 128
});
var C50I_STATE = twsLevelState({
  eqPresetId: 30,
  eqBands: { at: 32, count: 10 },
  dualConnections: 53
});
var P31I_STATE = twsState({
  batteryCase: 37,
  eqPresetId: 38,
  eqBands: { at: 40, count: 20 },
  soundModes: 119,
  soundModeLength: 8,
  dualConnections: 131
});
var SLEEP_A30_STATE = twsLevelState({ minimumLength: 150, exactLength: 150 });
function catalogOnly(id, name, sku, kind, names, source) {
  return {
    id,
    name,
    sku,
    kind,
    family: kind === "earbuds" ? "tws" : "classic",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: null,
    names,
    ancLayout: "none",
    eqCommand: null,
    customEq: false,
    state: kind === "earbuds" ? catalogTwsState() : overEarState(),
    source,
    verified: false
  };
}
var DEVICES = [
  {
    id: "life-note-3s-readonly",
    name: "Life Note 3S (read-only)",
    sku: "A3945",
    kind: "earbuds",
    family: "tws",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ["Life Note 3S", "A3945", "soundcore Life Note 3S"],
    ancLayout: "none",
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
    state: LIFE_NOTE_3S_STATE,
    source: `${OPENSCQ30} (a3945/packets/state_update_packet.rs): complete 72-byte 01:01 parse chain; case(69), gaming(68), BassUp(70), six button pairs(54..65). 04:81/04:84 and EQ writes intentionally blocked`,
    verified: true
  },
  {
    id: "c30i",
    name: "C30i",
    sku: "A3330",
    kind: "open-ear",
    family: "tws",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: true,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ["C30i", "A3330", "soundcore C30i"],
    ancLayout: "none",
    eqCommand: "02:83-single",
    customEq: true,
    caseBatteryMax: 5,
    state: C30I_STATE,
    source: `${OPENSCQ30} (a3330): dual_battery_level(5), case_battery_level(5), equalizer_with_drc (single channel), dual_connections; no sound-mode module`,
    verified: true
  },
  {
    id: "aeroclip",
    name: "AeroClip",
    sku: "A3388",
    kind: "open-ear",
    family: "tws",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: true,
    // A3388 state telemetry contains a readable surround byte, but the
    // OpenSCQ30 module deliberately does not register a surround writer:
    // 02:86 is not acknowledged and must never be advertised or sent.
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ["AeroClip", "A3388", "soundcore AeroClip"],
    ancLayout: "none",
    eqCommand: "02:83-dual",
    customEq: true,
    caseBatteryMax: 10,
    caseBatteryOffset: 1,
    state: AEROCLIP_STATE,
    source: `${OPENSCQ30} (a3388): dual_battery_level_custom(max 10, offset 1), case_battery_level_custom(max 10, offset 1), one ten-band state EQ block with two-channel outbound 02:83, dual_connections; surround is parsed read-only and has no documented write module`,
    verified: true
  },
  {
    id: "v20i",
    name: "V20i",
    sku: "A3876",
    kind: "open-ear",
    family: "tws",
    gaming: true,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: true,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ["V20i", "A3876", "soundcore V20i"],
    ancLayout: "none",
    eqCommand: "02:83-single",
    customEq: true,
    state: V20I_STATE,
    source: `${OPENSCQ30} (a3876): dual_battery_level_custom(max 10, offset 1), one-channel 02:83 DRC EQ applied to both buds, gaming, dual_connections`,
    verified: true
  },
  {
    id: "sport-x20",
    name: "Sport X20",
    sku: "A3968",
    kind: "earbuds",
    family: "tws",
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: false,
    dual: true,
    surround: true,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ["Sport X20", "A3968", "soundcore Sport X20"],
    ancLayout: "tws-a3968",
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
    state: SPORT_X20_STATE,
    source: `${OPENSCQ30} (a3968): six-byte named sound modes, dual_battery(5), case_battery_level(5), dual_connections and surround_sound; custom HearID EQ is not emitted by this app`,
    verified: true
  },
  {
    id: "c50i",
    name: "C50i",
    sku: "D1101",
    kind: "open-ear",
    family: "tws",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ["C50i", "D1101", "soundcore C50i"],
    ancLayout: "none",
    eqCommand: "02:81-dual",
    customEq: true,
    state: C50I_STATE,
    source: `${OPENSCQ30} (d1101): dual_battery_level_custom(max 10, offset 1), two-channel 02:81 EQ, dual_connections and LDAC`,
    verified: true
  },
  {
    id: "p31i",
    name: "P31i / R60i NC",
    sku: "D1202",
    kind: "earbuds",
    family: "tws",
    gaming: false,
    ancLevels: true,
    scenes: true,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 10,
    batteryOffset: 1,
    names: ["P31i", "R60i NC", "D1202", "D1202C", "soundcore P31i", "soundcore R60i NC"],
    ancLayout: "tws-d1202",
    // D1202 uses the source-backed 03:87 HearID/DSP transaction. SoundControl
    // emits only the documented disabled-HearID factory-preset form; custom
    // personalised HearID curves remain intentionally unavailable.
    eqCommand: "03:87",
    customEq: false,
    caseBatteryMax: 10,
    caseBatteryOffset: 1,
    state: P31I_STATE,
    source: `${OPENSCQ30} (d1202/d1202c): eight-byte named sound modes, dual_battery_custom(max 10, offset 1), case battery, LDAC, dual_connections and 03:87 two-channel EQ with disabled HearID factory-preset writes; personalised HearID remains read-only`,
    verified: true
  },
  {
    id: "sleep-a30",
    name: "Sleep A30",
    sku: "D1301",
    kind: "earbuds",
    family: "tws",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ["Sleep A30", "D1301", "soundcore Sleep A30"],
    ancLayout: "none",
    eqCommand: null,
    customEq: false,
    state: SLEEP_A30_STATE,
    source: `${OPENSCQ30} (d1301): dual_battery_level_custom(max 10, offset 1), sleep/listening-mode state; specialized sleep commands are not guessed by SoundControl`,
    verified: true
  },
  {
    id: "p30i",
    name: "P30i / R50i NC",
    sku: "A3959",
    kind: "earbuds",
    family: "tws",
    gaming: true,
    ancLevels: true,
    scenes: true,
    ldac: false,
    dual: true,
    surround: true,
    wind: true,
    transparency: false,
    batteryMax: 10,
    names: ["P30i", "R50i NC", "A3959", "soundcore P30i", "soundcore R50i NC"],
    ancLayout: "tws-p30i",
    eqCommand: "02:83",
    customEq: true,
    state: P30I_STATE,
    source: `${OPENSCQ30} (a3959): dual_battery(10), a3959_sound_modes (NC=0/Transparency=1/Normal=2, manual+adaptive, wind), equalizer_with_drc_tws with custom preset 0xFEFE, gaming_mode (state byte 77, firmware >= 01.60), dual_connections (73), surround_sound (74)`,
    verified: true
  },
  {
    id: "life-p2-mini",
    name: "Life P2 Mini",
    sku: "A3944",
    kind: "earbuds",
    family: "tws",
    gaming: true,
    ancLevels: true,
    scenes: true,
    ldac: false,
    dual: true,
    surround: true,
    wind: true,
    transparency: false,
    batteryMax: 5,
    names: ["Life P2 Mini", "A3944", "soundcore Life P2 Mini"],
    ancLayout: "tws-p30i",
    eqCommand: "02:83",
    customEq: true,
    state: LIFE_P2_MINI_STATE,
    source: `${OPENSCQ30} (a3944): a3944_sound_modes, case_battery_level(5), equalizer_with_drc_tws with custom preset 0xFEFE, button configuration module, gaming_mode, dual_connections, surround_sound; 02:83 EQ command with 0xFEFE custom preset support`,
    verified: true
  },
  {
    id: "p20i",
    name: "P20i / P25i / R50i",
    sku: "A3949",
    kind: "earbuds",
    family: "tws",
    gaming: true,
    // A3949 registers no sound-mode module at all, so the ANC buttons must
    // stay hidden rather than send a frame the firmware discards.
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ["P20i", "P25i", "R50i", "A3949", "soundcore P20i", "soundcore P25i", "soundcore R50i"],
    ancLayout: "none",
    eqCommand: "02:83",
    // OpenSCQ30 a3949.rs: equalizer_with_drc_tws with custom_preset_id: None
    // — "device doesn't support custom presets". None of the 22 live P20i
    // captures uses the FEFE custom id either (all factory presets 00..16),
    // so custom curves stay OFF for this family: factory presets only.
    customEq: false,
    state: P20I_STATE,
    source: `${OPENSCQ30} (a3949): no sound-modes module (no ANC/transparency), equalizer_with_drc_tws WITHOUT custom presets, gaming_mode (state byte 65), dual_battery(5); 22 live 02:83 factory-preset captures in victor-oliveira1/soundcore_anker_equalyzer (RFCOMM channel 10)`,
    verified: true
  },
  {
    id: "a20i",
    name: "A20i",
    sku: "A3948",
    kind: "earbuds",
    family: "tws",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ["A20i", "A3948", "soundcore A20i"],
    ancLayout: "none",
    eqCommand: "02:83",
    customEq: true,
    state: P20I_STATE,
    source: `${OPENSCQ30} (a3948): equalizer_with_drc_tws (common_settings_type_2, custom preset 0xFEFE), dual_battery(5), no gaming mode`,
    verified: true
  },
  {
    id: "a30i",
    name: "A30i",
    sku: "A3958",
    kind: "earbuds",
    family: "tws",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ["A30i", "A3958", "soundcore A30i"],
    ancLayout: "none",
    eqCommand: "02:83",
    customEq: true,
    state: P20I_STATE,
    source: `${OPENSCQ30} (a3958): dual_battery(5), equalizer_with_drc_tws with custom preset 0xFEFE; faker fixture provides RFCOMM UUID and sample state packet`,
    verified: true
  },
  {
    id: "liberty-4-nc",
    name: "Liberty 4 NC",
    sku: "A3947",
    kind: "earbuds",
    family: "tws",
    gaming: true,
    ancLevels: true,
    scenes: false,
    ldac: false,
    dual: false,
    surround: true,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ["Liberty 4 NC", "A3947", "soundcore Liberty 4 NC"],
    ancLayout: "tws-l4nc",
    // A3947 writes EQ only via the model-specific 03:87 HearID frame.
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
    state: LIBERTY4NC_STATE,
    source: `${OPENSCQ30} (a3947): a3947_sound_modes, case_battery_level(5), EQ over 03:87 only`,
    verified: true
  },
  {
    id: "liberty-3-pro",
    name: "Liberty 3 Pro",
    sku: "A3952",
    kind: "earbuds",
    family: "tws",
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: false,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ["Liberty 3 Pro", "A3952", "soundcore Liberty 3 Pro"],
    ancLayout: "tws-l3pro",
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
    state: LIBERTY3PRO_STATE,
    source: `${OPENSCQ30} (a3952): a3952_sound_modes, ldac, equalizer_with_custom_hear_id_tws`,
    verified: true
  },
  {
    id: "space-a40",
    name: "Space A40",
    sku: "A3936",
    kind: "earbuds",
    family: "tws",
    gaming: true,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ["Space A40", "A3936", "soundcore Space A40"],
    ancLayout: "tws-a3936",
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 10,
    state: SPACE_A40_STATE,
    source: `${OPENSCQ30} (a3936): six-byte sound modes, dual_battery(5), LDAC, dual_connections, gaming, case battery, custom HearID EQ module (not emitted by this app)`,
    verified: true
  },
  {
    id: "liberty-4-pro",
    name: "Liberty 4 Pro",
    sku: "A3954",
    kind: "earbuds",
    family: "tws",
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: false,
    batteryMax: 100,
    names: ["Liberty 4 Pro", "A3954", "soundcore Liberty 4 Pro"],
    ancLayout: "tws-l4pro",
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 10,
    caseBatteryOffset: 1,
    state: LIBERTY4PRO_STATE,
    source: `${OPENSCQ30} (a3954): four-byte slider sound modes (ANC 1..5 maps to slider 5..1; transparency 7..11), LDAC, dual connections; model-specific HearID EQ is intentionally read-only`,
    verified: true
  },
  {
    id: "p40i",
    name: "P40i",
    sku: "A3955",
    kind: "earbuds",
    family: "tws",
    gaming: false,
    ancLevels: true,
    scenes: true,
    ldac: false,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ["P40i", "A3955", "soundcore P40i"],
    ancLayout: "tws-p40i",
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 5,
    state: P40I_STATE,
    source: `${OPENSCQ30} (a3955): seven-byte sound modes with multi-scene ANC, dual_battery(5), dual connections; specialized EQ/HearID fields are not guessed`,
    verified: true
  },
  {
    id: "liberty-5",
    name: "Liberty 5",
    sku: "A3957",
    kind: "earbuds",
    family: "tws",
    gaming: true,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 10,
    batteryOffset: 1,
    names: ["Liberty 5", "A3957", "soundcore Liberty 5"],
    ancLayout: "tws-l5",
    eqCommand: null,
    customEq: false,
    caseBatteryMax: 10,
    caseBatteryOffset: 1,
    state: LIBERTY5_STATE,
    source: `${OPENSCQ30} (a3957): seven-byte sound modes, dual_battery_custom(max 10, offset 1), LDAC, dual connections, gaming over 10:85; EQ/HearID writes intentionally disabled`,
    verified: true
  },
  {
    id: "space-one-pro",
    name: "Space One Pro",
    sku: "A3062",
    kind: "overear",
    family: "classic",
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ["Space One Pro", "A3062", "soundcore Space One Pro"],
    ancLayout: "tws-a3062",
    eqCommand: null,
    customEq: false,
    state: SPACE_ONE_PRO_STATE,
    source: `${OPENSCQ30} (a3062): six-byte custom-transparency sound modes, single_battery_custom(max 10, offset 1), LDAC, dual connections; model-specific EQ/HearID is not guessed`,
    verified: true
  },
  {
    id: "q20i",
    name: "Q20i",
    sku: "A3004",
    kind: "overear",
    family: "classic",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ["Q20i", "A3004", "soundcore Q20i"],
    ancLayout: "classic",
    eqCommand: "02:83",
    customEq: true,
    state: Q20I_STATE,
    source: `${OPENSCQ30} (a3004): four-byte ambient sound modes, single_battery(5), equalizer_with_drc; no ANC level/scene or transparency sub-mode controls are exposed`,
    verified: true
  },
  {
    id: "q11i",
    name: "Q11i",
    sku: "A3005",
    kind: "overear",
    family: "classic",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: true,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ["Q11i", "A3005", "soundcore Q11i"],
    ancLayout: "none",
    eqCommand: "02:83",
    customEq: true,
    state: Q11I_STATE,
    source: `${OPENSCQ30} (a3005): equalizer_with_drc, dual connections, auto power-off, single_battery_custom(max 10, offset 1); no sound-mode module`,
    verified: true
  },
  {
    id: "space-2-readonly",
    name: "Space 2 (read-only)",
    sku: "D1402",
    kind: "overear",
    family: "classic",
    gaming: false,
    ancLevels: false,
    scenes: false,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 10,
    batteryOffset: 1,
    names: ["Space 2", "D1402", "soundcore Space 2"],
    ancLayout: "none",
    eqCommand: null,
    customEq: false,
    state: SPACE2_STATE,
    source: "soundcorebridge protocol-map.md: D1402 read state/battery/LDAC responses are known, but every write requires the verified 05:01/05:81/18:85 unlock sequence and specialized 03:87 EQ template; this profile is deliberately read-only until that transport is implemented",
    verified: true
  },
  {
    id: "space-one",
    name: "Space One",
    sku: "A3035",
    kind: "overear",
    family: "classic",
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: false,
    batteryMax: 5,
    names: ["Space One", "A3035", "soundcore Space One"],
    ancLayout: "classic-a3035",
    eqCommand: null,
    customEq: false,
    state: overEarState(),
    source: `${OPENSCQ30} (a3035): a3035_sound_modes, ldac, single_battery_level(5), EQ over 03:87 only`,
    verified: true
  },
  {
    id: "q45",
    name: "Space Q45",
    sku: "A3040",
    kind: "overear",
    family: "classic",
    gaming: false,
    ancLevels: true,
    scenes: false,
    ldac: true,
    dual: true,
    surround: false,
    wind: true,
    transparency: true,
    batteryMax: 5,
    names: ["Q45", "Space Q45", "A3040", "soundcore Space Q45"],
    ancLayout: "classic-a3040",
    eqCommand: null,
    customEq: false,
    state: overEarState(),
    source: `${OPENSCQ30} (a3040): a3040_sound_modes, ldac, dual_connections, single_battery_level(5)`,
    verified: true
  },
  {
    id: "q35",
    name: "Life Q35",
    sku: "A3027",
    kind: "overear",
    family: "classic",
    gaming: false,
    ancLevels: false,
    scenes: true,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ["Q35", "Life Q35", "A3027", "soundcore Life Q35"],
    ancLayout: "classic",
    eqCommand: "02:81",
    // FEFE custom curves documented for the 02:81 command (OpenSCQ30
    // set_equalizer custom test vector, SoundcoreDesktop EQGain()).
    customEq: true,
    state: LIFE_Q_STATE,
    source: `${OPENSCQ30} (a3027): classic 4-byte sound modes at state offset 35, single_battery(5) at offset 0, equalizer(common_settings)`,
    verified: true
  },
  {
    id: "q30",
    name: "Life Q30",
    sku: "A3028",
    kind: "overear",
    family: "classic",
    gaming: false,
    ancLevels: false,
    scenes: true,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ["Q30", "Life Q30", "A3028", "Soundcore Life Q30"],
    ancLayout: "classic",
    eqCommand: "02:81",
    // FEFE custom curves documented for the 02:81 command (OpenSCQ30
    // set_equalizer custom test vector, SoundcoreDesktop EQGain()).
    customEq: true,
    state: LIFE_Q_STATE,
    source: `${OPENSCQ30} (a3028) + live frames in JordanViknar/Noiseclapper-GNOME and DamienStaebler/SoundcoreDesktop: classic 4-byte modes at state offset 35, battery at offset 0`,
    verified: true
  },
  {
    id: "life-tune",
    name: "Life Tune",
    sku: "A3029",
    kind: "overear",
    family: "classic",
    gaming: false,
    ancLevels: false,
    scenes: true,
    ldac: false,
    dual: false,
    surround: false,
    wind: false,
    transparency: false,
    batteryMax: 5,
    names: ["Life Tune", "A3029", "soundcore Life Tune"],
    ancLayout: "classic",
    eqCommand: "02:81",
    // FEFE custom curves documented for the 02:81 command (OpenSCQ30
    // set_equalizer custom test vector, SoundcoreDesktop EQGain()).
    customEq: true,
    state: LIFE_Q_STATE,
    source: "OpenSCQ30 routes A3029 through the A3028 (Life Q30) implementation: classic 4-byte modes at state offset 35 and battery at offset 0; name from its own i18n entry",
    verified: true
  },
  // Official US/EU catalog identities with no public packet layout yet. These
  // rows deliberately resolve the exact SKU to a read-only catalog profile:
  // 01:05 identity and 01:03 presence reads remain available, while every
  // model-specific control stays disabled until a capture proves its bytes.
  catalogOnly("liberty-buds", "Liberty Buds", "D1200", "earbuds", ["Liberty Buds", "D1200", "soundcore Liberty Buds"], "Official soundcore catalog identity (EU/current regional listing); packet layout not published in the sources used here."),
  catalogOnly("liberty-5-pro", "Liberty 5 Pro", "D1203", "earbuds", ["Liberty 5 Pro", "D1203", "soundcore Liberty 5 Pro"], "Official soundcore US catalog/product identity; exact D1203 packet layout is not published in the sources used here."),
  catalogOnly("liberty-5-pro-max", "Liberty 5 Pro Max", "D1204", "earbuds", ["Liberty 5 Pro Max", "D1204", "soundcore Liberty 5 Pro Max"], "Official soundcore US catalog identity; exact D1204 packet layout is not published in the sources used here."),
  catalogOnly("p42i", "P42i", "D1205", "earbuds", ["P42i", "D1205", "soundcore P42i"], "Official soundcore US catalog/product identity; exact D1205 packet layout is not published in the sources used here."),
  catalogOnly("liberty-buds-2", "Liberty Buds 2", "D1206", "earbuds", ["Liberty Buds 2", "D1206", "soundcore Liberty Buds 2"], "Official soundcore US catalog/product identity; exact D1206 packet layout is not published in the sources used here."),
  catalogOnly("sleep-a20", "Sleep A20", "A6611", "earbuds", ["Sleep A20", "A6611", "soundcore Sleep A20"], "Official soundcore US catalog identity; exact A6611 sleep-earbud packet layout is not published in the sources used here."),
  catalogOnly("aeroclip-2", "AeroClip 2", "D1105", "earbuds", ["AeroClip 2", "D1105", "soundcore AeroClip 2", "AeroClip2"], "Official soundcore US open-ear catalog/product identity; exact D1105 packet layout is not published in the sources used here."),
  catalogOnly("aerofit-2", "AeroFit 2", "A3874", "earbuds", ["AeroFit 2", "A3874", "A3874X", "AeroFit 2 AI Assistant", "soundcore AeroFit 2", "soundcore AeroFit 2 AI Assistant"], "Official soundcore US catalog identity; AeroFit 2 AI Assistant is a regional/feature SKU alias of A3874, not a second protocol family."),
  catalogOnly("aerofit-2-pro", "AeroFit 2 Pro", "A3875", "earbuds", ["AeroFit 2 Pro", "A3875", "soundcore AeroFit 2 Pro"], "Official soundcore US/EU product identity; exact A3875 packet layout is not published in the sources used here."),
  catalogOnly("aerofit-pro", "AeroFit Pro", "A3871", "earbuds", ["AeroFit Pro", "A3871", "soundcore AeroFit Pro"], "Official soundcore US/EU product identity; exact A3871 packet layout is not published in the sources used here."),
  catalogOnly("aerofit", "AeroFit", "A3872", "earbuds", ["AeroFit", "A3872", "soundcore AeroFit"], "Official soundcore EU product identity; exact A3872 packet layout is not published in the sources used here."),
  catalogOnly("c40i", "C40i", "A3331", "earbuds", ["C40i", "A3331", "soundcore C40i"], "Official soundcore US/EU catalog/support identity; exact A3331 packet layout is not published in the sources used here."),
  catalogOnly("v30i", "V30i", "A3873", "earbuds", ["V30i", "A3873", "soundcore V30i"], "Official soundcore US open-ear catalog identity; exact A3873 packet layout is not published in the sources used here."),
  catalogOnly("v40i", "V40i", "A3878", "earbuds", ["V40i", "A3878", "soundcore V40i"], "Official soundcore US open-ear catalog identity; exact A3878 packet layout is not published in the sources used here."),
  catalogOnly("k20i", "K20i", "A3994", "earbuds", ["K20i", "A3994", "soundcore K20i"], "Official soundcore EU catalog/support identity; exact A3994 packet layout is not published in the sources used here."),
  catalogOnly("space-2-pro", "Space 2 Pro", "D1406", "overear", ["Space 2 Pro", "D1406", "soundcore Space 2 Pro"], "Official soundcore US catalog/product identity; exact D1406 packet layout is not published in the sources used here."),
  catalogOnly("q31i", "Q31i", "D1404", "overear", ["Q31i", "D1404", "soundcore Q31i"], "Official soundcore US/EU product/support identity; exact D1404 packet layout is not published in the sources used here."),
  catalogOnly("h30i", "H30i", "A3012", "overear", ["H30i", "A3012", "soundcore H30i"], "Official soundcore EU product/support identity; exact A3012 packet layout is not published in the sources used here."),
  catalogOnly("life-q20", "Life Q20", "A3025", "overear", ["Life Q20", "A3025", "soundcore Life Q20"], "Official soundcore EU product/support identity; exact A3025 packet layout is not published in the sources used here."),
  catalogOnly("life-u2i", "R500 / Life U2i", "A3213", "neckband", ["R500", "Life U2i", "A3213", "soundcore R500", "soundcore Life U2i"], "Official soundcore product and serial-number pages identify A3213 as R500/Life U2i; exact packet layout is not published in the sources used here."),
  catalogOnly("life-u2", "Life U2", "A3212", "neckband", ["Life U2", "A3212", "soundcore Life U2"], "Official soundcore product and serial-number pages identify A3212 as Life U2; exact packet layout is not published in the sources used here."),
  catalogOnly("life-nc", "Life NC", "A3201", "neckband", ["Life NC", "A3201", "soundcore Life NC"], "Official soundcore serial-number page identifies A3201 as Life NC; exact packet layout is not published in the sources used here.")
];
var UNVERIFIED_ALIASES = [
  {
    names: ["Liberty 4", "A3953"],
    note: "Liberty 4 (A3953) is a distinct product from Liberty 4 NC (A3947) and no capture proves its protocol layout, so SoundControl treats it as an unknown model: firmware, serial and earbud presence still work, but battery percentages and model-specific controls stay unavailable."
  },
  {
    names: ["Sport X10", "A3961"],
    note: "Sport X10 (A3961) has no published protocol capture, so SoundControl treats it as an unknown model rather than borrowing another device\u2019s battery scale or ANC layout: firmware, serial and earbud presence still work, but battery percentages and model-specific controls stay unavailable."
  },
  {
    names: ["Sleep A10", "A6610"],
    note: "Sleep A10 (A6610) has no published protocol capture, so SoundControl treats it as an unknown model rather than borrowing another device\u2019s battery scale or ANC layout: firmware, serial and earbud presence still work, but battery percentages and model-specific controls stay unavailable."
  },
  {
    names: ["Life A2 NC", "A3935"],
    note: "Life A2 NC (A3935) has no independently verified packet layout in the sources used here, so SoundControl keeps it on the unknown profile rather than borrowing the Liberty or Life-Q layouts."
  },
  {
    names: ["Life P3", "A3939"],
    note: "Life P3 (A3939) has no independently verified packet layout in the sources used here, so SoundControl keeps it on the unknown profile rather than borrowing the P20i or Life-Q layouts."
  },
  {
    names: ["Life Note 3", "A3933"],
    note: "Life Note 3 (A3933) has no independently verified packet layout in the sources used here, so SoundControl keeps it on the unknown profile rather than borrowing the P20i or Life-Q layouts."
  }
];
var RANKED_ALIASES = DEVICES.flatMap(
  (d) => [...d.names, d.sku].map((alias) => ({ alias: alias.toLowerCase(), id: d.id }))
).sort((a, b) => b.alias.length - a.alias.length);
var RANKED_UNVERIFIED = UNVERIFIED_ALIASES.flatMap(
  (a) => a.names.map((n) => ({ alias: n.toLowerCase(), note: a.note }))
).sort((a, b) => b.alias.length - a.alias.length);
var UNKNOWN_PROFILE = {
  id: "unknown",
  name: "Unknown model",
  sku: "\u2014",
  kind: "earbuds",
  family: "tws",
  gaming: false,
  ancLevels: false,
  scenes: false,
  ldac: false,
  dual: false,
  surround: false,
  wind: false,
  transparency: false,
  batteryMax: null,
  names: [],
  ancLayout: "none",
  eqCommand: null,
  customEq: false,
  state: {
    batteryLeft: 2,
    batteryRight: 3,
    batteryChargingLeft: null,
    batteryChargingRight: null,
    batteryCase: null,
    firmware: null,
    serial: null,
    eqPresetId: null,
    eqBands: null,
    soundModes: null
  },
  source: "No identity: protocol-universal reads only (01:05, 01:03 presence per PROTOCOL.md). Battery scale unproven \u2014 percentages stay unavailable.",
  verified: false
};
function aliasMatches(n) {
  return RANKED_ALIASES.flatMap((a) => {
    const m = new RegExp(`\\b${a.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).exec(n);
    return m ? [{ id: a.id, alias: a.alias, start: m.index, end: m.index + a.alias.length }] : [];
  });
}
function resolveAliasMatches(matches) {
  if (matches.length === 0) return null;
  const winner = [...matches].sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  const competing = matches.filter(
    (m) => m.id !== winner.id && !(m.start >= winner.start && m.end <= winner.end)
  );
  if (competing.length > 0) return null;
  return DEVICES.find((d) => d.id === winner.id) ?? null;
}
function matchDevice(name) {
  if (!name) return UNKNOWN_PROFILE;
  const n = name.toLowerCase();
  const hit = resolveAliasMatches(aliasMatches(n));
  if (hit) return hit;
  return UNKNOWN_PROFILE;
}
function matchNote(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  const tokenMatch = (alias2) => new RegExp(`\\b${alias2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(n);
  const matches = aliasMatches(n);
  if (matches.length > 0) {
    if (resolveAliasMatches(matches)) return null;
    return `The device name "${name}" matches more than one Soundcore model, so SoundControl cannot
      safely pick a capability profile. It connects with the generic profile: firmware, serial and
      earbud presence still work, but model-specific controls stay unavailable.`;
  }
  const alias = RANKED_UNVERIFIED.find((a) => tokenMatch(a.alias));
  if (alias) return alias.note;
  return "This device\u2019s model could not be identified, so SoundControl uses its generic profile: firmware, serial and earbud presence still come from the device, but battery percentages and model-specific controls stay unavailable \u2014 a raw level is never shown against a guessed scale.";
}

// src/protocol/drc.ts
var SMALLER_COEFFICIENT = 0.85;
var LARGER_COEFFICIENT = 0.95;
var BAND_COEFFICIENTS = [
  [1.26, -0.71 * SMALLER_COEFFICIENT, 0.177, -0.0494, 0.0345, -0.0197, 75e-4, -217e-5],
  [-0.71 * SMALLER_COEFFICIENT, 1.73 * LARGER_COEFFICIENT, 0, 0.204, -0.068, 0.045, -0.0235, 75e-4],
  [0.177, -0.81 * SMALLER_COEFFICIENT, 1.73 * LARGER_COEFFICIENT, -0.81 * SMALLER_COEFFICIENT, 0.208, -0.07, 0.045, -0.0197],
  [-0.0494, 0.204, 0, 1.73 * LARGER_COEFFICIENT, -0.82 * SMALLER_COEFFICIENT, 0.208, -0.068, 0.0345],
  [0.0345, -0.068, 0.208, -0.82 * SMALLER_COEFFICIENT, 1.73 * LARGER_COEFFICIENT, 0, 0.204, -0.0494],
  [-0.0197, 0.045, -0.07, 0.208, -0.81 * SMALLER_COEFFICIENT, 1.73 * LARGER_COEFFICIENT, -0.81 * SMALLER_COEFFICIENT, 0.177],
  [75e-4, -0.0235, 0.045, -0.068, 0.204, 0, 1.83 * LARGER_COEFFICIENT, -0.71 * SMALLER_COEFFICIENT],
  [-217e-5, 75e-4, -0.0197, 0.0345, -0.0494, 0.177, -0.71 * SMALLER_COEFFICIENT, 1.5]
];
function byteToAdjustment(byte) {
  return (byte & 255) - 120;
}

// src/protocol/presets.ts
var RAW = [
  {
    id: "signature",
    name: "Soundcore Signature",
    blurb: "Default factory curve",
    index: 0,
    wire: "7878787878787878",
    featured: true,
    swatch: "linear-gradient(135deg,#6a5cff,#3d7bff)"
  },
  {
    id: "acoustic",
    name: "Acoustic",
    blurb: "Warm mids, airy top",
    index: 1,
    wire: "A0828C8CA0A0A08C",
    featured: true,
    swatch: "linear-gradient(135deg,#c9a227,#f3d36b)"
  },
  {
    id: "bass",
    name: "Bass Booster",
    blurb: "Sub and low-mid lift",
    index: 2,
    wire: "A096827878787878",
    featured: true,
    swatch: "linear-gradient(135deg,#e85d04,#ff9e00)"
  },
  {
    id: "bass-cut",
    name: "Bass Reducer",
    blurb: "Lean low end",
    index: 3,
    wire: "505A6E7878787878",
    swatch: "linear-gradient(135deg,#4a90d9,#9fd3ff)"
  },
  {
    id: "classical",
    name: "Classical",
    blurb: "Hall-like presence",
    index: 4,
    wire: "96966464788C96A0",
    swatch: "linear-gradient(135deg,#5c4d3c,#d7c4a3)"
  },
  {
    id: "podcast",
    name: "Podcast",
    blurb: "Speech intelligibility",
    index: 5,
    wire: "5A8CA0A0968C7864",
    featured: true,
    swatch: "linear-gradient(135deg,#1d6f6a,#5fd3c8)"
  },
  {
    id: "dance",
    name: "Dance",
    blurb: "Club punch",
    index: 6,
    wire: "8C5A6E828C8C825A",
    swatch: "linear-gradient(135deg,#c81d77,#ff7ad9)"
  },
  {
    id: "deep",
    name: "Deep",
    blurb: "Sub-focused",
    index: 7,
    wire: "8C8296968C645046",
    swatch: "linear-gradient(135deg,#1b3a4b,#3d7ea6)"
  },
  {
    id: "electronic",
    name: "Electronic",
    blurb: "Synths and sparkle",
    index: 8,
    wire: "968C648C828C9696",
    swatch: "linear-gradient(135deg,#5b2dff,#00d4ff)"
  },
  {
    id: "flat",
    name: "Flat",
    blurb: "Near-linear reference",
    index: 9,
    wire: "64646E7878786464",
    featured: true,
    swatch: "linear-gradient(135deg,#9aa3b2,#d5dae3)"
  },
  {
    id: "hiphop",
    name: "Hip-Hop",
    blurb: "808s and presence",
    index: 10,
    wire: "8C966E6E8C6E8C96",
    swatch: "linear-gradient(135deg,#111,#f4c430)"
  },
  {
    id: "jazz",
    name: "Jazz",
    blurb: "Ride and upright bass",
    index: 11,
    wire: "8C8C6464788C96A0",
    swatch: "linear-gradient(135deg,#7a1f2b,#e8b298)"
  },
  {
    id: "latin",
    name: "Latin",
    blurb: "Percussion forward",
    index: 12,
    wire: "78786464647896AA",
    swatch: "linear-gradient(135deg,#c2410c,#fbbf24)"
  },
  {
    id: "lounge",
    name: "Lounge",
    blurb: "Soft evening curve",
    index: 13,
    wire: "6E8CA09678648C82",
    swatch: "linear-gradient(135deg,#312e81,#a78bfa)"
  },
  {
    id: "piano",
    name: "Piano",
    blurb: "Hammer attack",
    index: 14,
    wire: "7896968CA0AA96A0",
    swatch: "linear-gradient(135deg,#1f2937,#e5e7eb)"
  },
  {
    id: "pop",
    name: "Pop",
    blurb: "Radio smile",
    index: 15,
    wire: "6E829696826E645A",
    swatch: "linear-gradient(135deg,#db2777,#fb7185)"
  },
  {
    id: "rnb",
    name: "R&B",
    blurb: "Vocal silk, sub weight",
    index: 16,
    wire: "B48C64648C9696A0",
    swatch: "linear-gradient(135deg,#4c1d95,#f472b6)"
  },
  {
    id: "rock",
    name: "Rock",
    blurb: "Grit and cymbals",
    index: 17,
    wire: "968C6E6E82969696",
    swatch: "linear-gradient(135deg,#7f1d1d,#f97316)"
  },
  {
    id: "small-speakers",
    name: "Small Speakers",
    blurb: "Compensates tiny drivers",
    index: 18,
    wire: "A0968278645A5050",
    swatch: "linear-gradient(135deg,#0d9488,#2dd4bf)"
  },
  {
    id: "spoken-word",
    name: "Spoken Word",
    blurb: "Audiobooks & lectures",
    index: 19,
    wire: "5A64828C8C82785A",
    swatch: "linear-gradient(135deg,#6366f1,#818cf8)"
  },
  {
    id: "treble",
    name: "Treble Booster",
    blurb: "Air and detail",
    index: 20,
    wire: "6464646E828C8CA0",
    featured: true,
    swatch: "linear-gradient(135deg,#0369a1,#7dd3fc)"
  },
  {
    id: "treble-cut",
    name: "Treble Reducer",
    blurb: "Tame brightness",
    index: 21,
    wire: "787878645A50503C",
    swatch: "linear-gradient(135deg,#57534e,#a8a29e)"
  }
];
function wireToHex(wire) {
  const out = [];
  for (let i = 0; i < wire.length; i += 2) out.push(parseInt(wire.slice(i, i + 2), 16));
  return out;
}
var EQ_PRESETS = RAW.map((p) => {
  const wire = wireToHex(p.wire);
  return {
    ...p,
    wire,
    bands: wire.map((b) => Math.round(byteToAdjustment(b)) / 10)
  };
});
var FEATURED_PRESETS = EQ_PRESETS.filter((p) => p.featured);
function presetById(index) {
  return EQ_PRESETS.find((p) => p.index === index);
}

// src/protocol/codec.ts
function checksum(bytes, end = bytes.length) {
  let s = 0;
  for (let i = 0; i < end; i++) s = s + (bytes[i] & 255) & 255;
  return s;
}
function verifyFrame(data) {
  if (data.length < 2) return null;
  return checksum(data, data.length - 1) === (data[data.length - 1] & 255);
}

// src/protocol/targets.ts
var EARBUD_COMMANDS = [
  { id: "state.request", label: "Handshake / state request", target: "earbud", frames: ["01:01"] },
  { id: "battery.query", label: "Battery level query", target: "earbud", frames: ["01:03"] },
  { id: "charging.query", label: "Charging state query", target: "earbud", frames: ["01:04"] },
  { id: "device.info", label: "Serial + firmware query", target: "earbud", frames: ["01:05"] },
  { id: "device.factory-reset", label: "Factory reset", target: "earbud", frames: ["01:85"] },
  { id: "game-mode.set", label: "Gaming / low-latency mode", target: "earbud", frames: ["01:87"] },
  { id: "game-mode.set-a3947", label: "Gaming mode (Liberty variant)", target: "earbud", frames: ["10:85"] },
  { id: "ldac.query", label: "LDAC codec state query", target: "earbud", frames: ["01:7F"] },
  { id: "ldac.set", label: "LDAC codec enable/disable", target: "earbud", frames: ["01:FF"] },
  { id: "equalizer.set", label: "Equalizer preset/bands", target: "earbud", frames: ["02:81"] },
  { id: "equalizer.set-drc", label: "Equalizer with DRC (TWS models)", target: "earbud", frames: ["02:83"] },
  { id: "equalizer.set-hearid", label: "Equalizer with disabled HearID (D1202)", target: "earbud", frames: ["03:87"] },
  { id: "surround.set", label: "3D Surround Sound toggle", target: "earbud", frames: ["02:86"] },
  { id: "sound-modes.set", label: "ANC / transparency / wind noise modes", target: "earbud", frames: ["06:81"] },
  { id: "dual-audio.set", label: "Dual audio enable/disable", target: "earbud", frames: ["0B:84"] }
];
var FRAME_INDEX = new Map(
  EARBUD_COMMANDS.flatMap((c) => c.frames.map((f) => [f, c]))
);
var EARBUD_COMMAND_FRAME_KEYS = [...FRAME_INDEX.keys()].sort();

// src/protocol/modelRegistry.ts
function validStatePayloadLength(state, length) {
  return length >= requiredStateLength(state) && (state.exactLength === void 0 || length === state.exactLength);
}
function requiredStateLength(state) {
  let end = state.minimumLength ?? 0;
  const take = (at) => {
    if (typeof at === "number") end = Math.max(end, at + 1);
  };
  take(state.batteryLeft);
  take(state.batteryRight);
  take(state.batteryChargingLeft);
  take(state.batteryChargingRight);
  take(state.batteryCase);
  if (state.firmware) end = Math.max(end, state.firmware.at + state.firmware.length);
  if (state.serial) end = Math.max(end, state.serial.at + state.serial.length);
  if (typeof state.eqPresetId === "number") end = Math.max(end, state.eqPresetId + 2);
  if (state.eqBands) end = Math.max(end, state.eqBands.at + state.eqBands.count);
  take(
    state.soundModes !== null ? state.soundModes + Math.max(0, (state.soundModeLength ?? 7) - 1) : null
  );
  take(state.gaming);
  take(state.surround);
  take(state.dualConnections);
  return end;
}

// src/protocol/responses.ts
function createSessionGuard() {
  let seq = 0;
  let active = null;
  return {
    begin: () => {
      active = ++seq;
      return active;
    },
    end: () => {
      active = null;
    },
    isActive: (id) => active !== null && active === id,
    current: () => active
  };
}
function parseCaseBatteryPercent(payload, profile) {
  const at = profile.state.batteryCase;
  const max = profile.caseBatteryMax;
  const offset = profile.caseBatteryOffset ?? 0;
  if (!profile.verified || profile.kind !== "earbuds" && profile.kind !== "open-ear" || at === null || max === void 0 || !Number.isInteger(max) || max <= 0 || !Number.isInteger(offset) || offset < 0 || offset > max || !validStatePayloadLength(profile.state, payload.length)) return null;
  const raw = payload[at];
  if (raw === void 0 || raw === 255 || raw > max - offset) return null;
  return Math.round((raw + offset) * 100 / max);
}
function parseCaseBatteryStateFrame(frame, profile) {
  if (frame.length < 10 || frame[0] !== 9 || frame[1] !== 255 || frame[5] !== 1 || frame[6] !== 1 || (frame[7] | frame[8] << 8) !== frame.length || !verifyFrame(frame)) return null;
  return parseCaseBatteryPercent(frame.slice(9, -1), profile);
}

// src/protocol/observedFeatures.ts
var EMPTY_OBSERVED = {
  q45DoublePress: null,
  safeVolume: null,
  spatial: null,
  lifeNoteBassUp: null,
  lifeNoteButtons: null,
  lifeNoteEq: null,
  lifeNoteGaming: null,
  sleepAfter: null
};
var LIFE_NOTE_ACTIONS = {
  0: "Volume up",
  1: "Volume down",
  2: "Previous song",
  3: "Next song",
  5: "Voice assistant",
  6: "Play / pause"
};
var LIFE_NOTE_BUTTONS = [
  "Left double press",
  "Left long press",
  "Right double press",
  "Right long press",
  "Left single press",
  "Right single press"
];
function parseLifeNoteButtons(payload) {
  if (payload[0] > 1 || payload[1] > 1) return null;
  const connected = payload[1] === 1;
  const result = [];
  for (let i = 0; i < LIFE_NOTE_BUTTONS.length; i++) {
    const enabled = payload[54 + 2 * i];
    const raw = payload[55 + 2 * i];
    if (enabled > 1) return null;
    if (i < 4) {
      const lo = raw & 15;
      const hi = raw >> 4;
      if (LIFE_NOTE_ACTIONS[lo] === void 0 && lo !== 15 || LIFE_NOTE_ACTIONS[hi] === void 0 && hi !== 15) return null;
    } else if (LIFE_NOTE_ACTIONS[raw] === void 0 && raw !== 15) return null;
    const action = i < 4 ? connected ? raw & 15 : raw >> 4 : raw;
    if (enabled === 1 && action === 15) return null;
    result.push({
      press: LIFE_NOTE_BUTTONS[i],
      action: enabled === 0 || action === 15 ? "Disabled" : LIFE_NOTE_ACTIONS[action]
    });
  }
  return result;
}
var LAYOUTS = {
  // A3040 state_update.rs: button at 47, LimitHighVolume at 67..69;
  // known 142-byte 01:01 payload in a3040.rs test_with_known_good_packet.
  A3040: { minLength: 142, button: 47, volume: 67 },
  // A3954: unrelated smart-case preferences at 132..135 (never exposed),
  // auto-off 143..144, LimitHighVolume 145..147, spatial 148..150.
  // a3954.rs parses_known_packet has a 165-byte response sample.
  A3954: { minLength: 165, volume: 145, spatial: 148 },
  // D1202: sound modes 119..126, dual 131, auto-off 132..133,
  // LimitHighVolume 134..136, spatial 137..138 (152-byte reference sample).
  D1202: { minLength: 152, volume: 134, spatial: 137 }
};
function parseObservedFeatures(frame, profile) {
  if (frame.length < 10 || frame[0] !== 9 || frame[1] !== 255 || frame[5] !== 1 || frame[6] !== 1 || (frame[7] | frame[8] << 8) !== frame.length || !verifyFrame(frame)) return null;
  if (!profile.verified) return EMPTY_OBSERVED;
  const payload = frame.subarray(9, frame.length - 1);
  if (profile.sku === "D1301") {
    if (payload.length !== 150) return EMPTY_OBSERVED;
    const action = payload[144];
    const enabled2 = payload[148];
    return { ...EMPTY_OBSERVED, sleepAfter: enabled2 > 1 || action > 1 ? null : enabled2 === 0 ? "Keep Bluetooth audio" : action === 0 ? "Pause audio" : "Play on-device audio" };
  }
  if (profile.sku === "A3945") {
    if (payload.length !== 72) return EMPTY_OBSERVED;
    const bass = payload[70];
    const game = payload[68];
    const preset = payload[32] | payload[33] << 8;
    return {
      ...EMPTY_OBSERVED,
      lifeNoteBassUp: bass <= 1 ? bass === 1 : null,
      lifeNoteButtons: parseLifeNoteButtons(payload),
      lifeNoteGaming: game <= 1 ? game === 1 : null,
      lifeNoteEq: presetById(preset)?.name ?? (preset === 65278 ? "Custom EQ" : null)
    };
  }
  const layout = LAYOUTS[profile.sku];
  if (!layout || payload.length < layout.minLength) return EMPTY_OBSERVED;
  const button = "button" in layout ? payload[layout.button] : void 0;
  const q45DoublePress = button === 7 ? "BassUp" : button === 15 ? "Disabled" : null;
  const [enabled, db, refresh] = payload.subarray(layout.volume, layout.volume + 3);
  const safeVolume = (enabled === 0 || enabled === 1) && db >= 75 && db <= 100 && db % 5 === 0 && refresh <= 2 ? {
    enabled: enabled === 1,
    limitDb: db,
    refresh: ["Real-time", "10 seconds", "1 minute"][refresh]
  } : null;
  let spatial = null;
  if ("spatial" in layout) {
    const on = payload[layout.spatial];
    const trackingByte = profile.sku === "A3954" ? payload[layout.spatial + 1] : null;
    const modeByte = payload[layout.spatial + (profile.sku === "A3954" ? 2 : 1)];
    const modes = profile.sku === "A3954" ? ["Music", "Podcast", "Movie", "Gaming"] : ["Music", null, "Movie", "Gaming"];
    const mode = modes[modeByte];
    if ((on === 0 || on === 1) && (trackingByte === null || trackingByte === 1 || trackingByte === 2) && modeByte <= 3 && mode != null) {
      spatial = {
        enabled: on === 1,
        mode,
        tracking: trackingByte === null ? null : trackingByte === 1 ? "Fixed" : "Head tracking"
      };
    }
  }
  return { ...EMPTY_OBSERVED, q45DoublePress, safeVolume, spatial };
}
export {
  ANC_SUB_FEATURES,
  DEVICES,
  EMPTY_OBSERVED,
  EMPTY_SCAN_MESSAGE,
  INITIAL_SCAN_STATE,
  NO_ANC_SUB,
  UNKNOWN_PROFILE,
  UNVERIFIED_ALIASES,
  batteryLevel,
  batteryPercent,
  checksum,
  createSessionGuard,
  deriveCapabilities,
  deriveConnectionPhase,
  deriveEarbudState,
  emptyBattery,
  matchDevice,
  matchNote,
  mergeBatteryTelemetry,
  nextScanState,
  parseCaseBatteryPercent,
  parseCaseBatteryStateFrame,
  parseObservedFeatures,
  parseSoundModes,
  presenceFromRaw,
  requiredStateLength,
  validStatePayloadLength
};
