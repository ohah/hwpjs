//! Typed construction of table133/135 payloads. No source-document upgrade or
//! layout guessing. Parsers/models remain the authority for field types.
const std = @import("std");
const Note = @import("note_shape.zig");
const Border = @import("page_border.zig").Border;

pub const NoteBytes = struct {
    bytes: [28]u8 = @splat(0),
    len: usize,
};

/// Fixed owned result, no allocator or borrowed output. Reject opaque tails:
/// callers editing old sources must keep using their preservation writers.
pub fn note(shape: Note.Shape) !NoteBytes {
    if (shape.extra.len != 0) return error.UnsupportedSectionChildExtra;
    const separator: i16 = if (shape.layout == .spec26)
        std.math.cast(i16, shape.separator_length) orelse return error.NoteSeparatorOutOfRange
    else
        0;
    var result: NoteBytes = .{ .len = if (shape.layout == .spec26) 26 else 28 };
    var at: usize = 0;
    put(u32, &result.bytes, &at, shape.flags);
    put(u16, &result.bytes, &at, shape.user_char);
    put(u16, &result.bytes, &at, shape.prefix);
    put(u16, &result.bytes, &at, shape.suffix);
    put(u16, &result.bytes, &at, shape.start_number);
    switch (shape.layout) {
        .spec26 => put(i16, &result.bytes, &at, separator),
        .observed28 => put(i32, &result.bytes, &at, shape.separator_length),
    }
    put(i16, &result.bytes, &at, shape.above);
    put(i16, &result.bytes, &at, shape.below);
    put(i16, &result.bytes, &at, shape.between);
    put(u8, &result.bytes, &at, shape.line_type);
    put(u8, &result.bytes, &at, shape.line_width);
    put(u32, &result.bytes, &at, shape.color);
    std.debug.assert(at == result.len);
    return result;
}

/// Table135 lists 4 + 4*2 + 2 bytes (14); its printed total12 is inconsistent.
pub fn pageBorder(border: Border) ![14]u8 {
    if (border.extra.len != 0) return error.UnsupportedSectionChildExtra;
    var bytes: [14]u8 = undefined;
    var at: usize = 0;
    put(u32, &bytes, &at, border.flags);
    inline for (.{ "left", "right", "top", "bottom" }) |field| put(i16, &bytes, &at, @field(border, field));
    put(u16, &bytes, &at, border.border_fill_id);
    std.debug.assert(at == bytes.len);
    return bytes;
}

fn put(comptime T: type, out: []u8, at: *usize, value: T) void {
    std.mem.writeInt(T, out[at.*..][0..@sizeOf(T)], value, .little);
    at.* += @sizeOf(T);
}
