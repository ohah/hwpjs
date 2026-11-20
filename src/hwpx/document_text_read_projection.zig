//! Read projection of a freshly serialized Native paragraph. This issues no
//! edit eligibility. Empty/runless object owners must not need a fake text site.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Segment = @import("paragraph_text_positions.zig").Segment;
pub fn build(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) ![]Segment {
    if (paragraph.sites.items.len != 0) {
        const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
        defer a.free(locations);
        return @import("anchor_text_positions.zig").buildForFieldText(a, tree, &paragraph.sites, locations, 1);
    }
    var output: std.ArrayList(Segment) = .empty;
    defer output.deinit(a);
    var nodes = try @import("paragraph_owned_elements.zig").Iterator.init(tree, paragraph.template_element);
    while (try nodes.next()) |index| {
        var kind: ?@FieldType(Segment, "kind") = null;
        if (@import("run_anchor.zig").kind(tree, index) != null) {
            const run = tree.elements[index].parent orelse return error.SourceBindingMismatch;
            if (tree.elements[run].parent != paragraph.template_element) return error.SourceBindingMismatch;
            kind = .anchor;
        } else if (tree.elements[index].parent) |parent| {
            if (tree.elements[parent].is(@import("document_xml.zig").paragraph_uri, "t"))
                if (@import("retained_inline_unit.zig").kind(tree, index)) |inline_kind| {
                    kind = switch (inline_kind) {
                        .tab => .tab,
                        .nb_space => .nb_space,
                        .fw_space => .fw_space,
                        .line_break => .line_break,
                        .hypen => .hypen,
                    };
                };
        }
        if (kind) |value| try output.append(a, .{ .kind = value, .index = index, .source_start = tree.elements[index].start_tag.start, .start_unit = output.items.len, .end_unit = output.items.len + 1 });
    }
    return output.toOwnedSlice(a);
}
pub fn text(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, max_bytes: usize) ![]u8 {
    const segments = try build(a, tree, paragraph);
    defer a.free(segments);
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(a);
    for (segments) |segment| {
        const value = @import("paragraph_text_positions.zig").segmentText(&paragraph.sites, segment);
        if (value.len > max_bytes -| output.items.len) return error.LimitExceeded;
        try output.appendSlice(a, value);
    }
    return output.toOwnedSlice(a);
}

test "document text HX runless read projection keeps known anchors inline units and nested owner separation" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:pic/><p:t><p:tab/></p:t><p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:pic/></p:run></p:p></p:subList></p:tc></p:tr></p:tbl><x:pic/></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    const paragraph: Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = .{ .items = &.{} } };
    const observed = try text(a, &tree, &paragraph, 7);
    defer a.free(observed);
    try std.testing.expectEqualStrings("\xef\xbf\xbc\t\xef\xbf\xbc", observed);
    try std.testing.expectError(error.LimitExceeded, text(a, &tree, &paragraph, 6));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, owner: *const Paragraph) !void {
            const value = try text(allocator, source, owner, 7);
            defer allocator.free(value);
            try std.testing.expectEqualStrings("\xef\xbf\xbc\t\xef\xbf\xbc", value);
        }
    }.run, .{ @as(*const Tree, &tree), &paragraph });
}
