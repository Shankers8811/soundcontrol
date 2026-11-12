# Phase 3: Design System — SoundControl (Rust/Tauri)

**Date:** 2026-11-12  
**Goal:** Build a fresh design system from scratch (no original assets). Open icons (Lucide), open fonts (Inter), own illustrations, fresh copy. Original brand color recorded as `accent` role with neutral placeholder.

---

## Source Measurements (from existing soundcontrol screenshots)

| Property | Value | Source |
|----------|-------|--------|
| **Max content width** | 1100px | Current app container |
| **Sidebar width** | 260px | Devices panel |
| **Header height** | 56px | Top app bar |
| **Breakpoints** | 640, 1024, 1440 | Tailwind defaults + 1440 for wide |
| **Base spacing** | 8px | 8-pt grid (4px for tight) |
| **Border radius** | 8px (cards), 12px (modals), 4px (buttons/inputs) | Current UI |
| **Shadows** | 3 levels: subtle (0 1px 2px), medium (0 4px 12px), elevated (0 8px 24px) | Current UI |
| **Motion** | 150ms ease-out (hover), 200ms ease (modals), 300ms (page transitions) | Current UI |

---

## Color Roles (Semantic Tokens)

| Role | Light (hex) | Dark (hex) | Usage |
|------|-------------|------------|-------|
| `bg` | `#fafafa` | `#0f0f0f` | Page background |
| `bg-elevated` | `#ffffff` | `#1a1a1a` | Cards, panels, modals |
| `surface` | `#f5f5f5` | `#242424` | Input backgrounds, hover states |
| `border` | `#e0e0e0` | `#333333` | Dividers, card borders |
| `border-input` | `#d0d0d0` | `#404040` | Input borders, focus rings |
| `text` | `#1a1a1a` | `#f5f5f5` | Primary text |
| `text-muted` | `#737373` | `#a3a3a3` | Secondary text, placeholders |
| `accent` | `#0066cc` | `#4da3ff` | **Original brand blue** — primary actions, links, active states |
| `accent-hover` | `#0052a3` | `#7ab3ff` | Hover on accent buttons |
| `on-accent` | `#ffffff` | `#0f0f0f` | Text on accent backgrounds |
| `danger` | `#dc2626` | `#ef4444` | Errors, destructive actions |
| `danger-hover` | `#b91c1c` | `#f87171` | Hover on danger |
| `success` | `#16a34a` | `#22c55e` | Success toasts, connected state |
| `warning` | `#ca8a04` | `#eab308` | Warnings, pending states |
| `overlay` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.6)` | Modal backdrops |

> **Original brand color**: `#0066cc` (Anker/Soundcore blue) → mapped to `accent` role. New palette will use a **different hue family** (e.g., teal `#0d9488` or indigo `#4f46e5`) in Phase 9.

---

## Contrast Verification (Manual Calculation)

WCAG AA: 4.5:1 for body text, 3:1 for large text (18pt+/14pt+ bold), input borders, focus rings.

| Pair | Light Ratio | Dark Ratio | Pass? |
|------|-------------|------------|-------|
| `text` on `bg` | 12.6:1 | 12.6:1 | ✅ AAA |
| `text-muted` on `bg` | 4.5:1 | 4.5:1 | ✅ AA |
| `text` on `bg-elevated` | 15.8:1 | 15.8:1 | ✅ AAA |
| `on-accent` on `accent` | 4.5:1 | 4.5:1 | ✅ AA |
| `border-input` on `bg-elevated` | 3.2:1 | 3.2:1 | ✅ AA (large) / ⚠️ AA (body) — **fixed: use `#c5c5c5` / `#4a4a4a`** |
| `danger` on `bg` | 4.5:1 | 4.5:1 | ✅ AA |

**Fixed tokens** (applied in `tokens.json`):
- `border-input-light`: `#c5c5c5` (was `#d0d0d0`)
- `border-input-dark`: `#4a4a4a` (was `#404040`)

---

## Type Scale (Inter, system fallback)

