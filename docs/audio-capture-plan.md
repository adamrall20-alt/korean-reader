# Audio capture plan

Implementation now uses video element capture. See [project status](../PROJECT_STATUS.md#phase-8-audio-capture--17-november-2026) for verification and known limitations.

## Goal

When **Mine Word** is selected, save the audio for the complete subtitle currently shown. Match the Kimchi Reader flow: seek to the subtitle start, play through its end, keep the capture with that sentence, and attach it to the existing **Audio** field during Anki sync. Missing audio must never block saving or syncing a word.

## Current starting point

The content script reads the video’s current playback time and captures a frame when the word is selected. That timestamp is an observation time, not a subtitle start/end range. The saved context has an image but no audio, and Anki sync currently leaves Audio blank. The background service worker owns storage and AnkiConnect requests, so captured media should be passed to it for storage and syncing.

## Proposed implementation

1. **Get reliable caption bounds.** Extend caption snapshots with start and end seconds. Prefer timed text-track cues when YouTube exposes them. For rendered captions without cue timing, track when each distinct sentence first appears and when it is replaced; use a small safety margin and enforce a maximum clip duration. Keep the current observed timestamp as a fallback anchor. Roll-up captions may need to be grouped until they settle, as they are today.
2. **Capture on Mine Word.** On the explicit button click, pause, seek to the caption start, record the video element’s audio while playing through the end, then pause and restore the expected playback position/state. Use a short WebM/Opus clip if the browser supports it. Detect no audio track, playback failure, unsupported recording, and protected media; in each case finish mining with an audio-unavailable status. Do not record continuously or access the microphone.
3. **Keep media with its sentence.** Add optional audio data and a stable media identifier to each vocabulary context, alongside its image. Persist through the existing background message/storage path. Avoid retaining duplicate clips when the same sentence context is mined again.
4. **Attach audio through AnkiConnect.** For new notes, upload captured bytes with `storeMediaFile`, then put Anki’s `[sound:filename]` reference in the mapped Audio field. For existing notes, fill Audio only when the mapped field is empty, preserving any audio already there. Keep the current image behavior and duplicate detection.
5. **Verify end to end.** Test caption bounds for timed, normal rendered, and rolling captions; confirm the clip starts/ends with the subtitle, is audible, and survives storage/reload; verify new and existing Anki notes, empty Audio mapping, unsupported/protected playback, and failed Anki requests. Then manually check a live YouTube video and the user’s Kimchi Sentence Mining note type.

## Capture approach to validate first

Try `HTMLMediaElement.captureStream()` on YouTube’s video element first because it targets the media element and avoids capturing unrelated tab audio. Browser support and protected-media restrictions make this a feasibility check, not an assumption. If it cannot reliably expose YouTube audio, test `chrome.tabCapture` as a fallback; it captures tab audio but has extension permission and audio-routing implications. Choose after a small Chrome spike before committing to the capture architecture.

## Main risks

- Rendered-caption polling does not reveal the true cue start/end, so timing may be approximate; validate against timed cues and real videos.
- YouTube may use protected or inaccessible media, or expose no audio track to the chosen capture API.
- Recording bytes in memory can grow quickly. Cap clip length and size, and store only the captured subtitle clips needed by vocabulary contexts.
- Anki’s media APIs accept audio attachments and can target fields; confirm the chosen container/codec plays in the user’s Anki desktop and supported review clients.

## Research

- [AnkiConnect `addNote` and media documentation](https://github.com/FooSoft/anki-connect/blob/master/README.md#addnote) — audio attachments can be supplied with a filename and data/path/URL, with target fields; `storeMediaFile` is also available.
- [Chrome tab capture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) — captures the current tab’s audio/video stream and informs the fallback option.
- [MDN `HTMLMediaElement.captureStream()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/captureStream) — streams rendered media from an element, but is not available uniformly across browsers.
- [W3C Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/) — explains that inaccessible media may yield silence, an important limitation for the element-capture spike.
