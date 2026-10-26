//! New-table control fragment. Host anchor, document IDs and commit stay external.
const std = @import("std");
const Model = @import("../../model/created_table.zig").Table;
const Version = @import("../version.zig").Version;
const payloads = @import("created_table_payloads.zig");
const cells = @import("created_table_cell_records.zig");
const writer = @import("../record_writer.zig");
pub const Common = struct {
    flags: u32,
    offset_y: i32,
    offset_x: i32,
    z_order: i32,
    margins: [4]i16,
    prevent_page_break: bool,
    description: []const u8,
};
pub const Options = struct { common: Common, table: payloads.Options, cell: cells.Options };
pub const Resources = struct { paragraphs: cells.Resources, border_count: usize };
pub const Limits = struct { max_cells: usize, max_bytes: usize };

fn commonPayload(a: std.mem.Allocator, table: *const Model, options: Common, limit: usize) ![]u8 {
    // The shared creation plan supplies absolute dimensions, not relative ratios.
    if (!@import("../body/object_common.zig").hasAbsoluteDimensions(options.flags)) return error.InvalidTableCreationPolicy;
    const count = std.unicode.calcUtf16LeLen(options.description) catch return error.InvalidObjectDescription;
    if (count > 65535) return error.LimitExceeded;
    const length = 46 + count * 2;
    if (length > limit) return error.LimitExceeded;
    const height = try table.plan.height();
    const description = try std.unicode.utf8ToUtf16LeAlloc(a, options.description);
    defer a.free(description);
    const bytes = try a.alloc(u8, length);
    var offset: usize = 0;
    put(u32, bytes, &offset, @import("../body/control_rules.zig").table_id);
    put(u32, bytes, &offset, options.flags);
    put(i32, bytes, &offset, options.offset_y);
    put(i32, bytes, &offset, options.offset_x);
    put(u32, bytes, &offset, table.plan.width);
    put(u32, bytes, &offset, height);
    put(i32, bytes, &offset, options.z_order);
    for (options.margins) |margin| put(i16, bytes, &offset, margin);
    put(u32, bytes, &offset, table.instance_id);
    put(i32, bytes, &offset, @intFromBool(options.prevent_page_break));
    put(u16, bytes, &offset, @intCast(count));
    @memcpy(bytes[offset..], std.mem.sliceAsBytes(description));
    return bytes;
}

fn put(comptime T: type, bytes: []u8, offset: *usize, value: T) void {
    std.mem.writeInt(T, bytes[offset.*..][0..@sizeOf(T)], value, .little);
    offset.* += @sizeOf(T);
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
