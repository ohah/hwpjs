const std = @import("std");
const icc = @import("hwpjs").image.icc;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    const h = try icc.extent.inspect(bytes, limit);
    const status = try icc.profile_id.inspect(bytes, limit);
    const digest = if (h.version.major == 4) try icc.profile_id.calculate(bytes, limit) else [_]u8{0} ** 16;
    const out = try a.alloc(u8, 148);
    std.mem.writeInt(u32, out[0..4], h.profile_size, .little);
    out[4..8].* = h.preferred_cmm;
    out[8..12].* = .{ h.version.major, h.version.minor, h.version.bugfix, 0 };
    out[12..16].* = h.profile_class;
    out[16..20].* = h.data_space;
    out[20..24].* = h.pcs;
    for (h.creation_date, 0..) |v, i| std.mem.writeInt(u16, out[24 + i * 2 ..][0..2], v, .little);
    out[36..40].* = h.file_signature;
    out[40..44].* = h.platform;
    std.mem.writeInt(u32, out[44..48], h.flags, .little);
    out[48..52].* = h.manufacturer;
    out[52..56].* = h.model;
    std.mem.writeInt(u64, out[56..64], h.attributes, .little);
    std.mem.writeInt(u32, out[64..68], h.rendering_intent, .little);
    for (h.illuminant, 0..) |v, i| std.mem.writeInt(i32, out[68 + i * 4 ..][0..4], v, .little);
    out[80..84].* = h.creator;
    switch (h.tail) {
        .v2 => |tail| out[84..128].* = tail,
        .v4 => |tail| {
            out[84..100].* = tail.profile_id;
            out[100..128].* = tail.reserved;
        },
    }
    std.mem.writeInt(u32, out[128..132], switch (status) {
        .not_defined => @as(u32, 0),
        .not_calculated => 1,
        .verified => 2,
    }, .little);
    out[132..148].* = digest;
    return out;
}
