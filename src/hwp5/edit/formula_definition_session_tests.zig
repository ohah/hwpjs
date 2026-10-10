const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const a = std.testing.allocator;
const change: edit.Command = .{ .set_formula_definition = .{ .section = 0, .source_node = 118, .formula = "=AVG(B?:E?)" } };

fn equalSave(session: *edit.Session, expected: []const u8) !void {
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, expected, saved.bytes);
}

fn expectResult(session: *edit.Session, expected: []const u8) !void {
    const bytes = try session.copyText(a, 0, 23);
    defer a.free(bytes);
    const span = try @import("../body/field_span.zig").find(bytes, @import("../body/control_rules.zig").id("%fmu"), 0);
    const actual = bytes[@as(usize, span.start_unit) * 2 .. @as(usize, span.end_unit) * 2];
    try std.testing.expectEqual(expected.len * 2, actual.len);
    for (expected, 0..) |c, i| try std.testing.expectEqual(@as(u16, c), std.mem.readInt(u16, actual[i * 2 ..][0..2], .little));
}

test "HWP5 formula definition session preserves history on noops refusals budget and late batch errors" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(2_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 8, 16 * 1024 * 1024);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, change));
    try expectResult(session, "16.875");
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try expectResult(reopened, "16.875");
    try std.testing.expect(!try history.apply(session, change));
    try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
    try std.testing.expect(try history.undo(session));
    try equalSave(session, input);
    try std.testing.expect(!try history.apply(session, .{ .set_formula_definition = .{ .section = 0, .source_node = 118, .formula = "=SUM(B?:E?)" } }));
    for ([_]struct { command: edit.Command, err: anyerror }{
        .{ .command = .{ .set_formula_definition = .{ .section = 99, .source_node = 118, .formula = "=AVG(B?:E?)" } }, .err = error.InvalidSection },
        .{ .command = .{ .set_formula_definition = .{ .section = 0, .source_node = 0, .formula = "=AVG(B?:E?)" } }, .err = error.InvalidFormulaField },
        .{ .command = .{ .set_formula_definition = .{ .section = 0, .source_node = 118, .formula = "AVG(B?:E?)" } }, .err = error.UnsupportedFormulaExpression },
        .{ .command = .{ .set_formula_definition = .{ .section = 0, .source_node = 118, .formula = "=SUM(Z999:Z1000)" } }, .err = error.FormulaReferenceOutOfBounds },
    }) |case| {
        try std.testing.expectError(case.err, history.apply(session, case.command));
        try equalSave(session, input);
        try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    }
    const invalid: edit.Command = .{ .set_formula_definition = .{ .section = 0, .source_node = 118, .formula = "=SUM(Z999:Z1000)" } };
    try std.testing.expectError(error.FormulaReferenceOutOfBounds, history.applyBatch(session, &.{ change, invalid }));
    try equalSave(session, input);
    history.max_checkpoint_bytes = try session.checkpointSize(std.math.maxInt(usize));
    try std.testing.expectError(error.LimitExceeded, history.apply(session, change));
    try equalSave(session, input);
    try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
    history.max_checkpoint_bytes = 16 * 1024 * 1024;
    try std.testing.expect(try history.redo(session));
    try equalSave(session, saved.bytes);
}

fn failures(allocator: std.mem.Allocator, input: []const u8) !void {
    const session = try edit.Session.open(allocator, input);
    defer session.close();
    session.apply(change) catch |err| {
        try equalSave(session, input);
        try expectResult(session, "67.5");
        return err;
    };
    try expectResult(session, "16.875");
    const saved = session.save(allocator, .{ .allow_stale_layout = true }) catch |err| {
        try expectResult(session, "16.875");
        return err;
    };
    defer allocator.free(saved.bytes);
    const reopened = try edit.Session.open(allocator, saved.bytes);
    defer reopened.close();
    try expectResult(reopened, "16.875");
}

test "HWP5 formula definition session complete allocation failures keep original apply or committed save state" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(2_000_000));
    defer a.free(input);
    try @import("../../testing/allocation_failures.zig").check(failures, .{input});
}

fn historyFailures(allocator: std.mem.Allocator, input: []const u8) !void {
    const session = try edit.Session.open(allocator, input);
    defer session.close();
    var history = try History.init(allocator, session, 8, 16 * 1024 * 1024);
    defer history.deinit();
    _ = history.apply(session, change) catch |err| {
        try equalSave(session, input);
        return err;
    };
    try std.testing.expect(try history.undo(session));
    _ = history.apply(session, change) catch |err| {
        try equalSave(session, input);
        try std.testing.expectEqual(@as(usize, 0), history.stack.undo.items.len);
        try std.testing.expectEqual(@as(usize, 1), history.stack.redo.items.len);
        return err;
    };
    try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
    try std.testing.expectEqual(@as(usize, 0), history.stack.redo.items.len);
    try expectResult(session, "16.875");
    try std.testing.expect(try history.undo(session));
    try equalSave(session, input);
}

test "HWP5 formula definition session full history allocation failures preserve existing redo and original bytes" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(2_000_000));
    defer a.free(input);
    try @import("../../testing/allocation_failures.zig").check(historyFailures, .{input});
}
