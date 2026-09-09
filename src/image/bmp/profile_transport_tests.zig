const std = @import("std");
const t = std.testing;
const p = @import("profile_transport.zig");
const f = @import("profile_fixture.zig");
test "BMP profile transport uses DIB relative offset and borrowed file regions" {
    const raw = try f.make(t.allocator, 0x4d424544, &.{ 7, 8, 9 }, 7, 9);
    defer t.allocator.free(raw);
    const view = (try p.inspect(raw, .{})).?;
    try t.expectEqual(.embedded, view.kind);
    try t.expectEqual(@as(usize, 161), view.file_offset);
    try t.expectEqual(@as(u32, 3), view.declared_size);
    try t.expectEqualSlices(u8, &.{ 7, 8, 9 }, view.data);
    try t.expectEqual(@as(usize, 3), view.stored_bytes);
    try t.expectEqual(@as(usize, 7), view.before_profile.len);
    try t.expectEqual(@as(usize, 9), view.after_profile.len);
    raw[161] = 42;
    try t.expectEqual(@as(u8, 42), view.data[0]);
    try t.expect(view.semantics_deferred);
}
test "BMP profile transport ignores inactive and non V5 profile members" {
    for ([_]u32{ 0, 0x73524742, 0x57696e20, 0xffffffff }) |space| {
        const raw = try f.make(t.allocator, space, &.{}, 0, 0);
        defer t.allocator.free(raw);
        f.put(raw, 126, u32, 0xffffffff);
        f.put(raw, 130, u32, 0xffffffff);
        try t.expect((try p.inspect(raw, .{ .max_profile_bytes = 0, .max_link_bytes = 0 })) == null);
    }
    for ([_]u32{ 40, 108 }) |size| {
        const raw = try @import("test_fixture.zig").extended(t.allocator, size);
        defer t.allocator.free(raw);
        if (size == 108) f.put(raw, 70, u32, 0x4d424544);
        try t.expect((try p.inspect(raw, .{})) == null);
    }
}
test "BMP profile transport offset and size cross product never reads pixels or outside file" {
    const raw = try f.make(t.allocator, 0x4d424544, &.{ 7, 8, 9 }, 7, 9);
    defer t.allocator.free(raw);
    for (0..raw.len + 2) |offset| for (0..33) |size| {
        f.put(raw, 126, u32, @intCast(offset));
        f.put(raw, 130, u32, @intCast(size));
        const start = offset + 14;
        if (start < 154 or start > raw.len) {
            try t.expectError(error.InvalidBmpProfileOffset, p.inspect(raw, .{}));
        } else if (size > raw.len - start) {
            try t.expectError(error.UnexpectedEnd, p.inspect(raw, .{}));
        } else {
            const view = (try p.inspect(raw, .{})).?;
            try t.expectEqualSlices(u8, raw[start..][0..size], view.data);
            try t.expectEqual(start, view.file_offset);
        }
    };
    f.put(raw, 126, u32, 0xffffffff);
    try t.expectError(error.InvalidBmpProfileOffset, p.inspect(raw, .{}));
    f.put(raw, 126, u32, 140);
    f.put(raw, 130, u32, 0xffffffff);
    try t.expectError(error.LimitExceeded, p.inspect(raw, .{}));
    try t.expectError(error.UnexpectedEnd, p.inspect(raw, .{ .max_profile_bytes = std.math.maxInt(usize) }));
}
test "BMP profile transport embedded empty present limits and all input cuts" {
    const raw = try f.make(t.allocator, 0x4d424544, &.{ 7, 8, 9 }, 0, 0);
    defer t.allocator.free(raw);
    for (0..raw.len) |n| try t.expectError(error.UnexpectedEnd, p.inspect(raw[0..n], .{}));
    try t.expectError(error.LimitExceeded, p.inspect(raw, .{ .max_profile_bytes = 2 }));
    try t.expectError(error.LimitExceeded, p.inspect(raw, .{ .structure = .{ .max_bytes = raw.len - 1 } }));
    const exact = (try p.inspect(raw, .{ .max_profile_bytes = 3 })).?;
    try t.expectEqual(@as(usize, 3), exact.data.len);
    f.put(raw, 126, u32, @intCast(raw.len - 14));
    f.put(raw, 130, u32, 0);
    try t.expectEqual(@as(usize, 0), (try p.inspect(raw, .{ .max_profile_bytes = 0 })).?.data.len);
}
test "BMP profile transport links preserve raw encoding and ignore embedded size" {
    const name = [_]u8{ '\\', '\\', 's', '\\', 0x80, 0xe9, '.', 'i', 'c', 'c', 0, 7 };
    const raw = try f.make(t.allocator, 0x4c494e4b, &name, 2, 3);
    defer t.allocator.free(raw);
    for ([_]u32{ 0, 1, 11, 0xffffffff }) |size| {
        f.put(raw, 130, u32, size);
        const view = (try p.inspect(raw, .{ .max_link_bytes = 11, .max_profile_bytes = 0 })).?;
        try t.expectEqual(.linked, view.kind);
        try t.expectEqual(size, view.declared_size);
        try t.expectEqualSlices(u8, name[0..10], view.data);
        try t.expectEqual(@as(usize, 11), view.stored_bytes);
        try t.expectEqual(@as(usize, 4), view.after_profile.len);
    }
    for (0..11) |limit| try t.expectError(error.LimitExceeded, p.inspect(raw, .{ .max_link_bytes = limit }));
    raw[156] = 0;
    try t.expectEqual(@as(usize, 0), (try p.inspect(raw, .{ .max_link_bytes = 1 })).?.data.len);
}
test "BMP profile transport cannot find link NUL outside declared file" {
    const raw = try f.make(t.allocator, 0x4c494e4b, &.{ 'a', 'b', 0 }, 0, 0);
    defer t.allocator.free(raw);
    f.put(raw, 2, u32, @intCast(raw.len - 1));
    try t.expectError(error.TrailingBmpBytes, p.inspect(raw, .{}));
    try t.expectError(error.UnterminatedBmpProfileLink, p.inspect(raw, .{ .structure = .{ .allow_trailing_bytes = true } }));
    try t.expectError(error.LimitExceeded, p.inspect(raw, .{ .structure = .{ .allow_trailing_bytes = true }, .max_link_bytes = 1 }));
}
