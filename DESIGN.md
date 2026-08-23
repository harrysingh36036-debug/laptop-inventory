# DESIGN.md — AG Design Consultant & Associates

Recorded from the built world (replacement visual identity, Persuade mode).

## World
**Drafting Board** — the firm presented as a precision MEP drafting practice. Deep blueprint-navy
ground, electric-blue primary line, drafting-grid texture and dimension ticks (legitimate: engineers
read drawings daily), discipline monograms HV / EL / PF / BM. Committed dark world chosen from the
use scene: clients review drawings in offices; the blueprint is the subject's own artifact.

## Tokens
- Ground `--navy-900:#070C17`, panel `--navy-800:#0C1626`, alt `--navy-850:#0A1120`
- Ink `--ink:#F4F7FC`, muted `--ink-2:#AEBED6`, faint `--ink-3:#7E90AD`
- Primary `--blue:#2E6BFF`, soft `--blue-soft:#5B8CFF`
- Signal `--amber:#F6A623` (electrical / fire), `--cyan:#39C2C9` (plumbing)
- Line `--line:rgba(146,173,214,.14)`
- Type: display `Archivo` (600–900), body `Source Sans 3`. Fluid scale fs-300→fs-900.
- Radius 14px cards / 10px controls. Shadow always offset+blur.

## Components
- Sticky header: solid translucent navy + blur scrim, shrinks on scroll, mobile drawer.
- Hero: blueprint grid + glow, three-word discipline statement, dual CTA, credential ticks,
  animated building-systems schematic (HVAC/electrical/plumbing lines draw in).
- Disciplines: 2×2 monogram cards (no icon+heading+text template).
- Approach: A/B/C sequence steps + in-house team card.
- Projects: flagship hospital + 6-sector grid (truthful categories from stated work).
- About: narrative + in-house stats panel.
- Contact: office list + validated form (inline errors, aria-live note) + WhatsApp CTA.

## Rules honored
No eyebrow/kicker, no 01/02 numbering, no gradient text, no decorative glass, no >1px colored
border, no emoji (inline SVG only, consistent 1.4–2 stroke), themed selection/focus/scrollbar/caret.
Motion: one authored moment (schematic draw) + scroll reveals; `prefers-reduced-motion` disables all.

## Assets / provenance
All imagery is authored SVG (logo mark, hero schematic, flagship illustration, icons). No raster
assets shipped. Content truth from agdesignc.com; no invented commercial claims.
