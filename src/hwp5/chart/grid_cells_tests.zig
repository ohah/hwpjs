const std = @import("std");
const t = std.testing;
const grid = @import("grid_cells.zig");
const Reader = @import("../../binary/reader.zig").Reader;
const values = @import("cell_value.zig");

fn integer(a: std.mem.Allocator, out: *std.ArrayList(u8), comptime T: type, value: T) !void {
    var bytes: [@sizeOf(T)]u8 = undefined;
    std.mem.writeInt(T, &bytes, value, .little);
    try out.appendSlice(a, &bytes);
}
fn declaration(a: std.mem.Allocator, out: *std.ArrayList(u8), id: u32, name: []const u8, version: u16) !void {
    try integer(a, out, u32, id);
    try integer(a, out, u16, @intCast(name.len));
    try out.appendSlice(a, name);
    try integer(a, out, u16, version);
}
const Fixture = struct { bytes: []u8, starts: [6]usize, ends: [6]usize };
fn fixture(a: std.mem.Allocator) !Fixture {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendNTimes(a, 0xa5, 36);
    try integer(a, &out, u32, 0);
    try declaration(a, &out, 9, "VtChart\x00", 6);
    try integer(a, &out, u32, 1);
    try declaration(a, &out, 7, "VtDataGrid\x00", 1);
    try declaration(a, &out, 100, "VtMatrix\x00", 1);
    try declaration(a, &out, 3, "VtCollection\x00", 1);
    try integer(a, &out, u16, 19);
    try declaration(a, &out, 90, "VtObject\x00", 1);
    try integer(a, &out, u16, 2);
    try integer(a, &out, u16, 3);
    var starts: [6]usize = undefined;
    var ends: [6]usize = undefined;
    for ([_]?u32{ null, 400, null, 0, 17, null }, 0..) |id, i| {
        starts[i] = out.items.len;
        try integer(a, &out, u32, id orelse 0xffffffff);
        if (id != null) {
            if (i == 1) {
                try declaration(a, &out, 55, "VtString\x00", 1);
                try integer(a, &out, u16, 8);
                try out.appendSlice(a, &.{ 0x20, 0, 0, 0, 0x30, 0, 0, 0xff });
                try integer(a, &out, u8, 170);
                try declaration(a, &out, 56, "VtValue\x00", 1);
            } else if (i == 3) {
                try declaration(a, &out, 57, "VtDouble\x00", 1);
                try integer(a, &out, u64, 0x7ff8000000001234);
                try integer(a, &out, u16, 0x1234);
                try integer(a, &out, u32, 56);
            } else {
                try integer(a, &out, u32, 55);
                try integer(a, &out, u16, 3);
                try out.appendSlice(a, " \x00 ");
                try integer(a, &out, u8, 255);
                try integer(a, &out, u32, 56);
            }
            try integer(a, &out, u32, 90);
        }
        ends[i] = out.items.len;
    }
    try out.appendSlice(a, "VtChartTitle\x00");
    std.mem.writeInt(u32, out.items[32..36], @intCast(out.items.len - 36), .little);
    return .{ .bytes = try out.toOwnedSlice(a), .starts = starts, .ends = ends };
}

fn success(a: std.mem.Allocator, f: Fixture) !void {
    var value = try grid.readObservedV6(a, f.bytes, .{ .max_string_bytes = 8, .max_total_string_bytes = 11 });
    defer value.deinit();
    try t.expectEqual(@as(usize, 6), value.cells.len);
    try t.expectEqual(@as(usize, 11), value.string_bytes);
    try t.expectEqual(f.ends[5], value.payload_offset);
    try t.expectEqual(@as(u32, 8), value.prelude.types.definitions.count());
    for (value.cells, f.starts, f.ends, [_]?u32{ null, 400, null, 0, 17, null }) |cell, start, end, id| {
        try t.expectEqual(start, cell.start);
        try t.expectEqual(end, cell.end);
        try t.expectEqual(id, cell.object_id);
        if (id == null) try t.expect(cell.value == .empty);
    }
    try t.expectEqual(@as(u8, 170), value.cells[1].value.string.trailer);
    try t.expectEqualSlices(u8, &.{ 0x20, 0, 0, 0, 0x30, 0, 0, 0xff }, value.cells[1].value.string.bytes);
    try t.expectEqual(@as(u64, 0x7ff8000000001234), value.cells[3].value.number.bits);
    try t.expectEqual(@as(u16, 0x1234), value.cells[3].value.number.trailer);
    try t.expectEqualStrings(" \x00 ", value.cells[4].value.string.bytes);
    try t.expect(value.cells[4].value.string.bytes.ptr == f.bytes[f.starts[4] + 10 ..].ptr);
}
fn reject(a: std.mem.Allocator, bytes: []const u8, options: grid.Options, expected: anyerror) !void {
    var value = grid.readObservedV6(a, bytes, options) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    defer value.deinit();
    return error.ExpectedGridRejection;
}

test "chart grid cells preserve null slots sparse ids raw values and borrowing" {
    const f = try fixture(t.allocator);
    defer t.allocator.free(f.bytes);
    try success(t.allocator, f);
    try t.checkAllAllocationFailures(t.allocator, success, .{f});
}

