//! Read current owned text sites, never cached field results.
const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const fields = @import("table_xml_fields.zig");

pub fn read(a: std.mem.Allocator, tree: *const tree_mod.Tree, sites: *const sites_mod.Sites, cell: usize) !f64 {
    if (cell >= tree.elements.len or !fields.childIs(tree, cell, "tc")) return error.InvalidFormulaCellOwner;
    var bytes: [128]u8 = undefined;
    var length: usize = 0;
    var paragraph: ?usize = null;
    // Inspect structure as well as sites: an empty second paragraph has no
    // string to reveal its boundary, and controls must not vanish in a number.
    var paragraphs: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (index == cell) continue;
        var ancestor = element.parent;
        var nearest_cell: ?usize = null;
        var in_paragraph = false;
        while (ancestor) |parent| : (ancestor = tree.elements[parent].parent) {
            if (fields.childIs(tree, parent, "p")) in_paragraph = true;
            if (fields.childIs(tree, parent, "tc")) {
                nearest_cell = parent;
                break;
            }
        }
        if (nearest_cell != cell) continue;
        if (fields.childIs(tree, index, "p")) {
            paragraphs += 1;
            if (paragraphs > 1) return error.UnsupportedFormulaCellParagraphs;
        }
        if (in_paragraph and !fields.childIs(tree, index, "run") and !fields.childIs(tree, index, "t") and !fields.childIs(tree, index, "linesegarray") and !fields.childIs(tree, index, "lineseg")) return error.UnsupportedFormulaCellContent;
    }
    for (sites.items) |site| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        var cursor: ?usize = site.element_index;
        var owner: ?usize = null;
        var p: ?usize = null;
        while (cursor) |index| : (cursor = tree.elements[index].parent) {
            if (fields.childIs(tree, index, "p") and p == null) p = index;
            if (fields.childIs(tree, index, "tc")) {
                owner = index;
                break;
            }
        }
        if (owner != cell) continue;
        const current_p = p orelse return error.InvalidFormulaCellText;
        if (paragraph != null and paragraph.? != current_p) return error.UnsupportedFormulaCellParagraphs;
        paragraph = current_p;
        if (site.text.len > bytes.len - length) return error.LimitExceeded;
        @memcpy(bytes[length..][0..site.text.len], site.text);
        length += site.text.len;
    }
    const wire = try std.unicode.utf8ToUtf16LeAlloc(a, bytes[0..length]);
    defer a.free(wire);
    return @import("../hwp5/body/formula_number.zig").parse(std.mem.sliceAsBytes(wire));
}

test "HWPX formula current cell number rejects hidden boundaries and controls" {
    const a = std.testing.allocator;
    const contents = [_][]const u8{
        "<p:p><p:run><p:t>1<p:tab/>2</p:t></p:run></p:p>",
        "<p:p><p:run><p:ctrl><p:fieldBegin/></p:ctrl><p:t>12</p:t></p:run></p:p>",
        "<p:p><p:run><p:t>12</p:t></p:run></p:p><p:p/>",
    };
    for (contents, 0..) |content, index| {
        const source = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl><p:tr><p:tc><p:subList>", content, "</p:subList></p:tc></p:tr></p:tbl></s:sec>" });
        defer a.free(source);
        var tree = try tree_mod.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var sites = try sites_mod.collect(a, &tree, .{});
        defer sites.deinit(a);
        try std.testing.expectError(if (index == 2) error.UnsupportedFormulaCellParagraphs else error.UnsupportedFormulaCellContent, read(a, &tree, &sites, 3));
    }
}

test "HWPX formula current cell number reads edits and excludes nested table text" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:t>12</p:t><p:t>.5</p:t></p:run></p:p><p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:t>999</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:subList></p:tc></p:tr></p:tbl></s:sec>";
    var tree = try tree_mod.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(f64, 12.5), try read(a, &tree, &sites, 3));
    a.free(sites.items[0].text);
    sites.items[0].text = try a.dupe(u8, "42");
    try std.testing.expectEqual(@as(f64, 42.5), try read(a, &tree, &sites, 3));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *const tree_mod.Tree, s: *const sites_mod.Sites) !void {
            try std.testing.expectEqual(@as(f64, 42.5), try read(allocator, t, s, 3));
        }
    }.run, .{ &tree, &sites });
}
