//! One-field source output assembly. Never mutates current sites or source.
const std = @import("std");

fn replacementAllocationCase(a: std.mem.Allocator) !void {
    const fixture = @import("test_formula_fixture.zig").section;
    const input = std.mem.indexOf(u8, fixture, ">2</p:t>").? + 1;
    const original = try std.mem.concat(a, u8, &.{ fixture[0..input], "8", fixture[input + 1 ..] });
    defer a.free(original);
    var tree = try @import("xml_part_tree.zig").parse(a, original, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    var parameters = try @import("parameter_lists.zig").inspect(a, &trees, .{});
    defer parameters.deinit();
    var markers = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &markers);
    defer a.free(ranges);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const range = ranges[0];
    const begin = markers.markers[range.begin_marker].element_index;
    const output = try writeReplacement(a, &tree, &sites, &parameters, range, begin, "=AVG(A1:A1)", .{}, .{}, 8192);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "=AVG(A1:A1)??%g,;;8") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "name='Formula'>=AVG(A1:A1)") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "name='LastResult'>8") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>2</p:t>") == null);
    try std.testing.expect(std.mem.indexOf(u8, output, "dirty=\"1\"") != null);
    try std.testing.expectEqualStrings(original, tree.source);
    try std.testing.expectEqualStrings("8", sites.items[0].text);
    try std.testing.expectEqualStrings("2", sites.items[1].text);
}

test "HWPX replacement formula XML synchronizes definition and caches on allocation failure" {
    try replacementAllocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(replacementAllocationCase, .{});
}

test "HWPX replacement formula XML actual chart reparses synchronized values" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const trees = [_]@import("xml_part_tree.zig").Tree{section.tree};
    var parameters = try @import("parameter_lists.zig").inspect(a, &trees, .{});
    defer parameters.deinit();
    var markers = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &markers);
    defer a.free(ranges);
    const range = ranges[0];
    const begin = markers.markers[range.begin_marker].element_index;
    const options = @import("editor_session.zig").siteOptions(session.options);
    const output = try writeReplacement(a, &section.tree, &section.sites, &parameters, range, begin, "=AVG(B?:E?)", .{}, options, section.tree.source.len + 4096);
    defer a.free(output);
    var definitions: @import("formula_definition_values.zig").Values = .{};
    defer definitions.deinit(a);
    try std.testing.expect(try definitions.set(a, &section.tree, begin, "=AVG(B?:E?)"));
    const prepared = try @import("formula_section_prepare.zig").prepare(a, &trees, 0, &section.sites, .{ .branch_policy = options.branch_policy, .definitions = &definitions });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    const assembled = try writeMany(a, &section.tree, &section.sites, prepared, options, section.tree.source.len + 4096);
    defer a.free(assembled);
    try std.testing.expectEqualSlices(u8, output, assembled);
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var query = try @import("formula_source_query.zig").read(a, &reopened, begin);
    defer query.deinit();
    try std.testing.expectEqualStrings("=AVG(B?:E?)", query.values.formula.?);
    try std.testing.expectEqualStrings("=AVG(B?:E?)??%g,;;16.875", query.values.command.?);
    try std.testing.expectEqualStrings("16.875", query.values.last_result.?);
    var current = try @import("text_sites.zig").collect(a, &reopened, options);
    defer current.deinit(a);
    var changed: usize = 0;
    try std.testing.expectEqual(section.sites.items.len, current.items.len);
    for (section.sites.items, current.items) |old, new| {
        if (std.mem.eql(u8, old.text, new.text)) continue;
        changed += 1;
        try std.testing.expectEqualStrings("67.5", old.text);
        try std.testing.expectEqualStrings("16.875", new.text);
    }
    try std.testing.expectEqual(@as(usize, 1), changed);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    try std.testing.expect(try section.formula_definitions.set(a, &section.tree, begin, "=AVG(B?:E?)"));
    const changed_zip = try session.save();
    defer a.free(changed_zip);
    var changed_session = try @import("editor_session.zig").open(a, changed_zip, .{});
    defer changed_session.deinit();
    var changed_query = try @import("formula_source_query.zig").read(a, &changed_session.sections[0].tree, begin);
    defer changed_query.deinit();
    try std.testing.expectEqualStrings("=AVG(B?:E?)", changed_query.values.formula.?);
    try std.testing.expectEqualStrings("16.875", changed_query.values.last_result.?);
    const resaved = try changed_session.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, changed_zip, resaved);
}

