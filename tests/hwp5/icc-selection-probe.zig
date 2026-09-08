const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    return runWithMatching(a, bytes, limit, .raw);
}
pub fn runWithMatching(a: std.mem.Allocator, bytes: []const u8, limit: usize, matching: icc.mluc_selection.Matching) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    if (bytes.len < 12) return error.InvalidProbeInput;
    const max_records = std.mem.readInt(u32, bytes[0..4], .big);
    const max_preferences = std.mem.readInt(u32, bytes[4..8], .big);
    const count = std.mem.readInt(u32, bytes[8..12], .big);
    if (count > max_preferences) return error.LimitExceeded;
    if (count > (bytes.len - 12) / 5) return error.InvalidProbeInput;
    const prefs = try a.alloc(icc.mluc_selection.Preference, count);
    defer a.free(prefs);
    for (prefs, 0..) |*p, i| {
        const b = bytes[12 + i * 5 ..][0..5];
        if (b[0] > 1) return error.InvalidProbeInput;
        p.* = .{ .language = b[1..3].*, .country = if (b[0] == 1) b[3..5].* else null };
    }
    const view = try icc.mluc.parse(bytes[12 + count * 5 ..], .{ .max_bytes = limit, .max_records = max_records });
    const selected = try icc.mluc_selection.select(view, prefs, .{ .max_records = max_records, .max_preferences = max_preferences, .matching = matching });
    const out = try a.alloc(u8, 24);
    @memset(out, 0);
    if (selected) |s| {
        std.mem.writeInt(u32, out[0..4], 1, .little);
        std.mem.writeInt(u32, out[4..8], @intCast(s.index), .little);
        std.mem.writeInt(u32, out[8..12], if (s.preference_index) |i| @intCast(i) else 0xffffffff, .little);
        std.mem.writeInt(u32, out[12..16], switch (s.reason) {
            .exact => 1,
            .language => 2,
            .first_record => 3,
        }, .little);
        std.mem.writeInt(u32, out[16..20], @intFromBool(s.locale_deferred), .little);
        std.mem.writeInt(u32, out[20..24], @intFromBool(s.unicode_deferred), .little);
    }
    return out;
}
