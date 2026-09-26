const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const attributes = @import("xml_part_attributes.zig");
const values = @import("xml_values.zig");
const shape = @import("shape_xml_fields.zig");

pub const Field = enum { version, base_line, text_color, base_unit, line_mode, font };
pub const names = [_][]const u8{ "version", "baseLine", "textColor", "baseUnit", "lineMode", "font" };
comptime {
    if (names.len != @typeInfo(Field).@"enum".fields.len) @compileError("equation field/name mismatch");
}

pub const Budget = struct {
    max: usize,
    used: usize = 0,

    pub fn note(self: *Budget, count: usize) !void {
        if (count > self.max -| self.used) return error.LimitExceeded;
        self.used += count;
    }

    pub fn copy(self: *Budget, a: std.mem.Allocator, bytes: []const u8) ![]const u8 {
        try self.note(bytes.len);
        return a.dupe(u8, bytes);
    }
};

pub const Fields = struct {
    raw: [names.len]?[]const u8 = @splat(null),
    unknown_line_modes: usize = 0,
    non_six_hex_colors: usize = 0,
    other_attributes: usize = 0,

    pub fn get(self: *const Fields, field: Field) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }
};

fn known(local: xml.qname.QName) bool {
    if (local.prefix != null) return false;
    for (names) |name| if (local.local.equals(name, false)) return true;
    for (shape.table_specs) |spec| if (local.local.equals(spec.name, false)) return true;
    return false;
}

/// Equation-specific fields own their normalized spellings. Common inherited
/// shape attributes are validated by shape_xml_fields, not reinterpreted here.
pub fn read(temp_a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_attribute_bytes: usize, budget: *Budget) !Fields {
    var result: Fields = .{};
    var raw: [names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(temp_a, index, &names, &raw);
    inline for (names, 0..) |_, slot| {
        if (raw[slot]) |value| {
            const decoded = try value.toUtf8(temp_a, max_attribute_bytes);
            defer temp_a.free(decoded);
            result.raw[slot] = try budget.copy(owned_a, decoded);
            switch (@as(Field, @enumFromInt(slot))) {
                .base_line, .base_unit => _ = try values.unsigned32(decoded),
                .text_color => result.non_six_hex_colors += @intFromBool(!values.sixHexColor(decoded)),
                .line_mode => result.unknown_line_modes += @intFromBool(!std.mem.eql(u8, decoded, "LINE") and !std.mem.eql(u8, decoded, "CHAR")),
                .version, .font => {},
            }
        }
    }
    var tag = try attributes.parseStartTag(temp_a, tree, index);
    defer tag.deinit(temp_a);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        result.other_attributes += @intFromBool(!known(name));
    }
    return result;
}
