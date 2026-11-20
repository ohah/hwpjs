//! Checked current paragraph point; not insertion permission or edit rebasing.
const std = @import("std");
const editor = @import("editor_session.zig");
const refs = @import("current_paragraph_reference.zig");
pub const Anchor = struct { section: usize, paragraph: refs.Reference, unit: u32 };
pub const Resolved = struct { paragraph: usize, unit: u32 };

fn boundary(a: std.mem.Allocator, section: *const editor.Section, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, unit: u32) !void {
    const positions = try currentPositions(a, section, paragraph);
    defer a.free(positions);
    try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, unit);
}
fn currentPositions(a: std.mem.Allocator, section: *const editor.Section, paragraph: *const @import("paragraph_structure_values.zig").Paragraph) ![]@import("paragraph_text_positions.zig").Segment {
    const positions = if (paragraph.field_positions != null)
        try @import("field_owned_positions.zig").build(a, &section.tree, paragraph)
    else if (paragraph.protected_positions != null)
        try @import("paragraph_protected_positions.zig").build(a, &section.tree, paragraph)
    else if (paragraph.joined()) |joined|
        try @import("paragraph_joined_positions.zig").build(a, &section.tree, &joined)
    else block: {
        const locations = try @import("paragraph_structure_locations.zig").build(a, &section.tree, paragraph);
        defer a.free(locations);
        break :block try @import("anchor_text_positions.zig").build(a, &section.tree, &paragraph.sites, locations, 1);
    };
    return positions;
}
/// Unordered pending tables can share one host. Measure its actual Native
/// axis once, then reuse the scalar/control boundary SSOT in a forward cursor.
/// max_units is the remaining whole-read budget, never a submitted coordinate.
pub fn boundaryMap(a: std.mem.Allocator, section: *const editor.Section, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, max_units: usize) ![]bool {
    const positions = try currentPositions(a, section, paragraph);
    defer a.free(positions);
    return @import("paragraph_scalar_boundaries.zig").build(a, &paragraph.sites, positions, max_units);
}
/// Read inventory may already hold a uniquely resolved current model paragraph.
/// Reuse the same source/control/scalar boundary validator without a per-entry
/// paragraph scan. This does not authorize insertion, rebasing or mutation.
pub fn validateCurrentBoundary(a: std.mem.Allocator, section: *const editor.Section, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, unit: u32) !void {
    return boundary(a, section, paragraph, unit);
}

test "document text HX pending host boundary map reuses scalar control oracle once per actual owner" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>한😀</p:t><p:pic/><p:t>A</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    const bytes = try @import("../new_document/root.zig").hwpx(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    // The boundary adapter needs immutable tree/paragraph provenance only.
    // Borrow the generated Session section and substitute this synthetic tree.
    var section = session.sections[0];
    section.tree = tree;
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const paragraph: @import("paragraph_structure_values.zig").Paragraph = .{
        .template_element = 1,
        .source_ordinal = 1,
        .sites = sites,
    };
    const valid = try boundaryMap(a, &section, &paragraph, 100);
    defer a.free(valid);
    for (valid, 0..) |value, point| {
        validateCurrentBoundary(a, &section, &paragraph, @intCast(point)) catch |err| {
            try std.testing.expectEqual(error.SplitSurrogatePair, err);
            try std.testing.expect(!value);
            continue;
        };
        try std.testing.expect(value);
    }
    try std.testing.expectError(error.LimitExceeded, boundaryMap(a, &section, &paragraph, valid.len - 2));
    try std.testing.expectError(error.InvalidTextPosition, validateCurrentBoundary(a, &section, &paragraph, 0xfffffffe));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Section, owner: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            const map = try boundaryMap(allocator, source, owner, 100);
            defer allocator.free(map);
            try std.testing.expect(!map[2]);
        }
    }.run, .{ @as(*const editor.Section, &section), &paragraph });
}

pub fn capture(a: std.mem.Allocator, session: *const editor.Session, section_index: usize, ordinal: usize, unit: u32) !Anchor {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    if (ordinal < section.first_paragraph or ordinal - section.first_paragraph >= current.paragraphs.len) return error.InvalidParagraphIndex;
    const paragraph = &current.paragraphs[ordinal - section.first_paragraph];
    const source_unit = try @import("formula_anchor_coordinates.zig").convert(a, session, section_index, ordinal, unit, .source);
    try boundary(a, section, paragraph, source_unit);
    return .{ .section = section_index, .paragraph = try refs.from(paragraph), .unit = source_unit };
}

pub fn resolve(a: std.mem.Allocator, session: *const editor.Session, anchor: Anchor) !Resolved {
    if (anchor.section >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[anchor.section];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    const position = try refs.index(current.paragraphs, anchor.paragraph);
    try boundary(a, section, &current.paragraphs[position], anchor.unit);
    const ordinal = try refs.ordinal(current.paragraphs, section.first_paragraph, anchor.paragraph);
    return .{ .paragraph = ordinal, .unit = try @import("formula_anchor_coordinates.zig").convert(a, session, anchor.section, ordinal, anchor.unit, .display) };
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
