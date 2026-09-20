pub const cmap_lookup: u32 = 0x0000_0001;
pub const vertical: u32 = 0x0000_0002;
pub const realized_advance: u32 = 0x0000_0004;
pub const limit_subpixel: u32 = 0x0000_0008;
pub const defined_mask: u32 = cmap_lookup | vertical | realized_advance | limit_subpixel;

pub const Options = struct {
    raw: u32,

    pub fn has(self: Options, flag: u32) bool {
        return self.raw & flag != 0;
    }
};

pub fn parse(raw: u32) !Options {
    if (raw & ~defined_mask != 0) return error.InvalidEmfPlusDriverStringOptions;
    return .{ .raw = raw };
}

test "EMF+ DriverStringOptions accepts every defined combination only" {
    const std = @import("std");
    var raw: u32 = 0;
    while (raw <= defined_mask) : (raw += 1) {
        const value = try parse(raw);
        try std.testing.expectEqual(raw, value.raw);
    }
    for ([_]u32{ 0x10, 0x8000_0000, 0xffff_fff0 }) |invalid|
        try std.testing.expectError(error.InvalidEmfPlusDriverStringOptions, parse(invalid));
    const all = try parse(defined_mask);
    try std.testing.expect(all.has(cmap_lookup));
    try std.testing.expect(all.has(realized_advance));
}
