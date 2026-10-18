//! Source placement provenance, not pixel layout or a mutable parent cache.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const owners = @import("table_display_owner.zig");
pub const Placement = struct { paragraph_template: usize, parent_cell: ?owners.Owner };

pub fn resolve(a: std.mem.Allocator, tree: *const Tree, table: usize) !Placement {
    if (table >= tree.elements.len or !fields.childIs(tree, table, "tbl")) return error.InvalidTablePlacementNode;
    var cursor = tree.elements[table].parent;
    var depth: usize = 0;
    while (cursor) |node| {
        if (node >= tree.elements.len or depth >= tree.elements.len) return error.SourceBindingMismatch;
        depth += 1;
        if (fields.childIs(tree, node, "p")) return .{ .paragraph_template = node, .parent_cell = try owners.resolve(a, tree, node) };
        cursor = tree.elements[node].parent;
    }
    return error.MissingTablePlacementParagraph;
}

test "HWPX table placement identifies actual nested parent cells without making paragraph copies" {
    try @import("../testing/checked_allocator.zig").run(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx", a, .limited(4_000_000));
            defer a.free(bytes);
            var session = try @import("editor_session.zig").open(a, bytes, .{});
            defer session.deinit();
            var tables: usize = 0;
            var nested: usize = 0;
            for (session.sections) |*section| {
                var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
                defer current.deinit(a);
                for (section.tree.elements, 0..) |_, index| {
                    if (!fields.childIs(&section.tree, index, "tbl")) continue;
                    const placement = try resolve(a, &section.tree, index);
                    const host = try @import("table_display_host.zig").currentOrdinal(current.paragraphs, section.first_paragraph, placement.paragraph_template);
                    try std.testing.expect(host >= section.first_paragraph and host <= section.last_paragraph);
                    try std.testing.expect(fields.childIs(&section.tree, placement.paragraph_template, "p"));
                    if (placement.parent_cell) |cell| {
                        try std.testing.expect(cell.table_node != index);
                        nested += 1;
                    }
                    tables += 1;
                    try std.testing.checkAllAllocationFailures(a, struct {
                        fn run(allocator: std.mem.Allocator, tree: *const Tree, table: usize, expected: Placement) !void {
                            try std.testing.expectEqualDeep(expected, try resolve(allocator, tree, table));
                        }
                    }.run, .{ &section.tree, index, placement });
                }
                try std.testing.expectError(error.InvalidTablePlacementNode, resolve(a, &section.tree, section.tree.elements.len));
            }
            try std.testing.expect(tables > 0);
            try std.testing.expect(nested > 0);
        }
    }.run, .{});
}
