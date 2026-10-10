//! Checked current paragraph point; not insertion permission or edit rebasing.
const std = @import("std");
const editor = @import("editor_session.zig");
const refs = @import("current_paragraph_reference.zig");
pub const Anchor = struct { section: usize, paragraph: refs.Reference, unit: u32 };
pub const Resolved = struct { paragraph: usize, unit: u32 };

fn boundary(a: std.mem.Allocator, section: *const editor.Section, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, unit: u32) !void {
    const positions = if (paragraph.joined()) |joined|
        try @import("paragraph_joined_positions.zig").build(a, &section.tree, &joined)
    else block: {
        const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, paragraph);
        defer a.free(locations);
        break :block try @import("paragraph_text_positions.zig").build(a, &section.tree, &paragraph.sites, locations, 1);
    };
    defer a.free(positions);
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, unit);
}

pub fn capture(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, ordinal: usize, unit: u32) !Anchor {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    if (ordinal < section.first_paragraph or ordinal - section.first_paragraph >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const paragraph = &current.paragraphs[ordinal - section.first_paragraph];
    try boundary(a, section, paragraph, unit);
    return .{ .section = section_index, .paragraph = try refs.from(paragraph), .unit = unit };
}

pub fn resolve(a: std.mem.Allocator, session: *const editor.Session, anchor: Anchor) !Resolved {
    if (anchor.section >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[anchor.section];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const position = try refs.index(current.paragraphs, anchor.paragraph);
    try boundary(a, section, &current.paragraphs[position], anchor.unit);
    return .{ .paragraph = try refs.ordinal(current.paragraphs, section.first_paragraph, anchor.paragraph), .unit = anchor.unit };
}

test "created table anchor validates actual Unicode points and current order with allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    _ = try session.splice(0, 2, 0, 0, "😀");
    try std.testing.expectError(error.SplitSurrogatePair, capture(a, &session, 0, 2, 1));
    const anchor = try capture(a, &session, 0, 2, 2);
    try std.testing.expectEqualDeep(Resolved{ .paragraph = 2, .unit = 2 }, try resolve(a, &session, anchor));
    try std.testing.expect(try session.splitParagraph(0, 1, 0, 0));
    try std.testing.expectEqualDeep(Resolved{ .paragraph = 3, .unit = 2 }, try resolve(a, &session, anchor));
    const before = try session.save();
    defer a.free(before);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, point: Anchor) !void {
            try std.testing.expectEqualDeep(Resolved{ .paragraph = 3, .unit = 2 }, try resolve(allocator, state, point));
        }
    }.run, .{ &session, anchor });
    var invalid = anchor;
    invalid.unit = 1;
    try std.testing.expectError(error.SplitSurrogatePair, resolve(a, &session, invalid));
    invalid = anchor;
    invalid.section = 99;
    try std.testing.expectError(error.InvalidSectionIndex, resolve(a, &session, invalid));
    invalid = anchor;
    invalid.paragraph = .{ .generated_id = std.math.maxInt(u32) };
    try std.testing.expectError(error.MissingCurrentParagraphReference, resolve(a, &session, invalid));
    try std.testing.expectError(error.InvalidSectionIndex, capture(a, &session, 99, 2, 0));
    try std.testing.expectError(error.InvalidParagraphIndex, capture(a, &session, 0, 0, 0));
    try std.testing.expectError(error.InvalidTextPosition, capture(a, &session, 0, 3, std.math.maxInt(u32)));
    try std.testing.expectEqualSlices(u8, input, session.source);
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
