const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn write(a: std.mem.Allocator, result: icc.trc_inverse.Result) ![]u8 {
    return writeFor(128, a, result);
}
pub fn writeWide(a: std.mem.Allocator, result: icc.trc_inverse.Wide.Result) ![]u8 {
    return writeFor(512, a, result);
}
fn writeFor(comptime bits: u16, a: std.mem.Allocator, result: anytype) ![]u8 {
    const size = if (bits == 128) 96 else 288;
    const endpoint = if (bits == 128) @import("icc-preimage-endpoint-wire.zig").write else @import("icc-preimage-endpoint-wire.zig").writeWide;
    const nearest = if (bits == 128) @import("icc-parametric-nearest-output.zig").write else @import("icc-parametric-nearest-output.zig").writeWide;
    if (result == .selected) {
        const out = try a.alloc(u8, size);
        std.mem.writeInt(u32, out[0..4], 5, .little);
        endpoint(out[4..size], .{ .coordinate = result.selected, .attained = true });
        return out;
    }
    return nearest(a, switch (result) {
        .undecided => .undecided,
        .unattained => .unattained,
        .ambiguous => |tie| .{ .tie = tie },
        .selected => unreachable,
    });
}
