package me.snowbros.nova.mpv

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.PixelCopy
import android.view.SurfaceHolder
import android.view.SurfaceView
import dev.jdtech.mpv.MPVLib
import dev.jdtech.mpv.MPVLib.MpvEvent
import dev.jdtech.mpv.MPVLib.MpvFormat
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.io.FileOutputStream

/**
 * One libmpv instance drawing into a SurfaceView: the same engine and
 * options as NOVA for Windows (crates/nova-playback-mpv), with Android's
 * MediaCodec in place of D3D11 for hardware decoding.
 *
 * Property changes are batched and sent to JS every 100 ms as `onState`;
 * lifecycle events (file loaded, seek landed, end, failure) go out at once
 * as `onEngineEvent`.
 */
class NovaMpvView(context: Context, appContext: AppContext) : ExpoView(context, appContext), SurfaceHolder.Callback, MPVLib.EventObserver {
  // The SurfaceView is a native child; React Native does not lay it out.
  override val shouldUseAndroidLayout = true

  private val onState by EventDispatcher<Map<String, Any?>>()
  private val onEngineEvent by EventDispatcher<Map<String, Any?>>()

  private val main = Handler(Looper.getMainLooper())
  private val surface = SurfaceView(context).also { addView(it, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }
  private var mpv: MPVLib? = null
  private val pending = HashMap<String, Any?>()
  private var flushQueued = false
  private var source: String? = null
  private var startSeconds = 0.0
  private var loaded = false
  /** mpv drops the video track if a file starts before there is a surface to draw on. */
  private var surfaceReady = false
  private var hwdec = "mediacodec,mediacodec-copy"

  init {
    surface.holder.addCallback(this)
    start()
  }

  private fun start() {
    val m = MPVLib.create(context)
    if (m == null) {
      main.post { onEngineEvent(mapOf("name" to "failed")) }
      return
    }
    val dir = File(context.filesDir, "mpv").apply { mkdirs() }
    copyFont(dir)
    m.setOptionString("config", "no")
    m.setOptionString("config-dir", dir.path)
    m.setOptionString("vo", "gpu")
    m.setOptionString("gpu-context", "android")
    m.setOptionString("opengl-es", "yes")
    m.setOptionString("hwdec", hwdec)
    m.setOptionString("hwdec-codecs", "h264,hevc,mpeg4,mpeg2video,vp8,vp9,av1")
    m.setOptionString("ao", "audiotrack,opensles")
    m.setOptionString("keep-open", "yes")
    m.setOptionString("idle", "yes")
    m.setOptionString("force-window", "no")
    m.setOptionString("input-default-bindings", "no")
    m.setOptionString("osd-level", "0")
    m.setOptionString("msg-level", "all=warn")
    m.setOptionString("sub-fonts-dir", dir.path)
    m.setOptionString("sub-font", "Archivo")
    // Subtitles stay on the picture, not in the bars under the player's controls.
    m.setOptionString("sub-use-margins", "no")
    m.setOptionString("sub-ass-force-margins", "no")
    m.setOptionString("demuxer-max-bytes", "64MiB")
    // Same seek behaviour as desktop: relative seeks are exact (docs/architecture/seeking.md).
    m.setOptionString("hr-seek", "yes")
    m.setOptionString("hr-seek-framedrop", "no")
    m.init()
    for ((name, fmt) in OBSERVED) m.observeProperty(name, fmt)
    m.addObserver(this)
    mpv = m
  }

  /** libass needs a font file; NOVA's own Archivo ships with the app. */
  private fun copyFont(dir: File) {
    val out = File(dir, "Archivo-Medium.ttf")
    if (out.exists()) return
    runCatching { context.assets.open("fonts/Archivo-Medium.ttf").use { i -> FileOutputStream(out).use { i.copyTo(it) } } }
  }

  fun setSource(uri: String?, startMs: Double?) {
    startSeconds = (startMs ?: 0.0) / 1000.0
    if (uri == source) return
    source = uri
    load()
  }

  private fun load() {
    val m = mpv ?: return
    val uri = source ?: return
    if (!surfaceReady) return // surfaceCreated() loads it
    loaded = false
    m.setPropertyString("start", if (startSeconds > 0) "%.3f".format(java.util.Locale.ROOT, startSeconds) else "none")
    m.command(arrayOf("loadfile", path(uri)))
  }

  /** mpv opens paths and fd://; content:// is handed over as a file descriptor. */
  private fun path(uri: String): String = when {
    uri.startsWith("content://") ->
      runCatching { context.contentResolver.openFileDescriptor(Uri.parse(uri), "r")!!.detachFd() }
        .map { "fdclose://$it" }.getOrDefault(uri)
    uri.startsWith("file://") -> Uri.parse(uri).path ?: uri
    else -> uri
  }

  fun command(args: List<String>) {
    // sub-add with a picked file: same URI handling as loadfile.
    mpv?.command(args.map { if (it.startsWith("content://") || it.startsWith("file://")) path(it) else it }.toTypedArray())
  }

  fun setProperty(name: String, value: String) {
    if (name == "hwdec") hwdec = value
    mpv?.setPropertyString(name, value)
  }

  /** The picture as shown (PixelCopy reads the SurfaceView; mpv's encoders are not built in). */
  fun screenshot(path: String, promise: Promise) {
    val w = surface.width
    val h = surface.height
    if (w <= 0 || h <= 0) return promise.reject("ERR_NO_FRAME", "No picture yet", null)
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val thread = HandlerThread("nova-pixelcopy").apply { start() }
    PixelCopy.request(surface, bmp, { result ->
      thread.quitSafely()
      if (result != PixelCopy.SUCCESS) return@request promise.reject("ERR_COPY", "The frame could not be copied ($result)", null)
      runCatching { FileOutputStream(path).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) } }
        .onSuccess { promise.resolve("file://$path") }
        .onFailure { promise.reject("ERR_WRITE", it.message, it) }
    }, Handler(thread.looper))
  }

  fun destroy() {
    val m = mpv ?: return
    mpv = null
    m.removeObserver(this)
    runCatching { m.detachSurface() }
    m.destroy()
  }

  // --- surface ---------------------------------------------------------------

  override fun surfaceCreated(holder: SurfaceHolder) {
    val m = mpv ?: return
    m.attachSurface(holder.surface)
    m.setOptionString("force-window", "yes")
    m.setPropertyString("vo", "gpu")
    val first = !surfaceReady
    surfaceReady = true
    if (first) load()
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    mpv?.setPropertyString("android-surface-size", "${width}x$height")
  }

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    val m = mpv ?: return
    m.setPropertyString("vo", "null")
    m.setOptionString("force-window", "no")
    m.detachSurface()
  }

  // --- engine events (mpv's event thread) -------------------------------------

  override fun eventProperty(property: String) {
    if (property == "track-list") queue("tracks", tracks())
  }

  override fun eventProperty(property: String, value: Long) = queue(property, value)
  override fun eventProperty(property: String, value: Double) = queue(property, value)
  override fun eventProperty(property: String, value: Boolean) = queue(property, value)
  override fun eventProperty(property: String, value: String) = queue(property, value)

  override fun event(eventId: Int) {
    val name = when (eventId) {
      MpvEvent.MPV_EVENT_FILE_LOADED -> { loaded = true; mpv?.setPropertyString("start", "none"); "loaded" }
      MpvEvent.MPV_EVENT_PLAYBACK_RESTART -> "restart"
      MpvEvent.MPV_EVENT_SEEK -> "seek"
      MpvEvent.MPV_EVENT_END_FILE -> if (loaded) "end" else "failed"
      else -> return
    }
    main.post { flush(); onEngineEvent(mapOf("name" to name)) }
  }

  private fun queue(key: String, value: Any?) {
    synchronized(pending) {
      pending[key] = value
      if (flushQueued) return
      flushQueued = true
    }
    main.postDelayed({ flush() }, 100)
  }

  private fun flush() {
    val batch = synchronized(pending) {
      flushQueued = false
      if (pending.isEmpty()) return
      HashMap(pending).also { pending.clear() }
    }
    onState(batch)
  }

  private fun tracks(): List<Map<String, Any?>> {
    val m = mpv ?: return emptyList()
    val n = m.getPropertyInt("track-list/count") ?: 0
    return (0 until n).map { i ->
      val p = "track-list/$i/"
      mapOf(
        "id" to (m.getPropertyInt("${p}id") ?: i),
        "type" to m.getPropertyString("${p}type"),
        "title" to m.getPropertyString("${p}title"),
        "lang" to m.getPropertyString("${p}lang"),
        "codec" to m.getPropertyString("${p}codec"),
        "external" to (m.getPropertyBoolean("${p}external") ?: false),
        "selected" to (m.getPropertyBoolean("${p}selected") ?: false),
      )
    }
  }

  companion object {
    private val OBSERVED = listOf(
      "time-pos" to MpvFormat.MPV_FORMAT_DOUBLE,
      "duration" to MpvFormat.MPV_FORMAT_DOUBLE,
      "pause" to MpvFormat.MPV_FORMAT_FLAG,
      "paused-for-cache" to MpvFormat.MPV_FORMAT_FLAG,
      "seeking" to MpvFormat.MPV_FORMAT_FLAG,
      "eof-reached" to MpvFormat.MPV_FORMAT_FLAG,
      "speed" to MpvFormat.MPV_FORMAT_DOUBLE,
      "volume" to MpvFormat.MPV_FORMAT_DOUBLE,
      "mute" to MpvFormat.MPV_FORMAT_FLAG,
      "sub-delay" to MpvFormat.MPV_FORMAT_DOUBLE,
      "audio-delay" to MpvFormat.MPV_FORMAT_DOUBLE,
      "sub-scale" to MpvFormat.MPV_FORMAT_DOUBLE,
      "sub-pos" to MpvFormat.MPV_FORMAT_INT64,
      "hwdec-current" to MpvFormat.MPV_FORMAT_STRING,
      "chapter-list/count" to MpvFormat.MPV_FORMAT_INT64,
      "track-list" to MpvFormat.MPV_FORMAT_NONE,
      // Typed fields: a change event only when the value changes (video-params as a whole fires per frame).
      "video-params/dw" to MpvFormat.MPV_FORMAT_INT64,
      "video-params/dh" to MpvFormat.MPV_FORMAT_INT64,
      "video-params/gamma" to MpvFormat.MPV_FORMAT_STRING,
      "container-fps" to MpvFormat.MPV_FORMAT_DOUBLE,
      "video-format" to MpvFormat.MPV_FORMAT_STRING,
    )
  }
}
