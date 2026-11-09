//! Fixed optional ABI input; numeric actions derive from the JS ABI schema.
const grid = @import("../model/created_table_grid.zig");
const Action = @import("abi_schema.zig").CreatedTableGridAction;
pub fn identity(low: u32, high: u32) !u64 {
    const value = @as(u64, low) | (@as(u64, high) << 32);
    if (value == 0) return error.InvalidCreatedTableIdentity;
    return value;
}
pub fn decode(action: u32, index: u32) !grid.Command {
    return switch (@as(Action, @fromBackingInt(@intCast(action)))) {
        .insert_row => .{ .insert_row = index },
        .delete_row => .{ .delete_row = index },
        .insert_column => .{ .insert_column = index },
        .delete_column => .{ .delete_column = index },
        else => error.InvalidCreatedTableGridAction,
    };
}
