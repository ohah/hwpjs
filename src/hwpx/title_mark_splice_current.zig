//! Detached text/style candidate only; both owner arrays commit atomically.
const std = @import("std");
pub fn apply(a: std.mem.Allocator, paragraph: *@import("paragraph_structure_values.zig").Paragraph, start: usize, deleted: usize, inserted: usize) !void {
    return applyAtInsertion(a, paragraph, start, deleted, inserted, null);
}

pub fn applyAtInsertion(a: std.mem.Allocator, paragraph: *@import("paragraph_structure_values.zig").Paragraph, start: usize, deleted: usize, inserted: usize, insertion: ?@import("title_fragment_owner.zig").Insertion) !void {
    const moved_owners: ?[]@import("title_fragment_owner.zig").Owner = if (paragraph.title_fragment_owners) |owners|
        try @import("title_fragment_owner.zig").spliceAtInsertion(a, owners, start, deleted, inserted, insertion)
    else
        null;
    errdefer if (moved_owners) |owners| a.free(owners);
    const moved_titles: ?[]@import("title_mark_position.zig").Position = if (paragraph.title_positions) |titles|
        try @import("title_mark_position.zig").splice(a, titles, start, deleted, inserted)
    else
        null;
    if (paragraph.title_fragment_owners) |owners| a.free(owners);
    if (paragraph.title_positions) |titles| a.free(titles);
    paragraph.title_fragment_owners = moved_owners;
    paragraph.title_positions = moved_titles;
}
