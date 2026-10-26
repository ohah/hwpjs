//! Retain understood memo envelopes and ownership, never generic unknown fields.
const std = @import("std");
const controls = @import("../body/control_rules.zig");
const Tree = @import("../body/tree.zig").Tree;
const Version = @import("../version.zig").Version;

pub fn hasLists(source: []const u8) !bool {
    var records = @import("../record.zig").Iterator.init(source, .{});
    while (try records.next()) |record| {
        if (record.tag == @backingInt(@import("../body/reader.zig").Tag.memo_list)) return true;
    }
    return false;
}

pub fn field(header: @import("../body/control_header.zig").Header) !bool {
    if (header.id != controls.id("%%me") and header.id != controls.id("%unk")) return false;
    const properties = @import("../body/field_start.zig").Properties.parse(header.properties) catch |err| {
        if (header.id == controls.id("%unk")) return false;
        return err;
    };
    const reference = (try @import("../body/memo_field.zig").fromField(header.id, properties)) orelse return false;
    if (reference.index == null or reference.extra.len != 0) return error.UnsupportedMemoFieldReference;
    return true;
}

pub fn inspect(a: std.mem.Allocator, source: []const u8, version: Version) !void {
    var tree = try @import("source_tree.zig").parse(a, source, version, .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    _ = try @import("../body/memo_validation.zig").inspect(tree, groups.items);
    for (groups.items) |group| if (group.memo) |memo| {
        if (memo.header.extra.len != 0 or tree.nodes[memo.node].record.value.memo_list.extra.len != 0) return error.UnsupportedMemoListExtension;
    };
    for (tree.nodes) |node| if (node.record.value == .control_header) {
        _ = try field(node.record.value.control_header);
    };
}

/// Only a directly owned memo paragraph gets the scoped transaction route.
pub fn target(a: std.mem.Allocator, tree: Tree, paragraph: usize, version: Version) !bool {
    const parent = tree.nodes[paragraph].parent orelse return false;
    if (tree.nodes[parent].record.value != .header or tree.nodes[parent].parent != null) return false;
    const owners = @import("paragraph_owner.zig");
    var groups = try owners.inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const list = (try owners.logicalOwner(tree, groups, paragraph)) orelse return false;
    for (groups.items) |group| if (group.header_node == list) return group.memo != null;
    return false;
}

test "memo retention keeps arbitrary unknown fields blocked and rejects missing or extra references" {
    var bytes: [26]u8 = @splat(0);
    std.mem.writeInt(u16, bytes[5..7], 5, .little);
    @memcpy(bytes[7..17], "M\x00E\x00M\x00O\x00/\x00");
    std.mem.writeInt(u32, bytes[17..21], 42, .little);
    for ([_]u32{ 0, 1, 0xffffffff }) |index| {
        std.mem.writeInt(u32, bytes[21..25], index, .little);
        try std.testing.expect(try field(.{ .id = controls.id("%unk"), .properties = bytes[0..25] }));
        try std.testing.expect(try field(.{ .id = controls.id("%%me"), .properties = bytes[0..25] }));
    }
    try std.testing.expect(!try field(.{ .id = controls.id("%hlk"), .properties = bytes[0..25] }));
    try std.testing.expectError(error.UnsupportedMemoFieldReference, field(.{ .id = controls.id("%unk"), .properties = bytes[0..21] }));
    for (22..25) |length| try std.testing.expectError(error.UnexpectedEnd, field(.{ .id = controls.id("%unk"), .properties = bytes[0..length] }));
    try std.testing.expectError(error.UnsupportedMemoFieldReference, field(.{ .id = controls.id("%unk"), .properties = &bytes }));
    bytes[7] = 'X';
    try std.testing.expect(!try field(.{ .id = controls.id("%unk"), .properties = bytes[0..25] }));
    try std.testing.expect(!try field(.{ .id = controls.id("%unk"), .properties = &.{} }));
}
