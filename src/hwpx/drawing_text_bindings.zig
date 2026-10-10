//! Current paragraph ownership for direct drawing text lists.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const editor = @import("editor_session.zig");
const fields = @import("table_xml_fields.zig");
pub const Owner = struct { drawing_node: usize, text_node: usize, list_node: usize, kind: enum { text, caption } = .text };
pub const Binding = struct { paragraph: usize, owner: Owner };

fn direct(tree: *const Tree, parent: usize, name: []const u8, expected: usize) !void {
    var missing: usize = 0;
    var duplicate: usize = 0;
    if (fields.uniqueChild(tree, parent, name, &missing, &duplicate) != expected or duplicate != 0) return error.AmbiguousDrawingTextOwner;
}

pub fn resolve(tree: *const Tree, template: usize) !?Owner {
    if (template >= tree.elements.len or !fields.childIs(tree, template, "p")) return error.InvalidDrawingParagraphTemplate;
    const list = tree.elements[template].parent orelse return null;
    if (!fields.childIs(tree, list, "subList")) return null;
    const text = tree.elements[list].parent orelse return null;
    const caption = fields.childIs(tree, text, "caption");
    if (!fields.childIs(tree, text, "drawText") and !caption) return null;
    const drawing = tree.elements[text].parent orelse return null;
    if (caption and !fields.childIs(tree, drawing, "rect")) return null;
    try direct(tree, drawing, if (caption) "caption" else "drawText", text);
    try direct(tree, text, "subList", list);
    return .{ .drawing_node = drawing, .text_node = text, .list_node = list, .kind = if (caption) .caption else .text };
}

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Binding {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    var output: std.ArrayList(Binding) = .empty;
    defer output.deinit(a);
    for (current.paragraphs, 0..) |paragraph, index| {
        const owner = try resolve(&section.tree, paragraph.template_element);
        if (paragraph.joined()) |joined| {
            try joined.validate();
            for (joined.pieces) |piece| {
                if (!std.meta.eql(owner, try resolve(&section.tree, piece.template_element))) return error.SourceBindingMismatch;
            }
        }
        if (owner) |value| try output.append(a, .{ .paragraph = std.math.add(usize, section.first_paragraph, index) catch return error.LimitExceeded, .owner = value });
    }
    return output.toOwnedSlice(a);
}

test "HWPX drawing text bindings retain actual split ownership and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-layout.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const before = try read(a, &session, 0);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 2), before.len);
    try std.testing.expectEqualDeep(before[0].owner, before[1].owner);
    try std.testing.expect(try session.splitParagraph(0, before[1].paragraph, 0, 0));
    const after = try read(a, &session, 0);
    defer a.free(after);
    try std.testing.expectEqual(@as(usize, 3), after.len);
    for (after) |binding| try std.testing.expectEqualDeep(before[0].owner, binding.owner);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, expected: []const Binding) !void {
            const actual = try read(allocator, state, 0);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ &session, after });
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const restored = try read(a, &reopened, 0);
    defer a.free(restored);
    try std.testing.expectEqual(after.len, restored.len);
    for (restored) |binding| try std.testing.expectEqualDeep(restored[0].owner, binding.owner);
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, session.sections.len));
}

test "HWPX drawing text bindings reject duplicate direct owners and foreign namespaces" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
    const cases = [_][]const u8{
        prefix ++ "<p:rect><p:drawText><p:subList><p:p/></p:subList></p:drawText><p:drawText/></p:rect></s:sec>",
        prefix ++ "<p:rect><p:drawText><p:subList><p:p/></p:subList><p:subList/></p:drawText></p:rect></s:sec>",
    };
    for (cases) |source| {
        var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.AmbiguousDrawingTextOwner, resolve(&tree, 4));
    }
    var foreign = try @import("section_tree.zig").parse(a, prefix ++ "<p:rect><x:drawText><p:subList><p:p/></p:subList></x:drawText></p:rect></s:sec>", 0, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectEqual(@as(?Owner, null), try resolve(&foreign, 4));
    try std.testing.expectError(error.InvalidDrawingParagraphTemplate, resolve(&foreign, 1));
}

test "HWPX drawing caption bindings stay distinct through actual anchored split" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/textbox.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const before = try read(a, &session, 0);
    defer a.free(before);
    try std.testing.expectEqual(@as(usize, 2), before.len);
    try std.testing.expect(before[0].owner.kind == .text and before[1].owner.kind == .caption);
    try std.testing.expect(before[0].owner.list_node != before[1].owner.list_node);
    try std.testing.expect(try session.splitParagraphAnchored(0, before[1].paragraph, 0, 0));
    const after = try read(a, &session, 0);
    defer a.free(after);
    try std.testing.expectEqual(@as(usize, 3), after.len);
    try std.testing.expectEqualDeep(before[0].owner, after[0].owner);
    try std.testing.expectEqualDeep(before[1].owner, after[1].owner);
    try std.testing.expectEqualDeep(before[1].owner, after[2].owner);
}
