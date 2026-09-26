const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const attributes = @import("xml_part_attributes.zig");
const values = @import("xml_values.zig");
const line_style = @import("line_style_values.zig");

pub const ColumnField = enum(u8) { id, type, layout, col_count, same_sz, same_gap };
pub const LineField = enum(u8) { type, width, color };
pub const SizeField = enum(u8) { width, gap };

const column_names = [_][]const u8{ "id", "type", "layout", "colCount", "sameSz", "sameGap" };
const line_names = [_][]const u8{ "type", "width", "color" };
const size_names = [_][]const u8{ "width", "gap" };
comptime {
    if (column_names.len != @typeInfo(ColumnField).@"enum".fields.len or
        line_names.len != @typeInfo(LineField).@"enum".fields.len or
        size_names.len != @typeInfo(SizeField).@"enum".fields.len) @compileError("column field/name mismatch");
}

// Hancom OWPML enumdef.h g_ColDefTypeList and g_ColDefLayoutList.
const column_types = [_][]const u8{ "NEWSPAPER", "BALANCED_NEWSPAPER", "PARALLEL" };
const layouts = [_][]const u8{ "LEFT", "RIGHT", "MIRROR" };

fn known(raw: []const u8, allowed: []const []const u8) bool {
    const trimmed = std.mem.trim(u8, raw, " \t\r\n");
    for (allowed) |candidate| if (std.mem.eql(u8, trimmed, candidate)) return true;
    return false;
}

fn Raw(comptime n: usize) type {
    return struct { values: [n]?[]const u8 = @splat(null), other_attributes: usize = 0 };
}

fn readRaw(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, comptime names: []const []const u8, max_attribute_bytes: usize, budget: anytype) !Raw(names.len) {
    var tag = try attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    var result: Raw(names.len) = .{};
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var selected: ?usize = null;
        if (name.prefix == null) {
            for (names, 0..) |candidate, slot| {
                if (name.local.equals(candidate, false)) {
                    selected = slot;
                    break;
                }
            }
        }
        if (selected) |slot| {
            const utf8 = try attribute.value.toUtf8(a, max_attribute_bytes);
            defer a.free(utf8);
            result.values[slot] = try budget.copy(owned_a, utf8);
        } else result.other_attributes += 1;
    }
    return result;
}

pub const Column = struct {
    raw: [column_names.len]?[]const u8,
    other_attributes: usize,
    type_known: ?bool = null,
    layout_known: ?bool = null,
    col_count: ?u32 = null,
    same_sz: ?bool = null,
    same_gap: ?u32 = null,

    pub fn get(self: Column, field: ColumnField) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }
};

pub const Line = struct {
    raw: [line_names.len]?[]const u8,
    other_attributes: usize,
    type_known: ?bool = null,
    width_known: ?bool = null,
    color_canonical: ?bool = null,

    pub fn get(self: Line, field: LineField) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }
};

pub const Size = struct {
    raw: [size_names.len]?[]const u8,
    other_attributes: usize,
    width: ?u32 = null,
    gap: ?u32 = null,

    pub fn get(self: Size, field: SizeField) ?[]const u8 {
        return self.raw[@intFromEnum(field)];
    }
};

pub fn readColumn(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_attribute_bytes: usize, budget: anytype) !Column {
    const raw = try readRaw(a, owned_a, tree, index, &column_names, max_attribute_bytes, budget);
    var result: Column = .{ .raw = raw.values, .other_attributes = raw.other_attributes };
    if (result.get(.type)) |value| result.type_known = known(value, &column_types);
    if (result.get(.layout)) |value| result.layout_known = known(value, &layouts);
    if (result.get(.col_count)) |value| result.col_count = try values.unsigned32(value);
    if (result.get(.same_sz)) |value| result.same_sz = try values.boolean(value);
    if (result.get(.same_gap)) |value| result.same_gap = try values.unsigned32(value);
    return result;
}

pub fn readLine(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_attribute_bytes: usize, budget: anytype) !Line {
    const raw = try readRaw(a, owned_a, tree, index, &line_names, max_attribute_bytes, budget);
    var result: Line = .{ .raw = raw.values, .other_attributes = raw.other_attributes };
    if (result.get(.type)) |value| result.type_known = line_style.knownType(value);
    if (result.get(.width)) |value| result.width_known = line_style.knownWidth(value);
    if (result.get(.color)) |value| result.color_canonical = line_style.canonicalColor(value);
    return result;
}

pub fn readSize(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_attribute_bytes: usize, budget: anytype) !Size {
    const raw = try readRaw(a, owned_a, tree, index, &size_names, max_attribute_bytes, budget);
    var result: Size = .{ .raw = raw.values, .other_attributes = raw.other_attributes };
    if (result.get(.width)) |value| result.width = try values.unsigned32(value);
    if (result.get(.gap)) |value| result.gap = try values.unsigned32(value);
    return result;
}
