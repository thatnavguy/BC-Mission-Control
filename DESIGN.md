---
name: BC Mission Control
description: A white, modern BC admin console at Linear/Vercel craft level — Fluent UI v9 kept, reskinned hairline-crisp with one blue action color and a fox-orange dash.
colors:
  action-blue: "#0f6cbd"
  selection-bg: "#d6e8f8"
  selection-ink: "#0c3b5e"
  fox-orange: "#e8722a"
  fox-orange-hover: "#d4641d"
  fox-orange-soft: "#fdf1e7"
  fox-orange-border: "#f5d3b8"
  fox-orange-ink: "#a34d12"
  fox-navy: "#1f3a5f"
  surface-1: "#ffffff"
  surface-2: "#fafafa"
  surface-3: "#f5f4f2"
  code-surface: "#f7f6f4"
  stroke-1: "#e6e4e1"
  stroke-2: "#edebe8"
  card-stroke: "#e7e5e1"
  stroke-strong: "#d6d3cf"
  scrollbar-hover: "#bdbab5"
  ink: "#1b1a19"
  ink-muted: "#6b6a68"
typography:
  title:
    fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  card-title:
    fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
  body:
    fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  supporting:
    fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  section-label:
    fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.8px"
  mono:
    fontFamily: "Consolas, 'Courier New', monospace"
    fontSize: "12px"
    lineHeight: "16px"
rounded:
  control: "6px"
  inset: "8px"
  card: "10px"
  image: "12px"
  chip: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  page-y: "28px"
  page-x: "36px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.card}"
    padding: "20px"
  step-chip:
    backgroundColor: "{colors.fox-orange-soft}"
    textColor: "{colors.fox-orange-ink}"
    rounded: "{rounded.chip}"
    size: "22px"
  code-surface:
    backgroundColor: "{colors.code-surface}"
    rounded: "{rounded.inset}"
    padding: "12px"
  brand-mark:
    backgroundColor: "{colors.fox-orange-soft}"
    rounded: "{rounded.card}"
    size: "44px"
---

# Design System: BC Mission Control

## Overview

**Creative North Star: "The Category Standard, Played Straight"**

BC Mission Control looks like the best version of the tools its users already live in. The visual system is the white modern admin-tool canon executed at Linear/Vercel craft level: white and near-white grounds, near-black ink, hairline borders everywhere, and Fluent UI v9 components kept intact for behavior while the skin is reskinned crisp. Identity comes from precision, not costume — one blue action color, one fox-orange dash reserved for brand moments, and the fox mascot appearing exactly where a human would smile.

The system refuses two directions at once: the themed-costume worlds (no dark cockpit, no gateboard) and the default grey Fluent look (surfaces are re-toned white, cards are flattened to `boxShadow: none`, strokes re-specced to a warm-neutral hairline set). The dark-mode auto-switch was intentionally removed; there is one branded light theme and it is the whole product.

Density respects the admin-tool genre — compact tables, small badges, 12px supporting text — but spacing stays generous around it: 20px card padding, 20px page stack gaps, a 28px/36px page inset. One motion moment exists (the page-settle on navigation) and nothing else moves.

**Key Characteristics:**
- White/near-white grounds with a warm-neutral hairline stroke set; no shadows
- Fluent blue `#0f6cbd` as the single action color
- Fox orange `#e8722a` reserved for brand moments, never for status or data
- Fox mascot (`web/public/mascot.png` full scene, `mascot-mark.png` face crop, `mascot-sleeping.png` waiting variant) at the nav brand block, empty states, and the Setup hero
- Browser surfaces (selection, caret, scrollbars) themed in `global.css`
- One authored motion moment with a reduced-motion guard; single light theme only

## Colors

The palette is a warm-neutral white system with one cold blue doing all the work and one warm orange kept rare.

### Primary
- **Action Blue** (`#0f6cbd`): Fluent's brand blue, kept as the single action color — primary buttons, links, active nav indicator, focus, caret. It is the only color that ever asks for a click.
- **Selection Blue** (`#d6e8f8` on `#0c3b5e` ink): text selection, set in `global.css` so even the browser chrome agrees with the theme.

### Secondary
- **Fox Orange** (`#e8722a`): mascot-derived brand accent. Appears only at brand moments: the nav brand-mark frame, numbered step chips, empty states, and the Setup hero gradient. Never a status color, never a data color, never an action color.
- **Fox Orange Hover** (`#d4641d`): hover deepening for the rare orange interactive element.
- **Fox Soft / Border / Ink** (`#fdf1e7`, `#f5d3b8`, `#a34d12`): the orange's supporting tints — soft fills behind mascot frames and step chips, a warm hairline around them, and a burnt-orange ink for text on those fills.
- **Fox Navy** (`#1f3a5f`): mascot-derived deep tone, held in reserve for future brand illustration; not used on working surfaces.

