const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    if (bytes.len > limit) return error.LimitExceeded;
    var r: core.Reader = .{ .bytes = bytes };
    const code = try r.readInt(u8);
    const size = try r.readInt(u16);
    const frame = try core.image.jpeg_frame.parse(code, try r.take(size), .{});
    var store: core.image.jpeg_table_store.Store = .{};
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, 0);
    var scans: u32 = 0;
    while (r.offset < bytes.len) {
        const kind = try r.readInt(u8);
        const length = try r.readInt(u16);
        const payload = try r.take(length);
        switch (kind) {
            0 => try store.installQuantization(payload, .{}),
            1 => try store.installHuffman(payload, .{}),
            2 => {
                const result = try core.image.jpeg_scan_tables.resolve(&store, frame, payload);
                try int(a, &out, u32, @intCast(result.count));
                for (result.components[0..result.count]) |c| {
                    const values = [_]u32{
                        c.id,
                        if (c.quantization) |v| v.destination else 255,
                        if (c.dc) |v| v.destination else 255,
                        if (c.ac) |v| v.destination else 255,
                        if (c.quantization) |v| v.value(0).? else 0,
                        if (c.quantization) |v| v.value(63).? else 0,
                        if (c.dc) |v| v.symbols[0] else 0,
                        if (c.ac) |v| v.symbols[0] else 0,
                    };
                    for (values) |v| try int(a, &out, u32, v);
                }
                scans += 1;
            },
            else => return error.InvalidMode,
        }
    }
    std.mem.writeInt(u32, out.items[0..4], scans, .little);
    return out.toOwnedSlice(a);
}
