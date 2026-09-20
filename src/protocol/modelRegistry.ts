import type { DeviceProfile, StateOffsets } from '../types';
import { validP30iSoundModes } from './p30i';
import { CUSTOM_EQ_PRESET_ID } from './presets';
import { commandForFrameKey, validateOutboundFrame, withEarbudOnlyBoundary } from './targets';
import type { EarbudCommandSpec, OutboundFrameCheck } from './targets';

/* -------------------------------------------------------------------------- */
/* Phase 18 — model registry for the two target devices                       */
/* -------------------------------------------------------------------------- */

/**
 * SoundControl was built for exactly two earbud families, and they are
 * DIFFERENT hardware with DIFFERENT capability sets:
 *
 *   - Soundcore R50i (SKU A3949, also sold as P20i / P25i): NO ANC, NO
 *     transparency, NO wind toggle, NO surround, NO dual audio, NO LDAC;
 *     EQ over 02:83 with FACTORY PRESETS ONLY (no custom curves).
 *   - Soundcore R50i NC (SKU A3959, also sold as P30i): ANC + transparency +
 *     normal ambient modes with manual/adaptive levels, wind-noise
 *     suppression, EQ over 02:83 WITH custom 0xFEFE curves, gaming mode,
 *     dual connections, 3D surround; NO LDAC.
 *
 * Every status below is PROTOCOL evidence (OpenSCQ30's per-model device
 * definitions, its i18n name table, and live captures cited in PROTOCOL.md).
 * Nothing here is physically verified: `physicalValidation: 'PENDING'` until
 * docs/R50I-R50I-NC-HARDWARE-TEST.md is executed on real hardware and the
 * results recorded. SUPPORTED therefore always means "supported by protocol
 * evidence", never "seen working on a device" — see docs/R50I-PROTOCOL.md.
 */

export type SupportStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN' | 'PHYSICALLY_UNVERIFIED';

export interface ModelCommandStatus {
  status: SupportStatus;
  /** Where the evidence comes from (never empty). */
  evidence: string;
}

export interface ModelRegistryEntry {
  /** Registry key, e.g. `R50I_A3949`. */
  id: string;
  /** Commercial name, e.g. `Soundcore R50i`. */
  commercialName: string;
  /** Same-hardware sibling names the SKU is also sold under. */
  alsoSoldAs: string[];
  /** Soundcore SKU — the authoritative model identifier. */
  sku: string;
  /** Linked profile in src/protocol/devices.ts. */
  profileId: string;
  /** Human summary of the protocol profile. */
  protocolProfile: string;
  /** How the app identifies this model (name table + protocol confirmation). */
  identification: {
    /** Friendly names the model is matched by (ranked longest-first). */
    nameAliases: string[];
    /** Authoritative identity source behind those names. */
    evidence: string;
  };
  /** No physical device has been validated yet — every status is protocol-level. */
  physicalValidation: 'PENDING' | 'VERIFIED';
  /** Per-command support matrix for the 14 registered earbud commands. */
  commands: Record<string, ModelCommandStatus>;
  /** Capability distinctions that are not whole commands. */
  notes: string[];
}

