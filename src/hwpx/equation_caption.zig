const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const para_list = @import("para_list_attributes.zig");
const shape_caption = @import("shape_caption.zig");
const Budget = @import("equation_fields.zig").Budget;

pub const SubList = struct {
    shape_child_index: usize,
    element_index: usize,
    /// Borrows the containing Equation.raw_xml.
    raw_xml: []const u8,
    attributes: [para_list.field_names.len]?[]const u8 = @splat(null),
    direct_paragraphs: usize,
    other_direct_children: usize,
    unknown_enums: usize,
    other_attributes: usize,

    pub fn get(self: SubList, field: para_list.Field) ?[]const u8 {
        return self.attributes[@intFromEnum(field)];
    }
};

const Context = struct {
    owned_a: std.mem.Allocator,
    tree: *const tree_mod.Tree,
    equation_element: usize,
    caption_element: usize,
    shape_child_index: usize,
    equation_source: []const u8,
    budget: *Budget,
    output: *std.ArrayList(SubList),

    fn onSubList(raw: *anyopaque, observed: shape_caption.SubList) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        const element = self.tree.elements[observed.element_index];
        const base = self.tree.elements[self.equation_element].start_tag.start;
        if (element.parent != self.caption_element or element.start_tag.start < base or element.end < element.start_tag.start or element.end - base > self.equation_source.len) return error.InvalidSourceSpan;
        var result: SubList = .{
            .shape_child_index = self.shape_child_index,
            .element_index = observed.element_index,
            .raw_xml = self.equation_source[element.start_tag.start - base .. element.end - base],
            .direct_paragraphs = observed.direct_paragraphs,
            .other_direct_children = observed.other_direct_children,
            .unknown_enums = observed.attributes.unknown_enums,
            .other_attributes = observed.attributes.other_attributes,
        };
        for (observed.attributes.raw, 0..) |value, slot| {
            if (value) |bytes| result.attributes[slot] = try self.budget.copy(self.owned_a, bytes);
        }
        try self.output.append(self.owned_a, result);
    }
};

pub fn inspect(temp_a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, equation_element: usize, caption_element: usize, shape_child_index: usize, equation_source: []const u8, max_attribute_bytes: usize, options: shape_caption.Options, budget: *Budget, counts: *shape_caption.Counts, output: *std.ArrayList(SubList)) !void {
    var context: Context = .{
        .owned_a = owned_a,
        .tree = tree,
        .equation_element = equation_element,
        .caption_element = caption_element,
        .shape_child_index = shape_child_index,
        .equation_source = equation_source,
        .budget = budget,
        .output = output,
    };
    try shape_caption.inspect(temp_a, tree, caption_element, max_attribute_bytes, options, counts, .{
        .context = &context,
        .on_sub_list = Context.onSubList,
    });
}
