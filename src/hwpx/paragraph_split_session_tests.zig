const std = @import("std");
const editor = @import("editor_session.zig");
const history_mod = @import("editor_history.zig");

test "HWPX field split selection deletion marks only changed labels dirty" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var original = try editor.open(a, input, .{});
    defer original.deinit();
    const xml = try a.dupe(u8, original.sections[0].tree.source);
    defer a.free(xml);
    var cursor: usize = 0;
    while (std.mem.indexOfPos(u8, xml, cursor, "dirty=\"1\"")) |at| {
        xml[at + 7] = '0';
        cursor = at + 9;
    }
    const clean = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = original.sections[0].entry_index, .bytes = xml }}, .{});
    defer a.free(clean);
    for (0..3) |mode| {
        var session = try editor.open(a, clean, .{});
        defer session.deinit();
        var history = try history_mod.History.init(&session, 8, 4_000_000);
        defer history.deinit();
        const labels = try session.fieldLabels(0, 1);
        defer a.free(labels);
        const start = if (mode == 2) labels[0].end else labels[0].start;
        try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 1, .start = start, .deleted = @intFromBool(mode != 0), .inserted = "" }));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        var field_index: usize = 0;
        for (reopened.sections[0].tree.elements, 0..) |element, index| {
            if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
            const attr = (try @import("xml_part_attributes.zig").find(a, &reopened.sections[0].tree, index, "", "dirty")).?;
            const value = try attr.toUtf8(a, 100);
            defer a.free(value);
            try std.testing.expectEqual(mode == 1 and field_index == 0, try @import("xml_values.zig").boolean(value));
            field_index += 1;
        }
        try std.testing.expectEqual(@as(usize, 4), field_index);
        try std.testing.expect(try history.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, clean, undone);
    }
}

