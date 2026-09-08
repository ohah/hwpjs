const std = @import("std");
const distance = @import("ordinate_distance.zig");
const types = @import("nearest_ordinate_types.zig");

pub const Accumulator = struct {
    target: distance.Target,
    best: ?@import("fraction.zig").WideFraction = null,
    nearest: types.Nearest = .{},
    /// Internal: caller validates target and all candidate values before use.
    pub fn add(self: *Accumulator, candidate: types.Candidate) !void {
        if (self.best) |best| {
            switch (try distance.compare(self.target, candidate.value, best)) {
                .gt => return,
                .lt => {
                    self.best = candidate.value;
                    self.nearest.count = 0;
                },
                .eq => {},
            }
        } else self.best = candidate.value;
        // A closer unattained boundary still disqualifies farther actual values.
        if (!candidate.attained) return;
        for (self.nearest.values[0..self.nearest.count]) |value| {
            if (try value.order(candidate.value) == .eq) return;
        }
        std.debug.assert(self.nearest.count < 2);
        self.nearest.values[self.nearest.count] = candidate.value;
        self.nearest.count += 1;
        if (self.nearest.count == 2 and try self.nearest.values[0].order(self.nearest.values[1]) == .gt) std.mem.swap(@import("fraction.zig").WideFraction, &self.nearest.values[0], &self.nearest.values[1]);
    }
    pub fn finish(self: Accumulator) types.Result {
        if (self.best == null) return .empty;
        if (self.nearest.count == 0) return .unattained;
        return .{ .nearest = self.nearest };
    }
};
