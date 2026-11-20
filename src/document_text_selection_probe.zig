//! Read selection source target only. Native execution requires a separate grant.
test {
    _ = @import("model/document_text_selection_tests.zig");
    _ = @import("wasm/document_text_selection_request_tests.zig");
    _ = @import("model/document_text_selection_ownership_tests.zig");
}
