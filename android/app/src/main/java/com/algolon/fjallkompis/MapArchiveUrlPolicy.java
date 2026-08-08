package com.algolon.fjallkompis;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/**
 * What the map-archive downloader is allowed to connect to.
 *
 * WHY THIS IS A SEPARATE, DEPENDENCY-FREE CLASS. The bridge is a security
 * boundary: JavaScript hands `MapArchivePlugin.download()` a URL and native code
 * opens it. Without a constraint that plugin is a general-purpose HTTPS GET
 * engine that runs OUTSIDE the WebView — no origin, no CORS, no mixed-content
 * rule — reachable by anything that can execute script in the page. That is a
 * capability worth far more to an attacker than the map archives it exists to
 * fetch. So the policy lives here, in plain Java with no Android and no
 * Capacitor imports, which is also what lets
 * `MapArchiveUrlPolicyTest` exercise it as an ordinary JVM unit test rather
 * than as an unverified comment.
 *
 * WHY THE POLICY IS NATIVE-SIDE AND HARDCODED. It deliberately is NOT passed in
 * from JavaScript: a constraint the caller supplies is not a constraint. And it
 * deliberately does not duplicate any archive IDENTITY — no filename, revision,
 * size or digest appears here. What it pins is the release ORIGIN, which is the
 * security policy itself rather than catalog data. `tests/map-parity.test.mjs`
 * asserts this prefix still agrees with what `mapAssetReleaseUrl()` produces
 * from src/map/mapCatalog.mjs, so the two cannot drift apart in silence.
 *
 * WHAT IS STILL TRUSTED. The bytes themselves are not: `MapArchivePlugin`
 * verifies the length and the SHA-256 the catalog declares before anything is
 * kept. This class only decides where a connection may be made.
 */
final class MapArchiveUrlPolicy {

    /**
     * The one location an archive download may start from — the project's own
     * GitHub Release downloads. Anything else is refused before a socket is
     * opened.
     */
    static final String RELEASE_DOWNLOAD_PREFIX =
        "https://github.com/Algolon/Fjallkompis/releases/download/";

    /**
     * Hosts a redirect may land on. GitHub answers a release download with a
     * redirect to its asset CDN, so following redirects is required — but
     * following them ANYWHERE would hand back the arbitrary-GET capability the
     * prefix check just removed, one hop later. Matched as a whole host or as a
     * dot-prefixed suffix, so `evilgithubusercontent.com` cannot pass.
     */
    private static final String[] ALLOWED_HOSTS = {
        "github.com",
        "githubusercontent.com",
    };

    /** Redirect chains are short in practice; this only bounds a hostile one. */
    static final int MAX_REDIRECTS = 5;

    private MapArchiveUrlPolicy() {}

    /**
     * Is this a URL the downloader may START from?
     *
     * The prefix already implies HTTPS and the host, but each condition is
     * checked on the PARSED url rather than on the string: `https://github.com`
     * is a legal prefix of `https://github.com.evil.test/…`, and a string-only
     * check would wave that through.
     */
    static boolean isAllowedDownloadUrl(String url) {
        URI uri = parse(url);
        if (uri == null) return false;
        if (!isSafeHop(uri)) return false;
        if (!"github.com".equals(host(uri))) return false;
        String normalised = "https://" + host(uri) + uri.getRawPath();
        return normalised.startsWith(RELEASE_DOWNLOAD_PREFIX);
    }

    /**
     * Is this a URL a redirect may send us to? Same transport and host rules as
     * the entry point, minus the path prefix — the CDN's paths are opaque and
     * not ours to predict.
     */
    static boolean isAllowedRedirect(String url) {
        URI uri = parse(url);
        return uri != null && isSafeHop(uri) && isAllowedHost(host(uri));
    }

    /** Resolve a `Location` header, which may be relative, against its source. */
    static String resolveRedirect(String currentUrl, String location) {
        if (location == null || location.isEmpty()) return null;
        try {
            return new URI(currentUrl).resolve(location).toString();
        } catch (URISyntaxException | IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * The transport rules every hop must satisfy, whatever else is true of it.
     *
     * `https` is required outright — the archives are public, but a plaintext
     * hop is one an on-path attacker can redirect, and the digest check is a
     * poor substitute for not talking to them. Credentials in the authority are
     * refused because `https://github.com@attacker.test/` has a HOST of
     * `attacker.test` while reading, to a human, as GitHub. A non-default port
     * is refused because nothing legitimate here uses one.
     *
     * Note what this makes unnecessary: with an exact host allow-list, loopback
     * (`localhost`, `127.0.0.1`, `[::1]`), LAN addresses and every other host
     * are already unreachable — they simply are not on the list. They are named
     * in the tests anyway, because "it happens to be excluded" and "it is
     * excluded on purpose" should not be indistinguishable to the next reader.
     */
    private static boolean isSafeHop(URI uri) {
        if (!"https".equals(scheme(uri))) return false;
        if (uri.getRawUserInfo() != null) return false;
        if (uri.getPort() != -1 && uri.getPort() != 443) return false;
        String host = host(uri);
        if (host == null || host.isEmpty()) return false;
        String path = uri.getRawPath();
        // A traversal segment cannot climb out of the prefix on a real server,
        // but it can make two strings that look different address one thing.
        return path != null && !path.contains("..");
    }

    private static boolean isAllowedHost(String host) {
        if (host == null) return false;
        for (String allowed : ALLOWED_HOSTS) {
            if (host.equals(allowed) || host.endsWith("." + allowed)) return true;
        }
        return false;
    }

    private static URI parse(String url) {
        if (url == null) return null;
        try {
            URI uri = new URI(url);
            return uri.isAbsolute() ? uri : null;
        } catch (URISyntaxException | IllegalArgumentException e) {
            return null;
        }
    }

    private static String scheme(URI uri) {
        return uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT);
    }

    private static String host(URI uri) {
        return uri.getHost() == null ? null : uri.getHost().toLowerCase(Locale.ROOT);
    }
}
