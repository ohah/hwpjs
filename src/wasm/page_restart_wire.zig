//! Optional wire DTOs. Native observations stay in the instance-local lease store.
const std = @import("std");
pub const Before = struct { lease: []const u8, session: []const u8, revision: []const u8, serial: []const u8 };
pub const Request = struct { before: Before, number: u16 };
pub const Binding = struct { session: []const u8, revision: []const u8, serial: []const u8 };
pub const Row = struct {
    section: usize,
    controlNode: ?usize = null,
    paragraph: ?usize = null,
    number: ?u16 = null,
    observation: ?Before = null,
    reason: ?[]const u8 = null,
};
pub fn decimal(text: []const u8) !u64 {
    if (text.len == 0 or text.len > 20 or (text.len > 1 and text[0] == '0')) return error.InvalidPageRestartWire;
    var value: u64 = 0;
    for (text) |char| {
        if (char < '0' or char > '9') return error.InvalidPageRestartWire;
        value = std.math.mul(u64, value, 10) catch return error.InvalidPageRestartWire;
        value = std.math.add(u64, value, char - '0') catch return error.InvalidPageRestartWire;
    }
    return value;
}
pub fn revision(text: []const u8) !u32 {
    return std.math.cast(u32, try decimal(text)) orelse error.InvalidPageRestartWire;
}
/// Values are scalar Native observations; the store never borrows JSON strings.
pub fn Store(comptime T: type) type {
    return struct {
        const Self = @This();
        const Entry = struct { id: u64, value: T };
        entries: std.ArrayList(Entry) = .empty,
        next: u64 = 1,
        pub fn clear(self: *Self, a: std.mem.Allocator) void {
            self.entries.deinit(a);
            self.entries = .empty;
            // Keep monotonic identity even across close/open within the WASM instance.
        }
        pub fn capture(self: *Self, a: std.mem.Allocator, value: T) !u64 {
            if (self.entries.items.len >= 20000) return error.LimitExceeded;
            if (self.next == 0) return error.PageRestartLeaseExhausted;
            const id = self.next;
            try self.entries.append(a, .{ .id = id, .value = value });
            self.next = std.math.add(u64, id, 1) catch 0;
            return id;
        }
        pub fn take(self: *Self, text: []const u8) !T {
            const id = try decimal(text);
            for (self.entries.items, 0..) |entry, index| if (entry.id == id) {
                return self.entries.swapRemove(index).value;
            };
            return error.StalePageRestartLease;
        }
    };
}
test "PAGE restart wire canonical decimal and single-use leases reject replay and overflow" {
    const a = std.testing.allocator;
    var store: Store(u16) = .{};
    defer store.clear(a);
    const id = try store.capture(a, 7);
    try std.testing.expectEqual(@as(u64, 1), id);
    try std.testing.expectEqual(@as(u16, 7), try store.take("1"));
    try std.testing.expectError(error.StalePageRestartLease, store.take("1"));
    store.clear(a);
    try std.testing.expectEqual(@as(u64, 2), try store.capture(a, 9));
    try std.testing.expectError(error.InvalidPageRestartWire, decimal("00"));
    try std.testing.expectError(error.InvalidPageRestartWire, decimal("18446744073709551616"));
}
