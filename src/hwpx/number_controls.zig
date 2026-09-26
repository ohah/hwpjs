const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const fields = @import("number_control_fields.zig");

pub const Options = struct {
    max_controls: usize = 200_000,
    max_formats: usize = 200_000,
    max_direct_children: usize = 500_000,
    max_leaf_children: usize = 500_000,
    max_name_bytes: usize = 4096,
    max_attribute_bytes: usize = 4096,
    max_owned_bytes: usize = 128 * 1024 * 1024,
};
pub const Kind = enum { auto_num, new_num, page_num };
pub const Control = struct {
    kind: Kind,
    section_ordinal: usize,
    element_index: usize,
    parent_element_index: usize,
    parent_uri: []const u8,
    parent_local_name: []const u8,
    raw_xml: []const u8,
    auto: ?fields.Auto = null,
    page: ?fields.Page = null,
    first_format: usize,
    format_count: usize = 0,
    direct_children: usize = 0,
    unknown_children: usize = 0,
};
pub const Format = struct {
    control_index: usize,
    section_ordinal: usize,
    element_index: usize,
    raw_xml: []const u8,
    attributes: fields.Format,
    direct_children: usize = 0,
};
pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    sections: usize,
    controls: []const Control,
    formats: []const Format,
    auto_nums: usize,
    new_nums: usize,
    page_nums: usize,
    unknown_types: usize,
    unknown_positions: usize,
    unknown_formats: usize,
    other_attributes: usize,
    unknown_children: usize,
    direct_children: usize,
    leaf_children: usize,
    auto_missing_format: usize,
    unexpected_format: usize,
    owned_bytes: usize,
    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
const Budget = struct {
    max: usize,
    used: usize = 0,
    pub fn copy(self: *Budget, a: std.mem.Allocator, raw: []const u8) ![]const u8 {
        if (raw.len > self.max -| self.used) return error.LimitExceeded;
        const value = try a.dupe(u8, raw);
        self.used += raw.len;
        return value;
    }
};
fn kindOf(element: tree_mod.Element) ?Kind {
    if (element.is(document_xml.paragraph_uri, "autoNum")) return .auto_num;
    if (element.is(document_xml.paragraph_uri, "newNum")) return .new_num;
    if (element.is(document_xml.paragraph_uri, "pageNum")) return .page_num;
    return null;
}

/// Inspects exact selected-section number controls without calculating their rendered sequence.
pub fn inspect(a: std.mem.Allocator, sections: []const tree_mod.Tree, options: Options) !Report {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    var budget: Budget = .{ .max = options.max_owned_bytes };
    var controls: std.ArrayList(Control) = .empty;
    var formats: std.ArrayList(Format) = .empty;
    var result: Report = .{
        .arena = arena,
        .sections = sections.len,
        .controls = &.{},
        .formats = &.{},
        .auto_nums = 0,
        .new_nums = 0,
        .page_nums = 0,
        .unknown_types = 0,
        .unknown_positions = 0,
        .unknown_formats = 0,
        .other_attributes = 0,
        .unknown_children = 0,
        .direct_children = 0,
        .leaf_children = 0,
        .auto_missing_format = 0,
        .unexpected_format = 0,
        .owned_bytes = 0,
    };
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0) return error.InvalidPartKind;
        for (tree.elements, 0..) |element, index| {
            const kind = kindOf(element) orelse continue;
            const parent_index = element.parent orelse continue;
            if (controls.items.len >= options.max_controls) return error.LimitExceeded;
            const parent_name = tree.elements[parent_index].name;
            if (parent_name.uri.len > options.max_name_bytes) return error.LimitExceeded;
            const parent_local = try (xml.text_content.View{
                .kind = .cdata,
                .raw = parent_name.local.raw,
                .encoding = parent_name.local.encoding,
                .scalars = 0,
                .reference_options = .{},
            }).toUtf8(a, options.max_name_bytes);
            defer a.free(parent_local);
            var control: Control = .{
                .kind = kind,
                .section_ordinal = ordinal,
                .element_index = index,
                .parent_element_index = parent_index,
                .parent_uri = try budget.copy(owned_a, parent_name.uri),
                .parent_local_name = try budget.copy(owned_a, parent_local),
                .raw_xml = try budget.copy(owned_a, tree.sourceOf(index)),
                .first_format = formats.items.len,
            };
            switch (kind) {
                .auto_num, .new_num => {
                    control.auto = try fields.readAuto(a, owned_a, tree, index, options.max_attribute_bytes, &budget);
                    result.other_attributes += control.auto.?.other_attributes;
                    result.unknown_types += @intFromBool(control.auto.?.type_known == false);
                    if (kind == .auto_num) result.auto_nums += 1 else result.new_nums += 1;
                },
                .page_num => {
                    control.page = try fields.readPage(a, owned_a, tree, index, options.max_attribute_bytes, &budget);
                    result.other_attributes += control.page.?.other_attributes;
                    result.unknown_positions += @intFromBool(control.page.?.pos_known == false);
                    result.unknown_formats += @intFromBool(control.page.?.format_known == false);
                    result.page_nums += 1;
                },
            }
            var cursor = element.first_child;
            while (cursor) |child_index| : (cursor = tree.elements[child_index].next_sibling) {
                if (result.direct_children >= options.max_direct_children) return error.LimitExceeded;
                result.direct_children += 1;
                control.direct_children += 1;
                const child = tree.elements[child_index];
                if (!child.is(document_xml.paragraph_uri, "autoNumFormat")) {
                    control.unknown_children += 1;
                    result.unknown_children += 1;
                    continue;
                }
                if (formats.items.len >= options.max_formats) return error.LimitExceeded;
                var format: Format = .{
                    .control_index = controls.items.len,
                    .section_ordinal = ordinal,
                    .element_index = child_index,
                    .raw_xml = try budget.copy(owned_a, tree.sourceOf(child_index)),
                    .attributes = try fields.readFormat(a, owned_a, tree, child_index, options.max_attribute_bytes, &budget),
                };
                result.other_attributes += format.attributes.other_attributes;
                result.unknown_formats += @intFromBool(format.attributes.type_known == false);
                var nested = child.first_child;
                while (nested) |nested_index| : (nested = tree.elements[nested_index].next_sibling) {
                    if (result.leaf_children >= options.max_leaf_children) return error.LimitExceeded;
                    result.leaf_children += 1;
                    format.direct_children += 1;
                }
                try formats.append(owned_a, format);
                control.format_count += 1;
                if (kind == .page_num) result.unexpected_format += 1;
            }
            if (kind == .auto_num and control.format_count == 0) result.auto_missing_format += 1;
            try controls.append(owned_a, control);
        }
    }
    result.controls = try controls.toOwnedSlice(owned_a);
    result.formats = try formats.toOwnedSlice(owned_a);
    result.owned_bytes = budget.used;
    result.arena = arena;
    return result;
}