/** The two target models, in phase order. */
export const TARGET_MODELS: readonly ModelRegistryEntry[] = [
  {
    id: 'R50I_A3949',
    commercialName: 'Soundcore R50i',
    alsoSoldAs: ['Soundcore P20i', 'Soundcore P25i'],
    sku: 'A3949',
    profileId: 'p20i',
    protocolProfile:
      'TWS, RFCOMM; 02:83 equalizer_with_drc_tws (factory presets only); no sound-modes module',
    identification: {
      nameAliases: ['R50i', 'P20i', 'P25i', 'A3949', 'soundcore R50i', 'soundcore P20i', 'soundcore P25i'],
      evidence:
        'OpenSCQ30 i18n table "soundcore-a3949 = Soundcore P20i / P25i / R50i" + a3949 device definition; matched by ranked whole-token name matching (longest first, so "R50i NC" resolves to A3959, never A3949), then confirmed by the 01:01 state layout (no sound-modes block, 67-byte payload, gaming byte at 65)',
    },
    physicalValidation: 'PENDING',
    commands: {
      'state.request': {
        status: 'SUPPORTED',
        evidence: 'OpenSCQ30 a3949: RequestState → A3949StateUpdatePacket (state_update.rs)',
      },
      'battery.query': {
        status: 'SUPPORTED',
        evidence: 'OpenSCQ30 a3949: dual_battery(5) module; charging flags in DualBattery',
      },
      'charging.query': {
        status: 'SUPPORTED',
        evidence: 'PROTOCOL.md read set; charging flags present in the A3949 state DualBattery block',
      },
      'device.info': {
        status: 'SUPPORTED',
        evidence: 'OpenSCQ30 a3949: serial_number_and_dual_firmware_version module (01:05)',
      },
      'equalizer.set-drc': {
        status: 'SUPPORTED',
        evidence:
          'OpenSCQ30 a3949: equalizer_with_drc_tws; 22 live 02:83 factory-preset captures from a P20i (victor-oliveira1/soundcore_anker_equalyzer, RFCOMM ch 10)',
      },
      'game-mode.set': {
        status: 'SUPPORTED',
        evidence:
          'OpenSCQ30 a3949: gaming_mode module; gaming byte in the state update at payload offset 65 (state_update.rs parse chain)',
      },
      'sound-modes.set': {
        status: 'UNSUPPORTED',
        evidence:
          'OpenSCQ30 a3949 registers NO sound-modes module (state_update.rs has no sound_modes field) — the R50i has no ANC/transparency hardware control; the frame is rejected by the model gate',
      },
      'ldac.query': {
        status: 'UNSUPPORTED',
        evidence: 'OpenSCQ30 a3949 has no LDAC module; LDAC is a 01:7F/01:FF feature of other SKUs only',
      },
      'ldac.set': {
        status: 'UNSUPPORTED',
        evidence: 'OpenSCQ30 a3949 has no LDAC module',
      },
      'dual-audio.set': {
        status: 'UNSUPPORTED',
        evidence: 'OpenSCQ30 a3949 has no dual_connections module',
      },
      'surround.set': {
        status: 'UNSUPPORTED',
        evidence: 'OpenSCQ30 a3949 has no surround_sound module',
      },
      'device.factory-reset': {
        status: 'UNSUPPORTED',
        evidence:
          'The 01:85 reset frame is documented only for the Soundcore Motion+ (A3116) speaker (OpenSCQ30); no capture maps it to A3949 — rejected by the model gate',
      },
      'equalizer.set': {
        status: 'UNSUPPORTED',
        evidence: 'A3949 writes EQ only via 02:83 (equalizer_with_drc_tws), never the classic 02:81 frame',
      },
      'game-mode.set-a3947': {
        status: 'UNSUPPORTED',
        evidence: '10:85 is the Liberty 4 NC (A3947) gaming variant; A3949 uses the common 01:87',
      },
    },
    notes: [
      'Custom EQ curves (preset 0xFEFE) are NOT supported: OpenSCQ30 a3949.rs sets custom_preset_id: None ("device doesn\'t support custom presets") and none of the 22 live P20i captures uses FEFE. The custom-curve UI stays hidden and the model gate rejects the frame; factory presets work.',
      'Touch/button configuration is documented for this model (OpenSCQ30 button_configuration, 6 buttons × 3 press kinds) but NOT implemented by SoundControl — no write command is exposed.',
      'Volume: no device-side volume command exists in any published capture — the Volume card stays honestly disabled (Phase 17 rule).',
    ],
  },
  {
    id: 'R50I_NC_A3959',
    commercialName: 'Soundcore R50i NC',
    alsoSoldAs: ['Soundcore P30i'],
    sku: 'A3959',
    profileId: 'p30i',
    protocolProfile:
      'TWS, RFCOMM; a3959 sound modes (06:81); 02:83 equalizer_with_drc_tws incl. custom 0xFEFE; gaming, dual connections, surround',
    identification: {
      nameAliases: ['R50i NC', 'P30i', 'A3959', 'soundcore R50i NC', 'soundcore P30i'],
      evidence:
        'OpenSCQ30 i18n table "soundcore-a3959 = Soundcore P30i / R50i NC" + a3959 device definition; matched by ranked whole-token name matching ("R50i NC" outranks "R50i"), then confirmed by the 01:01 state layout (sound-modes block at 64, 91-byte payload, surround 74 / dual 73 / gaming 78)',
    },
    physicalValidation: 'PENDING',
    commands: {
      'state.request': {
        status: 'SUPPORTED',
        evidence: 'OpenSCQ30 a3959: RequestState → A3959StateUpdatePacket (state_update.rs)',
      },
      'battery.query': {
        status: 'SUPPORTED',
        evidence: 'OpenSCQ30 a3959: dual_battery(10) module',
      },
      'charging.query': {
        status: 'SUPPORTED',
        evidence: 'PROTOCOL.md read set; charging flags present in the A3959 state DualBattery block',
      },
      'device.info': {
        status: 'SUPPORTED',
        evidence: 'OpenSCQ30 a3959: serial_number_and_dual_firmware_version module (01:05)',
      },
      'sound-modes.set': {
        status: 'SUPPORTED',
        evidence:
          'OpenSCQ30 a3959: a3959_sound_modes module; AmbientSoundMode NoiseCanceling=0 / Transparency=1 / Normal=2 (sound_mode_enum in common/structures/sound_modes.rs), manual 1..5 + adaptive levels, wind-noise suppression byte, multi-scene ANC; mirrored back in the state update (sound modes at payload 64) and the 06:01 report',
      },
      'equalizer.set-drc': {
        status: 'SUPPORTED',
        evidence:
          'OpenSCQ30 a3959: equalizer_with_drc_tws with common_settings_type_2() (custom_preset_id Some(0xFEFE)); same wire format as the 22 live P20i captures of the shared module',
      },
      'game-mode.set': {
        status: 'SUPPORTED',
        evidence:
          'OpenSCQ30 a3959: gaming_mode module; state byte at payload 77, trustworthy only when both buds run firmware >= 01.60 (state_update.rs firmware gate) — the mirror parser applies that gate',
      },
      'dual-audio.set': {
        status: 'SUPPORTED',
        evidence:
          'OpenSCQ30 a3959: dual_connections module (builder + take_dual_connection_devices); state flag at payload 73',
      },
      'surround.set': {
        status: 'SUPPORTED',
        evidence: 'OpenSCQ30 a3959: surround_sound module; state flag at payload 74',
      },
      'ldac.query': {
        status: 'UNSUPPORTED',
        evidence: 'OpenSCQ30 a3959 has no LDAC module; the R50i NC does not expose LDAC control',
      },
      'ldac.set': {
        status: 'UNSUPPORTED',
        evidence: 'OpenSCQ30 a3959 has no LDAC module',
      },
      'device.factory-reset': {
        status: 'UNSUPPORTED',
        evidence:
          'The 01:85 reset frame is documented only for the Soundcore Motion+ (A3116) speaker (OpenSCQ30); no capture maps it to A3959 — rejected by the model gate',
      },
      'equalizer.set': {
        status: 'UNSUPPORTED',
        evidence: 'A3959 writes EQ only via 02:83 (equalizer_with_drc_tws), never the classic 02:81 frame',
      },
      'game-mode.set-a3947': {
        status: 'UNSUPPORTED',
        evidence: '10:85 is the Liberty 4 NC (A3947) gaming variant; A3959 uses the common 01:87',
      },
    },
    notes: [
      'Phase 19: user reports no physical ANC effect in desktop, including during playback. Source-derived state-preserving transitions are under investigation; physicalValidation remains PENDING. See docs/PHASE-19-ANC-AUDIT.md.',
      'ANC/transparency/normal ambient values are NOT a generic guess: NoiseCanceling=0, Transparency=1, Normal=2 is OpenSCQ30\'s AmbientSoundMode enum for this model family (docs/R50I-PROTOCOL.md).',
      'Transparency SUB-MODES (fully transparent vs vocal) are NOT supported — the a3959 SoundModes struct has no TransparencyMode field; the vocal toggle stays hidden.',
      'Custom EQ curves (0xFEFE) ARE supported at protocol level (custom_preset_id Some(0xFEFE)) — physically unverified.',
      'Touch/button configuration is documented for this model (OpenSCQ30 button_configuration, 8 buttons × 4 press kinds) but NOT implemented by SoundControl.',
      'Volume: no device-side volume command exists in any published capture — the Volume card stays honestly disabled (Phase 17 rule).',
    ],
  },
];

