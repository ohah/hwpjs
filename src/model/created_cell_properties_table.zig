//! Build an owned generated Table candidate; Native caller alone publishes it.
const std = @import("std");
const Table = @import("created_table.zig").Table;
const values = @import("created_cell_properties_values.zig");
const Property = @import("created_cell_property.zig").Property;
const Ticket = @import("history_mutation_epoch.zig").Ticket;
pub fn prepare(a: std.mem.Allocator, source: *const Table, section: usize, current: Ticket, request: values.Request, max_bytes: usize) !?Table {
    return prepareWithAlignmentBase(a, source, section, current, request, max_bytes, null);
}

pub fn prepareWithAlignmentBase(a: std.mem.Allocator, source: *const Table, section: usize, current: Ticket, request: values.Request, max_bytes: usize, alignment_base: ?@import("cell_vertical_alignment.zig").Alignment) !?Table {
    const geometry = try source.cell(request.address.row, request.address.column);
    const count = try std.math.mul(usize, source.plan.rows, source.plan.columns);
    if (source.cells.len != count or (source.cell_properties.len != 0 and source.cell_properties.len != count)) return error.InvalidTableCell;
    const index = @as(usize, request.address.row) * source.plan.columns + request.address.column;
    var current_entries = [_]values.Entry{.{ .address = request.address, .frame = .{ .width = geometry.width, .height = geometry.height }, .appearance = if (source.cell_properties.len == 0) .{} else source.cell_properties[index].appearance, .vertical_alignment = if (source.cell_properties.len == 0) null else source.cell_properties[index].vertical_alignment }};
    var prepared = try values.prepareWithAlignmentBase(a, .{ .entries = &current_entries }, source, section, current, request, max_bytes, alignment_base);
    defer prepared.deinit(a);
    if (!prepared.changed) return null;
    const bytes = std.math.mul(usize, count, @sizeOf(Property)) catch return error.LimitExceeded;
    if (bytes > max_bytes) return error.LimitExceeded;
    var result = try source.clone(a);
    errdefer result.deinit(a);
    if (result.cell_properties.len == 0) {
        const properties = try a.alloc(Property, count);
        errdefer a.free(properties);
        for (properties, 0..) |*value, i| value.* = .{ .geometry = try source.plan.cell(@intCast(i / source.plan.columns), @intCast(i % source.plan.columns)) };
        result.cell_properties = properties;
    }
    const selected = prepared.values.entries[0];
    const base = try source.plan.cell(request.address.row, request.address.column);
    result.cell_properties[index].width_changed = selected.frame.width != base.width;
    result.cell_properties[index].height_changed = selected.frame.height != base.height;
    result.cell_properties[index].geometry.width = selected.frame.width;
    result.cell_properties[index].geometry.height = selected.frame.height;
    result.cell_properties[index].appearance = selected.appearance;
    result.cell_properties[index].vertical_alignment = selected.vertical_alignment;
    result.cell_properties[index].materialized_border_fill = null;
    try result.reflowProperties();
    _ = try result.extent();
    return result;
}
