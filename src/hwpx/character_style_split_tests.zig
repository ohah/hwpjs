const std = @import("std");
test "HWPX character style split clips selected deletion and rebases generated paragraph sites" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='7'><p:t>A😀B</p:t></p:run><p:run charPrIDRef='7'><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer values.deinit(a);
    const positions = try @import("paragraph_text_positions.zig").build(a, &tree, &values.paragraphs[0].sites, locations, 1);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, &tree, &values.paragraphs[0].sites, positions, 100);
    defer a.free(projection);
    const original = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
    defer a.free(original);
    values.paragraphs[0].character_styles = try @import("character_style_paint.zig").prepare(a, &values.paragraphs[0].sites, original, 1, 3, 9, &.{ 7, 9 }, 100);
    const split = @import("paragraph_structure_split.zig").prepare;
    var result = try split(a, &tree, &values, 0, 3, 4, 2, 10000);
    defer result.deinit(a);
    try std.testing.expectEqualStrings("A😀", result.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("C", result.paragraphs[1].sites.items[1].text);
    try std.testing.expectEqual(@as(usize, 0), result.paragraphs[1].character_styles.?[1].site_start_unit);
    try std.testing.expectEqual(@as(?u32, 9), result.paragraphs[0].character_styles.?[1].char_shape_id);
    const xml = try @import("paragraph_structure_save.zig").write(a, &tree, &result, .{}, &.{}, 10000);
    defer a.free(xml);
    try std.testing.expect(std.mem.indexOf(u8, xml, "charPrIDRef='9'><p:t>😀</p:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<p:p id='2'") != null);
    try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &tree, &result, 1, 0, 0, "생성", 10000));
    try std.testing.expectEqualStrings("생성", result.paragraphs[1].sites.items[0].text);
    try std.testing.expectError(error.SplitSurrogatePair, split(a, &tree, &values, 0, 2, 2, 2, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, v: *const @import("paragraph_structure_values.zig").Values) !void {
            var copy = try @import("paragraph_structure_split.zig").prepare(allocator, t, v, 0, 3, 4, 2, 10000);
            defer copy.deinit(allocator);
        }
    }.run, .{ &tree, &values });
    try std.testing.expectEqualStrings("A😀B", values.paragraphs[0].sites.items[0].text);
}
