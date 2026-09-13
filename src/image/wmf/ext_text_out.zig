const std = @import("std");
const records = @import("records.zig");
const rect = @import("rect.zig");

pub const RectangleLayout = enum { from_options, absent, present };
pub const Text = struct {
    x: i16,
    y: i16,
    options_raw: u16,
    rectangle: ?rect.Rect,
    string: []const u8,
    padding: ?u8,
    dx_bytes: []const u8,
    dx_count: usize,

    pub fn dx(self: Text, index: usize) !i16 {
        if (index >= self.dx_count) return error.WmfDxIndexOutOfBounds;
        return std.mem.readInt(i16, self.dx_bytes[index * 2 ..][0..2], .little);
    }
};

pub fn parse(record: records.Record, rectangle_layout: RectangleLayout) !Text {
    if (record.function != 0x0a32) return error.InvalidWmfExtTextOutFunction;
    if (record.parameters.len < 8 or record.parameters.len % 2 != 0 or
        record.size_words != 3 + record.parameters.len / 2) return error.InvalidWmfExtTextOutSize;
    const signed_length = std.mem.readInt(i16, record.parameters[4..6], .little);
    if (signed_length < 0) return error.InvalidWmfStringLength;
    const string_length: usize = @intCast(signed_length);
    const options = std.mem.readInt(u16, record.parameters[6..8], .little);
    if ((options & ~@as(u16, 0x2c96)) != 0) return error.UnsupportedWmfExtTextOutOptions;
    const has_rectangle = switch (rectangle_layout) {
        .from_options => (options & 0x0006) != 0,
        .absent => false,
        .present => true,
    };
    var offset: usize = 8;
    var rectangle: ?rect.Rect = null;
    if (has_rectangle) {
        if (record.parameters.len - offset < 8) return error.InvalidWmfExtTextOutSize;
        rectangle = rect.readLTRB(record.parameters[offset..][0..8]);
        offset += 8;
    }
    if (string_length > record.parameters.len - offset) return error.InvalidWmfExtTextOutSize;
    const string = record.parameters[offset .. offset + string_length];
    offset += string_length;
    const padding: ?u8 = if (string_length % 2 != 0) blk: {
        if (offset == record.parameters.len) return error.InvalidWmfExtTextOutSize;
        const byte = record.parameters[offset];
        offset += 1;
        break :blk byte;
    } else null;
    const remaining = record.parameters[offset..];
    const expected_dx = string_length * (if ((options & 0x2000) != 0) @as(usize, 2) else 1);
    const dx_count = if (remaining.len == 0) 0 else expected_dx;
    if (remaining.len != 0 and remaining.len != expected_dx * 2) return error.InvalidWmfDxSize;
    return .{
        .x = std.mem.readInt(i16, record.parameters[2..4], .little),
        .y = std.mem.readInt(i16, record.parameters[0..2], .little),
        .options_raw = options,
        .rectangle = rectangle,
        .string = string,
        .padding = padding,
        .dx_bytes = remaining,
        .dx_count = dx_count,
    };
}
