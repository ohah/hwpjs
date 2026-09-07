const std = @import("std");
const tags = @import("range_tags.zig");
const coordinates = @import("revision_coordinates.zig");
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 64 * 1024 * 1024,
    max_ranges: usize = coordinates.default_max_ranges,
    missing_text: enum { reject, observed_cr } = .reject,
};
pub const Projected = struct {
    bytes: []u8,
    coordinates: coordinates.Map,
    pub fn deinit(self: *Projected, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.coordinates.deinit(a);
        self.* = undefined;
    }
};
/// Explicit observed 0x11 projection of one paragraph, not HWP editing/saving.
/// Caller owns the returned raw UTF-16 bytes. Input bytes/ranges remain untouched.
/// Group ownership, coordinate remapping, token integrity and reference semantics
/// are separate responsibilities; this function does not normalize Unicode.
pub fn projectObserved(a: std.mem.Allocator, text: ?[]const u8, units: u32, ranges: tags.Ranges, options: Options) ![]u8 {
    var result = try projectObservedMapped(a, text, units, ranges, options);
    result.coordinates.deinit(a);
    return result.bytes;
}
/// Byte output and coordinate map share one observed union; caller owns both.
pub fn projectObservedMapped(a: std.mem.Allocator, text: ?[]const u8, units: u32, ranges: tags.Ranges, options: Options) !Projected {
    const source = text orelse blk: {
        if (options.missing_text != .observed_cr or units != 1) return error.UnsupportedMissingRevisionText;
        break :blk @as([]const u8, &.{ 13, 0 });
    };
    if (source.len > options.max_input_bytes) return error.RevisionProjectionInputLimit;
    if (source.len % 2 != 0 or source.len / 2 != units) return error.RevisionProjectionTextCountMismatch;
    var map = try coordinates.Map.buildObserved(a, units, ranges, options.max_ranges);
    errdefer map.deinit(a);
    const size = @as(usize, map.projected_units) * 2; // <= source.len
    if (size > options.max_output_bytes) return error.RevisionProjectionOutputLimit;
    const output = try a.alloc(u8, size);
    var from: usize = 0;
    var written: usize = 0;
    for (map.spans()) |r| {
        const end = @as(usize, r.start) * 2;
        const n = end - from;
        @memcpy(output[written..][0..n], source[from..end]);
        written += n;
        from = @as(usize, r.end) * 2;
    }
    @memcpy(output[written..], source[from..]);
    return .{ .bytes = output, .coordinates = map };
}
