const std = @import("std");
const editor = @import("editor_session.zig");
const history_module = @import("editor_history.zig");

fn candidate(a: std.mem.Allocator, input: []const u8) !editor.Session {
    var session = try editor.open(a, input, .{});
    errdefer session.deinit();
    _ = try session.splice(0, 2, 0, 0, "AB😀CD");
    const section = &session.sections[0];
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &report);
    errdefer values.deinit(a);
    try @import("page_area_materialize.zig").install(a, &section.tree, &values.paragraphs[1], 2);
    values.paragraphs[1].page_area_positions.?[0].unit = 2;
    values.paragraphs[1].page_area_positions.?[1].unit = 4;
    for (values.paragraphs[1].page_area_positions.?) |*area| area.affinity = @import("page_area_position.zig").canonicalAffinity(area.unit);
    section.sites.deinit(a);
    section.sites = .{ .items = &.{} };
    section.structure_values = values;
    return session;
}

fn units(a: std.mem.Allocator, input: []const u8) ![2]u32 {
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const node = try @import("paragraph_site_owner.zig").resolve(&section.tree, &section.sites, section.locations, 2);
    const segments = try @import("anchor_text_positions.zig").build(a, &section.tree, &section.sites, section.locations, 2);
    defer a.free(segments);
    const declarations = try @import("page_area_source_positions.zig").collect(a, &section.tree, node, segments, 2);
    defer a.free(declarations);
    try std.testing.expectEqual(@as(usize, 2), declarations.len);
    return .{ declarations[0].unit, declarations[1].unit };
}

test "page area candidate Session history retains source declarations and redo after refusal" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try candidate(a, input);
    defer session.deinit();
    var history = try history_module.History.init(&session, 8, 4000000);
    defer history.deinit();
    const baseline = try session.save();
    defer a.free(baseline);
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 2, .start = 1, .deleted = 0, .inserted = "앞😀" }));
    const changed = try session.save();
    defer a.free(changed);
    try std.testing.expectEqual([2]u32{ 5, 7 }, try units(a, changed));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, baseline, undone);
    try std.testing.expectEqual(@as(u32, 2), session.sections[0].structure_values.?.paragraphs[1].page_area_positions.?[0].unit);
    try std.testing.expectError(error.SplitSurrogatePair, history.apply(&session, .{ .paragraph = 2, .start = 3, .deleted = 0, .inserted = "X" }));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
}

test "page area candidate boundary insertion agrees with saved reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try candidate(a, input);
    defer session.deinit();
    const baseline = try session.save();
    defer a.free(baseline);
    session.sections[0].structure_values.?.paragraphs[1].page_area_positions.?[0].affinity = .left;
    try std.testing.expectError(error.UnsupportedPageAreaAffinity, session.save());
    session.sections[0].structure_values.?.paragraphs[1].page_area_positions.?[0].affinity = .right;
    var reopened = try editor.open(a, baseline, .{});
    defer reopened.deinit();
    try std.testing.expect(try session.splice(0, 2, 2, 0, "X"));
    try std.testing.expect(try reopened.splice(0, 2, 2, 0, "X"));
    const current = try session.save();
    defer a.free(current);
    const restored = try reopened.save();
    defer a.free(restored);
    try std.testing.expectEqual(try units(a, current), try units(a, restored));
}

test "page area candidate end split retains left declarations and continuation input" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try candidate(a, input);
    defer session.deinit();
    const baseline = try session.save();
    defer a.free(baseline);
    try std.testing.expectError(error.SplitSurrogatePair, session.splitParagraph(0, 2, 3, 0));
    const refused = try session.save();
    defer a.free(refused);
    try std.testing.expectEqualSlices(u8, baseline, refused);
    var history = try history_module.History.init(&session, 8, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 2, .start = 6, .deleted = 0, .inserted = "" }));
    const split = try session.save();
    defer a.free(split);
    try std.testing.expectEqual([2]u32{ 2, 4 }, try units(a, split));
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 5, .start = 0, .deleted = 0, .inserted = "다음😀" }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    for (1..6) |paragraph| {
        const before = try session.anchorText(0, paragraph);
        defer a.free(before);
        const after = try reopened.anchorText(0, paragraph);
        defer a.free(after);
        try std.testing.expectEqualStrings(before, after);
    }
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, baseline, undone);
}

