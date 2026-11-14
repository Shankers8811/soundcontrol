# Plan: SoundControl Code Quality Fixes

## Goal
Fix all 20 identified code quality issues across the TypeScript frontend and Rust backend so the project builds cleanly with zero errors/warnings, Bluetooth device control commands actually send data over the connection, and no panic-prone or mock code remains.

## Architecture
Frontend fixes are localized type corrections, dead code removal, and error-handling hardening within existing files — no new components or pages. Backend fixes add a Bluetooth send path to device command functions, replace hardcoded mock returns with real reads or proper errors, guard against empty-string panics, and correct file paths/extensions. No architectural boundary changes; all fixes stay within existing modules.

## Global constraints (copied verbatim from spec)
- No `@ts-ignore`, `eslint-disable`, `#![allow]`, or stubs that silently fail
- No empty catch blocks, no `.catch(() => {})` silent swallows
- Fix TypeScript type errors so `tsc --noEmit` passes
- Fix Rust compile errors so `cargo check` passes
- Replace `any` types with defined interfaces where interfaces exist
- Remove dead code (`src/routes.tsx`)
- Make Bluetooth set_* commands actually send frames over the connection
- Replace hardcoded null battery returns with real reads or proper errors
- Never add new features or UI pages
- Never commit secrets or keys to source

## File map (one responsibility per file)

### Frontend
| File | Responsibility |
|---|---|
| `src/api/tauri.ts` | Tauri invoke wrappers — add missing type imports from `../types` |
| `src/routes.tsx` | Dead file — delete entirely |
| `src/stores/devices.ts` | Zustand store — add `toggleSingleEarbudMode` to interface, fix `batteryLevels` type |
| `src/stores/settings.ts` | Zustand store — replace `any`-adjacent loose typing, ensure `updateSetting` handles null settings |
| `src/stores/ui.ts` | Zustand store — replace `Date.now()` toast IDs with crypto.randomUUID or counter |
| `src/types.ts` | Shared interfaces — align `BatteryLevel` and `EQPreset` with `src/types/index.ts` |
| `src/types/index.ts` | Duplicate type definitions — reconcile with `src/types.ts` or remove duplication |
| `src/utils/helpers.ts` | Helpers — no changes needed (already correct) |
| `src/main.tsx` | Entry point — replace non-null assertion with safe fallback |
| `src/pages/Devices.tsx` | Devices page — no code changes needed (uses stores correctly) |
| `src/pages/NoiseControl.tsx` | Noise control page — remove fake device object construction |
| `src/pages/Equalizer.tsx` | Equalizer page — fix `any` type, remove silent `.catch(() => {})`, align band count |
| `src/pages/Battery.tsx` | Battery page — replace `any` type with `BatteryLevel` interface |
| `src/pages/Settings.tsx` | Settings page — fix `class` to `className` typos (2 instances) |
| `src/components/DeviceGuardButton.tsx` | Guard button — no changes needed |
| All other `src/pages/*.tsx` and `src/components/*.tsx` | Review for `any` types and missing type imports |

### Backend
| File | Responsibility |
|---|---|
| `src-tauri/src/commands/device.rs` | Device commands — guard empty strings, add Bluetooth send to all set_* functions, fix `get_battery_levels` |
| `src-tauri/src/commands/system.rs` | System commands — implement `unregister_hotkey` to actually remove setting |
| `src-tauri/src/commands/diagnostics.rs` | Diagnostics — fix `.zip` extension on JSON file output |
| `src-tauri/src/commands/eq.rs` | EQ commands — no changes needed (already functional) |
| `src-tauri/src/commands/bluetooth.rs` | Bluetooth commands — no changes needed (scan/connect work) |
| `src-tauri/src/commands/settings.rs` | Settings commands — no changes needed |
| `src-tauri/src/db/mod.rs` | Database — fix `include_str` path for migrations.sql |
| `src-tauri/src/bluetooth/mod.rs` | Bluetooth manager — no changes needed |
| `src-tauri/src/bluetooth/linux.rs` | Linux Bluetooth — reuse session/adapter instead of creating new each call |
| `src-tauri/src/bluetooth/windows.rs` | Windows Bluetooth — note false-positive COM port scanning (documented, not fixed in this scope) |
| `src-tauri/src/protocol/mod.rs` | Protocol handler — no changes needed |
| `src-tauri/src/protocol/models.rs` | Protocol models — align `eq_bands` type with frontend |
| `src-tauri/src/tasks/mod.rs` | Background tasks — stubs emit events; document as stubs (not fixed in this scope) |
| `src-tauri/Cargo.toml` | Dependencies — remove duplicate `bluer` and `windows` declarations |
| `src-tauri/build.rs` | Build script — no changes needed |

