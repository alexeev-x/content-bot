#!/bin/sh
# Usage: scripts/extract-stills.sh <video.mp4> <out-dir>. One full-resolution still from the middle of every
# shot (between detected cuts): title cards, renders, icons and gameplay framing, as reference material.
set -eu
in="$1"; out="$2/stills"; mkdir -p "$out"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
prev=0; n=1
for t in $(cat "$2/cuts.txt") "$dur"; do
  mid=$(echo "$prev $t" | awk '{printf "%.2f", ($1+$2)/2}')
  ffmpeg -v error -y -ss "$mid" -i "$in" -frames:v 1 "$out/$(printf %02d $n)_${mid}s.png"
  prev=$t; n=$((n+1))
done
