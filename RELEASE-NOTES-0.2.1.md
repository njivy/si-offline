## Offline SI v0.2.1

**Partial fix (superseded by v0.2.2):** Removed bare `jszip` / CSS-as-ESM imports so multi-file static ESM worked over HTTP.

**Still broken on double-click:** Dist used `<script type="module">`, which Chrome/Edge block on `file://` (origin `null` CORS) → blank page.

**Use [v0.2.2](https://github.com/njivy/si-offline/releases/tag/v0.2.2)** instead — IIFE + classic `defer` script so unzip + open works.
