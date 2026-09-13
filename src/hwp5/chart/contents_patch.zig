const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;

pub const Patch = struct {
    start: usize,
    end: usize,
    replacement: []const u8,
};

/// Applies caller-established, original-coordinate patches and returns owned
/// bytes. Patches must be sorted and non-overlapping. This layer owns the
/// Contents extent at bytes 32..36; semantic serializers own replacements.
pub fn applyOriginal(a: std.mem.Allocator, value: *const Contents, patches: []const Patch, max_output_bytes: usize) ![]u8 {
    const source = value.source;
    if (value.end != source.len) return error.InvalidChartSourceBoundary;
    if (source.len < 36 or std.mem.readInt(u32, source[32..36], .little) != source.len - 36)
        return error.InvalidChartSourceExtent;

    var output_len = source.len;
    var previous_end: usize = 0;
    for (patches) |patch| {
        if (patch.start > patch.end or patch.end > source.len) return error.InvalidChartPatchBoundary;
        if (patch.start < previous_end) return error.OverlappingChartPatches;
        const inserts_in_extent = patch.start == patch.end and patch.start >= 32 and patch.start < 36;
        if (inserts_in_extent or (patch.start < 36 and patch.end > 32)) return error.ChartExtentPatchForbidden;
        const removed = patch.end - patch.start;
        if (patch.replacement.len >= removed) {
            const growth = patch.replacement.len - removed;
            if (output_len > std.math.maxInt(usize) - growth) return error.LimitExceeded;
            output_len += growth;
        } else output_len -= removed - patch.replacement.len;
        previous_end = patch.end;
    }
    if (output_len < 36 or output_len - 36 > std.math.maxInt(u32) or output_len > max_output_bytes)
        return error.LimitExceeded;

    const output = try a.alloc(u8, output_len);
    errdefer a.free(output);
    var source_at: usize = 0;
    var output_at: usize = 0;
    for (patches) |patch| {
        const unchanged = source[source_at..patch.start];
        @memcpy(output[output_at..][0..unchanged.len], unchanged);
        output_at += unchanged.len;
        @memcpy(output[output_at..][0..patch.replacement.len], patch.replacement);
        output_at += patch.replacement.len;
        source_at = patch.end;
    }
    @memcpy(output[output_at..], source[source_at..]);
    std.mem.writeInt(u32, output[32..36], @intCast(output.len - 36), .little);
    return output;
}
