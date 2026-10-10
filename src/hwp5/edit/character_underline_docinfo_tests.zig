const std = @import("std");
const writer = @import("character_property_docinfo.zig");
const Iterator = @import("../record.zig").Iterator;

fn verify(before: []const u8, result: writer.Result) !void {
    var original = Iterator.init(before, .{});
    var saved = Iterator.init(result.bytes, .{});
    var template: ?[]const u8 = null;
    var index: u32 = 0;
    var inserted = false;
    while (try saved.next()) |record| {
        if (record.tag == 21) {
            if (index == result.id) {
                const expected = try std.testing.allocator.dupe(u8, template.?);
                defer std.testing.allocator.free(expected);
                expected[46] = (expected[46] & ~@as(u8, 12)) | 12;
                try std.testing.expectEqualSlices(u8, expected, record.payload);
                try std.testing.expectEqual(@as(u16, 1), record.level);
                inserted = true;
                continue;
            }
            index += 1;
        }
        const old = (try original.next()).?;
        try std.testing.expectEqual(old.tag, record.tag);
        try std.testing.expectEqual(old.level, record.level);
        try std.testing.expectEqualSlices(u8, old.raw[0 .. old.raw.len - old.payload.len], record.raw[0 .. record.raw.len - record.payload.len]);
        if (old.tag == 21 and template == null) template = old.payload;
        if (old.tag == 17) {
            try std.testing.expectEqualSlices(u8, old.payload[0..36], record.payload[0..36]);
            try std.testing.expectEqualSlices(u8, old.payload[40..], record.payload[40..]);
            try std.testing.expectEqual(std.mem.readInt(i32, old.payload[36..40], .little) + 1, std.mem.readInt(i32, record.payload[36..40], .little));
        } else try std.testing.expectEqualSlices(u8, old.raw, record.raw);
    }
    try std.testing.expect(inserted);
    try std.testing.expect((try original.next()) == null);
}

test "HWP5 underline DocInfo actual resource clone preserves original records" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/underline-styles.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try @import("../stream.zig").decode(a, &source.header, try source.file.readStream(a, "/DocInfo"), 4_000_000);
    defer a.free(decoded);
    const result = try writer.writeUnderline(a, decoded, source.header.version(), 0, .top, 4_000_000);
    defer a.free(result.bytes);
    try verify(decoded, result);
}

test "HWP5 underline DocInfo allocation failures preserve opaque child and input" {
    const a = std.testing.allocator;
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    var mappings: [60]u8 = @splat(0);
    std.mem.writeInt(i32, mappings[36..40], 1, .little);
    const append = @import("../record_writer.zig").append;
    try append(a, &input, 17, 0, &mappings, 4096);
    try append(a, &input, 21, 1, &@as([68]u8, @splat(0xa5)), 4096);
    try append(a, &input, 999, 2, "opaque child", 4096);
    try append(a, &input, 998, 1, "opaque next", 4096);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const hash = std.hash.Wyhash.hash(0, source);
            defer std.debug.assert(hash == std.hash.Wyhash.hash(0, source));
            const result = try writer.writeUnderline(allocator, source, .{ .raw = 0x05000000 }, 0, .top, 4096);
            defer allocator.free(result.bytes);
            try verify(source, result);
        }
    }.run, .{input.items});
    try std.testing.expectError(error.InvalidCharacterShapeReference, writer.writeUnderline(a, input.items, .{ .raw = 0x05000000 }, 1, .bottom, 4096));
    try std.testing.expectError(error.LimitExceeded, writer.writeUnderline(a, input.items, .{ .raw = 0x05000000 }, 0, .bottom, input.items.len));
}
