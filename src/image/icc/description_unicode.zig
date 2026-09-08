const utf16 = @import("../../text/utf16.zig");
pub const Report = struct {
    present: bool,
    inspected_bytes: usize,
    text: utf16.Stats,
    language_deferred: bool = true,
    script_deferred: bool = true,
};
/// Explicit UTF-16BE interpretation, not an inference from a v2 major version.
/// The view must come from text_description.parse and remain unmodified.
pub fn inspectUtf16BE(view: @import("text_description.zig").View, max_bytes: usize) !Report {
    if (view.unicode.len > max_bytes) return error.LimitExceeded;
    return .{
        .present = view.unicode.len != 0,
        .inspected_bytes = view.unicode.len,
        .text = try utf16.inspect(view.unicode, .big),
    };
}
