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

/// One resource-ID resolution rule shared by all HWPX reference diagnostics.
/// Callers decide separately whether a zero value has special semantics.
pub fn resolveValue(id: u32, table: *const header_resources.Table) Outcome {
    if (!table.present) return .absent_table;
    return if (table.hasId(id)) .resolved else .missing_target;
}

/// Resolves an already parsed ID using the same table and diagnostics as note.
pub fn noteValue(counts: *Counts, id: ?u32, table: *const header_resources.Table, item_index: usize) Outcome {
    const value = id orelse {
        counts.absent += 1;
        return .absent;
    };
    counts.present += 1;
    const outcome = resolveValue(value, table);
    switch (outcome) {
        .resolved => {
            counts.resolved += 1;
            return .resolved;
        },
        .absent_table => counts.absent_table += 1,
        .missing_target => counts.missing_target += 1,
        .absent => unreachable,
    }
    if (counts.first_unresolved_id == null) {
        counts.first_unresolved_id = value;
        counts.first_unresolved_item_index = item_index;
    }
    return outcome;
}

/// Consumes an owned XML-normalized optional attribute value. Missing values
/// are not inferred to be ID zero, and table IDs are never array positions.
pub fn note(a: std.mem.Allocator, counts: *Counts, raw_id: ?[]u8, table: *const header_resources.Table, item_index: usize) !Outcome {
    defer if (raw_id) |value| a.free(value);
    const id: ?u32 = if (raw_id) |value| std.fmt.parseInt(u32, value, 10) catch return error.InvalidResourceReferenceId else null;
    return noteValue(counts, id, table, item_index);
}
