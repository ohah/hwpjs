const std = @import("std");
const t = std.testing;
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const Objects = @import("object_table.zig").Table;
const plot = @import("plot_prefix.zig");
const surface = @import("surface_prefix.zig");
const fixture = @import("plot_surface_test_fixture.zig");
const Kind = fixture.Kind;
fn read(kind: Kind, r: *Reader, types: *Types, objects: *Objects) !void {
    switch (kind) {
        .plot => _ = try plot.readObservedEmptyArrayV4(r, types, objects),
        .surface => _ = try surface.readObservedEmptyArrayV1(r, types, objects),
    }
}
fn exercise(a: std.mem.Allocator, kind: Kind, start: usize, known: bool) !void {
    var f = fixture.make(kind, start, known, 0, 0);
    var types = Types.init(a, .{});
    defer types.deinit();
    if (known) try fixture.seed(&types, kind);
    var objects = Objects.init(a, .{ .max_objects = 2 });
    defer objects.deinit();
    var r: Reader = .{ .bytes = &f.bytes, .offset = start };
    switch (kind) {
        .plot => {
            const value = try plot.readObservedEmptyArrayV4(&r, &types, &objects);
            try t.expectEqual(f.end, value.end);
            try t.expectEqual(@as(u32, 0), value.object_id);
            try t.expectEqual(@as(u32, 7), value.initial.object_id);
            try t.expectEqual(f.raw, value.initial.end);
            try t.expectEqualSlices(u8, f.bytes[f.raw..][0..136], &value.raw);
            @memset(&f.bytes, 0);
            try t.expectEqual(@as(u8, 129), value.raw[0]);
        },
        .surface => {
            const value = try surface.readObservedEmptyArrayV1(&r, &types, &objects);
            try t.expectEqual(f.end, value.end);
            try t.expectEqual(f.end, value.array.end);
            try t.expectEqual(@as(u32, 0), value.object_id);
            try t.expectEqual(@as(u32, 7), value.array.object_id);
            try t.expectEqualSlices(u8, f.bytes[f.before..][0..30], &value.raw_before);
            try t.expectEqualSlices(u8, f.bytes[f.raw..][0..46], &value.raw_body);
            @memset(&f.bytes, 0);
            try t.expectEqual(@as(u8, 129), value.raw_before[0]);
            try t.expectEqual(@as(u8, 129), value.raw_body[0]);
        },
    }
    try t.expectEqual(f.end, r.offset);
    try t.expectEqual(@as(u32, 2), objects.entries.count());
    try t.expectEqual(@as(u32, 4), types.definitions.count());
}
test "plot surface prefixes offsets known new raw ownership and OOM" {
    for ([_]Kind{ .plot, .surface }) |kind| for ([_]bool{ false, true }) |known| {
        for ([_]usize{ 0, 1, 17, 257 }) |start| try exercise(t.allocator, kind, start, known);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ kind, @as(usize, 17), known });
    };
}
fn reject(kind: Kind, f: *const fixture.Fixture, start: usize, end: usize, known: bool, expected: anyerror, duplicate: ?u32, cap: usize) !void {
    var gpa: std.heap.DebugAllocator(.{ .safety = true }) = .init;
    {
        var types = Types.init(gpa.allocator(), .{});
        defer types.deinit();
        if (known) try fixture.seed(&types, kind);
        var objects = Objects.init(gpa.allocator(), .{ .max_objects = cap });
        defer objects.deinit();
        if (duplicate) |id| try objects.registerOther(id);
        var r: Reader = .{ .bytes = f.bytes[0..end], .offset = start };
        try t.expectError(expected, read(kind, &r, &types, &objects));
        try t.expectEqual(start, r.offset);
    }
    try t.expectEqual(.ok, gpa.deinit());
}
test "plot surface prefixes every cut null duplicate limit and array error precedence" {
    for ([_]Kind{ .plot, .surface }) |kind| for ([_]bool{ false, true }) |known| for ([_]usize{ 0, 1, 17, 257 }) |start| {
        const f = fixture.make(kind, start, known, 0, 0);
        for (start..f.end) |cut| try reject(kind, &f, start, cut, known, error.UnexpectedEnd, null, 2);
        for ([_]usize{ f.id, f.array }) |at| {
            var bad = f;
            std.mem.writeInt(u32, bad.bytes[at..][0..4], 0xffffffff, .little);
            try reject(kind, &bad, start, f.end, known, error.UnsupportedChartObjectReference, null, 2);
        }
        for ([_]u32{ 0, 7 }) |id| try reject(kind, &f, start, f.end, known, error.DuplicateChartObjectId, id, 3);
        for (0..2) |cap| try reject(kind, &f, start, f.end, known, error.LimitExceeded, null, cap);
        for ([_][2]u16{ .{ 1, 0 }, .{ 0, 1 }, .{ 1, 1 }, .{ 65535, 65535 } }) |words| {
            const bad = fixture.make(kind, start, known, words[0], words[1]);
            const expected = if (words[0] != words[1]) error.UnsupportedChartArrayLayout else if (kind == .plot) error.UnsupportedChartInitialArray else error.LimitExceeded;
            try reject(kind, &bad, start, bad.end, known, expected, null, 2);
        }
    };
}
test "plot surface prefixes every new declaration class version rejects" {
    for ([_]Kind{ .plot, .surface }) |kind| {
        const f = fixture.make(kind, 17, false, 0, 0);
        for (0..4) |slot| {
            var bad = f;
            bad.bytes[f.names[slot]] ^= 1;
            try reject(kind, &bad, 17, bad.end, false, error.UnsupportedChartClass, null, 2);
            bad = f;
            bad.bytes[f.versions[slot]] ^= 1;
            try reject(kind, &bad, 17, bad.end, false, error.UnsupportedChartTypeVersion, null, 2);
        }
    }
}

test "plot surface prefixes prior types are validated and inline identities cannot alias" {
    for ([_]Kind{ .plot, .surface }) |kind| {
        const f = fixture.make(kind, 17, true, 0, 0);
        for (0..4) |slot| for ([_]bool{ false, true }) |version| {
            var bad = f;
            var types = Types.init(t.allocator, .{});
            defer types.deinit();
            try fixture.seed(&types, kind);
            const id: u32 = @intCast(51 + slot * 19);
            if (version) {
                types.definitions.getPtr(id).?.version = 99;
            } else {
                std.mem.writeInt(u32, bad.bytes[f.refs[slot]..][0..4], if (slot == 0) 70 else 51, .little);
            }
            var objects = Objects.init(t.allocator, .{});
            defer objects.deinit();
            var r: Reader = .{ .bytes = bad.bytes[0..bad.end], .offset = 17 };
            try t.expectError(if (version) error.UnsupportedChartTypeVersion else error.UnsupportedChartClass, read(kind, &r, &types, &objects));
            try t.expectEqual(@as(usize, 17), r.offset);
        };
        var duplicate = f;
        std.mem.writeInt(u32, duplicate.bytes[f.array..][0..4], 0, .little);
        try reject(kind, &duplicate, 17, duplicate.end, true, error.DuplicateChartObjectId, null, 2);
    }
}