## Tasks

### Task 1: Fix TypeScript type imports in api/tauri.ts
**Files:** `src/api/tauri.ts`
**Interfaces:** Consumes `AppSettings`, `DiscoveredDevice`, `DeviceProfile`, `DeviceFeatures`, `BatteryLevel`, `EQPreset`, `FrameLogEntry` from `../types`; produces invoke calls to Tauri backend
**Acceptance:** `npx tsc --noEmit` reports no errors related to missing type imports in `src/api/tauri.ts`
**Steps:**
1. Write failing type check: run `npx tsc --noEmit`, observe missing type errors
2. Add `import type { AppSettings, DiscoveredDevice, DeviceProfile, DeviceFeatures, BatteryLevel, EQPreset, FrameLogEntry } from '../types';` at top of `src/api/tauri.ts`
3. Run `npx tsc --noEmit`, confirm 0 errors from this file
4. Commit

### Task 2: Delete dead routes.tsx
**Files:** `src/routes.tsx`
**Interfaces:** None (dead file, unused)
**Acceptance:** `src/routes.tsx` no longer exists in repository; `npm run build` still works
**Steps:**
1. Write failing test: confirm `src/routes.tsx` exists
2. Delete `src/routes.tsx`
3. Run `npm run build`, confirm success
4. Commit

### Task 3: Fix devices.ts store interface/implementation mismatch
**Files:** `src/stores/devices.ts`
**Interfaces:** `DevicesState` interface; produces `toggleSingleEarbudMode` method not declared in interface
**Acceptance:** `toggleSingleEarbudMode` is declared in `DevicesState` interface; `batteryLevels` typed as `Record<string, BatteryLevel>` instead of `Record<string, any>`
**Steps:**
1. Write failing type check: run `npx tsc --noEmit`, observe missing interface declaration
2. Add `toggleSingleEarbudMode: (enabled: boolean) => void;` to `DevicesState` interface
3. Change `batteryLevels: Record<string, any>` to `batteryLevels: Record<string, BatteryLevel>`
4. Import `BatteryLevel` type from `../types`
5. Run `npx tsc --noEmit`, confirm 0 errors
6. Commit

### Task 4: Fix ui.ts toast ID collision risk
**Files:** `src/stores/ui.ts`
**Interfaces:** `showToast` produces toast IDs; potential `Date.now()` collision
**Acceptance:** Toast IDs are unique; no use of `Date.now()` as sole ID source
**Steps:**
1. Write failing test: call `showToast` twice synchronously, verify IDs differ
2. Replace `const id = Date.now().toString();` with `const id = crypto.randomUUID();`
3. Run `npx tsc --noEmit`, confirm 0 errors
4. Commit

### Task 5: Fix main.tsx non-null assertion
**Files:** `src/main.tsx`
**Interfaces:** `document.getElementById('root')!` — non-null assertion without fallback
**Acceptance:** No `!` non-null assertion; safe fallback if `#root` is missing
**Steps:**
1. Write failing test: confirm `!` assertion exists in `src/main.tsx`
2. Replace with safe check: `const root = document.getElementById('root'); if (!root) { throw new Error('Root element not found'); } ReactDOM.createRoot(root).render(...)`
3. Run `npx tsc --noEmit`, confirm 0 errors
4. Commit

