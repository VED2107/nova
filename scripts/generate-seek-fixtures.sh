#!/usr/bin/env bash
# Generates the seek-accuracy corpus (synthetic, legally distributable).
# Each file is chosen to stress one property of seeking: frame rate, GOP length,
# variable frame rate, codec, or duration. Every file also gets a sidecar
# `<name>.pts` listing the presentation timestamp of every video frame (from
# ffprobe), which the seek probe uses as ground truth.
# Requires: ffmpeg/ffprobe with libx264, libx265, libsvtav1, prores_ks.
set -euo pipefail

OUT="${1:-$(dirname "$0")/../tests/fixtures/seek}"
mkdir -p "$OUT"
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }
src() { echo "testsrc2=size=$1:rate=$2"; } # $1=size $2=rate (may be a fraction)
aud() { echo "sine=frequency=880:sample_rate=48000"; }

make() { # $1=name, remaining = ffmpeg output args
  local name="$1"; shift
  if [[ -f "$OUT/$name" && -f "$OUT/$name.pts" ]]; then echo "skip $name"; return; fi
  echo "$name"
  ff "$@" "$OUT/$name"
  ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -of csv=p=0 "$OUT/$name" \
    | tr -d '\r' | cut -d, -f1 | grep -v '^$' > "$OUT/$name.pts"
}

# Frame-rate sweep, H.264, 2 s GOP (a typical file).
for r in 24000/1001 24 25 30000/1001 30 50 60000/1001 60 120; do
  tag="${r//\//_}"
  make "h264_r${tag}_gop2s.mp4" -f lavfi -i "$(src 640x360 "$r")" -f lavfi -i "$(aud)" -t 60 \
    -c:v libx264 -preset ultrafast -g "$(awk "BEGIN{printf \"%d\", 2*$r+0.5}")" -pix_fmt yuv420p \
    -c:a aac -b:a 64k -movflags +faststart
done

# Long GOP (10 s, like phone/streaming encodes) vs all-intra.
make h264_30_gop10s.mp4 -f lavfi -i "$(src 640x360 30)" -f lavfi -i "$(aud)" -t 120 \
  -c:v libx264 -preset ultrafast -g 300 -keyint_min 300 -sc_threshold 0 -pix_fmt yuv420p -c:a aac -b:a 64k
make h264_30_intra.mp4 -f lavfi -i "$(src 640x360 30)" -t 30 -c:v libx264 -preset ultrafast -g 1 -pix_fmt yuv420p

# B-frame heavy HEVC and AV1, long GOP.
make hevc_24_gop10s.mkv -f lavfi -i "$(src 640x360 24)" -f lavfi -i "$(aud)" -t 60 \
  -c:v libx265 -preset ultrafast -x265-params "log-level=error:keyint=240:min-keyint=240:bframes=4" -pix_fmt yuv420p -c:a aac -b:a 64k
make av1_30_gop10s.mkv -f lavfi -i "$(src 640x360 30)" -t 40 \
  -c:v libsvtav1 -preset 12 -g 300 -pix_fmt yuv420p

# Professional intra codec.
make prores_25.mov -f lavfi -i "$(src 640x360 25)" -t 20 -c:v prores_ks -profile:v 2

# Variable frame rate: segments at 24, 60 and 10 fps concatenated in one stream.
make vfr_24_60_10.mkv -f lavfi -i "$(src 640x360 24)" -f lavfi -i "$(src 640x360 60)" -f lavfi -i "$(src 640x360 10)" \
  -filter_complex "[0:v]trim=0:10,setpts=PTS-STARTPTS[a];[1:v]trim=0:10,setpts=PTS-STARTPTS[b];[2:v]trim=0:10,setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1[v]" \
  -map "[v]" -fps_mode vfr -c:v libx264 -preset ultrafast -g 48 -pix_fmt yuv420p

# Two hours, tiny picture: long-file mapping and far seeks.
make h264_24_2h.mp4 -f lavfi -i "$(src 160x90 24)" -t 7200 \
  -c:v libx264 -preset ultrafast -g 240 -pix_fmt yuv420p -movflags +faststart

echo "done: $OUT"
