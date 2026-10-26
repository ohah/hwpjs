//! Failure injection for joined text and column coordinate ownership.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const edit = @import("column_boundary_joined_splice.zig");

fn expectUnchanged(before: *const Paragraph, after: *const Paragraph) !void {
    try std.testing.expectEqualSlices(@import("column_boundary_position.zig").Position, before.column_boundaries.?, after.column_boundaries.?);
    try std.testing.expectEqual(before.sites.items.len, after.sites.items.len);
    for (before.sites.items, after.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
    try std.testing.expectEqualSlices(@import("paragraph_joined_values.zig").Piece, before.pieces.?, after.pieces.?);
}

test "joined column splice preserves authority under every failed allocation" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀</p:t></p:run></p:p><p:p id='2'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    var merged = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &original, 0, 10000);
    defer merged.deinit(a);
    const before = &merged.paragraphs[0];
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &merged, 0, 1, 1, 3, 10000);
    defer split.deinit(a);
    try std.testing.expectEqual(@as(u32, 0), split.paragraphs[0].column_boundaries.?[0].unit);
    try std.testing.expectEqual(@as(u32, 2), split.paragraphs[1].column_boundaries.?[0].unit);
    var repeated = try @import("paragraph_structure_split.zig").prepare(a, &tree, &split, 1, 2, 2, 4, 10000);
    defer repeated.deinit(a);
    try @import("column_boundary_joined_group.zig").validate(a, &tree, repeated.paragraphs);
    const group_xml = try @import("column_boundary_group_xml.zig").write(a, &tree, repeated.paragraphs, .{}, 10000);
    defer a.free(group_xml);
    try std.testing.expect(std.mem.indexOf(u8, group_xml, "colCount='1'") != null);
    try std.testing.expect(std.mem.indexOf(u8, group_xml, "colCount='2'") != null);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const @import("paragraph_structure_values.zig").Values) !void {
            const output = try @import("paragraph_structure_save.zig").write(allocator, parsed, source, .{}, &.{}, 10000);
            defer allocator.free(output);
        }
    }.run, .{ &tree, &repeated });
    try std.testing.expectEqualStrings("A", repeated.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("😀", repeated.paragraphs[1].sites.items[0].text);
    try std.testing.expectEqualStrings("B", repeated.paragraphs[2].sites.items[1].text);
    var edited_group = try repeated.clone(a);
    defer edited_group.deinit(a);
    for (0..3) |index| try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &tree, &edited_group, index, 0, 0, "후😀", 10000));
    try @import("column_boundary_joined_group.zig").validate(a, &tree, edited_group.paragraphs);
    try std.testing.expectEqual(@as(u32, 5), edited_group.paragraphs[1].column_boundaries.?[0].unit);
    const edited_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &edited_group, .{}, &.{}, 10000);
    defer a.free(edited_xml);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const @import("paragraph_structure_values.zig").Values) !void {
            var candidate = try @import("paragraph_structure_split.zig").prepare(allocator, parsed, source, 0, 1, 1, 3, 10000);
            defer candidate.deinit(allocator);
        }
    }.run, .{ &tree, &merged });
    try @import("column_boundary_joined_group.zig").validate(a, &tree, split.paragraphs);
    const saved_source = split.paragraphs[1].column_boundaries.?[0].source_element;
    split.paragraphs[1].column_boundaries.?[0].source_element = split.paragraphs[0].column_boundaries.?[0].source_element;
    try std.testing.expectError(error.SourceBindingMismatch, @import("column_boundary_joined_group.zig").validate(a, &tree, split.paragraphs));
    split.paragraphs[1].column_boundaries.?[0].source_element = saved_source;
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, group: []const Paragraph) !void {
            try @import("column_boundary_joined_group.zig").validate(allocator, parsed, group);
        }
    }.run, .{ &tree, split.paragraphs });
    var current = try before.clone(a);
    defer current.deinit(a);
    try std.testing.expectError(error.SplitSurrogatePair, edit.splice(a, &tree, &current, 2, 0, "x", 10000));
    try expectUnchanged(before, &current);
    try std.testing.expectError(error.ProtectedColumnBoundary, edit.splice(a, &tree, &current, 0, 4, "", 10000));
    try expectUnchanged(before, &current);
    try std.testing.expectError(error.InvalidXmlCharacter, edit.splice(a, &tree, &current, 0, 0, &.{0}, 10000));
    try expectUnchanged(before, &current);
    try std.testing.expect(!try edit.splice(a, &tree, &current, 0, 0, "", 10000));
    try expectUnchanged(before, &current);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, source: *const Paragraph) !void {
            var candidate = try source.clone(allocator);
            defer candidate.deinit(allocator);
            _ = edit.splice(allocator, parsed, &candidate, 0, 0, "후😀<&", 10000) catch |err| {
                try expectUnchanged(source, &candidate);
                return err;
            };
            try std.testing.expectEqual(@as(u32, 0), candidate.column_boundaries.?[0].unit);
            try std.testing.expectEqual(@as(u32, 8), candidate.column_boundaries.?[1].unit);
            try std.testing.expectEqualStrings("후😀<&A😀", candidate.sites.items[0].text);
        }
    }.run, .{ &tree, before });
    try expectUnchanged(before, &current);
}
