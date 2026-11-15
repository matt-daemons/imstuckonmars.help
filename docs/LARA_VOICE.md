# LARA map voice interface

The AI-icon launcher opens text chat without opening it automatically during voice
capture. Wake-word listening stays in `LaraProvider`, independent of the chat's
visibility. Space push-to-talk remains available with chat closed. Wake-word
activation defaults off. The toggle stores `lara.wakeWord` in local storage as
`true` or `false`, and restores that choice on the next visit. Microphone access
still requires browser permission. Turning it off persists; the hidden local-data
reset removes the preference and returns it to off. Other open tabs follow storage
changes. If storage is blocked, the toggle works only for the current page.

The launcher shows `Say "Hey Lara"` when waiting for the wake word, `Listening…`
before recognized words, the latest three provisional words during capture, and
`Thinking` while requesting a response. Vosk supplies local provisional text for
both wake-word and push-to-talk capture. If local recognition cannot load, recording
and final server transcription remain available without a live preview.

Replies appear in a dismissible bottom-centered panel. With voice enabled, the
client requests `/api/copilot/:id/speak` with `timestamps: true`. The Worker uses
ElevenLabs' `with-timestamps` endpoint, bounds the JSON response to 10 MB, and
validates character timing arrays. Existing callers without that flag retain
streamed MP3 responses. Words appear according to the audio element's `currentTime`,
at 1.4× playback speed. Speech-control tags and delivery cues are hidden in captions,
chat and screen-reader announcements, but retained in speech requests. Missing timestamps show the full text rather
than guessed timing. Muted or failed speech leaves a readable response.

Stop speech, mute, dismissal and page cleanup stop playback. The reply announces
its complete text once when chat is closed, rather than announcing each word.
Keyboard users can focus and scroll the reply text. No animated entrance is used.

`/design-system#lara-voice` and `/design-system#lara-vitals` contain explicit UI
fixtures, without microphone access or service calls. They are not NASA data.
Viewing distances are assumed to be 600 mm on desktop and 400 mm on handheld.
Live microphone recognition and real speech-service timing require a configured
browser and service credentials to verify end to end.
