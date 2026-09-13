const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;

/// Returns an owned byte-for-byte copy of the retained original Contents.
/// This is intentionally not a semantic serializer and ignores no edits under
/// a misleading save API: callers choose original replay explicitly.
pub fn copyOriginal(a: std.mem.Allocator, value: *const Contents, max_output_bytes: usize) ![]u8 {
    if (value.end != value.source.len) return error.InvalidChartSourceBoundary;
    if (value.source.len > max_output_bytes) return error.LimitExceeded;
    return a.dupe(u8, value.source);
}
