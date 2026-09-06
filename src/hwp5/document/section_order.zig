const std = @import("std");
const Section = @import("types.zig").Section;
/// Canonical index order, allocated from supplied sections, never a declared count.
pub fn build(a: std.mem.Allocator, sections: []const Section) ![]usize {
    const order = try a.alloc(usize, sections.len);
    errdefer a.free(order);
    @memset(order, std.math.maxInt(usize));
    for (sections, 0..) |s, i| {
        if (s.index >= order.len) return error.InvalidSectionIndex;
        if (order[s.index] != std.math.maxInt(usize)) return error.DuplicateSectionIndex;
        order[s.index] = i;
    }
    return order;
}
