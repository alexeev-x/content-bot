#!/bin/sh
# Usage: scripts/words.sh <audio16k.wav> <out.tsv>. Word-level timestamps (start end word), transcribed in
# 6-second chunks so music under the voice cannot derail the model; times are shifted back by each offset.
set -eu
in="$1"; out="$2"; tmp=$(mktemp -d)
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
: > "$out"
s=0
while awk "BEGIN{exit !($s < $dur)}"; do
  ffmpeg -v error -y -i "$in" -ss "$s" -t 6 "$tmp/c.wav"
  whisper-cli -m models/ggml-small-q5_1.bin -l ru -f "$tmp/c.wav" -mc 0 -ml 1 -sow -np 2>/dev/null \
    | sed -nE 's/^\[([0-9:.]+) --> ([0-9:.]+)\] +(.+)$/\1 \2 \3/p' \
    | awk -v off="$s" '{split($1,a,":");split($2,b,":");st=a[1]*3600+a[2]*60+a[3]+off;en=b[1]*3600+b[2]*60+b[3]+off;$1="";$2="";sub(/^ +/,"");printf "%.2f\t%.2f\t%s\n",st,en,$0}' >> "$out"
  s=$((s+6))
done
rm -rf "$tmp"
