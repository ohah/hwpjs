//! New-table control fragment. Host anchor, document IDs and commit stay external.
const std = @import("std");
const Model = @import("../../model/created_table.zig").Table;
const Version = @import("../version.zig").Version;
const payloads = @import("created_table_payloads.zig");
const cells = @import("created_table_cell_records.zig");
const writer = @import("../record_writer.zig");
pub const Common = @import("../body/object_common_write.zig").Common;

pub const Options = struct { common: Common, table: payloads.Options, cell: cells.Options };
pub const Resources = struct { paragraphs: cells.Resources, border_count: usize };
pub const Limits = struct { max_cells: usize, max_bytes: usize };

fn commonPayload(a: std.mem.Allocator, table: *const Model, options: Common, limit: usize) ![]u8 {
    // Preserve the existing table admission and byte layout; the common header
    // serializer is shared with other newly created native objects.
    if (!@import("../body/object_common.zig").hasAbsoluteDimensions(options.flags)) return error.InvalidTableCreationPolicy;
    _ = try @import("../body/object_common_write.zig").descriptionUnits(options.description, limit);
    const extent = try table.extent();
    const height = extent.height;
    return @import("../body/object_common_write.zig").write(a, @import("../body/control_rules.zig").table_id, extent.width, height, table.instance_id, options, limit);
}

pub fn write(a: std.mem.Allocator, table: *const Model, version: Version, options: Options, resources: Resources, control_level: u10, limits: Limits) ![]u8 {
    try version.requireSupported();
    if (control_level == 0) return error.InvalidTableOwner;
    if (control_level > std.math.maxInt(u10) - 2) return error.LimitExceeded;
    if (table.identity == 0 or table.instance_id == 0) return error.InvalidCreatedTableIdentity;
    _ = try @import("../../model/table_creation_plan.zig").create(table.plan.rows, table.plan.columns, table.plan.width, table.plan.row_height, limits.max_cells);
    const body = try payloads.writeTable(a, table, version, options.table, limits.max_bytes);
    defer a.free(body);
    if (@import("../docinfo/reference_rules.zig").resolve(.optional_one_based, table.resources.border_fill, resources.border_count) == .invalid) return error.InvalidBorderFillReference;
    for (0..table.plan.rows) |row| for (0..table.plan.columns) |column| {
        const id = try table.cellBorderFill(@intCast(row), @intCast(column));
        if (@import("../docinfo/reference_rules.zig").resolve(.optional_one_based, id, resources.border_count) == .invalid) return error.InvalidBorderFillReference;
    };
    var ids: std.AutoHashMap(u32, void) = .init(a);
    defer ids.deinit();
    for (table.cells) |cell| {
        if (cell.paragraph_id == 0) return error.InvalidTableParagraphIds;
        if ((try ids.getOrPut(cell.paragraph_id)).found_existing) return error.InvalidTableParagraphIds;
    }
    const common = try commonPayload(a, table, options.common, limits.max_bytes);
    defer a.free(common);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try writer.append(a, &out, 71, control_level, common, limits.max_bytes);
    try writer.append(a, &out, 77, control_level + 1, body, limits.max_bytes);
    for (0..table.plan.rows) |row| for (0..table.plan.columns) |column| {
        try cells.append(a, &out, table, @intCast(row), @intCast(column), version, options.cell, resources.paragraphs, control_level + 1, limits.max_bytes);
    };
    return out.toOwnedSlice(a);
}

// Adversarial simultaneous faults prove preflight error priority, independently
// of the public table-plan validation which runs before this private helper.
test "HWP5 equation shared common retains table error precedence" {
    const a = std.testing.allocator;
    const table: Model = .{ .identity = 1, .instance_id = 2, .plan = .{ .rows = 0, .columns = 1, .width = 100, .row_height = 1 }, .resources = .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 0 }, .cells = &.{} };
    var common: Common = .{ .flags = 0x6a2211, .offset_y = 0, .offset_x = 0, .z_order = 0, .margins = @splat(0), .prevent_page_break = false, .description = "\xff" };
    try std.testing.expectError(error.InvalidObjectDescription, commonPayload(a, &table, common, 0));
    common.description = "abc";
    try std.testing.expectError(error.LimitExceeded, commonPayload(a, &table, common, 46));
    try std.testing.expectError(error.InvalidTableCreation, commonPayload(a, &table, common, 52));
}
