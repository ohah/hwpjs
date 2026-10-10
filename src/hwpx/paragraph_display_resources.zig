//! Validated header resources projected into caller-owned display snapshots.
const std = @import("std");
const owned = @import("paragraph_display_owned.zig");
const raw = @import("paragraph_display_shape.zig");
const head = @import("document_xml.zig").head_uri;

pub fn deinit(a: std.mem.Allocator, shapes: []owned.Shape) void {
    for (shapes) |*shape| shape.deinit(a);
    a.free(shapes);
}

pub fn read(session: *const @import("editor_session.zig").Session) ![]owned.Shape {
    const a = session.allocator;
    if (session.paragraph_resources.entries.items.len != 0 or session.character_resources.entries.items.len != 0) {
        const ids = try session.paragraphShapeIds();
        defer a.free(ids);
        const header = try @import("header_resource_save.zig").replacementWithCharacters(a, session.source, &session.paragraph_resources, &session.character_resources, session.options.max_xml_bytes);
        defer a.free(header.bytes);
        var tree = try @import("header_tree.zig").parse(a, header.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
        defer tree.deinit(a);
        return collect(a, &tree, ids);
    }
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    const ids = resources.table(.para_shape).ids.items;
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    return collect(a, &tree, ids);
}

fn collect(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, ids: []const u32) ![]owned.Shape {
    var output: std.ArrayList(owned.Shape) = .empty;
    errdefer {
        for (output.items) |*shape| shape.deinit(a);
        output.deinit(a);
    }
    for (tree.elements, 0..) |element, index| {
        if (!element.is(head, "paraPr")) continue;
        const parent = element.parent orelse continue;
        if (!tree.elements[parent].is(head, "paraProperties")) continue;
        const source = try raw.read(a, tree, index);
        if (output.items.len >= ids.len) return error.ParagraphDisplayResourceMismatch;
        var snapshot = try owned.clone(a, source);
        errdefer snapshot.deinit(a);
        try output.append(a, snapshot);
    }
    if (output.items.len != ids.len) return error.ParagraphDisplayResourceMismatch;
    std.mem.sort(owned.Shape, output.items, {}, struct {
        fn less(_: void, left: owned.Shape, right: owned.Shape) bool {
            return left.id < right.id;
        }
    }.less);
    for (output.items, ids) |shape, id| if (shape.id != id) return error.ParagraphDisplayResourceMismatch;
    return output.toOwnedSlice(a);
}

test "HWPX paragraph display resources accept unsorted sparse XML IDs" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:paraProperties itemCnt='3'><h:paraPr id='300'/><h:paraPr id='0'/><h:paraPr id='9'/></h:paraProperties></h:refList></h:head>", .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const @import("xml_part_tree.zig").Tree) !void {
            const shapes = try collect(allocator, input, &.{ 0, 9, 300 });
            defer deinit(allocator, shapes);
            for (shapes, [_]u32{ 0, 9, 300 }) |shape, id| try std.testing.expectEqual(id, shape.id);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.ParagraphDisplayResourceMismatch, collect(a, &tree, &.{ 0, 9, 301 }));
}

test "HWPX paragraph display resources match validated IDs and never mutate saved source" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const ids = try session.paragraphShapeIds();
    defer a.free(ids);
    const shapes = try read(&session);
    defer deinit(a, shapes);
    try std.testing.expectEqual(ids.len, shapes.len);
    for (shapes, ids) |shape, id| {
        try std.testing.expectEqual(id, shape.id);
        if (id == 16) try std.testing.expectEqualStrings("RIGHT", shape.horizontal.?);
    }
    shapes[0].id = 0xffffffff;
    const fresh = try read(&session);
    defer deinit(a, fresh);
    try std.testing.expectEqual(ids[0], fresh[0].id);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
