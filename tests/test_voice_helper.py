"""Local voice boundary tests; no microphone, model or cloud dependency."""
import http.client
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
import wave
from http.server import HTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import voice_helper as helper


def audio(rate=16000, frames=160):
    data = io.BytesIO()
    with wave.open(data, 'wb') as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(b'\0\0' * frames)
    return data.getvalue()


class VoiceHelper(unittest.TestCase):
    def test_audio_validation(self):
        helper.validate_audio(audio())
        for raw in [b'invalid', audio(rate=44100), audio(frames=0), audio(frames=960001), audio()[:-1]]:
            with self.subTest(size=len(raw)), self.assertRaises((ValueError, wave.Error, EOFError)):
                helper.validate_audio(raw)

    def test_transcription_arguments_and_private_cleanup(self):
        source = None
        def run(args, **kwargs):
            nonlocal source
            source = Path(args[args.index('-f') + 1])
            self.assertEqual(source.read_bytes(), audio())
            self.assertEqual(args[args.index('-l') + 1], 'pl')
            self.assertEqual(kwargs['timeout'], 180)
            self.assertEqual(kwargs['stdin'], subprocess.DEVNULL)
            Path(args[args.index('-of') + 1] + '.txt').write_text('local transcript', encoding='utf-8')
        with patch.object(helper.subprocess, 'run', run):
            self.assertEqual(helper.transcribe(audio(), 'pl', '/opt/whisper-cli', '/models/model.bin'), 'local transcript')
        self.assertFalse(source.parent.exists())
        with self.assertRaises(ValueError):
            helper.transcribe(audio(), '--help', '/opt/whisper-cli', '/models/model.bin')

    def test_helper_rejects_host_origin_token_type_and_oversized_audio(self):
        token = 'a' * 64
        server = HTTPServer(('127.0.0.1', 0), helper.handler(token, Path('/engine'), Path('/model')))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = f'http://127.0.0.1:{server.server_port}'
        def request(headers, body=None, method='POST'):
            connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
            try:
                connection.request(method, '/transcribe' if method == 'POST' else '/', body, headers)
                response = connection.getresponse()
                return response.status, response.read(), response.getheader('Access-Control-Allow-Origin')
            finally:
                connection.close()
        good = {'Host':f'127.0.0.1:{server.server_port}', 'Origin':origin,
                'Authorization':'Bearer ' + token, 'Content-Type':'audio/wav', 'X-Voice-Language':'en'}
        try:
            self.assertEqual(request({}, method='GET')[0], 200)
            self.assertEqual(request({'Host':'attacker.invalid'}, method='GET')[0], 403)
            with patch.object(helper, 'transcribe', return_value='review me') as transcribe:
                status, body, cors = request(good, audio())
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body), {'text':'review me'})
                self.assertIsNone(cors)
                transcribe.assert_called_once()
                transcribe.reset_mock()
                for changes, expected in [({'Host':'evil.invalid'},403), ({'Origin':'null'},403),
                        ({'Origin':'https://evil.invalid'},403), ({'Authorization':'Bearer wrong'},403),
                        ({'Content-Type':'application/octet-stream'},400),
                        ({'Content-Length':str(helper.MAX_AUDIO+1)},400)]:
                    with self.subTest(changes=changes):
                        self.assertEqual(request({**good, **changes}, audio())[0], expected)
                transcribe.assert_not_called()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_failed_transcription_cleans_owned_audio(self):
        source = None
        def fail(args, **kwargs):
            nonlocal source
            source = Path(args[args.index('-f') + 1])
            raise subprocess.TimeoutExpired(args, 180)
        with patch.object(helper.subprocess, 'run', fail), self.assertRaises(subprocess.TimeoutExpired):
            helper.transcribe(audio(), 'en', '/engine', '/model')
        self.assertFalse(source.parent.exists())
