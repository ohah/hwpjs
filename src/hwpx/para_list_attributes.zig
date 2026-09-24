const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const values = @import("xml_values.zig");

pub const Field = enum(u8) {
    id,
    text_direction,
    line_wrap,
    vert_align,
    link_list_id_ref,
    link_list_next_id_ref,
    text_width,
    text_height,
    has_text_ref,
    has_num_ref,
    metatag,
};

pub const field_names = [_][]const u8{
    "id",                "textDirection", "lineWrap",   "vertAlign",  "linkListIDRef",
    "linkListNextIDRef", "textWidth",     "textHeight", "hasTextRef", "hasNumRef",
    "metatag",
};

comptime {
    if (field_names.len != std.meta.fields(Field).len) @compileError("ParaListType field name count mismatch");
}

pub const Attributes = struct {
    raw: [field_names.len]?[]u8 = @splat(null),
    unknown_enums: usize = 0,
    other_attributes: usize = 0,

    pub fn get(self: *const Attributes, field: Field) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }

    pub fn deinit(self: *Attributes, a: std.mem.Allocator) void {
        for (self.raw) |value| if (value) |v| a.free(v);
        self.* = undefined;
    }
};

fn knownEnum(field: Field, value: []const u8) bool {
    const allowed: []const []const u8 = switch (field) {
        .text_direction => &.{ "HORIZONTAL", "VERTICAL", "VERTICALALL" },
        .line_wrap => &.{ "BREAK", "SQUEEZE", "KEEP" },
        .vert_align => &.{ "TOP", "CENTER", "BOTTOM" },
        else => unreachable,
    };
    for (allowed) |candidate| if (std.mem.eql(u8, candidate, value)) return true;
    return false;
}

/// Owns XML-normalized raw values. Missing, empty and unknown enum values are
/// distinct. Does not assign defaults or resolve linked list IDs.
pub fn read(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, max_attribute_bytes: usize) !Attributes {
    var result: Attributes = .{};
    errdefer result.deinit(a);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try scope.expandAttribute(attribute.name);
        var known = false;
        if (std.mem.eql(u8, name.uri, "")) {
            for (field_names) |field_name| {
                if (name.local.equals(field_name, false)) {
                    known = true;
                    break;
                }
            }
        }
        result.other_attributes += @intFromBool(!known);
    }
    inline for (field_names, 0..) |field_name, index| {
        const field: Field = @enumFromInt(index);
        const raw = try attrs.attribute(a, tag, scope, field_name, max_attribute_bytes);
        result.raw[index] = raw;
        if (raw) |value| switch (field) {
            .text_direction, .line_wrap, .vert_align => {
                if (!knownEnum(field, value)) result.unknown_enums += 1;
            },
            .link_list_id_ref, .link_list_next_id_ref, .text_width, .text_height => _ = try values.unsigned32(value),
            .has_text_ref, .has_num_ref => _ = try values.boolean(value),
            .id, .metatag => {},
        };
    }
    return result;
}
