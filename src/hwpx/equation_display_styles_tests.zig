const std = @import("std");
const t = std.testing;
const styles = @import("equation_display_styles.zig");
test "equation display styles own original frame and isolate invalid duplicate foreign sizes" {
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'><p:p><p:run><p:equation font='A'><p:sz width='0010' height='20' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE' protect='0' future='x'/><p:script>x</p:script></p:equation><p:equation><f:sz width='5'/><p:script>y</p:script></p:equation><p:equation><p:sz/><p:sz/><p:script>z</p:script></p:equation><p:equation font='B'><p:sz width='oops'/><p:script>w</p:script></p:equation></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(t.allocator, input);
    defer t.allocator.free(bytes);
    var session = try @import("editor_session.zig").open(t.allocator, bytes, .{});
    var live = true;
    defer if (live) session.deinit();
    const Probe = struct {
        fn run(a: std.mem.Allocator, current: *const @import("editor_session.zig").Session) !void {
            var report = try styles.read(a, current, 0);
            defer report.deinit();
            try t.expectEqualStrings("0010", report.rows[0].source_size.?.width.?);
            try t.expectEqualStrings("ABSOLUTE", report.rows[0].source_size.?.width_relative_to.?);
            try t.expectEqual(@as(usize, 1), report.rows[0].source_size.?.other_attributes);
            try t.expect(report.rows[1].source_size == null and report.rows[1].size_error == null);
            try t.expectEqualStrings("DuplicateEquationSize", report.rows[2].size_error.?);
            try t.expect(report.rows[3].size_error != null and report.rows[3].error_name == null);
            try t.expectEqualStrings("B", report.rows[3].font.?);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{&session});
    var detached = try styles.read(t.allocator, &session, 0);
    defer detached.deinit();
    try t.expect(try session.setEquationScript(0, detached.rows[0].node, "x over y"));
    try Probe.run(t.allocator, &session);
    session.deinit();
    live = false;
    try t.expectEqualStrings("0010", detached.rows[0].source_size.?.width.?);
    try t.expectEqualStrings("20", detached.rows[0].source_size.?.height.?);
}
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:equation baseUnit='001000' font='F&amp;F' textColor='#A0b1C2' baseLine='85' lineMode='CHAR'><p:script>x</p:script></p:equation><p:equation><p:script>y</p:script></p:equation><p:equation baseUnit='bad'><p:script>z</p:script></p:equation></p:run></p:p></s:sec>";
fn check(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session) !void {
    var report = try styles.read(a, session, 0);
    defer report.deinit();
    try t.expectEqual(@as(usize, 3), report.rows.len);
    try t.expectEqualStrings("001000", report.rows[0].base_unit.?);
    try t.expectEqualStrings("F&F", report.rows[0].font.?);
    try t.expectEqualStrings("#A0b1C2", report.rows[0].text_color.?);
    try t.expectEqualStrings("85", report.rows[0].base_line.?);
    try t.expect(report.rows[1].base_unit == null);
    try t.expectEqualStrings("InvalidNonNegativeInteger", report.rows[2].error_name.?);
}
test "equation display styles preserve absent lexical values and isolate invalid attributes under OOM" {
    const input = try @import("test_formula_fixture.zig").zipWithSection(t.allocator, xml);
    defer t.allocator.free(input);
    var session = try @import("editor_session.zig").open(t.allocator, input, .{});
    defer session.deinit();
    try t.checkAllAllocationFailures(t.allocator, check, .{&session});
    try t.expectError(error.InvalidSectionIndex, styles.read(t.allocator, &session, 1));
    var report = try styles.read(t.allocator, &session, 0);
    defer report.deinit();
    try t.expect(try session.setEquationScript(0, report.rows[0].node, "x over y"));
    try check(t.allocator, &session);
}
test "equation display styles own strings after session destruction" {
    var session = try @import("editor_history_test_fixture.zig").open(t.allocator, xml, 1);
    var live = true;
    defer if (live) session.deinit();
    var report = try styles.read(t.allocator, &session, 0);
    defer report.deinit();
    session.deinit();
    live = false;
    try t.expectEqualStrings("F&F", report.rows[0].font.?);
    try t.expectEqualStrings("001000", report.rows[0].base_unit.?);
    try t.expectEqualStrings("InvalidNonNegativeInteger", report.rows[2].error_name.?);
}
