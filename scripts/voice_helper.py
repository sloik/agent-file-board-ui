#!/usr/bin/env python3
"""Explicit opt-in loopback microphone/transcription helper for voice drafts.

Requires an installed whisper.cpp whisper-cli and a downloaded model. No models
are downloaded by this script. Tokens/audio never enter the board filesystem.
"""
import argparse
import hmac
import io
import json
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
import wave

MAX_AUDIO = 1_920_044


def validate_audio(raw):
    if len(raw) > MAX_AUDIO:
        raise ValueError('Audio exceeds 60 seconds')
    with wave.open(io.BytesIO(raw), 'rb') as audio:
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 16000, 'NONE'):
            raise ValueError('Expected mono 16-bit 16 kHz PCM WAV')
        frames = audio.getnframes()
        if not 1 <= frames <= 960000 or len(audio.readframes(frames)) != frames * 2:
            raise ValueError('Invalid or empty audio')


def transcribe(raw, language, executable, model):
    validate_audio(raw)
    if not re.fullmatch(r'[a-z]{2,3}', language):
        raise ValueError('Invalid language')
    with tempfile.TemporaryDirectory(prefix='afb-voice-') as directory:
        source = Path(directory) / 'audio.wav'
        output = Path(directory) / 'transcript'
        source.write_bytes(raw)
        subprocess.run([str(executable), '-m', str(model), '-f', str(source),
                        '-l', language, '-otxt', '-of', str(output)],
                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=180, check=True)
        result = output.with_suffix('.txt')
        if result.stat().st_size > 128000:
            raise ValueError('Transcript exceeds budget')
        text = result.read_text(encoding='utf-8').strip()
        if not text or len(text) > 32000:
            raise ValueError('Empty or oversized transcript')
        return text


def handler(token, executable, model):
    page = Path(__file__).with_name('voice-helper.html').read_bytes()

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def log_message(self, *_):
            pass  # No tokens, audio, transcripts or URL fragments in logs.

        def reply(self, status, body=b'', kind='text/plain'):
            self.send_response(status)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.end_headers()
            self.wfile.write(body)

        def host_ok(self):
            return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

        def do_GET(self):
            if not self.host_ok():
                self.reply(403)
            elif self.path == '/':
                self.reply(200, page, 'text/html; charset=utf-8')
            else:
                self.reply(404)

        def do_POST(self):
            origin = f'http://127.0.0.1:{self.server.server_port}'
            if (not self.host_ok() or self.headers.get('Origin') != origin
                    or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + token)):
                self.reply(403)
                return
            if self.path != '/transcribe':
                self.reply(404)
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if (not 44 < length <= MAX_AUDIO or self.headers.get('Content-Type') != 'audio/wav'
                        or self.headers.get('Transfer-Encoding')):
                    raise ValueError('Invalid request')
                raw = self.rfile.read(length)
                if len(raw) != length:
                    raise ValueError('Incomplete audio')
                text = transcribe(raw, self.headers.get('X-Voice-Language', ''), executable, model)
                self.reply(200, json.dumps({'text': text}).encode(), 'application/json')
            except (ValueError, wave.Error, EOFError):
                self.reply(400, b'Invalid audio or language')
            except (OSError, subprocess.SubprocessError):
                self.reply(502, b'Local transcription failed')
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--whisper-cli', type=Path, required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--port', type=int, default=8769)
    args = parser.parse_args()
    if not args.whisper_cli.is_file() or not args.model.is_file():
        parser.error('Executable and model must exist locally')
    token = secrets.token_hex(32)
    server = HTTPServer(('127.0.0.1', args.port), handler(token, args.whisper_cli.resolve(), args.model.resolve()))
    print(f'Local voice helper: http://127.0.0.1:{server.server_port}/', flush=True)
    print(f'Session token: {token}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
