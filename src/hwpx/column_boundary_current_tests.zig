//! Owned-model save integration, separate from relocation-fragment tests.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("paragraph_structure_values.zig").Values;

test "column boundary current model save preserves all owned text and every failed allocation" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='9'><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>AB</p:t><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>CD</p:t></p:run></p:p><p:p id='2'><p:run><p:t>other</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer values.deinit(a);
    values.paragraphs[0].column_boundaries = try @import("column_boundary_collect.zig").collect(a, &tree, values.paragraphs[0].template_element, &.{}, .right, 2);
    values.paragraphs[0].column_boundaries.?[0].unit = 1;
    values.paragraphs[0].column_boundaries.?[1].unit = 4;
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &values.paragraphs[0].sites, 0, 1, 1, "😀", 10000));
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &values.paragraphs[1].sites, 0, 0, 5, "changed", 10000));
    const output = try @import("paragraph_structure_save.zig").write(a, &tree, &values, .{}, &.{}, 10000);
    defer a.free(output);
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var current = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer current.deinit(a);
    try std.testing.expectEqual(@as(usize, 5), current.items.len);
    for (current.items, [_][]const u8{ "A", "😀", "C", "D", "changed" }) |site, expected| try std.testing.expectEqualStrings(expected, site.text);
    const bound = try @import("text_site_locations.zig").build(a, &reopened, &current, .{});
    defer a.free(bound);
    const positions = try @import("anchor_text_positions.zig").build(a, &reopened, &current, bound, 1);
    defer a.free(positions);
    const boundaries = try @import("column_boundary_collect.zig").collect(a, &reopened, 1, positions, .right, 2);
    defer a.free(boundaries);
    try std.testing.expectEqual(@as(usize, 2), boundaries.len);
    for (boundaries, values.paragraphs[0].column_boundaries.?) |actual, expected| {
        try std.testing.expectEqual(expected.unit, actual.unit);
        try std.testing.expectEqualStrings(tree.sourceOf(expected.source_element), reopened.sourceOf(actual.source_element));
    }
    values.paragraphs[0].column_boundaries.?[0].unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, @import("paragraph_structure_save.zig").write(a, &tree, &values, .{}, &.{}, 10000));
    values.paragraphs[0].column_boundaries.?[0].unit = 1;
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, owned: *const Values) !void {
            const result = @import("paragraph_structure_save.zig").write(allocator, parsed, owned, .{}, &.{}, 10000) catch |err| {
                try std.testing.expectEqual(@as(u32, 1), owned.paragraphs[0].column_boundaries.?[0].unit);
                try std.testing.expectEqualStrings("A😀", owned.paragraphs[0].sites.items[0].text);
                try std.testing.expectEqualStrings("changed", owned.paragraphs[1].sites.items[0].text);
                return err;
            };
            defer allocator.free(result);
        }
    }.run, .{ &tree, &values });
    const splice = @import("paragraph_structure_splice.zig").splice;
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, 3, 3, 123, 10000);
    defer split.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), split.paragraphs[0].column_boundaries.?.len);
    try std.testing.expectEqual(@as(usize, 1), split.paragraphs[1].column_boundaries.?.len);
    try std.testing.expectEqual(@as(u32, 1), split.paragraphs[0].column_boundaries.?[0].unit);
    try std.testing.expectEqual(@as(u32, 1), split.paragraphs[1].column_boundaries.?[0].unit);
    try std.testing.expectEqualStrings("A😀", split.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("", split.paragraphs[1].sites.items[0].text);
    const group = try @import("column_boundary_group_xml.zig").write(a, &tree, split.paragraphs[0..2], .{}, 10000);
    defer a.free(group);
    const original_node = tree.elements[values.paragraphs[0].template_element];
    const grouped = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = original_node.start_tag.start, .end = original_node.end, .text = "", .serialized_xml = group }}, 10000);
    defer a.free(grouped);
    var group_tree = try @import("xml_part_tree.zig").parse(a, grouped, .section, 0, 0, .{});
    defer group_tree.deinit(a);
    var group_sites = try @import("text_sites.zig").collect(a, &group_tree, .{});
    defer group_sites.deinit(a);
    const group_locations = try @import("text_site_locations.zig").build(a, &group_tree, &group_sites, .{});
    defer a.free(group_locations);
    for ([_]usize{ 1, 2 }, 0..) |ordinal, index| {
        const owner = try @import("paragraph_site_owner.zig").resolve(&group_tree, &group_sites, group_locations, ordinal);
        const group_positions = try @import("anchor_text_positions.zig").build(a, &group_tree, &group_sites, group_locations, ordinal);
        defer a.free(group_positions);
        const restored_columns = try @import("column_boundary_collect.zig").collect(a, &group_tree, owner, group_positions, .right, 1);
        defer a.free(restored_columns);
        try std.testing.expectEqual(@as(usize, 1), restored_columns.len);
        try std.testing.expectEqual(@as(u32, 1), restored_columns[0].unit);
        try std.testing.expectEqualStrings(tree.sourceOf(split.paragraphs[index].column_boundaries.?[0].source_element), group_tree.sourceOf(restored_columns[0].source_element));
        var paragraph_text: std.ArrayList(u8) = .empty;
        defer paragraph_text.deinit(a);
        for (group_sites.items, group_locations) |site, location| if (location.paragraph_ordinal == ordinal) {
            try paragraph_text.appendSlice(a, site.text);
        };
        try std.testing.expectEqualStrings(if (index == 0) "A😀" else "CD", paragraph_text.items);
    }
    const split_saved = try @import("paragraph_structure_save.zig").write(a, &tree, &split, .{}, &.{}, 10000);
    defer a.free(split_saved);
    try std.testing.expect(std.mem.indexOf(u8, split_saved, group) != null);
    try std.testing.expect(std.mem.indexOf(u8, split_saved, "changed") != null);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current_split: *const Values) !void {
            const bytes = @import("column_boundary_group_xml.zig").write(allocator, parsed, current_split.paragraphs[0..2], .{}, 10000) catch |err| {
                try std.testing.expectEqual(@as(u32, 1), current_split.paragraphs[0].column_boundaries.?[0].unit);
                try std.testing.expectEqual(@as(u32, 1), current_split.paragraphs[1].column_boundaries.?[0].unit);
                try std.testing.expectEqualStrings("A😀", current_split.paragraphs[0].sites.items[0].text);
                return err;
            };
            defer allocator.free(bytes);
        }
    }.run, .{ &tree, &split });
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, original_split: *const Values) !void {
            var copy = try original_split.clone(allocator);
            defer copy.deinit(allocator);
            _ = @import("paragraph_structure_splice.zig").splice(allocator, parsed, &copy, 1, 0, 0, "X😀", 10000) catch |err| {
                for (original_split.paragraphs, copy.paragraphs) |before, after| {
                    if (before.column_boundaries) |owned_boundaries| try std.testing.expectEqualSlices(@import("column_boundary_position.zig").Position, owned_boundaries, after.column_boundaries.?);
                    for (before.sites.items, after.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                }
                return err;
            };
            try std.testing.expectEqual(@as(u32, 4), copy.paragraphs[1].column_boundaries.?[0].unit);
        }
    }.run, .{ &tree, &split });
    try std.testing.expect(try splice(a, &tree, &split, 1, 0, 0, "X😀", 10000));
    try std.testing.expectEqual(@as(u32, 1), split.paragraphs[0].column_boundaries.?[0].unit);
    try std.testing.expectEqual(@as(u32, 4), split.paragraphs[1].column_boundaries.?[0].unit);
    const generated_text = try @import("paragraph_protected_positions.zig").text(a, &tree, &split.paragraphs[1], 10000);
    defer a.free(generated_text);
    try std.testing.expectEqualStrings("X😀CD", generated_text);
    try std.testing.expect(!try splice(a, &tree, &split, 1, 0, 3, "X😀", 10000));
    try std.testing.expectError(error.ProtectedColumnBoundary, splice(a, &tree, &split, 1, 3, 2, "", 10000));
    try std.testing.expectError(error.SplitSurrogatePair, splice(a, &tree, &split, 1, 2, 0, "x", 10000));
    const generated_saved = try @import("paragraph_structure_save.zig").write(a, &tree, &split, .{}, &.{}, 10000);
    defer a.free(generated_saved);
    try std.testing.expect(std.mem.indexOf(u8, generated_saved, "X😀") != null);
    var repeated = try @import("paragraph_structure_split.zig").prepare(a, &tree, &split, 1, 3, 3, 124, 10000);
    defer repeated.deinit(a);
    try std.testing.expectEqual(@as(?u32, 123), repeated.paragraphs[1].generated_id);
    try std.testing.expectEqual(@as(?u32, 124), repeated.paragraphs[2].generated_id);
    try std.testing.expectEqual(@as(usize, 0), repeated.paragraphs[1].column_boundaries.?.len);
    try std.testing.expectEqual(@as(u32, 1), repeated.paragraphs[2].column_boundaries.?[0].unit);
    const repeated_saved = try @import("paragraph_structure_save.zig").write(a, &tree, &repeated, .{}, &.{}, 10000);
    defer a.free(repeated_saved);
    try std.testing.expect(std.mem.indexOf(u8, repeated_saved, "id='124'") != null);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, original: *const Values) !void {
            var candidate = @import("paragraph_structure_split.zig").prepare(allocator, parsed, original, 1, 3, 3, 124, 10000) catch |err| {
                try std.testing.expectEqual(@as(usize, 3), original.paragraphs.len);
                try std.testing.expectEqual(@as(u32, 4), original.paragraphs[1].column_boundaries.?[0].unit);
                try std.testing.expectEqual(@as(?u32, 123), original.paragraphs[1].generated_id);
                return err;
            };
            defer candidate.deinit(allocator);
        }
    }.run, .{ &tree, &split });
    try std.testing.expectError(error.SplitSurrogatePair, @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, 2, 2, 123, 10000));
    try std.testing.expectError(error.ProtectedColumnBoundary, @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, 0, 3, 123, 10000));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, original: *const Values) !void {
            var result = @import("paragraph_structure_split.zig").prepare(allocator, parsed, original, 0, 3, 3, 123, 10000) catch |err| {
                try std.testing.expectEqual(@as(u32, 1), original.paragraphs[0].column_boundaries.?[0].unit);
                try std.testing.expectEqual(@as(u32, 4), original.paragraphs[0].column_boundaries.?[1].unit);
                try std.testing.expectEqualStrings("A😀", original.paragraphs[0].sites.items[0].text);
                return err;
            };
            defer result.deinit(allocator);
            try std.testing.expectEqual(@as(u32, 1), original.paragraphs[0].column_boundaries.?[0].unit);
            try std.testing.expectEqual(@as(u32, 4), original.paragraphs[0].column_boundaries.?[1].unit);
            try std.testing.expectEqualStrings("A😀", original.paragraphs[0].sites.items[0].text);
        }
    }.run, .{ &tree, &values });
    const columns = values.paragraphs[0].column_boundaries.?;
    columns[1].unit = 1;
    std.mem.swap(usize, &columns[0].source_element, &columns[1].source_element);
    try std.testing.expectError(error.InvalidColumnBoundaryOrder, splice(a, &tree, &values, 0, 0, 0, "X", 10000));
    try std.testing.expectError(error.InvalidColumnBoundaryOrder, @import("paragraph_structure_save.zig").write(a, &tree, &values, .{}, &.{}, 10000));
    try std.testing.expectEqualStrings("A😀", values.paragraphs[0].sites.items[0].text);
    std.mem.swap(usize, &columns[0].source_element, &columns[1].source_element);
    columns[1].unit = 4;
    values.paragraphs[0].column_boundaries.?[1].unit = 1;
    values.paragraphs[0].column_boundaries.?[1].affinity = .left;
    try std.testing.expectError(error.InvalidColumnBoundaryOrder, splice(a, &tree, &values, 0, 1, 0, "X", 10000));
    try std.testing.expectEqualStrings("A😀", values.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqual(@as(u32, 1), values.paragraphs[0].column_boundaries.?[0].unit);
    try std.testing.expectEqual(@as(u32, 1), values.paragraphs[0].column_boundaries.?[1].unit);
    values.paragraphs[0].column_boundaries.?[1].unit = 4;
    values.paragraphs[0].column_boundaries.?[1].affinity = .right;
    values.paragraphs[0].column_boundaries.?[0].unit = 5;
    try std.testing.expectError(error.InvalidColumnBoundaryOrder, splice(a, &tree, &values, 0, 0, 0, "X", 10000));
    try std.testing.expectEqualStrings("A😀", values.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqual(@as(u32, 5), values.paragraphs[0].column_boundaries.?[0].unit);
    values.paragraphs[0].column_boundaries.?[0].unit = 1;
    try std.testing.expect(!try splice(a, &tree, &values, 0, 1, 2, "😀", 10000));
    try std.testing.expectError(error.ProtectedColumnBoundary, splice(a, &tree, &values, 0, 0, 3, "", 10000));
    try std.testing.expectError(error.SplitSurrogatePair, splice(a, &tree, &values, 0, 2, 0, "X", 10000));
    try std.testing.expectError(error.InvalidXmlCharacter, splice(a, &tree, &values, 0, 0, 0, &.{0}, 10000));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, original: *const Values) !void {
            var copy = try original.clone(allocator);
            defer copy.deinit(allocator);
            _ = @import("paragraph_structure_splice.zig").splice(allocator, parsed, &copy, 0, 0, 0, "X", 10000) catch |err| {
                try std.testing.expectEqualSlices(@import("column_boundary_position.zig").Position, original.paragraphs[0].column_boundaries.?, copy.paragraphs[0].column_boundaries.?);
                for (original.paragraphs, copy.paragraphs) |before, after| {
                    for (before.sites.items, after.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                }
                return err;
            };
            try std.testing.expectEqual(@as(u32, 2), copy.paragraphs[0].column_boundaries.?[0].unit);
        }
    }.run, .{ &tree, &values });
    try std.testing.expect(try splice(a, &tree, &values, 0, 0, 0, "X", 10000));
    try std.testing.expectEqualStrings("XA😀", values.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqual(@as(u32, 2), values.paragraphs[0].column_boundaries.?[0].unit);
    try std.testing.expectEqual(@as(u32, 5), values.paragraphs[0].column_boundaries.?[1].unit);
    const edited = try @import("paragraph_structure_save.zig").write(a, &tree, &values, .{}, &.{}, 10000);
    defer a.free(edited);
    try std.testing.expect(std.mem.indexOf(u8, edited, "XA") != null);
    try std.testing.expectEqualStrings(xml, tree.source);
}
