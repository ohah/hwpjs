const std = @import("std");
const probe = @import("testing/bounded_allocation_probe.zig");

fn open(a: std.mem.Allocator, input: []const u8, before: []const u8) !void {
    defer std.testing.expectEqualSlices(u8, before, input) catch @panic("SourceChanged");
    const opened = try @import("hwp5/edit/normalized_open.zig").open(a, input);
    defer opened.session.close();
    try std.testing.expect(opened.deviations != null);
}

test "normalized HWP5 open bounded failure diagnostics preserve input and free allocations" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue5447/3차원묶은세로막대형-행추가.hwp", a, .limited(4000000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    const args = .{ @as([]const u8, input), @as([]const u8, before) };
    const baseline = try probe.measure(open, args, null);
    try std.testing.expect(baseline.allocations > 1);
    std.debug.print("Normalized open baseline={any}\n", .{baseline});
    for ([_]usize{ 0, 1, baseline.allocations / 2, baseline.allocations - 1 }) |index| {
        const stats = try probe.measure(open, args, index);
        std.debug.print("Normalized open fail_index={d}; stats={any}\n", .{ index, stats });
    }
    var calls: usize = 0;
    const fallback = try probe.measureFallback(open, args, null);
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: []const u8, original: []const u8, count: *usize) !void {
            count.* += 1;
            try open(allocator, source, original);
        }
    }.run, .{ @as([]const u8, input), @as([]const u8, before), &calls });
    try std.testing.expectEqual(fallback.allocations + @import("testing/allocation_failures.zig").success_controls, calls);
    std.debug.print("Normalized open full fixture sweep calls={d}\n", .{calls});
}
