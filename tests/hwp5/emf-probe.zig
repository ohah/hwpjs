const std = @import("std");
const core = @import("hwpjs");

fn word(out: []u8, index: usize, value: usize) !void {
    if (value > std.math.maxInt(u32)) return error.LimitExceeded;
    std.mem.writeInt(u32, out[index * 4 ..][0..4], @intCast(value), .little);
}

/// Test-only stable wire report for the EMF framing and object-table validator.
/// The prefix owns summary fields; the suffix preserves every record type in
/// stream order so corpus coverage is measured without duplicating Zig parsing.
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const summary = try core.image.emf_framing.validate(a, bytes);
    const words = std.math.add(usize, 17, summary.records) catch return error.LimitExceeded;
    const size = std.math.mul(usize, words, 4) catch return error.LimitExceeded;
    if (size > limit) return error.LimitExceeded;
    const out = try a.alloc(u8, size);
    errdefer a.free(out);
    try word(out, 0, summary.records);
    try word(out, 1, summary.header.handles);
    try word(out, 2, summary.header.palette_entries);
    try word(out, 3, summary.objects.creates);
    try word(out, 4, summary.objects.deletes);
    try word(out, 5, summary.objects.palette_selects);
    try word(out, 6, summary.objects.palette_updates);
    try word(out, 7, summary.objects.peak_live);
    try word(out, 8, summary.objects.final_live);
    try word(out, 9, summary.palette.count);
    try word(out, 10, summary.objects.selections);
    try word(out, 11, summary.objects.stock_selections);
    try word(out, 12, summary.objects.default_restores);
    try word(out, 13, summary.objects.replacement_deactivations);
    try word(out, 14, summary.objects.final_explicit_selected);
    try word(out, 15, summary.objects.color_space_sets);
    try word(out, 16, summary.objects.color_space_deletes);
    var iterator: core.image.emf_records.Iterator = .{ .bytes = bytes };
    var index: usize = 17;
    while (try iterator.next()) |record| : (index += 1)
        std.mem.writeInt(u32, out[index * 4 ..][0..4], @intFromEnum(record.kind), .little);
    return out;
}
