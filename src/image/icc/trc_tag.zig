const std = @import("std");
const prefix = @import("type_prefix.zig");
pub const Edition = @import("edition.zig").Edition;
pub const Channel = enum { red, green, blue, gray };
pub const Curve = union(enum) {
    curve_type: @import("curve_type.zig").Curve,
    parametric: @import("parametric_curve.zig").Curve,
};
pub const Parsed = struct {
    channel: Channel,
    curve: Curve,
    /// Parsing and permitted-type checking do not prove the computational model.
    semantics_deferred: bool = true,
};
/// null means unhandled. Header/edition agreement and profile model are caller concerns.
pub fn parse(signature: [4]u8, data: []const u8, edition: Edition) !?Parsed {
    const names = [_][4]u8{ "rTRC".*, "gTRC".*, "bTRC".*, "kTRC".* };
    for (names, 0..) |name, i| {
        if (!std.mem.eql(u8, &signature, &name)) continue;
        const kind = try prefix.inspect(data);
        const curve: Curve = if (std.mem.eql(u8, &kind, "curv"))
            .{ .curve_type = try @import("curve_type.zig").parse(data) }
        else if (edition == .v4_2022 and std.mem.eql(u8, &kind, "para"))
            .{ .parametric = try @import("parametric_curve.zig").parse(data) }
        else
            return error.InvalidIccTrcType;
        return .{ .channel = @enumFromInt(i), .curve = curve };
    }
    return null;
}
