const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const types = @import("type_table.zig");
const footnotes = @import("footnote.zig");
const Fixture = struct {
    bytes: [1024]u8 = @splat(0xa5),
    end: usize = 1,
    ids: [8]usize = undefined,
    objects: usize = 0,
    names: [11]usize = undefined,
    versions: [11]usize = undefined,
    declarations: usize = 0,
    section_raw: usize = 0,
    fn int(self: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, self.bytes[self.end..][0..@sizeOf(T)], n, .little);
        self.end += @sizeOf(T);
    }
    fn object(self: *Fixture, id: u32) void {
        self.ids[self.objects] = self.end;
        self.objects += 1;
        self.int(u32, id);
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
    f.object(0);
    f.decl(500, "VtChartFootnote\x00", 1);
    f.decl(501, "VtChartText\x00", 1);
    f.object(10);
    f.decl(502, "VtTextBlock\x00", 2);
    f.end += 12;
    f.int(u32, 0xffffffff);
    f.object(20);
    f.decl(503, "VtFont\x00", 1);
    f.object(21);
    f.decl(504, "VtString\x00", 1);
    f.int(u16, 2);
    f.end += 2;
    f.int(u8, 173);
    f.decl(505, "VtValue\x00", 1);
    f.decl(506, "VtObject\x00", 1);
    f.end += 14;
    f.int(u32, 506);
    f.end += 24;
    f.object(30);
    f.int(u32, 504);
    f.int(u16, 3);
    f.end += 3;
    f.int(u8, 8);
    f.int(u32, 505);
    f.int(u32, 506);
    f.end += 26;
    f.int(u32, 506);
    f.decl(507, "VtChartSection\x00", 1);
    f.section_raw = f.end;
    f.end += 26;
    f.object(40);
    f.decl(508, "VtBackdrop\x00", 1);
    f.end += 50;
    f.object(41);
    f.decl(509, "VtFill\x00", 1);
    f.end += 34;
    f.object(42);
    f.decl(510, "VtPicture\x00", 1);
    f.end += 4;
    f.int(u32, 0xffffffff);
    f.int(u32, 506);
    f.int(u16, 0xaa55);
    f.int(u32, 506);
    f.int(u32, 506);
    f.int(u32, 506);
    return f;
}
fn exercise(a: std.mem.Allocator) !void {
    var f = fixture();
    var table = types.Table.init(a, .{});
    defer table.deinit();
    var reader: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = 1 };
    const v = footnotes.readObservedV1(&reader, &table, .{ .max_string_bytes = 3, .max_total_string_bytes = 5 }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        return err;
    };
    try t.expectEqual(f.end, reader.offset);
    try t.expectEqual(f.end, v.end);
    try t.expectEqual(f.end, v.section.end);
    try t.expect(v.block.end < v.section.end);
    try t.expectEqual(@as(u32, 0), v.object_id);
    try t.expectEqualSlices(u32, &.{ 40, 41, 42 }, &v.section.backdrop.object_ids);
    try t.expectEqual(@as(u16, 0xaa55), v.section.backdrop.fill_suffix);
    try t.expectEqual(@as(usize, 2), v.block.font.name.bytes.len);
    try t.expectEqual(@as(usize, 3), v.block.text.bytes.len);
    @memset(&f.bytes, 0);
    try t.expectEqualSlices(u8, &.{ 0, 0 }, v.block.font.name.bytes);
    for (v.section.raw ++ v.section.backdrop.raw_backdrop ++ v.section.backdrop.raw_fill ++ v.section.backdrop.raw_picture) |byte|
        try t.expectEqual(@as(u8, 0xa5), byte);
}
fn reject(a: std.mem.Allocator, bytes: []const u8, expected: anyerror, options: types.Options) !void {
    var table = types.Table.init(a, options);
    defer table.deinit();
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    _ = footnotes.readObservedV1(&reader, &table, .{}) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedFootnoteRejection;
}
test "chart footnote composition ownership and OOM" {
    try exercise(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{});
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("footnote leak");
    try exercise(gpa.allocator());
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
test "chart footnote all cuts and late base failure clean up" {
    var f = fixture();
    for (1..f.end) |cut| try reject(t.allocator, f.bytes[0..cut], error.UnexpectedEnd, .{});
    std.mem.writeInt(u32, f.bytes[f.end - 4 ..][0..4], 500, .little);
    try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartClass, .{});
    try t.checkAllAllocationFailures(t.allocator, reject, .{ f.bytes[0..f.end], error.UnsupportedChartClass, types.Options{} });
    var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer t.expect(gpa.deinit() == .ok) catch @panic("footnote error leak");
    try reject(gpa.allocator(), f.bytes[0..f.end], error.UnsupportedChartClass, .{});
    try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
}
test "chart footnote cross component duplicate pairs classes versions and type cap" {
    const original = fixture();
    for (original.ids, 0..) |offset, i| {
        var f = original;
        std.mem.writeInt(u32, f.bytes[offset..][0..4], 0xffffffff, .little);
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartObjectReference, .{});
        for (original.ids[0..i]) |prior| {
            f = original;
            @memcpy(f.bytes[offset..][0..4], original.bytes[prior..][0..4]);
            try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartObjectReference, .{});
        }
    }
    for (original.names, original.versions) |name, version| {
        var f = original;
        f.bytes[name] = 'X';
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartClass, .{});
        f = original;
        f.bytes[version] += 1;
        try reject(t.allocator, f.bytes[0..f.end], error.UnsupportedChartTypeVersion, .{});
    }
    try reject(t.allocator, original.bytes[0..original.end], error.LimitExceeded, .{ .max_types = 10 });
}
