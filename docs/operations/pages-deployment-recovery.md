# GitHub Pages deployment recovery

When a Pages workflow is cancelled or remains queued before any jobs start:

1. Re-run the failed workflow once.
2. If the re-run remains queued with no jobs, create a fresh push on `main` rather than repeatedly re-running the same SHA.
3. Keep the workflow concurrency key scoped to the ref (`pages-${{ github.ref }}`), so stale historical runs cannot block a new `main` deployment.
4. Do not create another push while the recovery run is active: `cancel-in-progress` will correctly cancel the older run.
5. Confirm both the build and deploy jobs complete before treating the change as live.

Direct ref updates may not reliably create a new Actions run. A Contents API update or normal user push provides a fresh push event and Pages build version.
