//! Owned, format-specific XML values. No inferred defaults or font matching.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Font = struct {
    face: ?[]u8 = null,
    type: ?[]u8 = null,
    isEmbedded: ?[]u8 = null,
    binaryItemIDRef: ?[]u8 = null,
};
pub const TypeInfo = struct {
    familyType: ?[]u8 = null,
    weight: ?[]u8 = null,
    proportion: ?[]u8 = null,
    contrast: ?[]u8 = null,
    strokeVariation: ?[]u8 = null,
    armStyle: ?[]u8 = null,
    letterform: ?[]u8 = null,
    midline: ?[]u8 = null,
    xHeight: ?[]u8 = null,
};
pub const Value = struct {
    format: enum { hwpx } = .hwpx,
    language: @import("font_faces.zig").Language,
    id: u32,
    font: Font,
    substitute: ?Font = null,
    typeInfo: ?TypeInfo = null,

    pub fn deinit(self: *Value, a: std.mem.Allocator) void {
        freeFields(a, &self.font);
        if (self.substitute) |*fields| freeFields(a, fields);
        if (self.typeInfo) |*fields| freeFields(a, fields);
        self.* = undefined;
    }
};
pub fn deinit(a: std.mem.Allocator, rows: []Value) void {
    for (rows) |*row| row.deinit(a);
    a.free(rows);
}
fn freeFields(a: std.mem.Allocator, fields: anytype) void {
    inline for (@import("../reflection.zig").fields(@TypeOf(fields.*))) |field| {
        if (@field(fields.*, field.name)) |text| a.free(text);
    }
}
fn readFields(comptime T: type, a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !T {
    var fields: T = .{};
    errdefer freeFields(a, &fields);
    const names = comptime block: {
        var result: [@import("../reflection.zig").fields(T).len][]const u8 = undefined;
        for (@import("../reflection.zig").fields(T), 0..) |field, i| result[i] = field.name;
        break :block result;
    };
    var raw: [names.len]?@import("../xml/root.zig").attribute_value.Value = undefined;
    try tree.unprefixedAttributeValues(a, node, &names, &raw);
    inline for (@import("../reflection.zig").fields(T), 0..) |field, i| {
        @field(fields, field.name) = if (raw[i]) |value| try value.toUtf8(a, limit) else null;
    }
    return fields;
}
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, limit: usize) !Value {
    const key = try @import("font_face_values.zig").identity(a, tree, node, limit);
    var row: Value = .{ .language = key.language, .id = key.id, .font = try readFields(Font, a, tree, node, limit) };
    errdefer row.deinit(a);
    const uri = @import("document_xml.zig").head_uri;
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const element = tree.elements[index];
        if (element.is(uri, "substFont")) {
            if (row.substitute != null) return error.DuplicateFontMetadataElement;
            row.substitute = try readFields(Font, a, tree, index, limit);
        } else if (element.is(uri, "typeInfo")) {
            if (row.typeInfo != null) return error.DuplicateFontMetadataElement;
            row.typeInfo = try readFields(TypeInfo, a, tree, index, limit);
        }
    }
    return row;
}

test "HWPX font metadata preserves raw values namespace absence and allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:foreign'><h:refList><h:fontfaces><h:fontface lang='HANGUL'><h:font id='7' face='A &amp; B' type='REP' isEmbedded='true'><x:substFont face='wrong'/><h:substFont face='' type='FUTURE' isEmbedded='0' binaryItemIDRef=''/><h:typeInfo familyType='FCAT_FUTURE' weight='006'/></h:font></h:fontface></h:fontfaces></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            var row = try read(allocator, source, 4, 4096);
            defer row.deinit(allocator);
            try std.testing.expectEqualStrings("A & B", row.font.face.?);
            try std.testing.expectEqualStrings("REP", row.font.type.?);
            try std.testing.expectEqualStrings("true", row.font.isEmbedded.?);
            try std.testing.expect(row.font.binaryItemIDRef == null);
            try std.testing.expectEqualStrings("", row.substitute.?.face.?);
            try std.testing.expectEqualStrings("FUTURE", row.substitute.?.type.?);
            try std.testing.expectEqualStrings("006", row.typeInfo.?.weight.?);
            try std.testing.expect(row.typeInfo.?.xHeight == null);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX font metadata refuses duplicate children without mutating source" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:fontfaces><h:fontface lang='LATIN'><h:font id='0'><h:substFont/><h:substFont/></h:font></h:fontface></h:fontfaces></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.DuplicateFontMetadataElement, read(a, &tree, 4, 4096));
    try std.testing.expectEqualStrings(input, tree.source);
}
