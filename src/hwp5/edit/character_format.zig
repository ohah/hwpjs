//! Existing CharShape application to a plain paragraph; no resource creation.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const plain = @import("plain_text_content.zig");
const runs = @import("character_runs.zig");

pub const Edit = struct { section: usize, paragraph: usize, start_unit: u32, end_unit: u32, char_shape_id: u32 };

pub fn apply(a: std.mem.Allocator, source: []const u8, version: Version, p: *model.Paragraph, edit: Edit, count: usize) !void {
    if (edit.char_shape_id >= count) return error.InvalidResourceReference;
    const original_ranges = try @import("plain_text_source.zig").validate(a, source, version, p.*, count);
    const text = try plain.editableTextBytes(a, p.*);
    defer a.free(text);
    try plain.validatePlain(text);
    if (edit.start_unit > edit.end_unit or edit.end_unit > text.len / 2 - 1) return error.InvalidTextPosition;
    try plain.boundary(text, edit.start_unit);
    try plain.boundary(text, edit.end_unit);
    try runs.validate(p.character_runs, text, count);
    const range_count = if (p.range_tags) |r| r.len else if (original_ranges) |r| r.count() else 0;
    // Length does not change: preserve even zero-length ranges without affinity.
    const ranges = try a.alloc(model.TextRange, range_count);
    errdefer a.free(ranges);
    for (ranges, 0..) |*r, i| {
        r.* = if (p.range_tags) |rr| rr[i] else .{ .start_unit = original_ranges.?.get(i).?.start, .end_unit = original_ranges.?.get(i).?.end, .tag = original_ranges.?.get(i).?.tag };
        try plain.boundary(text, r.start_unit);
        try plain.boundary(text, r.end_unit);
    }
    if (edit.start_unit == edit.end_unit) {
        a.free(ranges);
        return;
    }
    var unchanged = true;
    for (p.character_runs, 0..) |r, i| {
        const end = if (i + 1 < p.character_runs.len) p.character_runs[i + 1].start_unit else p.declared_units;
        if (r.start_unit < edit.end_unit and end > edit.start_unit and r.char_shape_id != edit.char_shape_id) unchanged = false;
    }
    if (unchanged) {
        a.free(ranges);
        return;
    }
    const owned = try runs.replace(a, p.character_runs, edit.start_unit, edit.end_unit, edit.end_unit - edit.start_unit, edit.char_shape_id);
    // All fallible work completed before mutating the owned model.
    a.free(p.character_runs);
    if (p.range_tags) |r| a.free(r);
    p.character_runs = owned;
    p.range_tags = ranges;
    p.deferred_direct_records = 0;
}
