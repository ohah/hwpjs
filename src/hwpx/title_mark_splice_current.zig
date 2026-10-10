//! Called only on a detached text/style candidate before publication.
const std = @import("std");
pub fn apply(a: std.mem.Allocator, paragraph: *@import("paragraph_structure_values.zig").Paragraph, start: usize, deleted: usize, inserted: usize) !void {
    const current = paragraph.title_positions orelse return;
    const moved = try @import("title_mark_position.zig").splice(a, current, start, deleted, inserted);
    a.free(current);
    paragraph.title_positions = moved;
}