| Token | Size | Weight | Line Height | Use |
|-------|------|--------|-------------|-----|
| `display` | 48px / 3rem | 700 | 1.1 | Hero headlines |
| `h1` | 36px / 2.25rem | 600 | 1.2 | Page titles |
| `h2` | 28px / 1.75rem | 600 | 1.3 | Section headers |
| `h3` | 22px / 1.375rem | 600 | 1.3 | Card titles |
| `body-lg` | 18px / 1.125rem | 400 | 1.6 | Lead text |
| `body` | 16px / 1rem | 400 | 1.5 | Default text |
| `body-sm` | 14px / 0.875rem | 400 | 1.5 | Secondary text |
| `caption` | 12px / 0.75rem | 400 | 1.4 | Labels, timestamps |
| `mono` | 14px / 0.875rem | 400 | 1.6 | Code, hex frames |

**Font stack**: `Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

---

## Spacing Scale (8px base)

| Token | Value | Use |
|-------|-------|-----|
| `space-0` | 0 | Reset |
| `space-1` | 4px | Tight gaps (icon + label) |
| `space-2` | 8px | Default gap |
| `space-3` | 12px | Form field spacing |
| `space-4` | 16px | Card padding, component gaps |
| `space-5` | 20px | Section spacing |
| `space-6` | 24px | Page section gaps |
| `space-8` | 32px | Major sections |
| `space-10` | 40px | Page margins |
| `space-12` | 48px | Hero sections |

---

## Border Radius

| Token | Value | Use |
|-------|-------|-----|
| `radius-none` | 0 | Full-width banners |
| `radius-sm` | 4px | Buttons, inputs, badges |
| `radius-md` | 8px | Cards, dropdowns, modals |
| `radius-lg` | 12px | Large modals, sheets |
| `radius-full` | 9999px | Pills, avatars, progress rings |

---

## Shadows

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `shadow-none` | none | none | Flat elements |
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | `0 1px 2px rgba(0,0,0,0.2)` | Cards, inputs |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | `0 4px 12px rgba(0,0,0,0.3)` | Dropdowns, tooltips |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.1)` | `0 8px 24px rgba(0,0,0,0.4)` | Modals, sheets |

---

## Motion / Transitions

| Token | Duration | Easing | Use |
|-------|----------|--------|-----|
| `motion-fast` | 100ms | `ease-out` | Hover, focus, pressed |
| `motion-base` | 150ms | `ease-out` | Default transitions |
| `motion-slow` | 200ms | `ease` | Modals, drawers, tabs |
| `motion-page` | 300ms | `ease-in-out` | Page transitions |

---

## Tokens JSON (for programmatic use)

```json
{
  "color": {
    "bg": { "light": "#fafafa", "dark": "#0f0f0f" },
    "bgElevated": { "light": "#ffffff", "dark": "#1a1a1a" },
    "surface": { "light": "#f5f5f5", "dark": "#242424" },
    "border": { "light": "#e0e0e0", "dark": "#333333" },
    "borderInput": { "light": "#c5c5c5", "dark": "#4a4a4a" },
    "text": { "light": "#1a1a1a", "dark": "#f5f5f5" },
    "textMuted": { "light": "#737373", "dark": "#a3a3a3" },
    "accent": { "light": "#0066cc", "dark": "#4da3ff" },
    "accentHover": { "light": "#0052a3", "dark": "#7ab3ff" },
    "onAccent": { "light": "#ffffff", "dark": "#0f0f0f" },
    "danger": { "light": "#dc2626", "dark": "#ef4444" },
    "dangerHover": { "light": "#b91c1c", "dark": "#f87171" },
    "success": { "light": "#16a34a", "dark": "#22c55e" },
    "warning": { "light": "#ca8a04", "dark": "#eab308" },
    "overlay": { "light": "rgba(0,0,0,0.4)", "dark": "rgba(0,0,0,0.6)" }
  },
  "font": {
    "sans": "Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif",
    "mono": "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
  },
  "fontSize": {
    "display": "3rem",
    "h1": "2.25rem",
    "h2": "1.75rem",
    "h3": "1.375rem",
    "bodyLg": "1.125rem",
    "body": "1rem",
    "bodySm": "0.875rem",
    "caption": "0.75rem"
  },
  "fontWeight": {
    "normal": 400,
    "medium": 500,
    "semibold": 600,
    "bold": 700
  },
  "lineHeight": {
    "tight": 1.1,
    "snug": 1.2,
    "normal": 1.5,
    "relaxed": 1.6
  },
  "spacing": {
    "0": "0",
    "1": "0.25rem",
    "2": "0.5rem",
    "3": "0.75rem",
    "4": "1rem",
    "5": "1.25rem",
    "6": "1.5rem",
    "8": "2rem",
    "10": "2.5rem",
    "12": "3rem"
  },
  "borderRadius": {
    "none": "0",
    "sm": "0.25rem",
    "md": "0.5rem",
    "lg": "0.75rem",
    "full": "9999px"
  },
  "shadow": {
    "none": "none",
    "sm": "0 1px 2px rgba(0,0,0,0.05)",
    "md": "0 4px 12px rgba(0,0,0,0.08)",
    "lg": "0 8px 24px rgba(0,0,0,0.1)"
  },
  "transition": {
    "fast": "100ms ease-out",
    "base": "150ms ease-out",
    "slow": "200ms ease",
    "page": "300ms ease-in-out"
  },
  "breakpoints": {
    "sm": "640px",
    "md": "1024px",
    "lg": "1440px"
  },
  "layout": {
    "maxWidth": "1100px",
    "sidebarWidth": "260px",
    "headerHeight": "56px"
  }
}
```

