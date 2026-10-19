//! Selected display children of paraPr; raw XML and inactive branches stay intact.
const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const paragraph_uri = @import("document_xml.zig").paragraph_uri;
const selection = @import("compatibility_selection.zig");

pub fn child(a: std.mem.Allocator, tree: *const tree_mod.Tree, parent: usize, uri: []const u8, name: []const u8) !?usize {
    var found: ?usize = null;
    try visit(a, tree, parent, uri, name, 0, &found);
    return found;
}

fn visit(a: std.mem.Allocator, tree: *const tree_mod.Tree, parent: usize, uri: []const u8, name: []const u8, depth: usize, found: *?usize) anyerror!void {
    if (depth > 64) return error.LimitExceeded;
    if (parent >= tree.elements.len) return error.InvalidElementIndex;
    var cursor = tree.elements[parent].first_child;
    while (cursor) |index| : (cursor = tree.elements[index].next_sibling) {
        const element = tree.elements[index];
        if (element.is(uri, name)) {
            if (found.* != null) return error.DuplicateParagraphDisplayChild;
            found.* = index;
        } else if (element.is(paragraph_uri, "switch")) {
            var state: selection.State = .{};
            var branch = element.first_child;
            while (branch) |branch_index| : (branch = tree.elements[branch_index].next_sibling) {
                const candidate = tree.elements[branch_index];
                const is_case = candidate.is(paragraph_uri, "case");
                if (!is_case and !candidate.is(paragraph_uri, "default")) continue;
                // No HwpUnitChar capability is claimed: use the shared fallback policy.
                if (try selection.chooseTree(a, tree, branch_index, is_case, 4096, .{ .mode = .selected }, &state)) {
                    try visit(a, tree, branch_index, uri, name, depth + 1, found);
                }
            }
        }
    }
}
