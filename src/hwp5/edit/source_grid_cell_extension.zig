//! Explicit row-only compatibility profile over the existing borrowed cell parser.
//! Width/marker are the shared parser's observed fields; trailing zero bytes are
//! preserved raw, not assigned invented semantics or used as layout metrics.
const std = @import("std");
const body = @import("../body/reader.zig");
const Version = @import("../version.zig").Version;
const Command = @import("../../model/table_grid_edit_plan.zig").Command;
pub fn validate(cell: body.Cell, version: Version, layout: body.list_header.Layout, command: Command) !void {
    if (cell.extra.len == 0) return;
    // These exact versions have independent original/official-producer receipts.
    // Unknown versions/fields and width-changing commands remain refused.
    if (version.raw != 0x05000300 and version.raw != 0x05010001) return error.UnsupportedSourceCellExtension;
    if (layout != .observed8 or (command != .insert_row and command != .delete_row) or cell.extra.len != 13) return error.UnsupportedSourceCellExtension;
    const value = try body.CellExtension.parse(cell.extra);
    if (value.text_width != cell.width or value.marker != 0 or value.remaining.len != 8) return error.UnsupportedSourceCellExtension;
    for (value.remaining) |byte| if (byte != 0) return error.UnsupportedSourceCellExtension;
}

test "source grid cell extension row-only raw preservation profile refuses unproved variants" {
    var raw: [39]u8 = @splat(0);
    std.mem.writeInt(u32, raw[8..12], 5720, .little);
    std.mem.writeInt(u32, raw[26..30], 5720, .little);
    const a = std.testing;
    const c = try body.Cell.parse(&raw);
    try validate(c, .{ .raw = 0x05000300 }, .observed8, .{ .insert_row = 1 });
    try validate(c, .{ .raw = 0x05010001 }, .observed8, .{ .delete_row = 1 });
    try a.expectEqualSlices(u8, raw[26..], c.extra);
    try a.expectError(error.UnsupportedSourceCellExtension, validate(c, .{ .raw = 0x05000300 }, .observed8, .{ .insert_column = 1 }));
    try a.expectError(error.UnsupportedSourceCellExtension, validate(c, .{ .raw = 0x05000301 }, .observed8, .{ .insert_row = 1 }));
    for (0..13) |i| {
        raw[26 + i] ^= 1;
        try a.expectError(error.UnsupportedSourceCellExtension, validate(try body.Cell.parse(&raw), .{ .raw = 0x05000300 }, .observed8, .{ .insert_row = 1 }));
        raw[26 + i] ^= 1;
    }
}

/// Existing Main errors remain stable; the helper owns the precise profile test.
pub fn known(cell: body.Cell, version: Version, layout: body.list_header.Layout, command: Command) !bool {
    validate(cell, version, layout, command) catch |err| return switch (err) {
        error.UnsupportedSourceCellExtension => false,
        else => err,
    };
    return true;
}
