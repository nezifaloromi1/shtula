# Player options panel

The native Flutter player uses two presentations of the same options area:

- Portrait: a draggable sheet collapsed to approximately 68 px, with Up Next and Transcript tabs. Selecting a tab expands the sheet. At full expansion, a compact current-player strip remains above it.
- Landscape/wide: a fixed side-by-side options pane with Up Next and Transcript tabs.

The React Native implementation is `src/features/player/PlayerOptionsSheet.tsx`.

## Queue behavior

The inline Up Next tab displays the current item separately from the upcoming queue. Users can play an upcoming item, move it up or down, remove it, or clear the queue after confirmation. Queue ordering is persisted by `AudioProvider`.

The reorder affordance is implemented with explicit move controls rather than Flutter's long-press drag-reorder gesture. This keeps the interaction accessible and avoids a second gesture system competing with the sheet and nested transcript scroller; it is a known interaction difference.

## Transcript behavior

`TranscriptPanel` is shared by the inline player panel and the full-screen Transcript route. `useTranscriptData` reads the SQLite cache first, then refreshes from the track's configured transcript URL. `transcriptParser.ts` supports JSON cue arrays, WebVTT and SubRip timed text; non-timed text is shown as plain text.

The panel supports text search, a follow-playback toggle, automatic scrolling to the active cue when enabled, and seeking when a cue is selected. Search disables follow-playback until search is cleared or the user turns it back on.

## Verification

Run:

```bash
npm run test:screen-parity
npm run test:transcript-parser
npm run check:syntax
```

These tests check source contracts and parser behavior. They do not replace visual validation on Android and iOS devices, including drag gesture feel, nested-scroll behavior, split-panel sizing, accessibility focus, and Arabic RTL screenshots.
