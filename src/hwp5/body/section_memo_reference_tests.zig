const std = @import("std");
const fixture = @import("../document/test_fixture.zig");
const validation = @import("section_validation.zig");
const Tree = @import("tree.zig").Tree;

fn section(a: std.mem.Allocator, id: u16) ![]u8 {
    const base = try fixture.section(a);
    defer a.free(base);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, base[0..48]);
    var control: [47]u8 = @splat(0);
    @memcpy(control[0..30], base[52..82]);
    fixture.put(&control, 34, u16, id);
    try fixture.frame(a, &out, 71, 1, &control);
    try out.appendSlice(a, base[82..]);
    return out.toOwnedSlice(a);
}

test "section memo reference distinguishes absent count from zero and validates one based IDs" {
    const a = std.testing.allocator;
    for ([_]u16{ 0, 1, 2, 65535 }) |id| {
        const bytes = try section(a, id);
        defer a.free(bytes);
        var tree = try Tree.parse(a, bytes, .{ .raw = 0x05000107 }, .{});
        defer tree.deinit(a);
        const deferred = try validation.inspect(tree, .{ .raw = 0x05000107 }, 0, 0);
        try std.testing.expectEqual(@as(usize, @intFromBool(id != 0)), deferred.memo_references_deferred);
        for ([_]usize{ 0, 1, 2, 65535 }) |count| {
            if (id != 0 and id > count) {
                try std.testing.expectError(error.InvalidResourceReference, validation.inspectWithMemoShapes(tree, .{ .raw = 0x05000107 }, 0, 0, count));
            } else {
                const report = try validation.inspectWithMemoShapes(tree, .{ .raw = 0x05000107 }, 0, 0, count);
                try std.testing.expectEqual(@as(usize, @intFromBool(id != 0)), report.memo_references);
                try std.testing.expectEqual(@as(usize, 0), report.memo_references_deferred);
            }
        }
    }
}

test "decoded document section validates actual memo resources rather than mapping presence" {
    const a = std.testing.allocator;
    const document = @import("../document/validation.zig");
    const options: document.Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
    const base = try fixture.docInfo(a, 1);
    defer a.free(base);
    var info: std.ArrayList(u8) = .empty;
    defer info.deinit(a);
    try info.appendSlice(a, base);
    const memo: [22]u8 = @splat(0);
    try fixture.frame(a, &info, 92, 1, &memo);
    const header = fixture.header();
    for ([_]u16{ 0, 1, 2 }) |id| {
        const bytes = try section(a, id);
        defer a.free(bytes);
        const input: document.Input = .{ .header = &header, .doc_info = info.items, .sections = &.{.{ .index = 0, .bytes = bytes }} };
        if (id == 2) {
            try std.testing.expectError(error.InvalidResourceReference, document.inspectDecoded(a, input, options));
        } else {
            var report = try document.inspectDecoded(a, input, options);
            defer report.deinit(a);
            try std.testing.expectEqual(@as(usize, 1), report.doc_info.resources.memo_shape_count);
            try std.testing.expectEqual(@as(usize, @intFromBool(id != 0)), report.sections[0].definition.memo_references);
            try std.testing.expectEqual(@as(usize, 0), report.sections[0].definition.memo_references_deferred);
        }
    }
}

test "section memo reference document failures release every partial allocation" {
    const a = std.testing.allocator;
    const document = @import("../document/validation.zig");
    const base = try fixture.docInfo(a, 1);
    defer a.free(base);
    var info: std.ArrayList(u8) = .empty;
    defer info.deinit(a);
    try info.appendSlice(a, base);
    try fixture.frame(a, &info, 92, 1, &@as([22]u8, @splat(0)));
    const header = fixture.header();
    for ([_]u16{ 1, 2 }) |id| {
        const bytes = try section(a, id);
        defer a.free(bytes);
        const input: document.Input = .{ .header = &header, .doc_info = info.items, .sections = &.{.{ .index = 0, .bytes = bytes }} };
        try @import("../../testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, source: document.Input, invalid: bool) !void {
                const options: document.Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } };
                var report = document.inspectDecoded(allocator, source, options) catch |err| {
                    if (invalid and err == error.InvalidResourceReference) return;
                    return err;
                };
                defer report.deinit(allocator);
                if (invalid) return error.ExpectedInvalidMemoReference;
                try std.testing.expectEqual(@as(usize, 1), report.sections[0].definition.memo_references);
            }
        }.run, .{ input, id == 2 });
    }
}
