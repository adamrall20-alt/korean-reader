# Subtitle audio capture

## Current state

Audio capture is implemented. When the user mines a subtitle, the extension can replay that subtitle, record its audio, and restore the video to the point where it was paused. The recording is stored locally with the sentence and uploaded to Anki only after the user chooses **Sync to Anki**. An existing Anki Audio field is preserved; a blank field can receive the captured clip.

Capture uses the YouTube video element's media stream and stores WebM/Opus audio. It does not record continuously or use the microphone. Missing or unusable audio does not prevent saving the vocabulary entry.

## Verification and limitations

Isolated Chrome verification with local video and segmented MediaSource fixtures passed. Both timed cue bounds and rendered-caption boundaries produced playable audio, the paused position was restored, and advertisements were skipped.

Live YouTube capture, caption-boundary accuracy on live material, and playback in the user's Kimchi Sentence Mining Anki template remain to be verified. Rendered and rolling captions use estimated boundaries. Protected media or ranges that cannot be replayed may not produce audio. See [PROJECT_STATUS.md](../PROJECT_STATUS.md#phase-8-audio-capture--17-november-2026) for the dated record.
