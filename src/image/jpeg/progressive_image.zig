const std = @import("std");
const Frame = @import("frame.zig").Frame;
const Component = @import("components.zig").FrameComponent;
const Extent = @import("component_geometry.zig").Extent;
const storage = @import("coefficient_storage.zig");
const Snapshot = @import("quantization_snapshot.zig").Snapshot;
const progression = @import("progression.zig");
const Report = @import("progressive.zig").Report;

/// A caller policy, not a claim that T.81 requires every band to reach Al=0.
pub const Completion = enum { preserve_partial, require_full };
pub const Plane = struct {
    component: Component,
    /// Visible component sample extent, distinct from the padded block grid.
    visible: Extent,
    grid: storage.Grid,
    quantization: ?Snapshot = null,
    levels: [64]u8 = @splat(progression.unseen),
};

/// Owned quantized coefficients, not sample planes or RGB pixels. A zero in
/// an unseen band is an initialized placeholder, not a decoded zero value.
/// No input JPEG/table slice survives decode().
pub const Image = struct {
    width: u16,
    height: u16,
    precision: u8,
    planes: []Plane,
    stored_blocks: usize,
    block_visits: usize = 0,
    restarts: usize = 0,
    trailing_bytes: usize = 0,
    progression: Report = .{ .scans = 0, .unseen_coefficients = 0, .partial_coefficients = 0, .full_coefficients = 0 },

    pub fn init(a: std.mem.Allocator, frame: Frame, height: u16, options: storage.Options) !Image {
        const layout = try storage.Layout.init(frame, height, options);
        const planes = try a.alloc(Plane, layout.count);
        var initialized: usize = 0;
        errdefer {
            for (planes[0..initialized]) |*plane| plane.grid.deinit(a);
            a.free(planes);
        }
        for (planes, 0..) |*plane, i| {
            plane.* = .{ .component = frame.components.get(i).?, .visible = layout.visible[i], .grid = try storage.Grid.init(a, layout.storage[i]) };
            initialized += 1;
        }
        return .{ .width = frame.width, .height = height, .precision = frame.precision, .planes = planes, .stored_blocks = layout.blocks };
    }

    pub fn checkCompletion(self: *const Image, policy: Completion) !void {
        if (policy == .preserve_partial) return;
        for (self.planes) |plane| for (plane.levels) |level| {
            if (level != 0) return error.IncompleteJpegProgressiveCoefficients;
        };
    }

    pub fn deinit(self: *Image, a: std.mem.Allocator) void {
        for (self.planes) |*plane| plane.grid.deinit(a);
        a.free(self.planes);
        self.* = undefined;
    }
};
