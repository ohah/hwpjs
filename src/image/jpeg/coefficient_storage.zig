const std = @import("std");
const Frame = @import("frame.zig").Frame;
const geometry = @import("component_geometry.zig");
pub const Values = [64]i32;
pub const Options = struct { max_blocks: usize = 1000000, max_bytes: usize = 256 * 1024 * 1024 };

/// Preflight all component grids before allocating any coefficient buffer.
/// Padded component grids cover every possible interleaved MCU slot, including
/// padding never transmitted by single-component scans. Budgets count storage,
/// not repeated visits across progressive scans or visible image pixels.
pub const Layout = struct {
    storage: [4]geometry.Extent,
    visible: [4]geometry.Extent,
    count: usize,
    blocks: usize,

    pub fn init(frame: Frame, height: u16, options: Options) !Layout {
        if (frame.components.count() > 4) return error.UnsupportedJpegCoefficientStorage;
        const g = try geometry.Geometry.init(frame, height);
        const mcus = g.interleaved();
        var result: Layout = .{ .storage = undefined, .visible = undefined, .count = frame.components.count(), .blocks = 0 };
        var total: u64 = 0;
        for (0..result.count) |i| {
            const c = frame.components.get(i).?;
            result.storage[i] = .{ .width = mcus.width * c.horizontal(), .height = mcus.height * c.vertical() };
            result.visible[i] = g.component(i).?;
            total += result.storage[i].samples();
        }
        if (total > options.max_blocks or total > options.max_bytes / @sizeOf(Values) or total > std.math.maxInt(usize) / @sizeOf(Values)) return error.LimitExceeded;
        result.blocks = @intCast(total);
        return result;
    }
};

pub const Grid = struct {
    /// Block dimensions, unlike the sample dimensions of Layout.visible.
    extent: geometry.Extent,
    values: []Values,

    /// Extent must come from a successfully preflighted Layout.
    pub fn init(a: std.mem.Allocator, extent: geometry.Extent) !Grid {
        const values = try a.alloc(Values, @intCast(extent.samples()));
        @memset(values, @as(Values, @splat(0)));
        return .{ .extent = extent, .values = values };
    }

    pub fn at(self: *Grid, x: u32, y: u32) ?*Values {
        return &self.values[self.index(x, y) orelse return null];
    }

    pub fn atConst(self: *const Grid, x: u32, y: u32) ?*const Values {
        return &self.values[self.index(x, y) orelse return null];
    }

    fn index(self: *const Grid, x: u32, y: u32) ?usize {
        if (x >= self.extent.width or y >= self.extent.height) return null;
        return @as(usize, y) * self.extent.width + x;
    }

    pub fn deinit(self: *Grid, a: std.mem.Allocator) void {
        a.free(self.values);
        self.* = undefined;
    }
};
