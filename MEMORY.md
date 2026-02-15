# MEMORY.md

Long-term memory and context for this workspace. Update this file with decisions, lessons learned, and things to remember across sessions.

---

## Recent Work (2025-06)

### Refactoring Tasks Completed

1. **Fixed field_reassign_with_default warning** (pagination.rs)
   - Removed `ParaHeader::default()` call and inlined struct initialization
   - This eliminated the Clippy warning about assigning to a default instance immediately after creation
   - No snapshot changes; all tests pass

2. **Added #[allow(dead_code)] to find_headerfooter_file** (common.rs)
   - Suppressed false positive Clippy warning for a helper function used in tests
   - The function is called in snapshot_tests.rs at lines 343 and 520
   - Clippy can't see the usage at compile time due to how `use common::*;` imports work
   - No snapshot changes; all tests pass

### Current State

- All tests passing (16 passed, 0 failed)
- No Clippy warnings on hwp-core code (only workspace configuration warnings)
- Clean working tree
- Working on hwpjs/rp-core refactoring as per HEARTBEAT.md

### Dead Code Annotations

There are three intentional `#[allow(dead_code)]` annotations:

1. **caption.rs** - Two functions (`parse_caption`, `parse_caption_12bytes`) with TODO comments:
   - "// TODO: enable and use when parsing captions from HWPTAG_CAPTION tag"
   - Marked for future use when HWPTAG_CAPTION tag parsing is implemented

2. **line_segment.rs** - One field (`affect_line_spacing`) with comment:
   - "(현재 미사용, 향후 기능)" (currently unused, for future features)
   - Object_common attribute: affect line spacing

These annotations are intentional and documented, requiring no action at this time.

---
