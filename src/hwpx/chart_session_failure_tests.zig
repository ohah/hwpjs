const std = @import("std");
test "chart Session History owns open and rolls back every allocation failure" {
    try sweep("reference/rhwp/samples/chart/가로막대형/3차원누적가로막대형.hwpx", false);
}
test "chart normalized Session History rolls back every allocation failure" {
    try sweep("reference/rhwp/samples/issue5447/3차원묶은세로막대형-행추가.hwpx", true);
}
fn sweep(path: []const u8, allow_observed_deviations: bool) !void {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4000000));
    defer a.free(input);
    const baseline = try a.dupe(u8, input);
    defer a.free(baseline);
    var calls: usize = 0;
    try @import("../testing/allocation_failures.zig").check(@import("chart_session_failure_case.zig").run, .{ @as([]const u8, input), @as([]const u8, baseline), &calls, allow_observed_deviations });
    std.debug.print("Chart Session History allocation sweep: {d} calls including success; normalized={any}\n", .{ calls, allow_observed_deviations });
}
