const rules = @import("../docinfo/reference_rules.zig");
pub const Policy = enum { uninspected, observed_ordinal };
pub const Report = struct {
    ordinal_references: usize = 0,
    zero_ids: usize = 0,
    unselected_references: usize = 0,
    unavailable_counts: usize = 0,

    /// True means ordinal bounds checked, not storage/content resolution.
    /// ID zero is observed but its absence/error semantics are unproven.
    pub fn observe(self: *Report, id: u16, count: ?usize, policy: Policy) !bool {
        if (policy == .uninspected) {
            self.zero_ids += @intFromBool(id == 0);
            self.unselected_references += 1;
            return false;
        }
        if (id == 0) {
            self.zero_ids += 1;
            return false;
        }
        const available = count orelse {
            self.unavailable_counts += 1;
            return false;
        };
        switch (rules.resolve(.one_based, id, available)) {
            .ordinal => {
                self.ordinal_references += 1;
                return true;
            },
            .invalid => return error.InvalidOleBinaryReference,
            .absent => unreachable,
        }
    }
};
