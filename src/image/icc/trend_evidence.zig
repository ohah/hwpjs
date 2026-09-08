const std = @import("std");
const Direction = @import("curve_direction.zig").Direction;
pub const Trend = enum(u32) { constant, nondecreasing, nonincreasing, nonmonotonic, undecided };
/// Evidence of actual variation, not derivatives before clipping or strictness.
pub const Evidence = struct {
    increasing: bool = false,
    decreasing: bool = false,
    unknown: bool = false,
    pub fn add(self: *Evidence, direction: Direction) void {
        switch (direction) {
            .constant => {},
            .increasing => self.increasing = true,
            .decreasing => self.decreasing = true,
        }
    }
    pub fn jump(self: *Evidence, order: ?std.math.Order) void {
        self.add(if (order) |o| switch (o) {
            .lt => .decreasing,
            .eq => .constant,
            .gt => .increasing,
        } else {
            self.unknown = true;
            return;
        });
    }
    pub fn finish(self: Evidence) Trend {
        if (self.increasing and self.decreasing) return .nonmonotonic;
        if (self.unknown) return .undecided;
        if (self.increasing) return .nondecreasing;
        if (self.decreasing) return .nonincreasing;
        return .constant;
    }
};
