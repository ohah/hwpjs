//! Publish only a fully linked field-exterior candidate; labels stay clean.
const std = @import("std");
pub fn splice(self: *@import("editor_session.zig").Session, section_index: usize, index: usize, start: u32, deleted: u32, inserted: []const u8, section_limit: usize) !bool {
    const a = self.allocator;
    const selected = &self.sections[section_index];
    const current = &selected.structure_values.?;
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    if (selected.sites.items.len != 0) return error.DuplicateCurrentTextOwner;
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, self.sections.len);
    defer a.free(trees);
    for (self.sections, trees) |section, *tree| tree.* = section.tree;
    var report = try @import("field_markers.zig").inspect(a, trees, .{});
    defer report.deinit();
    var projection = try @import("field_current_spans.zig").projectForExterior(a, trees, section_index, current, index, &report, @import("editor_session.zig").siteOptions(self.options), 200000);
    defer projection.deinit(a);
    const spans = projection.spans;
    var other: usize = 0;
    for (current.paragraphs, 0..) |row, ordinal| {
        if (ordinal == index) continue;
        for (row.sites.items) |site| {
            if (site.text.len > section_limit -| other) return error.LimitExceeded;
            other += site.text.len;
        }
    }
    const target = try @import("field_current_exterior_insertion_site.zig").selectProjected(a, trees, section_index, current, index, &report, start, deleted, &projection);
    var candidate = try current.clone(a);
    defer candidate.deinit(a);
    const edited = (try @import("field_outside_splice.zig").prepareAtSite(a, &selected.tree, &candidate.paragraphs[index], spans, index, start, deleted, inserted, section_limit -| other, target)) orelse return false;
    candidate.paragraphs[index].deinit(a);
    candidate.paragraphs[index] = edited;
    const verified = try @import("field_current_spans.zig").buildForExterior(a, trees, section_index, &candidate, index, &report, 200000);
    defer a.free(verified);
    if (try @import("formula_section_save.zig").hasFormula(a, &selected.tree)) {
        var proxy = self.*;
        proxy.sections = try a.dupe(@import("editor_session.zig").Section, self.sections);
        defer a.free(proxy.sections);
        proxy.sections[section_index].structure_values = candidate;
        const saved = try proxy.save();
        defer a.free(saved);
    }
    std.mem.swap(@TypeOf(candidate), current, &candidate);
    return true;
}

test "field exterior session allocation failures preserve text markers and dirty state" {
    const a = std.testing.allocator;
    const editor = @import("editor_session.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const labels = try session.fieldLabels(0, 3);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
    try std.testing.expect(try session.spliceFieldLabel(0, 3, labels[0].begin_element, @intCast(labels[0].start), 0, "기존"));
    try std.testing.expectEqual(@as(usize, 1), session.sections[0].field_dirty.items.len);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].structure_values = try source.sections[0].structure_values.?.clone(allocator);
            defer proxy.sections[0].structure_values.?.deinit(allocator);
            proxy.sections[0].field_dirty = .empty;
            defer proxy.sections[0].field_dirty.deinit(allocator);
            try proxy.sections[0].field_dirty.appendSlice(allocator, source.sections[0].field_dirty.items);
            const changed = proxy.splice(0, 3, 0, 0, "한😀<&") catch |err| {
                try std.testing.expectEqualSlices(@import("text_sites_save.zig").FieldDirty, source.sections[0].field_dirty.items, proxy.sections[0].field_dirty.items);
                for (source.sections[0].structure_values.?.paragraphs, proxy.sections[0].structure_values.?.paragraphs) |old, now| {
                    try std.testing.expectEqual(old.sites.items.len, now.sites.items.len);
                    for (old.sites.items, now.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                    if (old.field_positions) |markers| try std.testing.expectEqualSlices(@import("field_position.zig").Position, markers, now.field_positions.?);
                    try std.testing.expectEqualDeep(old.character_styles, now.character_styles);
                }
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqualSlices(@import("text_sites_save.zig").FieldDirty, source.sections[0].field_dirty.items, proxy.sections[0].field_dirty.items);
            const old = source.sections[0].structure_values.?.paragraphs[2].field_positions.?;
            const now = proxy.sections[0].structure_values.?.paragraphs[2].field_positions.?;
            try std.testing.expect(old.len != 0);
            for (old, now) |before, after| try std.testing.expectEqual(before.unit + 5, after.unit);
        }
    }.run, .{&session});
}

test "field exterior query allocation failures never change the current ZIP" {
    const a = std.testing.allocator;
    const editor = @import("editor_session.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const before = try session.save();
    defer a.free(before);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            const query = @import("field_outside_query.zig");
            try std.testing.expect(try query.canEdit(&proxy, 0, 3, 0, 0));
            try std.testing.expect(!try query.canEdit(&proxy, 0, 3, 7, 7));
        }
    }.run, .{&session});
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "field exterior session saves reopens and preserves history and label dirty state" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const original = try session.save();
    defer a.free(original);
    const text = @import("paragraph_text_snapshot.zig");
    const original_rows = try text.read(a, &session, 0);
    defer text.free(a, original_rows);
    const before = try session.fieldLabels(0, 3);
    defer a.free(before);
    const query = @import("field_outside_query.zig");
    try std.testing.expect(try query.canEdit(&session, 0, 3, 0, 0));
    try std.testing.expect(try query.canEdit(&session, 0, 3, 0, 7));
    try std.testing.expect(!try query.canEdit(&session, 0, 3, 7, 7));
    try std.testing.expect(!try session.canEdit(0, 3));
    try std.testing.expectError(error.InvalidTextPosition, query.canEdit(&session, 0, 3, 2, 1));
    try std.testing.expectEqual(@as(usize, 1), before.len);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .paragraph = 3, .start = 0, .deleted = 0, .inserted = "한😀<&" };
    try std.testing.expect(try history.apply(&session, command));
    const after = try session.fieldLabels(0, 3);
    defer a.free(after);
    try std.testing.expectEqual(before[0].start + 5, after[0].start);
    try std.testing.expectEqual(before[0].end + 5, after[0].end);
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const actual_rows = try text.read(a, &reopened, 0);
    defer text.free(a, actual_rows);
    try std.testing.expectEqual(original_rows.len, actual_rows.len);
    for (original_rows, actual_rows) |old, now| {
        try std.testing.expectEqual(old.paragraph, now.paragraph);
        if (old.paragraph == 3) {
            const expected = try std.mem.concat(a, u8, &.{ "한😀<&", old.text });
            defer a.free(expected);
            try std.testing.expectEqualStrings(expected, now.text);
        } else try std.testing.expectEqualStrings(old.text, now.text);
    }
    const labels = try reopened.fieldLabels(0, 3);
    defer a.free(labels);
    try std.testing.expectEqual(after[0].start, labels[0].start);
    try std.testing.expectEqual(after[0].end, labels[0].end);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, original, undone);
    var invalid = command;
    invalid.start = @intCast(before[0].start);
    try std.testing.expectError(error.ProtectedFieldRange, history.apply(&session, invalid));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
