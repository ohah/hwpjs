//! Original physical cell owner + whole current-source/ticket binding.
const std = @import("std");
const semantic = @import("../../model/original_cell_insets.zig");
const model = @import("../../model/document.zig");
const epoch = @import("../../model/history_mutation_epoch.zig");
const alignment = @import("cell_vertical_alignment_plan.zig");
pub const Selector = alignment.Selector;
pub const Observation = struct {
    selector: Selector,
    source: semantic.Source,
    frame: semantic.Frame,
    attributes: u32,
    source_sha256: [32]u8,
    ticket: epoch.Ticket,
    read_only: bool,
};
pub const Request = struct { before: Observation, patch: semantic.Patch };
pub fn validate(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, section: model.Section, section_index: u32, request: Request, ticket: epoch.Ticket, read_only: bool) !bool {
    const current = try observe(a, raw, version, section, section_index, request.before.selector, ticket, read_only);
    if (!std.meta.eql(current, request.before)) return error.StaleCellInsets;
    if (current.read_only) return error.CellInsetsReadOnly;
    return (try semantic.prepare(current.source, current.frame, request.patch)).changed;
}
pub fn observe(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, section: model.Section, section_index: u32, selector: Selector, ticket: epoch.Ticket, read_only: bool) !Observation {
    // Reuse the existing physical cell membership and whole-cell protected-field fence.
    // This is ownership observation only; no alignment setter is invoked.
    const owner = try alignment.observe(a, raw, version, section, section_index, selector, ticket, read_only);
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    if (selector.table_node >= tree.nodes.len or tree.nodes[selector.table_node].record.value != .table) return error.InvalidCellDisplayOwner;
    const view = try tree.nodes[selector.list_node].record.value.list_header.view(.observed8);
    const cell = try @import("../body/table_cell.zig").Cell.parse(view.extra);
    const table = tree.nodes[selector.table_node].record.value.table;
    var source: semantic.Source = .{ .use_cell = view.attributes & (1 << 16) != 0, .cell = undefined, .table = undefined };
    for (cell.margins, 0..) |value, i| source.cell[i] = value;
    for (table.margins, 0..) |value, i| source.table[i] = value;
    var frame: semantic.Frame = .{ .width = cell.width, .height = cell.height };
    var count: usize = 0;
    if (section.table_cell_sizes) |sizes| for (sizes) |size| {
        if (size.source_list_node != selector.list_node) continue;
        count += 1;
        frame = .{ .width = size.width, .height = size.height };
    };
    if (count > 1) return error.InvalidCellDisplayOwner;
    _ = try semantic.effective(source, frame);
    return .{ .selector = selector, .source = source, .frame = frame, .attributes = view.attributes, .source_sha256 = owner.source_sha256, .ticket = ticket, .read_only = owner.read_only };
}
pub fn prepare(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, section: model.Section, section_index: u32, request: Request, ticket: epoch.Ticket, read_only: bool, limit: usize) !?[]u8 {
    if (raw.len > limit) return error.LimitExceeded;
    const current = try observe(a, raw, version, section, section_index, request.before.selector, ticket, read_only);
    if (!std.meta.eql(current, request.before)) return error.StaleCellInsets;
    if (current.read_only) return error.CellInsetsReadOnly;
    const after = try semantic.prepare(current.source, current.frame, request.patch);
    if (!after.changed) return null;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const record = tree.nodes[current.selector.list_node].record.framing;
    const payload = try @import("cell_insets_payload.zig").write(a, record.payload, .observed8, current.attributes, after, record.payload.len);
    defer a.free(payload);
    const output = try a.dupe(u8, raw);
    errdefer a.free(output);
    const at = record.offset + record.raw.len - record.payload.len;
    @memcpy(output[at..][0..payload.len], payload);
    const verified = try observe(a, output, version, section, section_index, current.selector, ticket, read_only);
    if (verified.source.use_cell != after.use_cell or !std.meta.eql(verified.source.cell, after.cell) or !std.meta.eql(verified.frame, current.frame)) return error.SourceBindingMismatch;
    return output;
}
