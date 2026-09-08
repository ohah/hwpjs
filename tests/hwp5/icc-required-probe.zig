const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 12 or (bytes.len - 12) % 4 != 0) return error.InvalidProbeInput;
    if ((bytes[0] != 2 and bytes[0] != 4) or bytes[1] > 6 or bytes[2] > 3 or bytes[3] > 2) return error.InvalidProbeInput;
    const ctx: icc.required_plan.Context = .{
        .edition = if (bytes[0] == 2) .v2_2001 else .v4_2022,
        .profile_class = @enumFromInt(bytes[1]),
        .model = @enumFromInt(bytes[2]),
        .measurement_white = @enumFromInt(bytes[3]),
        .data_space = bytes[4..8].*,
        .pcs = bytes[8..12].*,
    };
    const r = try icc.required_presence.inspect(ctx, std.mem.bytesAsSlice([4]u8, bytes[12..]));
    return @import("icc-required-output.zig").write(a, r);
}
