const std = @import("std");
const xml = @import("../xml/root.zig");
const tree_mod = @import("xml_part_tree.zig");
const attributes = @import("xml_part_attributes.zig");
const values = @import("xml_values.zig");

pub const Begin = struct {
    id_raw: ?[]const u8 = null,
    type_raw: ?[]const u8 = null,
    name: ?[]const u8 = null,
    editable_raw: ?[]const u8 = null,
    dirty_raw: ?[]const u8 = null,
    zorder_raw: ?[]const u8 = null,
    fieldid_raw: ?[]const u8 = null,
    id: ?u32 = null,
    editable: ?bool = null,
    dirty: ?bool = null,
    zorder: ?i32 = null,
    fieldid: ?u32 = null,
    type_known: ?bool = null,
    other_attributes: usize = 0,
};

pub const End = struct {
    begin_id_ref_raw: ?[]const u8 = null,
    fieldid_raw: ?[]const u8 = null,
    begin_id_ref: ?u32 = null,
    fieldid: ?u32 = null,
    other_attributes: usize = 0,
};

const begin_names = [_][]const u8{ "id", "type", "name", "editable", "dirty", "zorder", "fieldid" };
const end_names = [_][]const u8{ "beginIDRef", "fieldid" };

// Hancom OWPML Class/enumdef.h g_FieldList, pinned model revision.
pub const known_types = [_][]const u8{
    "CLICK_HERE",                  "HYPERLINK",                       "BOOKMARK",                     "FORMULA",                     "SUMMERY",                     "USER_INFO",                   "DATE",                            "DOC_DATE",                  "PATH",                    "CROSSREF",                        "MAILMERGE",                    "MEMO",
    "PROOFREADING_MARKS_CHANGE",   "PROOFREADING_MARKS_SIGN",         "PROOFREADING_MARKS_DELETE",    "PROOFREADING_MARKS_ATTACH",   "PROOFREADING_MARKS_CLIPPING", "PROOFREADING_MARKS_SAWTOOTH", "PROOFREADING_MARKS_THINKING",     "PROOFREADING_MARKS_PRAISE", "PROOFREADING_MARKS_LINE", "PROOFREADING_MARKS_SIMPLECHANGE", "PROOFREADING_MARKS_HYPERLINK", "PROOFREADING_MARKS_LINEATTACH",
    "PROOFREADING_MARKS_LINELINK", "PROOFREADING_MARKS_LINETRANSFER", "PROOFREADING_MARKS_RIGHTMOVE", "PROOFREADING_MARKS_LEFTMOVE", "PROOFREADING_MARKS_TRANSFER", "PROOFREADING_MARKS_SPLIT",    "PROOFREADING_MARKS_SIMPLEINSERT", "PRIVATE_INFO",              "TABLEOFCONTENTS",         "CITATION",                        "BIBLIOGRAPHY",                 "METADATA",
};

pub fn knownType(raw: []const u8) bool {
    for (known_types) |candidate| if (std.mem.eql(u8, raw, candidate)) return true;
    return false;
}

fn decode(a: std.mem.Allocator, owned_a: std.mem.Allocator, budget: anytype, raw: ?xml.attribute_value.Value, max_bytes: usize) !?[]const u8 {
    const attribute = raw orelse return null;
    const utf8 = try attribute.toUtf8(a, max_bytes);
    defer a.free(utf8);
    return try budget.copy(owned_a, utf8);
}

fn otherAttributeCount(a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, known: []const []const u8) !usize {
    var tag = try attributes.parseStartTag(a, tree, index);
    defer tag.deinit(a);
    var count: usize = 0;
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var recognized = false;
        if (name.prefix == null) for (known) |candidate| {
            if (name.local.equals(candidate, false)) {
                recognized = true;
                break;
            }
        };
        count += @intFromBool(!recognized);
    }
    return count;
}

pub fn readBegin(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_attribute_bytes: usize, budget: anytype) !Begin {
    var raw: [begin_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &begin_names, &raw);
    var result: Begin = .{
        .id_raw = try decode(a, owned_a, budget, raw[0], max_attribute_bytes),
        .type_raw = try decode(a, owned_a, budget, raw[1], max_attribute_bytes),
        .name = try decode(a, owned_a, budget, raw[2], max_attribute_bytes),
        .editable_raw = try decode(a, owned_a, budget, raw[3], max_attribute_bytes),
        .dirty_raw = try decode(a, owned_a, budget, raw[4], max_attribute_bytes),
        .zorder_raw = try decode(a, owned_a, budget, raw[5], max_attribute_bytes),
        .fieldid_raw = try decode(a, owned_a, budget, raw[6], max_attribute_bytes),
        .other_attributes = try otherAttributeCount(a, tree, index, &begin_names),
    };
    if (result.id_raw) |value| result.id = try values.unsigned32(value);
    if (result.type_raw) |value| result.type_known = knownType(value);
    if (result.editable_raw) |value| result.editable = try values.boolean(value);
    if (result.dirty_raw) |value| result.dirty = try values.boolean(value);
    if (result.zorder_raw) |value| result.zorder = try values.signed32(value);
    if (result.fieldid_raw) |value| result.fieldid = try values.unsigned32(value);
    return result;
}

pub fn readEnd(a: std.mem.Allocator, owned_a: std.mem.Allocator, tree: *const tree_mod.Tree, index: usize, max_attribute_bytes: usize, budget: anytype) !End {
    var raw: [end_names.len]?xml.attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, index, &end_names, &raw);
    var result: End = .{
        .begin_id_ref_raw = try decode(a, owned_a, budget, raw[0], max_attribute_bytes),
        .fieldid_raw = try decode(a, owned_a, budget, raw[1], max_attribute_bytes),
        .other_attributes = try otherAttributeCount(a, tree, index, &end_names),
    };
    if (result.begin_id_ref_raw) |value| result.begin_id_ref = try values.unsigned32(value);
    if (result.fieldid_raw) |value| result.fieldid = try values.unsigned32(value);
    return result;
}
