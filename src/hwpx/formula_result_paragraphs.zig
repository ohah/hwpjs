//! Transient current result ownership; candidates are never edit permission.
const std = @import("std");
const editor = @import("editor_session.zig");

/// Caller owns sorted unique global one-based paragraph numbers. Read current
/// formulas before filtering; do not suppress malformed links or cache values.
pub fn list(session: *const editor.Session, section_index: usize) ![]u32 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const a = session.allocator;
    if (section.structure_values != null or section.created_tables.entries.items.len != 0) return a.alloc(u32, 0);
    if (!try @import("formula_source_query.zig").hasFormula(a, &section.tree)) return a.alloc(u32, 0);
    var current = try @import("formula_current_snapshot.zig").readFlat(a, session, section_index);
    defer current.deinit(a);
    return listPrepared(session, section_index, &current);
}

pub fn listPrepared(session: *const editor.Session, section_index: usize, current: *const @import("formula_current_snapshot.zig").Snapshot) ![]u32 {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const a = session.allocator;
    if (section.locations.len != section.sites.items.len) return error.InvalidTextSites;
    const source_first = section.source_first_paragraph orelse section.first_paragraph;
    var paragraphs: std.ArrayList(u32) = .empty;
    defer paragraphs.deinit(a);
    for (current.prepared) |field| for (field.result.items) |replacement| {
        if (replacement.site_index >= section.locations.len) return error.InvalidTextSites;
        const source_paragraph = section.locations[replacement.site_index].paragraph_ordinal;
        if (source_paragraph < source_first) return error.SourceBindingMismatch;
        const paragraph = std.math.add(usize, section.first_paragraph, source_paragraph - source_first) catch return error.SourceBindingMismatch;
        if (paragraph > section.last_paragraph or try section.sourceParagraph(paragraph) != source_paragraph) return error.SourceBindingMismatch;
        const number = std.math.cast(u32, paragraph) orelse return error.LimitExceeded;
        if (std.mem.indexOfScalar(u32, paragraphs.items, number) == null) try paragraphs.append(a, number);
    };
    std.mem.sort(u32, paragraphs.items, {}, std.sort.asc(u32));
    return paragraphs.toOwnedSlice(a);
}

test "HWPX formula result paragraph candidates preserve current overrides and fail atomically" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const targets = try @import("formula_result_targets.zig").list(&session, 0, 2);
    defer a.free(targets);
    try std.testing.expectEqual(@as(usize, 1), targets.len);
    try std.testing.expect(try session.spliceManualFormulaResult(0, targets[0].begin_element, 0, 0, "앞😀"));
    const saved = try session.save();
    defer a.free(saved);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session) !void {
            var proxy = original.*;
            proxy.allocator = allocator;
            const numbers = try list(&proxy, 0);
            defer allocator.free(numbers);
            try std.testing.expectEqualSlices(u32, &.{2}, numbers);
        }
    }.run, .{&session});
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, saved, after);
    try std.testing.expectEqualSlices(u8, input, session.source);
    const changed = try @import("formula_result_targets.zig").list(&session, 0, 2);
    defer a.free(changed);
    try std.testing.expectEqual(@as(u32, 4), changed[0].end);
    try std.testing.expectError(error.InvalidSectionIndex, list(&session, 1));
}

test "HWPX formula result paragraph candidates account for source-to-current shifts" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    // An earlier section gained paragraphs without changing this source tree.
    session.sections[0].first_paragraph += 7;
    session.sections[0].last_paragraph += 7;
    const numbers = try list(&session, 0);
    defer a.free(numbers);
    try std.testing.expectEqualSlices(u32, &.{9}, numbers);
}

test "HWPX formula result paragraph candidates never conceal broken links" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const marker = "<p:fieldEnd beginIDRef='1'/>";
    const offset = std.mem.indexOf(u8, fixture.section, marker).?;
    const xml = try std.mem.concat(a, u8, &.{ fixture.section[0..offset], fixture.section[offset + marker.len ..] });
    defer a.free(xml);
    const input = try fixture.zipWithSection(a, xml);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expectError(error.InvalidFieldLinks, list(&session, 0));
    try std.testing.expectError(error.InvalidFieldLinks, @import("formula_result_targets.zig").list(&session, 0, 1));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}
