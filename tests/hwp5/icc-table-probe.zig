const std = @import("std");
const table = @import("hwpjs").image.icc.tag_table;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len < 8) return error.UnexpectedEnd;
    const max_tags = std.mem.readInt(u32, bytes[0..4], .little);
    const policy = std.mem.readInt(u32, bytes[4..8], .little);
    if (policy > 1) return error.InvalidPolicy;
    var t = try table.parse(a, bytes[8..], .{ .max_bytes = limit, .max_tags = max_tags, .policy = if (policy == 0) .bounded else .icc_2022 });
    defer t.deinit(a);
    const len = std.math.add(usize, 32, try std.math.mul(usize, t.tags.len, 20)) catch return error.LimitExceeded;
    const out = try a.alloc(u8, len);
    const s = t.storage;
    const fields = [_]usize{ t.tags.len, t.table_end, s.unique_elements, s.shared_entries, s.overlapping_elements, s.unreferenced_bytes, s.padding_bytes_validated, @intFromBool(s.layout_validated) };
    for (fields, 0..) |v, i| std.mem.writeInt(u32, out[i * 4 ..][0..4], @intCast(v), .little);
    for (t.tags, 0..) |tag, i| {
        const row = out[32 + i * 20 ..][0..20];
        row[0..4].* = tag.signature;
        std.mem.writeInt(u32, row[4..8], @intCast(tag.offset), .little);
        std.mem.writeInt(u32, row[8..12], @intCast(tag.data.len), .little);
        row[12..16].* = tag.type_signature;
        std.mem.writeInt(u32, row[16..20], std.hash.Crc32.hash(tag.data), .little);
    }
    return out;
}
