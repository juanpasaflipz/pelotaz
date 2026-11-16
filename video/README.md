# Pelotaz video

Short vertical videos rendered from a storyboard file with [Remotion](https://www.remotion.dev/). This folder is its own package: the Next.js app does not import it, and it is excluded from the app's typecheck and lint. See `claude/video-ads-plan.md` in the project for where this is going.

## How it works

1. **Storyboard** (`storyboards/*.json`): everything specific to one video. Brand name, colour and pronunciation list, the voice, the beats (caption, camera move between named spots, what the character does, notifications) and the end card. This is what the model will write per brand.
2. **Voice** (`tools/build_voice.py`): applies the pronunciation list, synthesises each line, trims silence, normalises loudness, and writes the measured lengths to `src/generated/<id>.durations.json`.
3. **Timeline** (`src/kit/timeline.ts`): beat lengths come from the measured voice lines, with the storyboard's `frames` as a minimum. Pure TypeScript, tested from the app's suite (`test/video-timeline.test.ts`).
4. **Kit** (`src/kit/`): plays any storyboard. Scenes with named camera anchors, captions that highlight the brand name, notifications, the brand wipe and the end card.

## Commands

```bash
cd video
npm install
npm run still -- --frame=235    # one frame, to look before rendering
npm run render                  # out/reel.mp4, 1080x1920, about a minute
npm run studio                  # preview in the browser
npm run voice -- storyboards/trabaja-en-pelotaz-pijama.json   # regenerate voice lines after changing copy
```

`npm run voice` needs `pip install edge-tts` and `ffmpeg`. The committed `.wav` files mean a render works without it.

## Storyboards

| Id | What | Where it can run |
| --- | --- | --- |
| `trabaja-en-pelotaz` | The original: he is naked behind the laptop | Organic only, and Facebook may still flag it |
| `trabaja-en-pelotaz-pijama` | Same reel in striped pyjamas, plus a last beat "Sí, así se llama. 😏" | Facebook and paid ads |

Each storyboard is its own composition; the composition id is the storyboard id. `npm run still` and `npm run render` use the pyjamas one. For another, call `npx remotion render src/index.ts <id> out/<id>.mp4`. A new storyboard is registered in `src/Root.tsx`.

The outfit is one line in the storyboard: `"character": { "outfit": "pyjamas" }`.

## Limits today

- One scene (`messy-living-room`), one character and one end card, taken from the first test ad. A different ad needs new parts drawn.
- The laptop logo and the end-card ball are Pelotaz's own; another brand needs its logo passed in.
- The voice uses Microsoft's `es-MX-JorgeNeural` through the unofficial `edge-tts` endpoint. Production should call the same voice through Azure Speech.
- TTS stresses "Pelotaz" on the last syllable. The pronunciation list spells it "Pelotas" for the voice only; captions keep "Pelotaz".
- Meta's ad standards do not allow nudity in paid ads, even covered. Use the pyjamas storyboard for Facebook.
- Rendering runs locally. Remotion needs Chrome, so production rendering goes to Remotion Lambda, not a Vercel function.
- Remotion is free for teams of up to three people; a company licence applies from four.
