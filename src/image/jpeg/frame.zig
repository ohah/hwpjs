const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const process = @import("process.zig");
const Components = @import("components.zig").FrameComponents;
pub const Options = struct { max_components: usize = 255, max_pixels: u64 = 100000000 };
pub const Frame = struct {
    process: process.Process,
    precision: u8,
    width: u16,
    height: u16,
    components: Components,
    /// Null requires later DNL validation, not an empty image.
    pub fn pixels(self: Frame) ?u64 {
        return if (self.height == 0) null else @as(u64, self.width) * self.height;
    }
};
/// Input is the marker payload, excluding the marker and two-byte length.
/// Component views borrow input; table availability and DNL are not checked here.
pub fn parse(code: u8, payload: []const u8, options: Options) !Frame {
    const p = try process.fromMarker(code);
    var r: Reader = .{ .bytes = payload };
    const precision = try r.readInt(u8);
    const height = std.mem.readInt(u16, (try r.take(2))[0..2], .big);
    const width = std.mem.readInt(u16, (try r.take(2))[0..2], .big);
    const count = try r.readInt(u8);
    if (!process.validPrecision(p.mode, precision)) return error.InvalidJpegPrecision;
    if (width == 0) return error.InvalidJpegDimensions;
    if (count == 0 or (p.mode == .progressive and count > 4)) return error.InvalidJpegComponentCount;
    if (count > options.max_components) return error.LimitExceeded;
    if (height != 0 and @as(u64, width) * height > options.max_pixels) return error.LimitExceeded;
    const components = try Components.parse(try r.take(@as(usize, count) * 3));
    if (r.offset != payload.len) return error.InvalidJpegFrameLength;
    var seen = [_]bool{false} ** 256;
    for (0..components.count()) |i| {
        const c = components.get(i).?;
        if (seen[c.id]) return error.DuplicateJpegComponent;
        seen[c.id] = true;
        if (c.horizontal() < 1 or c.horizontal() > 4 or c.vertical() < 1 or c.vertical() > 4) return error.InvalidJpegSampling;
        if (c.quantization > (if (p.mode == .lossless) @as(u8, 0) else 3)) return error.InvalidJpegQuantizationSelector;
    }
    return .{ .process = p, .precision = precision, .width = width, .height = height, .components = components };
}
