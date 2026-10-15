#!/usr/bin/env bash
# Generates NOVA's media-compatibility corpus: synthetic, freely distributable
# encodes of professional and consumer codecs/containers, plus failure cases.
# Every sample is described in manifest.jsonl with its expected outcome.
#
# IMPORTANT: these are FFmpeg encodes that reproduce codec *profiles*
# (e.g. H.264 High 4:2:2 Intra 10-bit in MXF, like Sony XAVC-I). They are not
# real camera files. Camera-branded formats stay "Expected" in the matrix
# until real, licensed camera samples are tested.
#
# Usage: bash scripts/generate-compat-corpus.sh [out_dir] [--quick]
# Requires an FFmpeg "full" build (gyan.dev) with libx264/x265/svtav1/vpx/theora.
set -euo pipefail

OUT="${1:-$(dirname "$0")/../tests/fixtures/compat}"
QUICK="${2:-}"
mkdir -p "$OUT"
MANIFEST="$OUT/manifest.jsonl"
: > "$MANIFEST"
FONT="${NOVA_FONT:-C\\:/Windows/Fonts/consola.ttf}"

ff() { ffmpeg -hide_banner -loglevel error -y "$@"; }

# Video source with timecode + sync flash. $1=WxH $2=fps [$3=pix_fmt for alpha]
vsrc() {
  echo "testsrc2=size=$1:rate=$2,drawbox=x=0:y=ih-ih/8:w=iw:h=ih/8:color=white:t=fill:enable='lt(mod(t,1),0.1)',drawtext=fontfile='$FONT':text='%{pts\\:hms}':fontsize=h/12:fontcolor=white:x=w/30:y=h/20:box=1:boxcolor=black@0.6"
}
# Stereo / multichannel audio with a once-per-second beep.
a2() { echo "sine=frequency=1000:sample_rate=48000:beep_factor=4,aformat=channel_layouts=stereo"; }
amc() { # $1 = channel layout (5.1, 7.1)
  echo "sine=frequency=500:sample_rate=48000:beep_factor=4,aformat=channel_layouts=$1"
}

# entry id file category expect vcodec acodec w h depth chroma feature notes
entry() {
  printf '{"id":"%s","file":"%s","category":"%s","expect":"%s","vcodec":"%s","acodec":"%s","width":%s,"height":%s,"bitDepth":%s,"chroma":"%s","feature":"%s","notes":"%s"}\n' \
    "$@" >> "$MANIFEST"
}

D=3   # seconds per sample
V="1280x720"

say() { echo "  $1"; }
echo "Generating compatibility corpus in $OUT"

# ---------------- Delivery / consumer codecs ----------------
say h264_aac.mp4
ff -f lavfi -i "$(vsrc 1920x1080 30)" -f lavfi -i "$(a2)" -t $D -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac "$OUT/h264_aac.mp4"
entry h264_aac h264_aac.mp4 consumer play h264 aac 1920 1080 8 420 none "H.264 High, AAC, MP4"

say hevc_main10_hdr10.mp4
ff -f lavfi -i "$(vsrc $V 30)" -f lavfi -i "$(a2)" -t $D -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le \
  -x265-params "log-level=error:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:hdr10=1:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,50):max-cll=1000,400" \
  -tag:v hvc1 -c:a aac "$OUT/hevc_main10_hdr10.mp4"
entry hevc_hdr10 hevc_main10_hdr10.mp4 hdr play hevc aac 1280 720 10 420 hdr10 "HEVC Main10, PQ, BT.2020, mastering metadata"

say hevc_hlg.mov
ff -f lavfi -i "$(vsrc $V 25)" -f lavfi -i "$(a2)" -t $D -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le \
  -x265-params "log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc" -tag:v hvc1 -c:a aac "$OUT/hevc_hlg.mov"
entry hevc_hlg hevc_hlg.mov hdr play hevc aac 1280 720 10 420 hlg "HEVC Main10, HLG"

