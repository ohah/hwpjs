const std = @import("std");
test "HWPX character style splice preserves left affinity across boundaries and failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>A😀B</p:t></p:run><p:run charPrIDRef='7'><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer values.deinit(a);
    const paragraph = &values.paragraphs[0];
    const positions = try @import("paragraph_text_positions.zig").build(a, &tree, &paragraph.sites, locations, 1);
    defer a.free(positions);
    const projection = try @import("character_style_projection.zig").build(a, &tree, &paragraph.sites, positions, 100);
    defer a.free(projection);
    const original = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
    defer a.free(original);
    paragraph.character_styles = try @import("character_style_paint.zig").prepare(a, &paragraph.sites, original, 1, 3, 9, &.{ 7, 9 }, 100);
    const splice = @import("character_style_splice.zig").splice;
    try std.testing.expectError(error.SplitSurrogatePair, splice(a, &tree, paragraph, 2, 0, "x", 10000));
    try std.testing.expect(!try splice(a, &tree, paragraph, 1, 2, "😀", 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, p: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            var copy = try p.clone(allocator);
            defer copy.deinit(allocator);
            _ = @import("character_style_splice.zig").splice(allocator, t, &copy, 3, 0, "x", 10000) catch |err| {
                try std.testing.expectEqualStrings(p.sites.items[0].text, copy.sites.items[0].text);
                try std.testing.expectEqualSlices(@import("character_style_paint.zig").Span, p.character_styles.?, copy.character_styles.?);
                return err;
            };
        }
    }.run, .{ &tree, paragraph });
    try std.testing.expect(try splice(a, &tree, paragraph, 3, 0, "x", 10000));
    try std.testing.expectEqualStrings("A😀xB", paragraph.sites.items[0].text);
    try std.testing.expectEqual(@as(?u32, 9), paragraph.character_styles.?[1].char_shape_id);
    try std.testing.expectEqual(@as(usize, 4), paragraph.character_styles.?[1].end_unit);
    try std.testing.expect(try splice(a, &tree, paragraph, 1, 3, "", 10000));
    try std.testing.expectEqualStrings("AB", paragraph.sites.items[0].text);
    try std.testing.expectEqual(@as(usize, 2), paragraph.character_styles.?.len);
    try std.testing.expect(try splice(a, &tree, paragraph, 1, 2, "😀", 10000));
    try std.testing.expectEqualStrings("A😀", paragraph.sites.items[0].text);
    try std.testing.expectEqualStrings("", paragraph.sites.items[1].text);
    try std.testing.expectEqual(@as(usize, 3), paragraph.character_styles.?[1].start_unit);
    const saved = try @import("character_style_paragraph_xml.zig").write(a, &tree, paragraph, 10000);
    defer a.free(saved);
    try std.testing.expect(std.mem.indexOf(u8, saved, "A😀") != null);
    try std.testing.expectEqualStrings(source, tree.source);
}
