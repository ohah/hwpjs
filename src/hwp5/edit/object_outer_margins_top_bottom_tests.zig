//! Separate follow-up fixture preservation; raw1 write admission stays explicitly pending.
const std = @import("std");
const a = std.testing.allocator;
const margins = @import("object_outer_margins.zig");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
test "H5 margins top bottom followup captionless body fixture keeps pending admission and source" {
    const original = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/textbox.hwp", a, .limited(8_000_000));
    defer a.free(original);
    const bytes = try @import("object_outer_margins_fixture.zig").prepare(a, original, .textbox, 1);
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const rows = try s.drawingSources(a, 0);
    defer a.free(rows);
    var selected: ?margins.Observation = null;
    for (rows) |row| if (row.kind_id == @import("../body/control_rules.zig").id("$rec")) {
        selected = try s.objectOuterMargins(.{ .section = 0, .kind = .textbox, .node = @intCast(row.component_node) });
    };
    const observed = selected orelse return error.MissingOuterMarginFixtureTarget;
    try std.testing.expectEqual(@as(u3, 1), observed.wrap_ordinal);
    try std.testing.expectEqual(margins.Table70Name.tight, observed.table70_name);
    try std.testing.expectEqual(.compact_vertical_exclusion, observed.current_renderer_margin_policy);
    try std.testing.expect(!observed.editable);
    try std.testing.expectEqualStrings("OuterMarginsTopBottomFollowUpRequired", observed.reason.?);
    const before = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    try std.testing.expectError(error.OuterMarginsReadOnly, h.apply(s, .{ .edit_object_outer_margins = .{ .target = observed.target, .expected = observed.margins, .margins = .{ 0, 0, 0, 750 } } }));
    const after = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(after.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
    try std.testing.expectEqual(@as(u32, 0), h.revision());
}
