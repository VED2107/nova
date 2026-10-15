#!/usr/bin/env bash
# Generates NOVA's synthetic, legally distributable test media corpus.
# All media is synthesized with FFmpeg lavfi sources; no third-party content.
# Requires: ffmpeg with libx264, libx265, libvpx-vp9, libopus (gyan.dev "full" build works).
set -euo pipefail

OUT="${1:-$(dirname "$0")/../tests/fixtures/media}"
mkdir -p "$OUT"

# Font for burned-in timecode. Windows default; override with NOVA_FONT.
FONT="${NOVA_FONT:-C\\:/Windows/Fonts/consola.ttf}"

# Sync pattern: a white bar flashes for the first 100 ms of every second while
# the audio track beeps (sine beep_factor beeps once per second at second start).
# Eyes/ears (or a capture tool) can compare flash vs. beep alignment.
vsrc() { # $1=size $2=rate
  echo "testsrc2=size=$1:rate=$2,drawbox=x=0:y=ih-ih/8:w=iw:h=ih/8:color=white:t=fill:enable='lt(mod(t,1),0.1)',drawtext=fontfile='$FONT':text='NOVA %{pts\\:hms}':fontsize=h/14:fontcolor=white:x=w/30:y=h/20:box=1:boxcolor=black@0.6"
}
asrc() { # $1=freq
  echo "sine=frequency=$1:sample_rate=48000:beep_factor=4"
}
ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

echo "h264_aac_1080p30_30s.mp4"
ff -f lavfi -i "$(vsrc 1920x1080 30)" -f lavfi -i "$(asrc 1000)" -t 30 \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart \
  "$OUT/h264_aac_1080p30_30s.mp4"

echo "hevc_aac_1080p24_10s.mkv"
ff -f lavfi -i "$(vsrc 1920x1080 24)" -f lavfi -i "$(asrc 880)" -t 10 \
  -c:v libx265 -preset fast -x265-params log-level=error -pix_fmt yuv420p -c:a aac -b:a 128k \
  "$OUT/hevc_aac_1080p24_10s.mkv"

echo "vp9_opus_720p30_10s.webm"
ff -f lavfi -i "$(vsrc 1280x720 30)" -f lavfi -i "$(asrc 660)" -t 10 \
  -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -b:v 2M -c:a libopus -b:a 96k \
  "$OUT/vp9_opus_720p30_10s.webm"

# Long enough for resume rules (>= 60 s). Low resolution keeps it small.
echo "h264_aac_360p30_180s.mp4"
ff -f lavfi -i "$(vsrc 640x360 30)" -f lavfi -i "$(asrc 750)" -t 180   -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart   "$OUT/h264_aac_360p30_180s.mp4"

# Multi-track: two audio tracks with language tags + two subtitle tracks.
SRT_EN="$OUT/.tmp_en.srt"; SRT_FR="$OUT/.tmp_fr.srt"
printf '1\n00:00:01,000 --> 00:00:04,000\nHello from NOVA (en)\n\n2\n00:00:05,000 --> 00:00:09,000\nSecond English line\n' > "$SRT_EN"
printf '1\n00:00:01,000 --> 00:00:04,000\nBonjour de NOVA (fr)\n\n2\n00:00:05,000 --> 00:00:09,000\nDeuxieme ligne\n' > "$SRT_FR"
echo "multitrack_h264_2a_2s_10s.mkv"
ff -f lavfi -i "$(vsrc 1280x720 30)" -f lavfi -i "$(asrc 440)" -f lavfi -i "$(asrc 1320)" \
  -i "$SRT_EN" -i "$SRT_FR" -t 10 \
  -map 0:v -map 1:a -map 2:a -map 3:s -map 4:s \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 96k -c:s srt \
  -metadata:s:a:0 language=eng -metadata:s:a:0 title="English 440Hz" \
  -metadata:s:a:1 language=fra -metadata:s:a:1 title="French 1320Hz" \
  -metadata:s:s:0 language=eng -metadata:s:s:1 language=fra \
  "$OUT/multitrack_h264_2a_2s_10s.mkv"
rm -f "$SRT_EN" "$SRT_FR"

# Failure-path fixtures.
echo "truncated_h264.mp4"
head -c 200000 "$OUT/h264_aac_1080p30_30s.mp4" > "$OUT/truncated_h264.mp4"
echo "not_media.mp4"
printf 'this is not a media file\n' > "$OUT/not_media.mp4"

ls -la "$OUT"
