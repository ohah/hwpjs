const m = @import("layout_metrics.zig");
pub const Parameters = struct { padding: f64, gap: f64, rule_thickness: f64, axis: f64 };
pub const Rule = struct { x: f64, y: f64, width: f64, thickness: f64 };
pub const Result = struct { box: m.Box, numerator: m.Placement, denominator: m.Placement, rule: ?Rule };
pub fn place(numerator: m.Box, denominator: m.Box, p: Parameters, draw_rule: bool, limits: m.Limits) !Result {
    try m.validate(numerator, limits);
    try m.validate(denominator, limits);
    for ([_]f64{ p.padding, p.gap, p.rule_thickness, p.axis }) |value| try m.dimension(value, limits);
    const thickness = if (draw_rule) p.rule_thickness else 0;
    const inner_width = @max(numerator.width, denominator.width);
    const width = inner_width + p.padding * 2;
    try m.dimension(width, limits);
    const top: m.Placement = .{ .box = numerator, .x = (width - numerator.width) / 2, .baseline = -p.axis - thickness / 2 - p.gap - numerator.descent };
    const bottom: m.Placement = .{ .box = denominator, .x = (width - denominator.width) / 2, .baseline = -p.axis + thickness / 2 + p.gap + denominator.ascent };
    var box = try m.envelope(width, &.{ top, bottom }, limits);
    var rule: ?Rule = null;
    if (draw_rule) {
        rule = .{ .x = p.padding, .y = -p.axis, .width = inner_width, .thickness = thickness };
        box.ascent = @max(box.ascent, p.axis + thickness / 2);
        box.descent = @max(box.descent, thickness / 2 - p.axis);
        try m.validate(box, limits);
    }
    return .{ .box = box, .numerator = top, .denominator = bottom, .rule = rule };
}
