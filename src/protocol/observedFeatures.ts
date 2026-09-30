import type { DeviceProfile } from '../types';
import { verifyFrame } from './codec';
import { presetById } from './presets';

/** Read-only fields independently located in OpenSCQ30's model-specific 01:01 parse chains.
 * Do not derive a writable capability from any of these observations. */
export interface ObservedFeatures {
  q45DoublePress: 'BassUp' | 'Disabled' | null;
  safeVolume: { enabled: boolean; limitDb: number; refresh: 'Real-time' | '10 seconds' | '1 minute' } | null;
  spatial: { enabled: boolean; mode: 'Music' | 'Podcast' | 'Movie' | 'Gaming'; tracking: 'Fixed' | 'Head tracking' | null } | null;
  /** A3945's separate strict 01:01 boolean byte, not the Bass Booster EQ preset. */
  lifeNoteBassUp: boolean | null;
  /** A3945 connected/disconnected TWS action nibble chosen from its state flag. */
  lifeNoteButtons: { press: string; action: string }[] | null;
  lifeNoteEq: string | null;
  lifeNoteGaming: boolean | null;
  /** D1301 captured state: auto-switch once asleep and post-sleep action.
   * Not an alarm, timer, mixer or request to play local audio. */
  sleepAfter: 'Keep Bluetooth audio' | 'Pause audio' | 'Play on-device audio' | null;
}

export const EMPTY_OBSERVED: ObservedFeatures = {
  q45DoublePress: null,
  safeVolume: null,
  spatial: null,
  lifeNoteBassUp: null,
  lifeNoteButtons: null,
  lifeNoteEq: null,
  lifeNoteGaming: null,
  sleepAfter: null,
};

// A3945 BUTTON_CONFIGURATION_SETTINGS order and COMMON_ACTIONS_WITHOUT_SOUND_MODES.
// Unrecognized IDs and malformed flags are unavailable, never an invented action.
const LIFE_NOTE_ACTIONS: Readonly<Record<number, string>> = {
  0: 'Volume up', 1: 'Volume down', 2: 'Previous song',
  3: 'Next song', 5: 'Voice assistant', 6: 'Play / pause',
};
const LIFE_NOTE_BUTTONS = [
  'Left double press', 'Left long press', 'Right double press',
  'Right long press', 'Left single press', 'Right single press',
] as const;

function parseLifeNoteButtons(payload: Uint8Array): ObservedFeatures['lifeNoteButtons'] {
  // HostDevice 0/1, TwsStatus is_connected 0/1. Buttons are six pairs at
  // 54..65. The first four actions have TWS status nibbles; the last two
  // are single-byte actions. All six enabled flags are strict single booleans.
  if (payload[0] > 1 || payload[1] > 1) return null;
  const connected = payload[1] === 1;
  const result: NonNullable<ObservedFeatures['lifeNoteButtons']> = [];
  for (let i = 0; i < LIFE_NOTE_BUTTONS.length; i++) {
    const enabled = payload[54 + 2 * i];
    const raw = payload[55 + 2 * i];
    if (enabled > 1) return null;
    if (i < 4) {
      const lo = raw & 0x0f;
      const hi = raw >> 4;
      if ((LIFE_NOTE_ACTIONS[lo] === undefined && lo !== 15) ||
          (LIFE_NOTE_ACTIONS[hi] === undefined && hi !== 15)) return null;
    } else if (LIFE_NOTE_ACTIONS[raw] === undefined && raw !== 15) return null;
    const action = i < 4 ? connected ? raw & 0x0f : raw >> 4 : raw;
    if (enabled === 1 && action === 15) return null;
    result.push({ press: LIFE_NOTE_BUTTONS[i],
      action: enabled === 0 || action === 15 ? 'Disabled' : LIFE_NOTE_ACTIONS[action] });
  }
  return result;
}


const LAYOUTS = {
  // A3040 state_update.rs: button at 47, LimitHighVolume at 67..69;
  // known 142-byte 01:01 payload in a3040.rs test_with_known_good_packet.
  A3040: { minLength: 142, button: 47, volume: 67 },
  // A3954: unrelated smart-case preferences at 132..135 (never exposed),
  // auto-off 143..144, LimitHighVolume 145..147, spatial 148..150.
  // a3954.rs parses_known_packet has a 165-byte response sample.
  A3954: { minLength: 165, volume: 145, spatial: 148 },
  // D1202: sound modes 119..126, dual 131, auto-off 132..133,
  // LimitHighVolume 134..136, spatial 137..138 (152-byte reference sample).
  D1202: { minLength: 152, volume: 134, spatial: 137 },
} as const;

