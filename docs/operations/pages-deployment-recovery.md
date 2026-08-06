# GitHub Pages deployment recovery

When a Pages workflow is cancelled or remains queued before any jobs start:

1. Re-run the failed workflow once.
2. If the re-run remains queued with no jobs, create and merge a small repository PR rather than repeatedly re-running the same SHA.
3. Verify that the merge starts a fresh `Deploy to GitHub Pages` workflow on the new merge commit.
4. Confirm both the build and deploy jobs complete before treating the change as live.

Direct commits or ref updates created by an integration may not trigger a new Actions workflow. A normal GitHub merge provides the reliable push event and a fresh Pages build version.
