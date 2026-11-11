//! Character marker evidence from the current header resource tree.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const child = @import("paragraph_display_children.zig").child;
const fields = @import("table_xml_fields.zig");
const head = @import("document_xml.zig").head_uri;
const core = "http://www.hancom.co.kr/hwpml/2011/core";
const Allocator = std.mem.Allocator;
const marker_placement = @import("paragraph_marker_placement.zig");
pub const Heading = struct {
    kind: enum { none, outline, number, bullet },
    marker: ?u21 = null,
    id: ?u32 = null,
    level: ?u32 = null,
    placement: ?marker_placement.Placement = null,
};
const Bullet = struct { scalar: u21, placement: ?marker_placement.Placement };
pub const Bullets = std.AutoHashMapUnmanaged(u32, ?Bullet);

pub fn isBulletDeclaration(tree: *const Tree, index: usize) bool {
    const element = tree.elements[index];
    if (!element.is(head, "bullet")) return false;
    const group = element.parent orelse return false;
    const refs = tree.elements[group].parent orelse return false;
    const root = tree.elements[refs].parent orelse return false;
    return tree.elements[group].is(head, "bullets") and
        tree.elements[refs].is(head, "refList") and
        tree.elements[root].is(head, "head") and tree.elements[root].parent == null;
}

pub fn bullets(a: Allocator, tree: *const Tree) !Bullets {
    var result: Bullets = .empty;
    errdefer result.deinit(a);
    for (tree.elements, 0..) |_, index| {
        if (!isBulletDeclaration(tree, index)) continue;
        const id = (fields.optionalUnsigned(a, tree, index, "id", 64) catch |err| switch (err) {
            error.OutOfMemory => return err,
            else => continue,
        }) orelse continue;
        const entry = try result.getOrPut(a, id);
        entry.value_ptr.* = if (entry.found_existing) null else marker(a, tree, index) catch |err| switch (err) {
            error.OutOfMemory => return err,
            else => null,
        };
    }
    return result;
}

fn marker(a: Allocator, tree: *const Tree, index: usize) !?Bullet {
    const image = (try tree.attributeValue(a, index, "", "useImage")) orelse return null;
    if (try fields.boolean(a, image, 64) or try child(a, tree, index, core, "img") != null) return null;
    if (try tree.attributeValue(a, index, "", "checkedChar")) |raw_checked| {
        const checked = try raw_checked.toUtf8(a, 16);
        defer a.free(checked);
        if (checked.len != 0) return null;
    }
    const settings = (try child(a, tree, index, head, "paraHead")) orelse return null;
    const checkable = (try tree.attributeValue(a, settings, "", "checkable")) orelse return null;
    if (try fields.boolean(a, checkable, 64)) return null;
    const raw = (try tree.attributeValue(a, index, "", "char")) orelse return null;
    const text = try raw.toUtf8(a, 16);
    defer a.free(text);
    if (text.len == 0 or text.len != try std.unicode.utf8ByteSequenceLength(text[0])) return null;
    const scalar = try std.unicode.utf8Decode(text);
    if (scalar <= 0x20 or (scalar >= 0x7f and scalar <= 0x9f)) return null;
    return .{ .scalar = scalar, .placement = try marker_placement.read(a, tree, settings) };
}

pub fn read(a: Allocator, tree: *const Tree, shape: usize, definitions: Bullets) !?Heading {
    return readHeading(a, tree, shape, definitions) catch |err| switch (err) {
        error.OutOfMemory => err,
        else => null,
    };
}

