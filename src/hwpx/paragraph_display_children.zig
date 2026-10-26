//! Selected display children of paraPr; raw XML and inactive branches stay intact.
const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");

pub fn child(a: std.mem.Allocator, tree: *const tree_mod.Tree, parent: usize, uri: []const u8, name: []const u8) !?usize {
    const Context = struct {
        found: ?usize = null,
        pub fn accept(self: *@This(), index: usize) !void {
            if (self.found != null) return error.DuplicateParagraphDisplayChild;
            self.found = index;
        }
    };
    var context: Context = .{};
    try @import("selected_display_children.zig").visit(a, tree, parent, uri, name, &context);
    return context.found;
}
