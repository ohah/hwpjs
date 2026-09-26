const std = @import("std");
const part_tree = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const fields = @import("equation_fields.zig");
const shape = @import("shape_xml_fields.zig");
const shape_children = @import("shape_xml_children.zig");
const equation_shape = @import("equation_shape.zig");

pub const ShapeChild = equation_shape.Child;

pub const Options = struct {
    max_equations: usize = 100_000,
    max_scripts: usize = 100_000,
    max_other_children: usize = 1_000_000,
    max_attribute_bytes: usize = 4096,
    max_script_bytes: usize = 1024 * 1024,
    max_owned_bytes: usize = 128 * 1024 * 1024,
};

pub const Equation = struct {
    section_ordinal: usize,
    element_index: usize,
    parent_run_index: usize,
    raw_xml: []const u8,
    attributes: fields.Fields,
    first_script: usize,
    first_shape_child: usize,
    shape_child_count: usize = 0,
    script_count: usize = 0,
    other_children: usize = 0,
};

pub const Script = struct {
    equation_index: usize,
    element_index: usize,
    value: []const u8,
};

pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    sections: usize,
    equations: []const Equation,
    scripts: []const Script,
    shape_children: []const ShapeChild,
    shape: equation_shape.Report,
    script_bytes: usize,
    owned_bytes: usize,
    without_script: usize,
    multiple_scripts: usize,
    out_of_scope_equations: usize,
    other_children: usize,
    other_attributes: usize,
    unknown_line_modes: usize,
    non_six_hex_colors: usize,
    inherited_shape: [shape.table_specs.len]shape.Counts,

    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

const ScriptBuilder = struct {
    equation_index: usize,
    element_index: usize,
    content: std.ArrayList(u8) = .empty,
};

const ContentContext = struct {
    temp_a: std.mem.Allocator,
    owned_a: std.mem.Allocator,
    script_indices: *const std.AutoHashMapUnmanaged(usize, usize),
    builders: []ScriptBuilder,
    max_script_bytes: usize,
    budget: *fields.Budget,
    script_bytes: *usize,

    fn onContent(raw: *anyopaque, event: part_tree.Tree.ContentEvent) anyerror!void {
        const self: *ContentContext = @ptrCast(@alignCast(raw));
        const index = self.script_indices.get(event.parent_index) orelse return;
        const builder = &self.builders[index];
        const remaining = @min(self.max_script_bytes -| builder.content.items.len, self.budget.max -| self.budget.used);
        const decoded = try event.value.toUtf8(self.temp_a, remaining);
        defer self.temp_a.free(decoded);
        if (decoded.len > remaining) return error.LimitExceeded;
        try self.budget.note(decoded.len);
        try builder.content.appendSlice(self.owned_a, decoded);
        self.script_bytes.* += decoded.len;
    }
};

