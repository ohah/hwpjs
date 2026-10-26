//! Request-local conversion between owned source points and formula display.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Direction = enum { source, display };

pub fn convert(a: std.mem.Allocator, session: *const editor.Session, section: usize, paragraph: usize, unit: u32, direction: Direction) !u32 {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    if (session.sections[section].structure_values) |values| {
        const selected = &session.sections[section];
        if (paragraph < selected.first_paragraph or paragraph - selected.first_paragraph >= values.paragraphs.len) return error.InvalidParagraphIndex;
        const row = &values.paragraphs[paragraph - selected.first_paragraph];
        if (row.field_positions != null and row.pieces == null and row.protected_positions == null and row.column_boundaries == null and row.page_area_positions == null)
            return @import("formula_partition_anchor_coordinates.zig").convert(a, session, section, paragraph, unit, direction);
        if (row.pieces != null or row.generated_id != null or row.protected_positions != null or row.column_boundaries != null or row.page_area_positions != null) return unit;
        const original = row.source_ordinal orelse return unit;
        if (!try @import("paragraph_site_owner.zig").ownsFieldMarker(&selected.tree, row.template_element)) return unit;
        var owners: usize = 0;
        for (values.paragraphs) |other| if (other.template_element == row.template_element) {
            owners += 1;
        };
        if (owners != 1) return error.DuplicateCurrentTextOwner;
        var flat = try @import("structural_source_view.zig").open(a, session, section);
        defer flat.deinit();
        return convert(a, &flat.session, section, original, unit, direction);
    }
    // Generated cells have their own identities and do not change the native
    // source paragraph numbering. Never reopen their serialized paragraphs here.
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    for (sections) |*part| part.created_tables = .{};
    var proxy = session.*;
    proxy.allocator = a;
    proxy.sections = sections;
    var view = (try @import("formula_result_projection.zig").prepare(&proxy, section, paragraph)) orelse return unit;
    defer view.deinit();
    const original = try @import("source_field_paragraph_positions.zig").build(&proxy, section, paragraph);
    defer a.free(original);
    const mapper = @import("text_site_boundary_map.zig");
    const from = if (direction == .source) view.segments else original;
    const to = if (direction == .source) original else view.segments;
    const point = try mapper.capture(from, to, unit, .after);
    return mapper.resolve(to, point);
}

test "formula anchor coordinates retain source suffix after display growth shrink and empty result" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const xml = try std.mem.replaceOwned(u8, a, fixture.section, "<p:fieldEnd beginIDRef='1'/></p:ctrl>", "<p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>after</p:t>");
    defer a.free(xml);
    const bytes = try fixture.zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const targets = try @import("formula_result_targets.zig").list(&session, 0, 2);
    defer a.free(targets);
    const anchor = try @import("created_table_anchor.zig").capture(a, &session, 0, 2, 1);
    for ([_][]const u8{ "long😀", "", "2" }) |display| {
        _ = try session.setManualFormulaResult(0, targets[0].begin_element, display);
        const length: u32 = @intCast(try @import("text_site_edit.zig").utf16Length(display));
        try std.testing.expectEqual(length, try convert(a, &session, 0, 2, 1, .display));
        try std.testing.expectEqual(@as(u32, 1), try convert(a, &session, 0, 2, length, .source));
        const resolved = try @import("created_table_anchor.zig").resolve(a, &session, anchor);
        try std.testing.expectEqual(length, resolved.unit);
        const current = try @import("created_table_anchor.zig").capture(a, &session, 0, 2, length);
        try std.testing.expectEqual(@as(u32, 1), current.unit);
        try @import("../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, live: *const editor.Session, displayed: u32) !void {
                try std.testing.expectEqual(displayed, try convert(allocator, live, 0, 2, 1, .display));
                try std.testing.expectEqual(@as(u32, 1), try convert(allocator, live, 0, 2, displayed, .source));
            }
        }.run, .{ &session, length });
    }
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "formula anchor coordinates follow retained field host after unrelated paragraph split" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const suffix = try std.mem.replaceOwned(u8, a, fixture.section, "<p:fieldEnd beginIDRef='1'/></p:ctrl>", "<p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>after</p:t>");
    defer a.free(suffix);
    const xml = try std.mem.replaceOwned(u8, a, suffix, "<p:tbl", "<p:p id='7'><p:run><p:t>AB</p:t></p:run></p:p><p:tbl");
    defer a.free(xml);
    const bytes = try fixture.zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const target = (try @import("formula_result_targets.zig").select(&session, 0, 3, 0, 0)).?;
    const anchor = try @import("created_table_anchor.zig").capture(a, &session, 0, 3, 2);
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    for ([_][]const u8{ "long😀", "", "2" }) |display| {
        _ = try session.setManualFormulaResult(0, target.begin_element, display);
        const width: u32 = @intCast(try @import("text_site_edit.zig").utf16Length(display));
        const point = try @import("created_table_anchor.zig").resolve(a, &session, anchor);
        try std.testing.expectEqual(@as(usize, 4), point.paragraph);
        try std.testing.expectEqual(width + 1, point.unit);
        const recaptured = try @import("created_table_anchor.zig").capture(a, &session, 0, 4, width + 1);
        try std.testing.expectEqual(@as(u32, 2), recaptured.unit);
    }
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "formula anchor coordinates follow marker owned generated host and protect field endpoints" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const xml = try std.mem.replaceOwned(u8, a, fixture.section, "<p:fieldEnd beginIDRef='1'/></p:ctrl>", "<p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>after</p:t>");
    defer a.free(xml);
    const bytes = try fixture.zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const target = (try @import("formula_result_targets.zig").select(&session, 0, 2, 0, 0)).?;
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const anchor = try @import("created_table_anchor.zig").capture(a, &session, 0, 3, 2);
    for ([_][]const u8{ "long😀", "", "2" }) |display| {
        _ = try session.setManualFormulaResult(0, target.begin_element, display);
        const width: u32 = @intCast(try @import("text_site_edit.zig").utf16Length(display));
        const point = try @import("created_table_anchor.zig").resolve(a, &session, anchor);
        try std.testing.expectEqual(width + 1, point.unit);
        try std.testing.expectEqual(@as(?bool, true), try @import("formula_partition_table_exterior.zig").allowed(&session, 0, 3, width + 1));
        try std.testing.expectError(error.ProtectedFieldRange, @import("formula_partition_table_exterior.zig").allowed(&session, 0, 3, width));
        const recaptured = try @import("created_table_anchor.zig").capture(a, &session, 0, 3, width + 1);
        try std.testing.expectEqual(@as(u32, 2), recaptured.unit);
    }
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
