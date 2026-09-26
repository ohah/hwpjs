const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const table_xml = @import("table_xml_fields.zig");
const para_list = @import("para_list_attributes.zig");

pub const Options = struct {
    max_sub_lists: usize = 1_000_000,
    max_direct_paragraphs: usize = 1_000_000,
};

pub const Counts = struct {
    sub_lists: usize = 0,
    missing_sub_list: usize = 0,
    duplicate_sub_list: usize = 0,
    direct_paragraphs: usize = 0,
    other_direct_children: usize = 0,
    unknown_enums: usize = 0,
    other_attributes: usize = 0,
};

pub const SubList = struct {
    element_index: usize,
    attributes: *const para_list.Attributes,
    direct_paragraphs: usize,
    other_direct_children: usize,
};

pub const Visitor = struct {
    context: *anyopaque,
    on_sub_list: *const fn (*anyopaque, SubList) anyerror!void,
};

/// Counts exact direct hp:subList and hp:p children for table and equation captions.
/// The visitor may copy attributes while the temporary parsed values are alive.
pub fn inspect(a: std.mem.Allocator, tree: *const tree_mod.Tree, caption: usize, max_attribute_bytes: usize, options: Options, counts: *Counts, visitor: ?Visitor) !void {
    if (!table_xml.childIs(tree, caption, "caption")) return error.InvalidCaptionElement;
    var local_sub_lists: usize = 0;
    var child = tree.elements[caption].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!table_xml.childIs(tree, index, "subList")) {
            counts.other_direct_children += 1;
            continue;
        }
        if (counts.sub_lists == options.max_sub_lists) return error.LimitExceeded;
        counts.sub_lists += 1;
        local_sub_lists += 1;
        var attrs = try para_list.readTree(a, tree, index, max_attribute_bytes);
        defer attrs.deinit(a);
        counts.unknown_enums += attrs.unknown_enums;
        counts.other_attributes += attrs.other_attributes;
        var direct_paragraphs: usize = 0;
        var other_direct_children: usize = 0;
        var sub_child = tree.elements[index].first_child;
        while (sub_child) |sub_index| : (sub_child = tree.elements[sub_index].next_sibling) {
            if (table_xml.childIs(tree, sub_index, "p")) {
                if (counts.direct_paragraphs == options.max_direct_paragraphs) return error.LimitExceeded;
                counts.direct_paragraphs += 1;
                direct_paragraphs += 1;
            } else {
                counts.other_direct_children += 1;
                other_direct_children += 1;
            }
        }
        if (visitor) |selected| try selected.on_sub_list(selected.context, .{
            .element_index = index,
            .attributes = &attrs,
            .direct_paragraphs = direct_paragraphs,
            .other_direct_children = other_direct_children,
        });
    }
    counts.missing_sub_list += @intFromBool(local_sub_lists == 0);
    counts.duplicate_sub_list += @intFromBool(local_sub_lists > 1);
}
