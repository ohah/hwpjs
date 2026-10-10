//! Project current boundary order; immutable definitions own field decoding.
const std = @import("std");
const context = @import("column_context.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;
pub const Change = struct { unit: u32, declaration: context.Context };
pub const Projection = struct { initial: ?context.Context = null, start: ?context.Context = null, changes: []Change = &.{} };

pub fn free(a: std.mem.Allocator, rows: []Projection) void {
    for (rows) |row| a.free(row.changes);
    a.free(rows);
}

/// Scalar contexts borrow no report strings or size arrays. The caller copies
/// size values after selecting the definition. Scope state never crosses lists.
pub fn read(a: std.mem.Allocator, tree: *const Tree, report: *const @import("column_definitions.zig").Report, paragraphs: []const Paragraph) ![]Projection {
    const result = try a.alloc(Projection, paragraphs.len);
    for (result) |*row| row.* = .{};
    errdefer free(a, result);
    var states: std.AutoHashMapUnmanaged(usize, context.Context) = .empty;
    defer states.deinit(a);
    for (paragraphs, result) |paragraph, *target| {
        const node = paragraph.template_element;
        if (node >= tree.elements.len) return error.InvalidPartTree;
        const parent = tree.elements[node].parent orelse return error.InvalidPartTree;
        const original = if (tree.elements[parent].is(@import("document_xml.zig").section_uri, "sec"))
            try context.read(tree, report, node)
        else
            try context.readList(tree, report, node);
        var collected: ?[]@import("column_boundary_position.zig").Position = null;
        defer if (collected) |items| a.free(items);
        if (paragraph.column_boundaries == null and paragraph.generated_id == null) if (original) |value| {
            if (value.owner_node == node) {
                // Reading a source declaration does not authorize anchor edits.
                const positions = if (paragraph.field_positions != null) block: {
                    // 원본 선언 수집기는 해당 템플릿의 사이트만 받습니다.
                    // 필드 병합의 선언 소유자는 첫 원본이며 후속 출처는 여기서 제외합니다.
                    var source = if (paragraph.joined()) |joined| try joined.paragraph(0) else paragraph;
                    source.field_positions = &.{};
                    break :block try @import("field_owned_positions.zig").build(a, tree, &source);
                } else block: {
                    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, &paragraph);
                    defer a.free(locations);
                    break :block if (paragraph.protected_positions != null)
                        try @import("paragraph_protected_positions.zig").build(a, tree, &paragraph)
                    else
                        try @import("anchor_text_positions.zig").build(a, tree, &paragraph.sites, locations, 1);
                };
                defer a.free(positions);
                collected = try @import("column_boundary_collect.zig").collect(a, tree, node, positions, .right, tree.elements.len);
            }
        };
        const boundaries = paragraph.column_boundaries orelse collected;
        if (paragraph.column_boundaries) |items| if (items.len != 0) {
            const positions = if (paragraph.field_positions != null)
                try @import("field_owned_positions.zig").build(a, tree, &paragraph)
            else if (paragraph.protected_positions != null)
                try @import("paragraph_protected_positions.zig").build(a, tree, &paragraph)
            else if (paragraph.joined()) |joined|
                try @import("paragraph_joined_positions.zig").build(a, tree, &joined)
            else
                try @import("paragraph_protected_positions.zig").build(a, tree, &paragraph);
            defer a.free(positions);
            for (items) |boundary| try @import("paragraph_text_positions.zig").validateBoundary(&paragraph.sites, positions, boundary.unit);
        };
        var effective = states.get(parent);
        if (effective == null) if (original) |value| {
            // Explicit empty ownership must not resurrect this template's
            // declaration after it has moved to another current paragraph.
            if (boundaries == null or value.owner_node != node) effective = value;
        };
        if (boundaries) |items| {
            target.initial = effective;
            target.start = effective;
            target.changes = try a.alloc(Change, items.len);
            var previous: u32 = 0;
            for (items, 0..) |boundary, index| {
                if (index != 0 and boundary.unit < previous) return error.InvalidColumnBoundaryOrder;
                previous = boundary.unit;
                effective = try context.readDefinition(tree, report, boundary.source_element, node);
                target.changes[index] = .{ .unit = boundary.unit, .declaration = effective.? };
                if (boundary.unit == 0) {
                    target.initial = effective;
                    target.start = effective;
                } else if (target.initial) |*value| {
                    // A scalar declaration cannot describe an internal change.
                    // Keep it explicit until row-level column spans are exposed.
                    value.ambiguous = true;
                } else {
                    target.initial = effective;
                    target.initial.?.ambiguous = true;
                }
            }
        } else {
            if (original) |value| if (paragraph.generated_id == null and value.owner_node == node) {
                effective = value;
            };
            target.initial = effective;
            target.start = effective;
        }
        if (effective) |value| try states.put(a, parent, value);
    }
    return result;
}
