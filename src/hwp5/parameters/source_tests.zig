const std = @import("std");
const t = std.testing;
const sources = @import("sources.zig");
const options: sources.Options = .{ .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty }, .list_layout = .observed8, .bin_data_count = 1 };
fn fixture() [16]u8 {
    var b = [_]u8{0} ** 16;
    std.mem.writeInt(u32, b[0..4], 27 | (12 << 20), .little);
    b[4] = 1;
    b[6] = 1;
    b[10] = 7;
    b[12] = 2;
    b[13] = 128;
    b[14] = 1;
    return b;
}
fn allocationCase(a: std.mem.Allocator) !void {
    var b = fixture();
    const report = try sources.inspectDocInfo(a, &b, options);
    try t.expectEqual(1, report.parsed);
    try t.expectEqual(2, report.nodes);
    try t.expectEqual(1, report.binary_refs);
    b[14] = 0;
    _ = sources.inspectDocInfo(a, &b, options) catch |err| {
        if (err == error.OutOfMemory) return err;
        try t.expectEqual(error.InvalidResourceReference, err);
        return;
    };
    return error.TestExpectedError;
}
test "parameter source reference validation frees allocations on success and failure" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{});
}
fn unsupportedCase(a: std.mem.Allocator) !void {
    var b = fixture();
    b[12] = 255;
    b[13] = 127;
    const report = try sources.inspectDocInfo(a, &b, options);
    try t.expectEqual(1, report.doc_payloads);
    try t.expectEqual(1, report.unsupported);
    try t.expectEqual(12, report.unsupported_bytes);
    try t.expectEqual(0, report.parsed);
    try t.expectEqual(0, report.nodes);
}
test "unsupported parameter types stay explicit without swallowing OOM" {
    try t.checkAllAllocationFailures(t.allocator, unsupportedCase, .{});
}
test "empty parameter sources still validate options and known truncation is fatal" {
    var invalid = options;
    invalid.parameters.max_nodes = 0;
    try t.expectError(error.InvalidParameterLimit, sources.inspectDocInfo(t.allocator, &.{}, invalid));
    const b = fixture();
    for (1..b.len) |n| try t.expectError(error.UnexpectedEnd, sources.inspectDocInfo(t.allocator, b[0..n], options));
    try t.expectEqual(0, (try sources.inspectDocInfo(t.allocator, &.{}, options)).parsed);
}
