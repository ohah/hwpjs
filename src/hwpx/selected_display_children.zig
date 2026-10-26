//! Shared selected-child traversal; unsupported namespace capabilities are never claimed.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const paragraph = @import("document_xml.zig").paragraph_uri;
const selection = @import("compatibility_selection.zig");

pub fn visit(a: std.mem.Allocator, tree: *const Tree, parent: usize, uri: []const u8, name: []const u8, context: anytype) !void {
    try visitDepth(a, tree, parent, uri, name, 0, context);
}

fn visitDepth(a: std.mem.Allocator, tree: *const Tree, parent: usize, uri: []const u8, name: []const u8, depth: usize, context: anytype) anyerror!void {
    if (depth > 64) return error.LimitExceeded;
    if (parent >= tree.elements.len) return error.InvalidElementIndex;
    var child = tree.elements[parent].first_child;
    while (child) |node| : (child = tree.elements[node].next_sibling) {
        const element = tree.elements[node];
        if (element.is(uri, name)) {
            try context.accept(node);
        } else if (element.is(paragraph, "switch")) {
            var state: selection.State = .{};
            var branch = element.first_child;
            while (branch) |index| : (branch = tree.elements[index].next_sibling) {
                const candidate = tree.elements[index];
                const is_case = candidate.is(paragraph, "case");
                if (!is_case and !candidate.is(paragraph, "default")) continue;
                if (try selection.chooseTree(a, tree, index, is_case, 4096, .{ .mode = .selected }, &state))
                    try visitDepth(a, tree, index, uri, name, depth + 1, context);
            }
        }
    }
}
