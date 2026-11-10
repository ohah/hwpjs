//! A storage upper bound only; all actual reserved bytes remain budgeted.
const std = @import("std");
/// With N entries (current + undo + redo), N * minimum_entry <= total_limit.
/// Ignoring metadata here overestimates possible entries, which is safe for
/// reservation. It never excludes metadata or payload from actual accounting.
pub fn capacity(max_entries: u32, total_limit: u32, minimum_entry: usize) usize {
    std.debug.assert(max_entries > 0 and minimum_entry > 0);
    const possible_past_entries = (@as(usize, total_limit) / minimum_entry) -| 1;
    return @min(@as(usize, max_entries), @max(@as(usize, 1), possible_past_entries));
}
