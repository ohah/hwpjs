const std = @import("std");
const metadata = @import("paragraph_metadata.zig");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";

fn inspectXml(a: std.mem.Allocator, bytes: []const u8, options: metadata.Options) !metadata.Report {
    var tree = try section_tree.parse(a, bytes, 0, 0, .{});
    defer tree.deinit(a);
    return metadata.inspect(a, &.{tree}, options);
}

test "HWPX paragraph metadata distinguishes absent, zero and explicit Boolean values" {
    const source = prefix ++
        "<p:p id='0' pageBreak='0' columnBreak='true' merged='&#49;'/>" ++
        "<p:p pageBreak=' false ' paraTcId='184467440737095516160000'/>" ++
        "<p:p id='-0' columnBreak='1'/>" ++
        "<x:p xmlns:x='urn:foreign' id='-1' pageBreak='bad'/>" ++ suffix;
    const report = try inspectXml(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 3), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 1), report.missing_id);
    try std.testing.expectEqual(@as(usize, 2), report.zero_id);
    try std.testing.expectEqual(@as(usize, 2), report.missing_para_tc_id);
    try std.testing.expectEqual(@as(usize, 1), report.page_break.absent);
    try std.testing.expectEqual(@as(usize, 2), report.page_break.false_value);
    try std.testing.expectEqual(@as(usize, 0), report.page_break.true_value);
    try std.testing.expectEqual(@as(usize, 1), report.column_break.absent);
    try std.testing.expectEqual(@as(usize, 2), report.column_break.true_value);
    try std.testing.expectEqual(@as(usize, 2), report.merged.absent);
    try std.testing.expectEqual(@as(usize, 1), report.merged.true_value);
}

test "HWPX paragraph metadata rejects invalid scalar attributes and enforces paragraph budget" {
    const invalid_id = prefix ++ "<p:p id='-1'/>" ++ suffix;
    const invalid_tc = prefix ++ "<p:p id='1' paraTcId=''/>" ++ suffix;
    const invalid_bool = prefix ++ "<p:p id='1' pageBreak='yes'/>" ++ suffix;
    const no_more = prefix ++ "<p:p id='1'/><p:p id='2'/>" ++ suffix;
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(std.testing.allocator, invalid_id, .{}));
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspectXml(std.testing.allocator, invalid_tc, .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspectXml(std.testing.allocator, invalid_bool, .{}));
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, no_more, .{ .max_paragraphs = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspectXml(std.testing.allocator, prefix ++ "<p:p id='12'/>" ++ suffix, .{ .max_attribute_bytes = 1 }));
}

test "HWPX paragraph metadata counts across sections and rejects a header tree" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:p id='0'/>" ++ suffix;
    var first = try section_tree.parse(a, source, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, source, 1, 1, .{});
    defer second.deinit(a);
    const report = try metadata.inspect(a, &.{ first, second }, .{});
    try std.testing.expectEqual(@as(usize, 2), report.sections);
    try std.testing.expectEqual(@as(usize, 2), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), report.zero_id);
    try std.testing.expectError(error.LimitExceeded, metadata.inspect(a, &.{ first, second }, .{ .max_paragraphs = 1 }));
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, metadata.inspect(a, &.{header}, .{}));
}

test "HWPX paragraph metadata releases all allocations after failures" {
    const source = prefix ++ "<p:p id='0' pageBreak='true' columnBreak='0' merged='false'/>" ++ suffix;
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            const report = try inspectXml(a, bytes, .{});
            try std.testing.expectEqual(@as(usize, 1), report.paragraphs);
        }
    }.run, .{source});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.InvalidXmlBoolean, inspectXml(checked.allocator(), prefix ++ "<p:p id='0' pageBreak='bad'/>" ++ suffix, .{}));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
