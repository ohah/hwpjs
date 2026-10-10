//! Initialize explicit column ownership from current original-paragraph positions.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn install(a: std.mem.Allocator, tree: *const Tree, paragraph: *Paragraph, max_sites: usize) !void {
    if (paragraph.column_boundaries != null) return;
    if (paragraph.generated_id != null or paragraph.source_ordinal == null or paragraph.pieces != null or paragraph.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    const positions = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(positions);
    const boundaries = try @import("column_boundary_collect.zig").collect(a, tree, paragraph.template_element, positions, .right, max_sites);
    errdefer a.free(boundaries);
    for (boundaries) |*boundary| {
        _ = try @import("column_boundary_xml.zig").control(tree, boundary.source_element);
        if (boundary.unit == 0) boundary.affinity = .left;
    }
    paragraph.column_boundaries = boundaries;
}

test "column boundary materialize initializes prefix affinity atomically" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>ABC</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var original: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = try sites.clone(a) };
    defer original.deinit(a);
    var current = try original.clone(a);
    defer current.deinit(a);
    try install(a, &tree, &current, 100);
    try std.testing.expectEqual(@as(usize, 1), current.column_boundaries.?.len);
    try std.testing.expectEqual(@as(u32, 0), current.column_boundaries.?[0].unit);
    try std.testing.expectEqual(.left, current.column_boundaries.?[0].affinity);
    const installed = current.column_boundaries.?.ptr;
    try install(a, &tree, &current, 0);
    try std.testing.expectEqual(installed, current.column_boundaries.?.ptr);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const Paragraph) !void {
            var candidate = try source.clone(allocator);
            defer candidate.deinit(allocator);
            install(allocator, parsed, &candidate, 100) catch |err| {
                try std.testing.expect(candidate.column_boundaries == null);
                return err;
            };
        }
    }.run, .{ &tree, &original });
    try std.testing.expect(original.column_boundaries == null);
    try std.testing.expectEqualStrings("ABC", original.sites.items[0].text);
}