### Task 6: Fix NoiseControl.tsx fake device object
**Files:** `src/pages/NoiseControl.tsx`
**Interfaces:** Constructs fake `{ address, name: 'Unknown', profile: null, connected: false }` device
**Acceptance:** No fake device object; page shows "No device selected" when no real device is connected
**Steps:**
1. Write failing test: confirm fake device construction exists
2. Remove the `deviceAddress ? { address: deviceAddress, name: 'Unknown', profile: null, connected: false } : null` fallback
3. Change to `const device = connectedDevice;` only
4. Run `npx tsc --noEmit`, confirm 0 errors
5. Commit

### Task 7: Fix Equalizer.tsx any type and silent error swallowing
**Files:** `src/pages/Equalizer.tsx`
**Interfaces:** `deviceFeatures: any`, `eqBands` hardcoded to 8, `.catch(() => {})` silent swallows
**Acceptance:** `deviceFeatures` typed as `DeviceFeatures | null`; band count uses `deviceFeatures?.eq_bands`; no silent `.catch(() => {})`
**Steps:**
1. Write failing type check: run `npx tsc --noEmit`, observe `any` type
2. Import `DeviceFeatures` type from `../types`
3. Change `const [deviceFeatures, setDeviceFeatures] = useState<any>(null);` to `useState<DeviceFeatures | null>(null);`
4. Replace `.catch(() => {})` with `.catch((e) => { showToast('Failed to apply preset band', 'error'); console.error(e); });`
5. Ensure EQ slider count uses `deviceFeatures?.eq_bands ?? 8` as fallback
6. Run `npx tsc --noEmit`, confirm 0 errors
7. Commit

### Task 8: Fix Battery.tsx any type
**Files:** `src/pages/Battery.tsx`
**Interfaces:** `battery: any` state
**Acceptance:** `battery` typed as `BatteryLevel | null`
**Steps:**
1. Write failing type check: run `npx tsc --noEmit`, observe `any` type
2. Import `BatteryLevel` from `../types`
3. Change `const [battery, setBattery] = useState<any>(null);` to `useState<BatteryLevel | null>(null);`
4. Run `npx tsc --noEmit`, confirm 0 errors
5. Commit

### Task 9: Fix Settings.tsx className typos
**Files:** `src/pages/Settings.tsx`
**Interfaces:** `class` attribute used instead of `className` on two `<p>` elements
**Acceptance:** No `class=` attributes; all use `className`
**Steps:**
1. Write failing test: search for `<p class=` in `src/pages/Settings.tsx`
2. Replace `class="text-xs text-gray-500"` with `className="text-xs text-gray-500"` (2 instances)
3. Run `npx tsc --noEmit`, confirm 0 errors
4. Commit

### Task 10: Reconcile types.ts and types/index.ts duplication
**Files:** `src/types.ts`, `src/types/index.ts`
**Interfaces:** Duplicate/overlapping `DeviceProfile`, `BatteryLevel`, `EQPreset` definitions with field mismatches
**Acceptance:** Single source of truth; `src/types.ts` and `src/types/index.ts` have compatible definitions; `BatteryLevel` in both files has same fields including `single_earbud_mode`
**Steps:**
1. Write failing test: compare fields between both files, identify mismatches
2. Add `single_earbud_mode: boolean` to `BatteryLevel` in `src/types.ts`
3. Change `EQPreset.bands` from `string` to `number[]` in `src/types.ts` to match `src/types/index.ts`
4. Verify `eq_bands` type compatibility across both files
5. Run `npx tsc --noEmit`, confirm 0 errors
6. Commit

