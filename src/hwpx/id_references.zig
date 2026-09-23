const std = @import("std");
const header_resources = @import("header_resources.zig");

pub const Counts = struct {
    present: usize = 0,
    absent: usize = 0,
    resolved: usize = 0,
    missing_target: usize = 0,
    absent_table: usize = 0,
    first_unresolved_id: ?u32 = null,
    /// Index into the owning package Document's manifest.items.
    first_unresolved_item_index: ?usize = null,

    pub fn allPresentResolved(self: Counts) bool {
        return self.missing_target == 0 and self.absent_table == 0;
    }
};

pub const Outcome = enum { absent, resolved, missing_target, absent_table };

/// Consumes an owned XML-normalized optional attribute value. Missing values
/// are not inferred to be ID zero, and table IDs are never array positions.
pub fn note(a: std.mem.Allocator, counts: *Counts, raw_id: ?[]u8, table: *const header_resources.Table, item_index: usize) !Outcome {
    defer if (raw_id) |value| a.free(value);
    const value = raw_id orelse {
        counts.absent += 1;
        return .absent;
    };
    const id = std.fmt.parseInt(u32, value, 10) catch return error.InvalidResourceReferenceId;
    counts.present += 1;
    if (!table.present) {
        counts.absent_table += 1;
    } else if (table.hasId(id)) {
        counts.resolved += 1;
        return .resolved;
    } else {
        counts.missing_target += 1;
    }
    if (counts.first_unresolved_id == null) {
        counts.first_unresolved_id = id;
        counts.first_unresolved_item_index = item_index;
    }
    return if (table.present) .missing_target else .absent_table;
}