say hevc_422_10.mov
ff -f lavfi -i "$(vsrc $V 30)" -f lavfi -i "$(a2)" -t $D -c:v libx265 -preset ultrafast -pix_fmt yuv422p10le -x265-params log-level=error \
  -tag:v hvc1 -c:a pcm_s24le "$OUT/hevc_422_10.mov"
entry hevc_422_10 hevc_422_10.mov camera-profile play hevc pcm_s24le 1280 720 10 422 none "HEVC 4:2:2 10-bit (XAVC HS / Panasonic HEVC 422 profile)"

say av1_10bit.mkv
ff -f lavfi -i "$(vsrc $V 30)" -f lavfi -i "$(a2)" -t $D -c:v libsvtav1 -preset 12 -pix_fmt yuv420p10le -c:a libopus "$OUT/av1_10bit.mkv"
entry av1_10bit av1_10bit.mkv consumer play av1 opus 1280 720 10 420 none "AV1 10-bit (SVT-AV1), Opus"

say vp9_alpha.webm
ff -f lavfi -i "$(vsrc $V 30),format=yuva420p,colorchannelmixer=aa=0.5" -f lavfi -i "$(a2)" -t $D -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -pix_fmt yuva420p -c:a libopus "$OUT/vp9_alpha.webm"
entry vp9_alpha vp9_alpha.webm alpha play vp9 opus 1280 720 8 420 none "VP9 with alpha (WebM). PARTIAL: plays, but the engine's VP9 decoder drops the alpha plane"

say vp8.webm
ff -f lavfi -i "$(vsrc $V 30)" -f lavfi -i "$(a2)" -t $D -c:v libvpx -deadline realtime -cpu-used 8 -b:v 2M -c:a libvorbis "$OUT/vp8.webm"
entry vp8 vp8.webm consumer play vp8 vorbis 1280 720 8 420 none "VP8, Vorbis"

say mpeg4_asp.avi
ff -f lavfi -i "$(vsrc 720x480 30)" -f lavfi -i "$(a2)" -t $D -c:v mpeg4 -q:v 4 -c:a libmp3lame "$OUT/mpeg4_asp.avi"
entry mpeg4_asp mpeg4_asp.avi legacy play mpeg4 mp3 720 480 8 420 none "MPEG-4 Part 2 ASP, MP3, AVI"

say theora.ogv
ff -f lavfi -i "$(vsrc 640x360 30)" -f lavfi -i "$(a2)" -t $D -c:v libtheora -q:v 6 -c:a libvorbis "$OUT/theora.ogv"
entry theora theora.ogv legacy play theora vorbis 640 360 8 420 none "Theora, Vorbis, Ogg"

say h264.3gp
ff -f lavfi -i "$(vsrc 640x360 30)" -f lavfi -i "sine=frequency=1000:sample_rate=16000" -t $D -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -ac 1 "$OUT/h264.3gp"
entry h264_3gp h264.3gp consumer play h264 aac 640 360 8 420 none "3GP"

say mpeg2_ac3.vob
ff -f lavfi -i "$(vsrc 720x480 30)" -f lavfi -i "$(a2)" -t $D -c:v mpeg2video -b:v 6M -pix_fmt yuv420p -c:a ac3 -f vob "$OUT/mpeg2_ac3.vob"
entry mpeg2_vob mpeg2_ac3.vob legacy play mpeg2video ac3 720 480 8 420 none "DVD-style MPEG-2 + AC-3 in VOB"

say mpeg2_ts.ts
ff -f lavfi -i "$(vsrc 1920x1080 30)" -f lavfi -i "$(a2)" -t $D -c:v mpeg2video -b:v 15M -c:a ac3 -f mpegts "$OUT/mpeg2_ts.ts"
entry mpeg2_ts mpeg2_ts.ts broadcast play mpeg2video ac3 1920 1080 8 420 none "MPEG-2 in MPEG-TS (broadcast)"

