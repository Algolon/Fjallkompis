package com.algolon.fjallkompis;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The map-archive download boundary, exercised rather than asserted about.
 *
 * `MapArchivePlugin.download()` takes a URL from JavaScript and opens it in
 * native code, outside the WebView's origin, CORS and mixed-content rules. If
 * that URL is unconstrained the plugin is a general-purpose HTTPS GET engine
 * for anything that can run script in the page — a capability worth more than
 * the map archives it exists to fetch. These are the negative cases that must
 * fail BEFORE a socket is opened.
 *
 * A host-side JUnit test (`./gradlew testDebugUnitTest`), which is the reason
 * MapArchiveUrlPolicy has no Android or Capacitor imports: the policy can be
 * run, not merely grepped for.
 */
public class MapArchiveUrlPolicyTest {

    private static final String OK =
        "https://github.com/Algolon/Fjallkompis/releases/download/terrain-data-v3/kungsleden-terrain.pmtiles";

    // --- the one thing that is allowed --------------------------------------

    @Test
    public void acceptsACanonicalReleaseAsset() {
        assertTrue(MapArchiveUrlPolicy.isAllowedDownloadUrl(OK));
        assertTrue(
            MapArchiveUrlPolicy.isAllowedDownloadUrl(
                "https://github.com/Algolon/Fjallkompis/releases/download/satellite-data-v3/kungsleden-satellite.pmtiles"
            )
        );
    }

    // --- transport ----------------------------------------------------------

    @Test
    public void rejectsPlaintextHttp() {
        assertFalse(
            MapArchiveUrlPolicy.isAllowedDownloadUrl(
                "http://github.com/Algolon/Fjallkompis/releases/download/terrain-data-v3/kungsleden-terrain.pmtiles"
            )
        );
    }

    @Test
    public void rejectsNonHttpSchemes() {
        for (String url : new String[] {
            "file:///data/data/com.algolon.fjallkompis/files/secret",
            "content://com.android.providers.media.documents/document/1",
            "ftp://github.com/Algolon/Fjallkompis/releases/download/x/y.pmtiles",
            "javascript:alert(1)",
            "data:application/octet-stream;base64,AAAA",
        }) {
            assertFalse(url, MapArchiveUrlPolicy.isAllowedDownloadUrl(url));
        }
    }

    @Test
    public void rejectsANonDefaultPort() {
        assertFalse(
            MapArchiveUrlPolicy.isAllowedDownloadUrl(
                "https://github.com:8443/Algolon/Fjallkompis/releases/download/t/x.pmtiles"
            )
        );
    }

    // --- local and private network -----------------------------------------

    @Test
    public void rejectsLoopbackAndLan() {
        for (String url : new String[] {
            "https://localhost/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
            "https://127.0.0.1/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
            "https://[::1]/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
            "https://10.0.2.2/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
            "https://192.168.1.10/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
            "https://172.16.0.5/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
            "https://169.254.169.254/latest/meta-data/",
            "https://router.local/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
        }) {
            assertFalse(url, MapArchiveUrlPolicy.isAllowedDownloadUrl(url));
        }
    }

    // --- foreign and lookalike hosts ---------------------------------------

    @Test
    public void rejectsForeignHosts() {
        for (String url : new String[] {
            "https://example.test/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
            "https://raw.githubusercontent.com/Algolon/Fjallkompis/main/secret",
            "https://api.github.com/repos/Algolon/Fjallkompis",
        }) {
            assertFalse(url, MapArchiveUrlPolicy.isAllowedDownloadUrl(url));
        }
    }

    @Test
    public void rejectsHostsThatMerelyStartWithTheAllowedPrefix() {
        // The reason the check parses the URL instead of comparing strings:
        // every one of these has the allowed prefix as a string prefix.
        for (String url : new String[] {
            "https://github.com.evil.test/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
            "https://github.competitor.test/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
        }) {
            assertFalse(url, MapArchiveUrlPolicy.isAllowedDownloadUrl(url));
        }
    }

    @Test
    public void rejectsCredentialsInTheAuthority() {
        // Reads as github.com to a human; the HOST is attacker.test.
        assertFalse(
            MapArchiveUrlPolicy.isAllowedDownloadUrl(
                "https://github.com@attacker.test/Algolon/Fjallkompis/releases/download/t/x.pmtiles"
            )
        );
    }

    // --- wrong place on the right host -------------------------------------

    @Test
    public void rejectsAnotherPathOnGithub() {
        for (String url : new String[] {
            "https://github.com/Algolon/Fjallkompis",
            "https://github.com/Algolon/Fjallkompis/archive/refs/heads/main.zip",
            "https://github.com/someone-else/other-repo/releases/download/v1/payload.bin",
            "https://github.com/login/oauth/authorize",
        }) {
            assertFalse(url, MapArchiveUrlPolicy.isAllowedDownloadUrl(url));
        }
    }

