# Spec: SoundControl Code Quality Fixes

## Objective
Fix all identified code quality issues in the soundcontrol codebase: TypeScript type errors, dead code, no-op Bluetooth commands, mock implementations returning null, panic-prone string indexing, inconsistent type definitions, and stub background tasks.

## Tech stack with versions
- Frontend: React 18.2.0, TypeScript 5.2.0, Vite 5.0.0, Zustand 4.4.0, Tailwind CSS 3.3.0
- Backend: Rust 2021 edition, Tauri 2.0, rusqlite 0.33, bluer 0.23 (Linux), windows 0.58 (Windows), serde, tokio 1.0
- Build: cargo, tsc, vite build

## Commands (full, runnable)
- Install deps: `npm install`
- Type check: `npx tsc --noEmit`
- Frontend build: `npm run build`
- Rust check: `cargo check` (run in src-tauri/)
- Rust build: `cargo build --release` (run in src-tauri/)
- Lint: not currently configured; no existing lint command

## Project structure (relevant files)
### Frontend (src/)
- `src/api/tauri.ts` — Tauri invoke wrappers (missing type imports)
- `src/stores/devices.ts` — Zustand store (interface/implementation mismatch)
- `src/stores/settings.ts` — Zustand store with persist
- `src/stores/ui.ts` — Zustand store (toast ID collision risk)
- `src/types.ts` — Shared TypeScript interfaces
- `src/types/index.ts` — Duplicate/overlapping type definitions
- `src/utils/helpers.ts` — Device detection helpers
- `src/pages/*.tsx` — 12 page components
- `src/components/*.tsx` — 13 UI components
- `src/App.tsx` — App root with routing
- `src/main.tsx` — React entry point
- `src/routes.tsx` — Dead file (unused)

### Backend (src-tauri/src/)
- `lib.rs` — App state definition
- `main.rs` — Tauri entry, invoke handler registration
- `commands/mod.rs` — Command module declarations
- `commands/settings.rs` — Settings commands
- `commands/bluetooth.rs` — Bluetooth scan/connect/disconnect/state
- `commands/device.rs` — Device feature commands (mostly no-ops)
- `commands/eq.rs` — EQ preset commands
- `commands/diagnostics.rs` — Diagnostics/export/firmware
- `commands/system.rs` — Hotkey/window/system commands
- `bluetooth/mod.rs` — Bluetooth manager abstraction
- `bluetooth/linux.rs` — Linux Bluetooth via bluer
- `bluetooth/windows.rs` — Windows Bluetooth via serialport
- `bluetooth/models.rs` — Bluetooth data models
- `db/mod.rs` — SQLite database layer
- `protocol/mod.rs` — Soundcore protocol frame encoding/decoding
- `protocol/models.rs` — Protocol data models (DeviceProfile, DeviceFeature, etc.)
- `protocol/crc.rs` — CRC16 computation
- `protocol/handshake.rs` — Handshake command builders
- `tasks/mod.rs` — Background tasks (stubs)
- `utils/helpers.rs` — Rust utility functions
- `Cargo.toml` — Dependencies (duplicate declarations)
- `build.rs` — Build script

## Code style
- TypeScript: Prettier-style, no semicolons (existing convention), 2-space indent
- Rust: rustfmt default, 4-space indent, explicit error handling with `?` or `map_err`
- No `@ts-ignore`, `eslint-disable`, `#![allow]`, or stubs that silently fail
- No empty catch blocks, no `.catch(() => {})` silent swallows

## Testing strategy
- No existing test files found in the repository
- After fixes: `npm run build` must exit 0 with 0 TypeScript errors
- After fixes: `cargo check` must exit 0 with 0 warnings
- No panic on empty string input to `set_anc_mode` or `set_gestures`
- Bluetooth commands must actually invoke the Bluetooth send path, not just encode and discard

## Boundaries
**Always:**
- Fix TypeScript type errors so `tsc --noEmit` passes
- Fix Rust compile errors so `cargo check` passes
- Replace `any` types with defined interfaces where interfaces exist
- Remove dead code (`src/routes.tsx`)
- Make Bluetooth set_* commands actually send frames over the connection
- Replace hardcoded null battery returns with real reads or proper errors

**Ask first:**
- Changing database schema or migration SQL
- Adding new dependencies to Cargo.toml or package.json
- Changing the public API surface (Tauri invoke command names/signatures)
- Modifying device profile data in devices.toml

**Never:**
- Add new features or UI pages
- Add `@ts-ignore`, `eslint-disable`, `#![allow(dead_code)]` suppressions
- Leave empty catch blocks or silent `.catch(() => {})`
- Commit secrets or keys to source

## Success criteria (specific and testable)
1. `npx tsc --noEmit` exits 0 with 0 errors
2. `cargo check` exits 0 with 0 warnings
3. `set_anc_mode("", "off")` does not panic — returns an error instead
4. `set_gestures(addr, "", "")` does not panic — returns an error instead
5. Device set_* commands call a Bluetooth send function (not just encode + discard)
6. `get_battery_levels` does not return hardcoded `null` for all fields
7. `src/routes.tsx` is deleted
8. No `any` types remain in store or API files where defined interfaces exist
9. Toast IDs in `useUIStore.showToast` are unique (not `Date.now()` only)
10. `export_diagnostics` does not write a `.json` file with a `.zip` extension

## Open questions
1. Should Windows Bluetooth scanning use actual WinRT Bluetooth APIs instead of serialport COM port enumeration?
2. Should background battery polling actually read battery levels from connected devices, or is event emission sufficient?
3. Should `export_diagnostics` produce a real ZIP archive, or is a JSON file with corrected extension acceptable?
4. Do you want a branch created for these fixes, or should they go directly to main?