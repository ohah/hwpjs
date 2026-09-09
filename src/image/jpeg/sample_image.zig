const std = @import("std");
const Extent = @import("component_geometry.zig").Extent;
const Component = @import("components.zig").FrameComponent;
const Format = @import("sample_restoration.zig").Format;

pub const Descriptor = struct { component: Component, extent: Extent };
pub const Plane = struct { component: Component, extent: Extent, samples: []u16 };

/// Owned visible component samples, not RGB. Allocated samples must be filled
/// before publication; both entropy processes share this storage contract.
pub const Image = struct {
    width: u16,
    height: u16,
    precision: u8,
    planes: []Plane,

    pub fn init(a: std.mem.Allocator, width: u16, height: u16, precision: u8, descriptors: []const Descriptor, maximum: usize) !Image {
        _ = try Format.init(precision);
        if (width == 0 or height == 0) return error.InvalidJpegDimensions;
        if (descriptors.len == 0 or descriptors.len > 255) return error.InvalidJpegComponentCount;
        var total: u64 = 0;
        for (descriptors) |d| {
            if (d.extent.width == 0 or d.extent.height == 0 or d.extent.width > width or d.extent.height > height) return error.InvalidJpegSampleExtent;
            total += d.extent.samples();
        }
        if (total > maximum or total > std.math.maxInt(usize) / @sizeOf(u16)) return error.LimitExceeded;
        const planes = try a.alloc(Plane, descriptors.len);
        var initialized: usize = 0;
        errdefer {
            for (planes[0..initialized]) |p| a.free(p.samples);
            a.free(planes);
        }
        for (descriptors, planes) |d, *p| {
            p.* = .{ .component = d.component, .extent = d.extent, .samples = try a.alloc(u16, @intCast(d.extent.samples())) };
            initialized += 1;
        }
        return .{ .width = width, .height = height, .precision = precision, .planes = planes };
    }

    pub fn deinit(self: *Image, a: std.mem.Allocator) void {
        for (self.planes) |p| a.free(p.samples);
        a.free(self.planes);
        self.* = undefined;
    }
};
