const std = @import("std");
const Note = @import("note_shape.zig");
const Border = @import("page_border.zig").Border;
const writer = @import("section_child_writer.zig");

// Authored nonzero specimen, independent of factory defaults and any document.
fn specimen(layout: Note.Layout) Note.Shape {
    return .{
        .flags = 0x04001203,
        .user_char = 0xac00,
        .prefix = 0x28,
        .suffix = 0x29,
        .start_number = 7,
        .separator_length = -2,
        .above = 1,
        .below = -3,
        .between = 257,
        .line_type = 4,
        .line_width = 2,
        .color = 0x00332211,
        .layout = layout,
        .extra = &.{},
    };
}

test "section child note writer fixed field oracle and explicit layout decode roundtrip" {
    // Hand-written LE fields in table133 order; no encoder/parser builds these.
    const prefix = [_]u8{ 3, 0x12, 0, 4, 0, 0xac, 0x28, 0, 0x29, 0, 7, 0 };
    const tail = [_]u8{ 1, 0, 0xfd, 0xff, 1, 1, 4, 2, 0x11, 0x22, 0x33, 0 };
    inline for (.{ Note.Layout.spec26, Note.Layout.observed28 }) |layout| {
        const input = specimen(layout);
        const encoded = try writer.note(input);
        try std.testing.expectEqual(@as(usize, if (layout == .spec26) 26 else 28), encoded.len);
        try std.testing.expectEqualSlices(u8, &prefix, encoded.bytes[0..12]);
        const width: usize = if (layout == .spec26) 2 else 4;
        try std.testing.expectEqual(@as(u8, 0xfe), encoded.bytes[12]);
        for (encoded.bytes[13 .. 12 + width]) |byte| try std.testing.expectEqual(@as(u8, 0xff), byte);
        try std.testing.expectEqualSlices(u8, &tail, encoded.bytes[12 + width .. encoded.len]);
        const decoded = try Note.Shape.parseLayout(encoded.bytes[0..encoded.len], layout);
        inline for (.{ "flags", "user_char", "prefix", "suffix", "start_number", "separator_length", "above", "below", "between", "line_type", "line_width", "color", "layout" }) |field| {
            try std.testing.expectEqual(@field(input, field), @field(decoded, field));
        }
        try std.testing.expectEqual(@as(usize, 0), decoded.extra.len);
        const again = try writer.note(decoded);
        try std.testing.expectEqualSlices(u8, encoded.bytes[0..encoded.len], again.bytes[0..again.len]);
        if (layout == .spec26) try std.testing.expectError(error.UnexpectedEnd, Note.Shape.parse(encoded.bytes[0..encoded.len]));
    }
}

test "section child note writer refuses narrowing and opaque tails without allocation" {
    var shape = specimen(.spec26);
    for ([_]i32{ -32769, 32768, std.math.minInt(i32), std.math.maxInt(i32) }) |value| {
        shape.separator_length = value;
        try std.testing.expectError(error.NoteSeparatorOutOfRange, writer.note(shape));
    }
    for ([_]i32{ -32768, 32767 }) |value| {
        shape.separator_length = value;
        const encoded = try writer.note(shape);
        const decoded = try Note.Shape.parseLayout(encoded.bytes[0..encoded.len], .spec26);
        try std.testing.expectEqual(value, decoded.separator_length);
    }
    shape.layout = .observed28;
    for ([_]i32{ std.math.minInt(i32), std.math.maxInt(i32) }) |value| {
        shape.separator_length = value;
        const encoded = try writer.note(shape);
        const decoded = try Note.Shape.parse(encoded.bytes[0..encoded.len]);
        try std.testing.expectEqual(value, decoded.separator_length);
    }
    shape.extra = &.{0x55};
    try std.testing.expectError(error.UnsupportedSectionChildExtra, writer.note(shape));
    try std.testing.expectEqual(@as(u8, 0x55), shape.extra[0]);
}

test "section child border writer fourteen field bytes preserve signed units and optional reference" {
    var input: Border = .{ .flags = 0x15, .left = -1, .right = 2, .top = -32768, .bottom = 32767, .border_fill_id = 0x1234, .extra = &.{} };
    const encoded = try writer.pageBorder(input);
    try std.testing.expectEqualSlices(u8, &.{ 0x15, 0, 0, 0, 0xff, 0xff, 2, 0, 0, 0x80, 0xff, 0x7f, 0x34, 0x12 }, &encoded);
    const decoded = try Border.parse(&encoded);
    inline for (.{ "flags", "left", "right", "top", "bottom", "border_fill_id" }) |field| {
        try std.testing.expectEqual(@field(input, field), @field(decoded, field));
    }
    try std.testing.expectEqual(@as(usize, 0), decoded.extra.len);
    const again = try writer.pageBorder(decoded);
    try std.testing.expectEqualSlices(u8, &encoded, &again);
    try std.testing.expectError(error.UnexpectedEnd, Border.parse(encoded[0..12]));
    input.extra = &.{1};
    try std.testing.expectError(error.UnsupportedSectionChildExtra, writer.pageBorder(input));
}
