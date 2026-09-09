const Frame = @import("frame.zig").Frame;

pub const Extent = struct {
    width: u32,
    height: u32,

    pub fn samples(self: Extent) u64 {
        return @as(u64, self.width) * self.height;
    }

    pub fn blocks(self: Extent) Extent {
        return .{ .width = ceil(self.width, 8), .height = ceil(self.height, 8) };
    }

    /// Visible part of a decoded 8x8 block; null is a wholly padded block.
    /// Check block coordinates before multiplying, including hostile u32 input.
    pub fn clip(self: Extent, x: u32, y: u32) ?Extent {
        const grid = self.blocks();
        if (x >= grid.width or y >= grid.height) return null;
        return .{ .width = @min(8, self.width - x * 8), .height = @min(8, self.height - y * 8) };
    }
};

/// T.81 A.1.1 dimensions for a parsed, immutable frame and resolved DNL height.
/// Borrowed component metadata must remain alive. No allocation or colour model.
pub const Geometry = struct {
    frame: Frame,
    height: u16,
    horizontal: u32,
    vertical: u32,

    pub fn init(frame: Frame, height: u16) !Geometry {
        if (frame.process.mode == .lossless) return error.UnsupportedJpegDctLayout;
        if (height == 0) return error.MissingJpegDnl;
        var horizontal: u32 = 0;
        var vertical: u32 = 0;
        for (0..frame.components.count()) |i| {
            const c = frame.components.get(i).?;
            horizontal = @max(horizontal, c.horizontal());
            vertical = @max(vertical, c.vertical());
        }
        return .{ .frame = frame, .height = height, .horizontal = horizontal, .vertical = vertical };
    }

    pub fn component(self: Geometry, index: usize) ?Extent {
        const c = self.frame.components.get(index) orelse return null;
        return .{
            .width = ceil(@as(u32, self.frame.width) * c.horizontal(), self.horizontal),
            .height = ceil(@as(u32, self.height) * c.vertical(), self.vertical),
        };
    }

    pub fn interleaved(self: Geometry) Extent {
        return .{ .width = ceil(self.frame.width, 8 * self.horizontal), .height = ceil(self.height, 8 * self.vertical) };
    }
};

fn ceil(n: u32, d: u32) u32 {
    return n / d + @intFromBool(n % d != 0);
}
