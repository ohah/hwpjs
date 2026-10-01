//! Shared explicit half-open range mapping for text and derived field labels.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");

fn position(pos: u32, start: u32, end: u32, added: u32) u32 {
    return if (pos < start) pos else if (pos >= end) pos - (end - start) + added else start;
}

pub fn prepare(a: std.mem.Allocator, previous: ?[]const model.TextRange, source: ?body.Ranges, before: []const u8, start: u32, end: u32, added: u32) ![]model.TextRange {
    var mapped: std.ArrayList(model.TextRange) = .empty;
    errdefer mapped.deinit(a);
    const count = if (previous) |p| p.len else if (source) |s| s.count() else 0;
    for (0..count) |i| {
        const r: model.TextRange = if (previous) |p| p[i] else .{ .start_unit = source.?.get(i).?.start, .end_unit = source.?.get(i).?.end, .tag = source.?.get(i).?.tag };
        try @import("plain_text_content.zig").boundary(before, r.start_unit);
        try @import("plain_text_content.zig").boundary(before, r.end_unit);
        const s = position(r.start_unit, start, end, added);
        const e = position(r.end_unit, start, end, added);
        if (s < e) try mapped.append(a, .{ .start_unit = s, .end_unit = e, .tag = r.tag });
    }
    if (mapped.items.len > 65535) return error.LimitExceeded;
    return mapped.toOwnedSlice(a);
}
