const std = @import("std");

fn verifyOpen(a: std.mem.Allocator, input: []const u8) !void {
    const opened = try @import("hwp5/edit/normalized_open.zig").openDistribution(a, input);
    defer opened.session.close();
    try std.testing.expectEqual(@as(u64, 1), opened.deviations.?.original_root_created);
    try std.testing.expectEqual(@as(usize, 1), opened.session.sectionCount());
    try std.testing.expectEqual(@as(usize, 1), try opened.session.paragraphCount(0));
}

test "normalized distribution open all allocation failures preserve explicit repair input" {
    const a = std.testing.allocator;
    const original = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/viewtext.hwp", a, .limited(4 * 1024 * 1024));
    defer a.free(original);
    const input = try a.dupe(u8, original);
    defer a.free(input);
    // Explicit synthetic deviation in a real small distribution fixture.
    try std.testing.expectEqual(@as(u16, 9), std.mem.readInt(u16, input[30..32], .little));
    const directory: usize = std.mem.readInt(u32, input[48..52], .little);
    const created = (directory + 1) * 512 + 100;
    try std.testing.expect(created + 8 <= input.len);
    std.mem.writeInt(u64, input[created..][0..8], 1, .little);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    if (@import("hwp5/edit/style_preservation.zig").Session.openDistribution(a, input)) |unexpected| {
        unexpected.close();
        return error.ExpectedExplicitRepairRefusal;
    } else |err| try std.testing.expectEqual(error.RepairedSourceUnsupported, err);
    try verifyOpen(a, input);
    const baseline = try @import("testing/bounded_allocation_probe.zig").measure(verifyOpen, .{@as([]const u8, input)}, null);
    var calls: usize = 0;
    const fallback = try @import("testing/bounded_allocation_probe.zig").measureFallback(verifyOpen, .{@as([]const u8, input)}, null);
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, count: *usize) !void {
            count.* += 1;
            try verifyOpen(allocator, bytes);
        }
    }.run, .{ @as([]const u8, input), &calls });
    try std.testing.expectEqual(fallback.allocations + @import("testing/allocation_failures.zig").success_controls, calls);
    std.debug.print("Normalized distribution open allocations={d}, full sweep calls={d}\n", .{ baseline.allocations, calls });
    try std.testing.expectEqualSlices(u8, before, input);
    const restored = try a.dupe(u8, input);
    defer a.free(restored);
    @memcpy(restored[created..][0..8], original[created..][0..8]);
    try std.testing.expectEqualSlices(u8, original, restored);
}
