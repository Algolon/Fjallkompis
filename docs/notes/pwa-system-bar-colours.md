# PWA system bar colours

Fjällkompis deliberately uses two different surfaces:

- installed-PWA theme/status chrome: spruce `#2f4a3d`;
- in-app compact tab bar: light green `#d4ded1`.

In Android Chrome browser mode, the browser can expose the document canvas
behind the lower system-navigation area. The root `html` canvas therefore uses
the tab bar's opaque `#d4ded1` token, so that browser-mode edge-to-edge band
visually joins the in-app tab bar instead of showing the slightly different
stone page background.

The Web App Manifest exposes a single `theme_color` and does not provide a
separate Android navigation-bar colour. On the tested Samsung/Android installed
PWA, changing `theme_color` recoloured the top status bar but left the bottom
three-button navigation area black. That standalone bottom area is therefore
controlled by the browser/OS rather than by the app's CSS or manifest on this
device; matching the browser document canvas does not imply control over it.

Do not lighten `theme_color` merely to try to recolour the standalone bottom
system bar: that changes the visible top status bar and weakens the established
brand chrome without reliably affecting the bottom bar.
