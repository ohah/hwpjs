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
/// Temporary rebuilt topology must still derive current calculation output.
pub fn writeWithDefinitionsMode(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, dirty: []const @import("text_sites_save.zig").FieldDirty, definitions: ?*const @import("formula_definition_values.zig").Values, max_bytes: usize, preserve_untouched: bool) ![]u8 {
    if (section >= trees.len) return error.InvalidSectionIndex;
    const tree = &trees[section];
    if (!try hasFormula(a, tree)) {
        if (definitions) |values| if (values.entries.items.len != 0) return error.InvalidFormulaDefinitionSelection;
        return @import("text_sites_save.zig").writeWithFieldDirty(a, tree, sites, options, dirty, max_bytes);
    }
    const has_definitions = if (definitions) |values| values.entries.items.len != 0 else false;
    if (preserve_untouched and !has_definitions and dirty.len == 0) {
        const plain = try @import("text_sites_save.zig").writeWithFieldDirty(a, tree, sites, options, dirty, max_bytes);
        if (std.mem.eql(u8, plain, tree.source)) return plain;
        a.free(plain);
    }
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section, sites, .{ .branch_policy = options.branch_policy, .definitions = definitions });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    return @import("formula_field_output.zig").writeManyWithDirty(a, tree, sites, prepared, options, dirty, max_bytes);
}