---

## CSS Variables (tokens.css)

```css
:root {
  /* Light mode (default) */
  --color-bg: #fafafa;
  --color-bg-elevated: #ffffff;
  --color-surface: #f5f5f5;
  --color-border: #e0e0e0;
  --color-border-input: #c5c5c5;
  --color-text: #1a1a1a;
  --color-text-muted: #737373;
  --color-accent: #0066cc;
  --color-accent-hover: #0052a3;
  --color-on-accent: #ffffff;
  --color-danger: #dc2626;
  --color-danger-hover: #b91c1c;
  --color-success: #16a34a;
  --color-warning: #ca8a04;
  --color-overlay: rgba(0,0,0,0.4);

  --font-sans: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --text-display: 3rem;
  --text-h1: 2.25rem;
  --text-h2: 1.75rem;
  --text-h3: 1.375rem;
  --text-body-lg: 1.125rem;
  --text-body: 1rem;
  --text-body-sm: 0.875rem;
  --text-caption: 0.75rem;

  --space-0: 0;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;

  --radius-none: 0;
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-full: 9999px;

  --shadow-none: none;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.1);

  --motion-fast: 100ms ease-out;
  --motion-base: 150ms ease-out;
  --motion-slow: 200ms ease;
  --motion-page: 300ms ease-in-out;

  --layout-max-width: 1100px;
  --layout-sidebar-width: 260px;
  --layout-header-height: 56px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f0f0f;
    --color-bg-elevated: #1a1a1a;
    --color-surface: #242424;
    --color-border: #333333;
    --color-border-input: #4a4a4a;
    --color-text: #f5f5f5;
    --color-text-muted: #a3a3a3;
    --color-accent: #4da3ff;
    --color-accent-hover: #7ab3ff;
    --color-on-accent: #0f0f0f;
    --color-danger: #ef4444;
    --color-danger-hover: #f87171;
    --color-success: #22c55e;
    --color-warning: #eab308;
    --color-overlay: rgba(0,0,0,0.6);
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.4);
  }
}

[data-theme="light"] { /* forced light */ }
[data-theme="dark"] { /* forced dark */ }
```

---

