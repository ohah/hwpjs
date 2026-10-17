const std = @import("std");
const policy = @import("text_source_policy.zig");
test "text source policy queries preserve source and clean every partial allocation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp", a, .limited(2000000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    const before = try a.dupe(u8, bytes);
    defer a.free(before);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) !void {
            try policy.validate(allocator, &.{raw}, version, 0);
        }
    }.run, .{ @as([]const u8, bytes), source.header.version() });
    try std.testing.expectEqualSlices(u8, before, bytes);
    try std.testing.expectError(error.InvalidSection, policy.validate(a, &.{bytes}, source.header.version(), 1));
    var unknown: [8]u8 = undefined;
    std.mem.writeInt(u32, unknown[0..4], 71 | (@as(u32, 4) << 20), .little);
    std.mem.writeInt(u32, unknown[4..8], @import("../body/control_rules.zig").id("zzzz"), .little);
    try std.testing.expectError(error.UnsupportedSectionControl, policy.validate(a, &.{ bytes, &unknown }, source.header.version(), 0));
    try std.testing.expectError(error.UnsupportedSectionControl, policy.validate(a, &.{ bytes, &unknown }, source.header.version(), 1));
}
