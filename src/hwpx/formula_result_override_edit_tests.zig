//! Native command/history atomicity. WASM/UI exposure is a separate gate.
const std = @import("std");
const editor = @import("editor_session.zig");
const history_mod = @import("editor_history.zig");

fn field(session: *const editor.Session) !usize {
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return index;
    }
    return error.TestExpectedEqual;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const begin = try field(&session);
    _ = session.setManualFormulaResult(0, begin, "수동😀") catch |err| {
        try std.testing.expect(session.sections[0].formula_result_overrides.get(begin) == null);
        return err;
    };
    _ = session.setManualFormulaResult(0, begin, "다른 값") catch |err| {
        try std.testing.expectEqualStrings("수동😀", session.sections[0].formula_result_overrides.get(begin).?);
        return err;
    };
    try std.testing.expectEqualStrings("다른 값", session.sections[0].formula_result_overrides.get(begin).?);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "HWPX manual formula result native candidate publishes only after full save under OOM" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX manual formula result pending definition owns separate calculated cache under OOM" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
            defer a.free(input);
            var session = try editor.open(a, input, .{});
            defer session.deinit();
            const begin = try field(&session);
            _ = try session.setFormulaDefinition(0, begin, "=AVG(A1:A1)");
            _ = session.setManualFormulaResult(0, begin, "수동😀") catch |err| {
                try std.testing.expectEqualStrings("=AVG(A1:A1)", session.sections[0].formula_definitions.get(begin).?);
                try std.testing.expect(session.sections[0].formula_result_overrides.get(begin) == null);
                return err;
            };
            const saved = try session.save();
            defer a.free(saved);
            var reopened = try editor.open(a, saved, .{});
            defer reopened.deinit();
            var query = try @import("formula_source_query.zig").read(a, &reopened.sections[0].tree, begin);
            defer query.deinit();
            try std.testing.expectEqualStrings("=AVG(A1:A1)", query.values.formula.?);
            try std.testing.expectEqualStrings("2", query.values.last_result.?);
            try std.testing.expectEqualStrings("수동😀", reopened.sections[0].sites.items[1].text);
        }
    }.run, .{});
}

test "HWPX manual formula result history command restores bytes and preserves redo after rejection" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const begin = try field(&session);
    var history = try history_mod.History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const command: history_mod.Command = .{ .kind = .formula_result_override, .paragraph = 0, .begin_element = begin, .start = 0, .deleted = 0, .inserted = "수동😀<&" };
    var bounded = try history_mod.History.init(&session, 2, try @import("editor_checkpoint.zig").size(&session, 4_000_000));
    defer bounded.deinit();
    try std.testing.expectError(error.LimitExceeded, bounded.apply(&session, command));
    try std.testing.expect(session.sections[0].formula_result_overrides.get(begin) == null);
    try std.testing.expect(!try bounded.undo(&session));
    try std.testing.expect(try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(!try history.apply(&session, command));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    var invalid = command;
    invalid.inserted = &.{0};
    try std.testing.expectError(error.InvalidXmlCharacter, history.apply(&session, invalid));
    invalid = command;
    invalid.start = 1;
    try std.testing.expectError(error.InvalidFormulaResultCommand, history.apply(&session, invalid));
    invalid = command;
    invalid.begin_element = session.sections[0].tree.elements.len;
    try std.testing.expectError(error.InvalidFormulaFieldNode, history.applyBatch(&session, &.{ command, invalid }));
    const refused = try session.save();
    defer a.free(refused);
    try std.testing.expectEqualSlices(u8, input, refused);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expect(!try history.redo(&session));
}

fn invalidationAllocationCase(a: std.mem.Allocator) !void {
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const begin = try field(&session);
    _ = try session.setManualFormulaResult(0, begin, "수동");
    _ = session.splice(0, 1, 0, 1, "5") catch |err| {
        try std.testing.expectEqualStrings("수동", session.sections[0].formula_result_overrides.get(begin).?);
        try std.testing.expectEqualStrings("2", session.sections[0].sites.items[0].text);
        return err;
    };
    try std.testing.expect(session.sections[0].formula_result_overrides.get(begin) == null);
    try std.testing.expectEqualStrings("5", session.sections[0].sites.items[0].text);
    var current = try @import("formula_current_snapshot.zig").read(a, &session, 0);
    defer current.deinit(a);
    try std.testing.expectEqualStrings("5", current.rows[0].values.last_result.?);
}

test "HWPX manual formula result input edits invalidate atomically under all allocation failures" {
    try invalidationAllocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(invalidationAllocationCase, .{});
}

test "HWPX manual formula result actual referenced input invalidates only dependent override with saved history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var snapshot = try @import("formula_current_snapshot.zig").read(a, &session, 0);
    defer snapshot.deinit(a);
    const first = snapshot.rows[0].begin_element;
    const unrelated = snapshot.rows[1].begin_element;
    _ = try session.setManualFormulaResult(0, first, "수동");
    _ = try session.setManualFormulaResult(0, unrelated, "다른 수동");
    var history = try history_mod.History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const before = try session.save();
    defer a.free(before);
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 20, .start = 0, .deleted = 4, .inserted = "12" }));
    try std.testing.expect(session.sections[0].formula_result_overrides.get(first) == null);
    try std.testing.expectEqualStrings("다른 수동", session.sections[0].formula_result_overrides.get(unrelated).?);
    var after = try @import("formula_current_snapshot.zig").read(a, &session, 0);
    defer after.deinit(a);
    try std.testing.expectEqualStrings("68.3", after.rows[0].values.last_result.?);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expectError(error.InvalidFormulaNumber, history.apply(&session, .{ .paragraph = 20, .start = 0, .deleted = 4, .inserted = "bad" }));
    try std.testing.expectEqualStrings("수동", session.sections[0].formula_result_overrides.get(first).?);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}

test "HWPX manual formula result definition edit and explicit same definition recalculate with history" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const begin = try field(&session);
    for ([_][]const u8{ "=AVG(A1:A1)", "=SUM(A1:A1)" }) |formula| {
        _ = try session.setManualFormulaResult(0, begin, "수동");
        var history = try history_mod.History.init(&session, 8, 4_000_000);
        defer history.deinit();
        const before = try session.save();
        defer a.free(before);
        try std.testing.expect(try history.apply(&session, .{ .kind = .formula_definition, .paragraph = 0, .begin_element = begin, .start = 0, .deleted = 0, .inserted = formula }));
        try std.testing.expect(session.sections[0].formula_result_overrides.get(begin) == null);
        var current = try @import("formula_current_snapshot.zig").read(a, &session, 0);
        defer current.deinit(a);
        try std.testing.expectEqualStrings(formula, current.rows[0].values.formula.?);
        try std.testing.expectEqualStrings("2", current.rows[0].values.last_result.?);
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expect(try history.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, before, undone);
        try std.testing.expect(try history.redo(&session));
        const redone = try session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, saved, redone);
        _ = try session.setFormulaDefinition(0, begin, "=SUM(A1:A1)");
    }
}
