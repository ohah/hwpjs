const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const checkpoints = @import("editor_checkpoint.zig");
fn node(session: *const editor.Session) !usize {
    for (session.sections[0].tree.elements, 0..) |_, index| if (@import("run_anchor.zig").kind(&session.sections[0].tree, index) == .check_button) return index;
    return error.MissingFormState;
}
fn input(a: std.mem.Allocator) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/form-01.hwpx", a, .limited(4_000_000));
}
test "HWPX checkbox state session saves text composition and restores history redo after refusal" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var history = try histories.History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const form = try node(&session);
    const command: histories.Command = .{ .kind = .check_box_state, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .form_node = form, .checkbox_state = .unchecked };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expectEqual(.unchecked, try session.checkBoxState(0, form));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqual(.unchecked, try reopened.checkBoxState(0, try node(&reopened)));
    try std.testing.expect(try history.undo(&session));
    const original = try session.save();
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, bytes, original);
    try std.testing.expectError(error.FormTriStateUnsupported, history.apply(&session, .{ .kind = .check_box_state, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .form_node = form, .checkbox_state = .indeterminate }));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expect(!try history.apply(&session, command));
    try std.testing.expect(try session.spliceAnchored(0, 3, 0, 0, "앞😀"));
    const combined = try session.save();
    defer a.free(combined);
    var final = try editor.open(a, combined, .{});
    defer final.deinit();
    try std.testing.expectEqual(.unchecked, try final.checkBoxState(0, try node(&final)));
    const text = try final.anchorText(0, 3);
    defer a.free(text);
    try std.testing.expect(std.mem.startsWith(u8, text, "앞😀"));
}
test "HWPX checkbox state checkpoint owns scalar values and enforces rollback budget" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const form = try node(&session);
    const budget = try checkpoints.size(&session, 4_000_000);
    var snapshot = try checkpoints.capture(&session, budget);
    defer snapshot.deinit();
    try std.testing.expect(try session.setCheckBoxState(0, form, .unchecked));
    try std.testing.expectError(error.LimitExceeded, snapshot.exchange(&session));
    try std.testing.expectEqual(.unchecked, try session.checkBoxState(0, form));
    try snapshot.rollback(&session);
    try std.testing.expectEqual(.checked, try session.checkBoxState(0, form));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].checkbox_states.items.len);
    _ = try session.setCheckBoxState(0, form, .unchecked);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            // Borrow original state; inject failures into checkpoint cloning,
            // not repeatedly into unrelated ZIP opening allocations.
            var view = source.*;
            view.allocator = allocator;
            var value = try checkpoints.capture(&view, 4_000_000);
            defer value.deinit();
            try std.testing.expectEqualDeep(source.sections[0].checkbox_states.items, value.states[0].checkbox_states.items);
            try std.testing.expect(source.sections[0].checkbox_states.items.ptr != value.states[0].checkbox_states.items.ptr);
        }
    }.run, .{&session});
}
test "HWPX checkbox state history rolls back a mixed batch after late invalid node" {
    const a = std.testing.allocator;
    const bytes = try input(a);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var history = try histories.History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const form = try node(&session);
    const command: histories.Command = .{ .kind = .check_box_state, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .form_node = form, .checkbox_state = .unchecked };
    try std.testing.expectError(error.InvalidFormNode, history.applyBatch(&session, &.{ command, .{ .kind = .check_box_state, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .form_node = std.math.maxInt(usize), .checkbox_state = .unchecked } }));
    try std.testing.expectEqual(.checked, try session.checkBoxState(0, form));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
