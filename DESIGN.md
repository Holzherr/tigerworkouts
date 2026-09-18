---
name: TigerWorkouts
description: A gym-floor app — slate ink on near-white, one coral for the action that matters, rows you can hit with a chalky thumb. Mark is an outlined tiger head; the app icon puts it on two coral bands.
colors:
  brand: '#ff4d2e'
  brand-hover: '#e63c1e'
  brand-soft: '#fff0ec'
  brand-line: '#ffb4a3'
  brand-ink: '#c42a12'
  ink-pure: '#000000'
  rest: '#1e3a8a'
  ink: '#0f172a'
  body: '#475569'
  muted: '#64748b'
  faint: '#94a3b8'
  hint: '#cbd5e1'
  line: '#e2e8f0'
  line-soft: '#f1f5f9'
  surface: '#ffffff'
  canvas: '#f8fafc'
  well: '#eef2f7'
  danger: '#b91c1c'
  danger-soft: '#fee2e2'
  warn: '#b45309'
  warn-soft: '#fffbeb'
typography:
  title:
    fontFamily: 'system-ui, -apple-system, sans-serif'
    fontSize: '19px'
    fontWeight: 800
    lineHeight: 1.15
  row-name:
    fontSize: '15px'
    fontWeight: 600
  body:
    fontSize: '14px'
  label:
    fontSize: '12px'
    color: '{colors.muted}'
  value:
    fontSize: '17px'
    fontWeight: 700
    fontVariantNumeric: 'tabular-nums'
rounded:
  card: '16px'
  control: '12px'
  tile: '14px'
  sheet: '24px'
  pill: '999px'
spacing:
  touch-target: '44px'
  row-pad: '8px 8px 8px 12px'
  screen-pad: '12px'
  phone-max: '430px'
components:
  button-brand:
    backgroundColor: '{colors.brand}'
    textColor: '#ffffff'
    height: '{spacing.touch-target}'
    rounded: '{rounded.tile}'
  stepper:
    height: '{spacing.touch-target}'
    rounded: '{rounded.control}'
    border: '{colors.line}'
    buttonBackground: '{colors.canvas}'
  step-row:
    background: '{colors.surface}'
    expandedBackground: '{colors.brand-soft}'
    thumb: '48px'
    thumbExpanded: '72px'
  block-bracket:
    border: '1.5px solid {colors.brand-line}'
    background: '{colors.brand-soft}'
    rounded: '18px'
  value-pill:
    background: '{colors.line-soft}'
    fontSize: '13px'
    fontWeight: 700
brand:
  mark: 'src/shared/brand/tiger-mark.tsx — one even-odd path, currentColor, min 24px'
  app-icon: 'src/shared/brand/app-icon.tsx — white, two coral bands at 25%, black mark at 66%, radius 22.5%'
  logo: 'src/shared/brand/logo.tsx — mark + TigerWorkouts, Workouts in coral'
  favicon: 'public/favicon.svg, PNGs in public/icons/'
rules:
  - One coral fill per screen: the primary action. Everything else is ink, grey, or coral text.
  - The mark is always one colour (black, ink, white or coral). Stripes only ever sit behind it, never on it.
  - Units live in labels ("Weight (kg per arm)"), never inside a number control.
  - Every tap target is at least 44px tall. Rows are the tap target, not icons inside them.
  - No drag handles. Rows move by press-and-drag; blocks by their header.
  - Rests are steps. Blocks are brackets around steps with a repeat count; they form by dropping one step onto another.
  - Demo clips autoplay muted and loop; without a clip, show an icon, never a placeholder box.
---
