const std = @import("std");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const segments = @import("line_segments.zig");

fn inspectXml(a: std.mem.Allocator, body: []const u8, options: segments.Options) !segments.Report {
    const source = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>{s}</s:sec>", .{body});
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return segments.inspect(a, &.{tree}, options);
}

test "HWPX line segments preserve direct ownership and nine scalar values" {
    const report = try inspectXml(std.testing.allocator, "<p:p><x:linesegarray/><p:linesegarray xmlns:y='urn:y' spare='a'><x:lineseg/><p:other/>" ++
        "<p:lineseg xmlns:z='urn:z' textpos='4294967295' vertpos='-1' vertsize='1' textheight='2' baseline='3' spacing='-4' horzpos='-5' horzsize='6' flags='4294967295' p:flags='9'><x:child/></p:lineseg>" ++
        "</p:linesegarray><p:linesegarray/></p:p>", .{});
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 2), report.arrays);
    try std.testing.expectEqual(@as(usize, 1), report.segments);
    try std.testing.expectEqual(@as(usize, 1), report.empty_arrays);
    try std.testing.expectEqual(@as(usize, 1), report.array_other_attributes);
    try std.testing.expectEqual(@as(usize, 2), report.array_other_direct);
    try std.testing.expectEqual(@as(usize, 1), report.array_foreign_direct);
    try std.testing.expectEqual(@as(usize, 1), report.segment_other_attributes);
    try std.testing.expectEqual(@as(usize, 1), report.segment_direct_children);
    try std.testing.expectEqual(@as(usize, 1), report.segment_foreign_direct);
    for (report.field_present) |count| try std.testing.expectEqual(@as(usize, 1), count);
    for (report.field_missing) |count| try std.testing.expectEqual(@as(usize, 0), count);
    try std.testing.expectEqual(@as(i64, 4294967295), report.field_sum[0]);
    try std.testing.expectEqual(@as(i64, -4), report.field_sum[5]);
    try std.testing.expectEqual(@as(i64, -5), report.field_sum[6]);
    try std.testing.expectEqual(@as(i64, 4294967295), report.field_sum[8]);
    try std.testing.expectEqual(@as(usize, 1), report.field_negative[1]);
    try std.testing.expectEqual(@as(usize, 1), report.field_highbit[0]);
    try std.testing.expectEqual(@as(usize, 1), report.field_highbit[8]);
}

test "HWPX line segments do not coerce signed high-bit decimal to negative" {
    const report = try inspectXml(std.testing.allocator, "<p:p><p:linesegarray><p:lineseg spacing='4294967295' textpos='-000'/></p:linesegarray></p:p>", .{});
    try std.testing.expectEqual(@as(i64, 4294967295), report.field_sum[5]);
    try std.testing.expectEqual(@as(usize, 1), report.field_highbit[5]);
    try std.testing.expectEqual(@as(usize, 0), report.field_negative[5]);
    try std.testing.expectEqual(@as(usize, 1), report.field_zero[0]);
}

test "HWPX line segments retain missing fields and reject damaged numeric lexemes" {
    const a = std.testing.allocator;
    const missing = try inspectXml(a, "<p:p><p:linesegarray><p:lineseg flags='0'/></p:linesegarray></p:p>", .{});
    try std.testing.expectEqual(@as(usize, 1), missing.field_present[8]);
    try std.testing.expectEqual(@as(usize, 1), missing.field_zero[8]);
    for (missing.field_missing[0..8]) |count| try std.testing.expectEqual(@as(usize, 1), count);
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(a, "<p:p><p:linesegarray><p:lineseg textpos='-1'/></p:linesegarray></p:p>", .{}));
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, inspectXml(a, "<p:p><p:linesegarray><p:lineseg vertpos='-2147483649'/></p:linesegarray></p:p>", .{}));
    try std.testing.expectError(error.InvalidUnsigned32, inspectXml(a, "<p:p><p:linesegarray><p:lineseg flags='4294967296'/></p:linesegarray></p:p>", .{}));
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, inspectXml(a, "<p:p><p:linesegarray><p:lineseg spacing='1_0'/></p:linesegarray></p:p>", .{}));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:p><p:linesegarray><p:lineseg textpos='12'/></p:linesegarray></p:p>", .{ .max_attribute_bytes = 1 }));
}

test "HWPX line segments honor exact array and segment limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:p><p:linesegarray/></p:p>", .{ .max_arrays = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(a, "<p:p><p:linesegarray><p:lineseg/></p:linesegarray></p:p>", .{ .max_segments = 0 }));
    const exact = try inspectXml(a, "<p:p><p:linesegarray><p:lineseg/></p:linesegarray></p:p>", .{ .max_arrays = 1, .max_segments = 1 });
    try std.testing.expectEqual(@as(usize, 1), exact.segments);
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, segments.inspect(a, &.{header}, .{}));
}

test "HWPX line segments release allocations under failure injection" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspectXml(a, "<p:p><p:linesegarray><p:lineseg textpos='2' vertpos='-1' flags='4294967295'/></p:linesegarray></p:p>", .{});
            try std.testing.expectEqual(@as(usize, 1), report.segments);
            try std.testing.expectEqual(@as(usize, 1), report.field_negative[1]);
        }
    }.run, .{});
}
