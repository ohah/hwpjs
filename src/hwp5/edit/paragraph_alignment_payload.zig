//! Clone one validated payload; resource insertion and ID mapping are separate.
const std = @import("std");
const Version = @import("../version.zig").Version;
const Shape = @import("../docinfo/para_shape.zig").ParaShape;

pub fn write(a: std.mem.Allocator, input: []const u8, version: Version, alignment: u32, max_bytes: usize) ![]u8 {
    if (alignment > 5) return error.InvalidParagraphAlignment;
    if (input.len > max_bytes) return error.LimitExceeded;
    const shape = try Shape.parse(input, version);
    const output = try a.dupe(u8, input);
    const attributes = (shape.attributes & ~@as(u32, 7 << 2)) | (alignment << 2);
    std.mem.writeInt(u32, output[0..4], attributes, .little);
    return output;
}

test "HWP5 paragraph alignment payload preserves version fields and unknown tails" {
    const a = std.testing.allocator;
    for ([_]u32{ 0x05000000, 0x05000107, 0x05000205, 0x05010000 }) |raw| {
        var input: [65]u8 = @splat(0xa5);
        std.mem.writeInt(u32, input[0..4], 0xf1234567, .little);
        for (0..6) |alignment| {
            const output = try write(a, &input, .{ .raw = raw }, @intCast(alignment), 100);
            defer a.free(output);
            try std.testing.expectEqualSlices(u8, input[4..], output[4..]);
            const before = try Shape.parse(&input, .{ .raw = raw });
            const after = try Shape.parse(output, .{ .raw = raw });
            try std.testing.expectEqual(@as(u32, @intCast(alignment)), (after.attributes >> 2) & 7);
            try std.testing.expectEqual(before.attributes & ~@as(u32, 28), after.attributes & ~@as(u32, 28));
            try std.testing.expectEqualDeep(before.modern_spacing, after.modern_spacing);
            try std.testing.expectEqual(before.level, after.level);
            try std.testing.expectEqualSlices(u8, before.extra, after.extra);
        }
    }
    var minimal: [42]u8 = @splat(0);
    for (0..42) |len| try std.testing.expectError(error.UnexpectedEnd, write(a, minimal[0..len], .{ .raw = 0x05000000 }, 1, 100));
    try std.testing.expectError(error.InvalidParagraphAlignment, write(a, &minimal, .{ .raw = 0x05000000 }, 6, 100));
    try std.testing.expectError(error.LimitExceeded, write(a, &minimal, .{ .raw = 0x05000000 }, 1, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            const output = try write(allocator, source, .{ .raw = 0x05000000 }, 3, 100);
            defer allocator.free(output);
            try std.testing.expectEqual(@as(u32, 12), std.mem.readInt(u32, output[0..4], .little));
        }
    }.run, .{&minimal});
}

test "HWP5 paragraph alignment payload clones actual DocInfo resources" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const decoded = try @import("../stream.zig").decode(a, &source.header, try source.file.readStream(a, "/DocInfo"), 4_000_000);
    defer a.free(decoded);
    var iterator = try @import("../docinfo/reader.zig").Iterator.init(decoded, source.header.version(), .{});
    var count: usize = 0;
    while (try iterator.next()) |record| {
        if (record.value != .para_shape) continue;
        const input = record.framing.payload;
        for (0..6) |alignment| {
            const output = try write(a, input, source.header.version(), @intCast(alignment), 4_000_000);
            defer a.free(output);
            try std.testing.expectEqualSlices(u8, input[4..], output[4..]);
            const attributes = std.mem.readInt(u32, output[0..4], .little);
            try std.testing.expectEqual(@as(u32, @intCast(alignment)), (attributes >> 2) & 7);
            try std.testing.expectEqual(record.value.para_shape.attributes & ~@as(u32, 28), attributes & ~@as(u32, 28));
        }
        count += 1;
    }
    try std.testing.expect(count > 0);
}
