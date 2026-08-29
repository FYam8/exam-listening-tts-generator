from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

import generate


def write_json(path: Path, value: object) -> Path:
    path.write_text(json.dumps(value), encoding="utf-8")
    return path


def test_questions_expand_to_exam_flow(tmp_path: Path) -> None:
    path = write_json(
        tmp_path / "script.json",
        {
            "title": "Test",
            "questions": [
                {
                    "number": 3,
                    "dialogue": [
                        {"role": "man", "text": "I will go by bus."},
                        {"role": "woman", "text": "The train is faster."},
                    ],
                    "question": "How will the man travel?",
                    "answer_pause": 8,
                }
            ],
        },
    )
    script = generate.load_script(path)
    assert [item.kind for item in script.items] == ["number", "speech", "speech", "question"]
    assert [item.role for item in script.items] == ["narrator", "male", "female", "narrator"]
    assert script.items[0].text == "Number 3."
    assert script.items[-1].text.startswith("Question.")
    assert script.items[-1].pause_after_ms == 8000


def test_flat_items_and_inference(tmp_path: Path) -> None:
    path = write_json(
        tmp_path / "flat.json",
        [
            {"role": "narrator", "text": "Number 1."},
            {"role": "male", "text": "Example."},
            {"role": "narrator", "text": "Question. What happened?", "pause_after": 0},
        ],
    )
    script = generate.load_script(path)
    assert script.items[0].kind == "number"
    assert script.items[2].kind == "question"
    assert script.items[2].pause_after_ms == 0


def test_default_pauses_and_question_rate(tmp_path: Path) -> None:
    script = generate.load_script(Path(__file__).parents[1] / "examples" / "sample_script.json")
    config = generate.load_config(None)
    assert generate.default_pause_ms(script.items[0], config) == 650
    question = next(item for item in script.items if item.kind == "question")
    assert generate.effective_settings(question, config)["rate"] == "-7%"


@pytest.mark.parametrize("value, expected", [(-3, "-3%"), ("+5", "+5%"), ("0%", "+0%")])
def test_rate_normalization(value: object, expected: str) -> None:
    assert generate.normalize_rate(value) == expected


def test_config_rejects_same_voice_for_all_roles(tmp_path: Path) -> None:
    path = write_json(
        tmp_path / "config.json",
        {"voices": {"male": "same", "female": "same", "narrator": "same"}},
    )
    with pytest.raises(generate.UserInputError, match="three different voices"):
        generate.load_config(path)


def test_invalid_role_has_actionable_error(tmp_path: Path) -> None:
    path = write_json(tmp_path / "bad.json", [{"role": "teacher", "text": "Hello."}])
    with pytest.raises(generate.UserInputError, match="role must be"):
        generate.load_script(path)


def test_jsonl_input(tmp_path: Path) -> None:
    path = tmp_path / "script.jsonl"
    path.write_text(
        '{"role":"male","text":"First."}\n'
        '{"role":"female","text":"Second."}\n',
        encoding="utf-8",
    )
    script = generate.load_script(path)
    assert len(script.items) == 2


def test_offline_mock_generates_one_valid_mp3(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    AudioSegment, _ = generate.import_audio_tools()

    async def fake_synthesize(self, text, settings, destination):
        from pydub.generators import Sine

        frequency = 440 if settings["voice"].endswith("GuyNeural") else 660
        handle = Sine(frequency).to_audio_segment(duration=120).apply_gain(-20).export(
            destination, format="mp3"
        )
        handle.close()

    async def fake_verify(config, item_voices=()):
        return None

    monkeypatch.setattr(generate.EdgeTTSProvider, "synthesize", fake_synthesize)
    monkeypatch.setattr(generate, "verify_voices", fake_verify)
    script = generate.load_script(Path(__file__).parents[1] / "examples" / "sample_script.json")
    config = generate.load_config(None)
    output = tmp_path / "complete.mp3"
    asyncio.run(
        generate.generate_audio(
            script,
            config,
            output,
            force=False,
            cache_enabled=False,
            voice_check=True,
            keep_fragments=None,
        )
    )
    assert output.stat().st_size > 1000
    combined = AudioSegment.from_file(output, format="mp3", codec="mp3")
    assert len(combined) >= 15_000
    assert combined.channels == 1
    assert combined.frame_rate == 24_000


def test_output_is_not_overwritten(tmp_path: Path) -> None:
    script = generate.load_script(Path(__file__).parents[1] / "examples" / "sample_script.json")
    config = generate.load_config(None)
    output = tmp_path / "existing.mp3"
    output.write_bytes(b"keep")
    with pytest.raises(generate.UserInputError, match="already exists"):
        asyncio.run(
            generate.generate_audio(
                script,
                config,
                output,
                force=False,
                cache_enabled=False,
                voice_check=False,
                keep_fragments=None,
            )
        )
    assert output.read_bytes() == b"keep"
