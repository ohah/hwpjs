const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const table_xml = @import("table_xml_fields.zig");
const fields = @import("shape_xml_fields.zig");
const children = @import("shape_xml_children.zig");
const shape_caption = @import("shape_caption.zig");

pub const Options = struct {
    max_shape_children: usize = 1_000_000,
    max_caption_sub_lists: usize = 1_000_000,
    max_caption_direct_paragraphs: usize = 1_000_000,
};

pub fn ChildCounts(comptime field_count: usize) type {
    return struct {
        elements: usize = 0,
        missing_tables: usize = 0,
        duplicate_tables: usize = 0,
        fields: [field_count]fields.Counts = @splat(.{}),
    };
}

pub const Report = struct {
    tables: usize = 0,
    shape_children: usize = 0,
    table_fields: [fields.table_specs.len]fields.Counts = @splat(.{}),
    size: ChildCounts(fields.size_specs.len) = .{},
    position: ChildCounts(fields.position_specs.len) = .{},
    out_margin: ChildCounts(fields.margin_specs.len) = .{},
    caption: ChildCounts(fields.caption_specs.len) = .{},
    label: ChildCounts(fields.label_specs.len) = .{},
    shape_comment: ChildCounts(0) = .{},
    parameter_set: ChildCounts(0) = .{},
    meta_tag: ChildCounts(0) = .{},
    other_direct_children: usize = 0,
    caption_sub_lists: usize = 0,
    caption_missing_sub_list: usize = 0,
    caption_duplicate_sub_list: usize = 0,
    caption_direct_paragraphs: usize = 0,
    caption_other_direct_children: usize = 0,
    caption_unknown_enums: usize = 0,
    caption_other_attributes: usize = 0,
};

const ChildKind = children.Kind;

fn inspectCaptionSubLists(a: std.mem.Allocator, tree: *const tree_mod.Tree, caption: usize, max_bytes: usize, options: Options, report: *Report) !void {
    var counts: shape_caption.Counts = .{
        .sub_lists = report.caption_sub_lists,
        .missing_sub_list = report.caption_missing_sub_list,
        .duplicate_sub_list = report.caption_duplicate_sub_list,
        .direct_paragraphs = report.caption_direct_paragraphs,
        .other_direct_children = report.caption_other_direct_children,
        .unknown_enums = report.caption_unknown_enums,
        .other_attributes = report.caption_other_attributes,
    };
    try shape_caption.inspect(a, tree, caption, max_bytes, .{
        .max_sub_lists = options.max_caption_sub_lists,
        .max_direct_paragraphs = options.max_caption_direct_paragraphs,
    }, &counts, null);
    report.caption_sub_lists = counts.sub_lists;
    report.caption_missing_sub_list = counts.missing_sub_list;
    report.caption_duplicate_sub_list = counts.duplicate_sub_list;
    report.caption_direct_paragraphs = counts.direct_paragraphs;
    report.caption_other_direct_children = counts.other_direct_children;
    report.caption_unknown_enums = counts.unknown_enums;
    report.caption_other_attributes = counts.other_attributes;
}

/// The caller owns hp:tbl selection. Only direct shape children are inspected.
pub fn inspectTable(a: std.mem.Allocator, tree: *const tree_mod.Tree, table: usize, max_bytes: usize, options: Options, report: *Report) !void {
    report.tables += 1;
    try fields.inspect(&fields.table_specs, a, tree, table, max_bytes, &report.table_fields);
    var per_table: [children.names.len]usize = @splat(0);
    var child = tree.elements[table].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const kind = children.kindOf(tree, index, .table) orelse {
            if (!table_xml.childIs(tree, index, "tr") and !table_xml.childIs(tree, index, "inMargin") and !table_xml.childIs(tree, index, "cellzoneList")) report.other_direct_children += 1;
            continue;
        };
        const selected: usize = @intFromEnum(kind);
        if (report.shape_children == options.max_shape_children) return error.LimitExceeded;
        report.shape_children += 1;
        per_table[selected] += 1;
        switch (kind) {
            .size => {
                report.size.elements += 1;
                try fields.inspect(&fields.size_specs, a, tree, index, max_bytes, &report.size.fields);
            },
            .position => {
                report.position.elements += 1;
                try fields.inspect(&fields.position_specs, a, tree, index, max_bytes, &report.position.fields);
            },
            .out_margin => {
                report.out_margin.elements += 1;
                try fields.inspect(&fields.margin_specs, a, tree, index, max_bytes, &report.out_margin.fields);
            },
            .caption => {
                report.caption.elements += 1;
                try fields.inspect(&fields.caption_specs, a, tree, index, max_bytes, &report.caption.fields);
                try inspectCaptionSubLists(a, tree, index, max_bytes, options, report);
            },
            .shape_comment => report.shape_comment.elements += 1,
            .parameter_set => report.parameter_set.elements += 1,
            .meta_tag => report.meta_tag.elements += 1,
            .label => {
                report.label.elements += 1;
                try fields.inspect(&fields.label_specs, a, tree, index, max_bytes, &report.label.fields);
            },
        }
    }
    inline for (std.meta.fields(ChildKind), 0..) |_, child_index| {
        const count = per_table[child_index];
        const missing = @intFromBool(count == 0);
        const duplicate = @intFromBool(count > 1);
        switch (@as(ChildKind, @enumFromInt(child_index))) {
            .size => {
                report.size.missing_tables += missing;
                report.size.duplicate_tables += duplicate;
            },
            .position => {
                report.position.missing_tables += missing;
                report.position.duplicate_tables += duplicate;
            },
            .out_margin => {
                report.out_margin.missing_tables += missing;
                report.out_margin.duplicate_tables += duplicate;
            },
            .caption => {
                report.caption.missing_tables += missing;
                report.caption.duplicate_tables += duplicate;
            },
            .shape_comment => {
                report.shape_comment.missing_tables += missing;
                report.shape_comment.duplicate_tables += duplicate;
            },
            .parameter_set => {
                report.parameter_set.missing_tables += missing;
                report.parameter_set.duplicate_tables += duplicate;
            },
            .meta_tag => {
                report.meta_tag.missing_tables += missing;
                report.meta_tag.duplicate_tables += duplicate;
            },
            .label => {
                report.label.missing_tables += missing;
                report.label.duplicate_tables += duplicate;
            },
        }
    }
}
