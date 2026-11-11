//! All declarations in the authoritative current header, including unused IDs.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const source = @import("paragraph_heading_display.zig");
pub const Reason = enum { InvalidBulletId, DuplicateBulletId, UnsupportedBulletDeclaration };
pub const Declaration = struct {
    ordinal: u32,
    id: ?u32,
    marker: ?u21,
    canApply: bool,
    reason: ?Reason,
    definition: ?@import("bullet_definition_write.zig").Definition = null,
};
pub const Snapshot = struct {
    schemaVersion: u32 = 1,
    state: enum { available } = .available,
    scope: enum { @"current-header" } = .@"current-header",
    coverage: enum { complete } = .complete,
    declarations: []Declaration,
    definitionWriter: enum { @"character-definitions-v1" } = .@"character-definitions-v1",
};

pub fn read(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session) !Snapshot {
    var lease = try @import("header_read_context.zig").lease(session);
    defer lease.deinit();
    const tree = try lease.get().currentHeader(false);
    return readTree(a, tree);
}

pub fn readTree(a: std.mem.Allocator, tree: *const Tree) !Snapshot {
    var definitions = try source.bullets(a, tree);
    defer definitions.deinit(a);
    var counts: std.AutoHashMapUnmanaged(u32, u32) = .empty;
    defer counts.deinit(a);
    var rows: std.ArrayList(Declaration) = .empty;
    errdefer rows.deinit(a);
    for (tree.elements, 0..) |_, index| {
        if (!source.isBulletDeclaration(tree, index)) continue;
        if (rows.items.len == 4096) return error.LimitExceeded;
        const id = @import("table_xml_fields.zig").optionalUnsigned(a, tree, index, "id", 64) catch |err| switch (err) {
            error.OutOfMemory => return err,
            else => null,
        };
        var marker: ?u21 = null;
        if (id) |identity| {
            const count = try counts.getOrPut(a, identity);
            if (!count.found_existing) count.value_ptr.* = 0;
            count.value_ptr.* += 1;
            if ((definitions.get(identity) orelse null)) |definition| marker = definition.scalar;
        }
        var observed: ?@import("bullet_definition_write.zig").Definition = null;
        if (marker) |scalar| {
            const ph = try @import("paragraph_display_children.zig").child(a, tree, index, @import("document_xml.zig").head_uri, "paraHead");
            if (ph) |node| if (tree.elements[node].parent == index) {
                if (try @import("paragraph_marker_placement.zig").read(a, tree, node)) |placement| {
                    const d = @import("bullet_definition_write.zig").definition(scalar, placement);
                    if (@import("bullet_definition_write.zig").validate(d)) |_| {
                        observed = d;
                    } else |_| {}
                }
            };
        }
        try rows.append(a, .{
            .definition = observed,
            .ordinal = @intCast(rows.items.len),
            .id = id,
            .marker = marker,
            .canApply = marker != null,
            .reason = if (id == null) .InvalidBulletId else if (marker == null) .UnsupportedBulletDeclaration else null,
        });
    }
    for (rows.items) |*row| {
        if (row.id) |id| if (counts.get(id).? > 1) {
            row.canApply = false;
            row.marker = null;
            row.definition = null;
            row.reason = .DuplicateBulletId;
        };
    }
    return .{ .declarations = try rows.toOwnedSlice(a) };
}

test "bullet definitions retain unused duplicate malformed and unsupported header declarations" {
    const a = std.testing.allocator;
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:foreign'><h:refList><h:bullets>" ++
        "<h:bullet id='42' char='&#x25B6;' useImage='0'><h:paraHead checkable='0'/></h:bullet>" ++
        "<h:bullet id='7' char='X' useImage='1'><h:paraHead checkable='0'/></h:bullet>" ++
        "<h:bullet id='8' char='X' useImage='0'><h:paraHead checkable='1'/></h:bullet>" ++
        "<h:bullet id='9' char='X' useImage='0'><h:paraHead checkable='0'/></h:bullet>" ++
        "<h:bullet id='9' char='Y' useImage='0'><h:paraHead checkable='0'/></h:bullet>" ++
        "<h:bullet char='Z' useImage='0'><h:paraHead checkable='0'/></h:bullet>" ++
        "<f:bullet id='99' char='Z'/></h:bullets></h:refList></h:head>";
    var tree = try @import("header_tree.zig").parse(a, xml, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            const result = try readTree(allocator, input);
            defer allocator.free(result.declarations);
            try std.testing.expectEqual(@as(usize, 6), result.declarations.len);
            try std.testing.expectEqual(@as(?u32, 42), result.declarations[0].id);
            try std.testing.expectEqual(@as(?u21, 0x25b6), result.declarations[0].marker);
            try std.testing.expect(result.declarations[0].canApply);
            try std.testing.expectEqual(Reason.UnsupportedBulletDeclaration, result.declarations[1].reason.?);
            try std.testing.expectEqual(Reason.UnsupportedBulletDeclaration, result.declarations[2].reason.?);
            try std.testing.expectEqual(Reason.DuplicateBulletId, result.declarations[3].reason.?);
            try std.testing.expectEqual(Reason.DuplicateBulletId, result.declarations[4].reason.?);
            try std.testing.expectEqual(Reason.InvalidBulletId, result.declarations[5].reason.?);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "bullet definitions budget rejects an oversized header without a partial result" {
    const a = std.testing.allocator;
    var bytes: std.ArrayList(u8) = .empty;
    defer bytes.deinit(a);
    try bytes.appendSlice(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:bullets>");
    for (0..4097) |id| {
        const declaration = try std.fmt.allocPrint(a, "<h:bullet id='{d}' char='X' useImage='0'><h:paraHead checkable='0'/></h:bullet>", .{id});
        defer a.free(declaration);
        try bytes.appendSlice(a, declaration);
    }
    try bytes.appendSlice(a, "</h:bullets></h:refList></h:head>");
    var tree = try @import("header_tree.zig").parse(a, bytes.items, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.LimitExceeded, readTree(a, &tree));
}
