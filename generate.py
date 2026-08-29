#!/usr/bin/env python3
"""Create one exam-practice MP3 from a local JSON script.

This project is unofficial. Input text is supplied by the user and is never
bundled with the public repository.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import os
import re
import shutil
import sys
import tempfile
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

APP_NAME = "Listening Practice TTS Generator"
APP_VERSION = "1.0.0"
ROLE_ALIASES = {
    "male": "male",
    "man": "male",
    "female": "female",
    "woman": "female",
    "narrator": "narrator",
    "number": "narrator",
    "question": "narrator",
    "pause": "narrator",
}
KINDS = {"speech", "number", "question", "pause"}

VOICE_PRESETS: dict[str, dict[str, str]] = {
    "us": {
        "male": "en-US-GuyNeural",
        "female": "en-US-JennyNeural",
        "narrator": "en-US-AriaNeural",
    },
    "uk": {
        "male": "en-GB-RyanNeural",
        "female": "en-GB-SoniaNeural",
        "narrator": "en-GB-LibbyNeural",
    },
    "mixed": {
        "male": "en-US-GuyNeural",
        "female": "en-GB-SoniaNeural",
        "narrator": "en-US-AriaNeural",
    },
}

DEFAULT_CONFIG: dict[str, Any] = {
    "voice_preset": "us",
    "voices": dict(VOICE_PRESETS["us"]),
    "prosody": {
        "male": {"rate": "-2%", "volume": "+0%", "pitch": "+0Hz"},
        "female": {"rate": "-2%", "volume": "+0%", "pitch": "+0Hz"},
        "narrator": {"rate": "-6%", "volume": "+0%", "pitch": "+0Hz"},
        "question_rate": "-7%",
    },
    "pauses_ms": {
        "initial": 1000,
        "after_number": 650,
        "between_dialogue": 320,
        "after_narrator": 450,
        "after_question": 7000,
    },
    "audio": {
        "sample_rate": 24000,
        "channels": 1,
        "bitrate": "128k",
        "normalize": True,
        "target_dbfs": -18.0,
        "max_gain_db": 6.0,
    },
    "runtime": {
        "retries": 3,
        "retry_delay_seconds": 1.5,
        "request_timeout_seconds": 120,
        "cache": True,
        "cache_dir": ".cache/tts",
    },
}


class UserInputError(ValueError):
    """A clear, actionable error caused by input or configuration."""


@dataclass(frozen=True)
class ScriptItem:
    role: str
    text: str
    kind: str = "speech"
    pause_after_ms: int | None = None
    rate: str | None = None
    volume: str | None = None
    pitch: str | None = None
    voice: str | None = None


@dataclass(frozen=True)
class LoadedScript:
    title: str
    items: tuple[ScriptItem, ...]


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in base.items():
        result[key] = deep_merge(value, {}) if isinstance(value, dict) else value
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise UserInputError(f"File not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise UserInputError(
            f"Invalid JSON in {path} at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc


def load_config(path: Path | None) -> dict[str, Any]:
    override: dict[str, Any] = {}
    if path is not None:
        raw = read_json(path)
        if not isinstance(raw, dict):
            raise UserInputError("The config file must contain one JSON object.")
        override = raw
    config = deep_merge(DEFAULT_CONFIG, override)
    preset = str(config.get("voice_preset", "us")).lower()
    if preset not in VOICE_PRESETS:
        raise UserInputError(f"Unknown voice_preset {preset!r}; choose us, uk, or mixed.")
    # Presets provide defaults; explicit voice values always win.
    explicit_voices = override.get("voices", {})
    config["voices"] = {**VOICE_PRESETS[preset], **explicit_voices}
    validate_config(config)
    return config


def validate_config(config: dict[str, Any]) -> None:
    voices = config.get("voices")
    if not isinstance(voices, dict) or any(not voices.get(role) for role in ("male", "female", "narrator")):
        raise UserInputError("Config must define non-empty male, female, and narrator voices.")
    if len({voices["male"], voices["female"], voices["narrator"]}) != 3:
        raise UserInputError("Male, female, and narrator must use three different voices.")
    prosody = config.get("prosody", {})
    for role in ("male", "female", "narrator"):
        settings = prosody.get(role)
        if not isinstance(settings, dict):
            raise UserInputError(f"prosody.{role} must be an object.")
        normalize_rate(settings.get("rate"), f"prosody.{role}.rate")
        normalize_volume(settings.get("volume"), f"prosody.{role}.volume")
        normalize_pitch(settings.get("pitch"), f"prosody.{role}.pitch")
    normalize_rate(prosody.get("question_rate"), "prosody.question_rate")
    for key, value in config.get("pauses_ms", {}).items():
        if not isinstance(value, int) or value < 0 or value > 120_000:
            raise UserInputError(f"pauses_ms.{key} must be an integer from 0 to 120000.")
    audio = config.get("audio", {})
    if audio.get("sample_rate") not in {16000, 22050, 24000, 32000, 44100, 48000}:
        raise UserInputError("audio.sample_rate is not supported.")
    if audio.get("channels") not in {1, 2}:
        raise UserInputError("audio.channels must be 1 or 2.")
    if not isinstance(audio.get("normalize"), bool):
        raise UserInputError("audio.normalize must be true or false.")
    for key in ("target_dbfs", "max_gain_db"):
        value = audio.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise UserInputError(f"audio.{key} must be a finite number.")
    if not re.fullmatch(r"\d+k", str(audio.get("bitrate", ""))):
        raise UserInputError("audio.bitrate must look like '128k'.")
    runtime = config.get("runtime", {})
    retries = runtime.get("retries")
    if isinstance(retries, bool) or not isinstance(retries, int) or not 1 <= retries <= 10:
        raise UserInputError("runtime.retries must be an integer from 1 to 10.")
    for key, minimum, maximum in (
        ("retry_delay_seconds", 0, 60),
        ("request_timeout_seconds", 5, 600),
    ):
        value = runtime.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not minimum <= value <= maximum:
            raise UserInputError(f"runtime.{key} must be between {minimum} and {maximum}.")
    if not isinstance(runtime.get("cache"), bool) or not isinstance(runtime.get("cache_dir"), str):
        raise UserInputError("runtime.cache must be boolean and runtime.cache_dir must be text.")


def seconds_to_ms(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise UserInputError(f"{field} must be a number of seconds.")
    if value < 0 or value > 120:
        raise UserInputError(f"{field} must be between 0 and 120 seconds.")
    return round(value * 1000)


def normalize_rate(value: Any, field: str = "rate") -> str:
    if isinstance(value, bool):
        raise UserInputError(f"{field} must be a percentage such as -3 or '-3%'.")
    if isinstance(value, (int, float)):
        number = int(value)
    elif isinstance(value, str) and re.fullmatch(r"[+-]?\d+%?", value.strip()):
        number = int(value.strip().removesuffix("%"))
    else:
        raise UserInputError(f"{field} must be a percentage such as -3 or '-3%'.")
    if not -50 <= number <= 100:
        raise UserInputError(f"{field} must be between -50% and +100%.")
    return f"{number:+d}%"


def normalize_volume(value: Any, field: str = "volume") -> str:
    if isinstance(value, bool):
        raise UserInputError(f"{field} must be a percentage such as '+0%' or '-10%'.")
    if isinstance(value, (int, float)) and float(value).is_integer():
        number = int(value)
    elif isinstance(value, str) and re.fullmatch(r"[+-]?\d+%?", value.strip()):
        number = int(value.strip().removesuffix("%"))
    else:
        raise UserInputError(f"{field} must be a percentage such as '+0%' or '-10%'.")
    if not -100 <= number <= 100:
        raise UserInputError(f"{field} must be between -100% and +100%.")
    return f"{number:+d}%"


def normalize_pitch(value: Any, field: str = "pitch") -> str:
    if isinstance(value, bool):
        raise UserInputError(f"{field} must be a value such as '+0Hz' or '-10Hz'.")
    if isinstance(value, (int, float)) and float(value).is_integer():
        number = int(value)
    elif isinstance(value, str) and re.fullmatch(r"[+-]?\d+(?:Hz)?", value.strip(), re.IGNORECASE):
        number = int(re.sub(r"Hz$", "", value.strip(), flags=re.IGNORECASE))
    else:
        raise UserInputError(f"{field} must be a value such as '+0Hz' or '-10Hz'.")
    if not -100 <= number <= 100:
        raise UserInputError(f"{field} must be between -100Hz and +100Hz.")
    return f"{number:+d}Hz"


def normalize_item(raw: Any, index: int) -> ScriptItem:
    if not isinstance(raw, dict):
        raise UserInputError(f"Item {index} must be a JSON object.")
    original_role = str(raw.get("role", "")).strip().lower()
    if original_role not in ROLE_ALIASES:
        raise UserInputError(
            f"Item {index}: role must be male, female, narrator, man, woman, number, question, or pause."
        )
    role = ROLE_ALIASES[original_role]
    text_value = raw.get("text", "")
    if not isinstance(text_value, str):
        raise UserInputError(f"Item {index}: text must be a string.")
    text = re.sub(r"\s+", " ", text_value).strip()

    explicit_kind = raw.get("kind")
    if explicit_kind is not None:
        kind = str(explicit_kind).lower()
    elif original_role in {"number", "question", "pause"}:
        kind = original_role
    elif role == "narrator" and re.match(r"^number\s+\d+\b", text, re.IGNORECASE):
        kind = "number"
    elif role == "narrator" and re.match(r"^question\b", text, re.IGNORECASE):
        kind = "question"
    else:
        kind = "speech"
    if kind not in KINDS:
        raise UserInputError(f"Item {index}: kind must be speech, number, question, or pause.")
    if kind != "pause" and not text:
        raise UserInputError(f"Item {index}: text cannot be empty.")
    if len(text) > 10_000:
        raise UserInputError(f"Item {index}: text is longer than 10,000 characters.")

    pause_after_ms: int | None = None
    if "pause_after" in raw:
        pause_after_ms = seconds_to_ms(raw["pause_after"], f"Item {index} pause_after")
    elif "pause_after_ms" in raw:
        value = raw["pause_after_ms"]
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 120_000:
            raise UserInputError(f"Item {index}: pause_after_ms must be 0 to 120000.")
        pause_after_ms = value
    elif kind == "pause" and "duration" in raw:
        pause_after_ms = seconds_to_ms(raw["duration"], f"Item {index} duration")

    rate = normalize_rate(raw["rate"], f"Item {index} rate") if "rate" in raw else None
    volume = normalize_volume(raw["volume"], f"Item {index} volume") if "volume" in raw else None
    pitch = normalize_pitch(raw["pitch"], f"Item {index} pitch") if "pitch" in raw else None
    voice = str(raw["voice"]).strip() if raw.get("voice") else None
    return ScriptItem(role, text, kind, pause_after_ms, rate, volume, pitch, voice)


def expand_questions(root: dict[str, Any]) -> list[dict[str, Any]]:
    expanded: list[dict[str, Any]] = []
    intro = root.get("intro", [])
    if intro:
        if not isinstance(intro, list):
            raise UserInputError("intro must be an array of items.")
        expanded.extend(intro)
    questions = root.get("questions")
    if not isinstance(questions, list) or not questions:
        raise UserInputError("questions must be a non-empty array.")
    for position, question in enumerate(questions, 1):
        if not isinstance(question, dict):
            raise UserInputError(f"Question {position} must be an object.")
        number = question.get("number", position)
        number_text = question.get("number_text", f"Number {number}.")
        expanded.append({"role": "narrator", "kind": "number", "text": number_text})
        dialogue = question.get("dialogue")
        if not isinstance(dialogue, list) or not dialogue:
            raise UserInputError(f"Question {position}: dialogue must be a non-empty array.")
        expanded.extend(dialogue)
        q_value = question.get("question")
        if isinstance(q_value, str):
            q_item: dict[str, Any] = {
                "role": "narrator",
                "kind": "question",
                "text": (
                    q_value
                    if re.match(r"^question\b", q_value, re.IGNORECASE)
                    else f"Question. {q_value}"
                ),
            }
        elif isinstance(q_value, dict):
            q_item = {**q_value, "role": q_value.get("role", "narrator"), "kind": "question"}
        else:
            raise UserInputError(f"Question {position}: question must be text or an object.")
        if "pause_after" not in q_item and "answer_pause" in question:
            q_item["pause_after"] = question["answer_pause"]
        expanded.append(q_item)
    return expanded


def load_script(path: Path) -> LoadedScript:
    if path.suffix.lower() == ".jsonl":
        records: list[Any] = []
        try:
            for line_number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
                if not line.strip():
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    raise UserInputError(f"Invalid JSONL at line {line_number}: {exc.msg}") from exc
        except FileNotFoundError as exc:
            raise UserInputError(f"File not found: {path}") from exc
        raw_items = records
        title = path.stem
    else:
        root = read_json(path)
        if isinstance(root, list):
            raw_items = root
            title = path.stem
        elif isinstance(root, dict):
            title = str(root.get("title", path.stem))
            if "questions" in root:
                raw_items = expand_questions(root)
            else:
                raw_items = root.get("items")
                if not isinstance(raw_items, list):
                    raise UserInputError("JSON object must contain an items or questions array.")
        else:
            raise UserInputError("Script must be a JSON array or an object with items/questions.")
    if not raw_items:
        raise UserInputError("The script contains no items.")
    items = tuple(normalize_item(item, i) for i, item in enumerate(raw_items, 1))
    if not any(item.kind != "pause" for item in items):
        raise UserInputError("The script contains no spoken items.")
    return LoadedScript(title=title, items=items)


def lint_script(script: LoadedScript) -> list[str]:
    warnings: list[str] = []
    for index, item in enumerate(script.items, 1):
        if item.kind == "pause":
            continue
        if re.search(r"\b[A-Z]{4,}\b", item.text):
            warnings.append(f"Item {index}: ALL CAPS may be pronounced with unnatural emphasis.")
        if "___" in item.text or "…" * 3 in item.text:
            warnings.append(f"Item {index}: repeated marks may create an unnatural pause.")
        if item.kind == "question" and item.role != "narrator":
            warnings.append(f"Item {index}: questions are usually clearest with the narrator role.")
    return warnings


def default_pause_ms(item: ScriptItem, config: dict[str, Any]) -> int:
    if item.pause_after_ms is not None:
        return item.pause_after_ms
    pauses = config["pauses_ms"]
    if item.kind == "number":
        return pauses["after_number"]
    if item.kind == "question":
        return pauses["after_question"]
    if item.role == "narrator":
        return pauses["after_narrator"]
    return pauses["between_dialogue"]


def effective_settings(item: ScriptItem, config: dict[str, Any]) -> dict[str, str]:
    role_settings = config["prosody"][item.role]
    rate = item.rate or role_settings["rate"]
    if item.kind == "question" and item.rate is None:
        rate = config["prosody"]["question_rate"]
    return {
        "voice": item.voice or config["voices"][item.role],
        "rate": normalize_rate(rate),
        "volume": normalize_volume(item.volume or role_settings["volume"]),
        "pitch": normalize_pitch(item.pitch or role_settings["pitch"]),
    }


def import_audio_tools() -> tuple[Any, str]:
    try:
        import imageio_ffmpeg
        from pydub import AudioSegment
    except ImportError as exc:
        raise RuntimeError(
            "Audio dependencies are missing. Run: pip install -r requirements.txt"
        ) from exc
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    if not ffmpeg or not Path(ffmpeg).exists():
        raise RuntimeError("The bundled ffmpeg executable could not be located.")
    AudioSegment.converter = ffmpeg
    AudioSegment.ffmpeg = ffmpeg
    return AudioSegment, ffmpeg


class EdgeTTSProvider:
    def __init__(self, config: dict[str, Any], cache_enabled: bool = True) -> None:
        runtime = config["runtime"]
        self.retries = int(runtime["retries"])
        self.retry_delay = float(runtime["retry_delay_seconds"])
        self.timeout = float(runtime["request_timeout_seconds"])
        self.cache_enabled = bool(runtime["cache"] and cache_enabled)
        self.cache_dir = Path(runtime["cache_dir"]).expanduser()

    @staticmethod
    async def list_voices() -> list[dict[str, Any]]:
        try:
            import edge_tts
        except ImportError as exc:
            raise RuntimeError("edge-tts is missing. Run: pip install -r requirements.txt") from exc
        try:
            return await edge_tts.list_voices()
        except Exception as exc:
            raise RuntimeError(
                "Could not load the online voice list. Check your internet connection, "
                "proxy/firewall, and system CA certificates, then try again. "
                f"Details: {exc}"
            ) from exc

    def cache_path(self, text: str, settings: dict[str, str]) -> Path:
        payload = json.dumps(
            {"provider": "edge-tts", "text": text, **settings},
            sort_keys=True,
            ensure_ascii=False,
        ).encode("utf-8")
        return self.cache_dir / f"{hashlib.sha256(payload).hexdigest()}.mp3"

    async def synthesize(self, text: str, settings: dict[str, str], destination: Path) -> None:
        cached = self.cache_path(text, settings)
        if self.cache_enabled and cached.is_file() and cached.stat().st_size > 1000:
            shutil.copyfile(cached, destination)
            return
        try:
            import edge_tts
        except ImportError as exc:
            raise RuntimeError("edge-tts is missing. Run: pip install -r requirements.txt") from exc
        last_error: Exception | None = None
        for attempt in range(1, self.retries + 1):
            temp_destination = destination.with_suffix(f".attempt{attempt}.mp3")
            try:
                communicate = edge_tts.Communicate(
                    text=text,
                    voice=settings["voice"],
                    rate=settings["rate"],
                    volume=settings["volume"],
                    pitch=settings["pitch"],
                )
                await asyncio.wait_for(communicate.save(str(temp_destination)), timeout=self.timeout)
                if not temp_destination.is_file() or temp_destination.stat().st_size < 1000:
                    raise RuntimeError("TTS returned an empty or incomplete audio file.")
                temp_destination.replace(destination)
                if self.cache_enabled:
                    cached.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(destination, cached)
                return
            except Exception as exc:  # noqa: BLE001 - edge-tts/network exceptions vary by version
                last_error = exc
                temp_destination.unlink(missing_ok=True)
                if attempt < self.retries:
                    await asyncio.sleep(self.retry_delay * attempt)
        raise RuntimeError(
            f"TTS failed after {self.retries} attempts for voice {settings['voice']}: {last_error}"
        ) from last_error


def adjust_loudness(segment: Any, audio_config: dict[str, Any]) -> Any:
    if not audio_config.get("normalize", True) or not math.isfinite(segment.dBFS):
        return segment
    desired = float(audio_config["target_dbfs"])
    limit = abs(float(audio_config["max_gain_db"]))
    gain = max(-limit, min(limit, desired - segment.dBFS))
    adjusted = segment.apply_gain(gain)
    if adjusted.max_dBFS > -1.0:
        adjusted = adjusted.apply_gain(-1.0 - adjusted.max_dBFS)
    return adjusted


async def verify_voices(config: dict[str, Any], item_voices: Iterable[str] = ()) -> None:
    voices = await EdgeTTSProvider.list_voices()
    available = {voice.get("ShortName") for voice in voices}
    requested = set(config["voices"].values()) | set(item_voices)
    missing = sorted(name for name in requested if name not in available)
    if missing:
        raise UserInputError(
            "Configured voice(s) are not currently available: " + ", ".join(missing)
            + ". Run the voices command and update your config."
        )


def print_plan(script: LoadedScript, config: dict[str, Any]) -> None:
    print(f"Title: {script.title}")
    print(f"Spoken items: {sum(i.kind != 'pause' for i in script.items)}")
    for index, item in enumerate(script.items, 1):
        settings = effective_settings(item, config) if item.kind != "pause" else None
        detail = f"voice={settings['voice']}, rate={settings['rate']}" if settings else "silence"
        print(
            f"{index:>3}. {item.role:<8} {item.kind:<8} chars={len(item.text):<5} "
            f"pause={default_pause_ms(item, config)}ms  {detail}"
        )


async def generate_audio(
    script: LoadedScript,
    config: dict[str, Any],
    output: Path,
    *,
    force: bool,
    cache_enabled: bool,
    voice_check: bool,
    keep_fragments: Path | None,
) -> None:
    if output.exists() and not force:
        raise UserInputError(f"Output already exists: {output}. Use --force to replace it.")
    if output.suffix.lower() != ".mp3":
        raise UserInputError("Output filename must end in .mp3.")
    output.parent.mkdir(parents=True, exist_ok=True)
    if voice_check:
        print("Checking configured voices...")
        await verify_voices(
            config,
            (
                effective_settings(item, config)["voice"]
                for item in script.items
                if item.kind != "pause"
            ),
        )
    AudioSegment, _ = import_audio_tools()
    provider = EdgeTTSProvider(config, cache_enabled=cache_enabled)
    audio_config = config["audio"]
    combined = AudioSegment.silent(duration=config["pauses_ms"]["initial"])

    with tempfile.TemporaryDirectory(prefix="listening-tts-") as temp_name:
        temp_dir = Path(temp_name)
        spoken_total = sum(item.kind != "pause" for item in script.items)
        spoken_index = 0
        for index, item in enumerate(script.items, 1):
            pause_ms = default_pause_ms(item, config)
            if item.kind == "pause":
                combined += AudioSegment.silent(duration=pause_ms)
                continue
            spoken_index += 1
            settings = effective_settings(item, config)
            fragment = temp_dir / f"{index:03d}-{item.role}-{item.kind}.mp3"
            print(
                f"Synthesizing {spoken_index}/{spoken_total}: "
                f"{item.role}/{item.kind} ({len(item.text)} characters)"
            )
            await provider.synthesize(item.text, settings, fragment)
            try:
                segment = AudioSegment.from_file(fragment, format="mp3")
            except Exception as exc:
                raise RuntimeError(f"Could not decode synthesized fragment {index}: {exc}") from exc
            segment = segment.set_frame_rate(audio_config["sample_rate"]).set_channels(audio_config["channels"])
            segment = adjust_loudness(segment, audio_config).fade_in(8).fade_out(12)
            combined += segment
            if pause_ms:
                combined += AudioSegment.silent(duration=pause_ms)
            if keep_fragments is not None:
                keep_fragments.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(fragment, keep_fragments / fragment.name)

        temp_output = output.with_name(f".{output.name}.tmp.mp3")
        temp_output.unlink(missing_ok=True)
        try:
            combined.export(
                temp_output,
                format="mp3",
                bitrate=str(audio_config["bitrate"]),
                parameters=["-ar", str(audio_config["sample_rate"]), "-ac", str(audio_config["channels"])],
                tags={"title": script.title, "comment": "Unofficial synthetic practice audio"},
            )
            if not temp_output.is_file() or temp_output.stat().st_size < 1000:
                raise RuntimeError("MP3 export produced an empty file.")
            os.replace(temp_output, output)
        finally:
            temp_output.unlink(missing_ok=True)
    print(f"Created: {output.resolve()}")
    print(f"Duration: {len(combined) / 1000:.1f} seconds")


async def command_voices(args: argparse.Namespace) -> None:
    voices = await EdgeTTSProvider.list_voices()
    locale_filter = (args.locale or "").lower()
    gender_filter = (args.gender or "").lower()
    rows = []
    for voice in voices:
        locale = str(voice.get("Locale", ""))
        gender = str(voice.get("Gender", ""))
        if locale_filter and locale.lower() != locale_filter:
            continue
        if gender_filter and gender.lower() != gender_filter:
            continue
        rows.append((locale, gender, str(voice.get("ShortName", "")), str(voice.get("FriendlyName", ""))))
    for row in sorted(rows):
        print("\t".join(row))
    print(f"{len(rows)} voice(s)", file=sys.stderr)


def apply_cli_overrides(config: dict[str, Any], args: argparse.Namespace) -> None:
    if getattr(args, "preset", None):
        config["voice_preset"] = args.preset
        config["voices"] = dict(VOICE_PRESETS[args.preset])
    for role in ("male", "female", "narrator"):
        value = getattr(args, f"{role}_voice", None)
        if value:
            config["voices"][role] = value
    if getattr(args, "rate", None) is not None:
        rate = normalize_rate(args.rate, "--rate")
        config["prosody"]["male"]["rate"] = rate
        config["prosody"]["female"]["rate"] = rate
    if getattr(args, "question_rate", None) is not None:
        config["prosody"]["question_rate"] = normalize_rate(args.question_rate, "--question-rate")
    if getattr(args, "answer_pause", None) is not None:
        config["pauses_ms"]["after_question"] = seconds_to_ms(args.answer_pause, "--answer-pause")
    if getattr(args, "dialogue_pause_ms", None) is not None:
        config["pauses_ms"]["between_dialogue"] = args.dialogue_pause_ms
    validate_config(config)


def common_parser(parent: argparse.ArgumentParser) -> None:
    parent.add_argument("--config", type=Path, help="JSON config file (default: built-in settings)")
    parent.add_argument("--preset", choices=sorted(VOICE_PRESETS), help="Voice preset")
    parent.add_argument("--male-voice", help="edge-tts ShortName for male")
    parent.add_argument("--female-voice", help="edge-tts ShortName for female")
    parent.add_argument("--narrator-voice", help="edge-tts ShortName for narrator")
    parent.add_argument("--rate", help="Dialogue rate percentage, e.g. -2 or +5")
    parent.add_argument("--question-rate", help="Question rate percentage")
    parent.add_argument("--answer-pause", type=float, help="Default silence after each question, seconds")
    parent.add_argument("--dialogue-pause-ms", type=int, choices=range(3001), metavar="0..3000")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="generate.py",
        description="Generate one unofficial synthetic listening-practice MP3 from local JSON.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {APP_VERSION}")
    sub = parser.add_subparsers(dest="command", required=True)

    generate = sub.add_parser("generate", help="Generate a completed MP3")
    generate.add_argument("--input", required=True, type=Path, help="Local .json or .jsonl script")
    generate.add_argument("--output", required=True, type=Path, help="Destination .mp3")
    generate.add_argument("--force", action="store_true", help="Replace an existing output")
    generate.add_argument("--dry-run", action="store_true", help="Validate and print the plan without TTS")
    generate.add_argument("--no-cache", action="store_true", help="Do not read or write the local TTS cache")
    generate.add_argument("--no-voice-check", action="store_true", help="Skip the initial online voice-list check")
    generate.add_argument("--keep-fragments", type=Path, help="Optional directory for generated fragments")
    common_parser(generate)

    validate = sub.add_parser("validate", help="Validate a script without network access")
    validate.add_argument("--input", required=True, type=Path)
    common_parser(validate)

    voices = sub.add_parser("voices", help="List voices currently returned by edge-tts")
    voices.add_argument("--locale", help="Exact locale, e.g. en-US or en-GB")
    voices.add_argument("--gender", choices=["Male", "Female", "male", "female"])
    return parser


async def async_main(args: argparse.Namespace) -> int:
    if args.command == "voices":
        await command_voices(args)
        return 0
    config = load_config(args.config)
    apply_cli_overrides(config, args)
    script = load_script(args.input)
    warnings = lint_script(script)
    for warning in warnings:
        print(f"WARNING: {warning}", file=sys.stderr)
    if args.command == "validate" or args.dry_run:
        print_plan(script, config)
        print("Validation passed.")
        return 0
    await generate_audio(
        script,
        config,
        args.output,
        force=args.force,
        cache_enabled=not args.no_cache,
        voice_check=not args.no_voice_check,
        keep_fragments=args.keep_fragments,
    )
    return 0


def main(argv: Iterable[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    try:
        return asyncio.run(async_main(args))
    except KeyboardInterrupt:
        print("Cancelled.", file=sys.stderr)
        return 130
    except (UserInputError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
