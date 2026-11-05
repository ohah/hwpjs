const std = @import("std");
const m = @import("model/formatting_patch.zig");
const p = @import("model/formatting_projection.zig");
const Scope = @import("model/formatting_scope.zig").Scope;
const Backend = struct {
    owners: *usize,
    resources: *usize,
    pub fn owner(self: @This(), value: m.Owner) !m.Owner {
        self.owners.* += 1;
        return value;
    }
    pub fn validateRange(_: @This(), _: m.Owner, _: m.Range) !void {}
    pub fn characterField(self: @This(), _: std.mem.Allocator, _: u32, _: []const u8) !p.Observation {
        self.resources.* += 1;
        return p.known(p.integer(7), true, null, null);
    }
};
test "atomic formatting regression: request scope distinct owners and repeated resource resolve once" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    var owners: usize = 0;
    var resources: usize = 0;
    var scope = Scope(Backend){ .allocator = arena.allocator(), .backend = .{ .owners = &owners, .resources = &resources } };
    for (0..64) |i| _ = try scope.owner(.{ .section = 0, .paragraph = i });
    for (0..64) |i| _ = try scope.owner(.{ .section = 0, .paragraph = i });
    try std.testing.expectEqual(@as(usize, 64), owners);
    try scope.validateRange(.{ .section = 0, .paragraph = 0 }, .{ .startUnit = 0, .endUnit = 1 });
    for (0..64) |_| _ = try scope.characterField(arena.allocator(), 1, "character.size");
    try std.testing.expectEqual(@as(usize, 1), resources);
    _ = try scope.characterField(arena.allocator(), 1, "character.bold");
    try std.testing.expectEqual(@as(usize, 2), resources);
}
test "atomic formatting regression: query duplicate owner error precedes invalid second ranges" {
    const bytes = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s1\",\"revision\":0},\"selectors\":[{\"kind\":\"original-paragraph\",\"section\":0,\"paragraph\":1},{\"kind\":\"original-paragraph\",\"section\":0,\"paragraph\":1,\"ranges\":null}]}";
    try std.testing.expectError(error.DuplicateFormattingTarget, @import("wasm/formatting_query_request.zig").decode(std.testing.allocator, bytes, &.{}));
}

const SpanBackend = struct {
    rows: []const p.Span,
    checks: *usize,
    pub fn spans(self: @This(), a: std.mem.Allocator, _: m.Owner) ![]p.Span {
        return a.dupe(p.Span, self.rows);
    }
    pub fn validateRange(self: @This(), _: m.Owner, r: m.Range) !void {
        self.checks.* += 1;
        if (r.endUnit > 100) return error.InvalidTextPosition;
    }
    pub fn characterField(_: @This(), _: std.mem.Allocator, id: u32, _: []const u8) !p.Observation {
        return p.known(p.integer(id), true, null, null);
    }
};
test "atomic formatting regression: ordered ranges preserve coverage and malformed spans keep exhaustive unknown" {
    var checks: usize = 0;
    const rows = [_]p.Span{ .{ .start = 0, .end = 10, .resource = 7 }, .{ .start = 10, .end = 20, .resource = 7 } };
    const ranges = [_]m.Range{ .{ .startUnit = 2, .endUnit = 4 }, .{ .startUnit = 12, .endUnit = 15 } };
    const result = try p.character(std.testing.allocator, SpanBackend{ .rows = &rows, .checks = &checks }, .{ .section = 0, .paragraph = 0 }, &ranges, "character.size");
    try std.testing.expectEqual(@as(usize, 2), checks);
    try std.testing.expectEqual(.known, result.state);
    const reversed = [_]p.Span{ rows[1], rows[0] };
    const whole = [_]m.Range{.{ .startUnit = 0, .endUnit = 20 }};
    const bad = try p.character(std.testing.allocator, SpanBackend{ .rows = &reversed, .checks = &checks }, .{ .section = 0, .paragraph = 0 }, &whole, "character.size");
    try std.testing.expectEqual(.unknown, bad.state);
}
test "atomic formatting regression: range validation error is propagated before resource observation" {
    var checks: usize = 0;
    const rows = [_]p.Span{.{ .start = 0, .end = 200, .resource = 7 }};
    const ranges = [_]m.Range{.{ .startUnit = 0, .endUnit = 101 }};
    try std.testing.expectError(error.InvalidTextPosition, p.character(std.testing.allocator, SpanBackend{ .rows = &rows, .checks = &checks }, .{ .section = 0, .paragraph = 0 }, &ranges, "character.size"));
    try std.testing.expectEqual(@as(usize, 1), checks);
}
