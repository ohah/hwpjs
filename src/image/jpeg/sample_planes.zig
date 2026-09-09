const std = @import("std");
const sequential = @import("sequential_frame.zig");
const geometry = @import("component_geometry.zig");
const dequantization = @import("dequantization.zig");
const idct = @import("idct.zig");
const Format = @import("sample_restoration.zig").Format;
const Component = @import("components.zig").FrameComponent;

pub const Options = struct {
    frame: sequential.Options = .{},
    /// Sum of visible samples over all components, not full-image pixels.
    max_samples: usize = 64000000,
};

pub const Plane = struct {
    component: Component,
    extent: geometry.Extent,
    samples: []u16,
};

/// Owned row-major component planes, in frame declaration order. These are
/// not RGB pixels: no upsampling, colour conversion, or APP interpretation.
pub const Image = struct {
    width: u16,
    height: u16,
    precision: u8,
    planes: []Plane,

    pub fn deinit(self: *Image, allocator: std.mem.Allocator) void {
        for (self.planes) |plane| allocator.free(plane.samples);
        allocator.free(self.planes);
        self.* = undefined;
    }
};

/// Only return after final EOI/coverage/padding validation. On any error all
/// owned allocations are released. No borrowed input survives a successful call.
pub fn decode(allocator: std.mem.Allocator, bytes: []const u8, options: Options) !Image {
    var decoder = try sequential.Decoder.init(bytes, options.frame);
    var pending = try decoder.next();
    const frame = (decoder.coverage orelse return error.MissingJpegFrame).frame;
    const layout = try geometry.Geometry.init(frame, decoder.boundaries.effective_height);
    const format = try Format.init(frame.precision);
    var total: u64 = 0;
    for (0..frame.components.count()) |i| total += layout.component(i).?.samples();
    if (total > options.max_samples or total > std.math.maxInt(usize) / @sizeOf(u16)) return error.LimitExceeded;

    const planes = try allocator.alloc(Plane, frame.components.count());
    var initialized: usize = 0;
    errdefer {
        for (planes[0..initialized]) |plane| allocator.free(plane.samples);
        allocator.free(planes);
    }
    for (planes, 0..) |*plane, i| {
        const extent = layout.component(i).?;
        plane.* = .{ .component = frame.components.get(i).?, .extent = extent, .samples = try allocator.alloc(u16, @intCast(extent.samples())) };
        initialized += 1;
    }
    while (pending) |packet| : (pending = try decoder.next()) {
        const block = packet.coefficients;
        const plane = &planes[block.frame_component];
        const visible = plane.extent.clip(block.x, block.y) orelse continue;
        const samples = try format.block(idct.transform(dequantization.block(block.values, packet.quantization)));
        for (0..visible.height) |y| {
            const target = (@as(usize, block.y) * 8 + y) * plane.extent.width + @as(usize, block.x) * 8;
            @memcpy(plane.samples[target..][0..visible.width], samples[y * 8 ..][0..visible.width]);
        }
    }
    return .{ .width = frame.width, .height = layout.height, .precision = frame.precision, .planes = planes };
}
