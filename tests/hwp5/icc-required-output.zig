const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn write(a: std.mem.Allocator, r: icc.required_presence.Report) ![]u8 {
    const out = try a.alloc(u8, 8 + r.required.count() * 8);
    std.mem.writeInt(u32, out[0..4], @intCast(r.required.count()), .little);
    const flags: u32 = @as(u32, @intFromBool(r.adaptation_condition_deferred)) | (@as(u32, @intFromBool(r.payloads_deferred)) << 1) | (@as(u32, @intFromBool(r.computational_model_deferred)) << 2);
    std.mem.writeInt(u32, out[4..8], flags, .little);
    var iterator = r.required.iterator();
    var offset: usize = 8;
    while (iterator.next()) |name| {
        @memcpy(out[offset..][0..4], @tagName(name));
        std.mem.writeInt(u32, out[offset + 4 ..][0..4], @intFromBool(r.missing.contains(name)), .little);
        offset += 8;
    }
    return out;
}
