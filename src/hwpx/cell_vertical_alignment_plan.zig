//! Source-bound whole-section preparation; does not mutate Session or issue public authority.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const epoch = @import("../model/history_mutation_epoch.zig");
const alignment = @import("../model/cell_vertical_alignment.zig");
pub const Observation = struct {
    section: usize,
    paragraph_template: usize,
    table_node: usize,
    cell_node: usize,
    list_node: usize,
    source_sha256: [32]u8,
    ticket: epoch.Ticket,
    raw: ?[]u8,
    value: ?alignment.Alignment,
    read_only: bool,
    pub fn deinit(self: *Observation, a: std.mem.Allocator) void {
        if (self.raw) |v| a.free(v);
        self.* = undefined;
    }
};
pub const Request = struct { before: Observation, value: alignment.Alignment };
pub fn observe(a: std.mem.Allocator, tree: *const Tree, paragraph_template: usize, ticket: epoch.Ticket, read_only: bool) !Observation {
    const section = tree.section_ordinal orelse return error.InvalidSectionIndex;
    const owner = (try @import("table_display_owner.zig").resolve(a, tree, paragraph_template)) orelse return error.InvalidCellDisplayOwner;
    const raw = if (try tree.attributeValue(a, owner.list_node, "", "vertAlign")) |v| try v.toUtf8(a, 4096) else null;
    errdefer if (raw) |v| a.free(v);
    var protected = read_only;
    if (try tree.attributeValue(a, owner.cell_node, "", "protect")) |v| protected = protected or try @import("table_xml_fields.zig").boolean(a, v, 4096);
    var sha256: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &sha256, .{});
    return .{ .section = section, .paragraph_template = paragraph_template, .table_node = owner.table_node, .cell_node = owner.cell_node, .list_node = owner.list_node, .source_sha256 = sha256, .ticket = ticket, .raw = raw, .value = if (raw) |v| alignment.fromText(v) else null, .read_only = protected };
}
pub fn matches(a: Observation, b: Observation) bool {
    return a.section == b.section and a.paragraph_template == b.paragraph_template and a.table_node == b.table_node and a.cell_node == b.cell_node and a.list_node == b.list_node and std.meta.eql(a.ticket, b.ticket) and std.mem.eql(u8, &a.source_sha256, &b.source_sha256) and a.value == b.value and a.read_only == b.read_only and (if (a.raw) |left| if (b.raw) |right| std.mem.eql(u8, left, right) else false else b.raw == null);
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, request: Request, ticket: epoch.Ticket, read_only: bool, limit: usize) !?[]u8 {
    if (tree.source.len > limit) return error.LimitExceeded;
    var current = try observe(a, tree, request.before.paragraph_template, ticket, read_only);
    defer current.deinit(a);
    if (!matches(current, request.before)) return error.StaleCellVerticalAlignment;
    if (current.read_only) return error.CellVerticalAlignmentReadOnly;
    if (current.raw != null and current.value == null) return error.UnsupportedCellVerticalAlignment;
    if (current.value) |value| if (value == request.value) return null;
    const tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, current.list_node, &.{"vertAlign"}, .{alignment.text(request.value)}, limit);
    defer a.free(tag);
    const span = tree.elements[current.list_node].start_tag;
    return try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .start_tag = tag }}, limit);
}
