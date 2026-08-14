package com.algolon.fjallkompis;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The staged-document filename policy, exercised rather than asserted about.
 *
 * ViewFilePlugin writes a file NAMED BY THE WEB LAYER into an app-private
 * cache directory. The name reaching the filesystem is the one security-
 * relevant string in that flow: if a separator or traversal survives, "stage
 * a document" becomes "write anywhere the app can". These are the cases that
 * must be neutralised before a File object is ever constructed.
 *
 * A host-side JUnit test (`./gradlew testDebugUnitTest`), which is the reason
 * SharedDocumentName has no Android or Capacitor imports: the policy can be
 * run, not merely grepped for.
 */
public class SharedDocumentNameTest {

    // --- ordinary names survive recognisably --------------------------------

    @Test
    public void keepsAnOrdinaryAttachedName() {
        assertEquals("Ticket 12 Aug.pdf", SharedDocumentName.sanitize("Ticket 12 Aug.pdf"));
    }

    @Test
    public void trimsSurroundingWhitespace() {
        assertEquals("card.png", SharedDocumentName.sanitize("  card.png  "));
    }

    // --- separators and traversal cannot survive ----------------------------

    @Test
    public void dropsEveryPathComponent() {
        assertEquals("secrets.pdf", SharedDocumentName.sanitize("/data/data/evil/../secrets.pdf"));
        assertEquals("doc.pdf", SharedDocumentName.sanitize("..\\..\\windows\\doc.pdf"));
    }

    @Test
    public void aPureTraversalNameCollapsesToTheFallback() {
        assertEquals("document", SharedDocumentName.sanitize("../.."));
        assertEquals("document", SharedDocumentName.sanitize("...."));
    }

    @Test
    public void neverProducesADotfile() {
        assertFalse(SharedDocumentName.sanitize(".hidden.pdf").startsWith("."));
        assertEquals("hidden.pdf", SharedDocumentName.sanitize(".hidden.pdf"));
    }

    // --- hostile characters are neutralised, not fatal -----------------------

    @Test
    public void replacesControlAndSpecialCharacters() {
        String out = SharedDocumentName.sanitize("tick\net*?:<>|\"et.pdf");
        assertFalse(out.contains("\n"));
        assertFalse(out.contains("*"));
        assertFalse(out.contains(":"));
        assertTrue(out.endsWith(".pdf"));
    }

    // --- degenerate input still yields a usable name -------------------------

    @Test
    public void emptyAndNullFallBackToDocument() {
        assertEquals("document", SharedDocumentName.sanitize(""));
        assertEquals("document", SharedDocumentName.sanitize("   "));
        assertEquals("document", SharedDocumentName.sanitize(null));
    }

    // --- long names are capped with the extension preserved ------------------

    @Test
    public void capsLengthButKeepsTheExtension() {
        StringBuilder longName = new StringBuilder();
        for (int i = 0; i < 300; i++) longName.append('a');
        longName.append(".pdf");
        String out = SharedDocumentName.sanitize(longName.toString());
        assertTrue(out.length() <= 128);
        assertTrue(out.endsWith(".pdf"));
    }
}
