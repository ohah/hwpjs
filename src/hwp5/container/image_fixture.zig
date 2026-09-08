const std = @import("std");
const f = @import("../document/test_fixture.zig");
/// Repeated DocInfo references deliberately target one physical PNG stream.
pub fn make(a: std.mem.Allocator, payload: []const u8, references: u32) ![]u8 {
    const header = f.header();
    const base = try f.docInfo(a, 0);
    defer a.free(base);
    f.put(base, 35, u32, references);
    var doc: std.ArrayList(u8) = .empty;
    defer doc.deinit(a);
    try doc.appendSlice(a, base);
    var record = [_]u8{0} ** 16;
    f.put(&record, 0, u32, 18 | (1 << 10) | (12 << 20));
    record[4..].* = .{ 0x21, 0, 9, 0, 3, 0, 'p', 0, 'n', 0, 'g', 0 };
    for (0..references) |_| try doc.appendSlice(a, &record);
    return @import("../../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = doc.items },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "BinData", .parent = 0, .kind = 1 },
        .{ .name = "BIN0009.png", .parent = 4, .content = payload },
    }, .{});
}
