//! Current automatic-number anchor locations; no cached editable text.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Site = struct { number_node: usize, anchor_node: ?usize, paragraph: ?usize = null, anchor_unit: ?usize = null };
pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Site {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var source = try @import("automatic_number_snapshot.zig").read(a, &section.tree);
    defer source.deinit(a);
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    var rows: std.ArrayList(Site) = .empty;
    defer rows.deinit(a);
    for (source.rows) |row| {
        var site = Site{ .number_node = row.number_node, .anchor_node = row.anchor_node };
        if (row.anchor_node) |anchor| {
            const run = section.tree.elements[anchor].parent orelse return error.InvalidPartTree;
            const template = section.tree.elements[run].parent orelse return error.InvalidPartTree;
            var protected = false;
            for (current.paragraphs) |paragraph| {
                if (paragraph.template_element == template and paragraph.protected_positions != null) protected = true;
            }
            const retained = if (protected) null else try @import("retained_note_number_host.zig").currentOrdinal(&section.tree, current.paragraphs, section.first_paragraph, template, anchor);
            const ordinal = if (protected) try @import("protected_display_host.zig").currentOrdinal(current.paragraphs, section.first_paragraph, template, anchor) else retained orelse try @import("paragraph_display_host.zig").currentOrdinal(current.paragraphs, section.first_paragraph, template);
            site.paragraph = ordinal;
            site.anchor_unit = if (retained != null) 0 else try @import("protected_display_host.zig").anchorPosition(a, &section.tree, &current.paragraphs[ordinal - section.first_paragraph], anchor);
        }
        try rows.append(a, site);
    }
    return rows.toOwnedSlice(a);
}

test "HWPX automatic number sites track text and anchored splits" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const before = try read(a, &session, 0);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 8), before.len);
    try std.testing.expect(try session.spliceAnchored(0, before[0].paragraph.?, 0, 0, "앞😀"));
    const inserted = try read(a, &session, 0);
    defer a.free(inserted);
    try std.testing.expectEqual(before[0].anchor_unit.? + 3, inserted[0].anchor_unit.?);
    try std.testing.expect(try session.splitParagraphAnchored(0, before[0].paragraph.?, 0, 0));
    const split = try read(a, &session, 0);
    defer a.free(split);
    try std.testing.expectEqual(before[0].paragraph.? + 1, split[0].paragraph.?);
    try std.testing.expectEqual(inserted[0].anchor_unit, split[0].anchor_unit);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const restored = try read(a, &reopened, 0);
    defer a.free(restored);
    try std.testing.expectEqual(split.len, restored.len);
    for (split, restored) |left, right| {
        try std.testing.expectEqual(left.paragraph, right.paragraph);
        try std.testing.expectEqual(left.anchor_unit, right.anchor_unit);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, expected: []const Site) !void {
            const actual = try read(allocator, state, 0);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ &session, split });
}

test "HWPX automatic number sites preserve retained prefixes after plain split" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const actual = try read(a, &session, 0);
    defer a.free(actual);
    try std.testing.expectEqual(@as(usize, 4), actual.len);
    try std.testing.expectEqual(@as(?usize, 2), actual[0].paragraph);
    for (actual) |row| try std.testing.expectEqual(@as(?usize, 0), row.anchor_unit);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, expected: []const Site) !void {
            const rows = try read(allocator, state, 0);
            defer allocator.free(rows);
            try std.testing.expectEqualDeep(expected, rows);
        }
    }.run, .{ &session, actual });
}
