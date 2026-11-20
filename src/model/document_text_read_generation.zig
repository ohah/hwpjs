//! Native read-observation authority. Never store this inside a restorable Session/checkpoint.
const std = @import("std");
pub const State = struct {
    value: u64 = 0,
    revoked: bool = false,
    pub fn current(self: *const State) !u64 {
        if (self.revoked) return error.DocumentTextReadGenerationExhausted;
        return self.value;
    }
    /// Call before the first possible mutation. Failure/rollback never undoes this transition.
    pub fn enterMutation(self: *State) !void {
        _ = try self.current();
        if (self.value == std.math.maxInt(u64)) {
            self.revoked = true;
            return error.DocumentTextReadGenerationExhausted;
        }
        self.value += 1;
    }
    /// Close remains permitted after exhaustion; revocation cannot restore an earlier token.
    pub fn invalidate(self: *State) void {
        self.enterMutation() catch {};
    }
    pub fn assertCurrent(self: *const State, observed: u64) !void {
        if (observed != try self.current()) return error.StaleDocumentTextReadBinding;
    }
};
