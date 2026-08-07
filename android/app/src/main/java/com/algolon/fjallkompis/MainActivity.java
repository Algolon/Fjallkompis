package com.algolon.fjallkompis;

import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import java.util.concurrent.atomic.AtomicBoolean;

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

    /**
     * Upper bound on how long the splash may be held, for a genuine
     * initialisation FAILURE only — a bundle that never parses, a WebView
     * that never starts. It is not a branding duration and must never be
     * tuned to make the logo linger: on a working launch the web layer
     * signals in a few hundred milliseconds and this never fires. It is
     * deliberately far longer than any plausible cold start, so that a slow
     * device is never mistaken for a broken one.
     */
    private static final long BOOT_FAILSAFE_MS = 8000L;

    /** Flipped once by the web layer (BootPlugin) or by the fail-safe. */
    private final AtomicBoolean appReady = new AtomicBoolean(false);

    private Handler failSafeHandler;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // installSplashScreen() must be the FIRST statement, for two separate
        // reasons that both bite hard.
        //
        // 1. THE HANDOFF. It reads postSplashScreenTheme from the launch
        //    theme (styles.xml) and swaps the activity onto
        //    AppTheme.NoActionBar immediately — before anything can create
        //    the window's decor view. A window resolves its background
        //    drawable from whatever theme the activity wears when the decor
        //    is FIRST created, and keeps it. EdgeToEdge.enable() below
        //    touches the decor. An earlier revision ran it while the activity
        //    still wore the LAUNCH theme, so the decor froze the splash
        //    drawable — launch colour plus centred logo — as its permanent
        //    background, and BridgeActivity's later setTheme() could not undo
        //    it; on the Samsung that surfaced as a ~120 px logo strip above
        //    every screen.
        //
        // 2. THE RETURNED HANDLE is what lets us hold the splash below.
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);

        // THE SPLASH IS THE ONLY LAUNCH SURFACE. It stays up until the web
        // layer reports a painted, opaque first screen (BootPlugin →
        // markAppReady). There is deliberately no HTML boot veil any more: a
        // second logo drawn INSIDE the WebView can never line up with this
        // one, because the splash is drawn in the full window while the
        // WebView is inset by the navigation bar on devices that pad it —
        // the two logos sat in different coordinate spaces and the mark
        // visibly jumped at the handoff. One surface cannot disagree with
        // itself.
        //
        // The condition is polled on the UI thread's pre-draw pass, so this
        // is readiness-driven, not timed: nothing here waits on a clock, and
        // there is no minimum duration. The only timer in the sequence is the
        // failure fail-safe scheduled at the end of onCreate.
        splashScreen.setKeepOnScreenCondition(() -> !appReady.get());

        // Edge-to-edge, before super.onCreate() lays out the bridge. Android
        // 15+ (API 35+) enforces this for targetSdk 35+, but minSdk is 24 and
        // on Android 7–14 nothing enables it automatically — without it the
        // WebView is letterboxed and the tab-bar surface can never reach the
        // physical screen edge. EdgeToEdge.enable() is the supported AndroidX
        // entry point and a no-op where the platform already applied it; the
        // deprecated statusBarColor/navigationBarColor properties are
        // deliberately not used (no-ops for targetSdk 35+ anyway).
        EdgeToEdge.enable(this);

        // MUST precede super.onCreate(): that is where BridgeActivity builds
        // the bridge and starts loading the WebView, and only plugins already
        // in bridgeBuilder are present for that first load. Registering the
        // boot bridge afterwards would race the page it exists to serve.
        registerPlugin(BootPlugin.class);

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

        // Installed BEFORE the splash can possibly be released — the splash
        // is still held at this point, and only markAppReady() (or the
        // fail-safe) lets it go. So by the moment the app is revealed, the
        // band behind the three-button navigation is already wearing its
        // final #d4ded1 surface at its measured height: the geometry and
        // colour the user ends up with are the ones already in place, never a
        // post-splash correction.
        installNavigationBarProtection();

        // FAILURE fail-safe, not a branding timer. If the web layer never
        // reports readiness — a bundle that fails to parse, a WebView that
        // never starts — the splash would otherwise be held forever and the
        // app would look hung. This releases it so the user at least reaches
        // whatever state the WebView is in. A healthy launch signals in a few
        // hundred milliseconds and cancels this long before it fires.
        failSafeHandler = new Handler(Looper.getMainLooper());
        failSafeHandler.postDelayed(this::markAppReady, BOOT_FAILSAFE_MS);

        // System bars stay VISIBLE — no immersive mode, no hiding, and none
        // of it is sequenced against startup: three-button navigation is
        // there from the first native frame and simply stays. Hikers need the
        // clock and the battery. Per-bar icon contrast is set from the web
        // layer (src/runtime/platform.ts): light icons on the spruce status
        // band, dark icons on the light navigation surface.
    }

    /**
     * Release the splash: the app underneath is painted and opaque.
     *
     * Called by BootPlugin when the web layer reports its first usable frame,
     * and by the fail-safe if that never arrives. Idempotent — the pre-draw
     * condition simply stops holding the splash the next time it is read, and
     * the platform runs its own exit animation from there. Nothing here draws
     * or fades anything itself, so there is exactly one launch surface and
     * exactly one exit.
     */
    void markAppReady() {
        if (!appReady.compareAndSet(false, true)) return;
        cancelFailSafe();
    }

    private void cancelFailSafe() {
        if (failSafeHandler == null) return;
        failSafeHandler.removeCallbacksAndMessages(null);
        failSafeHandler = null;
    }

    @Override
    public void onDestroy() {
        cancelFailSafe();
        super.onDestroy();
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
