const std = @import("std");
const t = std.testing;
const sites = @import("equation_display_sites.zig");
const fixture = @import("editor_history_test_fixture.zig");
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>앞😀</p:t><p:equation><p:script>A</p:script></p:equation><p:t>뒤</p:t><p:equation/></p:run></p:p></s:sec>";

test "equation display sites preserve source diagnostics and follow UTF16 current text" {
    const a = t.allocator;
    var session = try fixture.open(a, xml, 1);
    defer session.deinit();
    const before = try sites.read(a, &session, 0);
    defer a.free(before);
    try t.expectEqual(@as(usize, 2), before.len);
    try t.expectEqual(@as(?usize, 1), before[0].paragraph);
    try t.expectEqual(@as(?usize, 3), before[0].anchor_unit);
    try t.expect(before[0].error_name == null);
    try t.expectEqual(@import("equation_script_sources.zig").Issue.missing_script, before[1].source.issue.?);
    try t.expect(before[1].paragraph == null and before[1].anchor_unit == null);
    try t.expect(try session.spliceAnchored(0, 1, 0, 0, "더😀"));
    const after = try sites.read(a, &session, 0);
    defer a.free(after);
    try t.expectEqualDeep(before[0].source, after[0].source);
    try t.expectEqual(@as(?usize, 6), after[0].anchor_unit);
    try t.expectEqual(before[0].paragraph, after[0].paragraph);
    try t.expectEqual(@as(?usize, 3), before[0].anchor_unit);
    try t.expectError(error.InvalidSectionIndex, sites.read(a, &session, 1));
}

fn allocationCase(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session) !void {
    const rows = try sites.read(a, session, 0);
    defer a.free(rows);
    try t.expectEqual(@as(usize, 2), rows.len);
    try t.expectEqual(@as(?usize, 3), rows[0].anchor_unit);
}

test "equation display sites release every failed allocation without changing session" {
    var session = try fixture.open(t.allocator, xml, 1);
    defer session.deinit();
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{&session});
    try allocationCase(t.allocator, &session);
}

test "equation display sites bind an actual equation placeholder and survive script edits" {
    const a = t.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/수식-문자처럼취급-아님.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const before = try sites.read(a, &session, 0);
    defer a.free(before);
    try t.expectEqual(@as(usize, 1), before.len);
    try t.expect(before[0].error_name == null);
    const text = try session.anchorText(0, before[0].paragraph.?);
    defer a.free(text);
    const units = try std.unicode.utf8ToUtf16LeAlloc(a, text);
    defer a.free(units);
    try t.expectEqual(@as(u16, 0xfffc), units[before[0].anchor_unit.?]);
    try t.expect(try session.setEquationScript(0, before[0].source.node, "{1+2} over {3}"));
    const after = try sites.read(a, &session, 0);
    defer a.free(after);
    try t.expectEqualDeep(before, after);
}