pub const Prepared = struct {
    begin: usize,
    display: []u8,
    result: @import("formula_result_sites.zig").Prepared,
    parameters: @import("formula_parameter_changes.zig").Prepared,
    formula: ?[]u8 = null,
    formula_change: ?@import("xml_source_writer.zig").Change = null,
    definition_result: ?[]u8 = null,
    preserve_parameters: bool = false,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.parameters.deinit(a);
        self.result.deinit(a);
        a.free(self.display);
        if (self.formula) |formula| a.free(formula);
        if (self.definition_result) |result| a.free(result);
        self.* = undefined;
    }
};

/// Attach an evaluated definition while preserving Prepared's owned buffers.
pub fn attachDefinition(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, report: *const @import("parameter_lists.zig").Report, field: *Prepared, plan: @import("formula_command_plan.zig").Plan) !void {
    if (field.formula != null or !std.mem.eql(u8, field.display, plan.display)) return error.InvalidFormulaDefinitionOutput;
    return attachDefinitionPreservingDisplay(a, tree, report, field, plan);
}

/// Own the calculated cache independently of a manually edited result body.
pub fn attachDefinitionPreservingDisplay(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, report: *const @import("parameter_lists.zig").Report, field: *Prepared, plan: @import("formula_command_plan.zig").Plan) !void {
    if (field.formula != null or field.definition_result != null) return error.InvalidFormulaDefinitionOutput;
    const command = try a.dupe(u8, plan.command);
    errdefer a.free(command);
    const formula = try a.dupe(u8, plan.formula);
    errdefer a.free(formula);
    const result = try a.dupe(u8, plan.display);
    errdefer a.free(result);
    const changes = @import("formula_parameter_changes.zig");
    const command_change = try changes.parameterChange(tree, report, field.begin, "Command", command);
    const result_change = try changes.parameterChange(tree, report, field.begin, "LastResult", result);
    const formula_change = try changes.parameterChange(tree, report, field.begin, "Formula", formula);
    a.free(field.parameters.command);
    field.parameters.command = command;
    field.parameters.changes = .{ command_change, result_change };
    field.formula = formula;
    field.formula_change = formula_change;
    field.definition_result = result;
}

pub fn prepare(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, parameters: *const @import("parameter_lists.zig").Report, range: @import("field_text_ranges.zig").Range, begin: usize, display: []const u8) !Prepared {
    if (begin >= tree.elements.len or tree.elements[begin].end != range.content_start) return error.SourceBindingMismatch;
    var result = try @import("formula_result_sites.zig").prepare(a, tree, sites, range, display);
    errdefer result.deinit(a);
    const owned_display = try a.dupe(u8, display);
    errdefer a.free(owned_display);
    const parameter_changes = try @import("formula_parameter_changes.zig").prepare(a, tree, parameters, begin, owned_display);
    return .{ .begin = begin, .display = owned_display, .result = result, .parameters = parameter_changes };
}

pub fn write(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, parameters: *const @import("parameter_lists.zig").Report, range: @import("field_text_ranges.zig").Range, begin: usize, display: []const u8, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    var prepared = try prepare(a, tree, sites, parameters, range, begin, display);
    defer prepared.deinit(a);
    return writeMany(a, tree, sites, &.{prepared}, options, max_bytes);
}

pub fn writeMany(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, prepared: []const Prepared, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    return writeManyWithDirty(a, tree, sites, prepared, options, &.{}, max_bytes);
}

/// Evaluates the replacement against current sites before assembling all caches.
/// Returns owned XML; neither the source nor current editor state is changed.
pub fn writeReplacement(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, parameters: *const @import("parameter_lists.zig").Report, range: @import("field_text_ranges.zig").Range, begin: usize, replacement: []const u8, limits: @import("formula_values.zig").Limits, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    var plan = try @import("formula_command_evaluation.zig").prepare(a, tree, sites, begin, replacement, limits);
    defer plan.deinit(a);
    var field = try prepare(a, tree, sites, parameters, range, begin, plan.display);
    defer field.deinit(a);
    const changes = @import("formula_parameter_changes.zig");
    // Keep Prepared ownership intact; the temporary command change borrows Plan.
    field.parameters.changes = .{
        try changes.parameterChange(tree, parameters, begin, "Command", plan.command),
        try changes.parameterChange(tree, parameters, begin, "LastResult", field.display),
    };
    const formula = try changes.parameterChange(tree, parameters, begin, "Formula", plan.formula);
    return writeManyWithChanges(a, tree, sites, &.{field}, options, &.{}, &.{formula}, max_bytes);
}

