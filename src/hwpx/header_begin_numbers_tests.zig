const std = @import("std");
const header_tree = @import("header_tree.zig");
const section_tree = @import("section_tree.zig");
const begin = @import("header_begin_numbers.zig");

const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'>";
const suffix = "</h:head>";

fn read(a: std.mem.Allocator, source: []const u8, options: begin.Options) !begin.Report {
    var tree = try header_tree.parse(a, source, 0, .{});
    defer tree.deinit(a);
    return begin.inspect(a, &tree, options);
}

test "HWPX begin numbers own all six normalized positive values" {
    const a = std.testing.allocator;
    var report = try read(a, prefix ++ "<h:beginNum page='&#49;' footnote=' +002 ' endnote='3' pic='4' tbl='5' equation='1844674407370955161600'/>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expect(report.present);
    try std.testing.expectEqual(@as(usize, 0), report.missingAttributes());
    try std.testing.expectEqualStrings("1", report.value(.page).?);
    try std.testing.expectEqualStrings(" +002 ", report.value(.footnote).?);
    try std.testing.expectEqualStrings("1844674407370955161600", report.value(.equation).?);
}

test "HWPX begin numbers preserve absent element and attributes without defaults" {
    const a = std.testing.allocator;
    var absent = try read(a, prefix ++ suffix, .{});
    defer absent.deinit(a);
    try std.testing.expect(!absent.present);
    try std.testing.expectEqual(@as(usize, 0), absent.missingAttributes());
    var partial = try read(a, prefix ++ "<h:beginNum page='1'/>" ++ suffix, .{});
    defer partial.deinit(a);
    try std.testing.expect(partial.present);
    try std.testing.expectEqual(@as(usize, 5), partial.missingAttributes());
    try std.testing.expectEqual(@as(?[]const u8, null), partial.value(.footnote));
    var prefixed = try read(a, prefix ++ "<h:beginNum xmlns:x='urn:other' x:page='99'/>" ++ suffix, .{});
    defer prefixed.deinit(a);
    try std.testing.expectEqual(@as(usize, 6), prefixed.missingAttributes());
}

test "HWPX begin numbers use only direct 2011 header children" {
    const a = std.testing.allocator;
    var report = try read(a, prefix ++ "<h:other><h:beginNum page='99'/></h:other><x:beginNum xmlns:x='urn:foreign' page='99'/><h:beginNum page='1'/>" ++ suffix, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.nested_ignored);
    try std.testing.expectEqualStrings("1", report.value(.page).?);
    try std.testing.expectEqual(@as(usize, 5), report.missingAttributes());
    try std.testing.expectError(error.DuplicateBeginNumber, read(a, prefix ++ "<h:beginNum/><h:beginNum/>" ++ suffix, .{}));
}

test "HWPX begin numbers reject invalid values and exact attribute budgets" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidPositiveInteger, read(a, prefix ++ "<h:beginNum page='0'/>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidPositiveInteger, read(a, prefix ++ "<h:beginNum page='-0'/>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidPositiveInteger, read(a, prefix ++ "<h:beginNum page='1_0'/>" ++ suffix, .{}));
    try std.testing.expectError(error.LimitExceeded, read(a, prefix ++ "<h:beginNum page='12'/>" ++ suffix, .{ .max_attribute_bytes = 1 }));
    var exact = try read(a, prefix ++ "<h:beginNum page='12'/>" ++ suffix, .{ .max_attribute_bytes = 2 });
    exact.deinit(a);
}

test "HWPX begin numbers reject a section and release all allocations" {
    const a = std.testing.allocator;
    var section = try section_tree.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>", 0, 0, .{});
    defer section.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, begin.inspect(a, &section, .{}));
    const source = prefix ++ "<h:beginNum page='1' footnote='2' endnote='3' pic='4' tbl='5' equation='6'/>" ++ suffix;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var report = try read(allocator, bytes, .{});
            defer report.deinit(allocator);
            try std.testing.expectEqualStrings("6", report.value(.equation).?);
        }
    }.run, .{source});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.InvalidPositiveInteger, read(checked.allocator(), prefix ++ "<h:beginNum page='1' footnote='0'/>" ++ suffix, .{}));
    try std.testing.expectError(error.DuplicateBeginNumber, read(checked.allocator(), prefix ++ "<h:beginNum page='1'/><h:beginNum page='2'/>" ++ suffix, .{}));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
