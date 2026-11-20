//! Emit already source/namespace-validated title XML into one actual text site.
//! No owner lookup, affinity transform, permission or XML marker invention here.
const std = @import("std");
pub const Marker = struct { unit: u32, xml: []const u8 };
pub fn write(a: std.mem.Allocator, text: []const u8, markers: []const Marker, limit: usize) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var cursor: @import("../text/utf8_utf16_splice.zig").Cursor = .{ .text = text };
    for (markers) |marker| {
        const previous = cursor.offset;
        const at = try cursor.seek(marker.unit);
        const encoded = try @import("../xml/text_writer.zig").encode(a, text[previous..at], limit -| output.items.len);
        defer a.free(encoded);
        if (encoded.len > limit -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, encoded);
        if (marker.xml.len > limit -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, marker.xml);
    }
    const tail = try @import("../xml/text_writer.zig").encode(a, text[cursor.offset..], limit -| output.items.len);
    defer a.free(tail);
    if (tail.len > limit -| output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, tail);
    return output.toOwnedSlice(a);
}
