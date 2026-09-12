const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const blocks = @import("text_block.zig");
const Fixture = struct {
    bytes: [2048]u8 = @splat(0xa5),
    end: usize = 1,
    seen: [9]bool = @splat(false),
    names: [8]usize = undefined,
    versions: [8]usize = undefined,
    count: usize = 0,
    auxiliary: usize = 0,
    font: usize = 0,
    text: usize = 0,
    fn int(self: *Fixture, comptime T: type, n: T) void {
        std.mem.writeInt(T, self.bytes[self.end..][0..@sizeOf(T)], n, .little);
        self.end += @sizeOf(T);
    }
    fn typ(self: *Fixture, slot: usize, name: []const u8, version: u16) void {
        self.int(u32, @intCast(90 + slot * 13));
        if (self.seen[slot]) return;
        self.seen[slot] = true;
        self.int(u16, @intCast(name.len));
        self.names[self.count] = self.end;
        @memcpy(self.bytes[self.end..][0..name.len], name);
        self.end += name.len;
        self.versions[self.count] = self.end;
        self.int(u16, version);
        self.count += 1;
    }
    fn string(self: *Fixture, id: u32, n: u16) void {
        self.int(u32, id);
        self.typ(7, "VtString\x00", 1);
        self.int(u16, n);
        self.end += n;
        self.int(u8, 173);
        self.typ(8, "VtValue\x00", 1);
        self.typ(5, "VtObject\x00", 1);
    }
};
fn fixture(background: bool, new_name: bool, alias: bool) Fixture {
    var f: Fixture = .{};
    f.int(u32, 0);
    f.typ(1, "VtTextBlock\x00", 2);
    f.end += 12;
    f.auxiliary = f.end;
    if (background) {
        inline for (.{ .{ 20, 2, "VtBackdrop\x00", 50 }, .{ 21, 3, "VtFill\x00", 34 }, .{ 22, 4, "VtPicture\x00", 4 } }) |entry| {
            f.int(u32, entry[0]);
            f.typ(entry[1], entry[2], 1);
            f.end += entry[3];
        }
        f.int(u32, 0xffffffff);
        f.typ(5, "VtObject\x00", 1);
        f.int(u16, 0xaa55);
        f.typ(5, "VtObject\x00", 1);
        f.typ(5, "VtObject\x00", 1);
    } else f.int(u32, 0xffffffff);
    f.font = f.end;
    f.int(u32, 30);
    f.typ(6, "VtFont\x00", 1);
    if (new_name) f.string(40, 2) else f.int(u32, 7);
    f.end += 14;
    f.typ(5, "VtObject\x00", 1);
    f.end += 24;
    f.text = f.end;
    if (alias) f.int(u32, if (new_name) 40 else 7) else f.string(50, 3);
    f.end += 26;
    f.typ(5, "VtObject\x00", 1);
    return f;
}
fn exercise(a: std.mem.Allocator, background: bool, new_name: bool, alias: bool) !void {
    var f = fixture(background, new_name, alias);
    var seed = [_]u8{ 1, 2 };
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{
        .max_objects = 3 + @as(usize, if (background) 3 else 0) + @intFromBool(new_name) + @intFromBool(!alias),
        .max_total_string_bytes = 2 + @as(usize, if (new_name) 2 else 0) + @as(usize, if (alias) 0 else 3),
    });
    defer objects.deinit();
    try objects.registerString(.{ .object_id = 7, .bytes = &seed, .trailer = 99 });
    var reader: Reader = .{ .bytes = f.bytes[0 .. f.end + 1], .offset = 1 };
    const value = blocks.readObservedWithObjects(&reader, &types, &objects, .{ .max_string_bytes = if (alias) 2 else 3, .max_total_string_bytes = if (alias) 4 else 5 }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        return err;
    };
    try t.expectEqual(f.end, reader.offset);
    try t.expectEqual(f.end, value.end);
    try t.expectEqual(background, value.backdrop != null);
    try t.expectEqual(new_name, value.font.name_introduced);
    try t.expectEqual(!alias, value.text_introduced);
    try t.expectEqual(@as(u8, if (new_name) 173 else 99), value.font.name.trailer);
    try t.expectEqual(@as(u8, if (alias and !new_name) 99 else 173), value.text.trailer);
    try t.expectEqual(@as(usize, 2 + @as(usize, if (new_name) 2 else 0) + @as(usize, if (alias) 0 else 3)), objects.string_bytes);
    @memset(&f.bytes, 0);
    seed[0] = 9;
    try t.expectEqualSlices(u8, if (new_name) &.{ 0, 0 } else &.{ 9, 2 }, value.font.name.bytes);
    try t.expectEqualSlices(u8, if (alias) (if (new_name) &.{ 0, 0 } else &.{ 9, 2 }) else &.{ 0, 0, 0 }, value.text.bytes);
    for (value.prefix ++ value.middle ++ value.suffix ++ value.font.raw) |b| try t.expectEqual(@as(u8, 0xa5), b);
    if (value.backdrop) |bd| {
        try t.expectEqualSlices(u32, &.{ 20, 21, 22 }, &bd.object_ids);
        try t.expectEqual(@as(u16, 0xaa55), bd.fill_suffix);
        for (bd.raw_backdrop ++ bd.raw_fill ++ bd.raw_picture) |b| try t.expectEqual(@as(u8, 0xa5), b);
    }
}
fn reject(a: std.mem.Allocator, bytes: []const u8, expected: anyerror, per: usize, total: usize) !void {
    var types = Types.init(a, .{});
    defer types.deinit();
    var objects = Objects.init(a, .{});
    defer objects.deinit();
    try objects.registerString(.{ .object_id = 7, .bytes = &.{ 1, 2 }, .trailer = 99 });
    var reader: Reader = .{ .bytes = bytes, .offset = 1 };
    _ = blocks.readObservedWithObjects(&reader, &types, &objects, .{ .max_string_bytes = per, .max_total_string_bytes = total }) catch |err| {
        try t.expectEqual(@as(usize, 1), reader.offset);
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    return error.ExpectedTextBlockObjectsRejection;
}
test "chart text block objects backdrop null names aliases ownership limits OOM" {
    for ([_]bool{ false, true }) |bg| for ([_]bool{ false, true }) |name| for ([_]bool{ false, true }) |alias| {
        try exercise(t.allocator, bg, name, alias);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ bg, name, alias });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("text block objects leak");
        try exercise(gpa.allocator(), bg, name, alias);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}
