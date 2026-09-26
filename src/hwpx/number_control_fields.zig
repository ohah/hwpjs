const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_part_attributes.zig");
const tree_mod = @import("xml_part_tree.zig");
const values = @import("xml_values.zig");
const numbering = @import("numbering_values.zig");

pub const AutoField = enum(u8) { num, num_type };
pub const PageField = enum(u8) { pos, format_type, side_char };
pub const FormatField = enum(u8) { type, user_char, prefix_char, suffix_char, supscript };

const auto_names = [_][]const u8{ "num", "numType" };
const page_names = [_][]const u8{ "pos", "formatType", "sideChar" };
const format_names = [_][]const u8{ "type", "userChar", "prefixChar", "suffixChar", "supscript" };
comptime {
    if (auto_names.len != @typeInfo(AutoField).@"enum".fields.len or page_names.len != @typeInfo(PageField).@"enum".fields.len or format_names.len != @typeInfo(FormatField).@"enum".fields.len) @compileError("number control fields mismatch");
}

fn Raw(comptime n: usize) type {
    return struct { values: [n]?[]const u8 = @splat(null), other_attributes: usize = 0 };
}

fn readRaw(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, comptime names: []const []const u8, max_attribute_bytes: usize, budget: anytype) !Raw(names.len) {
    var tag = try attrs.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    var result: Raw(names.len) = .{};
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var selected: ?usize = null;
        if (name.prefix == null) for (names, 0..) |candidate, slot| {
            if (name.local.equals(candidate, false)) {
                selected = slot;
                break;
            }
        };
        if (selected) |slot| {
            const utf8 = try attribute.value.toUtf8(a, max_attribute_bytes);
            defer a.free(utf8);
            result.values[slot] = try budget.copy(owned_a, utf8);
        } else result.other_attributes += 1;
    }
    return result;
}

pub const Auto = struct {
    raw: [auto_names.len]?[]const u8,
    other_attributes: usize,
    num: ?i32 = null,
    type_known: ?bool = null,
    pub fn get(self: Auto, field: AutoField) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }
};
pub const Page = struct {
    raw: [page_names.len]?[]const u8,
    other_attributes: usize,
    pos_known: ?bool = null,
    format_known: ?bool = null,
    pub fn get(self: Page, field: PageField) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }
};
pub const Format = struct {
    raw: [format_names.len]?[]const u8,
    other_attributes: usize,
    type_known: ?bool = null,
    supscript: ?bool = null,
    pub fn get(self: Format, field: FormatField) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }
};

pub fn readAuto(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max: usize, budget: anytype) !Auto {
    const raw = try readRaw(a, owned_a, tree, index, &auto_names, max, budget);
    var result: Auto = .{ .raw = raw.values, .other_attributes = raw.other_attributes };
    if (result.get(.num)) |value| result.num = try values.signed32(value);
    if (result.get(.num_type)) |value| result.type_known = numbering.autoTypeKnown(value);
    return result;
}
pub fn readPage(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max: usize, budget: anytype) !Page {
    const raw = try readRaw(a, owned_a, tree, index, &page_names, max, budget);
    var result: Page = .{ .raw = raw.values, .other_attributes = raw.other_attributes };
    if (result.get(.pos)) |value| result.pos_known = numbering.pagePositionKnown(value);
    if (result.get(.format_type)) |value| result.format_known = numbering.numberTypeKnown(value);
    return result;
}
pub fn readFormat(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max: usize, budget: anytype) !Format {
    const raw = try readRaw(a, owned_a, tree, index, &format_names, max, budget);
    var result: Format = .{ .raw = raw.values, .other_attributes = raw.other_attributes };
    if (result.get(.type)) |value| result.type_known = numbering.numberTypeKnown(value);
    if (result.get(.supscript)) |value| result.supscript = try values.boolean(value);
    return result;
}