/** Registry lookup by profile id (e.g. 'p20i' → R50I_A3949). */
export function targetModelForProfile(profileId: string): ModelRegistryEntry | undefined {
  return TARGET_MODELS.find((m) => m.profileId === profileId);
}

/** Registry lookup by registry id. */
export function targetModel(id: string): ModelRegistryEntry | undefined {
  return TARGET_MODELS.find((m) => m.id === id);
}

/* -------------------------------------------------------------------------- */
/* Task 3/4 — model-aware command gate (protocol-level enforcement)           */
/* -------------------------------------------------------------------------- */

/**
 * Commands every profile may send: the protocol-universal reads documented
 * for every supported model (PROTOCOL.md). The unidentified-model profile
 * can send ONLY these.
 */
const UNIVERSAL_COMMANDS: ReadonlySet<string> = new Set([
  'state.request',
  'battery.query',
  'charging.query',
  'device.info',
]);

export type ModelGateResult = { ok: true; command: EarbudCommandSpec } | { ok: false; reason: string };

/**
 * Decide whether a REGISTERED earbud command may be transmitted while
 * `profile` is the connected model (Phase 18, Tasks 3/4/8/11). This is the
 * protocol-level enforcement behind the capability-driven UI: a UI bug that
 * shows, say, ANC controls for an R50i (A3949 — no ANC) still cannot get a
 * 06:81 frame onto the wire.
 *
 * The two target models are decided by the evidence-based registry above;
 * every other profile falls back to its documented capability flags, which
 * are themselves evidence-cited in src/protocol/devices.ts.
 */
