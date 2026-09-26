const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_part_attributes.zig");
const tree_mod = @import("xml_part_tree.zig");
const values = @import("xml_values.zig");

// Hancom NoteType: six numeric fields. `id` is observed in older samples and
// kept as a distinct opaque extension rather than declared as a numeric field.
pub const Field = enum(u8) { id, flag, number, user_char, prefix_char, suffix_char, inst_id };
pub const names = [_][]const u8{ "id", "flag", "number", "userChar", "prefixChar", "suffixChar", "instId" };
comptime {
    if (names.len != @typeInfo(Field).@"enum".fields.len) @compileError("note body field/name mismatch");
}

pub const Attributes = struct {
    raw: [names.len]?[]const u8 = @splat(null),
    other_attributes: usize = 0,
    flag: ?u32 = null,
    number: ?u16 = null,
    user_char: ?u16 = null,
    prefix_char: ?u16 = null,
    suffix_char: ?u16 = null,
    inst_id: ?u32 = null,
    pub fn get(self: Attributes, field: Field) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }
};

pub fn read(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_attribute_bytes: usize, budget: anytype) !Attributes {
    var tag = try attrs.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    var result: Attributes = .{};
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var selected: ?usize = null;
        if (name.prefix == null) for (names, 0..) |wanted, slot| {
            if (name.local.equals(wanted, false)) {
                selected = slot;
                break;
            }
        };
        if (selected) |slot| {
            const value = try attribute.value.toUtf8(a, max_attribute_bytes);
            defer a.free(value);
            result.raw[slot] = try budget.copy(owned_a, value);
        } else result.other_attributes += 1;
    }
    if (result.get(.flag)) |raw| result.flag = try values.unsigned32(raw);
    if (result.get(.number)) |raw| result.number = try values.unsigned16(raw);
    if (result.get(.user_char)) |raw| result.user_char = try values.unsigned16(raw);
    if (result.get(.prefix_char)) |raw| result.prefix_char = try values.unsigned16(raw);
    if (result.get(.suffix_char)) |raw| result.suffix_char = try values.unsigned16(raw);
    if (result.get(.inst_id)) |raw| result.inst_id = try values.unsigned32(raw);
    return result;
}
