const std = @import("std");
const Boundary = @import("hwpjs").image.icc.power_clip.types.Boundary;
pub fn write(out: *[32]u8, value: Boundary) void {
    @memset(out, 0);
    switch (value) {
        .rational => |x| {
            std.mem.writeInt(u64, out[4..12], x.numerator, .little);
            std.mem.writeInt(u64, out[12..20], x.denominator, .little);
        },
        .level_root => |r| {
            std.mem.writeInt(u32, out[0..4], 1, .little);
            std.mem.writeInt(u32, out[4..8], @intFromEnum(r.level), .little);
            @import("icc-power-root-wire.zig").write(out[8..28], r.value);
        },
    }
}
