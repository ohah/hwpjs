const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn write(a: std.mem.Allocator, result: icc.trc_inverse.Result) ![]u8 {
    if (result == .selected) {
        const out = try a.alloc(u8, 96);
        std.mem.writeInt(u32, out[0..4], 5, .little);
        @import("icc-preimage-endpoint-wire.zig").write(out[4..96], .{ .coordinate = result.selected, .attained = true });
        return out;
    }
    return @import("icc-parametric-nearest-output.zig").write(a, switch (result) {
        .undecided => .undecided,
        .unattained => .unattained,
        .ambiguous => |tie| .{ .tie = tie },
        .selected => unreachable,
    });
}
