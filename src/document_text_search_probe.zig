//! Focused source contracts. No document fixture, WASM/SDK or browser execution.
test {
    _ = @import("model/document_text_snapshot_ownership_tests.zig");
    _ = @import("model/document_text_binding.zig");
    _ = @import("model/document_text_snapshot.zig");
    _ = @import("hwp5/edit/document_text_projection.zig");
}
