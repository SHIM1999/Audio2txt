import argparse
import json
import os
import sys
import warnings
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
warnings.filterwarnings("ignore", message=".*cache-system uses symlinks.*")
warnings.filterwarnings("ignore", message=".*Xet Storage is enabled.*")
warnings.filterwarnings("ignore", message=".*unauthenticated requests.*")

import ctranslate2
from faster_whisper import WhisperModel


def format_timestamp(seconds: float) -> str:
    total_seconds = int(round(seconds))
    hours, rem = divmod(total_seconds, 3600)
    minutes, secs = divmod(rem, 60)
    return f"{hours:02}:{minutes:02}:{secs:02}"


def resolve_runtime(device: str) -> tuple[str, str]:
    if device == "auto":
        device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"

    compute_type = "float16" if device == "cuda" else "int8"
    return device, compute_type


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe audio with timestamps.")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="base", choices=["tiny", "base", "small", "medium"])
    parser.add_argument("--language", default="ko", choices=["ko", "auto"])
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument("--job-id", default="")
    args = parser.parse_args()

    audio_path = Path(args.audio)
    if not audio_path.exists():
        print(f"Audio file not found: {audio_path}", file=sys.stderr)
        return 2

    device, compute_type = resolve_runtime(args.device)
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    language = None if args.language == "auto" else args.language
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=True,
        beam_size=5,
        word_timestamps=False,
    )

    rendered_segments = []
    lines = []
    plain_lines = []

    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        start = format_timestamp(segment.start)
        end = format_timestamp(segment.end)
        rendered_segments.append(
            {
                "id": len(rendered_segments) + 1,
                "start": start,
                "end": end,
                "startSeconds": segment.start,
                "endSeconds": segment.end,
                "text": text,
            }
        )
        lines.append(f"[{start} - {end}] {text}")
        plain_lines.append(text)

    print(
        json.dumps(
            {
                "jobId": args.job_id,
                "model": args.model,
                "device": device,
                "computeType": compute_type,
                "language": info.language,
                "languageProbability": info.language_probability,
                "duration": info.duration,
                "segments": rendered_segments,
                "timestampedText": "\n".join(lines),
                "plainText": "\n".join(plain_lines),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
