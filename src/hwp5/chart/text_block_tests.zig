const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const types = @import("type_table.zig");
const blocks = @import("text_block.zig");
const Fixture = struct {
    bytes: [512]u8 = @splat(0xa5),
    end: usize = 1,
    auxiliary: usize = 0,
    text_id: usize = 0,
    name_payload: usize = 0,
    names: [5]usize = undefined,
    versions: [5]usize = undefined,
    declarations: usize = 0,
    fn int(self: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, self.bytes[self.end..][0..@sizeOf(T)], n, .little);
        self.end += @sizeOf(T);
    }
    fn decl(self: *Fixture, id: u32, name: []const u8, version: u16) void {
        self.int(u32, id);
        self.int(u16, @intCast(name.len));
        self.names[self.declarations] = self.end;
        @memcpy(self.bytes[self.end..][0..name.len], name);
        self.end += name.len;
        self.versions[self.declarations] = self.end;
        self.int(u16, version);
        self.declarations += 1;
    }
};
fn fixture() Fixture {
    var f: Fixture = .{};
    f.int(u32, 0);
    f.decl(900, "VtTextBlock\x00", 2);
    f.end += 12;
    f.auxiliary = f.end;
    f.int(u32, 0xffffffff);
    f.int(u32, 45);
    f.decl(3, "VtFont\x00", 1);
    f.int(u32, 17);
    f.decl(77, "VtString\x00", 1);
    f.int(u16, 2);
    f.name_payload = f.end;
    f.end += 2;
    f.int(u8, 173);
    f.decl(51, "VtValue\x00", 1);
    f.decl(52, "VtObject\x00", 1);
    f.end += 14;
    f.int(u32, 52);
    f.end += 24;
    f.text_id = f.end;
    f.int(u32, 0xfffffffe);
    f.int(u32, 77);
    f.int(u16, 3);
    f.end += 3;
    f.int(u8, 8);
    f.int(u32, 51);
    f.int(u32, 52);
    f.end += 26;
    f.int(u32, 52);
    return f;
}
fn exercise(a: std.mem.Allocator) !void {
    var f = fixture();
    var table = types.Table.init(a, .{});
    defer table.deinit();
    var reader: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = 1 };
    const b = blocks.readObservedV2(&reader, &table, .{ .max_string_bytes = 3, .max_total_string_bytes = 5 }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        return err;
    };
    try t.expectEqual(f.end, b.end);
    try t.expectEqual(f.end, reader.offset);
    try t.expectEqual(@as(u32, 0), b.object_id);
    try t.expectEqual(@as(u32, 45), b.font.object_id);
    try t.expectEqual(@as(u32, 17), b.font.name.object_id);
    try t.expectEqual(@as(u32, 0xfffffffe), b.text.object_id);
    try t.expectEqual(@as(u8, 173), b.font.name.trailer);
    try t.expectEqual(@as(u8, 8), b.text.trailer);
    try t.expectEqual(@as(usize, 3), b.text.bytes.len);
    try t.expect(b.font.name.bytes.ptr == f.bytes[f.name_payload..].ptr);
    @memset(&f.bytes, 0);
    try t.expectEqualSlices(u8, &.{ 0, 0 }, b.font.name.bytes);
    for (b.prefix ++ b.font.raw ++ b.middle ++ b.suffix) |v| try t.expectEqual(@as(u8, 0xa5), v);
}
fn reject(a: std.mem.Allocator, bytes: []const u8, expected: anyerror, options: blocks.Options, type_options: types.Options) !void {
    var table = types.Table.init(a, type_options);
    defer table.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    _ = blocks.readObservedV2(&reader, &table, options) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedTextBlockRejection;
}
test "chart text block ownership IDs exact limits and OOM" {
    try exercise(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("text block leak");
    try exercise(gpa.allocator());
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
test "chart text block all cuts and late failure cleanup" {
    const f = fixture();
    for (1..f.end) |cut| try reject(t.allocator, f.bytes[0..cut], error.UnexpectedEnd, .{}, .{});
    try t.checkAllAllocationFailures(t.allocator, reject, .{ f.bytes[0 .. f.end - 1], error.UnexpectedEnd, blocks.Options{}, types.Options{} });
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("text block error leak");
    try reject(gpa.allocator(), f.bytes[0 .. f.end - 1], error.UnexpectedEnd, .{}, .{});
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
test "chart text block references classes versions and independent limits" {
    const original = fixture();
    var f = original;
    f.bytes[f.auxiliary] = 0;
    try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartTextReference, .{}, .{});
    f = original;
    std.mem.writeInt(u32, f.bytes[f.text_id..][0..4], 0, .little);
    try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartObjectReference, .{}, .{});
    f = original;
    std.mem.writeInt(u32, f.bytes[1..5], 0xffffffff, .little);
    try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartObjectReference, .{}, .{});
    for (original.names, original.versions) |name, version| {
        f = original;
        f.bytes[name] = 'X';
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartClass, .{}, .{});
        f = original;
        f.bytes[version] += 1;
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartTypeVersion, .{}, .{});
    }
    f = original;
    try reject(t.allocator, f.bytes[0..f.end], error.LimitExceeded, .{ .max_string_bytes = 2 }, .{});
    try reject(t.allocator, f.bytes[0..f.end], error.LimitExceeded, .{ .max_total_string_bytes = 4 }, .{});
    try reject(t.allocator, f.bytes[0..f.end], error.LimitExceeded, .{}, .{ .max_types = 4 });
}
