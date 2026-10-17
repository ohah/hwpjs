const std = @import("std");
const normalized = @import("normalized_open.zig");
const Session = @import("style_preservation.zig").Session;

test "normalized open preserves strict baseline and cleans every repair allocation failure" {
    const a = std.testing.allocator;
    const original = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(64000000));
    defer a.free(original);
    {
        const strict = try normalized.open(a, original);
        defer strict.session.close();
        try std.testing.expect(strict.deviations == null);
    }
    const input = try a.dupe(u8, original);
    defer a.free(input);
    const sector_size = @as(usize, 1) << @as(u6, @intCast(std.mem.readInt(u16, input[30..32], .little)));
    const root_offset = (@as(usize, std.mem.readInt(u32, input[48..52], .little)) + 1) * sector_size;
    std.mem.writeInt(u64, input[root_offset + 100 ..][0..8], 17, .little);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    if (Session.open(a, input)) |unexpected| {
        unexpected.close();
        return error.ExpectedStrictSourceRefusal;
    } else |err| try std.testing.expectEqual(error.RepairedSourceUnsupported, err);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, untouched: []const u8, expected: []const u8) !void {
            defer std.testing.expectEqualSlices(u8, untouched, bytes) catch @panic("NormalizationChangedInput");
            const opened = try normalized.open(allocator, bytes);
            defer opened.session.close();
            try std.testing.expectEqual(@as(u64, 17), opened.deviations.?.original_root_created);
            const saved = try opened.session.save(allocator, .{});
            defer allocator.free(saved.bytes);
            try std.testing.expectEqualSlices(u8, expected, saved.bytes);
        }
    }.run, .{ @as([]const u8, input), @as([]const u8, before), @as([]const u8, original) });
    try std.testing.expectEqualSlices(u8, before, input);
}
