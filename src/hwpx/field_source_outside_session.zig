//! Original-source exterior edits reuse atomic text sites without topology edits.
const std = @import("std");
pub fn splice(self: *@import("editor_session.zig").Session, section: usize, paragraph: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize) !?bool {
    const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
    const plan = (try @import("field_source_outside_plan.zig").prepare(self, section, paragraph, start, end)) orelse return null;
    defer plan.deinit(self.allocator);
    if (try @import("formula_section_save.zig").hasFormula(self.allocator, &self.sections[section].tree)) {
        const trees = try self.allocator.alloc(@import("xml_part_tree.zig").Tree, self.sections.len);
        defer self.allocator.free(trees);
        for (self.sections, trees) |part, *tree| tree.* = part.tree;
        return try @import("formula_splice.zig").spliceProjectedWithOverrides(self.allocator, trees, section, &self.sections[section].sites, plan.segments, plan.start, plan.end - plan.start, inserted, limit, &self.sections[section].formula_definitions, &self.sections[section].formula_result_overrides, @import("editor_session.zig").siteOptions(self.options));
    }
    return try @import("text_splice_transaction.zig").spliceProjected(self.allocator, &self.sections[section].sites, plan.segments, plan.start, plan.end - plan.start, inserted, limit, null);
}
test "source field exterior hyperlink query and splice agree after dirty label" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const labels = try session.fieldLabels(0, 1);
    defer a.free(labels);
    try std.testing.expect(try session.spliceFieldLabel(0, 1, labels[0].begin_element, @intCast(labels[0].start), 0, "검증😀"));
    const current = try session.fieldLabels(0, 1);
    defer a.free(current);
    const unit: u32 = @intCast(current[current.len - 1].end + 1);
    const before_refusal = try session.save();
    defer a.free(before_refusal);
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&session, 0, 1, unit, unit));
    try std.testing.expectEqual(@as(?bool, null), try @import("page_area_source_session.zig").splice(&session, 0, 1, unit, 0, "외부", session.options.max_text_bytes, false));
    try std.testing.expectError(error.UnsupportedParagraphControl, @import("column_boundary_session.zig").splice(&session, 0, 1, unit, 0, "외부", session.options.max_text_bytes, false));
    const after_refusal = try session.save();
    defer a.free(after_refusal);
    try std.testing.expectEqualSlices(u8, before_refusal, after_refusal);
    try std.testing.expect(try session.splice(0, 1, unit, 0, "외부"));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, 1, 1, 0, "금지"));
    const after_protected = try session.save();
    defer a.free(after_protected);
    try std.testing.expectEqualSlices(u8, saved, after_protected);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&reopened, 0, 1, unit, unit));
}
test "source field exterior session allocation failures keep sites and existing dirty labels" {
    const a = std.testing.allocator;
    const editor = @import("editor_session.zig");
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const labels = try session.fieldLabels(0, 2);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
    try std.testing.expect(try session.spliceFieldLabel(0, 2, labels[0].begin_element, @intCast(labels[0].start), 0, "기존"));
    try std.testing.expectEqual(@as(usize, 1), session.sections[0].field_dirty.items.len);
    const baseline = try session.save();
    defer a.free(baseline);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            proxy.sections[0].field_dirty = .empty;
            defer proxy.sections[0].field_dirty.deinit(allocator);
            try proxy.sections[0].field_dirty.appendSlice(allocator, source.sections[0].field_dirty.items);
            const changed = proxy.splice(0, 2, 0, 0, "한😀<&") catch |err| {
                try std.testing.expect(proxy.sections[0].structure_values == null);
                try std.testing.expectEqualSlices(@import("text_sites_save.zig").FieldDirty, source.sections[0].field_dirty.items, proxy.sections[0].field_dirty.items);
                for (source.sections[0].sites.items, proxy.sections[0].sites.items) |old, now| {
                    try std.testing.expectEqual(old.element_index, now.element_index);
                    try std.testing.expectEqual(old.start, now.start);
                    try std.testing.expectEqual(old.end, now.end);
                    try std.testing.expectEqualStrings(old.text, now.text);
                }
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expect(proxy.sections[0].structure_values == null);
            try std.testing.expectEqualSlices(@import("text_sites_save.zig").FieldDirty, source.sections[0].field_dirty.items, proxy.sections[0].field_dirty.items);
        }
    }.run, .{&session});
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, baseline, after);
}

test "source field exterior session saves reopens and preserves original topology and dirty state" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const before = try session.fieldLabels(0, 2);
    defer a.free(before);
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&session, 0, 2, 0, 0));
    try std.testing.expect(!try @import("field_outside_query.zig").canEdit(&session, 0, 2, 7, 7));
    try std.testing.expect(!try session.canEdit(0, 2));
    try std.testing.expectEqual(@as(usize, 1), before.len);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .paragraph = 2, .start = 0, .deleted = 0, .inserted = "한😀<&" };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expect(session.sections[0].structure_values == null);
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
    const after = try session.fieldLabels(0, 2);
    defer a.free(after);
    try std.testing.expectEqual(before[0].start + 5, after[0].start);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const labels = try reopened.fieldLabels(0, 2);
    defer a.free(labels);
    try std.testing.expectEqual(after[0].start, labels[0].start);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    var invalid = command;
    invalid.start = 7;
    try std.testing.expectError(error.ProtectedFieldRange, history.apply(&session, invalid));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