### Neutral
- **Paper White** (`#ffffff`): the shell and every card. The default resting surface.
- **Warm Wash** (`#fafafa`): the nav rail and recessed areas (drop zones, nested tenant cards) — one step down from white.
- **Warm Panel** (`#f5f4f2`): the deepest neutral background, used sparingly for tertiary surfaces.
- **Code Grey** (`#f7f6f4`): inset surface for logs, device codes, and code blocks — reads as "machine output lives here."
- **Ink** (`#1b1a19`): near-black warm text for titles and primary content.
- **Muted Ink** (`#6b6a68`): descriptions, hints, page subtitles.
- **Hairlines** (`#e6e4e1`, `#edebe8`, `#e7e5e1`): the stroke family — Fluent stroke1/stroke2 re-toned warm, plus the card border. Borders are the system's entire depth strategy.
- **Strong Stroke** (`#d6d3cf`): accessible stroke, dashed drop-zone border, scrollbar thumb; `#bdbab5` is its hover state.

### Named Rules
**The One Action Color Rule.** Blue is the only color that invites interaction. If a new accent appears on a button, link, or active state, it is a defect. Status colors (success/warning/danger on badges and MessageBars) come from Fluent's palette and are the only sanctioned exception.

**The Fox Reserve Rule.** Fox orange is a brand color, not a UI color. It appears at most once per view, at a brand moment — mascot frame, step chips, an empty state, the Setup hero. It must never carry status, data, or a primary action; rarity is the point.

## Typography

**Display / Body Font:** Segoe UI (with the Fluent system fallback stack)
**Mono Font:** Consolas (Fluent monospace stack) for run logs, device codes, and code surfaces

**Character:** One type voice, no display face. The system trusts the Fluent ramp and differentiates through weight and size discipline, not font variety. Typography is quiet; precision does the branding.

### Hierarchy
- **Title** (600, 20px, 28px line-height): Fluent `Title2`; one per page, top-left of the content column.
- **Card Title** (600, 16px, 22px): Fluent `Title3`; heads each card, optionally led by an orange step chip.
- **Body** (400, 14px, 20px): default content text; page descriptions are body-size muted ink pulled tight under the title (-10px margin).
- **Supporting** (400, 12px, 16px): hints, secondary detail, empty-state copy (max 46ch), table cell metadata.
- **Section Label** (600, 12px, uppercase, +0.8px tracking): the Cloud / Container / General nav groupings only.
- **Mono** (Consolas, 12px): run logs and machine output. One sanctioned escalation: the Entra device code renders at 28px with +4px tracking inside the code surface, sized for transcription.

### Named Rules
**The One Voice Rule.** No display fonts, no editorial type moments. Segoe UI carries every screen; the brand is carried by color restraint and the fox, never by typography.

## Layout

A fixed two-column shell: a 240px nav rail on `surface-2` separated by a single `stroke-2` hairline, and a scrolling content column on white inset `28px 36px`. Pages are vertical stacks with a 20px gap and a max width of 960–1100px; cards are the unit of composition. Spacing runs on an 8px grid: 4/8/12/16/20/24px are the working steps, with 12px the standard internal card gap.

One breakpoint at 720px: the nav rail collapses to a 60px icon strip (labels and section headings hidden) and the content inset tightens to `20px 16px`. Nothing else reflows — this is a desktop-first operator tool with a graceful narrow fallback.

## Elevation & Depth

The system is flat by construction. Cards, dialogs, and nested panels all ship `boxShadow: none`; depth is conveyed entirely by the tonal ladder (white → warm wash → warm panel → code grey) plus the warm hairline stroke set. Fluent's default dialog/shadow tokens are not extended with custom shadows.

### Named Rules
**The Flat-By-Default Rule.** Do not add shadows. If a surface needs to sit "above," give it the next-lighter background and a hairline border. The single sanctioned exception is Fluent's own dialog scrim/surface behavior, which ships unmodified.

## Shapes

Gently curved, in three calm steps: controls at 6px, inset code/log surfaces at 8px, cards and mascot frames at 10px (12px on the empty-state image for a softer editorial crop). Step chips are perfect circles (`border-radius: 50%`). Borders are the signature: every container carries a 1px warm hairline, and the drop zone escalates to a 1.5px dashed strong stroke at rest, 2px dashed blue when a drag is active. Nothing is clipped, skewed, or offset; the geometry is rectilinear and quiet.

