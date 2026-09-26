const std = @import("std");
const pixels = @import("pixels.zig");
const raster = @import("rgba_raster.zig");
const structure = @import("structure.zig");

pub const Options = struct {
    pixels: pixels.Options = .{},
    max_rgba_bytes: usize = 256 * 1024 * 1024,
};
pub const Image = struct {
    report: pixels.Report,
    raster: raster.Raster,

    pub fn deinit(self: *Image, a: std.mem.Allocator) void {
        self.raster.deinit(a);
        self.* = undefined;
    }
};

pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    const envelope = try structure.inspect(bytes, options.pixels.structure);
    _ = try raster.requiredBytes(envelope.header.width, envelope.header.height, options.max_rgba_bytes);
    var reconstructed = try pixels.decode(a, bytes, options.pixels);
    defer reconstructed.deinit(a);
    return .{
        .report = reconstructed.report,
        .raster = try raster.fromDecoded(a, &reconstructed, options.max_rgba_bytes),
    };
}
