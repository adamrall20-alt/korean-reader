# Subtitle audio capture

## Capture flow

When the user mines a YouTube sentence, the extension can replay the cue and record it from the video element's media stream. It restores playback position afterward. The WebM/Opus clip stays with the local mining context and is attached to the Anki note on sync when its Audio field is available.

Audio capture uses the video's own stream and only runs for a requested cue. A missing or unusable clip does not prevent mining.

## Verification and limitations

Isolated Chrome fixtures previously verified both timed cues and rendered-caption ranges, playable audio, restored paused position and advertisement skipping. Live YouTube timing and playback in Anki clients still need verification. Rendered and rolling captions use estimated ranges, and protected media may be unavailable for recording.
