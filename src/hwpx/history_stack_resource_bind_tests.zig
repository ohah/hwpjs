const std = @import("std");
const editor = @import("editor_session.zig");
const history = @import("editor_history.zig");
const owned = @import("history_v2.zig");
const proof = @import("display_resource_generation.zig");
fn load() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", std.testing.allocator, .limited(4_000_000));
}
fn noop() history.Command {
    return .{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "" };
}
fn blocked(s: *const editor.Session) !void {
    try std.testing.expect(!s.display_resource_trusted and !s.display_resource_recoverable);
}
test "SSOT bind r2: owner alias permanently blocks actual owner without changing foreign alias" {
    const a = std.testing.allocator;
    const bytes = try load();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    proof.openOwned(&s);
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    // 실제 Noori Session의 얕은 별칭이며 별도의 소유권을 만들어 deinit하지 않는다.
    var alias = s;
    const old_generation = alias.display_resource_generation;
    try std.testing.expectError(error.SourceBindingMismatch, proof.applyOwned(&h, &alias, &.{noop()}));
    try std.testing.expect(alias.display_resource_trusted and alias.display_resource_recoverable);
    try std.testing.expectEqual(old_generation, alias.display_resource_generation);
    try blocked(&s);
    try std.testing.expect(!try h.apply(&s, noop()));
    try blocked(&s);
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
test "SSOT bind r2: restored source pointer cannot revive permanently blocked proof" {
    const a = std.testing.allocator;
    const bytes = try load();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    proof.openOwned(&s);
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const original = s.source;
    const replacement = try a.dupe(u8, original);
    defer a.free(replacement);
    s.source = replacement;
    _ = h.apply(&s, noop()) catch |err| {
        s.source = original;
        try std.testing.expectEqual(error.SourceBindingMismatch, err);
        try blocked(&s);
        try std.testing.expect(!try h.apply(&s, noop()));
        try blocked(&s);
        const saved = try s.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
        return;
    };
    s.source = original;
    return error.ExpectedSourceBindingMismatch;
}
test "SSOT bind r2: raw managed mutation stays blocked after text and serial restoration" {
    const a = std.testing.allocator;
    const bytes = try load();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    proof.openOwned(&s);
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const serial = h.owned.?.observed_serial;
    try std.testing.expect(try s.splice(0, 3, 4, 0, "x"));
    try std.testing.expect(s.mutation_serial != serial);
    try std.testing.expectError(error.HistoryCurrentMismatch, h.apply(&s, noop()));
    try blocked(&s);
    try std.testing.expect(try s.splice(0, 3, 4, 1, ""));
    // 악의적인 내부 필드 복구도 block을 되돌리지 못해야 한다.
    s.mutation_serial = serial;
    try std.testing.expect(!try h.apply(&s, noop()));
    try blocked(&s);
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
test "SSOT bind r2: transient allocation and validation errors remain recoverable by existing CP comparison" {
    const a = std.testing.allocator;
    const bytes = try load();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    proof.openOwned(&s);
    var fa = std.testing.FailingAllocator.init(a, .{});
    const h = try owned.History.create(fa.allocator(), &s, .{});
    defer h.deinit();
    const retained = h.stack.retained_bytes;
    fa.fail_index = fa.alloc_index;
    try std.testing.expectError(error.OutOfMemory, proof.applyOwned(h, &s, &.{noop()}));
    try std.testing.expect(!s.display_resource_trusted and s.display_resource_recoverable);
    try std.testing.expectEqual(retained, h.stack.retained_bytes);
    fa.fail_index = std.math.maxInt(usize);
    try std.testing.expect(!try proof.applyOwned(h, &s, &.{noop()}));
    try std.testing.expect(s.display_resource_trusted);
    const invalid: history.Command = .{ .section = std.math.maxInt(usize), .paragraph = 3, .start = 0, .deleted = 0, .inserted = "x" };
    try std.testing.expectError(error.InvalidSectionIndex, proof.applyOwned(h, &s, &.{invalid}));
    try std.testing.expect(!s.display_resource_trusted and s.display_resource_recoverable);
    try std.testing.expect(!try proof.applyOwned(h, &s, &.{noop()}));
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expectEqual(retained, h.stack.retained_bytes);
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
