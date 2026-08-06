package com.algolon.fjallkompis;

import android.os.Build;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

/**
 * Fjällkompis Android shell.
 *
 * The app itself is the shared React/Vite build running in the WebView; this
 * class exists only to put that WebView edge to edge, which is what lets the
 * light-green bottom tab-bar surface reach the physical screen edge behind
 * Android's navigation controls and the dark spruce band sit behind the
 * status bar.
 *
 * Everything about geometry is handled from there in CSS: Capacitor's
 * SystemBars plugin measures the real window insets and injects
 * --safe-area-inset-* (see capacitor.config.ts, insetsHandling: "css"), and
 * src/styles/global.css offsets the elements that own a screen edge. No
 * layout decision is duplicated here.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // MUST run before super.onCreate(), which is where BridgeActivity
        // calls setContentView(); enabling edge-to-edge afterwards would not
        // reach the already-laid-out decor view.
        //
        // Is this redundant? Not entirely. compileSdk/targetSdk are 36, and
        // Android 15+ (API 35+) enforces edge-to-edge for apps targeting 35 or
        // higher, so on a current device the framework has already done this.
        // But minSdkVersion is 24: on Android 7–14 nothing enables it
        // automatically, and without this call the WebView would be letterboxed
        // between opaque system bars — the bottom navigation surface would stop
        // short of the screen edge, which is the specific thing this spike is
        // meant to prove. EdgeToEdge.enable() is the supported AndroidX entry
        // point (androidx.activity) and is a no-op where the platform has
        // already applied it; the deprecated statusBarColor/navigationBarColor
        // window properties are deliberately not used, as they are no-ops for
        // targetSdk 35+ anyway.
        EdgeToEdge.enable(this);

        super.onCreate(savedInstanceState);

        // With a transparent navigation bar, Android draws its own translucent
        // scrim behind the THREE-BUTTON navigation area for contrast. That
        // scrim would grey down the tab-bar green the web layer paints there,
        // leaving a visible band that matches neither the app nor the system.
        // Turning it off hands the whole area to the app's own surface, which
        // is exactly the light, high-contrast background those dark system
        // icons need. Gesture navigation is unaffected (it enforces no scrim).
        //
        // API 29+ only; on 24–28 the platform has no such API and the
        // navigation bar simply stays opaque, which degrades gracefully.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        // System bars are deliberately left VISIBLE. No immersive mode, no
        // hiding: this is a hiking companion whose users need the clock and
        // the battery indicator, and Capacitor's SystemBars config keeps
        // `hidden: false`. Per-bar icon contrast is set from the web layer in
        // src/runtime/platform.ts, where the two bars can be styled
        // independently (light icons on the spruce status band, dark icons on
        // the light navigation surface).
    }
}
