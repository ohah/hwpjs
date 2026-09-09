const std = @import("std");
const f = @import("../document/test_fixture.zig");
/// Repeated DocInfo references deliberately target one physical PNG stream.
pub fn make(a: std.mem.Allocator, payload: []const u8, references: u32) ![]u8 {
    return withExtension(a, payload, references, "png");
}
pub fn withExtension(a: std.mem.Allocator, payload: []const u8, references: u32, extension: []const u8) ![]u8 {
    const header = f.header();
    const base = try f.docInfo(a, 0);
    defer a.free(base);
    f.put(base, 35, u32, references);
    var doc: std.ArrayList(u8) = .empty;
    defer doc.deinit(a);
    try doc.appendSlice(a, base);
    const record = try a.alloc(u8, 10 + 2 * extension.len);
    defer a.free(record);
    @memset(record, 0);
    f.put(record, 0, u32, 18 | (1 << 10) | (@as(u32, @intCast(record.len - 4)) << 20));
    record[4] = 0x21;
    record[6] = 9;
    f.put(record, 8, u16, @intCast(extension.len));
    for (extension, 0..) |c, i| record[10 + 2 * i] = c;
    for (0..references) |_| try doc.appendSlice(a, record);
    const name = try std.fmt.allocPrint(a, "BIN0009.{s}", .{extension});
    defer a.free(name);
    return @import("../../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = doc.items },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "BinData", .parent = 0, .kind = 1 },
        .{ .name = name, .parent = 4, .content = payload },
    }, .{});
}
