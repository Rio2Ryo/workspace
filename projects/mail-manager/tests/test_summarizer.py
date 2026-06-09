"""Tests for src/summarizer.py — Gemini API is mocked, no network required."""

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.summarizer import summarize_message, summarize_thread, MODEL_NAME, MAX_BODY_CHARS


def _fake_response(text: str):
    r = MagicMock()
    r.text = text
    return r


def _make_client_mock(response_text: str = "要約テキスト"):
    client = MagicMock()
    client.models.generate_content.return_value = _fake_response(response_text)
    return client


class TestSummarizeMessage(unittest.TestCase):
    def test_empty_body_returns_placeholder(self):
        result = summarize_message("   ")
        self.assertEqual(result, "(本文なし)")

    def test_calls_api_with_expected_model(self):
        client = _make_client_mock("要約結果")
        with patch("src.summarizer._get_client", return_value=client):
            result = summarize_message("Hello world", subject="件名", sender="a@b.com")
        client.models.generate_content.assert_called_once()
        call_kwargs = client.models.generate_content.call_args
        self.assertEqual(call_kwargs.kwargs.get("model") or call_kwargs[1].get("model"), MODEL_NAME)
        self.assertEqual(result, "要約結果")

    def test_body_truncated_to_max(self):
        long_body = "x" * (MAX_BODY_CHARS + 1000)
        captured_prompt = []

        def fake_generate(model, contents):
            captured_prompt.append(contents)
            return _fake_response("ok")

        client = MagicMock()
        client.models.generate_content.side_effect = fake_generate
        with patch("src.summarizer._get_client", return_value=client):
            summarize_message(long_body)
        self.assertIn("x" * MAX_BODY_CHARS, captured_prompt[0])
        self.assertNotIn("x" * (MAX_BODY_CHARS + 1), captured_prompt[0])

    def test_api_exception_returns_error_string(self):
        client = MagicMock()
        client.models.generate_content.side_effect = RuntimeError("quota exceeded")
        with patch("src.summarizer._get_client", return_value=client):
            result = summarize_message("some body")
        self.assertIn("要約エラー", result)
        self.assertIn("quota exceeded", result)

    def test_returns_stripped_text(self):
        client = _make_client_mock("  要約テキスト  \n")
        with patch("src.summarizer._get_client", return_value=client):
            result = summarize_message("body text")
        self.assertEqual(result, "要約テキスト")


class TestSummarizeThread(unittest.TestCase):
    def _messages(self, n=2):
        return [
            {
                "message_id": f"m{i}",
                "date": f"2026-01-0{i+1}T10:00:00+00:00",
                "is_sent": i % 2,
                "sender": "a@example.com",
                "body_text": f"メッセージ本文 {i}",
            }
            for i in range(n)
        ]

    def test_empty_messages_returns_placeholder(self):
        result = summarize_thread([])
        self.assertEqual(result, "(メッセージなし)")

    def test_calls_api_with_subject_in_prompt(self):
        captured = []

        def fake_generate(model, contents):
            captured.append(contents)
            return _fake_response("スレッド要約")

        client = MagicMock()
        client.models.generate_content.side_effect = fake_generate
        with patch("src.summarizer._get_client", return_value=client):
            result = summarize_thread(self._messages(), subject="テスト件名")

        self.assertEqual(result, "スレッド要約")
        self.assertIn("テスト件名", captured[0])

    def test_api_exception_returns_error_string(self):
        client = MagicMock()
        client.models.generate_content.side_effect = ValueError("bad request")
        with patch("src.summarizer._get_client", return_value=client):
            result = summarize_thread(self._messages())
        self.assertIn("要約エラー", result)

    def test_transcript_includes_sent_received_label(self):
        captured = []

        def fake_generate(model, contents):
            captured.append(contents)
            return _fake_response("ok")

        client = MagicMock()
        client.models.generate_content.side_effect = fake_generate
        msgs = [
            {"message_id": "m1", "date": "2026-01-01", "is_sent": 1,
             "sender": "me@example.com", "body_text": "送信済みメール"},
            {"message_id": "m2", "date": "2026-01-02", "is_sent": 0,
             "sender": "them@example.com", "body_text": "受信メール"},
        ]
        with patch("src.summarizer._get_client", return_value=client):
            summarize_thread(msgs)

        self.assertIn("送信", captured[0])
        self.assertIn("受信", captured[0])


class TestGetClient(unittest.TestCase):
    def test_missing_api_key_raises(self):
        import os
        original = os.environ.pop("GEMINI_API_KEY", None)
        try:
            with self.assertRaises(EnvironmentError):
                from src.summarizer import _get_client
                _get_client()
        finally:
            if original is not None:
                os.environ["GEMINI_API_KEY"] = original

    def test_returns_client_when_key_set(self):
        import os
        os.environ["GEMINI_API_KEY"] = "test-key-abc"
        try:
            from src.summarizer import _get_client
            client = _get_client()
            self.assertIsNotNone(client)
        finally:
            del os.environ["GEMINI_API_KEY"]


if __name__ == "__main__":
    unittest.main()
