//! Derived current paragraph bindings; no mutable table cache.
const std = @import("std");
const editor = @import("editor_session.zig");
const owner = @import("table_display_owner.zig");
pub const Binding = struct { paragraph: usize, owner: owner.Owner };

test "HWPX query local cell owners match uncached immutable resolution" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var query: @import("table_display_owner_query.zig").Query = .{ .allocator = a, .tree = tree };
    defer query.deinit();
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "p")) continue;
        const expected = try owner.resolve(a, tree, index);
        try std.testing.expectEqualDeep(expected, try query.resolve(index));
        try std.testing.expectEqualDeep(expected, try query.resolve(index));
        if (expected != null) count += 1;
    }
    try std.testing.expect(count > 0);
    try std.testing.expectError(error.InvalidCellParagraphTemplate, query.resolve(tree.elements.len));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section_index: usize) ![]Binding {
    if (section_index >= session.sections.len) return error.InvalidSectionIndex;
    const section = &session.sections[section_index];
    var current = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer current.deinit(a);
    return fromParagraphs(a, section, current.paragraphs);
}

pub fn fromParagraphs(a: std.mem.Allocator, section: *const editor.Section, paragraphs: []const @import("paragraph_structure_values.zig").Paragraph) ![]Binding {
    if (paragraphs.len > 100000) return error.LimitExceeded;
    var output: std.ArrayList(Binding) = .empty;
    defer output.deinit(a);
    var source_owners: @import("table_display_owner_query.zig").Query = .{ .allocator = a, .tree = &section.tree };
    defer source_owners.deinit();
    for (paragraphs, 0..) |paragraph, index| {
        const resolved = try source_owners.resolve(paragraph.template_element);
        if (paragraph.joined()) |joined| {
            try joined.validate();
            for (joined.pieces) |piece| {
                const other = try source_owners.resolve(piece.template_element);
                if ((resolved == null) != (other == null)) return error.SourceBindingMismatch;
                if (resolved != null and resolved.?.list_node != other.?.list_node) return error.SourceBindingMismatch;
            }
        }
        if (resolved) |cell_owner| {
            var displayed = cell_owner;
            for (section.cell_sizes.items) |entry| if (entry.cell_node == displayed.cell_node) {
                displayed.cell.width = entry.size.width;
                displayed.cell.height = entry.size.height;
                break;
            };
            try output.append(a, .{ .paragraph = section.first_paragraph + index, .owner = displayed });
        }
    }
    return output.toOwnedSlice(a);
}

test "HWPX table display bindings follow split and merge current paragraphs with complete allocation failure checks" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const before = try read(a, &session, 0);
    defer a.free(before);
    try std.testing.expect(before.len > 0);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, state: *const editor.Session, expected_count: usize) !void {
            const bindings = try read(allocator, state, 0);
            defer allocator.free(bindings);
            try std.testing.expectEqual(expected_count, bindings.len);
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &session, before.len });
    const target = before[0];
    try std.testing.expect(try session.splitParagraph(0, target.paragraph, 0, 0));
    const after = try read(a, &session, 0);
    defer a.free(after);
    try std.testing.expectEqual(before.len + 1, after.len);
    try std.testing.expectEqualDeep(target.owner, after[0].owner);
    try std.testing.expectEqualDeep(target.owner, after[1].owner);
    try std.testing.expectEqual(target.paragraph + 1, after[1].paragraph);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &session, before.len + 1 });
    try std.testing.expect(try session.mergeParagraph(0, target.paragraph));
    const merged = try read(a, &session, 0);
    defer a.free(merged);
    try std.testing.expectEqualDeep(before, merged);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &session, before.len });
    try std.testing.expectError(error.InvalidSectionIndex, read(a, &session, session.sections.len));
}
