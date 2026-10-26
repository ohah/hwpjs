const std = @import("std");
const editor = @import("editor_session.zig");
const a = std.testing.allocator;
fn load(i: usize) ![]u8 {
    return @import("inherited_field_test_source.zig").load(a, i);
}
fn savedEqual(s: *editor.Session, expected: []const u8) !void {
    const bytes = try s.save();
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, expected, bytes);
}

fn queryFailure(allocator: std.mem.Allocator, source: *const editor.Session, p: usize) !void {
    var proxy = source.*;
    proxy.allocator = allocator;
    const labels = try proxy.fieldLabels(0, p);
    defer allocator.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
}
fn mutationFailure(allocator: std.mem.Allocator, source: *const editor.Session, p: usize, begin: u32) !void {
    var proxy = source.*;
    proxy.allocator = allocator;
    proxy.sections = try allocator.dupe(editor.Section, source.sections);
    defer allocator.free(proxy.sections);
    proxy.sections[0].structure_values = try source.sections[0].structure_values.?.clone(allocator);
    defer proxy.sections[0].structure_values.?.deinit(allocator);
    proxy.sections[0].field_dirty = .empty;
    defer proxy.sections[0].field_dirty.deinit(allocator);
    try proxy.sections[0].field_dirty.appendSlice(allocator, source.sections[0].field_dirty.items);
    const changed = proxy.spliceFieldLabel(0, p, begin, 0, 0, "OOM😀<&") catch |err| {
        for (source.sections[0].structure_values.?.paragraphs, proxy.sections[0].structure_values.?.paragraphs) |old, now| {
            try std.testing.expectEqual(old.template_element, now.template_element);
            try std.testing.expectEqual(old.source_ordinal, now.source_ordinal);
            try std.testing.expectEqual(old.sites.items.len, now.sites.items.len);
            for (old.sites.items, now.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
            try std.testing.expectEqualDeep(old.character_styles, now.character_styles);
        }
        try std.testing.expectEqualSlices(@import("text_sites_save.zig").FieldDirty, source.sections[0].field_dirty.items, proxy.sections[0].field_dirty.items);
        return err;
    };
    try std.testing.expect(changed);
}

fn exteriorFailures(allocator: std.mem.Allocator, source: *const editor.Session, p: usize) !void {
    var proxy = source.*;
    proxy.allocator = allocator;
    try std.testing.expect(!try proxy.canEdit(0, p));
    if (proxy.splice(0, p, 0, 0, "blocked")) |_| return error.ExpectedRefusal else |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(error.ProtectedFieldRange, err);
    }
}
test "continuation v3 plain rows label and exterior allocation failures atomic" {
    for ([_]usize{ 18, 61, 3 }, 0..) |p, i| {
        const bytes = try load(i);
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        try std.testing.expect(try s.splice(0, 1, 0, 0, "検証😀"));
        const before = try s.save();
        defer a.free(before);
        const labels = try s.fieldLabels(0, p);
        defer a.free(labels);
        try std.testing.expectEqual(@as(usize, 1), labels.len);
        try @import("../testing/allocation_failures.zig").check(queryFailure, .{ &s, p });
        try @import("../testing/allocation_failures.zig").check(mutationFailure, .{ &s, p, labels[0].begin_element });
        try @import("../testing/allocation_failures.zig").check(exteriorFailures, .{ &s, p });
        try savedEqual(&s, before);
        try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
    }
}
test "continuation v3 every original label row query and plain capability unchanged" {
    const expected_rows = [_]usize{ 202, 124, 24 };
    const expected_label_rows = [_]usize{ 186, 37, 20 };
    var checked_rows: usize = 0;
    for (0..3) |i| {
        const bytes = try load(i);
        defer a.free(bytes);
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        const n = s.sections[0].last_paragraph;
        try std.testing.expectEqual(expected_rows[i], n);
        checked_rows += n;
        var source_label_rows: usize = 0;
        const Target = @import("field_label_targets.zig").Target;
        const labels = try a.alloc([]Target, n);
        defer a.free(labels);
        const plains = try a.alloc(bool, n);
        defer a.free(plains);
        var init: usize = 0;
        defer for (labels[0..init]) |v| a.free(v);
        for (0..n) |k| {
            labels[k] = try s.fieldLabels(0, k + 1);
            init += 1;
            if (labels[k].len != 0) source_label_rows += 1;
            plains[k] = try s.canEdit(0, k + 1);
        }
        try std.testing.expectEqual(expected_label_rows[i], source_label_rows);
        try std.testing.expect(try s.splice(0, 1, 0, 0, "検証😀"));
        for (0..n) |k| {
            const now = try s.fieldLabels(0, k + 1);
            defer a.free(now);
            try std.testing.expectEqualSlices(Target, labels[k], now);
            try std.testing.expectEqual(plains[k], try s.canEdit(0, k + 1));
        }
    }
    try std.testing.expectEqual(@as(usize, 350), checked_rows);
}

