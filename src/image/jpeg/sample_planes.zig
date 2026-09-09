const std = @import("std");
const sequential = @import("sequential_frame.zig");
const geometry = @import("component_geometry.zig");
const storage = @import("sample_image.zig");
const sample_block = @import("sample_block.zig");
const Format = @import("sample_restoration.zig").Format;

pub const Options = struct {
    frame: sequential.Options = .{},
    /// Sum of visible samples over all components, not full-image pixels.
    max_samples: usize = 64000000,
};

pub const Plane = storage.Plane;
pub const Image = storage.Image;

/// Only return after final EOI/coverage/padding validation. On any error all
/// owned allocations are released. No borrowed input survives a successful call.
pub fn decode(allocator: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    var decoder = try sequential.Decoder.init(bytes, options.frame);
    var pending = try decoder.next();
    const frame = (decoder.coverage orelse return error.MissingJpegFrame).frame;
    const layout = try geometry.Geometry.init(frame, decoder.boundaries.effective_height);
    const format = try Format.init(frame.precision);
    var descriptors: [255]storage.Descriptor = undefined;
    for (0..frame.components.count()) |i| descriptors[i] = .{ .component = frame.components.get(i).?, .extent = layout.component(i).? };
    var image = try Image.init(allocator, frame.width, layout.height, frame.precision, descriptors[0..frame.components.count()], options.max_samples);
    errdefer image.deinit(allocator);
    while (pending) |packet| : (pending = try decoder.next()) {
        const block = packet.coefficients;
        try sample_block.write(&image.planes[block.frame_component], format, block.values, packet.quantization, block.x, block.y);
    }
    return image;
}
