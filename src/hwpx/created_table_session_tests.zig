const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const checkpoints = @import("editor_checkpoint.zig");
const model = @import("../model/created_table.zig");
const staging = @import("created_table_session.zig");

fn table(a: std.mem.Allocator) !model.Table {
    var value = try model.create(a, 1, 33, try @import("../model/table_creation_plan.zig").create(1, 1, 101, 17, 1), &.{1000000}, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 }, 1);
    errdefer value.deinit(a);
    _ = try value.replaceText(a, 0, 0, "셀😀", 100);
    return value;
}
fn input(a: std.mem.Allocator) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
}
fn command(value: *const model.Table) histories.Command {
    return .{ .kind = .created_table_stage, .section = 0, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "", .created_table = value };
}

test "created table staged history owns text anchor and refuses silent save loss preserving redo" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var value = try table(a);
    defer value.deinit(a);
    var history = try histories.History.init(&session, 8, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, command(&value)));
    const anchor = session.sections[0].created_tables.entries.items[0].anchor;
    _ = try value.replaceText(a, 0, 0, "외부", 100);
    try std.testing.expectEqualStrings("셀😀", session.sections[0].created_tables.entries.items[0].table.cells[0].text);
    try std.testing.expectError(error.UnsupportedCreatedTableSave, session.save());
    try std.testing.expectError(error.UnsupportedCreatedTableHostEdit, session.splice(0, 2, 0, 0, "앞"));
    try std.testing.expectError(error.UnsupportedCreatedTableHostEdit, session.spliceAnchored(0, 2, 0, 0, "앞"));
    try std.testing.expectError(error.UnsupportedCreatedTableHostEdit, session.splitParagraph(0, 2, 0, 0));
    try std.testing.expectError(error.UnsupportedCreatedTableHostEdit, session.mergeParagraph(0, 2));
    try std.testing.expect(!try session.canSplitParagraph(0, 2, 0, 0));
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    const bad: histories.Command = .{ .section = 99, .paragraph = 1, .start = 0, .deleted = 0, .inserted = "x" };
    try std.testing.expectError(error.InvalidSectionIndex, history.applyBatch(&session, &.{ command(&value), bad }));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expectEqualDeep(anchor, session.sections[0].created_tables.entries.items[0].anchor);
    try std.testing.expectEqualStrings("셀😀", session.sections[0].created_tables.entries.items[0].table.cells[0].text);
    try std.testing.expectError(error.UnsupportedCreatedTableSave, session.save());
}

test "created table staged checkpoint includes memory and failed budget rolls back" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var value = try table(a);
    defer value.deinit(a);
    const baseline = try checkpoints.size(&session, 4000000);
    var history = try histories.History.init(&session, 4, baseline);
    defer history.deinit();
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, command(&value)));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    try std.testing.expect(!try history.undo(&session));
    try std.testing.expect(!try history.redo(&session));
    try std.testing.expect(try staging.stage(&session, 0, 2, 0, &value));
    try std.testing.expect(try checkpoints.size(&session, 4000000) > baseline);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var borrowed = source.*;
            borrowed.allocator = allocator;
            var checkpoint = try checkpoints.capture(&borrowed, 4000000);
            defer checkpoint.deinit();
            try std.testing.expectEqualStrings("셀😀", checkpoint.states[0].created_tables.entries.items[0].table.cells[0].text);
        }
    }.run, .{&session});
    var checkpoint = try checkpoints.capture(&session, 4000000);
    defer checkpoint.deinit();
    _ = try session.sections[0].created_tables.entries.items[0].table.replaceText(a, 0, 0, "변경", 100);
    try checkpoint.exchange(&session);
    try std.testing.expectEqualStrings("셀😀", session.sections[0].created_tables.entries.items[0].table.cells[0].text);
    try checkpoint.exchange(&session);
    try std.testing.expectEqualStrings("변경", session.sections[0].created_tables.entries.items[0].table.cells[0].text);
}

test "created table staged allocation failures retain empty current state and source" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var value = try table(a);
    defer value.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, payload: *const model.Table) !void {
            var borrowed = source.*;
            borrowed.allocator = allocator;
            // Only the empty registry is shared with the source. Restore it on
            // every exit; never deinit the borrowed session/XML/site owners.
            defer {
                borrowed.sections[0].created_tables.deinit(allocator);
                borrowed.sections[0].created_tables = .{};
            }
            errdefer std.debug.assert(borrowed.sections[0].created_tables.entries.items.len == 0);
            try std.testing.expect(try staging.stage(&borrowed, 0, 2, 0, payload));
        }
    }.run, .{ &session, &value });
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
