package me.snowbros.nova.mpv

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** NOVA's libmpv engine for Android. JS: modules/nova-mpv/src. */
class NovaMpvModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NovaMpv")

    View(NovaMpvView::class) {
      Events("onState", "onEngineEvent")

      Prop("source") { view: NovaMpvView, source: Map<String, Any?>? ->
        view.setSource(source?.get("uri") as String?, (source?.get("startMs") as Number?)?.toDouble())
      }

      AsyncFunction("command") { view: NovaMpvView, args: List<String> -> view.command(args) }
      AsyncFunction("setProperty") { view: NovaMpvView, name: String, value: String -> view.setProperty(name, value) }
      AsyncFunction("screenshot") { view: NovaMpvView, path: String, promise: Promise -> view.screenshot(path, promise) }

      OnViewDestroys { view: NovaMpvView -> view.destroy() }
    }
  }
}