test "continuation v3 source current exterior boundaries and explicit label dirty agree" {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>outside</p:t></p:run></p:p><p:p><p:run><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' editable='0' dirty='0'/></p:ctrl><p:t>A</p:t><p:tbl/><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>Z</p:t></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    for (0..2) |phase| {
        var s = try editor.open(a, bytes, .{});
        defer s.deinit();
        if (phase == 1) try std.testing.expect(try s.splice(0, 1, 0, 0, "検証"));
        try std.testing.expect(!try s.canEdit(0, 2));
        const query = @import("field_outside_query.zig");
        try std.testing.expect(try query.canEdit(&s, 0, 2, 0, 0));
        try std.testing.expect(try s.splice(0, 2, 0, 0, "L"));
        const labels = try s.fieldLabels(0, 2);
        defer a.free(labels);
        try std.testing.expectEqual(@as(usize, 1), labels.len);
        try std.testing.expect(!try query.canEdit(&s, 0, 2, labels[0].start, labels[0].start));
        try std.testing.expectError(error.ProtectedFieldRange, s.splice(0, 2, labels[0].start, 0, "NO"));
        try std.testing.expectError(error.ProtectedFieldRange, s.splice(0, 2, labels[0].end, 0, "NO"));
        const positions = (try @import("field_source_outside_positions.zig").prepareAction(&s, 0, 2, 0, 0, .splice)).?;
        defer a.free(positions);
        const tail: u32 = @intCast(positions[positions.len - 1].end_unit);
        try std.testing.expect(try query.canEdit(&s, 0, 2, tail, tail));
        try std.testing.expect(try s.splice(0, 2, tail, 0, "R"));
        try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
        try std.testing.expect(try s.spliceFieldLabel(0, 2, labels[0].begin_element, labels[0].start, 0, "label"));
        try std.testing.expectEqual(@as(usize, 1), s.sections[0].field_dirty.items.len);
        try std.testing.expect(s.sections[0].field_dirty.items[0].dirty);
        const saved = try s.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        const again = try reopened.fieldLabels(0, 2);
        defer a.free(again);
        try std.testing.expectEqual(labels[0].end + 5, again[0].end);
    }
}

test "continuation v3 styled target remains unsupported and altered owner never grants generic path" {
    const bytes = try load(2);
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    try std.testing.expect(try s.splice(0, 1, 0, 0, "検証"));
    const labels = try s.fieldLabels(0, 3);
    defer a.free(labels);
    var values = try s.sections[0].structure_values.?.clone(a);
    defer values.deinit(a);
    var sections = [_]editor.Section{s.sections[0]};
    sections[0].structure_values = values;
    var proxy = s;
    proxy.sections = &sections;
    const row = &sections[0].structure_values.?.paragraphs[2];
    row.character_styles = &.{};
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, proxy.fieldLabels(0, 3));
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, proxy.spliceFieldLabel(0, 3, labels[0].begin_element, 0, 0, "NO"));
    // Exterior guards protect styled fields too, but never grant styled label support.
    try std.testing.expect(!try proxy.canEdit(0, 3));
    try std.testing.expectError(error.ProtectedFieldRange, proxy.splice(0, 3, 0, 0, "NO"));
    row.character_styles = null;
    row.source_ordinal = 999999;
    // Whole-row capability can deny without proving a malformed owner.
    // Mutating paths below must still diagnose the invalid source binding.
    try std.testing.expect(!try proxy.canEdit(0, 3));
    try std.testing.expectError(error.SourceBindingMismatch, proxy.splice(0, 3, 0, 0, "NO"));
    try std.testing.expectError(error.SourceBindingMismatch, proxy.spliceFieldLabel(0, 3, labels[0].begin_element, 0, 0, "NO"));
}
