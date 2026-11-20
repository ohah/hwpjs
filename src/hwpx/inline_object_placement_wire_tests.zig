//! Strict Native wire source declarations; no Native execution before grant.
const std = @import("std");
const chart = @import("chart_create_request.zig");
const owner = "\"owner\":{\"kind\":\"createdCell\",\"binding\":{\"session\":\"s7\",\"revision\":4,\"serial\":\"9007199254740993\"},\"identity\":\"9007199254740993\",\"row\":0,\"column\":1}";
const wire = "{\"target\":{\"section\":2,\"unit\":3,\"expected_text\":\"앞😀뒤\"," ++ owner ++ "},\"size\":{\"width\":200,\"height\":100},\"data\":{\"categories\":[\"A\"],\"series\":[{\"name\":\"S\",\"values\":[\"1\"]}]}}";
fn parseOwned(a: std.mem.Allocator) !void {
    const bytes = try a.dupe(u8, wire);
    defer a.free(bytes);
    var parsed = try chart.parseRequest(a, bytes, @splat(0));
    defer parsed.deinit();
    @memset(bytes, 'x');
    const target = parsed.request.target;
    try std.testing.expectEqual(@as(usize, 0), target.paragraph);
    try std.testing.expectEqual(@as(usize, 2), target.section);
    try std.testing.expectEqualStrings("앞😀뒤", target.expected_text);
    try std.testing.expectEqualStrings("9007199254740993", target.owner.?.identity.?);
    try std.testing.expectEqualStrings("9007199254740993", target.owner.?.binding.serial);
    try std.testing.expect(target.physical_paragraph == null);
}
test "HWPX inline placement wire created cell owns proof and text independently of request bytes" {
    try parseOwned(std.testing.allocator);
}
test "HWPX inline placement wire allocation failures release nested owner proof" {
    try @import("../testing/allocation_failures.zig").check(parseOwned, .{});
}
test "HWPX inline placement wire rejects fake paragraph internal physical key malformed proof and mixed kinds" {
    const a = std.testing.allocator;
    for ([_][2][]const u8{
        .{ "\"section\":2", "\"section\":2,\"paragraph\":1" },
        .{ "\"section\":2", "\"section\":2,\"physical_paragraph\":3" },
        .{ "\"section\":2", "\"section\":2,\"anchor_insertion\":true" },
        .{ "\"section\":2", "\"section\":2,\"affinity\":\"pretend\"" },
        .{ "\"row\":0", "\"row\":\"0\"" },
        .{ "\"row\":0", "\"row\":0,\"table_node\":4" },
        .{ "\"createdCell\"", "\"pretend\"" },
        .{ "\"serial\":\"9007199254740993\"", "\"serial\":\"18446744073709551616\"" },
        .{ "\"identity\":\"9007199254740993\"", "\"identity\":\"09\"" },
    }) |pair| {
        const bad = try std.mem.replaceOwned(u8, a, wire, pair[0], pair[1]);
        defer a.free(bad);
        if (chart.parseRequest(a, bad, @splat(0))) |parsed| {
            var unexpected = parsed;
            unexpected.deinit();
            return error.ExpectedInlineObjectOwnerRejection;
        } else |_| {}
    }
}
