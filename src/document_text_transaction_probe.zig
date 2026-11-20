//! Focused source target; execution requires a separate coordinator slot grant.
test {
    _ = @import("model/document_text_snapshot_ownership_tests.zig");
    _ = @import("model/document_text_binding.zig");
    _ = @import("model/document_text_snapshot.zig");
    _ = @import("hwp5/edit/document_text_projection.zig");
    _ = @import("model/protected_points_batch.zig");
    _ = @import("text/literal_matcher.zig");
    _ = @import("text/utf8_utf16_splice.zig");
    _ = @import("wasm/document_replace_all_request.zig");
    _ = @import("hwp5/edit/document_replace_all_tests.zig");
}