say avchd.m2ts
ff -f lavfi -i "$(vsrc 1920x1080 30)" -f lavfi -i "$(a2)" -t $D -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a ac3 -f mpegts -mpegts_m2ts_mode 1 "$OUT/avchd.m2ts"
entry avchd_m2ts avchd.m2ts camera-profile play h264 ac3 1920 1080 8 420 none "AVCHD-style H.264 + AC-3 in M2TS"

say vfr.mkv
ff -f lavfi -i "$(vsrc $V 30),setpts='if(lt(N,30),N/30,if(lt(N,60),1+(N-30)/60,1.5+(N-60)/15))/TB'" -t 4 -fps_mode passthrough -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$OUT/vfr.mkv"
entry vfr vfr.mkv vfr play h264 none 1280 720 8 420 vfr "Variable frame rate (30/60/15 fps segments)"

say h264_120fps.mp4
ff -f lavfi -i "$(vsrc 1920x1080 120)" -t 2 -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$OUT/h264_120fps.mp4"
entry hfr_120 h264_120fps.mp4 hfr play h264 none 1920 1080 8 420 none "1080p120 high frame rate"

# ---------------- Professional camera / acquisition profiles ----------------
say xavc_intra_like.mxf
ff -f lavfi -i "$(vsrc 1920x1080 25)" -f lavfi -i "$(a2)" -t $D -c:v libx264 -preset ultrafast -profile:v high422 -pix_fmt yuv422p10le -x264-params keyint=1 \
  -c:a pcm_s24le "$OUT/xavc_intra_like.mxf"
entry xavc_i_like xavc_intra_like.mxf camera-profile play h264 pcm_s24le 1920 1080 10 422 none "H.264 High 4:2:2 Intra 10-bit in MXF (XAVC-I / XF-AVC Intra profile)"

say avc_intra100.mxf
ff -f lavfi -i "$(vsrc 1920x1080 25)" -f lavfi -i "$(a2)" -t $D -c:v libx264 -avcintra-class 100 -pix_fmt yuv422p10le \
  -c:a pcm_s24le "$OUT/avc_intra100.mxf"
entry avc_intra100 avc_intra100.mxf camera-profile play h264 pcm_s24le 1920 1080 10 422 none "AVC-Intra 100 class (x264 avcintra-class) in MXF"

say xdcam_mpeg2_422.mxf
ff -f lavfi -i "$(vsrc 1920x1080 25)" -f lavfi -i "$(a2)" -t $D -c:v mpeg2video -pix_fmt yuv422p -b:v 50M -minrate 50M -maxrate 50M -bufsize 17825792 -g 12 \
  -c:a pcm_s24le "$OUT/xdcam_mpeg2_422.mxf"
entry xdcam_hd422 xdcam_mpeg2_422.mxf camera-profile play mpeg2video pcm_s24le 1920 1080 8 422 none "MPEG-2 4:2:2 50 Mb/s in MXF (XDCAM HD422 profile)"

say dv_pal.dv
ff -f lavfi -i "$(vsrc 720x576 25)" -f lavfi -i "$(a2)" -t $D -c:v dvvideo -pix_fmt yuv420p -c:a pcm_s16le -ar 48000 -f dv "$OUT/dv_pal.dv"
entry dv dv_pal.dv camera-profile play dvvideo pcm_s16le 720 576 8 420 none "DV PAL raw stream"

say mjpeg.avi
ff -f lavfi -i "$(vsrc $V 30)" -f lavfi -i "$(a2)" -t $D -c:v mjpeg -q:v 3 -pix_fmt yuvj422p -c:a pcm_s16le "$OUT/mjpeg.avi"
entry mjpeg mjpeg.avi camera-profile play mjpeg pcm_s16le 1280 720 8 422 none "Motion JPEG (consumer cameras), AVI"

