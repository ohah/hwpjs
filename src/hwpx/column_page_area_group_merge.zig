//! 같은 혼합 분할 그룹의 본문과 두 선언 배열을 재병합합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, left_index: usize, right_index: usize, limit: usize) !model.Values {
    if (left_index >= right_index or right_index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (try @import("paragraph_current_neighbor.zig").next(tree, current, left_index) != right_index) return error.InvalidParagraphAdjacency;
    const grouped = try @import("paragraph_page_area_order.zig").saveView(a, tree, current);
    defer if (grouped) |rows| a.free(rows);
    const descriptors = try a.dupe(model.Paragraph, grouped orelse current.paragraphs);
    defer a.free(descriptors);
    const view: model.Values = .{ .paragraphs = descriptors };
    var left: ?usize = null;
    var right: ?usize = null;
    for (descriptors, 0..) |row, index| {
        if (row.sites.items.ptr == current.paragraphs[left_index].sites.items.ptr) left = index;
        if (row.sites.items.ptr == current.paragraphs[right_index].sites.items.ptr) right = index;
    }
    const index = left orelse return error.SourceBindingMismatch;
    if (right != index + 1) return error.InvalidParagraphAdjacency;
    const range = try @import("column_boundary_group.zig").locate(&view, index);
    if (index + 1 >= range.end) return error.UnsupportedPageAreaOwnership;
    try @import("column_page_area_group_validate.zig").validate(a, tree, descriptors[range.start..range.end]);
    const left_positions = try @import("paragraph_joined_positions.zig").build(a, tree, &descriptors[index].joined().?);
    defer a.free(left_positions);
    const right_positions = try @import("paragraph_joined_positions.zig").build(a, tree, &descriptors[index + 1].joined().?);
    defer a.free(right_positions);
    const left_units = std.math.cast(u32, if (left_positions.len == 0) 0 else left_positions[left_positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const right_units = std.math.cast(u32, if (right_positions.len == 0) 0 else right_positions[right_positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const areas = try @import("page_area_edit.zig").merge(a, descriptors[index].page_area_positions.?, descriptors[index + 1].page_area_positions.?, left_units, right_units, tree.elements.len);
    var transferred = false;
    defer if (!transferred) a.free(areas);
    descriptors[index].page_area_positions = null;
    descriptors[index + 1].page_area_positions = null;
    var candidate = try @import("column_boundary_joined_merge.zig").prepare(a, tree, &view, index, limit);
    errdefer candidate.deinit(a);
    candidate.paragraphs[index].page_area_positions = areas;
    transferred = true;
    try @import("column_page_area_group_validate.zig").validate(a, tree, candidate.paragraphs[range.start .. range.end - 1]);
    _ = try candidate.byteSize(limit);
    return candidate;
}

test "mixed declaration remerge candidate preserves source through allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.mergeParagraphPair(0, 1, 2);
    _ = try session.splitParagraph(0, 1, 1, 0);
    _ = try session.splice(0, 2, 0, 0, "후속😀<&");
    const section = &session.sections[0];
    const source = &section.structure_values.?;
    var snapshot = try source.clone(a);
    defer snapshot.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, values: *const model.Values, piece_count: usize) !void {
            var candidate = try prepare(allocator, tree, values, 0, 1, 4000000);
            defer candidate.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), candidate.paragraphs.len);
            try std.testing.expectEqual(piece_count, candidate.paragraphs[0].pieces.?.len);
            try std.testing.expectEqual(@as(usize, 1), candidate.paragraphs[0].column_boundaries.?.len);
            for (candidate.paragraphs[0].page_area_positions.?) |area| try std.testing.expectEqual(@as(u32, 11), area.unit);
        }
    };
    try Probe.run(a, &section.tree, source, 2);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &section.tree, source, @as(usize, 2) });
    try std.testing.expectEqualDeep(snapshot, source.*);
    try std.testing.expectError(error.InvalidParagraphIndex, prepare(a, &section.tree, source, 0, 0, 4000000));
    try std.testing.expectError(error.InvalidParagraphAdjacency, prepare(a, &section.tree, source, 0, 2, 4000000));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &section.tree, source, 0, 1, 1));
    try std.testing.expectEqualDeep(snapshot, source.*);
    var ordered = try @import("editor_session.zig").open(a, input, .{});
    defer ordered.deinit();
    _ = try ordered.mergeParagraphPair(0, 1, 2);
    _ = try ordered.splitParagraph(0, 1, 0, 0);
    _ = try ordered.splice(0, 1, 0, 0, "후속😀<&");
    const ordered_section = &ordered.sections[0];
    const ordered_source = &ordered_section.structure_values.?;
    var ordered_snapshot = try ordered_source.clone(a);
    defer ordered_snapshot.deinit(a);
    try Probe.run(a, &ordered_section.tree, ordered_source, 2);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &ordered_section.tree, ordered_source, @as(usize, 2) });
    try std.testing.expectEqualDeep(ordered_snapshot, ordered_source.*);
}
