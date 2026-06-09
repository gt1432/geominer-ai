# GeoMiner AI — Design System (Stitch Specification)

This file serves as the visual source of truth for the **GeoMiner AI** platform. It defines the brand identity, typography, color palettes (supporting both dark and light modes), spacing guidelines, and component patterns.

---

## 1. Visual Identity & Vibe
GeoMiner AI is a premium, data-rich GIS platform for mineral prospectivity mapping. 
*   **Vibe**: Professional, high-fidelity, scientific, and clean.
*   **Dark Mode (Default)**: Deep Space Dark. Focuses on neon accents (Electric Blue, Purple glow) against solid dark slates to give an advanced, high-tech dashboard aesthetic.
*   **Light Mode**: Luminous Ice. Focuses on bright slate-greys, clean white panels, subtle borders, and vivid blue accents for maximum readability in high-ambient environments.

---

## 2. Color Palette (Design Tokens)

### 2.1. Dark Mode (Default Theme)
*   `--bg`: `#0B1220` (Deep Space Background)
*   `--bg-2`: `#0F172A` (Secondary Background)
*   `--bg-3`: `#111827` (Alt Card Background)
*   `--card`: `#1E293B` (Primary Card Background)
*   `--card-2`: `#162032` (Sidebar & Form Card)
*   `--border`: `rgba(255, 255, 255, 0.06)`
*   `--border-bright`: `rgba(59, 130, 246, 0.3)`
*   `--text`: `#F8FAFC` (High-contrast text)
*   `--text-2`: `#CBD5E1` (Standard body text)
*   `--text-3`: `#94A3B8` (Muted captions)
*   `--text-4`: `#64748B` (Sub-captions / disabled)
*   `--shadow`: `0 4px 24px rgba(0, 0, 0, 0.4)`
*   `--shadow-lg`: `0 12px 48px rgba(0, 0, 0, 0.5)`
*   `--shadow-glow`: `0 0 40px rgba(59, 130, 246, 0.15)`

### 2.2. Light Mode (`.light-theme`)
*   `--bg`: `#F8FAFC` (Slate 50 / Luminous Ice)
*   `--bg-2`: `#F1F5F9` (Slate 100)
*   `--bg-3`: `#E2E8F0` (Slate 200)
*   `--card`: `#FFFFFF` (Pure White Card)
*   `--card-2`: `#F8FAFC` (Light Sidebar / Alternate Cards)
*   `--border`: `rgba(15, 23, 42, 0.08)` (Subtle dark border)
*   `--border-bright`: `rgba(37, 99, 235, 0.25)` (Active focus border)
*   `--text`: `#0F172A` (Slate 900)
*   `--text-2`: `#334155` (Slate 700)
*   `--text-3`: `#475569` (Slate 600)
*   `--text-4`: `#64748B` (Slate 500)
*   `--shadow`: `0 4px 20px rgba(15, 23, 42, 0.05)`
*   `--shadow-lg`: `0 10px 30px rgba(15, 23, 42, 0.08)`
*   `--shadow-glow`: `0 0 30px rgba(37, 99, 235, 0.08)`

### 2.3. Accents & Semantics (Shared)
*   `--primary`: `#3B82F6` (Electric Blue - Dark mode) | `#2563EB` (Blue 600 - Light mode)
*   `--primary-dark`: `#2563EB` (Blue 600 - Dark mode) | `#1D4ED8` (Blue 700 - Light mode)
*   `--primary-light`: `#60A5FA` (Blue 400 - Dark mode) | `#3B82F6` (Blue 500 - Light mode)
*   `--primary-glow`: `rgba(59, 130, 246, 0.25)`
*   `--success`: `#22C55E` (Emerald 500) | `#16A34A` (Emerald 600 - Light mode)
*   `--success-bg`: `rgba(34, 197, 94, 0.12)`
*   `--warning`: `#F59E0B` (Amber 500) | `#D97706` (Amber 600 - Light mode)
*   `--warning-bg`: `rgba(245, 158, 11, 0.12)`
*   `--danger`: `#EF4444` (Red 500) | `#DC2626` (Red 600 - Light mode)
*   `--danger-bg`: `rgba(239, 68, 68, 0.12)`
*   `--purple`: `#A855F7` (Amethyst)
*   `--cyan`: `#06B6D4` (Aqua)

---

## 3. Typography
*   **Font Family (Primary)**: `Inter`, sans-serif (Google Fonts). Clean, legible, professional.
*   **Font Family (Mono)**: `JetBrains Mono`, monospace (Google Fonts). Used for coordinates, percentages, and data outputs.
*   **Sizes & Weights**:
    *   Title: `1.9rem` / Weight `800` / Letter Spacing `-0.04em`
    *   Headers: `1.15rem` / Weight `700`
    *   Body: `0.9rem` / Weight `400`
    *   Sub-captions: `0.75rem` / Weight `500`

---

## 4. Layout & Spacing System
*   **Base Spacing Unit**: `8px`
*   **Border Radii**:
    *   Small (Inputs, buttons): `10px`
    *   Medium (Sub-cards, tables): `12px`
    *   Large (Primary layout cards): `18px`
    *   Extra Large (Hero banners): `24px`

---

## 5. Component Patterns & Overrides

### 5.1. Glass Card
*   **Dark**: Semi-transparent dark slate, strong background blur, light white edge border.
*   **Light**: Semi-transparent pure white, background blur, slate border (`rgba(15, 23, 42, 0.06)`).

### 5.2. Form Control (Inputs & Selects)
*   **Dark**: Deep obsidian backgrounds with subtle border. Blue focus glow.
*   **Light**: Near-solid pure white, light grey borders, distinct text. Blue focus outline.

### 5.3. Leaflet GIS Map Styling
*   **Dark Map Layer**: CartoDB Dark Matter (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`)
*   **Light Map Layer**: CartoDB Voyager (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`)
*   **Controls & Popups**:
    *   Dark: Slate backgrounds, white borders, glow highlights.
    *   Light: Pure white backgrounds, slate borders, grey scrollbars.

### 5.4. Theme Switcher Toggle
A rounded slider button containing a sun (`#F59E0B`) and moon (`#60A5FA`) icon.
*   Slider slide animation: `0.4s` cubic-bezier transition.
*   Active state: slide button transitions to active theme color.

### 5.5. Chart.js Configurations
*   **Dark**: Gridlines `rgba(255, 255, 255, 0.05)`, tick text `#94a3b8` (Slate 400).
*   **Light**: Gridlines `rgba(15, 23, 42, 0.06)`, tick text `#475569` (Slate 600).
