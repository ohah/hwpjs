//! Derived current caption paragraph ownership; no mutable caption text cache.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
pub const Owner = struct { table_node: usize, caption_node: usize, list_node: usize };
pub const Binding = struct { paragraph: usize, owner: Owner };

pub fn resolve(tree: *const Tree, template: usize) !?Owner {
    const owner = (try @import("caption_list_owner.zig").resolve(tree, template, .table)) orelse return null;
    return .{ .table_node = owner.component_node, .caption_node = owner.caption_node, .list_node = owner.list_node };
}

pub fn fromParagraphs(a: std.mem.Allocator, section: *const editor.Section, paragraphs: []const Paragraph) ![]Binding {
    return @import("caption_current_bindings.zig").fromParagraphs(Binding, resolve, a, section, paragraphs);
}

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Binding {
    return @import("caption_current_bindings.zig").read(Binding, resolve, a, session, section_index);
}

test "HWPX current caption bindings reject ambiguous direct owners" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
    const cases = [_]struct { xml: []const u8, template: usize }{
        .{ .xml = prefix ++ "<p:tbl><p:caption><p:subList><p:p/></p:subList></p:caption><p:caption/></p:tbl></s:sec>", .template = 4 },
        .{ .xml = prefix ++ "<p:tbl><p:caption><p:subList><p:p/></p:subList><p:subList/></p:caption></p:tbl></s:sec>", .template = 4 },
    };
    for (cases) |case| {
        var tree = try @import("section_tree.zig").parse(a, case.xml, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.AmbiguousTableCaptionOwner, resolve(&tree, case.template));
    }
    var foreign = try @import("section_tree.zig").parse(a, prefix ++ "<p:tbl><x:caption><p:subList><p:p/></p:subList></x:caption></p:tbl></s:sec>", 0, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectEqual(@as(?Owner, null), try resolve(&foreign, 4));
}

test "HWPX current caption bindings follow actual splits and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const before = try read(a, &session, 0);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 10), before.len);
    try std.testing.expectError(error.UnsupportedParagraphControl, session.splitParagraph(0, before[0].paragraph, 0, 0));
    const refused = try session.save();
    defer a.free(refused);
    try std.testing.expectEqualSlices(u8, bytes, refused);
    const target = before.len - 1;
    try std.testing.expect(try session.splitParagraph(0, before[target].paragraph, 0, 0));
    const after = try read(a, &session, 0);
    defer a.free(after);
    try std.testing.expectEqual(before.len + 1, after.len);
    try std.testing.expectEqualDeep(before[target].owner, after[target].owner);
    try std.testing.expectEqualDeep(before[target].owner, after[target + 1].owner);
    try std.testing.expectEqual(before[target].paragraph + 1, after[target + 1].paragraph);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, expected: []const Binding) !void {
            const actual = try read(allocator, state, 0);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ &session, after });
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, session.sections.len));
}

test "HWPX current caption bindings reject mixed joined owners and ordinal overflow" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:tbl><p:caption><p:subList><p:p/></p:subList></p:caption></p:tbl><p:tbl><p:caption><p:subList><p:p/></p:subList></p:caption></p:tbl><p:p/></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    var section: editor.Section = .{ .tree = tree, .sites = .{ .items = &.{} }, .locations = &.{}, .entry_index = 0, .first_paragraph = 5, .last_paragraph = 6 };
    var pieces = [_]@import("paragraph_joined_values.zig").Piece{
        .{ .template_element = 4, .source_ordinal = null, .generated_id = null, .first_site = 0, .site_count = 0 },
        .{ .template_element = 8, .source_ordinal = null, .generated_id = null, .first_site = 0, .site_count = 0 },
    };
    const paragraph: Paragraph = .{ .template_element = 4, .source_ordinal = null, .sites = .{ .items = &.{} }, .pieces = &pieces };
    try std.testing.expectError(error.SourceBindingMismatch, fromParagraphs(a, &section, &.{paragraph}));
    pieces[1].template_element = 9;
    try std.testing.expectError(error.SourceBindingMismatch, fromParagraphs(a, &section, &.{paragraph}));
    pieces[1].template_element = 4;
    const same = try fromParagraphs(a, &section, &.{paragraph});
    defer a.free(same);
    try std.testing.expectEqual(@as(usize, 1), same.len);
    try std.testing.expectEqual(@as(usize, 5), same[0].paragraph);
    section.first_paragraph = std.math.maxInt(usize);
    try std.testing.expectError(error.LimitExceeded, fromParagraphs(a, &section, &.{ paragraph, paragraph }));
    try std.testing.expectEqual(@as(?Owner, null), try resolve(&tree, 9));
    try std.testing.expectError(error.InvalidCaptionParagraphTemplate, resolve(&tree, 0));
}
