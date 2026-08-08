package com.algolon.fjallkompis;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Save one generated file where the USER chooses — the native half of the
 * app's file-save boundary (src/runtime/fileSave.ts is the only caller;
 * every generated-file export in the app goes through it: the complete
 * backup, the lightweight JSON export and the Day plan recovery copy).
 * This plugin is content-agnostic — it knows a file name, a MIME type and
 * a stream of bytes, never what they mean.
 *
 * WHY THIS EXISTS. The web export path is an `<a download>` on a blob: URL,
 * which the Android WebView does not turn into a download — Capacitor
 * installs no DownloadListener and blob: has no out-of-process meaning, so
 * the tap simply does nothing in the wrapper. The correct native flow for
 * "save this file the user can find again" is the Storage Access Framework:
 * ACTION_CREATE_DOCUMENT lets the user pick location and filename in the
 * system picker, needs NO storage permission on any supported Android
 * version, and hands back a writable content Uri.
 *
 * WHY CHUNKED. A complete backup can be tens of megabytes (wallet PDFs cap
 * at 20 MB each). Capacitor bridge messages are strings, so the bytes cross
 * as base64 — fine per call, hostile as ONE call. begin/writeChunk/finish
 * keeps every bridge message small and the memory profile flat; the stream
 * stays open between calls on this plugin instance (Capacitor keeps one
 * instance per bridge).
 *
 * FAILURE SHAPE. A dismissed picker rejects `begin` with code USER_CANCELLED
 * (a normal outcome, not an error); any write/close failure rejects the call
 * AND best-effort deletes the half-written document so the user is never
 * left holding a truncated file that looks like a backup.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    private OutputStream output;
    private Uri targetUri;

    @PluginMethod
    public void begin(PluginCall call) {
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (fileName == null || fileName.isEmpty()) {
            call.reject("fileName is required");
            return;
        }
        discardTarget(false);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(call, intent, "onDocumentPicked");
    }

    @ActivityCallback
    private void onDocumentPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            call.reject("The save dialog was dismissed", "USER_CANCELLED");
            return;
        }
        try {
            targetUri = data.getData();
            // "wt": write + truncate — replacing an existing file must not
            // leave a longer previous version's tail bytes behind it.
            output = getContext().getContentResolver().openOutputStream(targetUri, "wt");
            if (output == null) throw new IOException("content resolver returned no stream");
            call.resolve();
        } catch (Exception e) {
            discardTarget(true);
            call.reject("Could not open the chosen location: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeChunk(PluginCall call) {
        String base64 = call.getString("data");
        if (output == null) {
            call.reject("No save in progress");
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
            discardTarget(true);
            call.reject("Writing the file failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void finish(PluginCall call) {
        if (output == null) {
            call.reject("No save in progress");
            return;
        }
        try {
            output.flush();
            output.close();
            output = null;
            targetUri = null;
            call.resolve();
        } catch (IOException e) {
            discardTarget(true);
            call.reject("Finishing the file failed: " + e.getMessage());
        }
    }

    /** Cancel an in-progress save (JS error path). Always resolves. */
    @PluginMethod
    public void abort(PluginCall call) {
        discardTarget(true);
        call.resolve();
    }

    /** Close the stream; optionally delete the half-written document. */
    private void discardTarget(boolean deleteDocument) {
        if (output != null) {
            try {
                output.close();
            } catch (IOException ignored) {
                // Already unusable; deletion below is the real cleanup.
            }
            output = null;
        }
        if (targetUri != null) {
            if (deleteDocument) {
                try {
                    DocumentsContract.deleteDocument(getContext().getContentResolver(), targetUri);
                } catch (Exception ignored) {
                    // Best effort — a leftover partial file is unfortunate but
                    // the JS side has already reported the failure honestly.
                }
            }
            targetUri = null;
        }
    }
}
