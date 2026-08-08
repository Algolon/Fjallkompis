package com.algolon.fjallkompis;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Optional offline map archives on Android: download, verify, store, read,
 * remove. The native half of src/map/nativeArchiveStore.ts, which is the only
 * caller.
 *
 * WHY A NATIVE STORE AT ALL. The PWA keeps its archives in Cache Storage, and
 * the Capacitor WebView has Cache Storage too, so the obvious move is to reuse
 * it. Two measured facts rule that out:
 *
 *  1. Cache Storage is quota-managed, best-effort storage. `storage.persist()`
 *     is not a guarantee in a WebView, and ~90 MB of map data is exactly what
 *     an eviction sweep reclaims. Losing the satellite archive is an
 *     inconvenience in a browser; on day four of a hut-to-hut trail with no
 *     signal it is the failure this app exists to prevent.
 *  2. The alternative of writing a file and pointing PMTiles at
 *     `Capacitor.convertFileSrc()` walks straight back into the versionCode
 *     2700001 blank-basemap defect. Capacitor's WebViewLocalServer serves
 *     `/_capacitor_file_/…` through the same `handleLocalRequest` whose range
 *     branch builds a `206` + `Content-Range` around a stream it never seeks
 *     and never truncates (still true in @capacitor/android 8.5.0). Every
 *     ranged read returns the remainder of the file and PMTiles dies parsing
 *     it. See src/map/bundledArchive.mjs for the measurements.
 *
 * So: real files in app-private internal storage, read through an explicit
 * `readRange` bridge method that owes nothing to HTTP semantics.
 *
 * STORAGE. `filesDir/map-archives/`. Internal, app-private, no permission of
 * any kind, invisible to other apps, survives restarts and process death, not
 * reachable by the WebView quota manager, and removed with the app. Nothing
 * here ever touches shared or external storage.
 *
 * MEMORY. The archive is never held in memory — not once, let alone the
 * "multiple times" a naive download does. Bytes stream from the socket to the
 * file through a 64 KB buffer while a SHA-256 digest is updated in the same
 * pass, and reads hand back only the slice PMTiles asked for. The file never
 * crosses the bridge whole.
 *
 * FAIL CLOSED. A download writes `<id>.part`. Nothing ever opens a `.part`
 * file. Only after the stream completes AND the byte count AND the SHA-256
 * both match the values the catalog declared is it renamed to `<id>.pmtiles`
 * and given a `<id>.json` sidecar recording the revision. An interrupted,
 * cancelled, truncated or tampered download therefore cannot become a readable
 * archive by any path — including a process kill mid-write, which leaves only
 * a `.part` file that the next download overwrites.
 *
 * IDENTITY. This class knows no archive names, no URLs, no sizes and no
 * hashes. Every one of those comes from src/map/mapCatalog.mjs by way of the
 * call arguments, so the native side cannot drift from the catalog the PWA and
 * the deployment pipeline read.
 */
@CapacitorPlugin(name = "MapArchive")
public class MapArchivePlugin extends Plugin {

    private static final String DIR = "map-archives";
    private static final int BUFFER_BYTES = 64 * 1024;
    /** Progress is UI feedback, not telemetry — one event per ~512 kB is plenty. */
    private static final long PROGRESS_STEP_BYTES = 512 * 1024;
    /** Refuse absurd reads outright; PMTiles asks for kilobytes at a time. */
    private static final int MAX_READ_BYTES = 8 * 1024 * 1024;

    /**
     * Downloads run off the bridge's plugin thread, so a 60 MB fetch cannot
     * block `readRange` (or any other plugin call) for minutes. Single-threaded
     * on purpose: two archives downloading at once would halve each one's
     * throughput and double the disk pressure for no user benefit — the Terrain
     * relief card already downloads its two files in sequence.
     */
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();

    /** Cancellation flags by asset id, set by cancel() and polled by the loop. */
    private final Map<String, AtomicBoolean> cancellations = new ConcurrentHashMap<>();

    /**
     * Read a numeric argument, whatever JSON type it arrived as.
     *
     * NOT `call.getLong()`. That method returns its default unless the parsed
     * value is exactly a `java.lang.Long`, and JSON numbers that fit in an int
     * — which every one of ours does: 61 704 169 bytes, a PMTiles offset in a
     * sub-2 GB file — parse as `Integer`. Using it would have made
     * `expectedBytes` zero on every download (rejecting them all) and, far
     * worse, every `readRange` offset zero: silently the wrong bytes, on the
     * device only. Same trap in `getInt()` for the reverse case.
     */
    private static long numberArg(PluginCall call, String name, long fallback) {
        Object value = call.getData().opt(name);
        return value instanceof Number ? ((Number) value).longValue() : fallback;
    }

