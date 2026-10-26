//! Apply owned result intent after topology serialization, rebinding explicit IDs.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Values = @import("formula_result_override_values.zig").Values;

pub fn write(a: std.mem.Allocator, trees: []const Tree, section: usize, composed: []const u8, options: @import("text_sites.zig").Options, values: *const Values, limit: usize) ![]u8 {
    if (section >= trees.len) return error.InvalidSectionIndex;
    var rendered = try @import("xml_part_tree.zig").parse(a, composed, .section, section, trees[section].item_index, .{ .max_xml_bytes = limit });
    defer rendered.deinit(a);
    var rebound = try values.clone(a);
    defer rebound.deinit(a);
    for (rebound.entries.items, 0..) |*entry, index| {
        for (values.entries.items[0..index]) |previous| if (previous.begin_element == values.entries.items[index].begin_element)
            return error.InvalidFormulaResultOverrideSelection;
        entry.begin_element = try @import("formula_definition_rebind.zig").findNode(a, &trees[section], &rendered, entry.begin_element);
        for (rebound.entries.items[0..index]) |previous| if (previous.begin_element == entry.begin_element)
            return error.InvalidFormulaResultOverrideSelection;
    }
    const views = try a.dupe(Tree, trees);
    defer a.free(views);
    views[section] = rendered;
    var sites = try @import("text_sites.zig").collect(a, &rendered, options);
    defer sites.deinit(a);
    return @import("formula_section_save.zig").writeWithOverridesMode(a, views, section, &sites, options, &.{}, null, &rebound, limit, true);
}
