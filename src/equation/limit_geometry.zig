//! Measured limit labels and centered conditions; no text/source rewriting.
const m = @import("layout_metrics.zig");
pub const Parameters = struct { gap: f64 };
pub const Result = @import("script_geometry.zig").Result;
pub fn resolve(name: []const u8) bool {
    const command = @import("commands.zig").lookup(name) orelse return false;
    return command.family == .lower_limit or command.family == .upper_limit;
}
pub fn place(base: m.Box, sub: ?m.Box, sup: ?m.Box, p: Parameters, limits: m.Limits) !Result {
    try m.validate(base, limits);
    if (sub) |value| try m.validate(value, limits);
    if (sup) |value| try m.validate(value, limits);
    try m.dimension(p.gap, limits);
    const width = @max(base.width, @max(if (sub) |v| v.width else 0, if (sup) |v| v.width else 0));
    const base_position: m.Placement = .{ .box = base, .x = (width - base.width) / 2, .baseline = 0 };
    const sub_position: ?m.Placement = if (sub) |value| .{ .box = value, .x = (width - value.width) / 2, .baseline = base.descent + p.gap + value.ascent } else null;
    const sup_position: ?m.Placement = if (sup) |value| .{ .box = value, .x = (width - value.width) / 2, .baseline = -base.ascent - p.gap - value.descent } else null;
    var positions: [3]m.Placement = undefined;
    positions[0] = base_position;
    var count: usize = 1;
    if (sub_position) |position| {
        positions[count] = position;
        count += 1;
    }
    if (sup_position) |position| {
        positions[count] = position;
        count += 1;
    }
    var enclosed_width = width;
    for (positions[0..count]) |position| enclosed_width = @max(enclosed_width, position.x + position.box.width);
    return .{ .box = try m.envelope(enclosed_width, positions[0..count], limits), .base = base_position, .sub = sub_position, .sup = sup_position };
}
