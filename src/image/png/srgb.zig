const gamma = @import("gamma.zig");
const chromaticities = @import("chromaticities.zig");
pub const Intent = enum(u8) { perceptual, relative_colorimetric, saturation, absolute_colorimetric };
pub const canonical_gamma: gamma.Value = .{ .scaled = 45455 };
pub const canonical_chromaticities: chromaticities.Value = .{
    .white = .{ .x = 31270, .y = 32900 },
    .red = .{ .x = 64000, .y = 33000 },
    .green = .{ .x = 30000, .y = 60000 },
    .blue = .{ .x = 15000, .y = 6000 },
};
pub fn parse(bytes: []const u8) !Intent {
    if (bytes.len != 1) return error.InvalidPngSrgbSize;
    if (bytes[0] > 3) return error.InvalidPngSrgbIntent;
    return @enumFromInt(bytes[0]);
}
/// Encoder field consistency only. Does not select a profile or transform pixels.
/// Missing accompanying chunks remain absent; recommendations are not requirements.
pub fn validate(g: ?gamma.Value, c: ?chromaticities.Value) !void {
    if (g) |value| if (value.scaled != canonical_gamma.scaled) return error.InvalidPngSrgbGamma;
    if (c) |value| {
        const expected = canonical_chromaticities;
        for ([_]chromaticities.Point{ value.white, value.red, value.green, value.blue }, [_]chromaticities.Point{ expected.white, expected.red, expected.green, expected.blue }) |actual, canonical| {
            if (actual.x != canonical.x or actual.y != canonical.y) return error.InvalidPngSrgbChromaticities;
        }
    }
}
