//! Prepared only: optional ABI lease/wire proofs, distinct from Native product6.
const std = @import("std");
const a = std.testing.allocator;
const leases = @import("hwp5_equation_script_edit_lease.zig");
const wire = @import("hwp5_equation_script_edit_wire.zig");
fn before() @import("../hwp5/edit/equation_script_edit.zig").Witness {
    return .{
        .selector = .{ .section = 0, .equation_node = 10, .layout = .with_font },
        .binding = .{ .binding = .{ .document = 9007199254740993, .generation = 9007199254740995, .owner = 9007199254740997 }, .epoch = 9007199254740999 },
        .site = .{ .control_node = 9, .equation_node = 10, .paragraph_node = 0, .paragraph = 0, .source_unit = 16, .current_unit = 16 },
        .section_sha256 = @splat(1),
        .payload_sha256 = @splat(2),
        .control_sha256 = @splat(3),
        .tail_sha256 = @splat(4),
        .attributes = 0,
    };
}
fn frame() leases.Frame {
    return .{ .session = 4096, .view_epoch = 9007199254741001, .history_revision = 7 };
}
test "H5 equation script lease new capture clears prior and opaque serial never resets on close" {
    var store: leases.Store = .{};
    const first = try store.retain(before(), frame());
    store.clear();
    try std.testing.expectEqual(null, store.take());
    const second = try store.retain(before(), frame());
    try std.testing.expect(second > first);
    const retained = store.take().?;
    try std.testing.expectEqual(second, retained.id);
    try std.testing.expectError(error.StaleEquationScriptLease, leases.validate(retained, first, frame(), before().binding));
}
test "H5 equation script lease take consumes before malformed request and no-op" {
    var store: leases.Store = .{};
    _ = try store.retain(before(), frame());
    _ = store.take().?;
    try std.testing.expectError(error.UnexpectedEndOfInput, wire.parse(a, "{"));
    try std.testing.expectEqual(null, store.take());
    _ = try store.retain(before(), frame());
    const own = store.take().?;
    try leases.validate(own, own.id, frame(), before().binding);
    try std.testing.expectEqual(null, store.take());
}
test "H5 equation script lease all session revision view and full ticket identities bind" {
    var store: leases.Store = .{};
    const id = try store.retain(before(), frame());
    const own = store.take().?;
    var wrong = frame();
    wrong.session += 1;
    try std.testing.expectError(error.StaleEquationScriptLease, leases.validate(own, id, wrong, before().binding));
    wrong = frame();
    wrong.history_revision += 1;
    try std.testing.expectError(error.StaleEquationScriptLease, leases.validate(own, id, wrong, before().binding));
    wrong = frame();
    wrong.view_epoch += 1;
    try std.testing.expectError(error.StaleEquationScriptLease, leases.validate(own, id, wrong, before().binding));
    var ticket = before().binding;
    ticket.binding.generation += 1;
    try std.testing.expectError(error.SourceBindingMismatch, leases.validate(own, id, frame(), ticket));
    ticket = before().binding;
    ticket.epoch += 1;
    try std.testing.expectError(error.StaleMutationEpoch, leases.validate(own, id, frame(), ticket));
}
test "H5 equation script lease serial overflow clears authority without recycling" {
    var store: leases.Store = .{ .serial = std.math.maxInt(u64) - 1 };
    _ = try store.retain(before(), frame());
    try std.testing.expectError(error.EquationScriptLeaseExhausted, store.retain(before(), frame()));
    try std.testing.expectEqual(null, store.take());
    try std.testing.expectEqual(std.math.maxInt(u64), store.serial);
}
test "H5 equation script lease public wire has opaque decimal and raw units no witness" {
    const bytes = try wire.capture(a, 9007199254740993, 0, 10, .with_font, 7, &.{ 0xfeff, 0xd83d, 0xde00 });
    defer a.free(bytes);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer parsed.deinit();
    const object = parsed.value.object;
    try std.testing.expectEqualStrings("9007199254740993", object.get("lease").?.string);
    try std.testing.expectEqual(@as(usize, 3), object.get("scriptUtf16LE").?.array.items.len);
    for ([_][]const u8{ "witness", "ticket", "hash", "viewEpoch", "session", "before" }) |key| try std.testing.expect(!object.contains(key));
    try std.testing.expectEqual(@as(u64, 9007199254740993), try wire.leaseId("9007199254740993"));
}
test "H5 equation script lease commit rejects echoed witness duplicate schema and invalid opaque ID" {
    try std.testing.expectError(error.UnknownField, wire.parse(a, "{\"schemaVersion\":1,\"lease\":\"1\",\"script\":\"x\",\"witness\":{}}"));
    try std.testing.expectError(error.DuplicateField, wire.parse(a, "{\"schemaVersion\":1,\"schemaVersion\":1,\"lease\":\"1\",\"script\":\"x\"}"));
    try std.testing.expectError(error.UnsupportedEquationScriptEditWire, wire.parse(a, "{\"schemaVersion\":2,\"lease\":\"1\",\"script\":\"x\"}"));
    for ([_][]const u8{ "", "0", "01", "+1", "18446744073709551616" }) |id| try std.testing.expectError(if (std.mem.eql(u8, id, "0")) error.InvalidEquationScriptLease else error.InvalidFormattingReference, wire.leaseId(id));
}
test "H5 equation script lease exact script unit limit and plus one fail before publication" {
    const text = try a.alloc(u8, 65535);
    defer a.free(text);
    @memset(text, 'x');
    const exact = try std.json.Stringify.valueAlloc(a, wire.Commit{ .schemaVersion = 1, .lease = "1", .script = text }, .{});
    defer a.free(exact);
    var valid = try wire.parse(a, exact);
    defer valid.deinit();
    const over = try a.alloc(u8, 65536);
    defer a.free(over);
    @memset(over, 'x');
    const bytes = try std.json.Stringify.valueAlloc(a, wire.Commit{ .schemaVersion = 1, .lease = "1", .script = over }, .{});
    defer a.free(bytes);
    try std.testing.expectError(error.LimitExceeded, wire.parse(a, bytes));
}
