//! Clear only overrides whose evaluated input cell text changed in a draft.
//! Uses the common evaluator's actual read observer, not a second range parser.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Values = @import("formula_result_override_values.zig").Values;

pub fn prepare(a: std.mem.Allocator, trees: []const Tree, section: usize, before: *const Sites, after: *const Sites, definitions: ?*const @import("formula_definition_values.zig").Values, overrides: *const Values) !Values {
    if (section >= trees.len) return error.InvalidSectionIndex;
    if (before.items.len != after.items.len) return error.SourceBindingMismatch;
    const tree = &trees[section];
    const frames = try @import("xml_tree_selection.zig").build(a, tree, .{ .mode = .selected }, 4096);
    defer a.free(frames);
    var changed_cells: std.ArrayList(usize) = .empty;
    defer changed_cells.deinit(a);
    var remaining = (@import("formula_values.zig").Limits{}).inspections;
    var cells_remaining = (@import("formula_values.zig").Limits{}).cells;
    for (before.items, after.items) |old, now| {
        if (old.element_index != now.element_index or old.element_index >= tree.elements.len) return error.SourceBindingMismatch;
        if (!frames[old.element_index].active or std.mem.eql(u8, old.text, now.text)) continue;
        var cursor: ?usize = old.element_index;
        while (cursor) |index| : (cursor = tree.elements[index].parent) {
            if (remaining == 0) return error.LimitExceeded;
            remaining -= 1;
            if (!@import("table_xml_fields.zig").childIs(tree, index, "tc")) continue;
            if (changed_cells.items.len > remaining) return error.LimitExceeded;
            remaining -= changed_cells.items.len;
            if (std.mem.indexOfScalar(usize, changed_cells.items, index) == null) try changed_cells.append(a, index);
            break;
        }
    }
    var candidate = try overrides.clone(a);
    errdefer candidate.deinit(a);
    if (changed_cells.items.len == 0) return candidate;
    for (overrides.entries.items) |entry| {
        if (entry.origin == .automatic) continue;
        var inputs: std.ArrayList(usize) = .empty;
        defer inputs.deinit(a);
        var budget: @import("formula_values.zig").Limits = .{ .inspections = remaining, .cells = cells_remaining };
        _ = try @import("formula_dependency_evaluation.zig").evaluateWithInputCells(a, trees, section, before, entry.begin_element, definitions, &budget, &inputs);
        remaining = budget.inspections;
        cells_remaining = budget.cells;
        for (inputs.items) |cell| {
            if (changed_cells.items.len > remaining) return error.LimitExceeded;
            remaining -= changed_cells.items.len;
            if (std.mem.indexOfScalar(usize, changed_cells.items, cell) != null) {
                _ = try candidate.recalculate(a, tree, entry.begin_element);
                break;
            }
        }
    }
    return candidate;
}
