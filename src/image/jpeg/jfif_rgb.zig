const std = @import("std");
const planes = @import("sample_planes.zig");
const render = @import("jfif_render.zig");
const upsampling = @import("upsampling.zig");

pub const Options = struct {
    planes: planes.Options = .{},
    upsampling: upsampling.Method,
    /// Mandatory acknowledgement: this is not display-ready sRGB output.
    colour_management: render.ColourManagement,
    max_rgb_bytes: usize = render.default_rgb_bytes,
    max_adobe_markers: usize = render.default_adobe_markers,
    max_icc_bytes: usize = render.default_icc_bytes,
};
pub const Image = render.Image;

/// An explicit JFIF interpretation. Unsupported progressive entropy remains
/// an error; no preview/thumbnail substitution or generic JPEG colour guessing.
pub fn decode(a: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    var prepared = try render.Prepared.init(a, bytes, options.planes.frame.structure, .{ .upsampling = options.upsampling, .colour_management = options.colour_management, .max_rgb_bytes = options.max_rgb_bytes, .max_adobe_markers = options.max_adobe_markers, .max_icc_bytes = options.max_icc_bytes });
    defer prepared.deinit(a);
    var samples = try planes.decode(a, bytes, options.planes);
    defer samples.deinit(a);
    return prepared.render(a, samples);
}