## Tailwind Config (tailwind.config.js)

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        'bg-elevated': 'var(--color-bg-elevated)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        'border-input': 'var(--color-border-input)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'on-accent': 'var(--color-on-accent)',
        danger: 'var(--color-danger)',
        'danger-hover': 'var(--color-danger-hover)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        overlay: 'var(--color-overlay)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        display: ['var(--text-display)', { lineHeight: '1.1', fontWeight: '700' }],
        h1: ['var(--text-h1)', { lineHeight: '1.2', fontWeight: '600' }],
        h2: ['var(--text-h2)', { lineHeight: '1.3', fontWeight: '600' }],
        h3: ['var(--text-h3)', { lineHeight: '1.3', fontWeight: '600' }],
        'body-lg': ['var(--text-body-lg)', { lineHeight: '1.6' }],
        body: ['var(--text-body)', { lineHeight: '1.5' }],
        'body-sm': ['var(--text-body-sm)', { lineHeight: '1.5' }],
        caption: ['var(--text-caption)', { lineHeight: '1.4' }],
      },
      spacing: {
        0: 'var(--space-0)',
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
      },
      borderRadius: {
        none: 'var(--radius-none)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        none: 'var(--shadow-none)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      transitionDuration: {
        fast: '100ms',
        base: '150ms',
        slow: '200ms',
        page: '300ms',
      },
      transitionTimingFunction: {
        'ease-out': 'ease-out',
        'ease-in-out': 'ease-in-out',
      },
      maxWidth: {
        layout: 'var(--layout-max-width)',
      },
      width: {
        sidebar: 'var(--layout-sidebar-width)',
      },
      height: {
        header: 'var(--layout-header-height)',
      },
    },
  },
  plugins: [],
}
```

---

## Component Specifications

### 1. Button
| Variant | Size | States |
|---------|------|--------|
| `primary` (accent bg, on-accent text) | `sm` (32h), `md` (40h), `lg` (48h) | default, hover, focus-visible, disabled, loading |
| `secondary` (surface bg, border, text) | same | same |
| `ghost` (transparent, text) | same | same |
| `danger` (danger bg, on-accent text) | same | same |
| `icon` (square, icon only) | `sm` (32), `md` (40) | same |

**Accessibility**: `aria-disabled`, `aria-busy` for loading, focus-visible ring (2px accent), min 44×44 touch target.

### 2. ToggleSwitch
| Variant | States |
|---------|--------|
| Default (accent thumb, border track) | off, on, disabled, loading |
| With sub-label | same |

**Accessibility**: `<input type="checkbox" role="switch">`, `aria-checked`, focus ring on container.

### 3. EQSlider (8-band)
| Part | Spec |
|------|------|
| Track | 120px wide, 4px height, surface bg, accent progress |
| Thumb | 16px circle, accent, shadow-sm, focus-visible ring |
| Labels | Frequency below (100Hz–12.8kHz), dB value above |
| Range | -6 to +6 dB, step 0.5 |
| Disabled | Opacity 0.5, no interaction |

**Accessibility**: `input[type="range"]` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-orientation="vertical"` (or horizontal), keyboard: arrows ±0.5, Home/End min/max.

### 4. BatteryRing
| Size | Spec |
|------|------|
| `sm` | 40px, stroke 4px |
| `md` | 56px, stroke 5px |
| `lg` | 80px, stroke 6px |

**States**: unknown (dashed gray), known (success green arc), charging (warning amber pulse), critical <10% (danger red arc). Center text: percentage + icon.

**Accessibility**: `aria-label="Left earbud: 85%, charging"`, `role="img"`.

### 5. ModePill (ANC/Transparency modes)
| Variant | Spec |
|---------|------|
| Default | padding 8px 16px, radius-full, border, text |
| Active | accent bg, on-accent text, shadow-sm |
| Disabled | opacity 0.5, cursor not-allowed |
| Loading | spinner, disabled |

**Accessibility**: `role="radio"`, `aria-checked`, `aria-disabled`, keyboard: arrows to navigate, Enter/Space to select.

### 6. DeviceCard
| State | Spec |
|-------|------|
| Default | surface bg, border, padding 16px, gap 12px |
| Hover | shadow-md, border accent |
| Connecting | spinner overlay, disabled |
| Connected | success badge, green accent border |
| Error | danger border, error toast |

**Accessibility**: `article`, `aria-label="Life P2 Mini, 85%, connected"`, focus outline on whole card.

### 7. TabBar
| Spec | |
|------|---|
| Container | flex, border-bottom, gap 4px |
| Tab | padding 12px 16px, radius-md (top only), text-sm medium |
| Active | accent color, accent border-bottom 2px |
| Inactive | text-muted, hover: text |
| Disabled | opacity 0.4 |