# ---------------- Editing / intermediate codecs ----------------
say prores_422hq.mov
ff -f lavfi -i "$(vsrc 1920x1080 25)" -f lavfi -i "$(a2)" -t $D -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le -c:a pcm_s24le "$OUT/prores_422hq.mov"
entry prores_422hq prores_422hq.mov intermediate play prores pcm_s24le 1920 1080 10 422 none "Apple ProRes 422 HQ"

say prores_4444_alpha.mov
ff -f lavfi -i "$(vsrc 1920x1080 25),format=yuva444p10le" -t $D -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -alpha_bits 16 "$OUT/prores_4444_alpha.mov"
entry prores_4444 prores_4444_alpha.mov intermediate play prores none 1920 1080 10 444 alpha "Apple ProRes 4444 with alpha"

say dnxhr_hqx.mxf
ff -f lavfi -i "$(vsrc 1920x1080 25)" -f lavfi -i "$(a2)" -t $D -c:v dnxhd -profile:v dnxhr_hqx -pix_fmt yuv422p10le -c:a pcm_s24le "$OUT/dnxhr_hqx.mxf"
entry dnxhr_hqx dnxhr_hqx.mxf intermediate play dnxhd pcm_s24le 1920 1080 10 422 none "Avid DNxHR HQX 10-bit in MXF OP1a"

say dnxhd_36.mov
ff -f lavfi -i "$(vsrc 1920x1080 25)" -t $D -c:v dnxhd -b:v 36M -pix_fmt yuv422p "$OUT/dnxhd_36.mov"
entry dnxhd_36 dnxhd_36.mov intermediate play dnxhd none 1920 1080 8 422 none "Avid DNxHD 36 in MOV"

say cineform.mov
ff -f lavfi -i "$(vsrc 1920x1080 25)" -t $D -c:v cfhd -pix_fmt yuv422p10le "$OUT/cineform.mov"
entry cineform cineform.mov intermediate play cfhd none 1920 1080 10 422 none "GoPro CineForm"

say ffv1.mkv
ff -f lavfi -i "$(vsrc $V 25)" -f lavfi -i "$(a2)" -t $D -c:v ffv1 -level 3 -pix_fmt yuv422p10le -c:a flac "$OUT/ffv1.mkv"
entry ffv1 ffv1.mkv archival play ffv1 flac 1280 720 10 422 none "FFV1 v3 10-bit lossless (archival)"

say huffyuv.avi
ff -f lavfi -i "$(vsrc 640x360 25)" -t $D -c:v huffyuv -pix_fmt yuv422p "$OUT/huffyuv.avi"
entry huffyuv huffyuv.avi archival play huffyuv none 640 360 8 422 none "HuffYUV lossless"

say utvideo.avi
ff -f lavfi -i "$(vsrc 640x360 25)" -t $D -c:v utvideo -pix_fmt yuv422p "$OUT/utvideo.avi"
entry utvideo utvideo.avi archival play utvideo none 640 360 8 422 none "Ut Video lossless"

say v210.mov
ff -f lavfi -i "$(vsrc 1280x720 25)" -t 2 -c:v v210 "$OUT/v210.mov"
entry v210 v210.mov uncompressed play v210 none 1280 720 10 422 none "Uncompressed 10-bit 4:2:2 (v210)"

say qtrle_alpha.mov
ff -f lavfi -i "$(vsrc 640x360 25),format=argb" -t 2 -c:v qtrle "$OUT/qtrle_alpha.mov"
entry qtrle_alpha qtrle_alpha.mov alpha play qtrle none 640 360 8 444 alpha "QuickTime Animation (RLE) with alpha"

say hap.mov
ff -f lavfi -i "$(vsrc $V 30)" -t $D -c:v hap -format hap "$OUT/hap.mov"
entry hap hap.mov realtime play hap none 1280 720 8 444 none "HAP (VJ / media servers); decodes to RGB"

# ---------------- High resolution ----------------
say hevc_4k60.mp4
ff -f lavfi -i "$(vsrc 3840x2160 60)" -t 2 -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -x265-params log-level=error -tag:v hvc1 "$OUT/hevc_4k60.mp4"
entry hevc_4k60 hevc_4k60.mp4 high-res play hevc none 3840 2160 10 420 none "4K60 HEVC Main10"

