# DESIGN — Deadlock in-game build-browser look (authoritative for T10/T11/T12)

Direction is pinned by the user's reference screenshots of the real in-game build
editor: the app should read as an in-game artifact, not a web dashboard. One
aesthetic commitment, executed with precision: **parchment panels floating on a
near-black abyss, navy for the ability timeline** — no white surfaces anywhere.
The signature element is the Ability Point Order timeline (T11); everything else
stays quiet and disciplined around it.

## Color tokens (CSS custom properties, define once on :root)

| Token | Hex | Use |
|---|---|---|
| `--bg-abyss` | `#0c1712` | app background (near-black green) |
| `--header-teal` | `#6ec9c4` | build title bar background; dark ink text on it |
| `--panel-parchment` | `#b5a586` | phase section panels |
| `--panel-parchment-deep` | `#a49172` | inner card-row strips on parchment |
| `--panel-navy` | `#1d3050` | Ability Point Order panel |
| `--row-navy` | `#152238` | ability timeline row bars |
| `--slot-weapon` | `#d18b21` | weapon item card tile |
| `--slot-vitality` | `#7ab82f` | vitality item card tile |
| `--slot-spirit` | `#8c5fc7` | spirit item card tile |
| `--badge-khaki` | `#9a9179` | AP-cost badges, item name label strips |
| `--diamond-violet` | `#a05be8` | ability unlock diamond marker |
| `--ink` | `#171310` | text on parchment/teal/khaki |
| `--text-light` | `#f2ead8` | text on abyss/navy |

Contrast floor 4.5:1 for all text (these pairings pass; don't put light text on
khaki or ink text on navy).

## Typography

Vendored via npm `@fontsource` packages (bundled at build time — runtime stays
fully offline per the snapshot-only rule; log the devDeps in PROGRESS.md):
- **Display** — `@fontsource/baloo-2`, 700/800: section titles ("Early Game"),
  build title bar, panel headings. Rounded, chunky — closest OFL match to the
  game's display face. Use with restraint: headings only.
- **Body/UI** — `@fontsource/nunito-sans`, 400/600/700: everything else, incl.
  card name labels (600) and badge numerals (700, `font-variant-numeric: tabular-nums`).
- Fallback stacks: `"Baloo 2", "Trebuchet MS", sans-serif` / `"Nunito Sans", system-ui, sans-serif`.

## Layout concept

The whole build view is one in-game "sheet" on the abyss:
1. Teal title bar: hero name + build name in display face, agreement chip riding it.
2. Parchment phase panels ("Early Game", "Mid to Late Game"), each a titled panel
   containing a wrapped grid of item cards on a deeper-parchment strip.
3. Navy "Ability Point Order" panel last — the signature (spec in T11).
Item card anatomy: square slot-colored tile (item image centered; broken image →
tile + name only), khaki name-label strip below, folded corner ribbon top-right
with roman-numeral tier (I–IV), "ACTIVE" chip for actives.

## Motion & quality floor

- One orchestrated moment only: the detail sheet's slide-up (and its backdrop
  fade). Cards get a subtle press/hover state (transform scale ≤1.03). Nothing else.
- Respect `prefers-reduced-motion: reduce` (kill transform/opacity transitions).
- Keyboard focus visible: 2px `--header-teal` outline offset from the element.
- 390×844 first: sections stack, cards wrap ~4/row, tap targets ≥40px, the page
  itself never scrolls horizontally (wide content scrolls inside its own panel).
- Copy: sentence case, plain verbs, game vocabulary ("Early Game", not "Phase 1").

## Desktop (T17)

- Breakpoint 1024px. Below it: the 390-first layout, unchanged. At/above it: the
  sheet goes fluid to a 1440px max-width with 32–48px side margins — it should
  read as the in-game build editor filling a monitor, not a phone column pinned
  to the center.
- Phase panels sit side by side when both fit (equal flex columns); card grids
  grow per-row count naturally from the same wrap rules. Ability Point Order
  spans the full content width and only scrolls internally if it genuinely
  cannot fit.
- Same tokens, same type scale (headings may step up one size), no new colors.
