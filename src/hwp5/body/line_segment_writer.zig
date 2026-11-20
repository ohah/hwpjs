//! Official revision1.3 table62: nine little-endian fields, exactly36 bytes.
//! A codec/consistency check, NOT a layout producer or save authorization.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub const Segment = @import("line_segments.zig").Segment;
pub const known_flags: u32 = 3 | (0x3f << 16);
pub const line_ends: u32 = (1 << 17) | (1 << 18);

pub fn encode(a: std.mem.Allocator, text: []const u8, version: Version, segments: []const Segment, limit: usize) ![]u8 {
    try version.requireSupported();
    if (version.raw < 0x05000107 or version.raw >= 0x05010000) return error.UnsupportedLayoutWriteVersion;
    if (text.len < 2 or text.len % 2 != 0) return error.InvalidLayoutText;
    const units = text.len / 2;
    if (units > 4 * 1024 * 1024 or segments.len == 0 or segments.len > 65535) return error.LayoutLimitExceeded;
    const size = try std.math.mul(usize, segments.len, 36);
    if (size > limit) return error.LimitExceeded;
    if (unit(text, units - 1) != 13) return error.MissingParagraphTerminator;
    const boundary = try a.alloc(bool, units + 1);
    defer a.free(boundary);
    @memset(boundary, false);
    const breaks = try a.alloc(u32, units + 1);
    defer a.free(breaks);
    const visible = try a.alloc(u32, units + 1);
    defer a.free(visible);
    breaks[0] = 0;
    visible[0] = 0;
    var at: usize = 0;
    while (at < units) {
        const start = at;
        const value = unit(text, at);
        boundary[at] = true;
        if (value == 2) {
            if ((at != 0 and at != 8) or units - at < 8) return error.UnsupportedLayoutControl;
            const id = std.mem.readInt(u32, text[(at + 1) * 2 ..][0..4], .little);
            const expected: u32 = if (at == 0) 0x73656364 else 0x636f6c64;
            if (id != expected or unit(text, at + 7) != 2) return error.UnsupportedLayoutControl;
            at += 8;
        } else if (value >= 0xd800 and value <= 0xdbff) {
            if (at + 1 >= units or unit(text, at + 1) < 0xdc00 or unit(text, at + 1) > 0xdfff) return error.InvalidLayoutUnicode;
            at += 2;
        } else {
            if (value >= 0xdc00 and value <= 0xdfff) return error.InvalidLayoutUnicode;
            if (value == 0x85 or value == 0x2028 or value == 0x2029) return error.UnsupportedLayoutControl;
            if (value < 32 and value != 10 and !(value == 13 and at == units - 1)) return error.UnsupportedLayoutControl;
            at += 1;
        }
        for (start..at) |index| {
            breaks[index + 1] = breaks[index] + @intFromBool(index == start and value == 10);
            visible[index + 1] = visible[index] + @intFromBool(value >= 32);
        }
    }
    boundary[units] = true;
    for (segments, 0..) |segment, index| {
        const end: usize = if (index + 1 < segments.len) segments[index + 1].start else units - 1;
        if ((index == 0 and segment.start != 0) or segment.start > end or end >= units or !boundary[segment.start] or !boundary[end]) return error.InvalidLayoutTextCoverage;
        if (index + 1 < segments.len and segment.start == end) return error.InvalidLayoutTextCoverage;
        const hard_breaks = breaks[end] - breaks[segment.start];
        if (hard_breaks > 1 or (hard_breaks == 1 and (end == 0 or unit(text, end - 1) != 10 or index + 1 == segments.len))) return error.UnflowedHardBreak;
        if (segment.flags & ~known_flags != 0 or segment.flags & line_ends != line_ends) return error.UnsupportedLayoutFlags;
        if ((segment.flags & (1 << 16) != 0) != (visible[end] == visible[segment.start])) return error.WrongLayoutEmptyFlag;
        const advance = @as(i64, segment.height) + segment.spacing;
        if (segment.y < 0 or segment.height <= 0 or segment.text_height <= 0 or segment.text_height > segment.height or segment.baseline < 0 or segment.baseline > segment.height or advance <= 0 or advance > std.math.maxInt(i32) or segment.width <= 0) return error.InvalidLayoutGeometry;
        if (@as(i64, segment.y) + @max(@as(i64, segment.height), advance) > std.math.maxInt(i32) or @as(i64, segment.x) + segment.width > std.math.maxInt(i32)) return error.InvalidLayoutGeometry;
        if (segment.flags & 3 != 0 and segment.flags & 3 != 3) return error.InvalidLayoutPageFlow;
        if (index > 0 and segment.flags & 3 == 0) {
            const previous = segments[index - 1];
            const occupied = @max(@as(i64, previous.height), @as(i64, previous.height) + previous.spacing);
            if (@as(i64, segment.y) < @as(i64, previous.y) + occupied) return error.InvalidLayoutPageFlow;
        }
    }
    const bytes = try a.alloc(u8, size);
    for (segments, 0..) |segment, index| {
        const b = bytes[index * 36 ..][0..36];
        std.mem.writeInt(u32, b[0..4], segment.start, .little);
        inline for (.{ "y", "height", "text_height", "baseline", "spacing", "x", "width" }, 0..) |field, n| std.mem.writeInt(i32, b[4 + n * 4 ..][0..4], @field(segment, field), .little);
        std.mem.writeInt(u32, b[32..36], segment.flags, .little);
    }
    return bytes;
}

fn unit(text: []const u8, at: usize) u16 {
    return std.mem.readInt(u16, text[at * 2 ..][0..2], .little);
}