pub fn writeManyWithDirty(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, prepared: []const Prepared, options: @import("text_sites.zig").Options, existing_dirty: []const @import("text_sites_save.zig").FieldDirty, max_bytes: usize) ![]u8 {
    return writeManyWithChanges(a, tree, sites, prepared, options, existing_dirty, &.{}, max_bytes);
}

pub fn writeManyWithChanges(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, sites: *const @import("text_sites.zig").Sites, prepared: []const Prepared, options: @import("text_sites.zig").Options, existing_dirty: []const @import("text_sites_save.zig").FieldDirty, extra: []const @import("xml_source_writer.zig").Change, max_bytes: usize) ![]u8 {
    // Shallow temporary view: unchanged strings borrow current sites; changed
    // strings borrow Prepared. This array alone is owned here.
    const items = try a.dupe(@import("text_sites.zig").Site, sites.items);
    defer a.free(items);
    var changes: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer changes.deinit(a);
    try changes.appendSlice(a, extra);
    var dirty: std.ArrayList(@import("text_sites_save.zig").FieldDirty) = .empty;
    defer dirty.deinit(a);
    try dirty.appendSlice(a, existing_dirty);
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (prepared) |field| {
        for (field.result.items) |replacement| {
            if (replacement.site_index >= items.len) return error.InvalidTextSites;
            if ((try seen.getOrPut(a, replacement.site_index)).found_existing) return error.AmbiguousFormulaResultSite;
            items[replacement.site_index].text = replacement.text;
        }
        if (field.preserve_parameters) {
            if (field.formula_change != null or field.formula != null) return error.ConflictingFormulaResultOverride;
            continue;
        }
        try changes.appendSlice(a, &field.parameters.changes);
        if (field.formula_change) |change| try changes.append(a, change);
        var existing: ?usize = null;
        for (dirty.items, 0..) |value, index| if (value.element_index == field.begin) {
            existing = index;
        };
        if (existing) |index| dirty.items[index].dirty = true else try dirty.append(a, .{ .element_index = field.begin, .dirty = true });
    }
    const temporary: @import("text_sites.zig").Sites = .{ .items = items };
    return @import("text_sites_save.zig").writeWithChanges(a, tree, &temporary, options, dirty.items, changes.items, max_bytes);
}

test "HWPX formula field output synchronizes result and parameters without partial state on allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='FORMULA'><p:parameters><p:stringParam name='Command'>=SUM(A1:A2)??%g,;;9</p:stringParam><p:stringParam name='Formula'>=SUM(A1:A2)</p:stringParam><p:stringParam name='LastResult'>9</p:stringParam></p:parameters></p:fieldBegin></p:ctrl><p:t>9</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    var params = try @import("parameter_lists.zig").inspect(a, &trees, .{});
    defer params.deinit();
    var markers = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, &trees, &markers);
    defer a.free(ranges);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const begin = markers.markers[ranges[0].begin_marker].element_index;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, t: *@import("xml_part_tree.zig").Tree, s: *@import("text_sites.zig").Sites, p: *@import("parameter_lists.zig").Report, r: @import("field_text_ranges.zig").Range, b: usize, original: []const u8) !void {
            defer {
                std.testing.expectEqualStrings("9", s.items[0].text) catch @panic("partial text mutation");
                std.testing.expectEqualStrings(original, t.source) catch @panic("source mutation");
            }
            const output = try write(allocator, t, s, p, r, b, "42", .{}, 4096);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>42</p:t>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, ",;;42</p:stringParam>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "name='LastResult'>42</p:stringParam>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "dirty=\"1\"") != null);
        }
    }.run, .{ &tree, &sites, &params, ranges[0], begin, source });
    var duplicated = try prepare(a, &tree, &sites, &params, ranges[0], begin, "42");
    defer duplicated.deinit(a);
    try std.testing.expectError(error.AmbiguousFormulaResultSite, writeMany(a, &tree, &sites, &.{ duplicated, duplicated }, .{}, 4096));
}