    // ---- storage layout -----------------------------------------------------

    private File archiveDir() {
        File dir = new File(getContext().getFilesDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    /**
     * Resolve an id to a filename, rejecting anything that is not a plain
     * lowercase token. The ids come from our own catalog, but a path separator
     * arriving here would be a directory traversal, and a store that can be
     * talked out of its own directory is not a store.
     */
    private String safeId(String id) {
        if (id == null || !id.matches("[a-z0-9-]{1,32}")) {
            throw new IllegalArgumentException("invalid archive id");
        }
        return id;
    }

    private File archiveFile(String id) {
        return new File(archiveDir(), safeId(id) + ".pmtiles");
    }

    private File partFile(String id) {
        return new File(archiveDir(), safeId(id) + ".part");
    }

    private File sidecarFile(String id) {
        return new File(archiveDir(), safeId(id) + ".json");
    }

    // ---- status -------------------------------------------------------------

    /**
     * What this device actually holds for one archive. The JS side classifies
     * it through the SAME pure decision table the PWA uses
     * (src/map/archiveRevision.mjs), so "downloaded", "update available" and
     * "needs repair" mean exactly one thing across both platforms.
     *
     * A `.part` file is deliberately invisible here: a half-download is not a
     * lesser archive, it is no archive.
     */
    @PluginMethod
    public void status(PluginCall call) {
        try {
            String id = safeId(call.getString("id"));
            File file = archiveFile(id);
            JSObject result = new JSObject();
            if (!file.isFile()) {
                result.put("present", false);
                result.put("bytes", 0);
                result.put("revisionId", (String) null);
                call.resolve(result);
                return;
            }
            result.put("present", true);
            result.put("bytes", file.length());
            result.put("revisionId", readSidecarRevision(id));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not read the stored map archive: " + e.getMessage());
        }
    }

    /** Total bytes the app is using for downloaded archives (Settings copy). */
    @PluginMethod
    public void usage(PluginCall call) {
        long total = 0;
        File[] files = archiveDir().listFiles();
        if (files != null) {
            for (File f : files) if (f.isFile()) total += f.length();
        }
        JSObject result = new JSObject();
        result.put("bytes", total);
        call.resolve(result);
    }

    // ---- download -----------------------------------------------------------

    /**
     * Fetch one archive from its canonical URL and store it, or leave the
     * device exactly as it was.
     *
     * The caller supplies the URL, the expected byte length and the expected
     * SHA-256 straight from the catalog. Both are enforced: the size catches a
     * truncated transfer early and cheaply, the digest catches anything else —
     * a corrupted body, a captive-portal HTML page served with a 200, a
     * re-uploaded release asset. The PWA can only afford the size check at
     * status time; here the hash costs nothing because the bytes are already
     * streaming through this method.
     */
    @PluginMethod
    public void download(PluginCall call) {
        final String id;
        try {
            id = safeId(call.getString("id"));
        } catch (Exception e) {
            call.reject("invalid archive id");
            return;
        }
        final String url = call.getString("url");
        final long expectedBytes = numberArg(call, "expectedBytes", 0L);
        final String expectedSha = call.getString("expectedSha256");
        final String revisionId = call.getString("revisionId");
        if (url == null || expectedBytes <= 0 || expectedSha == null || revisionId == null) {
            call.reject("url, expectedBytes, expectedSha256 and revisionId are required");
            return;
        }
        // THE BRIDGE IS A SECURITY BOUNDARY. Refused here, before any socket is
        // opened and before the work is handed to the executor: without this
        // check the plugin is a general-purpose HTTPS GET engine running
        // outside the WebView — no origin, no CORS, no mixed-content rule —
        // available to anything that can run script in the page. The policy is
        // native-side and hardcoded on purpose (MapArchiveUrlPolicy).
        if (!MapArchiveUrlPolicy.isAllowedDownloadUrl(url)) {
            call.reject("Refused: not a canonical map-archive URL", "URL_NOT_ALLOWED");
            return;
        }

        AtomicBoolean cancelled = new AtomicBoolean(false);
        cancellations.put(id, cancelled);
        downloads.execute(() -> {
            try {
                long bytes = runDownload(id, url, expectedBytes, expectedSha, revisionId, cancelled);
                JSObject result = new JSObject();
                result.put("bytes", bytes);
                call.resolve(result);
            } catch (CancelledException e) {
                call.reject("Download cancelled", "CANCELLED");
            } catch (VerificationException e) {
                // The bytes arrived but are not the archive we asked for.
                // "Check your connection" would be the wrong advice, so this
                // gets its own code and its message is shown as written.
                call.reject(e.getMessage(), "ARCHIVE_VERIFICATION_FAILED");
            } catch (Exception e) {
                call.reject("Map download failed: " + e.getMessage());
            } finally {
                cancellations.remove(id, cancelled);
            }
        });
    }

    /** Stop an in-flight download. Always resolves; a finished one is a no-op. */
    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            AtomicBoolean flag = cancellations.get(safeId(call.getString("id")));
            if (flag != null) flag.set(true);
            call.resolve();
        } catch (Exception e) {
            call.reject("invalid archive id");
        }
    }