export function gateCommandForProfile(
  commandId: string,
  frame: Uint8Array,
  profile: DeviceProfile,
): ModelGateResult {
  const spec = commandForFrameKey(`${frame[5].toString(16).toUpperCase().padStart(2, '0')}:${frame[6].toString(16).toUpperCase().padStart(2, '0')}`);
  if (!spec || spec.id !== commandId) {
    return { ok: false, reason: `command id ${commandId} does not match the frame` };
  }
  const deny = (reason: string): ModelGateResult => ({ ok: false, reason });

  if (UNIVERSAL_COMMANDS.has(commandId)) return { ok: true, command: spec };

  // Registry decisions for the two target models, with the profile flags as
  // the general rule (they are consistent by test — see
  // scripts/test_model_profiles.mjs — so both paths agree).
  switch (commandId) {
    case 'sound-modes.set':
      if (profile.id === 'p30i' && (!validP30iSoundModes(frame.slice(9, -1)) || (frame[13] & 2) !== 0)) {
        return deny('A3959 requires a valid 7-byte sound-mode payload; wind-detected bit is read-only');
      }
      return profile.ancLayout === 'none'
        ? deny(
            `${profile.name} (${profile.sku}) has no sound-mode control — ANC/transparency frames are not sent to this model`,
          )
        : { ok: true, command: spec };
    case 'equalizer.set':
    case 'equalizer.set-drc': {
      const frameKey = `${frame[5].toString(16).toUpperCase().padStart(2, '0')}:${frame[6].toString(16).toUpperCase().padStart(2, '0')}`;
      if (profile.eqCommand !== frameKey) {
        return deny(
          `${profile.name} (${profile.sku}) writes its equalizer via ${profile.eqCommand ?? 'no documented EQ command'} — not ${frameKey}`,
        );
      }
      const presetId = frame.length >= 11 ? frame[9] | (frame[10] << 8) : -1;
      if (presetId === CUSTOM_EQ_PRESET_ID && !profile.customEq) {
        return deny(
          `Custom EQ curves (preset 0xFEFE) are not supported by ${profile.name} (${profile.sku}) — factory presets only (OpenSCQ30: custom_preset_id None)`,
        );
      }
      return { ok: true, command: spec };
    }
    case 'game-mode.set':
      return profile.gaming
        ? { ok: true, command: spec }
        : deny(`${profile.name} (${profile.sku}) has no documented gaming mode`);
    case 'game-mode.set-a3947':
      return profile.sku === 'A3947'
        ? { ok: true, command: spec }
        : deny('10:85 is the Liberty 4 NC (A3947) gaming variant only');
    case 'ldac.set':
    case 'ldac.query':
      return profile.ldac
        ? { ok: true, command: spec }
        : deny(`${profile.name} (${profile.sku}) has no documented LDAC control`);
    case 'dual-audio.set':
      return profile.dual
        ? { ok: true, command: spec }
        : deny(`${profile.name} (${profile.sku}) has no documented dual-connection control`);
    case 'surround.set':
      return profile.surround
        ? { ok: true, command: spec }
        : deny(`${profile.name} (${profile.sku}) has no documented surround-sound control`);
    case 'device.factory-reset':
      return profile.factoryReset === true
        ? { ok: true, command: spec }
        : deny(
            `Factory reset (01:85) is not documented for ${profile.name} (${profile.sku}) — the frame is documented only for the Soundcore Motion+ speaker and is never sent speculatively`,
          );
    default:
      return deny(`command ${commandId} is not gated for any model — refusing by default`);
  }
}