test "chart grid cells cut each byte and enforce independent quotas without leaks" {
    const f = try fixture(t.allocator);
    defer t.allocator.free(f.bytes);
    const full_extent = std.mem.readInt(u32, f.bytes[32..36], .little);
    for (0..f.ends[5]) |cut| {
        if (cut >= 36) std.mem.writeInt(u32, f.bytes[32..36], @intCast(cut - 36), .little);
        try reject(t.allocator, f.bytes[0..cut], .{}, error.UnexpectedEnd);
    }
    std.mem.writeInt(u32, f.bytes[32..36], full_extent, .little);
    for ([_]grid.Options{ .{ .max_string_bytes = 7 }, .{ .max_total_string_bytes = 10 }, .{ .prelude = .{ .max_cells = 5 } }, .{ .prelude = .{ .types = .{ .max_types = 7 } } } }) |options| {
        try t.checkAllAllocationFailures(t.allocator, reject, .{ f.bytes, options, error.LimitExceeded });
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("grid leak");
        try reject(gpa.allocator(), f.bytes, options, error.LimitExceeded);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
    }
    std.mem.writeInt(u32, f.bytes[f.starts[4]..][0..4], 400, .little);
    try t.checkAllAllocationFailures(t.allocator, reject, .{ f.bytes, grid.Options{}, error.UnsupportedChartObjectReference });
}

test "chart cell values are atomic on cuts and preserve all numeric bit patterns" {
    var bytes = [_]u8{ 3, 0, 32, 0, 32, 255 };
    for (0..bytes.len) |cut| {
        var reader: Reader = .{ .bytes = bytes[0..cut] };
        try t.expectError(error.UnexpectedEnd, values.read(&reader, "VtString\x00", 3));
        try t.expectEqual(@as(usize, 0), reader.offset);
    }
    var reader: Reader = .{ .bytes = &bytes };
    try t.expectError(error.LimitExceeded, values.read(&reader, "VtString\x00", 2));
    try t.expectEqual(@as(usize, 0), reader.offset);
    try t.expectError(error.UnsupportedChartClass, values.read(&reader, "VtUnknown\x00", 3));
    try t.expectEqual(@as(usize, 0), reader.offset);
    for ([_]u64{ 0, 0x8000000000000000, 0x7ff0000000000000, 0xfff0000000000000, 0x7ff0000000000001, 0x7ff8000000001234, 1, 0xffffffffffffffff }) |bits| {
        var number: [10]u8 = undefined;
        std.mem.writeInt(u64, number[0..8], bits, .little);
        std.mem.writeInt(u16, number[8..10], 0xa5a5, .little);
        reader = .{ .bytes = &number };
        const value = try values.read(&reader, "VtDouble\x00", 0);
        try t.expectEqual(bits, value.number.bits);
        try t.expectEqual(@as(u16, 0xa5a5), value.number.trailer);
        for (0..10) |cut| {
            reader = .{ .bytes = number[0..cut] };
            try t.expectError(error.UnexpectedEnd, values.read(&reader, "VtDouble\x00", 0));
            try t.expectEqual(@as(usize, 0), reader.offset);
        }
    }
}

test "chart grid cells reject wrong base types and late versions with OOM cleanup" {
    const f = try fixture(t.allocator);
    defer t.allocator.free(f.bytes);
    const last = f.ends[4];
    for ([_]usize{ last - 4, last - 8 }) |at| {
        const original = std.mem.readInt(u32, f.bytes[at..][0..4], .little);
        std.mem.writeInt(u32, f.bytes[at..][0..4], 55, .little);
        try t.checkAllAllocationFailures(t.allocator, reject, .{ f.bytes, grid.Options{}, error.UnsupportedChartClass });
        std.mem.writeInt(u32, f.bytes[at..][0..4], original, .little);
    }
    f.bytes[f.starts[3] + 19] = 2;
    try t.checkAllAllocationFailures(t.allocator, reject, .{ f.bytes, grid.Options{}, error.UnsupportedChartTypeVersion });
}

test "chart cell strings preserve zero and maximum byte counts and empty grids allocate no slots" {
    for ([_]usize{ 0, 1, 255, 256, 65535 }) |count| {
        const bytes = try t.allocator.alloc(u8, count + 3);
        defer t.allocator.free(bytes);
        @memset(bytes, 0xa5);
        std.mem.writeInt(u16, bytes[0..2], @intCast(count), .little);
        var reader: Reader = .{ .bytes = bytes };
        const value = try values.read(&reader, "VtString\x00", count);
        try t.expectEqual(count, value.string.bytes.len);
        try t.expectEqualSlices(u8, bytes[2..][0..count], value.string.bytes);
        try t.expect(value.string.bytes.ptr == bytes[2..].ptr);
        try t.expectEqual(@as(u8, 0xa5), value.string.trailer);
        try t.expectEqual(bytes.len, reader.offset);
    }
    const f = try fixture(t.allocator);
    defer t.allocator.free(f.bytes);
    std.mem.writeInt(u16, f.bytes[136..138], 0, .little);
    std.mem.writeInt(u16, f.bytes[138..140], 65535, .little);
    var value = try grid.readObservedV6(t.allocator, f.bytes, .{ .prelude = .{ .max_cells = 0 } });
    defer value.deinit();
    try t.expectEqual(@as(usize, 0), value.cells.len);
    try t.expectEqual(@as(usize, 140), value.payload_offset);
}