### Task 11: Fix device.rs empty string panic in set_anc_mode
**Files:** `src-tauri/src/commands/device.rs`
**Interfaces:** `set_anc_mode(address, mode)` calls `mode.as_bytes()[0]` without empty check
**Acceptance:** `set_anc_mode("", "off")` returns `Err` instead of panicking
**Steps:**
1. Write failing test: call `set_anc_mode` with empty mode string, observe panic
2. Add `if mode.is_empty() { return Err("ANC mode cannot be empty".to_string()); }` before `mode.as_bytes()[0]`
3. Run `cargo check`, confirm 0 warnings/errors
4. Commit

### Task 12: Fix device.rs empty string panic in set_gestures
**Files:** `src-tauri/src/commands/device.rs`
**Interfaces:** `set_gestures` calls `left_gesture.as_bytes()[0]` and `right_gesture.as_bytes()[0]` without empty checks
**Acceptance:** `set_gestures(addr, "", "")` returns `Err` instead of panicking
**Steps:**
1. Write failing test: call `set_gestures` with empty strings, observe panic
2. Add `if left_gesture.is_empty() || right_gesture.is_empty() { return Err("Gesture cannot be empty".to_string()); }` before byte access
3. Run `cargo check`, confirm 0 warnings/errors
4. Commit

### Task 13: Make device set_* commands send frames over Bluetooth
**Files:** `src-tauri/src/commands/device.rs`
**Interfaces:** All `set_*` functions encode protocol frames but discard the Bluetooth lock with `let _ = bt;`
**Acceptance:** Each set_* function calls a Bluetooth send/transmit function with the encoded frame
**Steps:**
1. Write failing test: confirm `set_transparency` does not send data over Bluetooth
2. Add a `send_frame` method to `BluetoothManager` in `bluetooth/mod.rs` that writes to the connected device
3. Replace `let _ = bt;` with `bt.send_frame(&frame).map_err(|e| e.to_string())?;` in each set_* function
4. Run `cargo check`, confirm 0 warnings/errors
5. Commit

### Task 14: Fix system.rs unregister_hotkey no-op
**Files:** `src-tauri/src/commands/system.rs`
**Interfaces:** `unregister_hotkey` returns `Ok(())` without removing the setting
**Acceptance:** `unregister_hotkey` calls `db.remove_setting` or equivalent to delete the hotkey
**Steps:**
1. Write failing test: call `unregister_hotkey`, verify setting still exists in DB
2. Add `remove_setting` method to `Database` in `db/mod.rs`
3. Call `db.remove_setting(&key).map_err(|e| e.to_string())?;` in `unregister_hotkey`
4. Run `cargo check`, confirm 0 warnings/errors
5. Commit

### Task 15: Fix diagnostics.rs .zip extension on JSON file
**Files:** `src-tauri/src/commands/diagnostics.rs`
**Interfaces:** `export_diagnostics` writes JSON content but names file `.zip`
**Acceptance:** File extension matches content (`.json` for JSON, or implement ZIP if required)
**Steps:**
1. Write failing test: confirm filename ends with `.zip` but content is JSON
2. Change filename from `soundcontrol_diagnostics_{timestamp}.zip` to `soundcontrol_diagnostics_{timestamp}.json`
3. Run `cargo check`, confirm 0 warnings/errors
4. Commit

### Task 16: Fix db/mod.rs include_str path for migrations
**Files:** `src-tauri/src/db/mod.rs`
**Interfaces:** `include_str!("../../../migrations.sql")` — fragile relative path
**Acceptance:** Migration SQL path resolves correctly regardless of working directory
**Steps:**
1. Write failing test: run `cargo build` from a different directory, observe migration load failure
2. Use `concat!(env!("CARGO_MANIFEST_DIR"), "/../migrations.sql")` or copy migrations into src-tauri/src/
3. Simpler: move migrations.sql to `src-tauri/src/migrations.sql` and use `include_str!("migrations.sql")`
4. Run `cargo check`, confirm 0 warnings/errors
5. Commit