    private long runDownload(
        String id,
        String url,
        long expectedBytes,
        String expectedSha,
        String revisionId,
        AtomicBoolean cancelled
    ) throws Exception {
        File part = partFile(id);
        // A leftover .part from a killed process is never resumed: a resume
        // would have to trust bytes nothing vouched for.
        if (part.exists() && !part.delete()) {
            throw new IOException("could not clear the previous partial download");
        }

        HttpURLConnection connection = openVerifiedConnection(url);

        long written = 0;
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try {
            // The status is already known to be 2xx — openVerifiedConnection
            // only returns a connection that reached one, through hops it
            // checked one at a time.
            long declared = connection.getContentLengthLong();
            long total = declared > 0 ? declared : expectedBytes;

            byte[] buffer = new byte[BUFFER_BYTES];
            long nextProgressAt = PROGRESS_STEP_BYTES;
            try (InputStream in = connection.getInputStream();
                 OutputStream out = Files.newOutputStream(part.toPath())) {
                for (;;) {
                    if (cancelled.get()) throw new CancelledException();
                    int read = in.read(buffer);
                    if (read < 0) break;
                    out.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    written += read;
                    if (written >= nextProgressAt) {
                        nextProgressAt = written + PROGRESS_STEP_BYTES;
                        emitProgress(id, written, total);
                    }
                }
                out.flush();
            }
            emitProgress(id, written, total);
        } finally {
            connection.disconnect();
        }

        // Verify BEFORE the file is given its real name. Everything below this
        // point is the commit; everything above it is disposable.
        if (written != expectedBytes) {
            discard(part);
            throw new VerificationException(
                "Map download did not match the expected archive (got " +
                written + " bytes, expected " + expectedBytes +
                "). Nothing was replaced — your existing offline map is untouched."
            );
        }
        String actualSha = hex(digest.digest());
        if (!actualSha.equalsIgnoreCase(expectedSha)) {
            discard(part);
            throw new VerificationException(
                "Map download did not match the expected archive (checksum mismatch). " +
                "Nothing was replaced — your existing offline map is untouched."
            );
        }

        // ATOMIC_MOVE within one directory on one filesystem: the archive
        // either has its old contents or its new ones, never a mixture, even
        // if the process dies during this call.
        Files.move(part.toPath(), archiveFile(id).toPath(),
            StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        writeSidecar(id, revisionId, written, actualSha);
        return written;
    }

    /**
     * Open the download, following redirects OURSELVES so every hop is checked.
     *
     * `setInstanceFollowRedirects(true)` would follow a redirect to any HTTPS
     * host on earth, which hands back the arbitrary-GET capability the entry
     * check just removed — one hop later and invisibly. GitHub does redirect a
     * release download to its asset CDN, so redirects must be followed; they
     * just may not be followed blindly. Each hop is re-validated against the
     * same host rules, and the chain is bounded.
     *
     * @throws IOException on a refused hop, an over-long chain, or a bad status
     */
    private HttpURLConnection openVerifiedConnection(String url) throws IOException {
        String target = url;
        for (int hop = 0; hop <= MapArchiveUrlPolicy.MAX_REDIRECTS; hop++) {
            HttpURLConnection connection = (HttpURLConnection) new URL(target).openConnection();
            // Off: this loop is the redirect handling.
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(30_000);
            connection.setReadTimeout(60_000);
            connection.setRequestProperty("Accept", "application/octet-stream");

            int code = connection.getResponseCode();
            if (code >= 200 && code <= 299) return connection;

            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String next = MapArchiveUrlPolicy.resolveRedirect(
                    target,
                    connection.getHeaderField("Location")
                );
                connection.disconnect();
                if (next == null || !MapArchiveUrlPolicy.isAllowedRedirect(next)) {
                    throw new IOException("refused redirect away from the map-archive host");
                }
                target = next;
                continue;
            }

            connection.disconnect();
            throw new IOException("HTTP " + code);
        }
        throw new IOException("too many redirects");
    }