fn readHeading(a: Allocator, tree: *const Tree, shape: usize, definitions: Bullets) !?Heading {
    const index = (try child(a, tree, shape, head, "heading")) orelse return null;
    const raw = (try tree.attributeValue(a, index, "", "type")) orelse return null;
    const kind = try raw.toUtf8(a, 16);
    defer a.free(kind);
    if (std.mem.eql(u8, kind, "NONE")) return .{ .kind = .none };
    const numbered_kind: ?@FieldType(Heading, "kind") = if (std.mem.eql(u8, kind, "NUMBER")) .number else if (std.mem.eql(u8, kind, "OUTLINE")) .outline else null;
    if (numbered_kind) |selected| return .{
        .kind = selected,
        .id = try fields.optionalUnsigned(a, tree, index, "idRef", 64),
        .level = try fields.optionalUnsigned(a, tree, index, "level", 64),
    };
    if (!std.mem.eql(u8, kind, "BULLET")) return null;
    const id = (try fields.optionalUnsigned(a, tree, index, "idRef", 64)) orelse return .{ .kind = .bullet };
    const definition = (definitions.get(id) orelse null) orelse return .{ .kind = .bullet };
    return .{ .kind = .bullet, .marker = definition.scalar, .placement = definition.placement };
}

test "caret heading matches current typed header resources and withholds ambiguous markers" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:refList><h:bullets>" ++
        "<h:bullet id='17' useImage='0' char='&#x25B6;'><h:paraHead checkable='0'/></h:bullet>" ++
        "<h:bullet id='4' useImage='1' char='X'><h:paraHead checkable='0'/></h:bullet>" ++
        "<h:bullet id='8' useImage='0' char='X'><h:paraHead checkable='1'/></h:bullet>" ++
        "<h:bullet id='9' useImage='0' char='X'><h:paraHead checkable='0'/></h:bullet>" ++
        "<h:bullet id='9' useImage='0' char='Y'><h:paraHead checkable='0'/></h:bullet>" ++
        "<h:bullet id='5' useImage='0' char='X' checkedChar='Y'><h:paraHead checkable='0'/></h:bullet>" ++
        "<f:bullet id='12' useImage='0' char='Z'><h:paraHead checkable='0'/></f:bullet>" ++
        "</h:bullets><h:paraProperties>" ++
        "<h:paraPr><h:heading type='BULLET' idRef='17'/></h:paraPr>" ++
        "<h:paraPr><h:heading type='BULLET' idRef='4'/></h:paraPr>" ++
        "<h:paraPr><h:heading type='BULLET' idRef='8'/></h:paraPr>" ++
        "<h:paraPr><h:heading type='BULLET' idRef='9'/></h:paraPr>" ++
        "<h:paraPr><h:heading type='BULLET' idRef='12'/></h:paraPr>" ++
        "<h:paraPr><h:heading type='BULLET' idRef='5'/></h:paraPr>" ++
        "<h:paraPr><h:heading type='NONE'/></h:paraPr>" ++
        "<h:paraPr><h:heading type='NUMBER' idRef='17'/></h:paraPr>" ++
        "<h:paraPr><h:heading type='OUTLINE'/></h:paraPr>" ++
        "<h:paraPr><f:heading type='NONE'/></h:paraPr>" ++
        "<h:paraPr><h:heading type='NONE'/><h:heading type='BULLET' idRef='17'/></h:paraPr>" ++
        "</h:paraProperties></h:refList></h:head>", .header, null, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: Allocator, header: *const Tree) !void {
            var defs = try bullets(allocator, header);
            defer defs.deinit(allocator);
            const expected = [_]?Heading{
                .{ .kind = .bullet, .marker = 0x25b6 },
                .{ .kind = .bullet },
                .{ .kind = .bullet },
                .{ .kind = .bullet },
                .{ .kind = .bullet },
                .{ .kind = .bullet },
                .{ .kind = .none },
                .{ .kind = .number, .id = 17 },
                .{ .kind = .outline },
                null,
                null,
            };
            var count: usize = 0;
            for (header.elements, 0..) |element, index| {
                if (!element.is(head, "paraPr")) continue;
                try std.testing.expectEqual(expected[count], try read(allocator, header, index, defs));
                count += 1;
            }
            try std.testing.expectEqual(expected.len, count);
        }
    }.run, .{&tree});
}
