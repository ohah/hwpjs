//! 검증된 좌표와 원본 출처로 혼합 병합 후보를 만듭니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");

pub fn eligible(tree: *const Tree, left: *const model.Paragraph, right: *const model.Paragraph) bool {
    if (left.template_element == right.template_element) return false;
    for ([_]*const model.Paragraph{ left, right }) |row| {
        if (row.template_element >= tree.elements.len or row.generated_id != null or row.source_ordinal == null or row.pieces != null or row.protected_positions != null or row.field_positions != null or row.character_styles != null) return false;
    }
    return @import("page_area_source_positions.zig").hasForParagraph(tree, left.template_element) or @import("page_area_source_positions.zig").hasForParagraph(tree, right.template_element);
}

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, current: *const model.Values, left: usize, right: usize, limit: usize) !model.Values {
    if (left >= right or right >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (try @import("paragraph_current_neighbor.zig").next(tree, current, left) != right) return error.InvalidParagraphAdjacency;
    var plan = try @import("column_page_area_source_plan.zig").prepare(a, tree, &current.paragraphs[left], &current.paragraphs[right], tree.elements.len);
    defer plan.deinit(a);
    var left_view = current.paragraphs[left];
    var right_view = current.paragraphs[right];
    left_view.column_boundaries = null;
    left_view.page_area_positions = null;
    right_view.column_boundaries = null;
    right_view.page_area_positions = null;
    var first = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &left_view);
    defer first.deinit(a);
    var second = try @import("paragraph_joined_values.zig").Joined.fromParagraph(a, &right_view);
    defer second.deinit(a);
    var joined = try @import("paragraph_joined_merge.zig").prepareWithColumnPageAreas(a, tree, &first, &second, limit);
    defer joined.deinit(a);
    if (joined.character_styles != null) return error.UnsupportedMixedMetadataPlan;
    var merged = try current.paragraphs[left].clone(a);
    defer merged.deinit(a);
    merged.pieces = try a.dupe(@import("paragraph_joined_values.zig").Piece, joined.pieces);
    const columns = try a.dupe(@import("column_boundary_position.zig").Position, plan.columns);
    if (merged.column_boundaries) |previous| a.free(previous);
    merged.column_boundaries = columns;
    const areas = try a.dupe(@import("page_area_position.zig").Position, plan.areas);
    if (merged.page_area_positions) |previous| a.free(previous);
    merged.page_area_positions = areas;
    const sites = try joined.sites.clone(a);
    merged.sites.deinit(a);
    merged.sites = sites;
    merged.column_structure_changed = true;
    try @import("column_page_area_joined_validate.zig").validate(a, tree, &merged);
    const rows = try a.alloc(model.Paragraph, current.paragraphs.len - 1);
    var initialized: usize = 0;
    errdefer {
        for (rows[0..initialized]) |*row| row.deinit(a);
        a.free(rows);
    }
    for (current.paragraphs, 0..) |*row, index| {
        if (index == right) continue;
        rows[initialized] = try (if (index == left) &merged else row).clone(a);
        initialized += 1;
    }
    const result: model.Values = .{ .paragraphs = rows };
    _ = try result.byteSize(limit);
    return result;
}

test "mixed reopened original merge preserves owned declarations through candidate failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.mergeParagraphPair(0, 1, 2);
    _ = try session.splitParagraph(0, 1, 1, 0);
    const split = try session.save();
    defer a.free(split);
    for ([_]usize{ 1, 2 }) |paragraph| {
        var reopened = try @import("editor_session.zig").open(a, split, .{});
        defer reopened.deinit();
        const section = &reopened.sections[0];
        var report: @import("section_text.zig").Report = .{};
        var collected = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, @import("editor_session.zig").siteOptions(reopened.options), &report);
        defer collected.deinit(a);
        const current = &collected;
        const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, &current.paragraphs[paragraph - 1]);
        defer a.free(locations);
        _ = try @import("plain_paragraph_edit.zig").spliceWithTabs(a, &section.tree, &current.paragraphs[paragraph - 1].sites, locations, 1, 0, 0, "입력😀", 4000000, true);
        try @import("column_boundary_materialize.zig").install(a, &section.tree, &current.paragraphs[paragraph - 1], section.tree.elements.len);
        try @import("page_area_materialize.zig").install(a, &section.tree, &current.paragraphs[paragraph - 1], section.tree.elements.len);
        var snapshot = try current.clone(a);
        defer snapshot.deinit(a);
        const Probe = struct {
            fn run(allocator: std.mem.Allocator, tree: *const Tree, values: *const model.Values) !void {
                var candidate = try prepare(allocator, tree, values, 0, 1, 4000000);
                defer candidate.deinit(allocator);
                try std.testing.expectEqual(@as(usize, 3), candidate.paragraphs.len);
                try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs[0].pieces.?.len);
                for (candidate.paragraphs[0].page_area_positions.?) |area| try std.testing.expectEqual(@as(u32, 9), area.unit);
            }
        };
        try Probe.run(a, &section.tree, current);
        try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &section.tree, current });
        try std.testing.expectEqualDeep(snapshot, current.*);
    }
}

