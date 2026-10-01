//! Orchestrate existing source-link, selection and evaluation modules.
const std = @import("std");
const output = @import("formula_field_output.zig");
pub const Options = struct {
    max_fields: usize = 4096,
    only_changed: bool = true,
    branch_policy: @import("compatibility_selection.zig").Policy = .{ .mode = .selected },
    evaluation: @import("formula_values.zig").Limits = .{},
};

/// Caller owns all preparations and the slice. No source or Sites mutation.
pub fn prepare(a: std.mem.Allocator, trees: []const @import("xml_part_tree.zig").Tree, section: usize, sites: *const @import("text_sites.zig").Sites, options: Options) ![]output.Prepared {
    if (section >= trees.len or trees[section].section_ordinal != section) return error.InvalidSectionIndex;
    const tree = &trees[section];
    var markers = try @import("field_markers.zig").inspect(a, trees, .{});
    defer markers.deinit();
    const ranges = try @import("field_text_ranges.zig").build(a, trees, &markers);
    defer a.free(ranges);
    var parameters = try @import("parameter_lists.zig").inspect(a, trees, .{});
    defer parameters.deinit();
    const frames = try @import("xml_tree_selection.zig").build(a, tree, options.branch_policy, 4096);
    defer a.free(frames);
    var prepared: std.ArrayList(output.Prepared) = .empty;
    var inspected_fields: usize = 0;
    var remaining = options.evaluation;
    errdefer {
        for (prepared.items) |*item| item.deinit(a);
        prepared.deinit(a);
    }
    for (ranges) |range| {
        if (range.section != section) continue;
        const begin = markers.markers[range.begin_marker];
        const end = markers.markers[range.end_marker];
        if (!frames[begin.element_index].active and !frames[end.element_index].active) continue;
        if (frames[begin.element_index].active != frames[end.element_index].active) return error.InvalidFormulaBranchOwnership;
        const type_raw = begin.begin.?.type_raw orelse continue;
        if (!std.mem.eql(u8, type_raw, "FORMULA")) continue;
        if (inspected_fields >= options.max_fields) return error.LimitExceeded;
        inspected_fields += 1;
        const view = (try @import("formula_parameters.zig").read(&parameters, section, begin.element_index)) orelse return error.MissingFormulaParameters;
        const expression = try @import("formula_expression.zig").parse(a, view);
        const value = try @import("formula_values.zig").evaluate(a, tree, sites, begin.element_index, expression.range, remaining);
        remaining.cells -= value.cells;
        remaining.inspections -= value.inspections;
        const display = try @import("formula_output.zig").render(a, expression, view, value.value);
        defer a.free(display);
        var field = try output.prepare(a, tree, sites, &parameters, range, begin.element_index, display);
        if (options.only_changed and std.mem.eql(u8, view.command.?, field.parameters.command) and view.last_result != null and std.mem.eql(u8, view.last_result.?, display) and labelMatches(sites, field, display)) {
            field.deinit(a);
            continue;
        }
        prepared.append(a, field) catch |err| {
            field.deinit(a);
            return err;
        };
    }
    return prepared.toOwnedSlice(a);
}

fn labelMatches(sites: *const @import("text_sites.zig").Sites, field: output.Prepared, display: []const u8) bool {
    var offset: usize = 0;
    for (field.result.items) |replacement| {
        const text = sites.items[replacement.site_index].text;
        if (text.len > display.len - offset or !std.mem.eql(u8, text, display[offset..][0..text.len])) return false;
        offset += text.len;
    }
    return offset == display.len;
}
