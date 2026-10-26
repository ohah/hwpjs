//! Links stored note-body numbering to current protected reference anchors.
const std = @import("std");
const editor = @import("editor_session.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Site = struct {
    note_node: usize,
    number_node: usize,
    anchor_node: usize,
    paragraph: usize,
    anchor_unit: usize,
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Site {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    const tree = &section.tree;
    var source = try @import("automatic_number_snapshot.zig").read(a, tree);
    defer source.deinit(a);
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    var sites: std.ArrayList(Site) = .empty;
    defer sites.deinit(a);
    for (source.rows) |row| {
        var cursor = tree.elements[row.number_node].parent;
        var note_index: ?usize = null;
        while (cursor) |index| {
            const element = tree.elements[index];
            if (element.is(uri, "footNote") or element.is(uri, "endNote")) {
                note_index = index;
                break;
            }
            cursor = element.parent;
        }
        const note = note_index orelse continue;
        const expected = if (tree.elements[note].is(uri, "footNote")) "FOOTNOTE" else "ENDNOTE";
        const raw_type = row.values.get(.num_type) orelse continue;
        if (!std.mem.eql(u8, expected, raw_type)) continue;
        const location = try @import("note_site.zig").locate(tree, note);
        const anchor = location.control_element_index orelse continue;
        const kind = @import("run_anchor.zig").kind(tree, anchor) orelse continue;
        if (kind != .footnote and kind != .endnote) continue;
        for (sites.items) |site| if (site.note_node == note) return error.AmbiguousNoteReferenceNumber;
        const template = location.paragraph_element_index orelse continue;
        var protected = false;
        for (current.paragraphs) |paragraph| {
            if (paragraph.template_element == template and paragraph.protected_positions != null) protected = true;
        }
        const ordinal = if (protected)
            try @import("protected_display_host.zig").currentOrdinal(current.paragraphs, section.first_paragraph, template, anchor)
        else
            try @import("paragraph_display_host.zig").currentOrdinal(current.paragraphs, section.first_paragraph, template);
        const unit = try @import("protected_display_host.zig").anchorPosition(a, tree, &current.paragraphs[ordinal - section.first_paragraph], anchor);
        try sites.append(a, .{ .note_node = note, .number_node = row.number_node, .anchor_node = anchor, .paragraph = ordinal, .anchor_unit = unit });
    }
    return sites.toOwnedSlice(a);
}

test "HWPX note reference sites preserve exact current anchor ownership" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const before = try read(a, &session, 0);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 4), before.len);
    try std.testing.expectEqual(@as(usize, 1), before[0].paragraph);
    try std.testing.expectEqual(@as(usize, 4), before[2].paragraph);
    try std.testing.expect(before[0].anchor_unit < before[1].anchor_unit);
    try std.testing.expect(try session.spliceAnchored(0, 1, 0, 0, "앞😀"));
    try std.testing.expect(try session.splitParagraphAnchored(0, 1, 0, 0));
    const changed = try read(a, &session, 0);
    defer a.free(changed);
    try std.testing.expectEqual(before[0].paragraph + 1, changed[0].paragraph);
    try std.testing.expectEqual(before[0].anchor_unit + 3, changed[0].anchor_unit);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const restored = try read(a, &reopened, 0);
    defer a.free(restored);
    for (changed, restored) |left, right| {
        try std.testing.expectEqual(left.paragraph, right.paragraph);
        try std.testing.expectEqual(left.anchor_unit, right.anchor_unit);
    }
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, expected: []const Site) !void {
            const result = try read(allocator, state, 0);
            defer allocator.free(result);
            try std.testing.expectEqualDeep(expected, result);
        }
    }.run, .{ &session, changed });
}