test "page area candidate mixed split preserves nested order through save history reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try candidate(a, input);
    defer session.deinit();
    _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
    _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리<&");
    const baseline = try session.save();
    defer a.free(baseline);
    var history = try history_module.History.init(&session, 8, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 2, .start = 4, .deleted = 0, .inserted = "" }));
    const saved = try session.save();
    defer a.free(saved);
    var original_reopened = try editor.open(a, baseline, .{});
    defer original_reopened.deinit();
    try std.testing.expect(try original_reopened.splitParagraph(0, 2, 4, 0));
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    for (1..6) |paragraph| {
        const before = try session.anchorText(0, paragraph);
        defer a.free(before);
        const after = try reopened.anchorText(0, paragraph);
        defer a.free(after);
        try std.testing.expectEqualStrings(before, after);
        const original_after = try original_reopened.anchorText(0, paragraph);
        defer a.free(original_after);
        try std.testing.expectEqualStrings(before, original_after);
    }
    const left = try session.anchorText(0, 2);
    defer a.free(left);
    const right = try session.anchorText(0, 4);
    defer a.free(right);
    try std.testing.expectEqualStrings("AB😀", left);
    try std.testing.expectEqualStrings("CD", right);
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 2, .start = 1, .deleted = 0, .inserted = "왼쪽😀" }));
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 4, .start = 0, .deleted = 0, .inserted = "오른쪽<&" }));
    const edited = try session.save();
    defer a.free(edited);
    var edited_reopened = try editor.open(a, edited, .{});
    defer edited_reopened.deinit();
    for (1..6) |paragraph| {
        const before = try session.anchorText(0, paragraph);
        defer a.free(before);
        const after = try edited_reopened.anchorText(0, paragraph);
        defer a.free(after);
        try std.testing.expectEqualStrings(before, after);
    }
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, baseline, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const replayed = try session.save();
    defer a.free(replayed);
    try std.testing.expectEqualSlices(u8, edited, replayed);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_structure_values.zig").Values) !void {
            var output = @import("page_area_structure_merge.zig").prepare(allocator, tree, current, 1, 3, 4000000) catch |err| {
                try std.testing.expectEqual(@as(usize, 5), current.paragraphs.len);
                try std.testing.expectEqual(@as(u32, 6), current.paragraphs[1].page_area_positions.?[0].unit);
                try std.testing.expectEqual(@as(u32, 0), current.paragraphs[3].page_area_positions.?[0].unit);
                return err;
            };
            defer output.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 4), output.paragraphs.len);
            try std.testing.expectEqual(@as(u32, 6), output.paragraphs[1].page_area_positions.?[0].unit);
            try std.testing.expectEqual(@as(u32, 8), output.paragraphs[1].page_area_positions.?[1].unit);
            const text = try @import("paragraph_protected_positions.zig").text(allocator, tree, &output.paragraphs[1], 4000000);
            defer allocator.free(text);
            try std.testing.expectEqualStrings("A왼쪽😀B😀오른쪽<&CD", text);
        }
    }.run, .{ &session.sections[0].tree, &session.sections[0].structure_values.? });
    try std.testing.expect(try session.mergeParagraphPair(0, 2, 4));
    const merged = try session.save();
    defer a.free(merged);
    var merged_reopened = try editor.open(a, merged, .{});
    defer merged_reopened.deinit();
    for (1..5) |paragraph| {
        const before = try session.anchorText(0, paragraph);
        defer a.free(before);
        const after = try merged_reopened.anchorText(0, paragraph);
        defer a.free(after);
        try std.testing.expectEqualStrings(before, after);
    }
}

test "page area reopened source split matrix retains current paragraph order and input" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var seed = try candidate(a, input);
    defer seed.deinit();
    const baseline = try seed.save();
    defer a.free(baseline);
    for ([_]u32{ 0, 1, 2, 4, 5, 6 }) |cut| {
        var session = try editor.open(a, baseline, .{});
        defer session.deinit();
        try std.testing.expect(try session.splitParagraph(0, 2, cut, 0));
        const continuation: usize = if (cut <= 2) 3 else if (cut <= 4) 4 else 5;
        try std.testing.expect(try session.splice(0, 2, 0, 0, "왼😀"));
        try std.testing.expect(try session.splice(0, continuation, 0, 0, "오른<&"));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        for (1..6) |paragraph| {
            const before = try session.anchorText(0, paragraph);
            defer a.free(before);
            const after = try reopened.anchorText(0, paragraph);
            defer a.free(after);
            try std.testing.expectEqualStrings(before, after);
        }
    }
}

