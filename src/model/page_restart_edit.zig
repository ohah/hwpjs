//! Borrowed synchronous requests; Native history/lifetime remains the authority.
const std = @import("std");
pub const Binding = struct { session: []const u8, revision: u32, serial: []const u8 };
pub fn Request(comptime Target: type) type {
    return struct { binding: Binding, target: Target, number: u16 };
}
pub fn checkBinding(expected: Binding, current: Binding) !void {
    if (!std.mem.eql(u8, expected.session, current.session) or expected.revision != current.revision or !std.mem.eql(u8, expected.serial, current.serial)) return error.StalePageRestartBinding;
}
test "PAGE restart binding rejects foreign session stale revision and stale view even for noop" {
    const current: Binding = .{ .session = "own", .revision = 2, .serial = "7" };
    try checkBinding(current, current);
    try std.testing.expectError(error.StalePageRestartBinding, checkBinding(.{ .session = "foreign", .revision = 2, .serial = "7" }, current));
    try std.testing.expectError(error.StalePageRestartBinding, checkBinding(.{ .session = "own", .revision = 1, .serial = "7" }, current));
    try std.testing.expectError(error.StalePageRestartBinding, checkBinding(.{ .session = "own", .revision = 2, .serial = "6" }, current));
}