if [[ "$QUICK" != "--quick" ]]; then
  say hevc_8k.mp4
  ff -f lavfi -i "$(vsrc 7680x4320 24)" -t 2 -c:v libx265 -preset ultrafast -pix_fmt yuv420p -x265-params log-level=error -tag:v hvc1 "$OUT/hevc_8k.mp4"
  entry hevc_8k hevc_8k.mp4 high-res play hevc none 7680 4320 8 420 none "8K24 HEVC"

  say prores_4k_hq.mov
  ff -f lavfi -i "$(vsrc 3840x2160 25)" -f lavfi -i "$(a2)" -t 4 -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le -c:a pcm_s24le "$OUT/prores_4k_hq.mov"
  entry prores_4k prores_4k_hq.mov high-res play prores pcm_s24le 3840 2160 10 422 none "4K ProRes 422 HQ (high bitrate)"
fi

# ---------------- Professional audio ----------------
say pcm24_51.wav
ff -f lavfi -i "$(amc 5.1)" -t $D -c:a pcm_s24le "$OUT/pcm24_51.wav"
entry wav_51 pcm24_51.wav audio play none pcm_s24le 0 0 0 none multichannel "24-bit PCM 5.1 WAV"

say flac_71.flac
ff -f lavfi -i "$(amc 7.1)" -t $D -c:a flac "$OUT/flac_71.flac"
entry flac_71 flac_71.flac audio play none flac 0 0 0 none multichannel "FLAC 7.1"

say alac.m4a
ff -f lavfi -i "$(a2)" -t $D -c:a alac "$OUT/alac.m4a"
entry alac alac.m4a audio play none alac 0 0 0 none none "Apple Lossless (ALAC)"

say ac3_51.ac3
ff -f lavfi -i "$(amc 5.1)" -t $D -c:a ac3 "$OUT/ac3_51.ac3"
entry ac3_51 ac3_51.ac3 audio play none ac3 0 0 0 none multichannel "Dolby Digital (AC-3) 5.1"

say eac3_51.mka
ff -f lavfi -i "$(amc 5.1)" -t $D -c:a eac3 "$OUT/eac3_51.mka"
entry eac3_51 eac3_51.mka audio play none eac3 0 0 0 none multichannel "Dolby Digital Plus (E-AC-3) 5.1"

say dts_51.mka
ff -f lavfi -i "$(amc 5.1)" -t $D -c:a dca -strict -2 "$OUT/dts_51.mka"
entry dts_51 dts_51.mka audio play none dts 0 0 0 none multichannel "DTS core 5.1 (FFmpeg experimental encoder)"

say truehd.mka
ff -f lavfi -i "$(amc 5.1)" -t $D -c:a truehd -strict -2 "$OUT/truehd.mka"
entry truehd truehd.mka audio play none truehd 0 0 0 none multichannel "Dolby TrueHD 5.1"

say opus.opus; ff -f lavfi -i "$(a2)" -t $D -c:a libopus "$OUT/opus.opus"
entry opus opus.opus audio play none opus 0 0 0 none none "Opus"
say mp3.mp3; ff -f lavfi -i "$(a2)" -t $D -c:a libmp3lame "$OUT/mp3.mp3"
entry mp3 mp3.mp3 audio play none mp3 0 0 0 none none "MP3"

# ---------------- Still frames (single images) ----------------
say frame.dpx; ff -f lavfi -i "$(vsrc 1920x1080 1)" -frames:v 1 -pix_fmt gbrp10le "$OUT/frame.dpx"
entry dpx_frame frame.dpx image play dpx none 1920 1080 10 444 still "Single 10-bit DPX frame"
say frame.exr; ff -f lavfi -i "$(vsrc 1920x1080 1)" -frames:v 1 -pix_fmt gbrpf32le "$OUT/frame.exr"
entry exr_frame frame.exr image play exr none 1920 1080 32 444 still "Single OpenEXR float frame"

