#!/bin/sh
# Usage: scripts/analyze.sh <video.mp4> <out-dir>. Extracts speech text, cuts, loudness and contact sheets.
set -eu
in="$1"; out="$2"; mkdir -p "$out/frames"
ffmpeg -v error -y -i "$in" -ac 1 -ar 16000 "$out/audio.wav"
ffmpeg -v error -y -i "$in" -vn -c:a copy "$out/audio.m4a"
whisper-cli -m models/ggml-small-q5_1.bin -l ru -f "$out/audio.wav" -osrt -of "$out/speech" -np >/dev/null 2>&1 || true
# Scene changes (cuts) with their times.
ffmpeg -v info -i "$in" -vf "select='gt(scene,0.22)',showinfo" -f null - 2>&1 | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 > "$out/cuts.txt"
# Silence gaps and loudness.
ffmpeg -v info -i "$in" -af silencedetect=noise=-35dB:d=0.3 -f null - 2>&1 | grep -E 'silence_(start|end)' > "$out/silence.txt" || true
# One frame every second, and a contact sheet of them.
ffmpeg -v error -y -i "$in" -vf "fps=1,scale=180:-2" "$out/frames/s%03d.png"
ffmpeg -v error -y -i "$in" -vf "fps=1,scale=180:-2,tile=8x6" -frames:v 1 "$out/sheet.png"