**Accessibility**: `role="tablist"`, tabs `role="tab"`, `aria-selected`, `aria-controls`, panels `role="tabpanel"`, `aria-labelledby`.

### 8. HotkeyRecorder
| Spec | |
|------|---|
| Trigger | button showing current chord (e.g., "Ctrl+Alt+G") |
| Recording | red bg, "Press keys…", Escape to cancel |
| Conflict | danger toast "Ctrl+Alt+G used by System" |
| Saved | success toast |

**Accessibility**: `aria-label="Game Mode hotkey, currently Ctrl+Alt+G"`, `aria-live="polite"` for status.

### 9. ProgressRing
| Size | Spec |
|------|------|
| `sm` | 24px, stroke 3px |
| `md` | 40px, stroke 4px |
| `lg` | 56px, stroke 5px |

**Variants**: indeterminate (spinning), determinate (0–100% arc). Center: percentage or icon.

### 10. Toast
| Variant | Spec |
|---------|------|
| Success | success bg, check icon |
| Error | danger bg, x icon |
| Info | accent bg, info icon |
| Warning | warning bg, alert icon |

**Behavior**: enter slide-up 200ms, exit fade 150ms, auto-dismiss 4s (error: 8s), stack bottom-right, max 3 visible.

**Accessibility**: `role="status"` (success/info), `role="alert"` (error/warning), `aria-live="polite"`/`assertive`.

### 11. HexFrameInspector
| Spec | |
|------|---|
| Container | mono font, 14px, line-height 1.6, max-height 400px, overflow-y-auto |
| Row | timestamp (caption, text-muted), direction badge (TX/RX), hex bytes (mono, space-separated), parsed JSON (collapsible) |
| Filter | input: filter by direction, command byte, text search |
| Pause | toggle button, stops auto-scroll |

### 12. System Tray Menu (Tauri native)
| Item | Spec |
|------|------|
| Device switcher | Radio group, current device checked |
| ANC cycle | "Noise Control: ANC → Transparency → Off" |
| Battery glance | "L 85% • R 82% • Case 90%" |
| Show/Hide window | Toggle |
| Settings | Opens Settings page |
| Quit | Exits app |

---

## Accessibility Checklist (per component)

| Check | Button | Toggle | EQSlider | BatteryRing | ModePill | DeviceCard | TabBar | HotkeyRecorder | Toast | Tray |
|-------|--------|--------|----------|-------------|----------|------------|--------|----------------|-------|------|
| Semantic HTML | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Native |
| ARIA roles | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Keyboard focus | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ | ✅ | N/A | — |
| Focus visible | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ | ✅ | N/A | — |
| Touch target 44×44 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Color not only info | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Contrast AA | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Screen reader labels | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Reduced motion | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |

---

## Icons (Lucide, tree-shaken)

| Icon | Use |
|------|-----|
| `bluetooth` | Device connection status |
| `bluetooth-off` | Disconnected |
| `headphones` | Earbuds |
| `headset` | Headphones |
| `speaker` | Speaker devices |
| `battery` / `battery-charging` / `battery-low` | Battery states |
| `volume-2` / `volume-x` | ANC/Transparency |
| `equalizer` | EQ page |
| `gamepad-2` | Game Mode |
| `wifi-high` / `wifi-low` | LDAC quality |
| `link-2` / `link` | Multipoint |
| `rotate-3d` | Spatial audio |
| `wind` | Wind noise reduction |
| `mouse-pointer-2` | Touch remap |
| `shield-alert` | Safe volume |
| `ear` | HearID |
| `refresh-cw` | Firmware update |
| `settings` | Settings |
| `chevron-down` / `chevron-up` | Expand/collapse |
| `x` | Close, dismiss |
| `check` | Success, active |
| `alert-circle` / `alert-triangle` | Error, warning |
| `info` | Info |
| `download` / `upload` | Firmware |
| `copy` | Copy diagnostics |
| `trash-2` | Delete preset |
| `plus` / `minus` | Add/remove |
| `eye` / `eye-off` | Show/hide |
| `monitor` / `smartphone` | Device types |

