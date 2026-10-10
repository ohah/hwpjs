//! Merge aligned continuations while retaining every column-setting boundary.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, limit: usize) anyerror!model.Values {
    const group = try @import("column_boundary_group.zig").locate(current, index);
    if (index + 1 >= group.end) return error.UnsupportedColumnBoundaryEdit;
    try @import("column_boundary_partition.zig").validate(a, tree, current.paragraphs[group.start..group.end]);
    for (current.paragraphs[index .. index + 2]) |part| if (part.pieces != null or part.protected_positions != null) return error.UnsupportedColumnBoundaryEdit;
    const left = &current.paragraphs[index];
    const right = &current.paragraphs[index + 1];
    var aligned = try @import("paragraph_site_union.zig").prepare(a, tree, left.template_element, &left.sites, &right.sites, limit);
    defer aligned.deinit(a);
    const left_styles = try @import("character_style_site_union.zig").prepare(a, tree, left, &aligned.left);
    defer if (left_styles) |items| a.free(items);
    const right_styles = try @import("character_style_site_union.zig").prepare(a, tree, right, &aligned.right);
    defer if (right_styles) |items| a.free(items);
    const lp = try @import("paragraph_protected_positions.zig").build(a, tree, left);
    defer a.free(lp);
    const rp = try @import("paragraph_protected_positions.zig").build(a, tree, right);
    defer a.free(rp);
    const lu = std.math.cast(u32, if (lp.len == 0) 0 else lp[lp.len - 1].end_unit) orelse return error.LimitExceeded;
    const ru = std.math.cast(u32, if (rp.len == 0) 0 else rp[rp.len - 1].end_unit) orelse return error.LimitExceeded;
    const boundaries = try @import("column_boundary_edit.zig").merge(a, left.column_boundaries.?, right.column_boundaries.?, lu, ru, tree.elements.len);
    var transferred = false;
    defer if (!transferred) a.free(boundaries);
    const descriptors = try a.dupe(model.Paragraph, current.paragraphs);
    defer a.free(descriptors);
    descriptors[index].column_boundaries = null;
    descriptors[index + 1].column_boundaries = null;
    descriptors[index].sites = aligned.left;
    descriptors[index + 1].sites = aligned.right;
    descriptors[index].character_styles = left_styles;
    descriptors[index + 1].character_styles = right_styles;
    const text_current: model.Values = .{ .paragraphs = descriptors };
    var candidate = try @import("paragraph_structure_merge.zig").prepare(a, tree, &text_current, index, limit);
    errdefer candidate.deinit(a);
    const merged = &candidate.paragraphs[index];
    if (merged.pieces) |pieces| {
        if (pieces.len == 1) {
            const piece = pieces[0];
            if (piece.template_element != left.template_element or piece.source_ordinal != left.source_ordinal or piece.generated_id != left.generated_id or piece.first_site != 0 or piece.site_count != merged.sites.items.len) return error.SourceBindingMismatch;
            a.free(pieces);
            merged.pieces = null;
        } else if (merged.generated_id) |id| {
            for (pieces) |*piece| piece.generated_id = id;
        }
    }
    merged.column_boundaries = boundaries;
    merged.column_structure_changed = true;
    transferred = true;
    if (merged.pieces != null) {
        try @import("column_boundary_group_promote.zig").install(a, tree, candidate.paragraphs[group.start .. group.end - 1], index - group.start, limit);
        try @import("column_boundary_joined_group.zig").validate(a, tree, candidate.paragraphs[group.start .. group.end - 1]);
    } else try @import("column_boundary_partition.zig").validate(a, tree, candidate.paragraphs[group.start .. group.end - 1]);
    _ = try candidate.byteSize(limit);
    return candidate;
}

