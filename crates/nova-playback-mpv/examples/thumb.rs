//! cargo run -p nova-playback-mpv --example thumb -- <media> <out.jpg>
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let t = std::time::Instant::now();
    let r = nova_playback_mpv::thumbnail::extract(
        "vendor/libmpv/libmpv-2.dll".as_ref(),
        a[1].as_ref(),
        a[2].as_ref(),
        25,
        480,
        std::time::Duration::from_secs(15),
    );
    println!("{r:?} in {:?}", t.elapsed());
}
