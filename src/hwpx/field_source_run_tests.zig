const std = @import("std");

test "field source run writer closes namespaces and retains crossing markers" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:q='http://www.hancom.co.kr/hwpml/2011/paragraph'><q:p><q:run><q:ctrl><q:fieldBegin id='77' type='HYPERLINK'/></q:ctrl><q:t>A😀</q:t></q:run></q:p><q:p><q:run><q:t>B</q:t><q:ctrl><q:fieldEnd beginIDRef='77'/></q:ctrl></q:run></q:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer current.deinit(a);
    _ = try @import("text_site_edit.zig").splice(a, &current.paragraphs[1].sites, 0, 0, 0, "새😀<&", 1000);
    const first_run = tree.elements[current.paragraphs[0].template_element].first_child.?;
    try std.testing.expectError(error.UnsupportedParagraphControl, @import("run_current_xml.zig").write(a, &tree, &current.paragraphs[0], first_run, .{}, 10000));
    var generated = current.paragraphs[0];
    generated.generated_id = 91;
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, @import("run_current_xml.zig").writeSourceFields(a, &tree, &generated, first_run, .{}, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, values: *const @import("paragraph_structure_values.zig").Values) !void {
            var output: std.ArrayList(u8) = .empty;
            defer output.deinit(allocator);
            try output.appendSlice(allocator, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>");
            for (values.paragraphs) |*row| {
                const fragment = try @import("run_current_xml.zig").writeSourceFields(allocator, source, row, source.elements[row.template_element].first_child.?, .{}, 10000);
                defer allocator.free(fragment);
                try output.appendSlice(allocator, fragment);
                const empty = try @import("run_current_xml.zig").writeOwnedFields(allocator, source, row, source.elements[row.template_element].first_child.?, .{}, &.{}, &.{}, true, 10000);
                defer allocator.free(empty);
                try std.testing.expect(std.mem.indexOf(u8, empty, "fieldBegin") == null);
                try std.testing.expect(std.mem.indexOf(u8, empty, "fieldEnd") == null);
                const run_locations = try @import("paragraph_structure_locations.zig").build(allocator, source, row);
                defer allocator.free(run_locations);
                const positions = try @import("paragraph_text_positions.zig").build(allocator, source, &row.sites, run_locations, 1);
                defer allocator.free(positions);
                const projection = try @import("character_style_projection.zig").build(allocator, source, &row.sites, positions, 1000);
                defer allocator.free(projection);
                const spans = try @import("character_style_paint.zig").fromProjection(allocator, projection, 1000);
                defer allocator.free(spans);
                for (spans) |*span| span.char_shape_id = 9;
                const styled = try @import("character_style_run_closed.zig").writeFieldsCurrent(allocator, source, &row.sites, spans, &.{}, &.{}, true, 10000);
                defer allocator.free(styled);
                try std.testing.expect(std.mem.indexOf(u8, styled, "fieldBegin") == null);
                try std.testing.expect(std.mem.indexOf(u8, styled, "fieldEnd") == null);
                try std.testing.expect(std.mem.indexOf(u8, styled, "charPrIDRef") != null);
            }
            try output.appendSlice(allocator, "</p:p></s:sec>");
            var saved = try @import("xml_part_tree.zig").parse(allocator, output.items, .section, 0, 0, .{});
            defer saved.deinit(allocator);
            const trees = [_]@import("xml_part_tree.zig").Tree{saved};
            var fields = try @import("field_markers.zig").inspect(allocator, &trees, .{});
            defer fields.deinit();
            try std.testing.expectEqual(@as(usize, 2), fields.markers.len);
            try std.testing.expectEqual(@as(usize, 0), fields.unmatched_begins);
            try std.testing.expectEqual(@as(usize, 0), fields.unresolved_ends);
            try std.testing.expect(std.mem.indexOf(u8, output.items, "새😀&lt;&amp;B") != null);
        }
    }.run, .{ &tree, &current });
    try std.testing.expectEqualStrings(xml, tree.source);
}
