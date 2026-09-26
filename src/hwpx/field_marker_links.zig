const std = @import("std");

pub const Issue = enum { none, missing_reference, missing_begin, ambiguous_begin, forward_reference, duplicate_end };

pub const Summary = struct {
    duplicate_begin_ids: usize = 0,
    unmatched_begins: usize = 0,
    unresolved_ends: usize = 0,
    non_lifo_closures: usize = 0,
    fieldid_mismatches: usize = 0,
};

const Entry = struct { index: usize, ambiguous: bool = false };

/// Links only within one selected section. Missing/duplicate/forward IDs stay
/// diagnostics; no pairing is inferred from fieldid or visual order alone.
pub fn link(a: std.mem.Allocator, markers: anytype, base: usize) !Summary {
    var summary: Summary = .{};
    var begins: std.AutoHashMapUnmanaged(u32, Entry) = .empty;
    defer begins.deinit(a);
    for (markers, 0..) |*marker, index| {
        if (marker.kind != .begin) continue;
        const id = marker.begin.?.id orelse continue;
        const slot = try begins.getOrPut(a, id);
        if (slot.found_existing) {
            slot.value_ptr.ambiguous = true;
            markers[slot.value_ptr.index].duplicate_begin_id = true;
            marker.duplicate_begin_id = true;
            summary.duplicate_begin_ids += 1;
        } else slot.value_ptr.* = .{ .index = index };
    }
    for (markers, 0..) |*marker, index| {
        if (marker.kind != .end) continue;
        const ref = marker.end.?.begin_id_ref orelse {
            marker.link_issue = .missing_reference;
            summary.unresolved_ends += 1;
            continue;
        };
        const entry = begins.get(ref) orelse {
            marker.link_issue = .missing_begin;
            summary.unresolved_ends += 1;
            continue;
        };
        if (entry.ambiguous) {
            marker.link_issue = .ambiguous_begin;
            summary.unresolved_ends += 1;
            continue;
        }
        if (entry.index >= index) {
            marker.link_issue = .forward_reference;
            summary.unresolved_ends += 1;
            continue;
        }
        const begin = &markers[entry.index];
        if (begin.matched_marker_index != null) {
            marker.link_issue = .duplicate_end;
            summary.unresolved_ends += 1;
            continue;
        }
        begin.matched_marker_index = base + index;
        marker.matched_marker_index = base + entry.index;
        if (begin.begin.?.fieldid) |begin_fieldid| {
            if (marker.end.?.fieldid) |end_fieldid| {
                marker.fieldid_mismatch = begin_fieldid != end_fieldid;
                summary.fieldid_mismatches += @intFromBool(marker.fieldid_mismatch);
            }
        }
    }
    for (markers) |marker| {
        if (marker.kind == .begin and marker.matched_marker_index == null) summary.unmatched_begins += 1;
    }

    const closed = try a.alloc(bool, markers.len);
    defer a.free(closed);
    @memset(closed, false);
    var stack: std.ArrayList(usize) = .empty;
    defer stack.deinit(a);
    for (markers, 0..) |*marker, index| {
        if (marker.kind == .begin) {
            try stack.append(a, index);
            continue;
        }
        const begin_global = marker.matched_marker_index orelse continue;
        const begin_index = begin_global - base;
        if (stack.items.len == 0 or stack.items[stack.items.len - 1] != begin_index) {
            marker.non_lifo = true;
            summary.non_lifo_closures += 1;
        }
        closed[begin_index] = true;
        while (stack.items.len != 0 and closed[stack.items[stack.items.len - 1]]) _ = stack.pop();
    }
    return summary;
}
