const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("paragraph_structure_values.zig");

test "HWPX empty protected merge allocation failures preserve insertion style and original" {
    try @import("../testing/checked_allocator.zig").run(emptyProtectedMergeAllocationFailures, .{});
}

fn emptyProtectedMergeAllocationFailures(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splitParagraphAnchored(0, 1, 1, 0);
    _ = try session.spliceAnchored(0, 2, 0, 0, "X");
    _ = try session.setCharacterFormat(0, 2, 0, 1, 0);
    _ = try session.spliceAnchored(0, 2, 0, 1, "");
    const section = &session.sections[0];
    const before = try session.save();
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, original: *const model.Values) !void {
            var candidate = try @import("paragraph_structure_merge.zig").prepare(allocator, tree, original, 0, 4_000_000);
            defer candidate.deinit(allocator);
            var retained = false;
            for (candidate.paragraphs[0].character_styles.?) |span| {
                if (span.anchor_element == null and span.tab_element == null and span.start_unit == 1 and span.end_unit == 1 and span.char_shape_id == 0) retained = true;
            }
            try std.testing.expect(retained);
            const xml = try @import("paragraph_structure_save.zig").write(allocator, tree, &candidate, editor.siteOptions(.{}), &.{}, 4_000_000);
            defer allocator.free(xml);
            try std.testing.expect(std.mem.indexOf(u8, xml, "charPrIDRef=\"0\"") != null);
        }
    }.run, .{ &section.tree, &section.structure_values.? });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "HWPX styled protected merge actual fixture allocation failures preserve moved text styles" {
    try @import("../testing/checked_allocator.zig").run(styledProtectedMergeAllocationFailures, .{});
}

fn styledProtectedMergeAllocationFailures(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splitParagraphAnchored(0, 1, 1, 0);
    _ = try session.spliceAnchored(0, 2, 0, 0, "앞😀");
    _ = try session.setCharacterFormat(0, 2, 0, 3, 0);
    const section = &session.sections[0];
    const before = try session.save();
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, original: *const model.Values) !void {
            var candidate = try @import("paragraph_structure_merge.zig").prepare(allocator, tree, original, 0, 4_000_000);
            defer candidate.deinit(allocator);
            const text = try @import("paragraph_protected_positions.zig").text(allocator, tree, &candidate.paragraphs[0], 4_000_000);
            defer allocator.free(text);
            try std.testing.expectEqualStrings("\xef\xbf\xbc앞😀\xef\xbf\xbc", text);
            var styled_units: usize = 0;
            for (candidate.paragraphs[0].character_styles.?) |span| {
                if (span.anchor_element == null and span.tab_element == null and span.end_unit > span.start_unit) {
                    try std.testing.expectEqual(@as(?u32, 0), span.char_shape_id);
                    styled_units += span.end_unit - span.start_unit;
                }
            }
            try std.testing.expectEqual(@as(usize, 3), styled_units);
            const xml = try @import("paragraph_structure_save.zig").write(allocator, tree, &candidate, editor.siteOptions(.{}), &.{}, 4_000_000);
            defer allocator.free(xml);
        }
    }.run, .{ &section.tree, &section.structure_values.? });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "HWPX styled protected split actual fixture allocation failures preserve authority" {
    try @import("../testing/checked_allocator.zig").run(styledProtectedSplitAllocationFailures, .{});
}

fn styledProtectedSplitAllocationFailures(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splitParagraphAnchored(0, 1, 1, 0);
    _ = try session.spliceAnchored(0, 2, 0, 0, "A😀B");
    _ = try session.setCharacterFormat(0, 2, 0, 4, 0);
    const section = &session.sections[0];
    const before = try session.save();
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, original: *const model.Values) !void {
            var candidate = try @import("paragraph_structure_split.zig").prepareAnchored(allocator, tree, original, 1, 3, 3, 555, 4_000_000);
            defer candidate.deinit(allocator);
            const left = try @import("paragraph_protected_positions.zig").text(allocator, tree, &candidate.paragraphs[1], 4_000_000);
            defer allocator.free(left);
            const right = try @import("paragraph_protected_positions.zig").text(allocator, tree, &candidate.paragraphs[2], 4_000_000);
            defer allocator.free(right);
            try std.testing.expectEqualStrings("A😀", left);
            try std.testing.expectEqualStrings("B\xef\xbf\xbc", right);
            const xml = try @import("paragraph_structure_save.zig").write(allocator, tree, &candidate, editor.siteOptions(.{}), &.{}, 4_000_000);
            defer allocator.free(xml);
        }
    }.run, .{ &section.tree, &section.structure_values.? });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "HWPX styled protected splice actual fixture allocation failures keep all three owners" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splitParagraphAnchored(0, 1, 1, 0);
    _ = try session.spliceAnchored(0, 2, 0, 0, "ABC");
    _ = try session.setCharacterFormat(0, 2, 0, 3, 0);
    const section = &session.sections[0];
    const original = &section.structure_values.?.paragraphs[1];
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, before: *const model.Paragraph) !void {
            var candidate = try before.clone(allocator);
            defer candidate.deinit(allocator);
            _ = @import("paragraph_protected_splice.zig").splice(allocator, tree, &candidate, 0, 0, "앞😀", 4_000_000) catch |err| {
                for (before.sites.items, candidate.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                try std.testing.expectEqualDeep(before.protected_positions.?, candidate.protected_positions.?);
                try std.testing.expectEqualDeep(before.character_styles.?, candidate.character_styles.?);
                return err;
            };
            const text = try @import("paragraph_protected_positions.zig").text(allocator, tree, &candidate, 4_000_000);
            defer allocator.free(text);
            try std.testing.expectEqualStrings("앞😀ABC\xef\xbf\xbc", text);
            const xml = try @import("character_style_paragraph_xml.zig").write(allocator, tree, &candidate, 4_000_000);
            defer allocator.free(xml);
        }
    }.run, .{ &section.tree, original });
}

