package com.algolon.fjallkompis;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Hand one locally stored document to an installed viewer app — the native
 * half of the app's file-VIEW boundary (src/runtime/fileView.ts is the only
 * caller; the Trail Wallet's PDF opening goes through it). Like its sibling
 * SaveFilePlugin, this plugin is content-agnostic: a file name, a MIME type
 * and a stream of bytes, never what they mean.
 *
 * WHY THIS EXISTS. The WebView cannot present a PDF: it has no PDF renderer,
 * and `window.open` on a blob: URL is worse than useless there — current
 * Chromium WebViews return a real WindowProxy and then silently drop the
 * navigation (emulator-verified on Chrome 133: Page.windowOpen fires,
 * a same-tab navigation to the blob URL starts and stops, and nothing is
 * shown). The correct native flow for "show this document" is ACTION_VIEW on
 * a content URI: the bytes are staged into an app-PRIVATE cache file, exposed
 * to exactly one viewer through the existing FileProvider with a temporary
 * read grant, and the platform picks the viewer. Fully offline, no storage
 * permission, no raw filesystem path ever leaves the app.
 *
 * WHY CHUNKED. Wallet PDFs cap at 20 MB; bridge messages are strings, so the
 * bytes cross as base64 in ~1.3 MB messages exactly as SaveFilePlugin does.
 *
 * LIFECYCLE. One staged document at a time: `begin` clears the staging
 * directory, so the previous document's copy lives only until the next open
 * (and the system may clear the cache dir whenever it wants — the authoritative
 * bytes stay in the Wallet's IndexedDB, this file is a disposable projection).
 * The staged file must SURVIVE a successful hand-off — the viewer app reads
 * it through the content URI while this activity is paused.
 *
 * FAILURE SHAPE. No installed viewer rejects `view` with code NO_VIEWER (a
 * device state, not an error — the JS side falls back to the SAF save path);
 * any staging/write failure rejects the call and deletes the partial file.
 */
@CapacitorPlugin(name = "ViewFile")
public class ViewFilePlugin extends Plugin {

    static final String STAGING_DIR = "shared-documents";

    private OutputStream output;
    private File target;
    private String mimeType;

    @PluginMethod
    public void begin(PluginCall call) {
        String fileName = call.getString("fileName");
        String mime = call.getString("mimeType", "application/octet-stream");
        if (fileName == null || fileName.isEmpty()) {
            call.reject("fileName is required");
            return;
        }
        discardTarget();
        try {
            File dir = new File(getContext().getCacheDir(), STAGING_DIR);
            if (!dir.isDirectory() && !dir.mkdirs()) {
                throw new IOException("could not create the staging directory");
            }
            File[] stale = dir.listFiles();
            if (stale != null) {
                for (File f : stale) {
                    //noinspection ResultOfMethodCallIgnored — best effort; a
                    // survivor is overwritten or cleared on the next begin.
                    f.delete();
                }
            }
            target = new File(dir, SharedDocumentName.sanitize(fileName));
            output = new FileOutputStream(target);
            mimeType = mime;
            call.resolve();
        } catch (Exception e) {
            discardTarget();
            call.reject("Could not stage the document: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        String base64 = call.getString("data");
        if (output == null) {
            call.reject("No document staging in progress");
            return;
        }
        if (base64 == null) {
            call.reject("data is required");
            return;
        }
        try {
            output.write(Base64.decode(base64, Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            discardTarget();
            call.reject("Writing the staged document failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void view(PluginCall call) {
        if (output == null || target == null) {
            call.reject("No document staged");
            return;
        }
        try {
            output.flush();
            output.close();
            output = null;
        } catch (IOException e) {
            discardTarget();
            call.reject("Finishing the staged document failed: " + e.getMessage());
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                target
            );
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType);
            // A temporary read grant on exactly this URI for whichever viewer
            // resolves — never a permission, never a raw path.
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(intent);
            // The viewer owns the moment now; the staged copy stays behind
            // for it and is reclaimed on the next begin().
            target = null;
            mimeType = null;
            call.resolve();
        } catch (ActivityNotFoundException e) {
            discardTarget();
            call.reject("No installed app can display this document", "NO_VIEWER");
        } catch (Exception e) {
            discardTarget();
            call.reject("Could not hand the document to a viewer: " + e.getMessage());
        }
    }

    /** Cancel an in-progress staging (JS error path). Always resolves. */
    @PluginMethod
    public void abort(PluginCall call) {
        discardTarget();
        call.resolve();
    }

    /** Close the stream and delete the staged file (when one is still ours). */
    private void discardTarget() {
        if (output != null) {
            try {
                output.close();
            } catch (IOException ignored) {
                // Already unusable; deletion below is the real cleanup.
            }
            output = null;
        }
        if (target != null) {
            //noinspection ResultOfMethodCallIgnored — best effort; begin()
            // clears the whole staging directory anyway.
            target.delete();
            target = null;
        }
        mimeType = null;
    }
}