    private void emitProgress(String id, long loaded, long total) {
        JSObject event = new JSObject();
        event.put("id", id);
        event.put("loaded", loaded);
        event.put("total", total);
        notifyListeners("mapArchiveProgress", event);
    }

    private void discard(File part) {
        // Best effort: the caller has already been told the download failed,
        // and the next attempt clears any leftover before it writes.
        //noinspection ResultOfMethodCallIgnored
        part.delete();
    }

    // ---- read ---------------------------------------------------------------

    /**
     * One slice of a stored archive, base64-encoded, for the PMTiles `Source`
     * in src/map/nativeArchiveStore.ts.
     *
     * This is the whole read path, and it is deliberately tiny. PMTiles asks
     * for a header, then directory pages, then one tile at a time — kilobytes
     * per call — so base64 across the bridge is the right size of cost here,
     * where handing the whole 60 MB file over as a string would not be. A read
     * past EOF returns the short tail rather than failing: that is what a
     * conforming range read does, and PMTiles relies on it.
     */
    @PluginMethod
    public void readRange(PluginCall call) {
        try {
            String id = safeId(call.getString("id"));
            long offset = numberArg(call, "offset", -1L);
            long length = numberArg(call, "length", 0L);
            if (offset < 0 || length <= 0 || length > MAX_READ_BYTES) {
                call.reject("invalid range");
                return;
            }
            File file = archiveFile(id);
            if (!file.isFile()) {
                call.reject("archive not stored", "ARCHIVE_ABSENT");
                return;
            }
            try (RandomAccessFile raf = new RandomAccessFile(file, "r")) {
                long available = raf.length() - offset;
                if (available <= 0) {
                    call.reject("range past end of archive");
                    return;
                }
                int want = (int) Math.min(length, available);
                byte[] data = new byte[want];
                raf.seek(offset);
                raf.readFully(data);
                JSObject result = new JSObject();
                result.put("data", Base64.encodeToString(data, Base64.NO_WRAP));
                call.resolve(result);
            }
        } catch (Exception e) {
            call.reject("Could not read the stored map archive: " + e.getMessage());
        }
    }

    // ---- remove -------------------------------------------------------------

    /**
     * Delete ONE archive and its sidecar. Scoped to the id it was given, so
     * removing the satellite imagery cannot touch terrain, contours or the
     * bundled basemap — which is not merely a nicety: the bundled vector
     * archive lives in the app package and is not in this directory at all, so
     * it is unreachable from here by construction.
     */
    @PluginMethod
    public void remove(PluginCall call) {
        try {
            String id = safeId(call.getString("id"));
            //noinspection ResultOfMethodCallIgnored
            archiveFile(id).delete();
            //noinspection ResultOfMethodCallIgnored
            sidecarFile(id).delete();
            //noinspection ResultOfMethodCallIgnored
            partFile(id).delete();
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not remove the stored map archive: " + e.getMessage());
        }
    }

    // ---- sidecar ------------------------------------------------------------

    /**
     * Which revision the stored bytes are. The byte length alone would almost
     * do, but "almost" is how an old archive ends up masquerading as current:
     * two revisions can coincide in size, and the JS classifier should be
     * comparing identities, not guessing from lengths.
     */
    private void writeSidecar(String id, String revisionId, long bytes, String sha256)
        throws IOException {
        JSObject meta = new JSObject();
        meta.put("revisionId", revisionId);
        meta.put("bytes", bytes);
        meta.put("sha256", sha256);
        Files.write(sidecarFile(id).toPath(), meta.toString().getBytes("UTF-8"));
    }

    /** The recorded revision id, or null when there is no readable sidecar. */
    private String readSidecarRevision(String id) {
        File sidecar = sidecarFile(id);
        if (!sidecar.isFile()) return null;
        try (InputStream in = new FileInputStream(sidecar)) {
            byte[] raw = new byte[(int) Math.min(sidecar.length(), 4096)];
            int read = in.read(raw);
            if (read <= 0) return null;
            JSObject meta = new JSObject(new String(raw, 0, read, "UTF-8"));
            return meta.getString("revisionId");
        } catch (Exception e) {
            // An unreadable sidecar means "unknown revision", which the JS
            // classifier already handles as not-current.
            return null;
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b));
        return out.toString();
    }

    /** Cancelled by the user — a normal outcome, not a failure. */
    private static class CancelledException extends RuntimeException {}

    /** The bytes arrived intact but are not the archive the catalog declared. */
    private static class VerificationException extends RuntimeException {
        VerificationException(String message) {
            super(message);
        }
    }
}
