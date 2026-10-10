//! Structural permission is narrower than plain text-edit permission.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const values = @import("xml_values.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub fn validate(a: std.mem.Allocator, tree: *const Tree, paragraph: usize) !void {
    if (paragraph >= tree.elements.len or !tree.elements[paragraph].is(uri, "p")) return error.InvalidParagraphElement;
    const owner = tree.elements[paragraph];
    try untracked(a, tree, paragraph, "paraTcId");
    if (try tree.attributeValue(a, paragraph, "", "merged")) |raw| {
        const text = try raw.toUtf8(a, 4096);
        defer a.free(text);
        if (try values.boolean(text)) return error.UnsupportedParagraphTracking;
    }
    for (tree.elements, 0..) |element, index| {
        if (element.start_tag.start <= owner.start_tag.start or element.end > owner.end or !element.is(uri, "run")) continue;
        if (try @import("paragraph_site_owner.zig").ancestor(tree, index) != paragraph) continue;
        try untracked(a, tree, index, "charTcId");
        try untracked(a, tree, index, "paraTcId");
    }
}

fn untracked(a: std.mem.Allocator, tree: *const Tree, index: usize, name: []const u8) !void {
    const raw = (try tree.attributeValue(a, index, "", name)) orelse return;
    const text = try raw.toUtf8(a, 4096);
    defer a.free(text);
    if (!try values.nonNegative(text)) return error.UnsupportedParagraphTracking;
}

test "HWPX paragraph structure policy keeps nested tracked run with its own paragraph" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t><p:ctrl><p:footNote><p:subList><p:p><p:run charTcId='2'><p:t>B</p:t></p:run></p:p></p:subList></p:footNote></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var paragraphs: [2]usize = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(uri, "p")) {
        paragraphs[count] = index;
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), count);
    try validate(a, &tree, paragraphs[0]);
    try std.testing.expectError(error.UnsupportedParagraphTracking, validate(a, &tree, paragraphs[1]));
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, outer: usize) !void {
            try validate(allocator, parsed, outer);
        }
    }.run, .{ &tree, paragraphs[0] });
    const run = tree.elements[paragraphs[0]].first_child.?;
    const parent = tree.elements[run].parent;
    tree.elements[run].parent = run;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, paragraphs[0]));
    tree.elements[run].parent = tree.elements.len;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, paragraphs[0]));
    tree.elements[run].parent = parent;
    try validate(a, &tree, paragraphs[0]);
}

test "HWPX paragraph structure policy refuses tracked paragraphs and runs without changing XML" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p paraTcId='-0' merged='false'><p:run charTcId='0'/></p:p><p:p paraTcId='1'/><p:p merged='true'/><p:p><p:run charTcId='2'/></p:p><p:p><p:run paraTcId='3'/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var first: ?usize = null;
    var rejected: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(uri, "p")) continue;
        if (first == null) {
            first = index;
            try validate(a, &tree, index);
        } else {
            try std.testing.expectError(error.UnsupportedParagraphTracking, validate(a, &tree, index));
            rejected += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 4), rejected);
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const Tree, index: usize) !void {
            try validate(allocator, borrowed, index);
        }
    }.run, .{ &tree, first.? });
}