test "page area partial source and generated owners resplit through history reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var seed = try candidate(a, input);
    defer seed.deinit();
    const source = try seed.save();
    defer a.free(source);
    const Case = struct { first: u32, paragraph: usize, cuts: []const u32 };
    for ([_]Case{
        .{ .first = 4, .paragraph = 2, .cuts = &.{ 0, 1, 2, 4 } },
        .{ .first = 4, .paragraph = 4, .cuts = &.{ 0, 1, 2 } },
        .{ .first = 0, .paragraph = 3, .cuts = &.{ 0, 1, 2, 4, 5, 6 } },
    }) |case| for (case.cuts) |cut| {
        var session = try editor.open(a, source, .{});
        defer session.deinit();
        _ = try session.splitParagraph(0, 2, case.first, 0);
        const baseline = try session.save();
        defer a.free(baseline);
        var history = try history_module.History.init(&session, 8, 4000000);
        defer history.deinit();
        try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = case.paragraph, .start = cut, .deleted = 0, .inserted = "" }));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        for (1..7) |paragraph| {
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
    };
    var failure_session = try editor.open(a, source, .{});
    defer failure_session.deinit();
    _ = try failure_session.splitParagraph(0, 2, 0, 0);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, current: *const @import("paragraph_structure_values.zig").Values) !void {
            var output = @import("page_area_structure_split.zig").prepare(allocator, tree, current, 2, 2, 2, 999, 4000000) catch |err| {
                try std.testing.expectEqual(@as(usize, 5), current.paragraphs.len);
                try std.testing.expectEqual(@as(u32, 2), current.paragraphs[2].page_area_positions.?[0].unit);
                try std.testing.expectEqual(@as(u32, 4), current.paragraphs[2].page_area_positions.?[1].unit);
                return err;
            };
            defer output.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 6), output.paragraphs.len);
            try std.testing.expectEqual(@as(usize, 0), output.paragraphs[2].page_area_positions.?.len);
            try std.testing.expectEqual(@as(u32, 0), output.paragraphs[3].page_area_positions.?[0].unit);
            try std.testing.expectEqual(@as(u32, 2), output.paragraphs[3].page_area_positions.?[1].unit);
        }
    }.run, .{ &failure_session.sections[0].tree, &failure_session.sections[0].structure_values.? });
}

test "page area candidate reopened deletion retains protected declarations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try candidate(a, input);
    defer session.deinit();
    const baseline = try session.save();
    defer a.free(baseline);
    var reopened = try editor.open(a, baseline, .{});
    defer reopened.deinit();
    try std.testing.expectError(error.ProtectedPageAreaBoundary, session.splice(0, 2, 1, 3, ""));
    try std.testing.expectError(error.ProtectedPageAreaBoundary, reopened.splice(0, 2, 1, 3, ""));
    try std.testing.expect(!try session.splice(0, 2, 1, 3, "B😀"));
    try std.testing.expect(!try reopened.splice(0, 2, 1, 3, "B😀"));
    const original_noop = try session.save();
    defer a.free(original_noop);
    const reopened_noop = try reopened.save();
    defer a.free(reopened_noop);
    try std.testing.expectEqualSlices(u8, baseline, original_noop);
    try std.testing.expectEqualSlices(u8, baseline, reopened_noop);
}

test "page area candidate zero boundary insertion agrees after preceding text deletion" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try candidate(a, input);
    defer session.deinit();
    try std.testing.expect(try session.splice(0, 2, 0, 2, ""));
    const baseline = try session.save();
    defer a.free(baseline);
    var reopened = try editor.open(a, baseline, .{});
    defer reopened.deinit();
    try std.testing.expect(try session.splice(0, 2, 0, 0, "X"));
    try std.testing.expect(try reopened.splice(0, 2, 0, 0, "X"));
    const current = try session.save();
    defer a.free(current);
    const restored = try reopened.save();
    defer a.free(restored);
    try std.testing.expectEqual(try units(a, current), try units(a, restored));
}

test "page area original lazy installation allocation failures retain prior source edits" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var original = try candidate(a, input);
    defer original.deinit();
    _ = try original.splice(0, 2, 0, 2, "");
    const initial = try original.save();
    defer a.free(initial);
    var source = try editor.open(a, initial, .{});
    defer source.deinit();
    _ = try source.spliceAnchored(0, 3, 0, 0, "기존머리😀");
    const baseline = try source.save();
    defer a.free(baseline);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, existing: *const editor.Session) !void {
            var proxy = existing.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, existing.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try existing.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            proxy.sections[0].structure_values = null;
            defer if (proxy.sections[0].structure_values) |*values| values.deinit(allocator);
            _ = proxy.splice(0, 2, 0, 0, "입력😀<&") catch |err| {
                try std.testing.expect(proxy.sections[0].structure_values == null);
                try std.testing.expectEqual(existing.sections[0].last_paragraph, proxy.sections[0].last_paragraph);
                try std.testing.expectEqual(existing.sections[0].sites.items.len, proxy.sections[0].sites.items.len);
                for (existing.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| {
                    try std.testing.expectEqualStrings(before.text, after.text);
                    try std.testing.expectEqual(before.element_index, after.element_index);
                    try std.testing.expectEqual(before.start, after.start);
                    try std.testing.expectEqual(before.end, after.end);
                }
                return err;
            };
            try std.testing.expect(proxy.sections[0].structure_values != null);
            try std.testing.expectEqual(@as(u32, 0), proxy.sections[0].structure_values.?.paragraphs[1].page_area_positions.?[0].unit);
        }
    }.run, .{&source});
    const after = try source.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, baseline, after);
}