## Components

### Buttons
- **Shape:** gently curved (6px radius)
- **Primary:** Action Blue fill, white text; Fluent `appearance="primary"`. One per view is the norm (e.g. the Deploy page's single large primary).
- **Hover / Focus:** Fluent's built-in brand ramps; the caret color is pinned to Action Blue in `global.css`.
- **Secondary / Subtle:** default and `subtle` Fluent appearances — white/transparent with hairline strokes; icon-only row actions (delete, refresh) use `subtle`.

### Badges & Status
- **Style:** Fluent `Badge`, filled appearance, small size; status semantics come from Fluent's success / warning / danger / informative / subtle palette, `brand` reserved for "Scheduled."
- **Rule:** status color is the only place the palette widens beyond blue + orange, and it is always Fluent's semantic color, never fox orange.

### Cards / Containers
- **Corner Style:** 10px radius
- **Background:** Paper White; nested groupings (tenant cards) drop to Warm Wash
- **Shadow Strategy:** none — see The Flat-By-Default Rule
- **Border:** 1px card-stroke hairline (`#e7e5e1`)
- **Internal Padding:** 20px, with 12px standard internal gaps

### Inputs / Fields
- **Style:** Fluent `Input`, `Dropdown`, `Checkbox` on white with the re-toned hairline strokes
- **Focus:** Fluent focus treatment in Action Blue
- **Drop Zone:** dashed strong-stroke border on Warm Wash; drag-active state switches to a 2px dashed blue border on the Fluent brand tint — the one place blue decorates a surface rather than a control.

### Navigation
- **Style:** 240px vertical rail on Warm Wash, right hairline divider; Fluent `TabList` vertical subtle, large size, with Fluent icons.
- **Brand Block:** 44px mascot mark in a 10px-radius fox-soft frame with a fox-border hairline, beside a 15px/700 wordmark and 11px muted tagline.
- **Active State:** Fluent's blue active indicator — the rail's only persistent color besides the brand block.
- **Sections:** uppercase 12px section labels (Cloud / Container / General) in muted ink.
- **Narrow (<720px):** collapses to a 60px icon-only strip; brand text and section labels hide.

### Step Chips (signature)
- **Style:** 22px circle, fox-soft fill, fox-border hairline, fox-ink 12px/700 numeral; leads numbered card titles ("1 Upload apps") on wizard-style pages. The most common fox-orange sighting.

### Code & Log Surfaces
- **Style:** Code Grey fill, 1px `stroke-2` hairline, 8px radius, 12px padding, Consolas 12px. The run log auto-scrolls and caps at 360px height; the Entra device code escalates to 28px mono with +4px tracking for transcription.

### Empty States (signature)
- **Style:** centered column, 36px/24px padding; the sleeping-fox mascot (`mascot-sleeping.png`, 170px wide at natural aspect) in a 12px-radius fox-soft frame with a fox-border hairline, a 15px/600 title, and a 13px muted hint capped at 46ch. The mascot does the warming; copy stays terse.

### Setup Hero (signature)
- **Style:** a 105° gradient from fox-soft to white across the top of the Authentication card, fox-border hairline under it, 168×106px mascot crop (`62% 40%`) on white at the right. The single largest orange moment in the product — deliberately on the page every user visits first.

## Do's and Don'ts

### Do:
- **Do** keep Fluent UI v9 components and behavior intact; reskin through the theme token overrides in `web/src/theme.ts`, not by replacing components.
- **Do** use Action Blue (`#0f6cbd`) for every interactive affordance and nothing else.
- **Do** give every new surface a 1px warm hairline border and `boxShadow: none`.
- **Do** keep spacing on the 8px grid (4/8/12/16/20/24) and page insets at 28px/36px.
- **Do** route recurring neutral/brand values through the `theme` and `fox` exports in `theme.ts` rather than re-typing hex.
- **Do** keep the single light theme; there is no dark mode to design for.

### Don't:
- **Don't** use fox orange (`#e8722a`) for status, data visualization, links, or primary actions — it is brand-reserved, one moment per view.
- **Don't** add drop shadows, glows, or elevation tokens; depth is tonal layering plus hairlines.
- **Don't** introduce a second typeface or display face; Segoe UI plus Consolas for machine output is the whole ramp.
- **Don't** add new animations; `page-settle` (180ms, `cubic-bezier(0.16, 1, 0.3, 1)`, reduced-motion guarded) is the only motion, and new pages opt in with the `.page-enter` class, not new keyframes.
- **Don't** re-enable dark-mode auto-switching; the branded light theme is a product decision, not a gap.
