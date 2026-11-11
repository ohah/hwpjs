//! Patch exactly heading kind/level/reference on one owned PARA_SHAPE record.
const std = @import("std");
const Bullet = @import("../../model/formatting_patch.zig").Bullet;
const Version = @import("../version.zig").Version;
pub fn read(bytes: []const u8, version: Version, id: u16) !Bullet {
    var it = @import("../record.zig").Iterator.init(bytes, .{});
    var n: usize = 0;
    while (try it.next()) |r| {
        if (r.tag != 25) continue;
        if (n == id) {
            const p = try @import("../docinfo/para_shape.zig").ParaShape.parse(r.payload, version);
            const kind = (p.attributes >> 23) & 3;
            if (kind == 0) return .{ .id = null };
            if (kind != 3) return error.UnsupportedParagraphHeadingKind;
            if (p.effectiveLevel() != 0) return error.UnsupportedBulletLevel;
            if (p.head_id == 0) return error.InvalidBulletId;
            return .{ .id = p.head_id };
        }
        n += 1;
    }
    return error.InvalidParagraphShapeReference;
}
pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, id: u16, value: Bullet) ![]u8 {
    if (value.id) |v| if (v == 0 or v > std.math.maxInt(u16)) return error.InvalidBulletId;
    var it = @import("../record.zig").Iterator.init(input, .{});
    var n: usize = 0;
    while (try it.next()) |r| {
        if (r.tag != 25) continue;
        if (n == id) {
            const p = try @import("../docinfo/para_shape.zig").ParaShape.parse(r.payload, version);
            const bytes = try a.dupe(u8, input);
            const offset = r.offset + r.raw.len - r.payload.len;
            const payload = bytes[offset..][0..r.payload.len];
            std.mem.writeInt(u32, payload[0..4], (p.attributes & ~(@as(u32, 31) << 23)) | (if (value.id != null) @as(u32, 3) << 23 else 0), .little);
            std.mem.writeInt(u16, payload[30..32], @intCast(value.id orelse 0), .little);
            if (p.level != null) std.mem.writeInt(u32, payload[54..58], 0, .little);
            return bytes;
        }
        n += 1;
    }
    return error.InvalidParagraphShapeReference;
}
