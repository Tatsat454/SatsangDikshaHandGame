# Satsang Diksha

A webcam hand game. Sanskrit shlokas from Satsang Diksha appear with a few words missing. Pinch a word tile, carry it, and drop it into the blank. Gujarati and English sit underneath as support. Progress is kept by milestone and shloka group.

It is the [open-source-hands](https://github.com/abouchedidxcode/open-source-hands) starter (`templates/game`) with the rules, scene and sound replaced.

```bash
npm install
npm run dev          # http://localhost:5173. The camera needs localhost or https
```

## How to play

| Action | Hand | Mouse / touch | Keyboard |
| --- | --- | --- | --- |
| Aim | move your open hand; the ring follows your palm | move the pointer | |
| Pick up a word | pinch thumb and index on a tile | hold the button on a tile | |
| Drop it | open your fingers over a blank | release over a blank | |
| Choose a milestone | pinch the card | click the card | Space starts the next one |
| Next set | pinch on the results screen | click Next shlokas | Space |
| Mute | | | M |

A set is three shlokas. A single shloka hides three words. A shloka group hides four. The first time a blank is filled correctly it counts. A wrong word goes back to the tray.

## Commands

```bash
npm run dev          # dev server (copies MediaPipe's wasm and downloads the hand model on first run)
npm test             # vitest: rules and pinch recognition, no browser needed
npm run build        # type-check, then build to dist/
npm run capture      # with the dev server running: screenshots in captures/ of a shloka played by the bot
npm run capture -- mobile
npm run fps          # frame rate at DPR 2 while the bot plays
npm run loud         # loudness while the bot plays
```

Playwright needs a browser the first time: `npx playwright install chromium`.

## URL flags and test hooks

| Flag | Effect |
| --- | --- |
| `?bot=1` | a synthetic player plays, through the real gesture engine |
| `?autostart=1` | skip the title and open milestone 1 with the mouse |
| `?mute=1` | no sound |
| `?seed=N` | the same blanks every time |
| `?groups=N` | shlokas per set (default 3) |
| `?milestone=N` | where autostart and the bot begin |
| `?speed=K` | run the game K times faster |

`window.__game` returns `{ phase, score, placed, wrong, blanks, milestone, shlok, group, held, tiles, mode, hand, fps, dpr, best }`.

## Files

| File | Owns |
| --- | --- |
| `src/main.ts` | Wiring, screens, camera preview, flags, `window.__game` |
| `src/rules.ts` | Blanks, tiles, grab and drop, scoring. No DOM |
| `src/shlokas.ts` | The book table parsed from `data/satsang-diksha-book-numbering.csv` |
| `src/input.ts` | Camera, mouse, touch and bot become one hand |
| `src/pinch.ts` | Pinch strength → press / release |
| `src/bot.ts` | The synthetic player used by `?bot=1` |
| `src/scene.ts` | three.js sky and the spark when a word lands |
| `src/audio.ts` | Procedural pad, chime and bonk |
| `src/style.css` | Title, milestone path, verse card, tiles, results |
| `src/hand-gesture-kit/` | The kit, copied unmodified. Configure it; don't edit it |
| `data/satsang-diksha-book-numbering.csv` | Shloka text. Do not retype it |
| `scripts/assets.mjs` | Copies MediaPipe's wasm and downloads the model |
| `tools/` | `capture.mjs`, `fps.mjs`, `loud.mjs` |

## How the gesture detection works, and how to tune it

The kit tracks the hand with MediaPipe and smooths it. It gives a pinch strength from 0 to 1 every frame (`hand.pinch`). `src/pinch.ts` turns that into a press at `PINCH_ON` (0.6) and a release at `PINCH_OFF` (0.35).

A press on a tile picks it up. A release on a blank drops it. The hit box is the tile or blank plus `HIT_PAD` (0.055 screen heights) in `src/rules.ts`. `REGION` in `src/input.ts` is the part of the camera image that maps onto the screen.

Screens were designed first in Figma: https://www.figma.com/design/TQs8z8a4cgrU4fHBakw3Vd
