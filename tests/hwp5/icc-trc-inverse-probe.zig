const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, edition: icc.trc_tag.Edition) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 40) return error.InvalidProbeInput;
    const parsed = (try icc.trc_tag.parse(bytes[36..40].*, bytes[40..], edition)) orelse return error.UnhandledIccTrc;
    const target = icc.trc_inverse.Target{ .numerator = std.mem.readInt(u128, bytes[4..20], .big), .denominator = std.mem.readInt(u128, bytes[20..36], .big) };
    const result = switch (std.mem.readInt(u32, bytes[0..4], .big)) {
        128 => try icc.trc_inverse.select(128, parsed.curve, target),
        256 => try icc.trc_inverse.select(256, parsed.curve, target),
        512 => try icc.trc_inverse.select(512, parsed.curve, target),
        1024 => try icc.trc_inverse.select(1024, parsed.curve, target),
        else => return error.InvalidIccComparisonPrecision,
    };
    const payload = if (result == .selected) selected: {
        const out = try a.alloc(u8, 96);
        std.mem.writeInt(u32, out[0..4], 5, .little);
        @import("icc-preimage-endpoint-wire.zig").write(out[4..96], .{ .coordinate = result.selected, .attained = true });
        break :selected out;
    } else try @import("icc-parametric-nearest-output.zig").write(a, switch (result) {
        .undecided => .undecided,
        .unattained => .unattained,
        .ambiguous => |tie| .{ .tie = tie },
        .selected => unreachable,
    });
    defer a.free(payload);
    const out = try a.alloc(u8, 8 + payload.len);
    std.mem.writeInt(u32, out[0..4], @intFromEnum(parsed.channel), .little);
    std.mem.writeInt(u32, out[4..8], @intFromBool(parsed.semantics_deferred), .little);
    @memcpy(out[8..], payload);
    return out;
}