test "mixed original source public merge preserves nested edits ZIP history and reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
    _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리<&");
    const baseline = try session.save();
    defer a.free(baseline);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .merge, .paragraph = 1, .right_paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    for (1..4) |paragraph| {
        const before = try session.anchorText(0, paragraph);
        defer a.free(before);
        const after = try reopened.anchorText(0, paragraph);
        defer a.free(after);
        try std.testing.expectEqualStrings(before, after);
    }
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, baseline, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "후속😀" }));
    const typed = try session.save();
    defer a.free(typed);
    var typed_reopened = try @import("editor_session.zig").open(a, typed, .{});
    defer typed_reopened.deinit();
    const typed_text = try typed_reopened.anchorText(0, 1);
    defer a.free(typed_text);
    try std.testing.expectEqualStrings("후속😀첫 페이지", typed_text);
    try std.testing.expect(try history.undo(&session));
    const untyped = try session.save();
    defer a.free(untyped);
    try std.testing.expectEqualSlices(u8, saved, untyped);
}

test "mixed original source merge rejects invalid targets and short output limits" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const options = @import("editor_session.zig").siteOptions(session.options);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &report);
    defer original.deinit(a);
    try std.testing.expectError(error.InvalidParagraphIndex, prepare(a, &section.tree, &original, 0, 0, 4000000));
    try std.testing.expectError(error.InvalidParagraphIndex, prepare(a, &section.tree, &original, 0, original.paragraphs.len, 4000000));
    try std.testing.expectError(error.InvalidParagraphAdjacency, prepare(a, &section.tree, &original, 0, 2, 4000000));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &section.tree, &original, 0, 1, 1));
    var candidate = try prepare(a, &section.tree, &original, 0, 1, 4000000);
    defer candidate.deinit(a);
    const baseline = try @import("paragraph_structure_save.zig").write(a, &section.tree, &candidate, options, &.{}, 4000000);
    defer a.free(baseline);
    try std.testing.expectError(error.LimitExceeded, @import("paragraph_structure_save.zig").write(a, &section.tree, &candidate, options, &.{}, baseline.len - 1));
    const restored = try @import("paragraph_structure_save.zig").write(a, &section.tree, &candidate, options, &.{}, 4000000);
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, baseline, restored);
    try std.testing.expectEqual(@as(usize, 4), original.paragraphs.len);
    try std.testing.expect(original.paragraphs[0].column_boundaries == null);
    try std.testing.expect(original.paragraphs[1].page_area_positions == null);
}

test "mixed original source merge candidate saves prior nested edits and leaves source unchanged" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
    _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리<&");
    const section = &session.sections[0];
    const options = @import("editor_session.zig").siteOptions(session.options);
    var report: @import("section_text.zig").Report = .{};
    var original = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &report);
    defer original.deinit(a);
    var result = try prepare(a, &section.tree, &original, 0, 1, 4000000);
    defer result.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), result.paragraphs.len);
    const output = try @import("paragraph_structure_save.zig").write(a, &section.tree, &result, options, &.{}, 4000000);
    defer a.free(output);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "머리😀"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "꼬리&lt;&amp;"));
    try std.testing.expect(original.paragraphs[0].pieces == null);
    try std.testing.expect(original.paragraphs[1].page_area_positions == null);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, before: *const model.Values, site_options: @import("text_sites.zig").Options, expected: []const u8) !void {
            var candidate = prepare(allocator, tree, before, 0, 1, 4000000) catch |err| {
                try std.testing.expectEqual(@as(usize, 4), before.paragraphs.len);
                try std.testing.expect(before.paragraphs[0].pieces == null);
                try std.testing.expect(before.paragraphs[1].page_area_positions == null);
                return err;
            };
            defer candidate.deinit(allocator);
            const saved = try @import("paragraph_structure_save.zig").write(allocator, tree, &candidate, site_options, &.{}, 4000000);
            defer allocator.free(saved);
            try std.testing.expectEqualStrings(expected, saved);
        }
    }.run, .{ &section.tree, &original, options, output });
}
