//! Prepare owned result strings without mutating the current document.
//! The caller supplies a range validated by field_text_ranges.build.
const std = @import("std");
const sites_mod = @import("text_sites.zig");
const tree_mod = @import("xml_part_tree.zig");
pub const Replacement = struct { site_index: usize, text: []u8 };
pub const Prepared = struct {
    items: []Replacement,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        for (self.items) |item| a.free(item.text);
        a.free(self.items);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, tree: *const tree_mod.Tree, sites: *const sites_mod.Sites, range: @import("field_text_ranges.zig").Range, display: []const u8) !Prepared {
    if (tree.section_ordinal != range.section or range.content_start > range.content_end or range.content_end > tree.source.len) return error.SourceBindingMismatch;
    if (!std.unicode.utf8ValidateSlice(display)) return error.InvalidUtf8;
    if (display.len > 4096) return error.LimitExceeded;
    const uri = @import("document_xml.zig").paragraph_uri;
    for (tree.elements) |element| {
        if (element.start_tag.start < range.content_start or element.start_tag.start >= range.content_end) continue;
        if (!element.is(uri, "p") and !element.is(uri, "run") and !element.is(uri, "ctrl") and !element.is(uri, "t") and !element.is(uri, "linesegarray") and !element.is(uri, "lineseg")) return error.UnsupportedFormulaResultSite;
    }
    var output: std.ArrayList(Replacement) = .empty;
    errdefer {
        for (output.items) |item| a.free(item.text);
        output.deinit(a);
    }
    var paragraph: ?usize = null;
    for (sites.items, 0..) |site, index| {
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        const element = tree.elements[site.element_index];
        if (element.start_tag.start < range.content_start or element.start_tag.start >= range.content_end) continue;
        if (element.end > range.content_end or !element.is(@import("document_xml.zig").paragraph_uri, "t")) return error.UnsupportedFormulaResultSite;
        var cursor = element.parent;
        var owner: ?usize = null;
        while (cursor) |parent| : (cursor = tree.elements[parent].parent) {
            if (tree.elements[parent].is(@import("document_xml.zig").paragraph_uri, "p")) {
                owner = parent;
                break;
            }
        }
        const p = owner orelse return error.UnsupportedFormulaResultSite;
        if (paragraph != null and paragraph.? != p) return error.UnsupportedFormulaResultParagraphs;
        paragraph = p;
        const text = try a.dupe(u8, if (output.items.len == 0) display else "");
        output.append(a, .{ .site_index = index, .text = text }) catch |err| {
            a.free(text);
            return err;
        };
    }
    if (output.items.len == 0) return error.MissingFormulaResultSite;
    return .{ .items = try output.toOwnedSlice(a) };
}

test "HWPX formula result sites prepare all strings without changing current text on allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='FORMULA'/></p:ctrl><p:t>old</p:t><p:t>tail</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try tree_mod.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const trees = [_]tree_mod.Tree{tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &report);
    defer a.free(ranges);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *tree_mod.Tree, s: *sites_mod.Sites, r: @import("field_text_ranges.zig").Range) !void {
            defer {
                std.testing.expectEqualStrings("old", s.items[0].text) catch @panic("modified input");
                std.testing.expectEqualStrings("tail", s.items[1].text) catch @panic("modified input");
            }
            var prepared = try prepare(allocator, t, s, r, "42.00");
            defer prepared.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 2), prepared.items.len);
            try std.testing.expectEqualStrings("42.00", prepared.items[0].text);
            try std.testing.expectEqualStrings("", prepared.items[1].text);
        }
    }.run, .{ &tree, &sites, ranges[0] });
    var invalid = ranges[0];
    invalid.content_end = tree.source.len + 1;
    try std.testing.expectError(error.SourceBindingMismatch, prepare(a, &tree, &sites, invalid, "42"));
    try std.testing.expectError(error.InvalidUtf8, prepare(a, &tree, &sites, ranges[0], &.{0xff}));
}
