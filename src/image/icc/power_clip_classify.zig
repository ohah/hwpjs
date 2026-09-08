const types = @import("power_clip_types.zig");
const Raw = @import("power_partition.zig").Piece;
const order = @import("power_level_order.zig");
/// Kind immediately after an included rational start, or at a constant/singleton piece.
pub fn initial(comptime precision: u16, part: Raw) !?types.Kind {
    const zero = try order.at(precision, part.power, part.power.interval.start, 0);
    if (zero) |value| if (value == .lt or (value == .eq and part.direction != .increasing)) return .zero;
    const one = try order.at(precision, part.power, part.power.interval.start, 65536);
    if (one) |value| if (value == .gt or (value == .eq and part.direction != .decreasing)) return .one;
    return if (zero != null and one != null) .power else null;
}
pub fn after(level: types.Level, direction: types.Direction) types.Kind {
    return if (direction == .increasing) (if (level == .zero) .power else .one) else (if (level == .zero) .zero else .power);
}
