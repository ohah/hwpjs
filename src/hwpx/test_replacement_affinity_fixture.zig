//! Test fixture and ownership assertions only; no filesystem dumps.
const std = @import("std");
const editor = @import("editor_session.zig");
pub fn formulaInput(a: std.mem.Allocator) ![]u8 {
    const source = @import("test_formula_fixture.zig").section;
    const begin = std.mem.indexOf(u8, source, "<p:ctrl><p:fieldBegin").?;
    const end_text = "<p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>";
    const end = std.mem.indexOf(u8, source, end_text).? + end_text.len;
    const xml = try std.mem.concat(a, u8, &.{ source[0..begin], "<p:t>X</p:t>", source[begin..end], "<p:t>Z</p:t>", source[end..] });
    defer a.free(xml);
    return @import("test_formula_fixture.zig").zipWithSection(a, xml);
}
pub fn materialize(s: *editor.Session, styled: bool) !void {
    const a = s.allocator;
    const part = &s.sections[0];
    var counters: @import("section_text.zig").Report = .{};
    part.structure_values = try @import("paragraph_structure_collect.zig").collect(a, &part.tree, &part.sites, part.locations, editor.siteOptions(s.options), &counters);
    part.sites.deinit(a);
    part.sites = .{ .items = try a.alloc(@import("text_sites.zig").Site, 0) };
    if (styled) {
        const row = &part.structure_values.?.paragraphs[1];
        const locations = try @import("paragraph_structure_locations.zig").build(a, &part.tree, row);
        defer a.free(locations);
        const positions = try @import("anchor_text_positions.zig").buildForFieldText(a, &part.tree, &row.sites, locations, 1);
        defer a.free(positions);
        const projection = try @import("character_style_projection.zig").build(a, &part.tree, &row.sites, positions, 100);
        defer a.free(projection);
        row.character_styles = try @import("character_style_paint.zig").fromProjection(a, projection, 100);
    }
}
pub fn assertSaved(s: *editor.Session, suffix: []const u8) !void {
    const a = s.allocator;
    const saved = try s.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    var analysis = try @import("source_field_analysis.zig").build(a, reopened.sections);
    defer analysis.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), analysis.fields.len);
    const field = analysis.fields[0];
    var count: usize = 0;
    for (reopened.sections[0].sites.items) |site| {
        if (site.start >= field.content_start and site.start < field.content_end) {
            try std.testing.expectEqualStrings("2", site.text);
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    try std.testing.expectEqualStrings(suffix, reopened.sections[0].sites.items[reopened.sections[0].sites.items.len - 1].text);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].field_dirty.items.len);
    var current = try @import("formula_current_snapshot.zig").readFlat(a, &reopened, 0);
    defer current.deinit(a);
    try std.testing.expectEqualStrings("2", current.rows[0].values.last_result.?);
}