/**
 * Combined transport boundary (Phase 17 earbud-only gate + Phase 18 model
 * gate) — the single wrapper the store installs on every transport:
 *
 *   1. the frame must be a recognized, checksum-valid Soundcore earbud
 *      command (validateOutboundFrame — see src/protocol/targets.ts);
 *   2. the connected model must actually support that command
 *      (gateCommandForProfile), including the custom-EQ preset distinction.
 *
 * Unrecognized or model-unsupported frames throw and are logged via
 * `onBlock`; they never reach the wire.
 */
export function withDeviceBoundary(
  t: import('../types').Transport,
  getProfile: () => DeviceProfile,
  onBlock: (reason: string) => void = () => {},
): import('../types').Transport {
  const earbudOnly = withEarbudOnlyBoundary(t, onBlock);
  return {
    diagnostics: t.diagnostics,
    kind: earbudOnly.kind,
    label: earbudOnly.label,
    async write(data: Uint8Array): Promise<void> {
      const check: OutboundFrameCheck = validateOutboundFrame(data);
      if (!check.ok) {
        onBlock(check.reason);
        throw new Error(`BLOCKED — ${check.reason}`);
      }
      const gate = gateCommandForProfile(check.command.id, data, getProfile());
      if (!gate.ok) {
        onBlock(gate.reason);
        throw new Error(`BLOCKED — ${gate.reason}`);
      }
      return earbudOnly.write(data);
    },
    close(): Promise<void> {
      return earbudOnly.close();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Task 12/13 helpers — response validation + session isolation               */
/* -------------------------------------------------------------------------- */

/**
 * Minimum state-payload length a profile's offsets require: a `01:01` state
 * update shorter than this cannot contain the fields this model reports and
 * is treated as malformed (ignored, never partially parsed).
 */
export function requiredStateLength(state: StateOffsets): number {
  let end = 0;
  const take = (at: number | null | undefined) => {
    if (typeof at === 'number') end = Math.max(end, at + 1);
  };
  take(state.batteryLeft);
  take(state.batteryRight);
  take(state.batteryChargingLeft);
  take(state.batteryChargingRight);
  take(state.batteryCase);
  if (state.firmware) end = Math.max(end, state.firmware.at + state.firmware.length);
  if (state.serial) end = Math.max(end, state.serial.at + state.serial.length);
  take(state.eqPresetId);
  if (state.eqBands) end = Math.max(end, state.eqBands.at + state.eqBands.count);
  take(state.soundModes !== null ? state.soundModes + 6 : null); // 7-byte sound-mode block
  take(state.gaming);
  take(state.surround);
  take(state.dualConnections);
  return end;
}
