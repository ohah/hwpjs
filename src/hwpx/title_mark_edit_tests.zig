const std = @import("std");
test "mixed plain title current split input resplit owns exactly one title under OOM" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>A<p:titleMark/>B</p:t></p:run></p:p></s:sec>";
            var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
            defer tree.deinit(a);
            var sites = try @import("text_sites.zig").collect(a, &tree, .{});
            defer sites.deinit(a);
            const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
            defer a.free(locations);
            var report: @import("section_text.zig").Report = .{};
            var initial = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
            defer initial.deinit(a);
            var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &initial, 0, 1, 1, 2, 10000);
            defer split.deinit(a);
            try std.testing.expect(try @import("paragraph_structure_splice.zig").splice(a, &tree, &split, 1, 0, 0, "앞😀", 10000));
            try std.testing.expectEqual(@as(usize, 3), split.paragraphs[1].title_positions.?[0].unit);
            var resplit = try @import("paragraph_structure_split.zig").prepare(a, &tree, &split, 1, 3, 3, 3, 10000);
            defer resplit.deinit(a);
            try std.testing.expectEqual(@as(usize, 0), resplit.paragraphs[1].title_positions.?.len);
            try std.testing.expectEqual(@as(usize, 1), resplit.paragraphs[2].title_positions.?.len);
            const saved = try @import("paragraph_structure_save.zig").write(a, &tree, &resplit, .{}, &.{}, 10000);
            defer a.free(saved);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:titleMark/>"));
            var merged = try @import("paragraph_structure_merge.zig").prepare(a, &tree, &resplit, 1, 10000);
            defer merged.deinit(a);
            try std.testing.expect(merged.paragraphs[1].title_positions != null);
            try std.testing.expectEqual(@as(usize, 1), merged.paragraphs[1].title_positions.?.len);
            try std.testing.expectEqual(@as(usize, 3), merged.paragraphs[1].title_positions.?[0].unit);
            const merged_xml = try @import("paragraph_structure_save.zig").write(a, &tree, &merged, .{}, &.{}, 10000);
            defer a.free(merged_xml);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, merged_xml, "<p:titleMark/>"));
            var reopened_tree = try @import("xml_part_tree.zig").parse(a, merged_xml, .section, 0, 0, .{});
            defer reopened_tree.deinit(a);
            var reopened_sites = try @import("text_sites.zig").collect(a, &reopened_tree, .{});
            defer reopened_sites.deinit(a);
            const reopened_locations = try @import("text_site_locations.zig").build(a, &reopened_tree, &reopened_sites, .{});
            defer a.free(reopened_locations);
            var reopened_axis = try @import("title_mark_axis.zig").build(a, &reopened_tree, &reopened_sites, reopened_locations, 2);
            defer reopened_axis.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), reopened_axis.marks.len);
            try std.testing.expectEqual(@as(usize, 3), reopened_axis.marks[0].display_unit);
            try std.testing.expectEqualStrings(source, tree.source);
        }
    }.run, .{});
}

test "mixed column title continuation merge accepts verified zero width sites under OOM" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t><p:titleMark/>AB</p:t></p:run></p:p></s:sec>";
            var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
            defer tree.deinit(a);
            const options: @import("text_sites.zig").Options = .{ .materialize_tab_boundaries = true };
            var sites = try @import("text_sites.zig").collect(a, &tree, options);
            defer sites.deinit(a);
            const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
            defer a.free(locations);
            var report: @import("section_text.zig").Report = .{};
            var current = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
            defer current.deinit(a);
            try @import("column_boundary_materialize.zig").install(a, &tree, &current.paragraphs[0], 10000);
            var split = try @import("column_boundary_split.zig").prepare(a, &tree, &current, 0, 0, 0, 2, 10000, true);
            defer split.deinit(a);
            var merged = try @import("column_boundary_merge.zig").prepare(a, &tree, &split, 0, 10000);
            defer merged.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), merged.paragraphs[0].title_positions.?.len);
            const saved = try @import("paragraph_structure_save.zig").write(a, &tree, &merged, options, &.{}, 10000);
            defer a.free(saved);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:titleMark/>"));
            try std.testing.expectEqualStrings(source, tree.source);
        }
    }.run, .{});
}