    @Test
    public void rejectsTraversalOutOfTheReleasePath() {
        assertFalse(
            MapArchiveUrlPolicy.isAllowedDownloadUrl(
                "https://github.com/Algolon/Fjallkompis/releases/download/../../../login/oauth/authorize"
            )
        );
    }

    // --- malformed ----------------------------------------------------------

    @Test
    public void rejectsMalformedAndRelativeInput() {
        for (String url : new String[] {
            null,
            "",
            "   ",
            "/Algolon/Fjallkompis/releases/download/t/x.pmtiles",
            "not a url at all",
            "https://",
        }) {
            assertFalse(String.valueOf(url), MapArchiveUrlPolicy.isAllowedDownloadUrl(url));
        }
    }

    // --- redirects ----------------------------------------------------------

    @Test
    public void allowsTheGithubAssetCdnOnRedirect() {
        // GitHub answers a release download with a redirect to its CDN, so the
        // download cannot work without following at least one hop.
        assertTrue(
            MapArchiveUrlPolicy.isAllowedRedirect(
                "https://objects.githubusercontent.com/github-production-release-asset/1/2?token=abc"
            )
        );
        assertTrue(
            MapArchiveUrlPolicy.isAllowedRedirect(
                "https://release-assets.githubusercontent.com/releases/assets/9"
            )
        );
        assertTrue(MapArchiveUrlPolicy.isAllowedRedirect(OK));
    }

    @Test
    public void refusesToBeRedirectedOffTheAllowedHosts() {
        // Following redirects blindly would hand back the arbitrary-GET
        // capability the entry check removes — one hop later, and invisibly.
        for (String url : new String[] {
            "https://attacker.test/payload.bin",
            "http://objects.githubusercontent.com/asset",
            "https://evilgithubusercontent.com/asset",
            "https://githubusercontent.com.evil.test/asset",
            "https://127.0.0.1/asset",
            "https://localhost:8080/asset",
            "file:///etc/hosts",
        }) {
            assertFalse(url, MapArchiveUrlPolicy.isAllowedRedirect(url));
        }
    }

    @Test
    public void resolvesRelativeAndAbsoluteLocationHeaders() {
        assertEquals(
            "https://github.com/Algolon/Fjallkompis/releases/download/terrain-data-v3/other.pmtiles",
            MapArchiveUrlPolicy.resolveRedirect(OK, "other.pmtiles")
        );
        assertEquals(
            "https://objects.githubusercontent.com/a",
            MapArchiveUrlPolicy.resolveRedirect(OK, "https://objects.githubusercontent.com/a")
        );
        assertNull(MapArchiveUrlPolicy.resolveRedirect(OK, null));
        assertNull(MapArchiveUrlPolicy.resolveRedirect(OK, ""));
    }

    @Test
    public void aProtocolRelativeLocationChangesTheHost_andIsCaught() {
        // The reason every hop is re-checked rather than only the first: a
        // "relative" Location is not necessarily relative. `//host/path` keeps
        // the scheme and REPLACES the authority, so a redirect that looks like
        // a path change lands on another server entirely.
        String resolved = MapArchiveUrlPolicy.resolveRedirect(OK, "//attacker.test/x");
        assertEquals("https://attacker.test/x", resolved);
        assertFalse(resolved, MapArchiveUrlPolicy.isAllowedRedirect(resolved));
    }

    @Test
    public void aTraversingLocationIsRefusedRatherThanFollowed() {
        // java.net.URI keeps leading `..` segments rather than collapsing them
        // past the root, so the resolved URL still carries them and the hop is
        // refused. Pinned because the alternative — a server-side collapse we
        // do not perform — would put us somewhere we did not intend.
        String resolved = MapArchiveUrlPolicy.resolveRedirect(OK, "/../../attack");
        assertEquals("https://github.com/../../attack", resolved);
        assertFalse(resolved, MapArchiveUrlPolicy.isAllowedRedirect(resolved));
    }

    @Test
    public void anOrdinaryRelativeLocationStaysOnTheSameHost() {
        String resolved = MapArchiveUrlPolicy.resolveRedirect(OK, "/other");
        assertEquals("https://github.com/other", resolved);
        assertTrue(resolved, MapArchiveUrlPolicy.isAllowedRedirect(resolved));
    }

    @Test
    public void theRedirectBudgetIsBoundedAndSmall() {
        assertTrue(MapArchiveUrlPolicy.MAX_REDIRECTS > 0);
        assertTrue(MapArchiveUrlPolicy.MAX_REDIRECTS <= 10);
    }
}
