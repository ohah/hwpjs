//! Common size/position/flow framing; callers own shape eligibility.
const std = @import("std");
pub fn encode(a: std.mem.Allocator, geometry: @import("../hwpx/picture_geometry_values.zig").Values, position: @import("../hwpx/picture_position_values.zig").Values, flow: @import("../hwpx/picture_flow_values.zig").Values) ![]u8 {
    const g = try @import("hwpx_picture_geometry_wire.zig").encode(a, geometry);
    defer a.free(g);
    const p = try @import("hwpx_picture_position_wire.zig").encode(a, position);
    defer a.free(p);
    const f = try @import("hwpx_picture_flow_wire.zig").encode(a, flow);
    defer a.free(f);
    return std.mem.concat(a, u8, &.{ g, p, f });
}