test "HWPX protected merge actual fixture allocation failures retain both source paragraphs" {
    try @import("../testing/checked_allocator.zig").run(protectedMergeAllocationFailures, .{});
}

fn protectedMergeAllocationFailures(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splitParagraphAnchored(0, 1, 1, 0);
    _ = try session.spliceAnchored(0, 2, 0, 0, "앞😀<&");
    const section = &session.sections[0];
    const current = &section.structure_values.?;
    const before = try session.save();
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, original: *const model.Values) !void {
            var candidate = try @import("paragraph_structure_merge.zig").prepare(allocator, tree, original, 0, 4_000_000);
            defer candidate.deinit(allocator);
            const text = try @import("paragraph_protected_positions.zig").text(allocator, tree, &candidate.paragraphs[0], 4_000_000);
            defer allocator.free(text);
            try std.testing.expectEqualStrings("\xef\xbf\xbc앞😀<&\xef\xbf\xbc", text);
            const xml = try @import("paragraph_structure_save.zig").write(allocator, tree, &candidate, editor.siteOptions(.{}), &.{}, 4_000_000);
            defer allocator.free(xml);
        }
    }.run, .{ &section.tree, current });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(@as(usize, 2), current.paragraphs.len);
}

test "HWPX protected splice actual fixture preserves text and positions on every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splitParagraphAnchored(0, 1, 1, 0);
    const section = &session.sections[0];
    const original = &section.structure_values.?.paragraphs[1];
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, before: *const model.Paragraph) !void {
            var candidate = try before.clone(allocator);
            defer candidate.deinit(allocator);
            _ = @import("paragraph_protected_splice.zig").splice(allocator, tree, &candidate, 0, 0, "앞😀<&", 4_000_000) catch |err| {
                for (before.sites.items, candidate.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                try std.testing.expectEqualDeep(before.protected_positions.?, candidate.protected_positions.?);
                return err;
            };
            const projected = try @import("paragraph_protected_positions.zig").text(allocator, tree, &candidate, 4_000_000);
            defer allocator.free(projected);
            try std.testing.expectEqualStrings("앞😀<&\xef\xbf\xbc", projected);
            const xml = try @import("paragraph_split_xml.zig").writeProtected(allocator, tree, &candidate, editor.siteOptions(.{}), 4_000_000);
            defer allocator.free(xml);
        }
    }.run, .{ &section.tree, original });
}

