//! Generated continuations do not own their template's retained note-number prefix.
const std = @import("std");
pub fn read(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, locations: []const @import("section_text.zig").Location, max_bytes: usize) ![]u8 {
    if (paragraph.generated_id == null or paragraph.source_ordinal != null) return @import("anchor_paragraph_edit.zig").text(a, tree, &paragraph.sites, locations, 1, max_bytes);
    const projected = try @import("anchor_paragraph_edit.zig").segments(a, tree, &paragraph.sites, locations, 1);
    defer a.free(projected);
    var first_text: usize = tree.source.len;
    for (paragraph.sites.items) |site| {
        if (!site.anchor_boundary) first_text = @min(first_text, site.start);
    }
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    for (projected) |segment| {
        if (segment.kind == .anchor and @import("retained_note_number.zig").supported(tree, segment.index, paragraph.template_element, first_text)) continue;
        const text = @import("paragraph_text_positions.zig").segmentText(&paragraph.sites, segment);
        if (text.len > max_bytes -| out.items.len) return error.LimitExceeded;
        try out.appendSlice(a, text);
    }
    return out.toOwnedSlice(a);
}
test "HWPX generated note anchor text does not resurrect source prefix after plain split" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const original = try session.anchorText(0, 2);
    defer a.free(original);
    try std.testing.expect(std.mem.startsWith(u8, original, "\xef\xbf\xbc"));
    try std.testing.expect(try session.splitParagraph(0, 2, 0, 0));
    const left = try session.anchorText(0, 2);
    defer a.free(left);
    const right = try session.anchorText(0, 3);
    defer a.free(right);
    try std.testing.expectEqualStrings("\xef\xbf\xbc", left);
    try std.testing.expectEqualStrings(original[3..], right);
    const section = &session.sections[0];
    const owned = &section.structure_values.?.paragraphs[3 - section.first_paragraph];
    const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, owned);
    defer a.free(locations);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, loc: []const @import("section_text.zig").Location, expected: []const u8) !void {
            const text = try read(allocator, tree, paragraph, loc, 4_000_000);
            defer allocator.free(text);
            try std.testing.expectEqualStrings(expected, text);
        }
    }.run, .{ &section.tree, owned, locations, right });
}
