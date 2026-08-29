from pathlib import Path

from scripts.publication_audit import audit


def test_audit_rejects_audio(tmp_path: Path) -> None:
    (tmp_path / "official.mp3").write_bytes(b"audio")
    assert any("forbidden" in error for error in audit(tmp_path))


def test_audit_rejects_private_json(tmp_path: Path) -> None:
    (tmp_path / "lesson.private.json").write_text("{}", encoding="utf-8")
    assert any("private" in error for error in audit(tmp_path))


def test_audit_rejects_non_allowlisted_script(tmp_path: Path) -> None:
    (tmp_path / "lesson.json").write_text(
        '{"role":"male","text":"This is an original example."}', encoding="utf-8"
    )
    assert any("non-allowlisted" in error for error in audit(tmp_path))


def test_audit_allows_non_script_json(tmp_path: Path) -> None:
    (tmp_path / "settings.json").write_text('{"rate":"-2%"}', encoding="utf-8")
    assert audit(tmp_path) == []


def test_audit_allows_only_named_public_samples(tmp_path: Path) -> None:
    sample = tmp_path / "web" / "data" / "demo.json"
    sample.parent.mkdir(parents=True)
    sample.write_text('{"questions":[]}', encoding="utf-8")
    assert audit(tmp_path) == []
