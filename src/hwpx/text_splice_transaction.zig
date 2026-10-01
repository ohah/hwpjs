const std = @import("std");
const sites_module = @import("text_sites.zig");
const edit = @import("text_site_edit.zig");

/// Shared atomic string transaction. Callers own structural/type permission
/// checks; an explicit site provides field-owned insertion affinity.
pub fn spliceProjected(a: std.mem.Allocator, sites: *sites_module.Sites, positions: []const @import("paragraph_text_positions.zig").Segment, start: u32, deleted: u32, inserted: []const u8, max_bytes: usize, insertion_site: ?usize) !bool {
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    try @import("paragraph_text_positions.zig").validateRange(positions, start, end);
    // Text equality is a semantic no-op across run boundaries too. Do not
    // redistribute unchanged text into the insertion run and lose styling.
    var current: std.ArrayList(u8) = .empty;
    defer current.deinit(a);
    for (positions) |position| {
        try current.appendSlice(a, @import("paragraph_text_positions.zig").segmentText(sites, position));
    }
    const start_byte = try edit.bytePosition(current.items, start);
    const end_byte = try edit.bytePosition(current.items, end);
    if (std.mem.eql(u8, current.items[start_byte..end_byte], inserted)) return false;
    // Existing source text retains insertion affinity; derived empty anchor
    // boundaries are fallback sites only, never a new styling preference.
    const target_site = insertion_site orelse blk: {
        var fallback: ?usize = null;
        for (positions) |position| {
            if (position.kind != .text or start < position.start_unit or start > position.end_unit) continue;
            if (!sites.items[position.index].anchor_boundary) break :blk @as(?usize, position.index);
            if (fallback == null) fallback = position.index;
        }
        break :blk fallback;
    };
    // Draft owns every current string; no original site is touched on failure.
    var draft = try sites.clone(a);
    errdefer draft.deinit(a);
    var inserted_once = false;
    var changed = false;
    for (positions) |position| {
        if (position.kind != .text) continue;
        const index = position.index;
        const cursor = position.start_unit;
        const stop = position.end_unit;
        const insert_here = !inserted_once and target_site == index and start >= cursor and start <= stop;
        const low = @max(@as(usize, start), cursor);
        const high = @min(@as(usize, end), stop);
        if (insert_here or high > low) {
            const local_start: u32 = @intCast(if (insert_here) start - cursor else low - cursor);
            const local_delete: u32 = @intCast(if (high > low) high - low else 0);
            changed = (try edit.splice(a, &draft, index, local_start, local_delete, if (insert_here) inserted else "", max_bytes)) or changed;
            if (insert_here) inserted_once = true;
        }
    }
    if (!inserted_once) return error.InvalidTextPosition;
    var bytes: usize = 0;
    for (draft.items) |site| {
        if (site.text.len > max_bytes -| bytes) return error.LimitExceeded;
        bytes += site.text.len;
    }
    if (!changed) {
        draft.deinit(a);
        return false;
    }
    sites.deinit(a);
    sites.* = draft;
    return true;
}
