const std = @import("std");
const t = std.testing;
const body = @import("reader.zig");
test "cell properties preserve raw bits and share the selected list layout" {
    for (0..32) |bit| {
        const raw = @as(u32, 1) << @intCast(bit);
        const flags: body.CellAttributes = .{ .raw = raw };
        try t.expectEqual(bit == 16, flags.hasInnerMargins());
        try t.expectEqual(bit == 17, flags.isProtected());
        try t.expectEqual(bit == 18, flags.isHeader());
        try t.expectEqual(bit == 19, flags.isEditable());
        try t.expectEqual(raw, flags.raw);
    }
    const b = [_]u8{ 1, 0, 0xff, 0xff, 0x21, 0, 0x0f, 0x80 };
    const h = try body.ListHeader.parse(&b);
    const v = try h.view(.observed8);
    const flags = body.CellAttributes.fromList(v);
    try t.expectEqual(0x800f0021, flags.raw);
    try t.expect(flags.hasInnerMargins() and flags.isProtected() and flags.isHeader() and flags.isEditable());
    try t.expectEqual(1, v.direction());
    try t.expectEqual(1, v.alignment());
    try t.expectEqual(0x0021ffff, body.CellAttributes.fromList(try h.view(.spec6)).raw);
}
test "cell extension absence, zero width, marker and opaque parameter bytes are distinct" {
    const absent = try body.CellExtension.parse(&.{});
    try t.expect(absent.text_width == null and absent.marker == null);
    const b = [_]u8{ 0, 0, 0, 0, 0xff, 0x1b, 2, 1, 0, 0xfe, 0xff, 0, 0 };
    for (1..4) |n| try t.expectError(error.UnexpectedEnd, body.CellExtension.parse(b[0..n]));
    const width = try body.CellExtension.parse(b[0..4]);
    try t.expectEqual(0, width.text_width.?);
    try t.expect(width.marker == null);
    const marked = try body.CellExtension.parse(&b);
    try t.expect(marked.parameterSetMarked());
    try t.expectEqualSlices(u8, b[5..], marked.remaining);
    try t.expect(marked.remaining.ptr == b[5..].ptr);
    const incomplete = try body.CellExtension.parse(b[0..5]);
    try t.expect(incomplete.parameterSetMarked()); // NOT proof of valid ParameterSet.
    try t.expectEqual(0, incomplete.remaining.len);
    const other = try body.CellExtension.parse(&.{ 255, 255, 255, 255, 128, 11 });
    try t.expectEqual(0xffffffff, other.text_width.?);
    try t.expectEqual(128, other.marker.?);
    try t.expect(!other.parameterSetMarked());
    // The base spec parser still preserves arbitrary extra; no automatic tail layout.
    const short = [_]u8{0} ** 29;
    try t.expectEqual(3, (try body.Cell.parse(&short)).extra.len);
}