test "HWPX public generated field paragraph splits again and retains label inputs" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try history_mod.History.init(&session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try session.splitParagraph(0, 1, 0, 0));
    const before = try session.fieldLabels(0, 2);
    defer a.free(before);
    const before_zip = try session.save();
    defer a.free(before_zip);
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 2, .start = 1, .deleted = 0, .inserted = "" }));
    const left = try session.fieldLabels(0, 2);
    defer a.free(left);
    const right = try session.fieldLabels(0, 3);
    defer a.free(right);
    try std.testing.expectEqual(@as(u32, 1), left[0].end);
    try std.testing.expectEqual(before[0].end - 1, right[0].end);
    try std.testing.expect(try history.apply(&session, .{ .kind = .field, .paragraph = 3, .begin_element = right[0].begin_element, .start = 0, .deleted = 0, .inserted = "반복😀" }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const reopened_right = try reopened.fieldLabels(0, 3);
    defer a.free(reopened_right);
    try std.testing.expectEqual(right[0].end + 4, reopened_right[0].end);
    try std.testing.expectError(error.InvalidParagraphAdjacency, session.mergeParagraphPair(0, 2, 4));
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, session.mergeParagraph(0, 3));
    const after_refused_merge = try session.save();
    defer a.free(after_refused_merge);
    try std.testing.expectEqualSlices(u8, saved, after_refused_merge);
    try std.testing.expect(try history.apply(&session, .{ .kind = .merge, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    const merged_labels = try session.fieldLabels(0, 2);
    defer a.free(merged_labels);
    try std.testing.expectEqual(before[0].end + 4, merged_labels[0].end);
    const merged_zip = try session.save();
    defer a.free(merged_zip);
    var merged_reopened = try editor.open(a, merged_zip, .{});
    defer merged_reopened.deinit();
    const merged_targets = try merged_reopened.fieldLabels(0, 2);
    defer a.free(merged_targets);
    try std.testing.expectEqual(merged_labels[0].end, merged_targets[0].end);
    try std.testing.expect(try history.undo(&session));
    const restored_split = try session.save();
    defer a.free(restored_split);
    try std.testing.expectEqualSlices(u8, saved, restored_split);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before_zip, undone);
}

test "HWPX public field split and dirty ZIP save release every failed allocation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            proxy.sections[0].structure_values = null;
            defer if (proxy.sections[0].structure_values) |*values| values.deinit(allocator);
            const changed = proxy.splitParagraph(0, 1, 0, 0) catch |err| {
                try std.testing.expect(proxy.sections[0].structure_values == null);
                try std.testing.expectEqual(source.sections[0].first_paragraph, proxy.sections[0].first_paragraph);
                try std.testing.expectEqual(source.sections[0].last_paragraph, proxy.sections[0].last_paragraph);
                for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| try std.testing.expectEqualStrings(before.text, after.text);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(source.sections[0].last_paragraph + 1, proxy.sections[0].last_paragraph);
        }
    }.run, .{&session});
    try std.testing.expect(try session.splitParagraph(0, 1, 0, 0));
    const labels = try session.fieldLabels(0, 2);
    defer a.free(labels);
    try std.testing.expect(try session.spliceFieldLabel(0, 2, labels[0].begin_element, 0, 0, "저장😀<&"));
    const expected = try session.save();
    defer a.free(expected);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, saved: []const u8) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            const output = try proxy.save();
            defer allocator.free(output);
            try std.testing.expectEqualSlices(u8, saved, output);
        }
    }.run, .{ &session, expected });
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, expected, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "HWPX field split plain and label transactions survive every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 1, 0, 0));
    const labels = try session.fieldLabels(0, 2);
    defer a.free(labels);
    for ([_]bool{ false, true }) |field_mode| {
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, source: *const editor.Session, begin: usize, field: bool) !void {
                var proxy = source.*;
                proxy.allocator = allocator;
                proxy.sections = try allocator.dupe(editor.Section, source.sections);
                defer allocator.free(proxy.sections);
                proxy.sections[0].structure_values = try source.sections[0].structure_values.?.clone(allocator);
                defer proxy.sections[0].structure_values.?.deinit(allocator);
                proxy.sections[0].field_dirty = .empty;
                defer proxy.sections[0].field_dirty.deinit(allocator);
                const changed = (if (field) proxy.spliceFieldLabel(0, 2, begin, 0, 0, "할당😀<&") else proxy.splice(0, 1, 0, 0, "할당😀<&")) catch |err| {
                    try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].field_dirty.items.len);
                    for (source.sections[0].structure_values.?.paragraphs, proxy.sections[0].structure_values.?.paragraphs) |old, now| {
                        for (old.sites.items, now.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                        if (old.field_positions) |markers| try std.testing.expectEqualSlices(@import("field_position.zig").Position, markers, now.field_positions.?);
                    }
                    return err;
                };
                try std.testing.expect(changed);
                try std.testing.expectEqual(@as(usize, @intFromBool(field)), proxy.sections[0].field_dirty.items.len);
                if (field) try std.testing.expect(proxy.sections[0].field_dirty.items[0].dirty);
            }
        }.run, .{ &session, labels[0].begin_element, field_mode });
    }
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "HWPX public field paragraph split input save and history cover actual label fragments" {
    const a = std.testing.allocator;
    var exercised: usize = 0;
    for ([_][]const u8{ "hyperlink", "issue144-fields-crossing-lineseg-boundary" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var inventory = try editor.open(a, input, .{});
        defer inventory.deinit();
        const section = &inventory.sections[0];
        for (section.first_paragraph..section.last_paragraph + 1) |paragraph| {
            const labels = try inventory.fieldLabels(0, paragraph);
            defer a.free(labels);
            for (labels) |label| {
                var session = try editor.open(a, input, .{});
                defer session.deinit();
                var history = try history_mod.History.init(&session, 8, 4_000_000);
                defer history.deinit();
                try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = paragraph, .start = label.start, .deleted = 0, .inserted = "" }));
                const split_saved = try session.save();
                defer a.free(split_saved);
                if (std.mem.eql(u8, name, "issue144-fields-crossing-lineseg-boundary") and paragraph == 3) {
                    try std.testing.expect(!try session.canEdit(0, paragraph));
                    try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, paragraph, 0, 0, "not-plain"));
                    const refused_save = try session.save();
                    defer a.free(refused_save);
                    try std.testing.expectEqualSlices(u8, split_saved, refused_save);
                }
                if (std.mem.eql(u8, name, "hyperlink") and paragraph == 1) {
                    try std.testing.expect(try session.canEdit(0, paragraph));
                    try std.testing.expect(!try session.canEdit(0, paragraph + 1));
                    try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, paragraph + 1, 0, 0, "outside"));
                    const refused_save = try session.save();
                    defer a.free(refused_save);
                    try std.testing.expectEqualSlices(u8, split_saved, refused_save);
                    try std.testing.expect(try history.apply(&session, .{ .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "왼쪽😀" }));
                    const typed_left = try session.save();
                    defer a.free(typed_left);
                    var left_reopened = try editor.open(a, typed_left, .{});
                    defer left_reopened.deinit();
                    const left_text = try left_reopened.anchorText(0, paragraph);
                    defer a.free(left_text);
                    try std.testing.expectEqualStrings("왼쪽😀", left_text);
                    const left_labels = try session.fieldLabels(0, paragraph);
                    defer a.free(left_labels);
                    try std.testing.expectEqual(@as(usize, 0), left_labels.len);
                    try std.testing.expect(try history.undo(&session));
                    const restored = try session.save();
                    defer a.free(restored);
                    try std.testing.expectEqualSlices(u8, split_saved, restored);
                }
                const moved = try session.fieldLabels(0, paragraph + 1);
                defer a.free(moved);
                try std.testing.expectEqual(@as(usize, 1), moved.len);
                try std.testing.expectEqual(label.end - label.start, moved[0].end);
                try std.testing.expect(try history.apply(&session, .{ .kind = .field, .paragraph = paragraph + 1, .begin_element = moved[0].begin_element, .start = moved[0].start, .deleted = 0, .inserted = "공개😀<&" }));
                const saved = try session.save();
                defer a.free(saved);
                var reopened = try editor.open(a, saved, .{});
                defer reopened.deinit();
                const after = try reopened.fieldLabels(0, paragraph + 1);
                defer a.free(after);
                try std.testing.expectEqual(moved[0].end + 6, after[0].end);
                try std.testing.expect(try history.undo(&session));
                const undone_input = try session.save();
                defer a.free(undone_input);
                try std.testing.expectEqualSlices(u8, split_saved, undone_input);
                try std.testing.expect(try history.undo(&session));
                const undone_split = try session.save();
                defer a.free(undone_split);
                try std.testing.expectEqualSlices(u8, input, undone_split);
                try std.testing.expect(try history.redo(&session));
                try std.testing.expect(try history.redo(&session));
                const redone = try session.save();
                defer a.free(redone);
                try std.testing.expectEqualSlices(u8, saved, redone);
                exercised += 1;
            }
        }
    }
    try std.testing.expectEqual(@as(usize, 7), exercised);
}

