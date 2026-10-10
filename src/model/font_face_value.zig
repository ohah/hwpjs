const std = @import("std");
pub const Value = struct {
    language: @import("character_fonts.zig").Language,
    id: u32,
    name: ?[]u8,
    pub fn deinit(self: *Value, a: std.mem.Allocator) void {
        if (self.name) |name| a.free(name);
        self.* = undefined;
    }
};
pub fn deinit(a: std.mem.Allocator, rows: []Value) void {
    for (rows) |*row| row.deinit(a);
    a.free(rows);
}
