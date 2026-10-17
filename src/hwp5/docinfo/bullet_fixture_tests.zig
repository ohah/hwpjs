const std = @import("std");

test "actual compact empty bullet records retain all three characters and source bytes" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue4514/sample1-repro.hwp", a, .limited(64000000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 32000000);
    defer a.free(info);
    var iterator = try @import("reader.zig").Iterator.init(info, source.header.version(), .{});
    const expected = [_]u16{ 0x25a1, 0x002d, 0x203b };
    var count: usize = 0;
    while (try iterator.next()) |record| switch (record.value) {
        .bullet => |value| {
            try std.testing.expect(count < expected.len);
            try std.testing.expectEqual(expected[count], value.character);
            try std.testing.expectEqual(@as(u16, 0), value.check_character.?);
            try std.testing.expectEqual(@as(i32, 0), value.image.?.identifier);
            try std.testing.expectEqual(@as(u16, 0), value.image.?.bin_data_id);
            try std.testing.expectEqual(@as(usize, 0), value.extra.len);
            count += 1;
        },
        else => {},
    };
    try std.testing.expectEqual(expected.len, count);
    try std.testing.expectEqualSlices(u8, before, input);
}