test "HWPX anchored split history restores source redo and rejects destructive commands" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .split_anchored, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "" };
    try std.testing.expect(try history.apply(&session, command));
    const once = try session.save();
    defer a.free(once);
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, input, original);
    try std.testing.expectError(error.ProtectedInlineControl, history.apply(&session, .{ .kind = .split_anchored, .paragraph = 1, .start = 0, .deleted = 1, .inserted = "" }));
    try std.testing.expectError(error.InvalidStructureCommand, history.apply(&session, .{ .kind = .split_anchored, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "bad" }));
    try std.testing.expectError(error.ProtectedInlineControl, history.applyBatch(&session, &.{ command, .{ .kind = .split_anchored, .paragraph = 2, .start = 0, .deleted = 1, .inserted = "" } }));
    const rolled_back = try session.save();
    defer a.free(rolled_back);
    try std.testing.expectEqualSlices(u8, input, rolled_back);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, once, redone);
    try std.testing.expect(try history.apply(&session, .{ .kind = .split_anchored, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    const twice = try session.save();
    defer a.free(twice);
    try std.testing.expect(try history.undo(&session));
    const first = try session.save();
    defer a.free(first);
    try std.testing.expectEqualSlices(u8, once, first);
    try std.testing.expect(try history.redo(&session));
    const second = try session.save();
    defer a.free(second);
    try std.testing.expectEqualSlices(u8, twice, second);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expect(!try history.undo(&session));
}

test "HWPX protected structure actual line fixture saves ZIP and reopens without duplicate objects" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const options = editor.siteOptions(session.options);
    var counters: @import("section_text.zig").Report = .{ .paragraphs = section.first_paragraph - 1 };
    var original = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &counters);
    defer original.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), original.paragraphs.len);
    const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, &original.paragraphs[0]);
    defer a.free(locations);
    var draft = try @import("paragraph_split_text.zig").prepareAnchored(a, &section.tree, &original.paragraphs[0].sites, locations, 1, 1, 1, 4_000_000);
    defer draft.deinit(a);
    const moves = try @import("anchor_split_plan.zig").build(a, &section.tree, &original.paragraphs[0].sites, locations, 1, 1, 1);
    defer a.free(moves);
    try std.testing.expectEqual(@as(usize, 2), moves.len);
    const id = try @import("paragraph_instance_ids.zig").next(a, &.{section.tree}, &.{}, session.options.max_sites);
    var candidate = try @import("paragraph_structure_split.zig").prepareAnchored(a, &section.tree, &original, 0, 1, 1, id, 4_000_000);
    defer candidate.deinit(a);
    const projected = try a.dupe(editor.Section, session.sections);
    defer a.free(projected);
    projected[0].sites = .{ .items = &.{} };
    projected[0].structure_values = candidate;
    projected[0].last_paragraph += 1;
    var proxy = session;
    proxy.sections = projected;
    const output = try proxy.save();
    defer a.free(output);
    var reopened = try editor.open(a, output, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(section.last_paragraph + 1, reopened.sections[0].last_paragraph);
    for ([_]usize{ 1, 2 }) |paragraph| {
        const text = try reopened.anchorText(0, paragraph);
        defer a.free(text);
        try std.testing.expectEqualStrings("\xef\xbf\xbc", text);
    }
    for (moves) |move| {
        const element = section.tree.elements[move.element_index];
        const raw = section.tree.source[element.start_tag.start..element.end];
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, reopened.sections[0].tree.source, raw));
    }
    const next_id = try @import("paragraph_instance_ids.zig").next(a, &.{section.tree}, &.{id}, session.options.max_sites);
    var repeated = try @import("paragraph_structure_split.zig").prepareAnchored(a, &section.tree, &candidate, 1, 0, 0, next_id, 4_000_000);
    defer repeated.deinit(a);
    projected[0].structure_values = repeated;
    projected[0].last_paragraph += 1;
    const twice = try proxy.save();
    defer a.free(twice);
    var opened_twice = try editor.open(a, twice, .{});
    defer opened_twice.deinit();
    const empty = try opened_twice.anchorText(0, 2);
    defer a.free(empty);
    try std.testing.expectEqualStrings("", empty);
    const moved = try opened_twice.anchorText(0, 3);
    defer a.free(moved);
    try std.testing.expectEqualStrings("\xef\xbf\xbc", moved);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, values: *const model.Values, generated: u32) !void {
            var result = try @import("paragraph_structure_split.zig").prepareAnchored(allocator, tree, values, 1, 0, 0, generated, 4_000_000);
            defer result.deinit(allocator);
        }
    }.run, .{ &section.tree, &candidate, next_id });
    const untouched = try session.save();
    defer a.free(untouched);
    try std.testing.expectEqualSlices(u8, input, untouched);
    try std.testing.expect(try session.splitParagraphAnchored(0, 1, 1, 0));
    const active = try session.anchorText(0, 2);
    defer a.free(active);
    try std.testing.expectEqualStrings("\xef\xbf\xbc", active);
    const once = try session.save();
    defer a.free(once);
    try std.testing.expectError(error.ProtectedInlineControl, session.splitParagraphAnchored(0, 2, 0, 1));
    const refused = try session.save();
    defer a.free(refused);
    try std.testing.expectEqualSlices(u8, once, refused);
    try std.testing.expect(try session.splitParagraphAnchored(0, 2, 0, 0));
    const final = try session.save();
    defer a.free(final);
    var final_session = try editor.open(a, final, .{});
    defer final_session.deinit();
    try std.testing.expectEqual(@as(usize, 3), final_session.sections[0].last_paragraph);
}
