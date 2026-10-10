//! Apply continuation metadata policy after transient styled serialization.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn runs(a: std.mem.Allocator, xml: []const u8, limit: usize) ![]u8 {
    return transform(a, xml, null, limit);
}

pub fn paragraph(a: std.mem.Allocator, source: *const Tree, xml: []const u8, id: u32, limit: usize) ![]u8 {
    const root = source.elements[0];
    const end = root.end_tag orelse return error.InvalidParagraphElement;
    const wrapped = try std.mem.concat(a, u8, &.{ source.source[root.start_tag.start..root.start_tag.end], xml, source.source[end.start..end.end] });
    defer a.free(wrapped);
    return transformWrapped(a, wrapped, root.start_tag.end - root.start_tag.start, xml.len, id, limit);
}

fn transform(a: std.mem.Allocator, xml: []const u8, id: ?u32, limit: usize) ![]u8 {
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>";
    const wrapped = try std.mem.concat(a, u8, &.{ prefix, xml, "</p:p></s:sec>" });
    defer a.free(wrapped);
    return transformWrapped(a, wrapped, prefix.len, xml.len, id, limit);
}

fn transformWrapped(a: std.mem.Allocator, wrapped: []const u8, start: usize, length: usize, id: ?u32, limit: usize) ![]u8 {
    if (length > limit) return error.LimitExceeded;
    var tree = try @import("xml_part_tree.zig").parse(a, wrapped, .section, 0, 0, .{ .max_xml_bytes = wrapped.len });
    defer tree.deinit(a);
    const owner = tree.elements[0].first_child orelse return error.InvalidParagraphElement;
    const writer = @import("xml_source_writer.zig");
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    const opening = if (id) |identity| try @import("paragraph_continuation_tag.zig").write(a, &tree, owner, identity, limit) else null;
    defer if (opening) |bytes| a.free(bytes);
    if (opening) |bytes| try changes.append(a, .{ .start = 0, .end = tree.elements[owner].start_tag.end - start, .text = "", .serialized_xml = bytes });
    for (tree.elements) |node| {
        if (node.start_tag.start < start or node.end > start + length) continue;
        const parent = node.parent orelse continue;
        const direct = parent == owner;
        const run_child = tree.elements[parent].is(uri, "run") and tree.elements[parent].parent == owner;
        if ((!direct and !run_child) or !@import("paragraph_continuation_metadata.zig").remove(node, true)) continue;
        try changes.append(a, .{ .start = node.start_tag.start - start, .end = node.end - start, .text = "", .serialized_xml = "" });
    }
    return writer.write(a, wrapped[start..][0..length], changes.items, limit);
}

test "styled continuation XML preserves multiple runs while removing inherited metadata" {
    const a = std.testing.allocator;
    const xml = "<p:run charPrIDRef='7'><p:ctrl><p:colPr colCount='2'/></p:ctrl><!--keep--><p:t>A😀</p:t></p:run><p:run charPrIDRef='1'><p:t>B</p:t></p:run>";
    const expected = "<p:run charPrIDRef='7'><!--keep--><p:t>A😀</p:t></p:run><p:run charPrIDRef='1'><p:t>B</p:t></p:run>";
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: []const u8, result: []const u8) !void {
            const output = try runs(allocator, input, 10000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings(result, output);
        }
    };
    try Probe.run(a, xml, expected);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ xml, expected });
    try std.testing.expectError(error.LimitExceeded, runs(a, xml, 1));
}
