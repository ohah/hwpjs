const std = @import("std");
const fixture = @import("test_replacement_affinity_fixture.zig");

fn exercise(mode: usize) !void {
    const a = std.testing.allocator;
    const original = try fixture.formulaInput(a);
    defer a.free(original);
    var source = try @import("editor_session.zig").open(a, original, .{});
    defer source.deinit();
    const xml = source.sections[0].tree.source;
    const suffix = "<p:t>Z</p:t>";
    const at = std.mem.indexOf(u8, xml, suffix).?;
    const derived = try std.mem.concat(a, u8, &.{ xml[0..at], "<p:t>B<p:titleMark ignore='1'/>C</p:t>", xml[at + suffix.len ..] });
    defer a.free(derived);
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, derived);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    if (mode != 0) try fixture.materialize(&session, mode == 2);
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&session, 0, 2, 3, 4));
    try std.testing.expect(try session.splice(0, 2, 3, 1, "Y"));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(std.mem.indexOf(u8, reopened.sections[0].tree.source, "<p:t>BY<p:titleMark ignore='1'/></p:t>") != null);
    var analysis = try @import("source_field_analysis.zig").build(a, reopened.sections);
    defer analysis.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), analysis.fields.len);
    var count: usize = 0;
    for (reopened.sections[0].sites.items) |site| {
        if (site.start >= analysis.fields[0].content_start and site.start < analysis.fields[0].content_end) {
            try std.testing.expectEqualStrings("2", site.text);
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "field exterior title mark source preserves XML owner" {
    try exercise(0);
}
test "field exterior title mark current preserves XML owner" {
    try exercise(1);
}
test "field exterior title mark styled preserves XML owner" {
    try exercise(2);
}
