const std = @import("std");
const locator = @import("section_count.zig");
const fixture = @import("../document/test_fixture.zig");
const version: @import("../version.zig").Version = .{ .raw = 0x05000107 };

test "section count locator uses framed offsets for compact and extended headers without losing tails" {
    const a = std.testing.allocator;
    for ([_]usize{ 14, 26, 27 }) |size| for ([_]bool{ false, true }) |extended| {
        var out: std.ArrayList(u8) = .empty;
        defer out.deinit(a);
        try fixture.frame(a, &out, 900, 0, &.{ 1, 2, 3 });
        const payload = try a.alloc(u8, size);
        defer a.free(payload);
        @memset(payload, 0xa5);
        fixture.put(payload, 0, u16, 9);
        if (extended) {
            var header: [8]u8 = undefined;
            fixture.put(&header, 0, u32, 16 | (0xfff << 20));
            fixture.put(&header, 4, u32, @intCast(size));
            try out.appendSlice(a, &header);
            try out.appendSlice(a, payload);
        } else try fixture.frame(a, &out, 16, 0, payload);
        const site = try locator.locate(out.items, version);
        try std.testing.expectEqual(@as(u16, 9), site.value);
        try std.testing.expectEqual(@as(usize, if (extended) 15 else 11), site.payload_offset);
        try std.testing.expectEqualSlices(u8, payload, out.items[site.payload_offset..]);
    };
}

test "section count locator preserves framing level duplicate length and version refusals" {
    const a = std.testing.allocator;
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    const payload = [_]u8{0} ** 26;
    try std.testing.expectError(error.MissingDocumentProperties, locator.locate(&.{}, version));
    for ([_]usize{ 0, 1, 15, 25 }) |length| {
        out.clearRetainingCapacity();
        try fixture.frame(a, &out, 16, 0, payload[0..length]);
        try std.testing.expectError(error.InvalidDocumentPropertiesLength, locator.locate(out.items, version));
    }
    out.clearRetainingCapacity();
    try fixture.frame(a, &out, 16, 1, &payload);
    try std.testing.expectError(error.InvalidDocInfoLevel, locator.locate(out.items, version));
    out.clearRetainingCapacity();
    try fixture.frame(a, &out, 16, 0, &payload);
    try std.testing.expectError(error.UnsupportedVersion, locator.locate(out.items, .{ .raw = 0x06000000 }));
    try out.append(a, 0);
    try std.testing.expectError(error.UnexpectedEnd, locator.locate(out.items, version));
    out.items.len -= 1;
    try fixture.frame(a, &out, 16, 0, &payload);
    try std.testing.expectError(error.DuplicateDocumentProperties, locator.locate(out.items, version));
}
