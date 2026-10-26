//! 기존 snapshot JSON을 그대로 담는 선택적 요청/응답입니다.
const std = @import("std");
const Batch = @import("../hwpx/drawing_text_requested.zig");
pub const max_nodes = Batch.max_nodes;
pub const max_bytes = 16384;
pub fn decode(a: std.mem.Allocator, bytes: []const u8) ![]usize {
    if (bytes.len > max_bytes) return error.LimitExceeded;
    const parsed = std.json.parseFromSlice(std.json.Value, a, bytes, .{ .allocate = .alloc_always }) catch |err| {
        if (err == error.OutOfMemory) return err;
        return error.InvalidDrawingTextRequest;
    };
    defer parsed.deinit();
    if (parsed.value != .array) return error.InvalidDrawingTextRequest;
    const values = parsed.value.array.items;
    if (values.len > max_nodes) return error.LimitExceeded;
    const nodes = try a.alloc(usize, values.len);
    errdefer a.free(nodes);
    for (values, nodes) |value, *node| {
        if (value != .integer) return error.InvalidDrawingTextRequest;
        node.* = std.math.cast(u32, value.integer) orelse return error.InvalidDrawingTextRequest;
    }
    return nodes;
}

pub fn encode(a: std.mem.Allocator, report: *const Batch.Report) ![]u8 {
    if (report.entries.len > max_nodes) return error.LimitExceeded;
    var output: std.Io.Writer.Allocating = .init(a);
    defer output.deinit();
    var writer: std.json.Stringify = .{ .writer = &output.writer };
    project(&writer, report) catch |err| {
        if (err == error.WriteFailed) return error.OutOfMemory;
        return err;
    };
    return output.toOwnedSlice();
}
fn project(writer: *std.json.Stringify, report: *const Batch.Report) !void {
    try writer.beginArray();
    for (report.entries) |entry| {
        try writer.beginObject();
        try writer.objectField("node");
        try writer.write(entry.node);
        switch (entry.result) {
            .source => |source| {
                try writer.objectField("source");
                try writer.write(source);
            },
            .unavailable => |err| {
                if (err == error.OutOfMemory) return err;
                try writer.objectField("unavailable");
                try writer.write(@errorName(err));
            },
        }
        try writer.endObject();
    }
    try writer.endArray();
}

test "requested drawing JSON 범위 holes 순서 중복과 allocation 실패" {
    const a = std.testing.allocator;
    const nodes = try decode(a, "[122,0,94,122]");
    defer a.free(nodes);
    try std.testing.expectEqualSlices(usize, &.{ 122, 0, 94, 122 }, nodes);
    for ([_][]const u8{ "[null]", "[1.0]", "[true]", "[-1]", "[4294967296]", "[,1]", "{}", "[\"1\"]", "[1]x" }) |bad| try std.testing.expectError(error.InvalidDrawingTextRequest, decode(a, bad));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            const values = try decode(allocator, "[1,2,1]");
            defer allocator.free(values);
            try std.testing.expectEqualSlices(usize, &.{ 1, 2, 1 }, values);
        }
    }.run, .{});
    const entries = [_]Batch.Entry{.{ .node = 9, .result = .{ .unavailable = error.UnsupportedDrawingTextAnchor } }};
    var report = Batch.Report{ .entries = @constCast(&entries) };
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, value: *const Batch.Report) !void {
            const bytes = try encode(allocator, value);
            defer allocator.free(bytes);
            try std.testing.expectEqualStrings("[{\"node\":9,\"unavailable\":\"UnsupportedDrawingTextAnchor\"}]", bytes);
        }
    }.run, .{&report});
    const fatal = [_]Batch.Entry{.{ .node = 9, .result = .{ .unavailable = error.OutOfMemory } }};
    var oom = Batch.Report{ .entries = @constCast(&fatal) };
    try std.testing.expectError(error.OutOfMemory, encode(a, &oom));
}
