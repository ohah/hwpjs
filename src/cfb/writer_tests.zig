const std = @import("std");
const writer = @import("writer.zig");
const File = @import("reader.zig").File;
const names = @import("name_order.zig");
const a = std.testing.allocator;

test "canonical writer roundtrip across versions and stream boundaries" {
    const payload = try a.alloc(u8, 8193);
    defer a.free(payload);
    for (payload, 0..) |*byte, i| byte.* = @intCast(i % 251);
    for ([_]u16{ 3, 4 }) |version| {
        for ([_]usize{ 0, 1, 63, 64, 65, 511, 512, 513, 4095, 4096, 4097, 8193 }) |size| {
            const nodes = [_]writer.Node{
                .{ .name = "Root Entry", .kind = 5 },
                .{ .name = "Data", .parent = 2, .content = payload[0..size] },
                .{ .name = "Folder", .parent = 0, .kind = 1, .state = 17, .modified = 0x8000000000000001 },
                .{ .name = "Empty", .parent = 2 },
            };
            const bytes = try writer.write(a, &nodes, .{ .version = version });
            defer a.free(bytes);
            var file = try File.open(a, bytes, .{ .strict = true });
            defer file.deinit();
            try std.testing.expectEqualSlices(u8, payload[0..size], file.entries[1].content);
            try std.testing.expectEqualStrings("Root Entry/Folder/Data", file.entries[1].path);
            try std.testing.expectEqual(@as(u64, 0x8000000000000001), file.entries[2].modified);
        }
    }
}

fn allocationFailures(allocator: std.mem.Allocator) !void {
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "Mini", .parent = 0, .content = "abc" },
        .{ .name = "Regular", .parent = 0, .content = &([_]u8{7} ** 4097) },
    };
    const bytes = try writer.write(allocator, &nodes, .{});
    defer allocator.free(bytes);
    var file = try File.open(allocator, bytes, .{ .strict = true });
    defer file.deinit();
    const editable = try file.toNodes(allocator);
    defer allocator.free(editable);
    const rebuilt = try writer.write(allocator, editable, .{});
    defer allocator.free(rebuilt);
    try std.testing.expectEqualSlices(u8, bytes, rebuilt);
}
test "writer and strict reader clean up every allocation failure" {
    try std.testing.checkAllAllocationFailures(a, allocationFailures, .{});
}

test "CFB simple uppercase ordering does not perform full Unicode expansions" {
    try std.testing.expect(names.order(try names.Name.init("ß"), try names.Name.init("SS")) != .eq);
    try std.testing.expectEqual(.eq, names.order(try names.Name.init("ᾀ"), try names.Name.init("ᾈ")));
    try std.testing.expect(names.order(try names.Name.init("𐐨"), try names.Name.init("𐐀")) != .eq);
    try std.testing.expectEqual(.lt, names.order(try names.Name.init("z"), try names.Name.init("aa")));
}

test "layout reserves range lock and rejects overflowing or v3 oversized output" {
    const Layout = @import("writer_layout.zig").Layout;
    const lock = @import("strict.zig").rangeLock(4096);
    const plan = try Layout.init(lock + 8, 4, std.math.maxInt(usize));
    try std.testing.expectEqual(lock - 1, plan.id(lock - 1));
    try std.testing.expectEqual(lock + 1, plan.id(lock));
    try std.testing.expect(plan.bytes > 0x80000000);
    try std.testing.expectError(error.InvalidFileSize, Layout.init(0x80000000 / 512, 3, std.math.maxInt(usize)));
    try std.testing.expectError(error.Overflow, Layout.init(std.math.maxInt(usize), 4, std.math.maxInt(usize)));
}

test "writer rejects duplicate names, cycles and invalid metadata" {
    var nodes = [_]writer.Node{ .{ .name = "Root Entry", .kind = 5 }, .{ .name = "a", .parent = 0 }, .{ .name = "A", .parent = 0 } };
    try std.testing.expectError(error.DuplicateName, writer.write(a, &nodes, .{}));
    nodes[2].name = "b";
    nodes[1].kind = 1;
    nodes[2].kind = 1;
    nodes[1].parent = 2;
    nodes[2].parent = 1;
    try std.testing.expectError(error.OrphanEntry, writer.write(a, &nodes, .{}));
    nodes[1].parent = 0;
    nodes[2].parent = 0;
    nodes[1].kind = 2;
    nodes[1].created = 1;
    try std.testing.expectError(error.InvalidStreamMetadata, writer.write(a, &nodes, .{}));
    nodes[1].created = 0;
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &nodes, .{ .limits = .{ .max_entries = 2 } }));
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &nodes, .{ .limits = .{ .max_input_bytes = 1535 } }));
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &nodes, .{ .limits = .{ .max_path_bytes = 1 } }));
    nodes[1].content = "ab";
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &nodes, .{ .limits = .{ .max_stream_bytes = 1 } }));
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &nodes, .{ .limits = .{ .max_total_stream_bytes = 1 } }));
}
