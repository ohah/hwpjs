const std = @import("std");
/// Structural test profile; the Unicode deliberately contains a lone surrogate.
pub fn make(a: std.mem.Allocator) ![]u8 {
    const b = try @import("tag_fixture.zig").make(a, 268, &.{
        .{ .signature = "desc".*, .offset = 156, .size = 97 },
        .{ .signature = "cprt".*, .offset = 256, .size = 10 },
    });
    b[8] = 2;
    b[12..16].* = "mntr".*;
    b[16..20].* = "RGB ".*;
    b[20..24].* = "XYZ ".*;
    const d = b[156..253];
    d[0..4].* = "desc".*;
    std.mem.writeInt(u32, d[8..12], 2, .big);
    d[12] = 'A';
    std.mem.writeInt(u32, d[14..18], 0x12345678, .big);
    std.mem.writeInt(u32, d[18..22], 2, .big);
    std.mem.writeInt(u16, d[22..24], 0xdc00, .big);
    d[96] = 0xa5;
    b[256..260].* = "text".*;
    b[264] = 'B';
    return b;
}
