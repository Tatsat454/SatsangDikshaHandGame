# Handover

## Status

Playable. Pinch, mouse or touch picks up a Sanskrit word tile and drops it into a blank. Gujarati and English are support. Sets of three shlokas, progress stored by `shlok_group` inside each milestone. Single shlokas blank three words. Grouped shlokas (`group_type` multi-shlok) blank four.

Verified on 5 November 2026 without a physical webcam. See below.

## What works, and how it was verified

- `npm test`: 15 tests. Shloka parsing, blanking, grab/drop scoring, and pinch recognition from synthetic hands for both hands.
- `npm run build` passes.
- `npm run capture`: the bot placed 3 words, reached results, and pinched to start the next set. No console errors. Screenshots in `captures/` (gitignored).
- A mouse drag in headless Chrome, `?autostart=1&seed=11`, pressed `paramām` and released it on its blank. `placed` went from 0 to 1 and the chip turned green.
- `npm run fps` at DPR 2 on this headless machine: 19.5 fps, p95 66.7 ms, `glInvalid` 0. Capture at DPR 1 reported 60 fps. There is no real GPU here, so the 60 fps bar is not met on this machine.

## Not verified

- A real webcam, by a person. Only synthetic hands and the mouse drove it.
- Listening by ear. `npm run loud` was not run.
- Real phones, Safari and Firefox.
- 60 fps at DPR 2 on a machine with a GPU.

## Known problems and next steps

1. The bot's first drop of each shloka misses on purpose, then it corrects. If capture starts failing, the miss offset is in `src/bot.ts`.
2. Blank width hints at the length of the missing word. That is deliberate for children.
3. Figma's imported puzzle frame overlapped the first verse line. The running game uses normal inline flow. The file is https://www.figma.com/design/TQs8z8a4cgrU4fHBakw3Vd
4. Retune `PINCH_ON` after ten minutes with a real camera.

## Tuning knobs

| Constant | File | What it does |
| --- | --- | --- |
| `PINCH_ON`, `PINCH_OFF` | `src/pinch.ts` | pinch press / release thresholds |
| `HIT_PAD` | `src/rules.ts` | extra reach around a tile or blank |
| `GROUPS_PER_SET`, `SOLVE_HOLD_S` | `src/rules.ts` | shlokas per sitting, pause after a solve |
| blank counts (3 and 4) | `src/rules.ts` `BLANKS` | words removed from a single shloka or a group |
| `REGION` | `src/input.ts` | the part of the camera image that maps onto the screen |
| master gain (0.55) | `src/audio.ts` | overall loudness |

## Design decisions

- Started from `templates/game` and kept the kit, input, pinch latch, bot pattern and tools.
- The verse is HTML over a three.js sky. Sanskrit with diacritics stays sharper as text than as sprites.
- Nunito for the interface, Noto Sans for the verse and tiles, so IAST letters (ṛ, ṣ, ṇ, ṭ) have a real glyph. Not the Cool Kids font.
- Blue, light, and built for children. Sample copy is short and specific.
- Wrong words return to the tray. A blank that was missed once can still be filled, but it does not add to the first-try score.
- A finished milestone can be played again. `nextSet` replays from the start when nothing in that milestone is left.
- Progress is `localStorage` keys `satsang-diksha-hands.done` and `satsang-diksha-hands.best`.

## Gotchas

- The camera only starts from the "Use my camera" click. `startCamera()` cannot run from the bot.
- Engine landmarks are already mirrored. The preview canvas flips the video and does not flip the landmarks again.
- Do not add a second smoothing filter on the cursor.
- A 0×0 window is ignored in `Scene.resize` and `Scene.render`.
- No shadow-casting lights, so there is no `GL_INVALID_OPERATION` sampler bug.
- `@mediapipe/tasks-vision` is pinned to 1.1.0. The wasm copy and the JS must stay on that version.
- The CSV has quoted newlines for multi-shloka verses. Parse it; do not split on raw line breaks.
- The first column header may include a BOM. The parser strips it.

## Progress log

- 5 November 2026: game built from the starter. Shloka table copied from the book numbering CSV (not retyped). Figma file created before the screens were coded. Tests, build, bot capture and a mouse drop were run. Headless DPR 2 frame time missed 60 fps.
