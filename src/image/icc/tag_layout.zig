const std = @import("std");
const Tag = @import("tag.zig").Tag;
/// No implicit revision fallback. Bounded reports overlap/gaps without certifying
/// their legality; icc_2022 enforces contiguous zero-padded unique element storage.
pub const Policy = enum { bounded, icc_2022 };
pub const Stats = struct {
    unique_elements: usize = 0,
    shared_entries: usize = 0,
    overlapping_elements: usize = 0,
    unreferenced_bytes: usize = 0,
    padding_bytes_validated: usize = 0,
    layout_validated: bool,
};
/// Internal: tags have passed tag.parse; order contains all indices sorted by
/// offset then length. Neither the descriptor order nor input bytes are modified.
pub fn inspect(bytes: []const u8, table_end: usize, tags: []const Tag, order: []const usize, policy: Policy) !Stats {
    var result: Stats = .{ .layout_validated = policy == .icc_2022 };
    var cursor = table_end;
    var previous: ?Tag = null;
    for (order) |i| {
        const tag = tags[i];
        if (previous) |p| {
            if (tag.offset == p.offset and tag.data.len == p.data.len) {
                result.shared_entries += 1;
                continue;
            }
        }
        previous = tag;
        result.unique_elements += 1;
        const end = tag.offset + tag.data.len; // already bounded by tag.parse
        if (tag.offset < cursor) {
            if (policy == .icc_2022) return error.InvalidIccTagOverlap;
            result.overlapping_elements += 1;
        } else if (tag.offset > cursor) {
            if (policy == .icc_2022) return error.InvalidIccTagGap;
            result.unreferenced_bytes += tag.offset - cursor;
        }
        cursor = @max(cursor, end);
        if (policy == .icc_2022) {
            const pad = (4 - tag.data.len % 4) % 4;
            if (pad > bytes.len - end) return error.InvalidIccTagPadding;
            if (!std.mem.allEqual(u8, bytes[end..][0..pad], 0)) return error.InvalidIccTagPadding;
            result.padding_bytes_validated += pad;
            result.unreferenced_bytes += pad;
            cursor = end + pad;
        }
    }
    if (cursor < bytes.len) {
        if (policy == .icc_2022) return error.InvalidIccTagGap;
        result.unreferenced_bytes += bytes.len - cursor;
    }
    return result;
}
