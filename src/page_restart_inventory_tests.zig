const std = @import("std");
const a = std.testing.allocator;
const fixture = @import("page_restart_history_fixture.zig");
const caps = @import("wasm/page_restart_capabilities.zig");
const wire = @import("wasm/page_restart_wire.zig");
const binding: wire.Binding = .{ .session = "native-source-test", .revision = "0", .serial = "0" };

fn h5Many() ![]u8 {
    const input = try fixture.h5(a, 1);
    defer a.free(input);
    var original = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer original.deinit();
    const info = try original.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const raw = try original.decodeSection(a, 0);
    defer a.free(raw);
    const additional = try @import("hwp5/edit/page_restart_edit_fixture.zig").make(a, 7, 0, &.{});
    defer a.free(additional);
    const body = try std.mem.concat(a, u8, &.{ raw, additional });
    defer a.free(body);
    return @import("hwp5/test_section_count_fixture.zig").build(a, try original.file.readStream(a, "/FileHeader"), info, body, &.{"Section0"});
}
fn hxMany(same_paragraph: bool) ![]u8 {
    const input = try fixture.hx(a);
    defer a.free(input);
    var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    const node = try fixture.hxControl(&session);
    const ctrl = tree.elements[node].parent.?;
    const run = tree.elements[ctrl].parent.?;
    const insertion = if (same_paragraph) tree.elements[run].end_tag.?.start else tree.elements[0].end_tag.?.start;
    const extra = if (same_paragraph)
        "<hp:ctrl><hp:newNum numType='PAGE' num='9'/></hp:ctrl>"
    else
        "<hp:p id='2' paraPrIDRef='0' styleIDRef='0' pageBreak='0' columnBreak='0' merged='0'><hp:run charPrIDRef='0'><hp:ctrl><hp:newNum numType='PAGE' num='9'/></hp:ctrl><hp:t>another</hp:t></hp:run></hp:p>";
    const xml = try @import("hwpx/xml_source_writer.zig").write(a, tree.source, &.{.{ .start = insertion, .end = insertion, .text = "", .serialized_xml = extra }}, 4_000_000);
    defer a.free(xml);
    return @import("zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = session.sections[0].entry_index, .bytes = xml }}, .{});
}
test "PAGE restart inventory H5 two physical owners retain exact Native refs and selected commit" {
    const input = try h5Many();
    defer a.free(input);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try @import("hwp5/edit/editor_history.zig").History.initV2(a, session, .{});
    defer history.deinit();
    var store: caps.H5Store = .{};
    defer store.clear(a);
    const packet = try caps.h5(a, session, &history, &store, binding);
    defer a.free(packet);
    try std.testing.expectEqual(@as(usize, 2), store.entries.items.len);
    const first = try store.take("1");
    const second = try store.take("2");
    try std.testing.expect(first.target.control_node < second.target.control_node);
    try std.testing.expect(first.anchor.paragraph < second.anchor.paragraph);
    try std.testing.expect(try history.apply(session, .{ .edit_page_restart = .{ .before = second, .number = 30 } }));
    try std.testing.expectEqual(@as(u16, 7), (try history.pageRestart(session, a, 0, first.target.control_node)).target.number);
    try std.testing.expectEqual(@as(u16, 30), (try history.pageRestart(session, a, 0, second.target.control_node)).target.number);
}
test "PAGE restart inventory H5 re-observes stale ref even for unchanged requested number" {
    const input = try h5Many();
    defer a.free(input);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    session.enableHistoryDelta();
    var history = try @import("hwp5/edit/editor_history.zig").History.initV2(a, session, .{});
    defer history.deinit();
    const rows = try history.pageRestartInventory(session, a, 0);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    try std.testing.expect(try history.apply(session, .{ .edit_page_restart = .{ .before = rows[0].observation.?, .number = 9 } }));
    try std.testing.expectError(error.StalePageRestartBinding, history.apply(session, .{ .edit_page_restart = .{ .before = rows[1].observation.?, .number = 7 } }));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
}
test "PAGE restart inventory HX two leaf controls keep Native one-based IDs private and clear old leases" {
    const input = try hxMany(false);
    defer a.free(input);
    var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try @import("hwpx/editor_history.zig").History.initV2(&session, .{});
    defer history.deinit();
    var store: caps.HXStore = .{};
    defer store.clear(a);
    const packet = try caps.hx(a, &session, &history, &store, binding);
    defer a.free(packet);
    try std.testing.expectEqual(@as(usize, 2), store.entries.items.len);
    try std.testing.expect(std.mem.indexOf(u8, packet, "\"ticket\"") == null);
    try std.testing.expect(std.mem.indexOf(u8, packet, "section_digest") == null);
    const chosen = try store.take("2");
    try std.testing.expectEqual(@as(usize, 3), chosen.paragraph);
    const request: @import("hwpx/page_restart_history.zig").Request = .{ .before = chosen, .number = 30 };
    try std.testing.expect(try history.apply(&session, .{ .kind = .page_restart, .page_restart = &request, .section = 0, .paragraph = chosen.paragraph, .start = 0, .deleted = 0, .inserted = "" }));
    const next = try caps.hx(a, &session, &history, &store, .{ .session = "native-source-test", .revision = "1", .serial = "1" });
    defer a.free(next);
    try std.testing.expectError(error.StalePageRestartLease, store.take("1"));
}
test "PAGE restart inventory HX same paragraph ambiguity is local and query preserves source" {
    const input = try hxMany(true);
    defer a.free(input);
    var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try @import("hwpx/editor_history.zig").History.initV2(&session, .{});
    defer history.deinit();
    const rows = try history.pageRestartInventory(&session, a, 0);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 2), rows.len);
    for (rows) |row| {
        try std.testing.expect(row.observation == null);
        try std.testing.expectEqualStrings("AmbiguousPageRestart", row.reason.?);
    }
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
    try std.testing.expectEqual(@as(u32, 0), history.revision());
}
