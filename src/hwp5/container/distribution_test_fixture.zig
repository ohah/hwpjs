const std = @import("std");
const f = @import("../document/test_fixture.zig");
const writer = @import("../../cfb/writer.zig");
fn stored(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const out = try a.alloc(u8, bytes.len + 5);
    out[0] = 1;
    f.put(out, 1, u16, @intCast(bytes.len));
    f.put(out, 3, u16, ~@as(u16, @intCast(bytes.len)));
    @memcpy(out[5..], bytes);
    return out;
}
fn envelope(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const zipped = try stored(a, bytes);
    defer a.free(zipped);
    const aligned = std.mem.alignForward(usize, zipped.len, 16);
    const plain = try a.alloc(u8, aligned + 32);
    defer a.free(plain);
    @memset(plain, 0);
    @memcpy(plain[0..zipped.len], zipped);
    f.put(plain, aligned, u32, std.hash.Crc32.hash(bytes));
    f.put(plain, aligned + 16, u32, @intCast(bytes.len));
    const out = try a.alloc(u8, 260 + plain.len);
    @memset(out[0..260], 0);
    f.put(out, 0, u32, 28 | (256 << 20));
    const cipher = std.crypto.core.aes.Aes128.initEnc(@import("../distribution/key.zig").derive(out[4..260]));
    var at: usize = 0;
    while (at < plain.len) : (at += 16) cipher.encrypt(out[260 + at ..][0..16], plain[at..][0..16]);
    return out;
}
pub fn make(a: std.mem.Allocator, missing: bool, late: bool) ![]u8 {
    return makeWithHistory(a, missing, late, false);
}
pub fn makeWithHistory(a: std.mem.Allocator, missing: bool, late: bool, history: bool) ![]u8 {
    var header = f.header();
    f.put(&header, 36, u32, 5);
    const info = try f.docInfo(a, 6);
    defer a.free(info);
    const doc = try stored(a, info);
    defer a.free(doc);
    const body = try f.section(a);
    defer a.free(body);
    const view = try envelope(a, body);
    defer a.free(view);
    const version = try envelope(a, &([_]u8{0} ** 8));
    defer a.free(version);
    var nodes: std.ArrayList(writer.Node) = .empty;
    defer nodes.deinit(a);
    try nodes.appendSlice(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = "opaque auxiliary stream" },
        .{ .name = if (missing) "OtherView" else "ViewText", .parent = 0, .kind = 1 },
    });
    for ([_][]const u8{ "Section5", "Section4", "Section3", "Section2", "Section1", "Section0" }) |name|
        try nodes.append(a, .{ .name = name, .parent = 5, .content = view });
    try nodes.appendSlice(a, &.{
        .{ .name = "Scripts", .parent = 0, .kind = 1 },
        .{ .name = "JScriptVersion", .parent = 12, .content = version },
    });
    if (late) try nodes.append(a, .{ .name = "PrvImage", .parent = 0, .content = "unknown" });
    if (history) {
        const parent: u32 = @intCast(nodes.items.len);
        try nodes.append(a, .{ .name = "DocHistory", .parent = 0, .kind = 1 });
        try nodes.append(a, .{ .name = "VersionLog0", .parent = parent, .content = &.{ 16, 6, 0, 0, 0, 0, 0, 10, 0, 0, 0, 17, 0, 0, 0, 0 } });
    }
    return writer.write(a, nodes.items, .{});
}
