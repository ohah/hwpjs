const std = @import("std");
const plans = @import("field_source_outside_plan.zig");

test "formula split current endpoints use complete multi-site result and stay read only through allocation failures" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const xml = try std.mem.replaceOwned(u8, a, fixture.section, "<p:t>2</p:t><p:ctrl><p:fieldEnd", "<p:t></p:t><p:t>2</p:t><p:ctrl><p:fieldEnd");
    defer a.free(xml);
    const input = try fixture.zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splice(0, 1, 0, 1, "100"));
    const before = try session.save();
    defer a.free(before);
    for ([_]u32{ 0, 3 }) |at| {
        const plan = (try plans.prepareFormulaSplit(&session, 0, 2, at, at)) orelse return error.MissingFormulaSplitCoordinates;
        defer plan.deinit(a);
        try std.testing.expectEqual(if (at == 0) @as(u32, 0) else @as(u32, 1), plan.start);
        try std.testing.expectEqual(plan.start, plan.end);
    }
    const queried = try session.save();
    defer a.free(queried);
    try std.testing.expectEqualSlices(u8, before, queried);
    const section = &session.sections[0];
    const trees = [_]@import("xml_part_tree.zig").Tree{section.tree};
    var fields = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer fields.deinit();
    const begin = fields.markers[0].element_index;
    try std.testing.expect(try session.setFormulaDefinition(0, begin, "=AVG(A1:A1)"));
    const derived_before = try session.save();
    defer a.free(derived_before);
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &counters);
    defer values.deinit(a);
    const id = try @import("paragraph_instance_ids.zig").next(a, &trees, &.{}, 100);
    var candidate = try @import("field_structure_split.zig").prepareWholeFormula(a, &trees, 0, &values, 1, 0, 0, id, &fields, 10000, 100);
    defer candidate.deinit(a);
    const composed = try @import("paragraph_structure_save.zig").writeWholeFormulaWithDefinitions(a, &trees, 0, &candidate, .{}, &.{}, &section.formula_definitions, 10000);
    defer a.free(composed);
    var parsed = try @import("xml_part_tree.zig").parse(a, composed, .section, 0, 0, .{});
    defer parsed.deinit(a);
    var after_fields = try @import("field_markers.zig").inspect(a, &.{parsed}, .{});
    defer after_fields.deinit();
    const owner = try @import("paragraph_site_owner.zig").ancestor(&parsed, after_fields.markers[0].element_index);
    try std.testing.expect(std.mem.indexOf(u8, parsed.sourceOf(owner), ">100</p:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, composed, "=AVG(A1:A1)") != null);
    try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, composed, ">100</p:t>"));
    try std.testing.expectEqual(@as(usize, 0), candidate.paragraphs[1].field_positions.?.len);
    try std.testing.expectEqual(@as(usize, 2), candidate.paragraphs[2].field_positions.?.len);
    try std.testing.expectError(error.UnsupportedStructuralFieldEdit, @import("paragraph_structure_save.zig").writeWithFieldGroups(a, &trees, 0, &candidate, .{}, &.{}, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: []const @import("xml_part_tree.zig").Tree, original: *const @import("paragraph_structure_values.zig").Values, definitions: *const @import("formula_definition_values.zig").Values, expected: []const u8) !void {
            const xml_out = try @import("paragraph_structure_save.zig").writeWholeFormulaWithDefinitions(allocator, borrowed, 0, original, .{}, &.{}, definitions, 10000);
            defer allocator.free(xml_out);
            try std.testing.expectEqualSlices(u8, expected, xml_out);
        }
    }.run, .{ &trees, &candidate, &section.formula_definitions, composed });
    try std.testing.expectError(error.ProtectedFieldRange, plans.prepareFormulaSplit(&session, 0, 2, 1, 1));
    try std.testing.expectError(error.ProtectedFieldRange, plans.prepareFormulaSplit(&session, 0, 2, 0, 3));
    try std.testing.expectError(error.ProtectedFieldRange, plans.prepare(&session, 0, 2, 0, 0));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const @import("editor_session.zig").Session) !void {
            var proxy = original.*;
            proxy.allocator = allocator;
            const plan = (try @import("field_source_outside_plan.zig").prepareFormulaSplit(&proxy, 0, 2, 3, 3)) orelse return error.MissingFormulaSplitCoordinates;
            defer plan.deinit(allocator);
            try std.testing.expectEqual(@as(u32, 1), plan.start);
        }
    }.run, .{&session});
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, derived_before, after);
}

test "actual chart formula split endpoints follow live number and definition widths" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const trees = [_]@import("xml_part_tree.zig").Tree{session.sections[0].tree};
    var fields = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer fields.deinit();
    const begin = for (fields.markers) |marker| {
        if (marker.kind == .begin and std.mem.eql(u8, marker.begin.?.type_raw orelse "", "FORMULA")) break marker.element_index;
    } else return error.MissingFormulaField;
    try std.testing.expect(try session.splice(0, 20, 0, 4, "100"));
    const number = (try plans.prepareFormulaSplit(&session, 0, 24, 5, 5)) orelse return error.MissingFormulaSplitCoordinates;
    defer number.deinit(a);
    try std.testing.expectEqual(@as(u32, 4), number.start);
    try std.testing.expect(try session.setFormulaDefinition(0, begin, "=AVG(B?:E?)"));
    const definition = (try plans.prepareFormulaSplit(&session, 0, 24, 6, 6)) orelse return error.MissingFormulaSplitCoordinates;
    defer definition.deinit(a);
    try std.testing.expectEqual(@as(u32, 4), definition.start);
    for ([_]u32{ 1, 2, 3, 4, 5 }) |at| try std.testing.expectError(error.ProtectedFieldRange, plans.prepareFormulaSplit(&session, 0, 24, at, at));
}