test "column boundary continuation merge preserves middle settings and failed allocations" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>AB</p:t><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>CD</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer original.deinit(a);
    try @import("column_boundary_materialize.zig").install(a, &tree, &original.paragraphs[0], 100);
    var split = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 1, 1, 2, 10000);
    defer split.deinit(a);
    var merged = try prepare(a, &tree, &split, 0, 10000);
    defer merged.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), merged.paragraphs.len);
    try std.testing.expect(merged.paragraphs[0].pieces == null);
    try std.testing.expectEqualStrings("AB", merged.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqualStrings("CD", merged.paragraphs[0].sites.items[1].text);
    try std.testing.expectEqualSlices(@import("column_boundary_position.zig").Position, original.paragraphs[0].column_boundaries.?, merged.paragraphs[0].column_boundaries.?);
    const saved = try @import("paragraph_structure_save.zig").write(a, &tree, &merged, .{}, &.{}, 10000);
    defer a.free(saved);
    try std.testing.expectEqualStrings(tree.source, saved);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const model.Values) !void {
            var result = try prepare(allocator, parsed, current, 0, 10000);
            defer result.deinit(allocator);
        }
    }.run, .{ &tree, &split });
    try std.testing.expectEqualStrings("A", split.paragraphs[0].sites.items[0].text);
    try std.testing.expectEqual(@as(u32, 1), split.paragraphs[1].column_boundaries.?[0].unit);
}

test "column boundary union merge saves original derived run text atomically" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl></p:run><p:run><p:t>AB</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer original.deinit(a);
    try @import("column_boundary_materialize.zig").install(a, &tree, &original.paragraphs[0], 100);
    var first = try @import("paragraph_structure_split.zig").prepare(a, &tree, &original, 0, 0, 0, 2, 10000);
    defer first.deinit(a);
    var repeated = try @import("paragraph_structure_split.zig").prepare(a, &tree, &first, 1, 1, 1, 3, 10000);
    defer repeated.deinit(a);
    var generated = try prepare(a, &tree, &repeated, 1, 10000);
    defer generated.deinit(a);
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &generated.paragraphs[1].sites, 0, 0, 0, "한😀<&", 10000));
    var merged = try prepare(a, &tree, &generated, 0, 10000);
    defer merged.deinit(a);
    const saved = try @import("paragraph_structure_save.zig").write(a, &tree, &merged, .{}, &.{}, 10000);
    defer a.free(saved);
    try std.testing.expect(std.mem.indexOf(u8, saved, "<p:t>한😀&lt;&amp;</p:t>") != null);
    try std.testing.expectEqualStrings("AB", merged.paragraphs[0].sites.items[1].text);
    try std.testing.expectEqual(@as(u32, 0), merged.paragraphs[0].column_boundaries.?[0].unit);
    var resplit = try @import("paragraph_structure_split.zig").prepare(a, &tree, &merged, 0, 1, 1, 4, 10000);
    defer resplit.deinit(a);
    try std.testing.expect(resplit.paragraphs[0].column_structure_changed);
    try std.testing.expect(resplit.paragraphs[1].column_structure_changed);
    const split_saved = try @import("paragraph_structure_save.zig").write(a, &tree, &resplit, .{}, &.{}, 10000);
    defer a.free(split_saved);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const model.Values) !void {
            defer {
                std.testing.expect(current.paragraphs[0].column_structure_changed) catch @panic("source permission changed");
                std.testing.expectEqualStrings("한😀<&", current.paragraphs[0].sites.items[0].text) catch @panic("source text changed");
                std.testing.expectEqual(@as(u32, 0), current.paragraphs[0].column_boundaries.?[0].unit) catch @panic("source boundary changed");
            }
            var result = try @import("paragraph_structure_split.zig").prepare(allocator, parsed, current, 0, 1, 1, 4, 10000);
            defer result.deinit(allocator);
            if (!result.paragraphs[0].column_structure_changed or !result.paragraphs[1].column_structure_changed) return error.SourceBindingMismatch;
            const bytes = try @import("paragraph_structure_save.zig").write(allocator, parsed, &result, .{}, &.{}, 10000);
            defer allocator.free(bytes);
        }
    }.run, .{ &tree, &merged });
    var denied = try merged.clone(a);
    defer denied.deinit(a);
    denied.paragraphs[0].column_structure_changed = false;
    try std.testing.expectError(error.SourceBindingMismatch, @import("paragraph_structure_save.zig").write(a, &tree, &denied, .{}, &.{}, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const model.Values) !void {
            var result = try prepare(allocator, parsed, current, 0, 10000);
            defer result.deinit(allocator);
            const bytes = try @import("paragraph_structure_save.zig").write(allocator, parsed, &result, .{}, &.{}, 10000);
            defer allocator.free(bytes);
        }
    }.run, .{ &tree, &generated });
    try std.testing.expectEqualStrings("한😀<&", generated.paragraphs[1].sites.items[0].text);
}