/** A bad wire frame returns null (no state update); a valid but incomplete or
 * unrecognized model state returns EMPTY_OBSERVED (clear older readouts). */
export function parseObservedFeatures(frame: Uint8Array, profile: DeviceProfile): ObservedFeatures | null {
  if (frame.length < 10 || frame[0] !== 0x09 || frame[1] !== 0xff ||
      frame[5] !== 0x01 || frame[6] !== 0x01 ||
      (frame[7] | (frame[8] << 8)) !== frame.length || !verifyFrame(frame)) return null;
  if (!profile.verified) return EMPTY_OBSERVED;
  const payload = frame.subarray(9, frame.length - 1);
  if (profile.sku === 'D1301') {
    // d1301/packets/inbound/state_update.rs: three source-author captures
    // KEEP_AUDIO, PAUSE_AUDIO, PLAY_LOCAL_AUDIO are 150-byte state bodies.
    // The app setting uses [post_sleep_audio at 144, enabled at 148]. The
    // unrelated byte 45 is explicitly marked unknown by the upstream parser.
    if (payload.length !== 150) return EMPTY_OBSERVED;
    const action = payload[144];
    const enabled = payload[148];
    return { ...EMPTY_OBSERVED, sleepAfter: enabled > 1 || action > 1 ? null :
      enabled === 0 ? 'Keep Bluetooth audio' :
      action === 0 ? 'Pause audio' : 'Play on-device audio' };
  }
  if (profile.sku === 'A3945') {
    // Complete A3945StateUpdatePacket is 72 bytes; the BassUp field is a
    // standalone byte at 70 (not a bit in a shared flag). Neither this state
    // nor its source parser establishes a setter or a firmware compatibility range.
    if (payload.length !== 72) return EMPTY_OBSERVED;
    const bass = payload[70];
    const game = payload[68];
    const preset = payload[32] | (payload[33] << 8);
    return {
      ...EMPTY_OBSERVED,
      lifeNoteBassUp: bass <= 1 ? bass === 1 : null,
      lifeNoteButtons: parseLifeNoteButtons(payload),
      lifeNoteGaming: game <= 1 ? game === 1 : null,
      lifeNoteEq: presetById(preset)?.name ?? (preset === 0xfefe ? 'Custom EQ' : null),
    };
  }
  const layout = LAYOUTS[profile.sku as keyof typeof LAYOUTS];
  if (!layout || payload.length < layout.minLength) return EMPTY_OBSERVED;

  const button = 'button' in layout ? payload[layout.button] : undefined;
  const q45DoublePress = button === 7 ? 'BassUp' : button === 15 ? 'Disabled' : null;
  const [enabled, db, refresh] = payload.subarray(layout.volume, layout.volume + 3);
  const safeVolume = (enabled === 0 || enabled === 1) &&
    db >= 75 && db <= 100 && db % 5 === 0 && refresh <= 2
    ? { enabled: enabled === 1, limitDb: db,
        refresh: (['Real-time', '10 seconds', '1 minute'] as const)[refresh] }
    : null;
  let spatial: ObservedFeatures['spatial'] = null;
  if ('spatial' in layout) {
    const on = payload[layout.spatial];
    const trackingByte = profile.sku === 'A3954' ? payload[layout.spatial + 1] : null;
    const modeByte = payload[layout.spatial + (profile.sku === 'A3954' ? 2 : 1)];
    const modes = profile.sku === 'A3954'
      ? (['Music', 'Podcast', 'Movie', 'Gaming'] as const)
      : (['Music', null, 'Movie', 'Gaming'] as const);
    const mode = modes[modeByte];
    if ((on === 0 || on === 1) &&
        (trackingByte === null || trackingByte === 1 || trackingByte === 2) &&
        modeByte <= 3 && mode != null) {
      spatial = {
        enabled: on === 1,
        mode,
        tracking: trackingByte === null ? null : trackingByte === 1 ? 'Fixed' : 'Head tracking',
      };
    }
  }
  return { ...EMPTY_OBSERVED, q45DoublePress, safeVolume, spatial };
}
