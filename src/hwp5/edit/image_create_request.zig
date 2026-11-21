//! Live Session-only picture request. Borrowed bytes never escape synchronous apply.
const std = @import("std");
pub const Request = struct {
    target: @import("equation_create_request.zig").Target,
    expected_text_utf16le: []const u8,
    box: @import("equation_create_request.zig").Box,
    image: []const u8,
};
pub fn validate(r: Request) !void {
    if (r.target.binding == null) return error.SourceBindingMismatch;
    if (r.expected_text_utf16le.len % 2 != 0 or r.expected_text_utf16le.len > 4 * 1024 * 1024) return error.InvalidImageInsertText;
    if (r.box.width == 0 or r.box.height == 0 or r.box.width > std.math.maxInt(i32) or r.box.height > std.math.maxInt(i32)) return error.InvalidPictureInsertionSize;
    _ = try @import("../../image/picture_input.zig").inspectImage(r.image, 8 * 1024 * 1024);
    switch (r.target.anchor.host) {
        .original_node => {},
        .generated_instance => |id| if (id == 0) return error.SourceBindingMismatch,
    }
}
