//! Original physical cell source observation and bounded lexical preparation.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const model = @import("../model/original_cell_insets.zig");
const epoch = @import("../model/history_mutation_epoch.zig");
pub const Observation = struct {
    section: usize,
    paragraph_template: usize,
    table_node: usize,
    cell_node: usize,
    list_node: usize,
    margin_node: usize,
    source_sha256: [32]u8,
    ticket: epoch.Ticket,
    source: model.Source,
    frame: model.Frame,
    read_only: bool,
    pub fn deinit(_: *Observation, _: std.mem.Allocator) void {}
};
pub const Request = struct { before: Observation, value: model.Patch };
fn child(tree: *const Tree, parent: usize, name: []const u8) !usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const node = fields.uniqueChild(tree, parent, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicateCellInsetsOwner;
    return node orelse error.UnknownCellInsets;
}
fn margins(a: std.mem.Allocator, tree: *const Tree, node: usize) ![4]?i64 {
    var result: [4]?i64 = @splat(null);
    for (fields.margin_names, 0..) |name, i| if (try tree.attributeValue(a, node, "", name)) |raw| {
        result[i] = try fields.margin(a, raw, 4096);
    };
    return result;
}
pub fn observe(a: std.mem.Allocator, tree: *const Tree, template: usize, ticket: epoch.Ticket, read_only: bool) !Observation {
    const owner = (try @import("table_display_owner.zig").resolve(a, tree, template)) orelse return error.InvalidCellDisplayOwner;
    const cell = try @import("table_cell_margin_values.zig").read(a, tree, owner.cell_node);
    const margin_node = try child(tree, owner.cell_node, "cellMargin");
    const table_margin = try child(tree, owner.table_node, "inMargin");
    var protected = read_only;
    if (try tree.attributeValue(a, owner.cell_node, "", "protect")) |raw| protected = protected or try fields.boolean(a, raw, 4096);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &digest, .{});
    return .{ .section = tree.section_ordinal orelse return error.InvalidSectionIndex, .paragraph_template = template, .table_node = owner.table_node, .cell_node = owner.cell_node, .list_node = owner.list_node, .margin_node = margin_node, .source_sha256 = digest, .ticket = ticket, .source = .{ .use_cell = cell.has_margin, .cell = cell.margin orelse @splat(null), .table = try margins(a, tree, table_margin) }, .frame = .{ .width = owner.cell.width orelse return error.UnknownCellInsets, .height = owner.cell.height orelse return error.UnknownCellInsets }, .read_only = protected };
}
pub fn matches(a: Observation, b: Observation) bool {
    return std.meta.eql(a, b);
}
fn boolEqual(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: bool) !bool {
    return try fields.boolean(a, raw, 4096) == value;
}
fn boolSerialize(a: std.mem.Allocator, quote: u8, value: bool) ![]u8 {
    return std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, @intFromBool(value), quote });
}
fn marginEqual(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, value: i64) !bool {
    return try fields.margin(a, raw, 4096) == value;
}
fn marginSerialize(a: std.mem.Allocator, quote: u8, value: i64) ![]u8 {
    return std.fmt.allocPrint(a, "{c}{d}{c}", .{ quote, value, quote });
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, request: Request, ticket: epoch.Ticket, read_only: bool, limit: usize) !?[]u8 {
    if (tree.source.len > limit) return error.LimitExceeded;
    const current = try observe(a, tree, request.before.paragraph_template, ticket, read_only);
    if (!matches(current, request.before)) return error.StaleOriginalCellInsets;
    if (current.read_only) return error.OriginalCellInsetsReadOnly;
    const prepared = try model.prepare(current.source, current.frame, request.value);
    if (!prepared.changed) return null;
    const upsert = @import("xml_bound_attributes_write.zig");
    const cell_tag = try upsert.write(a, tree, current.cell_node, &.{"hasMargin"}, bool, .{prepared.use_cell}, boolEqual, boolSerialize, limit);
    defer a.free(cell_tag);
    // Returning to inheritance must leave dormant cellMargin bytes untouched.
    var margin_tag: ?[]u8 = null;
    defer if (margin_tag) |bytes| a.free(bytes);
    var values: [4]i64 = undefined;
    if (prepared.use_cell) {
        for (prepared.cell, 0..) |raw, i| values[i] = raw orelse return error.UnknownCellInsets;
        margin_tag = try upsert.write(a, tree, current.margin_node, &fields.margin_names, i64, values, marginEqual, marginSerialize, limit);
    }
    const writer = @import("xml_source_writer.zig");
    var changes: [2]writer.Change = undefined;
    const cell_span = tree.elements[current.cell_node].start_tag;
    changes[0] = .{ .start = cell_span.start, .end = cell_span.end, .text = "", .start_tag = cell_tag };
    var count: usize = 1;
    if (margin_tag) |tag| {
        const span = tree.elements[current.margin_node].start_tag;
        changes[1] = .{ .start = span.start, .end = span.end, .text = "", .start_tag = tag };
        count = 2;
    }
    return try writer.write(a, tree.source, changes[0..count], limit);
}
