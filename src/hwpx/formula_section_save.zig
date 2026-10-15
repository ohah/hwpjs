//! Save-time derivation from current strings, with no persistent result cache.
const std = @import("std");

pub const hasFormula = @import("formula_source_query.zig").hasFormula;

pub fn write(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, dirty: []const @import("text_sites_save.zig").FieldDirty, max_bytes: usize) ![]u8 {
    return writeWithDefinitions(a, trees, section, sites, options, dirty, null, max_bytes);
}

pub fn writeWithDefinitions(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, dirty: []const @import("text_sites_save.zig").FieldDirty, definitions: ?*const @import("formula_definition_values.zig").Values, max_bytes: usize) ![]u8 {
    return writeWithDefinitionsMode(a, trees, section, sites, options, dirty, definitions, max_bytes, false);
}

/// Only the final flat source save may preserve an untouched source display.
/// Rebuilt temporary topology must still derive current calculation output.
pub fn writeWithDefinitionsMode(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, dirty: []const @import("text_sites_save.zig").FieldDirty, definitions: ?*const @import("formula_definition_values.zig").Values, max_bytes: usize, preserve_untouched: bool) ![]u8 {
    return writeWithOverridesMode(a, trees, section, sites, options, dirty, definitions, null, max_bytes, preserve_untouched);
}

pub fn writeWithOverridesMode(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, dirty: []const @import("text_sites_save.zig").FieldDirty, definitions: ?*const @import("formula_definition_values.zig").Values, overrides: ?*const @import("formula_result_override_values.zig").Values, max_bytes: usize, preserve_untouched: bool) ![]u8 {
    if (section >= trees.len) return error.InvalidSectionIndex;
    const tree = &trees[section];
    if (!try hasFormula(a, tree)) {
        if (overrides) |values| if (values.entries.items.len != 0) return error.InvalidFormulaResultOverrideSelection;
        if (definitions) |values| if (values.entries.items.len != 0) return error.InvalidFormulaDefinitionSelection;
        return @import("text_sites_save.zig").writeWithFieldDirty(a, tree, sites, options, dirty, max_bytes);
    }
    // A derived display query is not an edit or an instruction to repair
    // stale source caches. Preserve the original section when authority has
    // not changed; actual text/definition edits still use preparation below.
    const has_definitions = if (definitions) |values| values.entries.items.len != 0 else false;
    const has_overrides = if (overrides) |values| values.entries.items.len != 0 else false;
    var preserve_unrelated = false;
    if (preserve_untouched and !has_definitions and dirty.len == 0) {
        const plain = try @import("text_sites_save.zig").writeWithFieldDirty(a, tree, sites, options, dirty, max_bytes);
        if (std.mem.eql(u8, plain, tree.source)) {
            if (!has_overrides) return plain;
            preserve_unrelated = true;
        }
        a.free(plain);
    }
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section, sites, .{ .branch_policy = options.branch_policy, .definitions = definitions, .result_overrides = overrides });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    if (preserve_unrelated) {
        // Preparation still validates every dependency before publication.
        // Borrow only explicit manual results; leave unrelated source displays
        // and their cached/dirty state untouched, even when already stale.
        var selected: std.ArrayList(@import("formula_field_output.zig").Prepared) = .empty;
        defer selected.deinit(a);
        for (prepared) |field| if (field.preserve_parameters or overrides.?.origin(field.begin) == .automatic) try selected.append(a, field);
        return @import("formula_field_output.zig").writeManyWithDirty(a, tree, sites, selected.items, options, dirty, max_bytes);
    }
    return @import("formula_field_output.zig").writeManyWithDirty(a, tree, sites, prepared, options, dirty, max_bytes);
}

fn staleDisplayCase(a: std.mem.Allocator) !void {
    const owner = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig").section;
    const result = std.mem.lastIndexOf(u8, fixture, "<p:t>2</p:t>").?;
    const xml = try std.mem.concat(owner, u8, &.{ fixture[0..result], "<p:t>100</p:t>", fixture[result + "<p:t>2</p:t>".len ..] });
    defer owner.free(xml);
    var tree = try @import("xml_part_tree.zig").parse(owner, xml, .section, 0, 0, .{});
    defer tree.deinit(owner);
    var sites = try @import("text_sites.zig").collect(owner, &tree, .{});
    defer sites.deinit(owner);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    const untouched = try writeWithDefinitionsMode(a, &trees, 0, &sites, .{}, &.{}, null, xml.len + 4096, true);
    defer a.free(untouched);
    try std.testing.expectEqualStrings(xml, untouched);
    const derived = try write(a, &trees, 0, &sites, .{}, &.{}, xml.len + 4096);
    defer a.free(derived);
    try std.testing.expect(std.mem.indexOf(u8, derived, "<p:t>100</p:t>") == null);
    const numeric = try owner.dupe(u8, "5");
    owner.free(sites.items[0].text);
    sites.items[0].text = numeric;
    const edited = try write(a, &trees, 0, &sites, .{}, &.{}, xml.len + 4096);
    defer a.free(edited);
    try std.testing.expect(std.mem.indexOf(u8, edited, "<p:t>100</p:t>") == null);
    try std.testing.expect(std.mem.indexOf(u8, edited, "=SUM(A1:A1)??%g,;;5") != null);
    try std.testing.expect(std.mem.indexOf(u8, edited, "name='LastResult'>5") != null);
    try std.testing.expectEqualStrings(xml, tree.source);
    try std.testing.expectEqualStrings("100", sites.items[1].text);
}

test "HWPX formula untouched stale display survives save while numeric edits recalculate under OOM" {
    try staleDisplayCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(staleDisplayCase, .{});
}
