#!/bin/sh
# One-time setup on a new machine: tools, the speech model and the two reference videos.
set -eu
cd "$(dirname "$0")/.."
brew install ffmpeg yt-dlp whisper-cpp
npm install
mkdir -p models downloads
[ -f models/ggml-small-q5_1.bin ] || curl -L -o models/ggml-small-q5_1.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
yt-dlp -f "bv*[height<=1920][ext=mp4]+ba[ext=m4a]/b[ext=mp4]" --merge-output-format mp4 \
  -o "downloads/%(id)s.%(ext)s" https://www.youtube.com/shorts/9Sy_b0pf2BM https://www.youtube.com/shorts/x99VnumDGLw
