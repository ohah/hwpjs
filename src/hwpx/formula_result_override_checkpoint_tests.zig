//! Manual result ownership/checkpoint gates, not a public editing command.
const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoint = @import("editor_checkpoint.zig");

test "HWPX manual formula results survive checkpoint capture exchange rollback and OOM" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, @import("test_formula_fixture.zig").section);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const begin = for (section.tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    const initial_size = try checkpoint.size(&session, 4_000_000);
    var initial = try checkpoint.capture(&session, initial_size);
    defer initial.deinit();
    try std.testing.expect(try section.formula_result_overrides.set(a, &section.tree, begin, "수동😀"));
    const expected_size = initial_size + section.formula_result_overrides.entries.capacity * @sizeOf(@import("formula_result_override_values.zig").Entry) + "수동😀".len;
    try std.testing.expectEqual(expected_size, try checkpoint.size(&session, 4_000_000));
    try std.testing.expectError(error.LimitExceeded, checkpoint.capture(&session, expected_size - 1));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, node: usize) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            var captured = try checkpoint.capture(&proxy, 4_000_000);
            defer captured.deinit();
            try std.testing.expectEqualStrings("수동😀", captured.states[0].formula_result_overrides.get(node).?);
            captured.states[0].formula_result_overrides.entries.items[0].display[0] = 'x';
            try std.testing.expectEqualStrings("수동😀", source.sections[0].formula_result_overrides.get(node).?);
        }
    }.run, .{ &session, begin });
    var changed = try checkpoint.capture(&session, 4_000_000);
    defer changed.deinit();
    try std.testing.expect(try section.formula_result_overrides.set(a, &section.tree, begin, "다른 값"));
    try changed.exchange(&session);
    try std.testing.expectEqualStrings("수동😀", section.formula_result_overrides.get(begin).?);
    try changed.exchange(&session);
    try std.testing.expectEqualStrings("다른 값", section.formula_result_overrides.get(begin).?);
    try std.testing.expectError(error.LimitExceeded, initial.exchange(&session));
    try std.testing.expectEqualStrings("다른 값", section.formula_result_overrides.get(begin).?);
    var foreign = session;
    foreign.source = input[1..];
    try std.testing.expectError(error.SourceBindingMismatch, initial.rollback(&foreign));
    try initial.rollback(&session);
    try std.testing.expect(section.formula_result_overrides.get(begin) == null);
    try std.testing.expectEqual(initial_size, try checkpoint.size(&session, 4_000_000));
    try std.testing.expectEqualSlices(u8, input, session.source);
}