### Task 17: Fix linux.rs session reuse
**Files:** `src-tauri/src/bluetooth/linux.rs`
**Interfaces:** New `bluer::Session` created on every scan/connect/disconnect/get_state call
**Acceptance:** Session and adapter are created once and reused across calls
**Steps:**
1. Write failing test: confirm multiple sessions created per operation
2. Move `session` and `adapter` into `LinuxBluetooth` struct fields, initialized in `new()`
3. Reuse stored session/adapter in `scan`, `connect`, `disconnect`, `get_state`
4. Run `cargo check`, confirm 0 warnings/errors
5. Commit

### Task 18: Fix Cargo.toml duplicate dependencies
**Files:** `src-tauri/Cargo.toml`
**Interfaces:** `bluer` and `windows` declared twice (optional in `[dependencies]` and again in target-specific sections)
**Acceptance:** Each dependency declared exactly once
**Steps:**
1. Write failing test: run `cargo check`, observe duplicate dependency warnings/errors
2. Remove `bluer` and `windows` from the top-level `[dependencies]` optional declarations
3. Keep them only in target-specific sections (or vice versa, but not both)
4. Run `cargo check`, confirm 0 warnings/errors
5. Commit

### Task 19: Full TypeScript build verification
**Files:** All frontend files
**Interfaces:** Entire frontend build
**Acceptance:** `npm run build` exits 0 with 0 TypeScript errors and 0 lint warnings
**Steps:**
1. Run `npm install`
2. Run `npx tsc --noEmit`, count errors (must be 0)
3. Run `npm run build`, confirm exit code 0
4. Commit

### Task 20: Full Rust build verification
**Files:** All backend files
**Interfaces:** Entire Rust build
**Acceptance:** `cargo check` exits 0 with 0 warnings and 0 errors
**Steps:**
1. Run `cargo check` in `src-tauri/`
2. Count warnings (must be 0)
3. Run `cargo build --release`, confirm exit code 0
4. Commit

## Review focus list (5 inputs most likely to bite)
1. **Empty string input** to `set_anc_mode` or `set_gestures` — pinned by Tasks 11, 12
2. **Bluetooth frame not actually sent** — pinned by Task 13 (verify with integration test or manual device)
3. **Toast ID collision** from `Date.now()` — pinned by Task 4 (call showToast twice in same millisecond)
4. **Missing `#root` element** — pinned by Task 5 (test in environment without div#root)
5. **Type mismatch between `types.ts` and `types/index.ts`** — pinned by Task 10 (verify `BatteryLevel` and `EQPreset` fields match)

## Self-check
- Every spec requirement maps to a task: TS type imports (Task 1), dead code (Task 2), store interface mismatch (Task 3), toast IDs (Task 4), non-null assertion (Task 5), fake device (Task 6), any types (Tasks 7, 8), className typos (Task 9), type duplication (Task 10), empty string panics (Tasks 11, 12), Bluetooth send (Task 13), unregister_hotkey (Task 14), .zip extension (Task 15), include_str path (Task 16), session reuse (Task 17), duplicate deps (Task 18), builds (Tasks 19, 20)
- Names match across tasks: `src/api/tauri.ts`, `src/stores/devices.ts`, `src/stores/ui.ts`, `src/main.tsx`, `src/pages/NoiseControl.tsx`, `src/pages/Equalizer.tsx`, `src/pages/Battery.tsx`, `src/pages/Settings.tsx`, `src/types.ts`, `src/types/index.ts`, `src-tauri/src/commands/device.rs`, `src-tauri/src/commands/system.rs`, `src-tauri/src/commands/diagnostics.rs`, `src-tauri/src/db/mod.rs`, `src-tauri/src/bluetooth/linux.rs`, `src-tauri/Cargo.toml`
- No "TBD", "handle edge cases", "add validation", or undefined names
- Each task has its own test cycle (write failing test/verify, implement, run and confirm)