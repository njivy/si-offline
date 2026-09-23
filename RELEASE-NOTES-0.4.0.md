## Offline SI v0.4.0

**Guided SpecsIntact bracket / option picker** with **Job-wide batch apply** (preview count before commit).

### What changed
- **Pick options** is the primary toolbar action (replaces one-shot “Pick bracket”)
- Click a pink consecutive group `[A][B]` → live alternatives → one-click apply
- SpecsIntact-safe: chosen text kept **without** brackets; unselected sibling tokens removed
- When the same option pattern appears elsewhere in the Job, the panel shows **N matches by section** and an **Apply to all N** checkbox (preview before commit)
- Batch writes every matching section and appends a journal entry
- Fill-in blanks (`[_____]`) supported via typed value (fail-closed if value contains `[` `]` `<` `>`)
- Fixture Job: `[cast-in-place][precast]` appears in both `01 33 00` and `03 30 00` for batch demo
- Dist remains Vite IIFE → `file://` double-click

### Limits (documented; no Nic/CoS block)
- Only consecutive SpecsIntact tokens `[opt][opt]…` are treated as a choice group
- Pipe-inside-bracket (`[a|b]`) is **not** split (opaque single token) — fail-closed / unwrap-only
- Nested / unmatched brackets are not mutated
- Multi-select within one group (SpecsIntact Ctrl-click keep-many) not yet offered — single choice per apply
- TAI tailoring tags are out of scope (different mechanism)

### Asset
Download `si-offline-0.4.0-dist.zip`, unzip, double-click `index.html`.
