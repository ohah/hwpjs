//! 부분 소유 문단 입력을 혼합 그룹 문맥에서 원자적으로 준비합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn splice(a: std.mem.Allocator, tree: *const Tree, current: *model.Values, index: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const selected = &current.paragraphs[index];
    const grouped = try @import("paragraph_page_area_order.zig").saveView(a, tree, current);
    defer if (grouped) |rows| a.free(rows);
    const view: model.Values = .{ .paragraphs = grouped orelse current.paragraphs };
    var selected_index: ?usize = null;
    for (view.paragraphs, 0..) |row, ordinal| if (row.sites.items.ptr == selected.sites.items.ptr) {
        if (selected_index != null) return error.SourceBindingMismatch;
        selected_index = ordinal;
    };
    const found = selected_index orelse return error.SourceBindingMismatch;
    const range = try @import("column_boundary_group.zig").locate(&view, found);
    const group = view.paragraphs[range.start..range.end];
    try @import("column_page_area_group_validate.zig").validate(a, tree, group);
    const positions = try @import("paragraph_joined_positions.zig").build(a, tree, &selected.joined().?);
    defer a.free(positions);
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    const units = std.math.cast(u32, if (positions.len == 0) 0 else positions[positions.len - 1].end_unit) orelse return error.LimitExceeded;
    const added = std.math.cast(u32, try @import("text_site_edit.zig").utf16Length(inserted)) orelse return error.LimitExceeded;
    var draft = try selected.clone(a);
    defer draft.deinit(a);
    const rows = try a.dupe(model.Paragraph, group);
    defer a.free(rows);
    const local = found - range.start;
    rows[local] = draft;
    const changed = try @import("column_boundary_joined_splice.zig").spliceGroup(a, tree, rows, local, start, deleted, inserted, limit);
    draft = rows[local];
    if (!changed) return false;
    for (draft.page_area_positions.?) |*area| {
        area.* = try @import("page_area_position.zig").splice(area.*, start, end, added, units);
        area.affinity = @import("page_area_position.zig").canonicalAffinity(area.unit);
    }
    rows[local] = draft;
    try @import("column_page_area_group_validate.zig").validate(a, tree, rows);
    const candidate: model.Values = .{ .paragraphs = @as(*[1]model.Paragraph, @ptrCast(&draft)) };
    _ = try candidate.byteSize(limit);
    std.mem.swap(model.Paragraph, selected, &draft);
    return true;
}

test "mixed declaration group input candidate failures preserve all current values" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.mergeParagraphPair(0, 1, 2);
    _ = try session.splitParagraph(0, 1, 1, 0);
    const section = &session.sections[0];
    const source = &section.structure_values.?;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, original: *const model.Values) !void {
            var candidate = try original.clone(allocator);
            defer candidate.deinit(allocator);
            _ = splice(allocator, tree, &candidate, 1, 0, 0, "후속😀<&", 4000000) catch |err| {
                try std.testing.expectEqualDeep(original.*, candidate);
                return err;
            };
            try std.testing.expectEqual(@as(u32, 10), candidate.paragraphs[1].page_area_positions.?[0].unit);
        }
    };
    try Probe.run(a, &section.tree, source);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &section.tree, source });
    var protected = try source.clone(a);
    defer protected.deinit(a);
    protected.paragraphs[1].page_area_positions.?[0].unit = 2;
    var snapshot = try protected.clone(a);
    defer snapshot.deinit(a);
    try std.testing.expectError(error.ProtectedPageAreaBoundary, splice(a, &section.tree, &protected, 1, 1, 2, "", 4000000));
    try std.testing.expectEqualDeep(snapshot, protected);
    for (source.paragraphs[1].page_area_positions.?) |area| try std.testing.expectEqual(@as(u32, 4), area.unit);
}
