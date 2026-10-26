const std = @import("std");
const editor = @import("editor_session.zig");
const snapshot = @import("equation_script_snapshot.zig");
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:equation baseLine='opaque'><p:script>A<!--keep--><![CDATA[C]]></p:script></p:equation><p:equation><p:script/></p:equation><p:equation/></p:run></p:p></s:sec>";

test "equation script snapshot owns current strings and distinguishes unavailable from empty" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    var live = true;
    defer if (live) session.deinit();
    var original = try snapshot.read(a, &session, 0, .{ .max_text_bytes = 2 });
    defer original.deinit();
    try std.testing.expectEqual(@as(usize, 3), original.rows.len);
    try std.testing.expectEqualStrings("AC", original.rows[0].value.?);
    try std.testing.expectEqualStrings("", original.rows[1].value.?);
    try std.testing.expect(original.rows[2].value == null);
    try std.testing.expectEqual(@as(usize, 2), original.script_bytes);
    try std.testing.expectError(error.LimitExceeded, snapshot.read(a, &session, 0, .{ .max_text_bytes = 1 }));
    try std.testing.expect(try session.setEquationScript(0, original.rows[0].source.node, "새😀<&"));
    var current = try snapshot.read(a, &session, 0, .{ .max_text_bytes = 9 });
    defer current.deinit();
    try std.testing.expectEqualStrings("새😀<&", current.rows[0].value.?);
    try std.testing.expectEqual(@as(usize, 9), current.script_bytes);
    try std.testing.expectEqualDeep(original.rows[0].source, current.rows[0].source);
    try std.testing.expectError(error.LimitExceeded, snapshot.read(a, &session, 0, .{ .max_text_bytes = 8 }));
    try std.testing.expectError(error.InvalidSectionIndex, snapshot.read(a, &session, 999, .{}));
    session.deinit();
    live = false;
    try std.testing.expectEqualStrings("AC", original.rows[0].value.?);
    try std.testing.expectEqualStrings("새😀<&", current.rows[0].value.?);
}

test "equation script snapshot full allocation failures preserve current owner" {
    const a = std.testing.allocator;
    const at = std.mem.indexOf(u8, xml, "<p:script/>").?;
    const nonempty = try std.mem.concat(a, u8, &.{ xml[0..at], "<p:script>B</p:script>", xml[at + "<p:script/>".len ..] });
    defer a.free(nonempty);
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, nonempty);
    defer a.free(input);
    for ([_]bool{ false, true }) |seeded| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        if (seeded) try std.testing.expect(try session.setEquationScript(0, 3, "current😀"));
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: *const editor.Session, has_override: bool) !void {
                var report = snapshot.read(allocator, source, 0, .{}) catch |err| {
                    try std.testing.expectEqual(@as(usize, if (has_override) 1 else 0), source.sections[0].equation_scripts.entries.items.len);
                    if (has_override) try std.testing.expectEqualStrings("current😀", source.sections[0].equation_scripts.entries.items[0].text);
                    return err;
                };
                defer report.deinit();
                try std.testing.expectEqualStrings(if (has_override) "current😀" else "AC", report.rows[0].value.?);
                try std.testing.expectEqualStrings("B", report.rows[1].value.?);
            }
        }.run, .{ &session, seeded });
    }
}

test "equation script snapshot refuses duplicate stale and unavailable overrides" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.setEquationScript(0, 3, "owned"));
    const values = &session.sections[0].equation_scripts;
    const duplicate = try a.dupe(u8, "duplicate");
    try values.entries.append(a, .{ .equation = 3, .text = duplicate });
    try std.testing.expectError(error.DuplicateEquationScriptEdit, snapshot.read(a, &session, 0, .{}));
    a.free(values.entries.pop().?.text);
    values.entries.items[0].equation = 7;
    try std.testing.expectError(error.InvalidEquationScriptOverride, snapshot.read(a, &session, 0, .{}));
    values.entries.items[0].equation = 9999;
    try std.testing.expectError(error.InvalidEquationScriptOverride, snapshot.read(a, &session, 0, .{}));
}