/// Owns every direct hp:script under a run-owned hp:equation. Equation and
/// script source order are retained; no formula grammar or layout is inferred.
pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned_a = arena.allocator();
    var budget: fields.Budget = .{ .max = options.max_owned_bytes };
    var equations: std.ArrayList(Equation) = .empty;
    var scripts: std.ArrayList(ScriptBuilder) = .empty;
    var children: std.ArrayList(ShapeChild) = .empty;
    var shape_report: equation_shape.Report = .{};
    var shape_counts: [shape.table_specs.len]shape.Counts = @splat(.{});
    var script_bytes: usize = 0;
    var without_script: usize = 0;
    var multiple_scripts: usize = 0;
    var out_of_scope_equations: usize = 0;
    var other_children: usize = 0;
    var other_attributes: usize = 0;
    var unknown_line_modes: usize = 0;
    var non_six_hex_colors: usize = 0;
    for (sections, 0..) |*tree, ordinal| {
        if (tree.part_kind != .section or tree.section_ordinal != ordinal or tree.elements.len == 0) return error.InvalidPartKind;
        var script_indices: std.AutoHashMapUnmanaged(usize, usize) = .empty;
        defer script_indices.deinit(a);
        for (tree.elements, 0..) |element, index| {
            if (!element.is(document_xml.paragraph_uri, "equation")) continue;
            const parent_index = element.parent orelse {
                out_of_scope_equations += 1;
                continue;
            };
            if (!tree.elements[parent_index].is(document_xml.paragraph_uri, "run")) {
                out_of_scope_equations += 1;
                continue;
            }
            if (equations.items.len == options.max_equations) return error.LimitExceeded;
            const source = try budget.copy(owned_a, tree.sourceOf(index));
            const specific = try fields.read(a, owned_a, tree, index, options.max_attribute_bytes, &budget);
            try shape.inspect(&shape.table_specs, a, tree, index, options.max_attribute_bytes, &shape_counts);
            var equation: Equation = .{
                .section_ordinal = ordinal,
                .element_index = index,
                .parent_run_index = parent_index,
                .raw_xml = source,
                .attributes = specific,
                .first_script = scripts.items.len,
                .first_shape_child = children.items.len,
            };
            var per_equation: [equation_shape.common_count]usize = @splat(0);
            var child = element.first_child;
            while (child) |child_index| : (child = tree.elements[child_index].next_sibling) {
                const child_element = tree.elements[child_index];
                if (child_element.is(document_xml.paragraph_uri, "script")) {
                    if (child_element.first_child != null) return error.InvalidEquationScriptChild;
                    if (scripts.items.len == options.max_scripts) return error.LimitExceeded;
                    try scripts.append(owned_a, .{ .equation_index = equations.items.len, .element_index = child_index });
                    try script_indices.put(a, child_index, scripts.items.len - 1);
                    equation.script_count += 1;
                } else {
                    if (other_children == options.max_other_children) return error.LimitExceeded;
                    equation.other_children += 1;
                    other_children += 1;
                    if (shape_children.kindOf(tree, child_index, .common)) |kind| {
                        const item = try equation_shape.read(a, owned_a, tree, index, child_index, equations.items.len, source, options.max_attribute_bytes, &budget, &shape_report);
                        try children.append(owned_a, item);
                        equation.shape_child_count += 1;
                        per_equation[@intFromEnum(kind)] += 1;
                    } else shape_report.unknown_children += 1;
                }
            }
            shape_report.finishEquation(per_equation);
            without_script += @intFromBool(equation.script_count == 0);
            multiple_scripts += @intFromBool(equation.script_count > 1);
            other_attributes += specific.other_attributes;
            unknown_line_modes += specific.unknown_line_modes;
            non_six_hex_colors += specific.non_six_hex_colors;
            try equations.append(owned_a, equation);
        }
        if (script_indices.count() == 0) continue;
        var content: ContentContext = .{
            .temp_a = a,
            .owned_a = owned_a,
            .script_indices = &script_indices,
            .builders = scripts.items,
            .max_script_bytes = options.max_script_bytes,
            .budget = &budget,
            .script_bytes = &script_bytes,
        };
        try tree.visitContent(a, .{ .context = &content, .on_content = ContentContext.onContent });
    }
    const owned_scripts = try owned_a.alloc(Script, scripts.items.len);
    for (scripts.items, 0..) |*item, index| owned_scripts[index] = .{
        .equation_index = item.equation_index,
        .element_index = item.element_index,
        .value = try item.content.toOwnedSlice(owned_a),
    };
    const owned_equations = try equations.toOwnedSlice(owned_a);
    const owned_children = try children.toOwnedSlice(owned_a);
    return .{
        .arena = arena,
        .sections = sections.len,
        .equations = owned_equations,
        .scripts = owned_scripts,
        .shape_children = owned_children,
        .shape = shape_report,
        .script_bytes = script_bytes,
        .owned_bytes = budget.used,
        .without_script = without_script,
        .multiple_scripts = multiple_scripts,
        .out_of_scope_equations = out_of_scope_equations,
        .other_children = other_children,
        .other_attributes = other_attributes,
        .unknown_line_modes = unknown_line_modes,
        .non_six_hex_colors = non_six_hex_colors,
        .inherited_shape = shape_counts,
    };
}
