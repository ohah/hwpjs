const std = @import("std");
const tags = @import("range_tags.zig");
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 64 * 1024 * 1024,
    max_ranges: usize = 100_000,
    missing_text: enum { reject, observed_cr } = .reject,
};
fn less(_: void, a: tags.Range, b: tags.Range) bool {
    return a.start < b.start or (a.start == b.start and a.end < b.end);
}
/// Explicit observed 0x11 projection of one paragraph, not HWP editing/saving.
/// Caller owns the returned raw UTF-16 bytes. Input bytes/ranges remain untouched.
/// Group ownership, coordinate remapping, token integrity and reference semantics
/// are separate responsibilities; this function does not normalize Unicode.
pub fn projectObserved(a: std.mem.Allocator, text: ?[]const u8, units: u32, ranges: tags.Ranges, options: Options) ![]u8 {
    const source = text orelse blk: {
        if (options.missing_text != .observed_cr or units != 1) return error.UnsupportedMissingRevisionText;
        break :blk @as([]const u8, &.{ 13, 0 });
    };
    if (source.len > options.max_input_bytes) return error.RevisionProjectionInputLimit;
    if (source.len % 2 != 0 or source.len / 2 != units) return error.RevisionProjectionTextCountMismatch;
    _ = try tags.Ranges.parse(ranges.raw);
    if (ranges.count() > options.max_ranges) return error.RevisionProjectionRangeLimit;
    var count: usize = 0;
    for (0..ranges.count()) |i| {
        const r = ranges.get(i).?;
        try r.validateBounds(units);
        if (r.kind() == 0x11 and r.start != r.end) count += 1;
    }
    const selected = try a.alloc(tags.Range, count);
    defer a.free(selected);
    var at: usize = 0;
    for (0..ranges.count()) |i| {
        const r = ranges.get(i).?;
        if (r.kind() == 0x11 and r.start != r.end) {
            selected[at] = r;
            at += 1;
        }
    }
    std.mem.sort(tags.Range, selected, {}, less);
    // Compact overlapping/touching intervals before computing the output size.
    var merged: usize = 0;
    for (selected) |r| {
        if (merged > 0 and r.start <= selected[merged - 1].end) {
            selected[merged - 1].end = @max(selected[merged - 1].end, r.end);
        } else {
            selected[merged] = r;
            merged += 1;
        }
    }
    var kept = source.len / 2;
    for (selected[0..merged]) |r| kept -= r.end - r.start;
    const size = kept * 2; // <= source.len, already representable on this target.
    if (size > options.max_output_bytes) return error.RevisionProjectionOutputLimit;
    const output = try a.alloc(u8, size);
    var from: usize = 0;
    var written: usize = 0;
    for (selected[0..merged]) |r| {
        const end = @as(usize, r.start) * 2;
        const n = end - from;
        @memcpy(output[written..][0..n], source[from..end]);
        written += n;
        from = @as(usize, r.end) * 2;
    }
    @memcpy(output[written..], source[from..]);
    return output;
}
