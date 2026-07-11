# EPROM CMS — Visual Theme Reference (Backup)

> **Purpose:** This file documents the app's visual design language so it can be
> restored or kept consistent if styling is ever lost, reverted, or regenerated.
> If the UI looks "off" after a change, this is the source of truth for what the
> theme is *supposed* to be. Treat it as a backup spec, not as code that runs.

The styling is **Tailwind CSS**, compiled via PostCSS into `index.css`. There is
no separate design-token system or CSS-in-JS — every visual decision lives in
Tailwind utility classes on the components.

---

## 1. Foundations

| Aspect | Value | Where |
|---|---|---|
| Color mode | **Forced light mode.** `darkMode: 'class'` is set but the `dark` class is never applied to `<html>`, so dark variants never trigger. | `tailwind.config.js:9` |
| Font | **Inter** (300–800 weights), falling back to `system-ui, sans-serif` | `tailwind.config.js:12`, loaded via Google Fonts in `index.html:8` |
| Page background | `bg-slate-100` | `index.css:12`, `Layout.tsx` |
| Default text | `text-slate-900` | `index.css:12` |
| Scrollbar | Permanent gutter (`scrollbar-gutter: stable`) to prevent layout shift between tabs; thin custom scrollbar via `.custom-scrollbar`; `.no-scrollbar` hides it entirely | `index.css` |
| Direction | Bidirectional (LTR/RTL). Uses logical props (`start`/`end`, `ps`/`pe`) for Arabic support. Locale toggled via `useI18n`. | `Layout.tsx`, `i18n/` |

---

## 2. Color palette

### 2a. Configured brand tokens (`tailwind.config.js`)

These are defined but only **partially** used in the current UI (see note below):

```
brand.900  #0B1120  Deepest navy
brand.800  #151E32  Panel background
brand.700  #2A344A  Border / hover
brand.600  #334155
brand.500  #64748B

energy.teal  #0D9488  Process / flow
energy.gold  #F59E0B  Warning / energy
energy.red   #EF4444  Danger / stop
```

Custom shadows: `shadow-glass`, `shadow-panel`, `shadow-float`.

### 2b. Actual palette used across pages

In practice the live UI is a **light, slate-and-blue** scheme built mostly from
stock Tailwind colors rather than the `brand`/`energy` tokens above:

| Role | Classes |
|---|---|
| Neutrals / surfaces | `slate-50/100/200/300` backgrounds & borders, `slate-600/700/900` text |
| Primary accent | `blue-600` (base) → `blue-700` (hover); light fills `blue-50`, borders `blue-200`, accent text `blue-700` |
| Surfaces / cards | `bg-white` |
| Success / warning / danger | green / amber / red `-600` families |

> ⚠️ **Known inconsistency (intentional to preserve):** the codebase carries two
> palettes — the navy `brand`/`energy` tokens in the config, and the slate/blue
> utilities actually applied in components. The pages are the source of truth for
> what ships. Don't "fix" one to match the other without an explicit request.

---

## 3. Shape & elevation language

The design is **sharp and flat**, not rounded/soft:

- **Corners:** prefer `rounded-none` and `rounded-sm`. `rounded-full` only for
  avatars, dots, and small pills. Avoid `rounded-lg`/`rounded-xl` for panels.
- **Borders over shadows:** surfaces are delineated with `border border-slate-300`
  (or `slate-200`) rather than drop shadows.
- **Elevation:** modals use `shadow-2xl`; subtle lifts use `shadow-sm`/`shadow-md`.
  Custom `shadow-panel`/`shadow-float`/`shadow-glass` exist but are used sparingly.
- **Transitions:** `transition-all`/`transition-colors duration-200` on
  interactive elements; entrance animations via `animate-in fade-in slide-in-from-*`.

---

## 4. Typography conventions

- **Headings & labels lean heavy:** `font-bold`, `font-black` are common.
- **Uppercase micro-labels:** small metadata uses
  `text-xs`/`text-[10px] uppercase tracking-widest` (tags, roles, section labels).
- Body text is `text-sm` at `text-slate-600/700`.

---

## 5. Recurring component idioms

Copy these patterns when building new UI so it matches:

**Card / panel**
```html
<div class="bg-white rounded-sm border border-slate-300">…</div>
```

**Primary button**
```html
<button class="px-4 py-2 text-xs font-black uppercase bg-blue-600 text-white
               hover:bg-blue-700 rounded-none transition-colors">…</button>
```

**Active nav item** (`Layout.tsx`)
```html
text-blue-700 bg-blue-50 border border-blue-200      <!-- active -->
text-slate-600 hover:text-slate-900 hover:bg-slate-100  <!-- idle -->
```

**Modal shell** (`AdminPanel.tsx`)
```html
<div class="bg-white rounded-none shadow-2xl w-full max-w-4xl max-h-[90vh]
            flex flex-col animate-in zoom-in-95 duration-300">…</div>
```

**Pill / badge**
```html
<span class="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">…</span>
```

---

## 6. Layout shell (`components/Layout.tsx`)

- Sticky top header: `bg-white border-b border-slate-300`, `h-20`, logo + role-based
  primary nav + a "More" dropdown + notification bell + user chip + sign-out.
- Content container: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8`.
- Main region animates in: `animate-in fade-in slide-in-from-bottom-2 duration-500`.
- Responsive: desktop nav (`md:flex`) collapses to a hamburger drawer on mobile.
- Accessibility: skip-link to `#main-content`, `aria-label="Primary"` on nav.

---

## 7. Branding

- **Logo:** remote GIF from `eprom.com.eg` via `components/Logo.tsx`
  (`referrerPolicy="no-referrer"`, `object-contain`). No local asset — if the
  remote URL breaks, the logo is the thing to restore.
- Charts: **Recharts**. Icons: **lucide-react**.
- Page `<title>` in `index.html` is currently `Oriens Competency Manager`;
  in-app name/tagline come from i18n (`app.name`, `app.tagline`).

---

## 8. Restoring the theme

If styling regresses, check in this order:
1. `index.css` exists and has the three `@tailwind` directives + base/body layer.
2. `tailwind.config.js` `content` globs cover `pages/`, `components/`, `index.html`.
3. Inter font `<link>` present in `index.html`.
4. PostCSS build is running (Tailwind is compiled, **not** loaded via CDN).
5. No `dark` class is being forced onto `<html>` (would break the light-only design).
</content>
</invoke>
