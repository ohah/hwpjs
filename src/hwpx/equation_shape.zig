const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const attributes = @import("xml_part_attributes.zig");
const fields = @import("shape_xml_fields.zig");
const children = @import("shape_xml_children.zig");
const Budget = @import("equation_fields.zig").Budget;

pub const Kind = children.Kind;
pub const common_count = children.common_count;
const max_fields = blk: {
    var count: usize = 0;
    for (0..common_count) |slot| count = @max(count, children.specs(@enumFromInt(slot)).len);
    break :blk count;
};

pub const Child = struct {
    equation_index: usize,
    element_index: usize,
    kind: Kind,
    /// Borrows the owning Equation.raw_xml, never the temporary source tree.
    raw_xml: []const u8,
    values: []const ?[]const u8,
    other_attributes: usize = 0,
    direct_children: usize = 0,
    first_caption_sub_list: usize = 0,
    caption_sub_list_count: usize = 0,

    pub fn get(self: Child, name: []const u8) ?[]const u8 {
        for (children.specs(self.kind), self.values) |spec, value| {
            if (std.mem.eql(u8, spec.name, name)) return value;
        }
        return null;
    }

    pub fn localName(self: Child) []const u8 {
        return children.names[@intFromEnum(self.kind)];
    }
};

pub const Counts = struct {
    elements: usize = 0,
    missing_equations: usize = 0,
    duplicate_equations: usize = 0,
    /// Only the prefix selected by shape_xml_children.specs(kind) is meaningful.
    fields: [max_fields]fields.Counts = @splat(.{}),
};

pub const Report = struct {
    by_kind: [common_count]Counts = @splat(.{}),
    unknown_children: usize = 0,
    other_attributes: usize = 0,
    direct_children: usize = 0,

    pub fn finishEquation(self: *Report, counts: [common_count]usize) void {
        for (counts, 0..) |count, slot| {
            self.by_kind[slot].missing_equations += @intFromBool(count == 0);
            self.by_kind[slot].duplicate_equations += @intFromBool(count > 1);
        }
    }
};

/// Reads common shape children only. Metadata and nested elements remain raw;
/// neither object defaults nor layout/rendering semantics are inferred.
pub fn read(temp_a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, parent: usize, index: usize, equation_index: usize, source: []const u8, max_attribute_bytes: usize, budget: *Budget, report: *Report) !Child {
    const kind = children.kindOf(tree, index, .common) orelse return error.InvalidShapeKind;
    const element = tree.elements[index];
    const base = tree.elements[parent].start_tag.start;
    if (element.parent != parent or element.start_tag.start < base or element.end < element.start_tag.start or element.end - base > source.len) return error.InvalidSourceSpan;
    const specs = children.specs(kind);
    const values = try owned_a.alloc(?[]const u8, specs.len);
    @memset(values, null);
    var result: Child = .{
        .equation_index = equation_index,
        .element_index = index,
        .kind = kind,
        .raw_xml = source[element.start_tag.start - base .. element.end - base],
        .values = values,
    };
    var tag = try attributes.parseStartTag(temp_a, tree, index);
    defer tag.deinit(temp_a);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var matched = false;
        if (name.prefix == null) {
            for (specs, 0..) |spec, slot| {
                if (!name.local.equals(spec.name, false)) continue;
                const decoded = try attribute.value.toUtf8(temp_a, max_attribute_bytes);
                defer temp_a.free(decoded);
                values[slot] = try budget.copy(owned_a, decoded);
                matched = true;
                break;
            }
        }
        result.other_attributes += @intFromBool(!matched);
    }
    const counts = &report.by_kind[@intFromEnum(kind)];
    counts.elements += 1;
    for (specs, values, 0..) |spec, value, slot| try fields.observe(spec, value, &counts.fields[slot]);
    var child = element.first_child;
    while (child) |child_index| : (child = tree.elements[child_index].next_sibling) result.direct_children += 1;
    report.other_attributes += result.other_attributes;
    report.direct_children += result.direct_children;
    return result;
}
