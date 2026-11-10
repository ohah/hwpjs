test "independent text transaction registration" {
    _ = @import("model/independent_text_edits.zig");
    _ = @import("model/text_transaction_binding.zig");
    _ = @import("model/text_transaction_admission.zig");
    _ = @import("wasm/text_transaction_request.zig");
    _ = @import("wasm/text_transaction_query_request.zig");
}
