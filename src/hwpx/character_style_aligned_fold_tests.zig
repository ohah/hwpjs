const std = @import("std");
test "HWPX character style aligned fold restores authoritative partition on allocation failure" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='7'><p:t>A😀B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
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
    for ([_]u32{ 0, 1, 3, 4 }) |at| {
        var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, at, at, 2, 10000);
        defer split.deinit(a);
        var merged = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &split, 0, 10000);
        defer merged.deinit(a);
        try std.testing.expect(merged.paragraphs[0].pieces == null);
        try std.testing.expectEqualStrings("A😀B", merged.paragraphs[0].sites.items[0].text);
        try std.testing.expectEqualSlices(@import("character_style_paint.zig").Span, values.paragraphs[0].character_styles.?, merged.paragraphs[0].character_styles.?);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, t: *const @import("xml_part_tree.zig").Tree, v: *const @import("paragraph_structure_values.zig").Values) !void {
                var candidate = try @import("paragraph_structure_merge.zig").prepare(allocator, t, v, 0, 10000);
                defer candidate.deinit(allocator);
            }
        }.run, .{ &tree, &split });
        if (at == 0) {
            split.paragraphs[0].character_styles.?[0].char_shape_id = 9;
            var retained = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &split, 0, 10000);
            defer retained.deinit(a);
            try std.testing.expect(retained.paragraphs[0].pieces != null);
            try std.testing.expectEqual(@as(?u32, 9), retained.paragraphs[0].character_styles.?[0].char_shape_id);
            try std.testing.expectEqual(@as(?u32, 7), retained.paragraphs[0].character_styles.?[1].char_shape_id);
        }
    }
}
