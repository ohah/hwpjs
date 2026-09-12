const std = @import("std");
const t = std.testing;
const container = @import("container.zig");
const envelope = container.envelope;
const writer = @import("../../cfb/writer.zig");

test "OLE envelope exact length borrowed slices and all prefix cuts" {
    var bytes = [_]u8{ 3, 0, 0, 0, 7, 8, 9 };
    const raw = try envelope.payload(&bytes, .raw_cfb, bytes.len);
    try t.expect(raw.ptr == bytes[0..].ptr);
    const inner = try envelope.payload(&bytes, .observed_size_prefix, bytes.len);
    try t.expect(inner.ptr == bytes[4..].ptr);
    try t.expectEqualSlices(u8, &.{ 7, 8, 9 }, inner);
    for (0..4) |cut| try t.expectError(error.UnexpectedEnd, envelope.payload(bytes[0..cut], .observed_size_prefix, bytes.len));
    for (4..bytes.len) |cut| try t.expectError(error.InvalidOleEnvelopeSize, envelope.payload(bytes[0..cut], .observed_size_prefix, bytes.len));
    for ([_]u32{ 0, 2, 4, 255, 65536, std.math.maxInt(u32) }) |size| {
        std.mem.writeInt(u32, bytes[0..4], size, .little);
        try t.expectError(error.InvalidOleEnvelopeSize, envelope.payload(&bytes, .observed_size_prefix, bytes.len));
    }
    for ([_]envelope.Layout{ .raw_cfb, .observed_size_prefix }) |layout|
        try t.expectError(error.LimitExceeded, envelope.payload(&bytes, layout, bytes.len - 1));
    try t.expectEqual(@as(usize, 0), (try envelope.payload(&.{ 0, 0, 0, 0 }, .observed_size_prefix, 4)).len);
}

fn exercise(a: std.mem.Allocator, version: u16, invalid: bool) !void {
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "Contents", .parent = 0, .content = "opaque" },
        .{ .name = "Unknown", .parent = 0, .content = "preserved" },
    };
    const raw = try writer.write(a, &nodes, .{ .version = version });
    defer a.free(raw);
    const bytes = try a.alloc(u8, raw.len + 4);
    defer a.free(bytes);
    std.mem.writeInt(u32, bytes[0..4], @intCast(raw.len), .little);
    @memcpy(bytes[4..], raw);
    // Header CLSID is reserved and must be zero under strict CFB rules.
    if (invalid) bytes[4 + 8] = 1;
    for ([_]envelope.Layout{ .raw_cfb, .observed_size_prefix }) |layout| {
        const input = if (layout == .raw_cfb) bytes[4..] else bytes;
        if (invalid) {
            if (container.open(a, input, layout, .{})) |value| {
                var file = value;
                file.deinit();
                return error.ExpectedStrictRejection;
            } else |err| switch (err) {
                error.OutOfMemory => return err,
                else => try t.expectEqual(error.InvalidHeader, err),
            }
        } else {
            var file = try container.open(a, input, layout, .{ .max_input_bytes = input.len });
            defer file.deinit();
            try t.expectEqual(version, file.header.major);
            const index = (try file.findExact("/Unknown")).?;
            try t.expectEqualStrings("preserved", file.entries[index].content);
            try t.expectError(error.LimitExceeded, container.open(a, input, layout, .{ .max_input_bytes = input.len - 1 }));
            if (container.open(a, input, layout, .{ .max_stream_bytes = 1 })) |value| {
                var unexpected = value;
                unexpected.deinit();
                return error.ExpectedStreamLimit;
            } else |err| switch (err) {
                error.OutOfMemory => return err,
                else => try t.expectEqual(error.LimitExceeded, err),
            }
        }
    }
}

test "OLE container v3 v4 strict boundaries ownership and allocation failures" {
    for ([_]u16{ 3, 4 }) |version| {
        for ([_]bool{ false, true }) |invalid| {
            try exercise(t.allocator, version, invalid);
            try t.checkAllAllocationFailures(t.allocator, exercise, .{ version, invalid });
            var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
            defer t.expect(gpa.deinit() == .ok) catch @panic("OLE allocator leak");
            try exercise(gpa.allocator(), version, invalid);
            try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
        }
    }
}
