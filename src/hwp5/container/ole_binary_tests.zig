const std = @import("std");
const t = std.testing;
const ole = @import("ole_binaries.zig");
const container = @import("validation.zig");
const opts: container.Options = .{ .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };

fn payload(a: std.mem.Allocator) ![]u8 {
    const raw = try @import("../../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "Data", .parent = 0, .content = "abc" },
    }, .{});
    defer a.free(raw);
    const out = try a.alloc(u8, 4 + raw.len);
    std.mem.writeInt(u32, out[0..4], @intCast(raw.len), .little);
    @memcpy(out[4..], raw);
    return out;
}

test "OLE BinData budget selection and failures preserve accumulated state" {
    const bytes = try payload(t.allocator);
    defer t.allocator.free(bytes);
    var budget: ole.Budget = .{ .options = .{ .layout = .observed_size_prefix, .max_containers = 2 } };
    for ([_]?[]const u8{ null, &.{ 'o', 0, 'l', 0 }, &.{ 'o', 0, 'l', 0, 'e', 1 }, &.{ 'o', 0, 'l', 0, 'e' }, &.{ 'o', 0, 'l', 0, 'e', 0, 0, 0 } }) |extension|
        try budget.consume(t.allocator, bytes, false, extension);
    try t.expectEqual(@as(usize, 5), budget.report.unhandled_binaries);
    try budget.consume(t.allocator, bytes, false, &.{ 'O', 0, 'l', 0, 'E', 0 });
    try budget.consume(t.allocator, bytes, true, null);
    const expected: ole.Report = .{ .binaries = 7, .unhandled_binaries = 5, .containers = 2, .envelope_bytes = 2 * bytes.len, .streams = 2, .stream_bytes = 6, .entries = 8, .path_bytes = 56 };
    try t.expectEqualDeep(expected, budget.report);
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, bytes, true, null));
    try t.expectEqualDeep(expected, budget.report);
    budget.options.max_containers = 3;
    try t.expectError(error.UnexpectedEnd, budget.consume(t.allocator, "bad", true, null));
    try t.expectEqualDeep(expected, budget.report);
}

fn connected(a: std.mem.Allocator, bytes: []const u8, selected: bool) !void {
    var options = opts;
    if (selected) options.ole = .{ .layout = .observed_size_prefix };
    var result = try container.inspect(a, bytes, options);
    defer result.deinit(a);
    try t.expectEqual(selected, result.ole != null);
    try t.expectEqual(@as(usize, 2), result.binary_data.decoded);
    if (result.ole) |report| {
        try t.expectEqual(@as(usize, 2), report.containers);
        try t.expectEqual(@as(usize, 2), report.binaries);
        try t.expectEqual(@as(usize, 0), report.unhandled_binaries);
        try t.expectEqual(@as(usize, 6), report.stream_bytes);
        try t.expectEqual(@as(usize, 8), report.entries);
        try t.expectEqual(@as(usize, 56), report.path_bytes);
        try t.expectEqual(result.binary_data.decoded_bytes, report.envelope_bytes);
    }
}

fn rejected(a: std.mem.Allocator, bytes: []const u8, options: container.Options, expected: anyerror) !void {
    var report = container.inspect(a, bytes, options) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(expected, err);
        return;
    };
    defer report.deinit(a);
    return error.ExpectedOleRejection;
}

test "OLE BinData container budgets cover repeated references and late cleanup" {
    const inner = try payload(t.allocator);
    defer t.allocator.free(inner);
    const bytes = try @import("image_fixture.zig").withExtension(t.allocator, inner, 2, "OlE");
    defer t.allocator.free(bytes);
    for ([_]bool{ false, true }) |selected| {
        try connected(t.allocator, bytes, selected);
        try t.checkAllAllocationFailures(t.allocator, connected, .{ bytes, selected });
    }
    var plain = try container.inspect(t.allocator, bytes, opts);
    defer plain.deinit(t.allocator);
    var options = opts;
    options.document.max_total_bytes = plain.total_decoded_bytes;
    options.ole = .{ .layout = .observed_size_prefix, .max_containers = 2, .max_total_envelope_bytes = 2 * inner.len, .max_total_stream_bytes = 6, .max_total_entries = 8, .max_total_path_bytes = 56 };
    var exact = try container.inspect(t.allocator, bytes, options);
    defer exact.deinit(t.allocator);
    try t.expectEqual(plain.total_decoded_bytes, exact.total_decoded_bytes);
    inline for (.{ "max_containers", "max_total_envelope_bytes", "max_total_stream_bytes", "max_total_entries", "max_total_path_bytes" }) |field| {
        var limited = options;
        @field(limited.ole.?, field) -= 1;
        var gpa: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer t.expect(gpa.deinit() == .ok) catch @panic("OLE BinData leak");
        try rejected(gpa.allocator(), bytes, limited, error.LimitExceeded);
        try t.expectEqual(@as(usize, 0), gpa.total_requested_bytes);
        try t.checkAllAllocationFailures(t.allocator, rejected, .{ bytes, limited, error.LimitExceeded });
    }
    const malformed = try @import("image_fixture.zig").withExtension(t.allocator, "bad", 2, "ole");
    defer t.allocator.free(malformed);
    try connected(t.allocator, malformed, false);
    try t.checkAllAllocationFailures(t.allocator, rejected, .{ malformed, options, error.UnexpectedEnd });
}
