//! Save-time derivation from current strings, with no persistent result cache.
const std = @import("std");

pub fn hasFormula(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree) !bool {
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) continue;
        const raw = (try tree.attributeValue(a, index, "", "type")) orelse continue;
        const kind = try raw.toUtf8(a, 4096);
        defer a.free(kind);
        if (std.mem.eql(u8, kind, "FORMULA")) {
            return true;
        }
    }
    return false;
}

pub fn write(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, dirty: []const @import("text_sites_save.zig").FieldDirty, max_bytes: usize) ![]u8 {
    if (section >= trees.len) return error.InvalidSectionIndex;
    const tree = &trees[section];
    if (!try hasFormula(a, tree)) return @import("text_sites_save.zig").writeWithFieldDirty(a, tree, sites, options, dirty, max_bytes);
    const prepared = try @import("formula_section_prepare.zig").prepare(a, trees, section, sites, .{ .branch_policy = options.branch_policy });
    defer {
        for (prepared) |*field| field.deinit(a);
        a.free(prepared);
    }
    return @import("formula_field_output.zig").writeManyWithDirty(a, tree, sites, prepared, options, dirty, max_bytes);
}
