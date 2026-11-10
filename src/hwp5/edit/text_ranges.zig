//! Shared explicit half-open range mapping for text and derived field labels.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");

fn position(pos: u32, start: u32, end: u32, added: u32) u32 {
    return if (pos < start) pos else if (pos >= end) pos - (end - start) + added else start;
}

pub fn prepare(a: std.mem.Allocator, previous: ?[]const model.TextRange, source: ?body.Ranges, before: []const u8, start: u32, end: u32, added: u32) ![]model.TextRange {
    return prepareMode(a, previous, source, before, start, end, added, false);
}

/// No endpoint affinity is selected: both endpoints must lie strictly outside
/// the edit. Preserve empty source markers instead of assigning them semantics.
pub fn prepareDisjoint(a: std.mem.Allocator, previous: ?[]const model.TextRange, source: ?body.Ranges, before: []const u8, start: u32, end: u32, added: u32) ![]model.TextRange {
    if (start > end) return error.InvalidTextRange;
    try @import("plain_text_content.zig").boundary(before, start);
    try @import("plain_text_content.zig").boundary(before, end);
    const units = std.math.add(usize, before.len / 2 - (end - start), added) catch return error.LimitExceeded;
    if (units > std.math.maxInt(u32)) return error.LimitExceeded;
    return prepareMode(a, previous, source, before, start, end, added, true);
}

/// Dense original-boundary maps keep arbitrary source range order intact.
/// touches is the prefix count of points covered by ANY requested closed edit
/// interval, including semantic no-ops, matching ordinary reject authority.
pub fn prepareIndependent(a: std.mem.Allocator, previous: ?[]const model.TextRange, source: ?body.Ranges, before: []const u8, mapping: []const u32, touches: []const u32, disjoint: bool, visited: if (@import("builtin").is_test) *usize else void) ![]model.TextRange {
    var output: std.ArrayList(model.TextRange) = .empty;
    errdefer output.deinit(a);
    const count = if (previous) |p| p.len else if (source) |s| s.count() else 0;
    for (0..count) |index| {
        if (@import("builtin").is_test) visited.* += 1;
        const value: model.TextRange = if (previous) |p| p[index] else .{ .start_unit = source.?.get(index).?.start, .end_unit = source.?.get(index).?.end, .tag = source.?.get(index).?.tag };
        try @import("plain_text_content.zig").boundary(before, value.start_unit);
        try @import("plain_text_content.zig").boundary(before, value.end_unit);
        if (disjoint) {
            if (value.start_unit > value.end_unit) return error.InvalidTextRange;
            if (touches[value.end_unit + 1] != touches[value.start_unit]) return error.UnsupportedRangeSemantics;
        }
        const start = mapping[value.start_unit];
        const end = mapping[value.end_unit];
        if (disjoint or start < end) try output.append(a, .{ .start_unit = start, .end_unit = end, .tag = value.tag });
    }
    if (output.items.len > 65535) return error.LimitExceeded;
    return output.toOwnedSlice(a);
}

fn prepareMode(a: std.mem.Allocator, previous: ?[]const model.TextRange, source: ?body.Ranges, before: []const u8, start: u32, end: u32, added: u32, disjoint: bool) ![]model.TextRange {
    var mapped: std.ArrayList(model.TextRange) = .empty;
    errdefer mapped.deinit(a);
    const count = if (previous) |p| p.len else if (source) |s| s.count() else 0;
    for (0..count) |i| {
        const r: model.TextRange = if (previous) |p| p[i] else .{ .start_unit = source.?.get(i).?.start, .end_unit = source.?.get(i).?.end, .tag = source.?.get(i).?.tag };
        try @import("plain_text_content.zig").boundary(before, r.start_unit);
        try @import("plain_text_content.zig").boundary(before, r.end_unit);
        if (disjoint) {
            if (r.start_unit > r.end_unit) return error.InvalidTextRange;
            if (!(end < r.start_unit or start > r.end_unit)) return error.UnsupportedRangeSemantics;
        }
        const s = position(r.start_unit, start, end, added);
        const e = position(r.end_unit, start, end, added);
        if (disjoint or s < e) try mapped.append(a, .{ .start_unit = s, .end_unit = e, .tag = r.tag });
    }
    if (mapped.items.len > 65535) return error.LimitExceeded;
    return mapped.toOwnedSlice(a);
}
