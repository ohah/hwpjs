const std = @import("std");
const api = @import("chart_create.zig");
const valid = "{\"target\":{\"section\":0,\"paragraph\":1,\"unit\":0,\"expected_text\":\"\"},\"size\":{\"width\":21600,\"height\":14400},\"data\":{\"categories\":[\"A\"],\"series\":[{\"name\":\"S\",\"values\":[\"-0\"]}]}}";

fn parseCase(a: std.mem.Allocator) !void {
    var parsed = try api.parseRequest(a, valid, @splat(17));
    defer parsed.deinit();
    try std.testing.expectEqualStrings("-0", parsed.request.data.series[0].values[0]);
    try std.testing.expectEqualDeep(@as([32]u8, @splat(17)), parsed.request.expected_source_sha256);
}
test "HWPX chart create strict JSON owned lifetime and allocation failure sweep" {
    try parseCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(parseCase, .{});
}
test "HWPX chart create strict JSON rejects wrong kinds keys nested duplicates and extra data" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "{}",                                                                                                                                                                                                "null",                                                                                                                                                                                                                 valid ++ "{}",
        "{\"target\":{},\"size\":{},\"data\":{}}",                                                                                                                                                           "{\"target\":{\"section\":\"0\",\"paragraph\":1,\"unit\":0,\"expected_text\":\"\"},\"size\":{\"width\":1,\"height\":1},\"data\":{\"categories\":[\"A\"],\"series\":[{\"name\":\"S\",\"values\":[\"1\"]}]}}",            "{\"target\":{\"section\":0,\"paragraph\":1,\"unit\":0.0,\"expected_text\":\"\"},\"size\":{\"width\":1,\"height\":1},\"data\":{\"categories\":[\"A\"],\"series\":[{\"name\":\"S\",\"values\":[\"1\"]}]}}",
        "{\"target\":{\"section\":0,\"paragraph\":1,\"unit\":0,\"expected_text\":\"\"},\"size\":{\"width\":1,\"height\":1},\"data\":{\"categories\":[\"A\"],\"series\":[{\"name\":\"S\",\"values\":[1]}]}}", "{\"target\":{\"section\":0,\"paragraph\":1,\"unit\":0,\"expected_text\":\"\"},\"size\":{\"width\":1,\"height\":1},\"data\":{\"categories\":[\"A\"],\"series\":[{\"name\":\"S\",\"name\":\"T\",\"values\":[\"1\"]}]}}", "{\"target\":{\"section\":0,\"paragraph\":1,\"unit\":0,\"expected_text\":\"\",\"unknown\":0},\"size\":{\"width\":1,\"height\":1},\"data\":{\"categories\":[\"A\"],\"series\":[{\"name\":\"S\",\"values\":[\"1\"]}]}}",
    }) |bytes| {
        if (api.parseRequest(a, bytes, @splat(0))) |value| {
            var parsed = value;
            parsed.deinit();
            return error.ExpectedChartCreateRefusal;
        } else |err| try std.testing.expect(err != error.OutOfMemory);
    }
}
