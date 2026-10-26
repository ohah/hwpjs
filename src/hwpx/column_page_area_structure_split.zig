//! 혼합 선언의 분할 본문·식별자·중첩 순서를 소유 후보로 조립합니다.
//! 전체 혼합 그룹에서 선언 보존을 확인한 뒤 선택 멤버를 절단합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, index: usize, at: u32, end: u32, id: u32, limit: usize) !model.Values {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (id == 0) return error.InvalidParagraphId;
    for (current.paragraphs) |row| if (row.generated_id == id) return error.DuplicateParagraphId;
    const selected = &current.paragraphs[index];
    const grouped = try @import("paragraph_page_area_order.zig").saveView(a, tree, current);
    defer if (grouped) |rows| a.free(rows);
    const view: model.Values = .{ .paragraphs = grouped orelse current.paragraphs };
    var found: ?usize = null;
    for (view.paragraphs, 0..) |row, ordinal| if (row.sites.items.ptr == selected.sites.items.ptr) {
        if (found != null) return error.SourceBindingMismatch;
        found = ordinal;
    };
    const position = found orelse return error.SourceBindingMismatch;
    const range = try @import("column_boundary_group.zig").locate(&view, position);
    var draft = try @import("column_page_area_split_draft.zig").prepareMember(a, tree, view.paragraphs[range.start..range.end], position - range.start, at, end, tree.elements.len, limit);
    defer draft.deinit(a);
    var candidate = try @import("paragraph_structure_joined_split.zig").assemble(a, current, index, id, limit, &draft.text, null, null);
    errdefer candidate.deinit(a);
    candidate.paragraphs[index].column_boundaries = try a.dupe(@import("column_boundary_position.zig").Position, draft.metadata.columns.left);
    candidate.paragraphs[index + 1].column_boundaries = try a.dupe(@import("column_boundary_position.zig").Position, draft.metadata.columns.right);
    candidate.paragraphs[index].page_area_positions = try a.dupe(@import("page_area_position.zig").Position, draft.metadata.areas.left);
    candidate.paragraphs[index + 1].page_area_positions = try a.dupe(@import("page_area_position.zig").Position, draft.metadata.areas.right);
    candidate.paragraphs[index].column_structure_changed = selected.column_structure_changed;
    candidate.paragraphs[index + 1].column_structure_changed = selected.column_structure_changed;
    try @import("paragraph_page_area_order.zig").repartitionSplitWithColumnPageAreas(a, tree, candidate.paragraphs, index, index + 1);
    _ = try candidate.byteSize(limit);
    return candidate;
}

test "mixed declaration generated resplit candidate preserves group through allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.mergeParagraphPair(0, 1, 2);
    _ = try session.splitParagraph(0, 1, 1, 0);
    const section = &session.sections[0];
    const current = &section.structure_values.?;
    var snapshot = try current.clone(a);
    defer snapshot.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, source: *const model.Values) !void {
            var candidate = try prepare(allocator, tree, source, 1, 2, 2, 1000, 4000000);
            defer candidate.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 5), candidate.paragraphs.len);
            try @import("column_page_area_group_validate.zig").validate(allocator, tree, candidate.paragraphs[0..3]);
            try std.testing.expectEqual(@as(usize, 0), candidate.paragraphs[1].page_area_positions.?.len);
            for (candidate.paragraphs[2].page_area_positions.?) |area| try std.testing.expectEqual(@as(u32, 2), area.unit);
        }
    };
    try Probe.run(a, &section.tree, current);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &section.tree, current });
    try std.testing.expectEqualDeep(snapshot, current.*);
}

test "mixed declaration split candidate orders nested rows by actual declaration owner" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
    _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리<&");
    _ = try session.mergeParagraphPair(0, 1, 2);
    const baseline = try session.save();
    defer a.free(baseline);
    const section = &session.sections[0];
    const current = &section.structure_values.?;
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, source: *const model.Values, cut: u32) !void {
            var candidate = try prepare(allocator, tree, source, 0, cut, cut, 999, 4000000);
            defer candidate.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 4), candidate.paragraphs.len);
            try std.testing.expectEqual(@as(?u32, 999), candidate.paragraphs[1].generated_id);
            try std.testing.expectEqual(source.paragraphs[1].template_element, candidate.paragraphs[2].template_element);
            try std.testing.expectEqual(source.paragraphs[2].template_element, candidate.paragraphs[3].template_element);
            try std.testing.expectEqualDeep(source.paragraphs[1].sites, candidate.paragraphs[2].sites);
            try std.testing.expectEqualDeep(source.paragraphs[2].sites, candidate.paragraphs[3].sites);
            try @import("column_page_area_group_validate.zig").validate(allocator, tree, candidate.paragraphs[0..2]);
        }
    };
    for (0..6) |cut| try Probe.run(a, &section.tree, current, @intCast(cut));
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &section.tree, current, @as(u32, 1) });
    var relocated = try current.clone(a);
    defer relocated.deinit(a);
    relocated.paragraphs[0].page_area_positions.?[0].unit = 0;
    relocated.paragraphs[0].page_area_positions.?[0].affinity = .left;
    var candidate = try prepare(a, &section.tree, &relocated, 0, 1, 1, 999, 4000000);
    defer candidate.deinit(a);
    try std.testing.expectEqual(current.paragraphs[1].template_element, candidate.paragraphs[1].template_element);
    try std.testing.expectEqual(@as(?u32, 999), candidate.paragraphs[2].generated_id);
    try std.testing.expectEqual(current.paragraphs[2].template_element, candidate.paragraphs[3].template_element);
    const hosts = [_]model.Paragraph{ candidate.paragraphs[0], candidate.paragraphs[2] };
    try @import("column_page_area_group_validate.zig").validate(a, &section.tree, &hosts);
    try std.testing.expectError(error.DuplicateParagraphId, prepare(a, &section.tree, &candidate, 0, 1, 1, 999, 4000000));
    try std.testing.expectError(error.InvalidParagraphId, prepare(a, &section.tree, current, 0, 1, 1, 0, 4000000));
    try std.testing.expectError(error.InvalidParagraphIndex, prepare(a, &section.tree, current, current.paragraphs.len, 1, 1, 999, 4000000));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &section.tree, current, 0, 1, 1, 999, 1));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, baseline, after);
}
