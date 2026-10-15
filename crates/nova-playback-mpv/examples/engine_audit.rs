//! Prints the codecs, demuxers and hardware decoders compiled into libmpv.
//! Usage: cargo run -p nova-playback-mpv --example engine_audit -- [libmpv path]
use nova_playback_mpv::node::Node;
use nova_playback_mpv::{MpvConfig, MpvPlayer};
use std::sync::Arc;

fn main() {
    let lib = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "vendor/libmpv/libmpv-2.dll".into());
    let p = MpvPlayer::new(MpvConfig::headless(lib), Arc::new(|_| {})).expect("libmpv");
    let d = p.diagnostics();
    println!("# mpv {:?}\n# ffmpeg {:?}", d.mpv_version, d.ffmpeg_version);
    if let Some(Node::Array(list)) = p.property_node("decoder-list") {
        for e in list {
            let s = |k| e.get(k).and_then(Node::as_str).unwrap_or("").to_owned();
            println!(
                "decoder\t{}\t{}\t{}",
                s("codec"),
                s("driver"),
                s("description")
            );
        }
    }
    if let Some(Node::Array(list)) = p.property_node("demuxer-lavf-list") {
        for e in list {
            println!("demuxer\t{}", e.as_str().unwrap_or(""));
        }
    }
    for prop in ["hwdec-interop", "mpv-configuration"] {
        println!("prop\t{prop}\t{:?}", p.property_string(prop));
    }
}
