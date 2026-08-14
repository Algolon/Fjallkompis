package com.algolon.fjallkompis;

/**
 * Filename policy for documents staged into the app-private viewer cache
 * (ViewFilePlugin). Deliberately free of Android imports so plain JUnit can
 * exercise it (SharedDocumentNameTest).
 *
 * The requested name comes from the web layer (the name the user attached in
 * the Wallet), so it is treated as UNTRUSTED for filesystem purposes: path
 * separators and traversal cannot survive, and the result is always a plain
 * file name inside the staging directory. The extension is preserved where
 * possible because some viewer apps still glance at it even though the
 * ACTION_VIEW intent carries the authoritative MIME type.
 */
final class SharedDocumentName {

    /** Staged names never exceed this — some filesystems cap at 255 bytes. */
    private static final int MAX_LENGTH = 128;

    private SharedDocumentName() {}

    static String sanitize(String requested) {
        String name = requested == null ? "" : requested.trim();
        // A file NAME, never a location: drop everything up to the last
        // separator (either flavour), which also kills any "../" traversal.
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) name = name.substring(slash + 1);

        StringBuilder safe = new StringBuilder(name.length());
        for (int i = 0; i < name.length(); i++) {
            char c = name.charAt(i);
            boolean keep = Character.isLetterOrDigit(c) || c == '.' || c == '-' || c == '_' || c == ' ';
            safe.append(keep ? c : '_');
        }
        String out = safe.toString().trim();
        // No dotfiles, and no name that is nothing but dots.
        while (out.startsWith(".")) out = out.substring(1);

        if (out.length() > MAX_LENGTH) {
            int dot = out.lastIndexOf('.');
            String extension = dot > 0 && out.length() - dot <= 12 ? out.substring(dot) : "";
            out = out.substring(0, MAX_LENGTH - extension.length()) + extension;
        }
        out = out.trim();
        return out.isEmpty() ? "document" : out;
    }
}