test "chart text block objects all cuts classes versions aggregate alias budget and late error" {
    for ([_]bool{ false, true }) |bg| for ([_]bool{ false, true }) |name| for ([_]bool{ false, true }) |alias| {
        const f = fixture(bg, name, alias);
        for (1..f.end) |cut| try reject(t.allocator, f.bytes[0..cut], error.UnexpectedEnd, 3, 5);
        try reject(t.allocator, f.bytes[0..f.end], error.LimitExceeded, 1, 5);
        try reject(t.allocator, f.bytes[0..f.end], error.LimitExceeded, 3, if (alias) 3 else 4);
        for (f.names[0..f.count], f.versions[0..f.count]) |at, version| {
            var bad = f;
            bad.bytes[at] = 'X';
            try reject(t.allocator, bad.bytes[0..bad.end], error.UnsupportedChartClass, 3, 5);
            bad = f;
            bad.bytes[version] ^= 1;
            try reject(t.allocator, bad.bytes[0..bad.end], error.UnsupportedChartTypeVersion, 3, 5);
        }
        var bad = f;
        std.mem.writeInt(u32, bad.bytes[bad.text..][0..4], 30, .little);
        try reject(t.allocator, bad.bytes[0..bad.end], error.UnsupportedChartObjectReference, 3, 5);
        bad = f;
        std.mem.writeInt(u32, bad.bytes[bad.end - 4 ..][0..4], 90 + 6 * 13, .little);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ bad.bytes[0..bad.end], error.UnsupportedChartClass, @as(usize, 3), @as(usize, 5) });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("text block objects late leak");
        try reject(gpa.allocator(), bad.bytes[0..bad.end], error.UnsupportedChartClass, 3, 5);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    };
}

test "chart text block objects backdrop scope collision and legacy entry stays null only" {
    const f = fixture(true, true, false);
    var bad = f;
    std.mem.writeInt(u32, bad.bytes[bad.auxiliary..][0..4], 7, .little);
    try reject(t.allocator, bad.bytes[0..bad.end], error.DuplicateChartObjectId, 3, 5);
    bad = f;
    std.mem.writeInt(u32, bad.bytes[bad.font..][0..4], 20, .little);
    try reject(t.allocator, bad.bytes[0..bad.end], error.DuplicateChartObjectId, 3, 5);
    var types = Types.init(t.allocator, .{});
    defer types.deinit();
    var reader: Reader = .{ .bytes = f.bytes[0..f.end], .offset = 1 };
    try t.expectError(error.UnsupportedChartTextReference, blocks.readObservedV2(&reader, &types, .{}));
    try t.expectEqual(@as(usize, 1), reader.offset);
}
