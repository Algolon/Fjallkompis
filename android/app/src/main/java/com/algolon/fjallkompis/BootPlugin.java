package com.algolon.fjallkompis;

import android.app.Activity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The one narrow bridge from the web layer to the native launch sequence.
 *
 * The Android splash stays on screen until the app is genuinely ready to be
 * revealed (MainActivity's keep-on-screen condition). Only the web layer
 * knows when that is — React has to have mounted AND the first screen has to
 * have finished becoming opaque — so it needs exactly one way to say so.
 * This plugin is it, and it deliberately has exactly one method and carries
 * no data.
 *
 * WHY A CAPACITOR PLUGIN rather than WebView.addJavascriptInterface: an
 * interface added after `loadUrl` is not guaranteed to reach the page that is
 * already loading, and Capacitor starts that load inside
 * BridgeActivity.onCreate. A plugin registered before super.onCreate() is in
 * the bridge from the first frame, which is precisely the window this signal
 * lives in. It is also the supported extension point rather than a lifecycle
 * race we would have to keep re-proving.
 *
 * The JS side is src/runtime/platform.ts (signalNativeAppReady) — nothing
 * else in the app may call it.
 */
@CapacitorPlugin(name = "Boot")
public class BootPlugin extends Plugin {

    /**
     * The web layer reports that the first usable frame is painted and
     * opaque. Idempotent: a duplicate call after the splash has already been
     * released is harmless.
     */
    @PluginMethod
    public void appReady(PluginCall call) {
        Activity activity = getActivity();
        if (activity instanceof MainActivity) {
            // The keep-on-screen condition is read on the UI thread's
            // pre-draw pass; flip the flag there rather than from the bridge
            // thread.
            activity.runOnUiThread(() -> ((MainActivity) activity).markAppReady());
        }
        call.resolve();
    }
}
