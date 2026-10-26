//! Proof of a current empty, plain paragraph; never infer emptiness from display glyphs.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const uri = @import("document_xml.zig").paragraph_uri;

fn whitespaceGaps(tree: *const Tree, index: usize) bool {
    const element = tree.elements[index];
    var end = element.start_tag.end;
    var child = element.first_child;
    while (child) |at| : (child = tree.elements[at].next_sibling) {
        const item = tree.elements[at];
        if (std.mem.trim(u8, tree.source[end..item.start_tag.start], " \t\r\n").len != 0) return false;
        end = item.end;
    }
    const close = if (element.end_tag) |tag| tag.start else element.end;
    return std.mem.trim(u8, tree.source[end..close], " \t\r\n").len == 0;
}

pub fn eligible(tree: *const Tree, paragraph: Paragraph) bool {
    if (paragraph.template_element >= tree.elements.len or paragraph.pieces != null) return false;
    for (paragraph.sites.items) |site| if (site.text.len != 0) return false;
    inline for (.{ "protected_positions", "field_positions", "title_positions", "column_boundaries", "page_area_positions" }) |name| {
        if (@field(paragraph, name)) |items| if (items.len != 0) return false;
    }
    const element = tree.elements[paragraph.template_element];
    if (!element.is(uri, "p") or !whitespaceGaps(tree, paragraph.template_element)) return false;
    var child = element.first_child;
    while (child) |at| : (child = tree.elements[at].next_sibling) {
        const item = tree.elements[at];
        if (item.is(uri, "linesegarray")) {
            if (!whitespaceGaps(tree, at)) return false;
            var line = item.first_child;
            while (line) |segment| : (line = tree.elements[segment].next_sibling) {
                if (!tree.elements[segment].is(uri, "lineseg") or tree.elements[segment].first_child != null or !whitespaceGaps(tree, segment)) return false;
            }
            continue;
        }
        if (!item.is(uri, "run") or !whitespaceGaps(tree, at)) return false;
        var run_child = item.first_child;
        while (run_child) |text| : (run_child = tree.elements[text].next_sibling) {
            if (!tree.elements[text].is(uri, "t") or tree.elements[text].first_child != null) return false;
        }
    }
    return true;
}

test "HWPX empty paragraph proof uses current text and rejects controls and unknown shells" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    for ([_][]const u8{
        "<p:p><p:run><p:t/></p:run></p:p>",
        "<p:p><p:run><p:t>deleted source text</p:t></p:run></p:p>",
        "<p:p><p:run><p:t><p:lineBreak/></p:t></p:run></p:p>",
        "<p:p><p:run><p:tbl/></p:run></p:p>",
        "<p:p><p:run><p:ctrl/></p:run></p:p>",
        "<p:p><p:run><x:t xmlns:x='urn:x'/></p:run></p:p>",
        "<p:p>unowned text<p:run><p:t/></p:run></p:p>",
    }, 0..) |body, index| {
        const xml = try std.mem.concat(a, u8, &.{ prefix, body, "</s:sec>" });
        defer a.free(xml);
        var tree = try @import("section_tree.zig").parse(a, xml, 0, 0, .{});
        defer tree.deinit(a);
        var paragraph: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = .{ .items = &.{} } };
        try std.testing.expectEqual(index < 2, eligible(&tree, paragraph));
        var text = [_]u8{' '};
        var sites = [_]@import("text_sites.zig").Site{.{ .element_index = 3, .start = 0, .end = 0, .text = &text }};
        paragraph.sites.items = &sites;
        try std.testing.expect(!eligible(&tree, paragraph));
    }
}
