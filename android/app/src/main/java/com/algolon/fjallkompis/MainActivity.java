package com.algolon.fjallkompis;

import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.activity.EdgeToEdge;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Fjällkompis Android shell.
 *
 * The app itself is the shared React/Vite build running in the WebView; this
 * class exists only to put that WebView edge to edge — which is what lets the
 * light-green bottom tab-bar surface reach the physical screen edge behind
 * Android's navigation controls and the dark spruce band sit behind the
 * status bar — and to paper over the two places the platform draws instead of
 * the web layer (the splash handoff and the three-button navigation band).
 * Geometry stays in CSS: Capacitor's SystemBars plugin injects
 * --safe-area-inset-* (capacitor.config.ts, insetsHandling: "css") and
 * src/styles/global.css offsets the elements that own a screen edge.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // THE ORDER OF THE NEXT THREE CALLS IS THE FIX for the phantom logo
        // strip the Samsung test found, so it is worth spelling out.
        //
        // installSplashScreen() must be the FIRST statement. It performs the
        // supported splash handoff: it reads postSplashScreenTheme from the
        // launch theme (styles.xml) and swaps the activity onto
        // AppTheme.NoActionBar immediately — before anything can create the
        // window's decor view.
        //
        // Why that matters: a window RESOLVES its background drawable from
        // whatever theme the activity wears at the moment the decor view is
        // first created, and keeps it. EdgeToEdge.enable() below touches the
        // decor view. In the previous revision it ran while the activity
        // still wore the LAUNCH theme, so the decor froze the splash
        // drawable — launch colour plus centred logo — as its permanent
        // background, and BridgeActivity's later setTheme() could not undo
        // it. On devices where Capacitor pads the WebView instead of passing
        // insets through (the Samsung path), the padded status-bar band
        // exposed that stale background above every screen: a ~120 px
        // light-green strip wearing the splash mark as if it were app
        // chrome. With the theme swapped first, the decor is created under
        // AppTheme.NoActionBar, whose windowBackground is a plain colour —
        // visible only for the instant before the WebView's first paint, and
        // never a logo. No timing hacks, no manual splash hiding: the
        // platform owns the splash dismiss exactly as before.
        SplashScreen.installSplashScreen(this);

        // Edge-to-edge, before super.onCreate() lays out the bridge. Android
        // 15+ (API 35+) enforces this for targetSdk 35+, but minSdk is 24 and
        // on Android 7–14 nothing enables it automatically — without it the
        // WebView is letterboxed and the tab-bar surface can never reach the
        // physical screen edge. EdgeToEdge.enable() is the supported AndroidX
        // entry point and a no-op where the platform already applied it; the
        // deprecated statusBarColor/navigationBarColor properties are
        // deliberately not used (no-ops for targetSdk 35+ anyway).
        EdgeToEdge.enable(this);

        super.onCreate(savedInstanceState);

        // TYPOGRAPHY PARITY GUARD.
        //
        // Android documents 100 as the DEFAULT for WebSettings.setTextZoom, so
        // this is a guard rather than a correction of a documented default:
        // it pins text scaling to the exact value every layout contract in
        // this app was validated against, independent of any device-, OEM- or
        // configuration-level text-scaling behaviour that might otherwise
        // reach the WebView. Capacitor never sets it (verified against
        // @capacitor/android 8.5.0 sources), so without this line the value
        // is simply whatever the platform hands us.
        //
        // Physical evidence: with the pin in place, the wrapper's typography
        // and sizing were confirmed on the Samsung to match the intended
        // PWA appearance, and approved for this spike. Deliberately NOT
        // claimed here: a specific root cause for the earlier mismatch. The
        // fix was verified by its result, not by a mechanism this codebase
        // can prove.
        //
        // OPEN PRODUCT/ACCESSIBILITY DECISION, out of scope for this spike:
        // whether the wrapper should instead honour the reader's system
        // font-size preference. Pinning matches the installed PWA's existing
        // behaviour, so it is the consistent default for now — but it is a
        // decision, and a real one, not a permanent answer.
        this.getBridge().getWebView().getSettings().setTextZoom(100);

        // With a transparent navigation bar, Android draws its own
        // translucent contrast scrim behind the THREE-BUTTON navigation area.
        // That scrim would grey down the tab-bar green underneath, so it is
        // switched off and the app supplies the contrast surface itself (the
        // protection view below). Gesture navigation enforces no scrim and is
        // unaffected. API 29+; on 24–28 the navigation bar simply stays
        // opaque, which degrades gracefully.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        installNavigationBarProtection();

        // System bars stay VISIBLE — no immersive mode, no hiding; hikers
        // need the clock and the battery. Per-bar icon contrast is set from
        // the web layer (src/runtime/platform.ts): light icons on the spruce
        // status band, dark icons on the light navigation surface.
    }

    /**
     * One opaque band, the exact tab-bar colour, behind the THREE-BUTTON
     * navigation buttons.
     *
     * Why it exists: the web tab bar extending behind the navigation inset is
     * the preferred and primary mechanism — and on WebViews that receive the
     * real insets it is the one at work. But on devices where Capacitor pads
     * the WebView's parent instead of passing insets through, the web layer
     * physically ends above the system buttons, and whatever the WINDOW shows
     * fills the band. The Samsung test showed the result: the launch colour
     * (#dce4d8) behind the buttons against the tab bar's #d4ded1 above them —
     * a visible seam between two greens. This view pins the band to the
     * canonical tab-bar colour on both inset paths; when the web tab bar does
     * reach the edge the two surfaces are identical, so it changes nothing.
     *
     * Sizing is MEASURED, never a fixed dp value: the height is the
     * navigation-bar inset the platform reports for this device, refreshed on
     * every inset change (rotation, navigation-mode switch). Three-button
     * mode is recognised the standard way — its bar claims a TAPPABLE bottom
     * inset, while the gesture pill area does not — so in gesture navigation
     * the height is zero and the app's own surface continues to own the
     * pill area. The view is dead to input and accessibility; the system
     * buttons live in the system-bar window above it.
     */
    private void installNavigationBarProtection() {
        View protection = new View(this);
        protection.setBackgroundColor(ContextCompat.getColor(this, R.color.fjallkompisTabbar));
        protection.setClickable(false);
        protection.setFocusable(false);
        protection.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            Gravity.BOTTOM
        );
        // A sibling of the bridge layout inside android.R.id.content — NOT a
        // child of the WebView's parent, which is the view Capacitor pads.
        addContentView(protection, params);

        ViewCompat.setOnApplyWindowInsetsListener(protection, (view, insets) -> {
            int tappableBottom = insets.getInsets(WindowInsetsCompat.Type.tappableElement()).bottom;
            int navigationBottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
            int height = tappableBottom > 0 ? navigationBottom : 0;
            ViewGroup.LayoutParams layoutParams = view.getLayoutParams();
            if (layoutParams.height != height) {
                layoutParams.height = height;
                view.setLayoutParams(layoutParams);
            }
            // Not consumed: sibling views (the bridge layout above all) must
            // keep receiving the same insets.
            return insets;
        });
        ViewCompat.requestApplyInsets(protection);
    }
}
