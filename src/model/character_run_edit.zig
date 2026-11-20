//! Shared canonical character-run edits. Existing owned HWP5 algorithms are
//! extracted here unchanged; format-specific UTF/resource validation stays at
//! each caller boundary. No external implementation or measurement is used.
const std = @import("std");
const model = @import("document.zig");

pub fn styleAt(rows: []const model.CharacterRun, unit: u32) u32 {
    var id = rows[0].char_shape_id;
    for (rows) |r| {
        if (r.start_unit > unit) break;
        id = r.char_shape_id;
    }
    return id;
}

/// Format adapters retain their established interior affinity. The shared
/// authored paragraph has no physical CR; only a pure caret at its validated
/// visible EOF selects the preceding resource for both adapters. Replacements
/// keep the first replaced resource, never the preceding run.
pub const InsertionAffinity = enum { at_start, preceding_visible };
pub fn insertionResource(rows: []const model.CharacterRun, visible_units: u32, start: u32, end: u32, affinity: InsertionAffinity) u32 {
    const preceding = start == end and start > 0 and (start == visible_units or affinity == .preceding_visible);
    return styleAt(rows, if (preceding) start - 1 else start);
}

pub fn append(a: std.mem.Allocator, rows: *std.ArrayList(model.CharacterRun), at: u32, id: u32) !void {
    if (rows.items.len > 0) {
        const last = &rows.items[rows.items.len - 1];
        if (last.start_unit == at) {
            last.char_shape_id = id;
            if (rows.items.len > 1 and rows.items[rows.items.len - 2].char_shape_id == id) _ = rows.pop();
            return;
        }
        if (last.char_shape_id == id) return;
    }
    try rows.append(a, .{ .start_unit = at, .char_shape_id = id });
}

/// Replace a span's style map; surviving units retain their own styles.
/// A splice inherits at start; a paint supplies an existing resource ID.
pub fn replace(a: std.mem.Allocator, rows: []const model.CharacterRun, start: u32, end: u32, added: u32, id: ?u32) ![]model.CharacterRun {
    var out: std.ArrayList(model.CharacterRun) = .empty;
    errdefer out.deinit(a);
    for (rows) |r| {
        if (r.start_unit >= start) break;
        try append(a, &out, r.start_unit, r.char_shape_id);
    }
    if (added != 0) try append(a, &out, start, id orelse styleAt(rows, start));
    try append(a, &out, start + added, styleAt(rows, end));
    for (rows) |r| {
        if (r.start_unit > end) try append(a, &out, r.start_unit - (end - start) + added, r.char_shape_id);
    }
    if (out.items.len > 65535) return error.LimitExceeded;
    return out.toOwnedSlice(a);
}
