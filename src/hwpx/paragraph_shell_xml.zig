//! Remove direct runs from a transient paragraph, retaining its outer structure.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn write(a: std.mem.Allocator, source: *const Tree, paragraph_xml: []const u8, limit: usize) ![]u8 {
    if (paragraph_xml.len > limit) return error.LimitExceeded;
    const root = source.elements[0];
    const closing = root.end_tag orelse return error.InvalidParagraphElement;
    const wrapped = try std.mem.concat(a, u8, &.{ source.source[root.start_tag.start..root.start_tag.end], paragraph_xml, source.source[closing.start..closing.end] });
    defer a.free(wrapped);
    var parsed = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{});
    defer parsed.deinit(a);
    const paragraph = parsed.elements[0].first_child orelse return error.InvalidParagraphElement;
    const owner = parsed.elements[paragraph];
    if (!owner.is(@import("document_xml.zig").paragraph_uri, "p")) return error.InvalidParagraphElement;
    const ending = owner.end_tag orelse return error.InvalidParagraphElement;
    var cursor = owner.start_tag.start;
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    var child = owner.first_child;
    while (child) |index| {
        const node = parsed.elements[index];
        if (node.is(@import("document_xml.zig").paragraph_uri, "run")) {
            try output.appendSlice(a, wrapped[cursor..node.start_tag.start]);
            cursor = if (node.end_tag) |end| end.end else node.start_tag.end;
        }
        child = node.next_sibling;
    }
    try output.appendSlice(a, wrapped[cursor..ending.end]);
    if (output.items.len > limit) return error.LimitExceeded;
    return output.toOwnedSlice(a);
}

test "paragraph shell XML removes only direct runs and preserves outer metadata" {
    const a = std.testing.allocator;
    var source = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p/></s:sec>", .section, 0, 0, .{});
    defer source.deinit(a);
    const input = "<p:p id='7' paraPrIDRef='2'><!--keep--><p:run><p:t>😀</p:t></p:run><p:linesegarray/><p:run/></p:p>";
    const expected = "<p:p id='7' paraPrIDRef='2'><!--keep--><p:linesegarray/></p:p>";
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, xml: []const u8, result: []const u8) !void {
            const output = try write(allocator, tree, xml, 10000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings(result, output);
        }
    };
    try Probe.run(a, &source, input, expected);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &source, input, expected });
    try std.testing.expectError(error.LimitExceeded, write(a, &source, input, 1));
}
