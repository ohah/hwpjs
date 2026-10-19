//! Transient source-control inventory only, without text or enclosing runs.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Position = @import("column_boundary_position.zig").Position;
const controls = @import("column_boundary_xml.zig");

/// The caller owns placement and must not persist this fragment as model state.
pub fn write(a: std.mem.Allocator, tree: *const Tree, template: usize, inventory: []const Position, limit: usize) ![]u8 {
    if (template >= tree.elements.len or !tree.elements[template].is(@import("document_xml.zig").paragraph_uri, "p")) return error.SourceBindingMismatch;
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var previous: ?usize = null;
    for (inventory) |boundary| {
        const index = try controls.control(tree, boundary.source_element);
        const run = tree.elements[index].parent orelse return error.SourceBindingMismatch;
        if (tree.elements[run].parent != template) return error.SourceBindingMismatch;
        const start = tree.elements[index].start_tag.start;
        if (previous) |before| {
            if (start == before) return error.DuplicateColumnBoundary;
            if (start < before) return error.InvalidColumnBoundaryOrder;
        }
        previous = start;
        const fragment = try controls.write(a, tree, boundary, limit -| output.items.len);
        defer a.free(fragment);
        if (fragment.len > limit -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, fragment);
    }
    return output.toOwnedSlice(a);
}

test "column inventory XML excludes styled text runs and validates ownership atomically" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'><p:p><p:run charPrIDRef='7'><p:t/><p:ctrl x:keep='yes'><!--keep--><p:colPr colCount='2'><x:future/></p:colPr></p:ctrl><p:ctrl><p:colPr colCount='3'/></p:ctrl></p:run></p:p><p:p><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var inventory: [3]Position = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) {
        inventory[count] = .{ .source_element = index, .unit = 0, .affinity = .left };
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 3), count);
    const result = try write(a, &tree, 1, inventory[0..2], 10000);
    defer a.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "charPrIDRef") == null);
    try std.testing.expect(std.mem.indexOf(u8, result, "p:run") == null);
    try std.testing.expect(std.mem.indexOf(u8, result, "p:t") == null);
    try std.testing.expect(std.mem.indexOf(u8, result, "<!--keep-->") != null);
    const wrapper = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'>", result, "</s:sec>" });
    defer a.free(wrapper);
    var reopened = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
    defer reopened.deinit(a);
    try std.testing.expect(reopened.elements[1].is(@import("document_xml.zig").paragraph_uri, "ctrl"));
    try std.testing.expect(reopened.elements[3].is("urn:opaque", "future"));
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, 1, &.{inventory[2]}, 10000));
    try std.testing.expectError(error.DuplicateColumnBoundary, write(a, &tree, 1, &.{ inventory[0], inventory[0] }, 10000));
    try std.testing.expectError(error.InvalidColumnBoundaryOrder, write(a, &tree, 1, &.{ inventory[1], inventory[0] }, 10000));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, inventory[0..2], result.len - 1));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, boundaries: []const Position) !void {
            const output = try write(allocator, parsed, 1, boundaries, 10000);
            defer allocator.free(output);
        }
    }.run, .{ &tree, inventory[0..2] });
    try std.testing.expectEqualStrings(source, tree.source);
}

test "column inventory XML retains real file source controls without text replay" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "multicolumns.hwpx", "multicolumns-widths.hwpx" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        const section = &session.sections[0];
        var report: @import("section_text.zig").Report = .{};
        var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &report);
        defer values.deinit(a);
        try std.testing.expectEqual(@as(usize, 3), values.paragraphs.len);
        for (values.paragraphs) |*paragraph| {
            try @import("column_boundary_materialize.zig").install(a, &section.tree, paragraph, 100);
            const boundaries = paragraph.column_boundaries.?;
            try std.testing.expectEqual(@as(usize, 1), boundaries.len);
            const output = try write(a, &section.tree, paragraph.template_element, boundaries, 10000);
            defer a.free(output);
            const expected = try controls.write(a, &section.tree, boundaries[0], 10000);
            defer a.free(expected);
            try std.testing.expectEqualStrings(expected, output);
            try std.testing.expect(std.mem.indexOf(u8, output, section.tree.sourceOf(boundaries[0].source_element)) != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "charPrIDRef") == null);
        }
        const unchanged = try session.save();
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, input, unchanged);
    }
}
