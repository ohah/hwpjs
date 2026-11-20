//! Current Native inverse-owner/read-counter contracts; no external fixture or write capability.
test {
    _ = @import("model/document_text_anchor_tests.zig");
    _ = @import("model/document_text_read_binding_tests.zig");
    _ = @import("wasm/document_text_anchor_request_tests.zig");
}