test "HWPX native split history saves repeated generation and restores original bytes" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try history_mod.History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const original_count = session.sections[0].last_paragraph;
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "" }));
    try std.testing.expectEqual(original_count + 1, session.sections[0].last_paragraph);
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].sites.items.len);
    try std.testing.expect(try session.canEdit(0, 3));
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 3, .start = 0, .deleted = 0, .inserted = "😀" }));
    const inserted = try session.save();
    defer a.free(inserted);
    try std.testing.expectError(error.SplitSurrogatePair, session.splitParagraph(0, 3, 1, 0));
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = 3, .start = 2, .deleted = 0, .inserted = "" }));
    try std.testing.expectEqual(original_count + 2, session.sections[0].last_paragraph);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(session.sections[0].last_paragraph, reopened.sections[0].last_paragraph);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, inserted, undone);
    try std.testing.expectError(error.InvalidTextPosition, history.apply(&session, .{ .kind = .split, .paragraph = 3, .start = 0xffffffff, .deleted = 0, .inserted = "" }));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    for (0..3) |_| try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expect(session.sections[0].structure_values == null);
}

test "HWPX native split maps later section source ordinals and restores their edits" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "pagedefs", "lists" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        var history = try history_mod.History.init(&session, 8, 4_000_000);
        defer history.deinit();
        try std.testing.expectEqual(@as(usize, 2), session.sections.len);
        var target: ?usize = null;
        for (session.sections[1].first_paragraph..session.sections[1].last_paragraph + 1) |paragraph| {
            if (try session.canEdit(1, paragraph)) {
                target = paragraph;
                break;
            }
        }
        const original_paragraph = target orelse return error.MissingEditableParagraph;
        const text = try session.anchorText(1, original_paragraph);
        defer a.free(text);
        var applied = false;
        const last = session.sections[0].last_paragraph;
        for (session.sections[0].first_paragraph..last + 1) |paragraph| {
            _ = history.apply(&session, .{ .kind = .split, .paragraph = paragraph, .start = 0, .deleted = 0, .inserted = "" }) catch |err| switch (err) {
                error.UnsupportedParagraphControl, error.UnsupportedInlineControl, error.MissingTextSite, error.UnsupportedParagraphTracking => continue,
                else => return err,
            };
            applied = true;
            break;
        }
        try std.testing.expect(applied);
        const shifted = original_paragraph + 1;
        try std.testing.expect(try session.canEdit(1, shifted));
        const shifted_text = try session.anchorText(1, shifted);
        defer a.free(shifted_text);
        try std.testing.expectEqualStrings(text, shifted_text);
        try std.testing.expect(try history.apply(&session, .{ .section = 1, .paragraph = shifted, .start = 0, .deleted = 0, .inserted = "다음구역" }));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        const edited = try reopened.anchorText(1, shifted);
        defer a.free(edited);
        const expected = try std.mem.concat(a, u8, &.{ "다음구역", text });
        defer a.free(expected);
        try std.testing.expectEqualStrings(expected, edited);
        try std.testing.expect(try history.undo(&session));
        try std.testing.expect(try history.undo(&session));
        const restored = try session.save();
        defer a.free(restored);
        try std.testing.expectEqualSlices(u8, input, restored);
    }
}

