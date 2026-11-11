//! Current immutable DocInfo numbering definitions. Templates stay source values.
const std = @import("std");
const info = @import("../docinfo/reader.zig");
const Allocator = std.mem.Allocator;

pub const Level = struct {
    start: ?u32,
    attributes: u32,
    template: []const u8,
    placement: @import("../docinfo/paragraph_head.zig").Head,
};
pub const Definition = struct { id: u32, start: u32, levels: []const Level };

pub fn read(a: Allocator, bytes: []const u8, version: @import("../version.zig").Version) ![]Definition {
    var out: std.ArrayList(Definition) = .empty;
    var iter = try info.Iterator.init(bytes, version, .{});
    var id: u32 = 0;
    while (try iter.next()) |record| {
        if (record.value != .numbering) continue;
        id += 1;
        if (id > 4096) return error.LimitExceeded;
        const entry = record.value.numbering;
        if (entry.extra.len != 0) continue;
        const levels = try a.alloc(Level, if (entry.extension == null) 7 else 10);
        for (entry.levels, 0..) |level, i|
            levels[i] = try project(a, level, if (entry.starts) |values| values[i] else null);
        if (entry.extension) |ext| for (ext.levels, 0..) |level, i| {
            levels[7 + i] = try project(a, level, ext.starts[i]);
        };
        try out.append(a, .{ .id = id, .start = entry.start, .levels = levels });
    }
    return out.toOwnedSlice(a);
}

fn project(a: Allocator, level: @import("../docinfo/numbering.zig").Level, start: ?u32) !Level {
    const raw = level.format_utf16;
    if (raw.len > 512) return error.LimitExceeded;
    var units: [256]u16 = undefined;
    for (units[0 .. raw.len / 2], 0..) |*unit, i| unit.* = std.mem.readInt(u16, raw[i * 2 ..][0..2], .little);
    return .{
        .start = start,
        .attributes = level.head.attributes,
        .placement = level.head,
        .template = try std.unicode.utf16LeToUtf8Alloc(a, units[0 .. raw.len / 2]),
    };
}
