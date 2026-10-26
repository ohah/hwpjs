//! Reconcile local image axes with a rotated object's integer display frame.
const std = @import("std");
const Corners = @import("picture_rendering_corners.zig").Corners;
pub const Frame = struct { display: [2]u32, shift: [2]f64, update: @import("picture_frame_write.zig").Update };
const Bounds = struct { min: [2]f64, max: [2]f64 };
fn bounds(corners: Corners) Bounds {
    var result: Bounds = .{ .min = corners[0], .max = corners[0] };
    for (corners[1..]) |point| for (0..2) |axis| {
        result.min[axis] = @min(result.min[axis], point[axis]);
        result.max[axis] = @max(result.max[axis], point[axis]);
    };
    return result;
}
pub fn matches(corners: Corners, display: [2]?u32) bool {
    const b = bounds(corners);
    for (0..2) |axis| {
        const size = display[axis] orelse return false;
        if (@abs(b.min[axis]) > 1 or @abs(b.max[axis] - @as(f64, @floatFromInt(size))) > 1) return false;
    }
    return true;
}
pub fn build(corners: Corners, old: [2]?u32, geometry: @import("picture_geometry_values.zig").Values, position: @import("picture_position_values.zig").Values) !Frame {
    if (geometry.treat_as_character != false) return error.UnsupportedRotatedInlinePictureResize;
    const b = bounds(corners);
    var result: Frame = undefined;
    for (0..2) |axis| {
        const raw_size = @round(b.max[axis] - b.min[axis]);
        const shift = @round(b.min[axis]);
        if (!std.math.isFinite(raw_size) or raw_size < 1 or raw_size > std.math.maxInt(u32) or !std.math.isFinite(shift)) return error.InvalidResizeAxisSize;
        result.display[axis] = @intFromFloat(raw_size);
        result.shift[axis] = shift;
        result.update.center[axis] = result.display[axis] / 2;
        const alignment = position.relations[if (axis == 0) 3 else 2] orelse return error.MissingPicturePosition;
        if (alignment > 2) return error.UnsupportedRotatedPictureResizePosition;
        const raw_offset = (if (axis == 0) geometry.horizontal_offset else geometry.vertical_offset) orelse return error.MissingPicturePosition;
        const previous = try @import("picture_frame_write.zig").signed(raw_offset);
        const old_size = old[axis] orelse return error.MissingPictureDimensionElement;
        const delta = raw_size - @as(f64, @floatFromInt(old_size));
        const factor = @as(f64, @floatFromInt(alignment)) / 2;
        const next = @round(@as(f64, @floatFromInt(previous)) + (if (alignment == 2) @as(f64, -1) else 1) * (shift + factor * delta));
        if (!std.math.isFinite(next) or next < std.math.minInt(i32) or next > std.math.maxInt(i32)) return error.InvalidPictureOffset;
        result.update.offsets[axis] = @intFromFloat(next);
    }
    return result;
}
