const m = @import("layout_metrics.zig");
pub const Parameters = struct { gap: f64, superscript_shift: f64, subscript_shift: f64, clearance: f64 };
pub const Side = enum { left, right };
pub const Result = struct { box: m.Box, base: m.Placement, sub: ?m.Placement, sup: ?m.Placement };
pub fn place(base: m.Box, sub: ?m.Box, sup: ?m.Box, side: Side, p: Parameters, limits: m.Limits) !Result {
    try m.validate(base, limits);
    if (sub) |value| try m.validate(value, limits);
    if (sup) |value| try m.validate(value, limits);
    for ([_]f64{ p.gap, p.superscript_shift, p.subscript_shift, p.clearance }) |value| try m.dimension(value, limits);
    if (sub == null and sup == null) return .{ .box = base, .base = .{ .box = base, .x = 0, .baseline = 0 }, .sub = null, .sup = null };
    const script_width = @max(if (sub) |value| value.width else 0, if (sup) |value| value.width else 0);
    // Both mirror placements share one enclosing width, including the last
    // rounding bit of either non-associative floating-point addition order.
    const width = @max((base.width + p.gap) + script_width, (script_width + p.gap) + base.width);
    try m.dimension(width, limits);
    var sub_y = p.subscript_shift;
    var sup_y = -p.superscript_shift;
    if (sub != null and sup != null) {
        const clearance = (sub_y - sub.?.ascent) - (sup_y + sup.?.descent);
        const correction = @max(@as(f64, 0), p.clearance - clearance) / 2;
        sub_y += correction;
        sup_y -= correction;
    }
    const base_position: m.Placement = .{ .box = base, .x = if (side == .left) script_width + p.gap else 0, .baseline = 0 };
    var positions: [3]m.Placement = undefined;
    positions[0] = base_position;
    var count: usize = 1;
    const sub_position: ?m.Placement = if (sub) |value| .{ .box = value, .x = if (side == .left) script_width - value.width else base.width + p.gap, .baseline = sub_y } else null;
    const sup_position: ?m.Placement = if (sup) |value| .{ .box = value, .x = if (side == .left) script_width - value.width else base.width + p.gap, .baseline = sup_y } else null;
    if (sub_position) |position| {
        positions[count] = position;
        count += 1;
    }
    if (sup_position) |position| {
        positions[count] = position;
        count += 1;
    }
    return .{ .box = try m.envelope(width, positions[0..count], limits), .base = base_position, .sub = sub_position, .sup = sup_position };
}
