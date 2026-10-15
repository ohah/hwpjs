//! Partial result edits reuse shared UTF-16 splicing and the manual-result transaction.
const std = @import("std");
const editor = @import("editor_session.zig");

pub fn splice(session: *editor.Session, section_index: usize, begin: usize, start: u32, deleted: u32, inserted: []const u8) !bool {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    if (section.structure_values != null) return error.UnsupportedStructuralFormulaResultOverride;
    if (section.created_tables.entries.items.len != 0) return error.UnsupportedCreatedTableFormulaResultOverride;
    const a = session.allocator;
    var snapshot = try @import("formula_current_snapshot.zig").readFlat(a, session, section_index);
    defer snapshot.deinit(a);
    const display = for (snapshot.prepared) |field| {
        if (field.begin == begin) break field.display;
    } else return error.InvalidFormulaFieldNode;
    const items = try a.alloc(@import("text_sites.zig").Site, 1);
    const owned = a.dupe(u8, display) catch |err| {
        a.free(items);
        return err;
    };
    items[0] = .{ .element_index = begin, .start = 0, .end = 0, .text = owned };
    var sites: @import("text_sites.zig").Sites = .{ .items = items };
    defer sites.deinit(a);
    if (!try @import("text_site_edit.zig").splice(a, &sites, 0, start, deleted, inserted, @import("formula_result_sites.zig").max_display_bytes)) return false;
    return @import("formula_result_override_edit.zig").set(session, section_index, begin, sites.items[0].text);
}

fn beginNode(session: *const editor.Session) !usize {
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return index;
    }
    return error.TestExpectedEqual;
}

fn allocationCase(a: std.mem.Allocator, input: []const u8) !void {
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const begin = try beginNode(&session);
    try std.testing.expect(try splice(&session, 0, begin, 0, 0, "앞😀"));
    try std.testing.expectEqualStrings("앞😀2", session.sections[0].formula_result_overrides.get(begin).?);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "HWPX partial manual result splice reuses UTF16 boundaries and is atomic under OOM" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{input});
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const begin = try beginNode(&session);
    try std.testing.expect(!try splice(&session, 0, begin, 0, 1, "2"));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].formula_result_overrides.entries.items.len);
    try std.testing.expect(try splice(&session, 0, begin, 0, 0, "앞😀"));
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectError(error.SplitSurrogatePair, splice(&session, 0, begin, 2, 0, "x"));
    try std.testing.expectError(error.InvalidXmlCharacter, splice(&session, 0, begin, 0, 0, &.{0}));
    try std.testing.expectError(error.InvalidTextPosition, splice(&session, 0, begin, 0xffffffff, 1, "x"));
    try std.testing.expectError(error.InvalidFormulaFieldNode, splice(&session, 0, 0xffffffff, 0, 0, "x"));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(try splice(&session, 0, begin, 0, 4, ""));
    const empty = try session.save();
    defer a.free(empty);
    var reopened = try editor.open(a, empty, .{});
    defer reopened.deinit();
    var current = try @import("formula_current_snapshot.zig").readFlat(a, &reopened, 0);
    defer current.deinit(a);
    try std.testing.expectEqualStrings("", current.rows[0].values.last_result.?);
}

fn actualChart(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var original = try editor.open(a, input, .{});
    defer original.deinit();
    var fields = try @import("formula_source_snapshot.zig").read(a, &original.sections[0].tree);
    defer fields.deinit(a);
    try std.testing.expectEqual(@as(usize, 13), fields.rows.len);
    for (fields.rows, 0..) |field, ordinal| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        var before = try @import("formula_current_snapshot.zig").readFlat(a, &session, 0);
        defer before.deinit(a);
        const expected = try std.mem.concat(a, u8, &.{ "앞😀", before.rows[ordinal].values.last_result.? });
        defer a.free(expected);
        try std.testing.expect(try splice(&session, 0, field.begin_element, 0, 0, "앞😀"));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        var current = try @import("formula_current_snapshot.zig").readFlat(a, &reopened, 0);
        defer current.deinit(a);
        try std.testing.expectEqualStrings(expected, current.rows[ordinal].values.last_result.?);
        try std.testing.expectEqualStrings(field.values.last_result.?, current.source.rows[ordinal].values.last_result.?);
        try std.testing.expectEqualSlices(u8, input, session.source);
    }
}

test "HWPX partial manual result splice actual thirteen chart fields save and reopen" {
    try @import("../testing/checked_allocator.zig").run(actualChart, .{});
}