test "HWPX native split allocation failures preserve both initial and generated state" {
    const a = std.testing.allocator;
    // Keep the exhaustive failure-injection backing independent from the
    // long-lived fixture allocations. Stack capture per successful allocation
    // is not the invariant under test; failing allocation traces and byte
    // accounting remain supplied by checkAllAllocationFailures.
    var failure_backing: std.heap.DebugAllocator(.{ .stack_trace_frames = 0 }) = .init;
    defer std.testing.expect(failure_backing.deinit() == .ok) catch @panic("split failure backing leaked");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    for (0..2) |phase| {
        try std.testing.checkAllAllocationFailures(failure_backing.allocator(), struct {
            fn run(allocator: std.mem.Allocator, source: *const editor.Session, paragraph: usize) !void {
                var proxy = source.*;
                proxy.allocator = allocator;
                proxy.sections = try allocator.dupe(editor.Section, source.sections);
                defer allocator.free(proxy.sections);
                proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
                defer proxy.sections[0].sites.deinit(allocator);
                proxy.sections[0].structure_values = null;
                if (source.sections[0].structure_values) |*values| proxy.sections[0].structure_values = try values.clone(allocator);
                defer if (proxy.sections[0].structure_values) |*values| values.deinit(allocator);
                _ = proxy.splitParagraph(0, paragraph, 0, 0) catch |err| {
                    try std.testing.expectEqual(source.sections[0].last_paragraph, proxy.sections[0].last_paragraph);
                    try std.testing.expectEqual(source.sections[0].structure_values == null, proxy.sections[0].structure_values == null);
                    if (source.sections[0].structure_values) |expected| {
                        const actual = proxy.sections[0].structure_values.?;
                        try std.testing.expectEqual(expected.paragraphs.len, actual.paragraphs.len);
                        for (expected.paragraphs, actual.paragraphs) |before, after| {
                            try std.testing.expectEqual(before.generated_id, after.generated_id);
                            for (before.sites.items, after.sites.items) |old, now| try std.testing.expectEqualStrings(old.text, now.text);
                        }
                    } else for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| try std.testing.expectEqualStrings(before.text, after.text);
                    return err;
                };
            }
        }.run, .{ &session, @as(usize, if (phase == 0) 2 else 3) });
        if (phase == 0) _ = try session.splitParagraph(0, 2, 0, 0);
    }
}

