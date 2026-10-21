# Voice drafts

Open **Tools → Voice input**. Voice fills a draft; review the text, choose
**Insert into draft**, then use the ordinary **Send** button. If signing is
unlocked, the final reviewed bytes are signed by the normal publication path.
Voice is not an identity check.

## System dictation

Choose the system guidance option, close the dialog, focus the message field and
use your operating system's dictation shortcut. On macOS use the configured
Dictation key; on Windows use **Win+H**. This works wherever system dictation can
enter text and requires no browser microphone permission from the board.
System dictation may use online services: consult your OS settings.
See [Apple Dictation](https://support.apple.com/en-gb/guide/mac-help/mh40584/mac)
and [Microsoft speech privacy](https://support.microsoft.com/en-us/windows/privacy/speech-voice-activation-inking-typing-and-privacy).

## On-device browser speech

Choose **On-device browser speech**, set a language such as `en-US` or `pl-PL`,
then **Start**. The board requires the browser's explicit `processLocally`
capability and an available local language pack. It never falls back to the
browser's default remote recognition service.

If your browser supports language-pack installation, **Install browser language
pack** explicitly downloads the selected pack through the browser. Start again
after installation. Browser/platform/language support is limited; absence of
support leaves typing and native dictation available. Microphone permission is
requested only when starting recognition.

Interim words appear separately. Choose **Stop**, review the final transcript,
edit it if necessary and insert once. Changing the message, board, destination
or signer invalidates the voice session to preserve newer work. **Cancel
capture**, closing the dialog or leaving the page stops capture and discards the
pending transcript. A late callback cannot overwrite the draft.

Capability reference: [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
and [processLocally](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally).

## Optional local whisper.cpp helper

This source checkout includes a small optional loopback helper. Install
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) separately and obtain a
compatible model. The helper never installs executables or downloads models.
Run, substituting your actual local paths:

```sh
python3 scripts/voice_helper.py --whisper-cli /path/to/whisper-cli --model /path/to/ggml-model.bin
```

The terminal prints a loopback URL and a random session token. In Voice input,
choose **Local transcription helper**, paste the URL and token, and select
**Start**. Allow the popup. In the helper window choose **Record**, allow the
microphone, then **Stop and transcribe** (or use Stop in the board dialog).
Capture ends after at most 60 seconds. The helper returns text to the board for
review and insertion; it never publishes a message.

The helper uses a separate `127.0.0.1` window so the board retains its
`connect-src 'none'` policy. The board accepts a result only from that exact
window, origin and per-session channel. The token travels in the popup fragment,
which the helper immediately removes, and stays out of board storage and HTTP
request URLs. Keep it private and stop the helper with **Ctrl+C** when finished.

Audio is mono 16-bit 16 kHz WAV, limited to 60 seconds. It is sent only to the
selected loopback helper, written into a private temporary directory for
`whisper-cli` and removed after completion or failure. The local subprocess has
a 180-second timeout. Cancellation stops microphone capture and ignores results;
an already-running local transcription can continue until it completes or times
out. No audio attachments, credentials or transcripts are written to the shared
board until you explicitly send the reviewed text. Normal private browser draft
storage applies after insertion. An OS/process crash may leave temporary files;
the helper does not claim secure erasure.

The helper requires a browser supporting microphone capture and a 16 kHz
AudioContext. It uses the browser's older ScriptProcessor capture API for a
self-contained local page. On unsupported browsers use native dictation. The
helper is an optional source tool, not part of the single HTML download.

## Verification boundary

Unit tests cover session invalidation, duplicate/late results, capability and
permission failures, exact popup origin/source/channel checks, WAV budgets,
authentication and private-file cleanup. Playwright exercises capture with
synthetic microphone audio through the actual loopback helper and a deterministic
transcription executable; this proves transport, not model accuracy. A separate
native browser filesystem journey inserts reviewed speech text, sends through
the ordinary signer and verifies the committed bytes with the CLI. Automated
tests substitute speech-recognition callbacks; real recognition quality depends
on your installed browser pack or local model.
