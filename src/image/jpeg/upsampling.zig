const Axis = @import("sample_axis.zig").Axis;
const interpolation = @import("sample_interpolation.zig");

pub const Method = enum { nearest, bilinear };

/// Borrowed, immutable visible component samples. This is dimension-ratio
/// centered reconstruction, not implicit JPEG sampling-factor reconstruction.
pub const Sampler = struct {
    samples: []const u16,
    horizontal: Axis,
    vertical: Axis,
    method: Method,

    pub fn fromDimensions(samples: []const u16, width: u16, height: u16, reference_width: u16, reference_height: u16, method: Method) !Sampler {
        const horizontal = try Axis.fromDimensions(reference_width, width);
        const vertical = try Axis.fromDimensions(reference_height, height);
        if (@as(u64, width) * height != samples.len) return error.InvalidJpegSamplePlaneLength;
        return .{ .samples = samples, .horizontal = horizontal, .vertical = vertical, .method = method };
    }

    pub fn sample(self: Sampler, x: u32, y: u32) ?u16 {
        const horizontal = self.horizontal.at(x) orelse return null;
        const vertical = self.vertical.at(y) orelse return null;
        if (self.method == .nearest) return self.get(horizontal.nearest(), vertical.nearest());
        return interpolation.bilinear(self.get(horizontal.lower, vertical.lower), self.get(horizontal.upper, vertical.lower), self.get(horizontal.lower, vertical.upper), self.get(horizontal.upper, vertical.upper), horizontal, vertical);
    }

    fn get(self: Sampler, x: u16, y: u16) u16 {
        return self.samples[@as(usize, y) * self.horizontal.source + x];
    }
};
