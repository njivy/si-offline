## Offline SI v0.2.2

**Fix:** Dist ZIP loads via double-click (`file://`), not only over HTTP.

### What still broke in v0.2.1
v0.2.1 removed bare `jszip` / CSS-as-ESM imports so multi-file static ESM worked when served over HTTP. Dist still used `<script type="module" src="./src/main.js">`. Chrome/Edge block ES modules on `file://` (origin `null` CORS) → blank page after unzip + open.

### What fixed it
- Build with Vite IIFE → `dist/assets/app.js` (+ CSS)
- Post-process `dist/index.html` to classic `<script defer src="./assets/app.js">` (no `type="module"`)
- Fixture Job embedded as a base64 data-URL so **Load fixture Job** works on `file://` (no CORS `fetch` of a sibling zip)
- Fixtures still copied via Vite `public/`
- UI version string → v0.2.2

### Asset
Download `si-offline-0.2.2-dist.zip`, unzip, double-click `index.html` (or serve the folder).

Older tags `V0.2.0` / `v0.2.1` shipped broken or HTTP-only dist; use **v0.2.2**.