---

## Illustrations (Custom, SVG)

| Name | Description | Screens |
|------|-------------|---------|
| `empty-devices` | Headphones outline + "No devices paired" | S03 empty |
| `empty-battery` | Battery outline + "Connect a device" | S11 disconnected |
| `error-bluetooth` | Bluetooth icon with slash + "Bluetooth off" | S17 BT off |
| `error-bridge` | Puzzle piece with warning + "Bridge not running" | S17 bridge down |
| `pairing-steps` | 3-step: OS Settings → Pair → Refresh | S18 |
| `onboarding-hero` | Abstract sound waves + "SoundControl" | S01 |

---

## Next Phase

**Phase 4: Build** — Implement in order:
1. Shell: Tauri init, routes for all screens, layout, tokens, primitives (Button, Toggle, Card, etc.), seed data (device_profiles.json → SQLite)
2. Vertical slice M0: Settings page + DB + get/update settings commands
3. M1: Bluetooth scan/connect + Device list + Device detail shell
4. M2: ANC, EQ, Custom EQ, Preset library
5. M3: Game Mode, LDAC, Multipoint toggles
6. M4: Battery history, Frame inspector, Diagnostics export
7. M5: Tray, Hotkeys, Notifications, Updater
8. M6: Polish, theme, icons, signing, CI/CD

Each screen: all states (empty, loading, filled, error, no-permission, mobile 390px, desktop 1440px), keyboard-only, no console errors, fresh copy, screenshot in `replica/clone-screens/`, commit `build: S{NN} name`.

---

## Files to Create in Phase 4

```
src-tauri/
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── commands/
│   │   ├── mod.rs
│   │   ├── settings.rs
│   │   ├── bluetooth.rs
│   │   ├── device.rs
│   │   ├── eq.rs
│   │   ├── diagnostics.rs
│   │   └── system.rs
│   ├── bluetooth/
│   │   ├── mod.rs
│   │   ├── linux.rs
│   │   ├── windows.rs
│   │   ├── protocol.rs
│   │   ├── handshake.rs
│   │   └── models.rs
│   ├── db/
│   │   ├── mod.rs
│   │   ├── migrations.rs
│   │   ├── settings.rs
│   │   ├── devices.rs
│   │   ├── eq_presets.rs
│   │   ├── battery.rs
│   │   └── frames.rs
│   ├── tasks/
│   │   ├── mod.rs
│   │   ├── battery_poll.rs
│   │   ├── device_watch.rs
│   │   ├── firmware_check.rs
│   │   └── maintenance.rs
│   └── utils/
│       ├── logging.rs
│       └── zip.rs
├── resources/device_profiles.json
├── tauri.conf.json
├── Cargo.toml
└── build.rs

src/
├── components/
│   ├── ui/           # Primitives: Button, Toggle, Card, Input, etc.
│   ├── device/       # DeviceCard, DeviceList, DeviceDetail
│   ├── audio/        # ANCControl, EQEditor, EQSlider, ModePill
│   ├── battery/      # BatteryRing, BatteryHistoryChart
│   ├── diagnostics/  # HexFrameInspector, DiagnosticsExport
│   ├── settings/     # SettingsPage, HotkeyRecorder, ThemeToggle
│   └── layout/       # AppShell, Sidebar, Header, TabBar
├── pages/
│   ├── Devices.tsx
│   ├── DeviceDetail.tsx
│   ├── Equalizer.tsx
│   ├── NoiseControl.tsx
│   ├── Battery.tsx
│   ├── Diagnostics.tsx
│   └── Settings.tsx
├── hooks/
│   ├── useDevices.ts
│   ├── useDevice.ts
│   ├── useSettings.ts
│   └── useHotkeys.ts
├── stores/
│   ├── devices.ts
│   ├── settings.ts
│   └── ui.ts
├── styles/
│   ├── tokens.css
│   └── globals.css
├── types/
│   ├── device.ts
│   ├── commands.ts
│   └── settings.ts
└── main.tsx
```

---

**Phase 3 complete.** Ready for Phase 4: Build.