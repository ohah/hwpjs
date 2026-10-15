//! Restore preserved source displays into a candidate, never into a read query.
//! A body/cache mismatch is source provenance, not inferred user intent/dirty.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Values = @import("formula_result_override_values.zig").Values;

pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, current: *const Sites, definitions: ?*const @import("formula_definition_values.zig").Values, existing: *const Values, options: @import("text_sites.zig").Options) !Values {
    if (section >= trees.len) return error.InvalidSectionIndex;
    const tree = &trees[section];
    var original = try @import("text_sites.zig").collect(a, tree, options);
    defer original.deinit(a);
    var candidate = try existing.clone(a);
    errdefer candidate.deinit(a);
    var seeded: Values = .{};
    defer seeded.deinit(a);
    var markers = try @import("field_markers.zig").inspect(a, trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, trees, &markers);
    defer a.free(ranges);
    var parameters = try @import("parameter_lists.zig").inspect(a, trees, .{});
    defer parameters.deinit();
    const frames = try @import("xml_tree_selection.zig").build(a, tree, options.branch_policy, options.max_attribute_bytes);
    defer a.free(frames);
    for (ranges) |range| {
        if (range.section != section) continue;
        const begin = markers.markers[range.begin_marker];
        const end = markers.markers[range.end_marker];
        if (!frames[begin.element_index].active or !frames[end.element_index].active) continue;
        if (!std.mem.eql(u8, begin.begin.?.type_raw orelse continue, "FORMULA")) continue;
        if (candidate.origin(begin.element_index) != null) continue;
        if (definitions) |values| if (values.get(begin.element_index) != null) continue;
        const view = (try @import("formula_parameters.zig").read(&parameters, section, begin.element_index)) orelse return error.MissingFormulaParameters;
        const cached = view.last_result orelse continue;
        const display = try @import("formula_source_display.zig").read(a, tree, &original, range);
        defer a.free(display);
        if (std.mem.eql(u8, display, cached)) continue;
        var validated = try @import("formula_result_sites.zig").prepare(a, tree, &original, range, display);
        defer validated.deinit(a);
        _ = try seeded.set(a, tree, begin.element_index, display);
        seeded.entries.items[seeded.entries.items.len - 1].origin = .source_display;
    }
    // Earlier edits of this reopened source must suppress reseeding their
    // old display. This uses the same observer/invalidation transaction.
    if (seeded.entries.items.len == 0) return candidate;
    var filtered = try @import("formula_result_override_invalidation.zig").prepare(a, trees, section, &original, current, definitions, &seeded);
    defer filtered.deinit(a);
    const limit = (@import("formula_section_prepare.zig").Options{}).max_fields;
    if (candidate.entries.items.len > limit or filtered.entries.items.len > limit - candidate.entries.items.len) return error.LimitExceeded;
    try candidate.entries.ensureUnusedCapacity(a, filtered.entries.items.len);
    for (filtered.entries.items) |entry| candidate.entries.appendAssumeCapacity(entry);
    filtered.entries.items.len = 0;
    return candidate;
}

test "HWPX source result seed owns provenance and never mutates live state under OOM" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    const marker = std.mem.lastIndexOf(u8, fixture, "<p:t>2</p:t>").?;
    const xml = try std.mem.concat(a, u8, &.{ fixture[0..marker], "<p:t>수동</p:t>", fixture[marker + "<p:t>2</p:t>".len ..] });
    defer a.free(xml);
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const begin = for (section.tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session, node: usize) !void {
            const value = &source.sections[0];
            defer std.testing.expectEqual(@as(usize, 0), value.formula_result_overrides.entries.items.len) catch @panic("source seeded in place");
            var seeded = try prepare(allocator, &.{value.tree}, 0, &value.sites, &value.formula_definitions, &value.formula_result_overrides, @import("editor_session.zig").siteOptions(source.options));
            defer seeded.deinit(allocator);
            try std.testing.expectEqualStrings("수동", seeded.get(node).?);
            try std.testing.expectEqual(@import("formula_result_override_values.zig").Origin.source_display, seeded.origin(node).?);
        }
    }.run, .{ &session, begin });
}

test "HWPX source result seed definition reset is atomic under OOM" {
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            const fixture = @import("test_formula_fixture.zig").section;
            const marker = std.mem.lastIndexOf(u8, fixture, "<p:t>2</p:t>").?;
            const xml = try std.mem.concat(a, u8, &.{ fixture[0..marker], "<p:t>수동</p:t>", fixture[marker + "<p:t>2</p:t>".len ..] });
            defer a.free(xml);
            const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
            defer a.free(input);
            var session = try @import("editor_session.zig").open(a, input, .{});
            defer session.deinit();
            const section = &session.sections[0];
            const begin = for (section.tree.elements, 0..) |element, index| {
                if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
            } else return error.TestExpectedEqual;
            const changed = session.setFormulaDefinition(0, begin, "=SUM(A1:A1)") catch |err| {
                try std.testing.expectEqual(@as(usize, 0), section.formula_result_overrides.entries.items.len);
                try std.testing.expect(section.formula_definitions.get(begin) == null);
                try std.testing.expectEqualSlices(u8, input, session.source);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@import("formula_result_override_values.zig").Origin.automatic, section.formula_result_overrides.origin(begin).?);
            try std.testing.expect(section.formula_result_overrides.get(begin) == null);
        }
    }.run, .{});
}