test "HWPX native split retains field label queries edits dirty state and history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try history_mod.History.init(&session, 8, 4_000_000);
    defer history.deinit();
    var field_paragraph: ?usize = null;
    var target: ?@import("field_label_targets.zig").Target = null;
    var plain: ?usize = null;
    for (session.sections[0].first_paragraph..session.sections[0].last_paragraph + 1) |paragraph| {
        if (try session.canEdit(0, paragraph)) {
            if (plain == null) plain = paragraph;
            continue;
        }
        const labels = try session.fieldLabels(0, paragraph);
        defer a.free(labels);
        if (labels.len > 0 and target == null) {
            target = labels[0];
            field_paragraph = paragraph;
        }
    }
    const plain_paragraph = plain orelse return error.MissingEditableParagraph;
    const original_field = field_paragraph orelse return error.MissingFieldLabel;
    const original_target = target.?;
    try std.testing.expect(try history.apply(&session, .{ .kind = .split, .paragraph = plain_paragraph, .start = 0, .deleted = 0, .inserted = "" }));
    const split_zip = try session.save();
    defer a.free(split_zip);
    const shifted_field = original_field + @intFromBool(plain_paragraph < original_field);
    const labels = try session.fieldLabels(0, shifted_field);
    defer a.free(labels);
    try std.testing.expect(labels.len > 0);
    try std.testing.expectEqual(original_target, labels[0]);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, paragraph: usize, field: @import("field_label_targets.zig").Target) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            proxy.sections[0].structure_values = try source.sections[0].structure_values.?.clone(allocator);
            defer proxy.sections[0].structure_values.?.deinit(allocator);
            proxy.sections[0].field_dirty = .empty;
            defer proxy.sections[0].field_dirty.deinit(allocator);
            _ = proxy.spliceFieldLabel(0, paragraph, field.begin_element, field.start, 0, "할당😀") catch |err| {
                try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].field_dirty.items.len);
                const before = source.sections[0].structure_values.?;
                const after = proxy.sections[0].structure_values.?;
                for (before.paragraphs, after.paragraphs) |old, now| {
                    for (old.sites.items, now.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                }
                return err;
            };
        }
    }.run, .{ &session, shifted_field, original_target });
    try std.testing.expect(try history.apply(&session, .{ .kind = .field, .paragraph = shifted_field, .begin_element = original_target.begin_element, .start = original_target.start, .deleted = 0, .inserted = "필드😀<&" }));
    try std.testing.expect(session.sections[0].field_dirty.items.len > 0);
    try std.testing.expect(session.sections[0].field_dirty.items[0].dirty);
    const edited = try session.save();
    defer a.free(edited);
    var reopened = try editor.open(a, edited, .{});
    defer reopened.deinit();
    var found = false;
    for (reopened.sections[0].sites.items) |site| if (std.mem.indexOf(u8, site.text, "필드😀<&") != null) {
        found = true;
    };
    try std.testing.expect(found);
    try std.testing.expect(try history.undo(&session));
    const restored_split = try session.save();
    defer a.free(restored_split);
    try std.testing.expectEqualSlices(u8, split_zip, restored_split);
    try std.testing.expect(try history.undo(&session));
    const restored_source = try session.save();
    defer a.free(restored_source);
    try std.testing.expectEqualSlices(u8, input, restored_source);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
}
