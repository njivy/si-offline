## Offline SI v0.3.0

**UX break:** Primary section editing is now **inline WYSIWYG** in the document body (click-and-type), not the lower raw `.sec` textarea.

### What changed
- Rendered `.sec` body hosts (`TXT`, titles, notes, list items) are `contenteditable`
- Format toolbar: Bold / Italic (visual only — `.sec` has no native B/I), Pick bracket, wrap **RID** / **SUB** / **SRF**
- Click a pink bracket to keep that option (same as toolbar Pick bracket)
- Author + rationale sit in a compact bar above the paper; **Save section + journal** persists hash + lineage + journal
- Raw `.sec` source moved under **Advanced** (collapsed) as a fallback — not the primary editor
- Dist remains Vite IIFE → `assets/app.js` + classic `<script defer>` for `file://`

### Limits (not a CoS block)
- Structural shells (`PRT`/`SPT`/`REF` containers), `SCN`, and table-like blocks are not contenteditable hosts — use Advanced raw if needed
- Bold/Italic are session-visual; they flatten on save (no invented `.sec` tags)
- Nested tag round-trip relies on `data-tag` / `data-nid` stamps

### Asset
Download `si-offline-0.3.0-dist.zip`, unzip, double-click `index.html`.
