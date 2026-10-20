# NCUDA visual direction & design system

## Direction in one paragraph

**"The road from heritage to future."** The interface takes its cues from the land around Ngwo: highland green, the red laterite earth of Momo Division, harvest gold and undyed cloth. Layouts are editorial and asymmetric, with large serif display type, generous whitespace, real photographs and honest captions. One original motif carries the story. *Njikwa* is reported to mean "road to the farm", so a winding road line runs through the site, connecting **Heritage → Community → Development → Future**. A restrained lozenge band, an original design that does not copy any specific textile, appears only on edges and dividers. The portal uses the same palette, type and motifs, but trades editorial space for calm, dense and trustworthy information design.

## Tokens (`app/globals.css`, Tailwind v4 `@theme`)

| Token | Value | Use |
| --- | --- | --- |
| `forest-900/950` | `#142a20` / `#0e1d16` | Dark sections, portal sidebar, primary text on light |
| `earth-600` | `#a9482a` | Primary CTA, accents, focus ring (6.4:1 on paper) |
| `gold-500/300` | `#c49a3a` / `#e2c88a` | Accents on dark only; never body text on light |
| `paper / cream / bone` | `#faf6ef` / `#f3ebdd` / `#ebe1cf` | Backgrounds and surfaces |
| `ink-900/700/500` | `#1c1a17` / `#3a3631` / `#625b51` | Text (all ≥ 4.5:1 on paper) |
| `line / line-strong` | `#ddd3c2` / `#c9bca6` | Rules, borders |

**Type.** *Fraunces* (variable; SOFT/WONK axes) for display and the italic "voice". *Instrument Sans* for body and UI. The display scale is fluid (`--text-display-xl … -sm`). Eyebrows are 12 px, 0.18em tracking, uppercase.

**Spacing.** `--spacing-gutter` (20–56 px fluid) and `--spacing-section` (80–160 px fluid). Content max width is 88 rem; the portal content max is 76 rem.

**Radii.** These are deliberately small (2–14 px). Lozenge glyphs replace rounded "pills" wherever a marker is needed.

**Motion.** Fade-and-rise on scroll (`data-reveal`, progressive enhancement), a slow image zoom on hover, and a road line that draws itself. Everything is disabled under `prefers-reduced-motion`.

## Components

- Brand: `Logo`, `LogoMark` (placeholder mark), `WeaveBand`, `WeaveColumn`, `ContourField`, `Lozenge`
- UI: `Button` / `ButtonLink` (primary, secondary, ghost, light, outline-light, danger), `Figure` (photo with caption and credit), `CopyText` / `PlaceholderBadge` (visibly marks unconfirmed copy)
- Forms: `Field`, `Input`, `Textarea`, `Select` (labels, hints, inline errors, `aria-invalid`/`describedby`)
- Portal: `PageHeader`, `Panel`, `EmptyState`, `AccessDenied`, `Stat`, `DateBlock`, status pills, table styles

## Image treatment

- Always use real photographs with an honest caption and credit. A photo is never labelled "Ngwo" unless it was taken in Ngwo.
- Hazy landscape photos get a gentle colour grade and a forest-tinted gradient. Text never sits on an image without a scrim.
- Layered compositions: an offset second image with a paper-coloured ring, and the lozenge band on one edge.

## Where the motif is (and isn't) used

It appears on the hero image edge, the section transitions into the Future CTA and footer, the contact panel edge and the portal login panel edge. It is never used as a full-section background, and never on body copy.