# ---------------- Failure and edge cases ----------------
say unknown_fourcc.avi
ff -f lavfi -i "$(vsrc 320x240 25)" -f lavfi -i "$(a2)" -t 2 -c:v mjpeg -c:a pcm_s16le "$OUT/unknown_fourcc.avi"
python -c "
import sys;p=sys.argv[1];b=bytearray(open(p,'rb').read());b[:8192]=bytes(b[:8192]).replace(b'MJPG',b'ZZZZ');open(p,'wb').write(b)" "$OUT/unknown_fourcc.avi"
entry unknown_fourcc unknown_fourcc.avi failure video-decoder-missing unknown pcm_s16le 320 240 0 none none "AVI with an unknown video FourCC; audio must still play"

say truncated.mov; head -c 300000 "$OUT/prores_422hq.mov" > "$OUT/truncated.mov"
entry truncated truncated.mov failure no-hang prores none 0 0 0 none none "ProRes MOV cut to 300 KB (moov missing)"
say midcorrupt.mp4
python -c "
import sys,random;p=sys.argv[1];o=sys.argv[2];b=bytearray(open(p,'rb').read());random.seed(7)
for i in range(len(b)//2, len(b)//2+20000): b[i]=random.randrange(256)
open(o,'wb').write(b)" "$OUT/h264_aac.mp4" "$OUT/midcorrupt.mp4"
entry midcorrupt midcorrupt.mp4 failure no-hang h264 aac 1920 1080 8 420 none "20 KB of garbage in the middle of the stream"
say zero.mkv; : > "$OUT/zero.mkv"
entry zero zero.mkv failure load-failed none none 0 0 0 none none "Zero-byte file"
say random.mxf; python -c "import os,sys;open(sys.argv[1],'wb').write(os.urandom(65536))" "$OUT/random.mxf"
entry random random.mxf failure load-failed none none 0 0 0 none none "Random bytes with a media extension"

# ---------------- Non-playable professional files (detection) ----------------
say project.prproj
python -c "
import gzip,sys;gzip.open(sys.argv[1],'wb').write(b'<?xml version=\"1.0\" encoding=\"UTF-8\" ?>\n<PremiereData Version=\"3\"></PremiereData>\n')" "$OUT/project.prproj"
entry prproj project.prproj project editing-project none none 0 0 0 none none "Premiere Pro project (gzip XML)"
say timeline.fcpxml
printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10"></fcpxml>\n' > "$OUT/timeline.fcpxml"
entry fcpxml timeline.fcpxml project editing-project none none 0 0 0 none none "Final Cut Pro XML timeline"

# ---------------- Content-first detection ----------------
say renamed_mkv.mp4; cp "$OUT/ffv1.mkv" "$OUT/renamed_mkv.mp4"
entry renamed renamed_mkv.mp4 detection play ffv1 flac 1280 720 10 422 none "Matroska file with a misleading .mp4 extension"

# ---------------- Camera RAW handling (stand-ins, NOT real RAW) ----------------
# Real RAW samples cannot be generated with open tools. These check NOVA's
# failure path: a RAW extension whose content the engine cannot decode.
say standin.braw; cp "$OUT/unknown_fourcc.avi" "$OUT/standin.braw"
entry braw_standin standin.braw raw-standin requires-external unknown pcm_s16le 0 0 0 none none "Stand-in: undecodable video with .braw extension"
say standin.r3d; python -c "import os,sys;open(sys.argv[1],'wb').write(os.urandom(65536))" "$OUT/standin.r3d"
entry r3d_standin standin.r3d raw-standin requires-external none none 0 0 0 none none "Stand-in: unreadable data with .r3d extension"

echo "Wrote $(wc -l < "$MANIFEST") manifest entries"
du -sh "$OUT" 2>/dev/null | cut -f1
