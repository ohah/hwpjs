const std = @import("std");
const prefix = @import("type_prefix.zig");
pub const Samples = struct {
    /// Borrowed big-endian u16 samples, without the type prefix or count.
    data: []const u8,
    pub fn count(self: Samples) usize {
        return self.data.len / 2;
    }
    pub fn checkedCount(self: Samples) !usize {
        const n = self.count();
        if (self.data.len % 2 != 0 or n < 2 or n > std.math.maxInt(u32)) return error.InvalidIccCurveSamples;
        return n;
    }
    pub fn at(self: Samples, index: usize) !u16 {
        if (index >= self.count()) return error.InvalidIccCurveIndex;
        return std.mem.readInt(u16, self.data[index * 2 ..][0..2], .big);
    }
};
pub const Curve = union(enum) {
    identity,
    /// Raw u8Fixed8 exponent, not an inverse and not a normalized u16 sample.
    gamma: u16,
    samples: Samples,
};
/// Exact, unpadded curveType payload. No allocation or colour evaluation.
pub fn parse(data: []const u8) !Curve {
    const signature = try prefix.inspect(data);
    if (!std.mem.eql(u8, &signature, "curv")) return error.InvalidIccCurveType;
    if (data.len < 12) return error.InvalidIccCurveSize;
    const count = std.mem.readInt(u32, data[8..12], .big);
    const raw = data[12..];
    // Compare by division before any count multiplication (also safe on wasm32).
    if (raw.len % 2 != 0 or raw.len / 2 != count) return error.InvalidIccCurveSize;
    return switch (count) {
        0 => .identity,
        1 => .{ .gamma = std.mem.readInt(u16, raw[0..2], .big) },
        else => .{ .samples = .{ .data = raw } },
    };
}
