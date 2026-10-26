//! Detached JSON for immutable tab resources; current paragraph references remain separate.
const std = @import("std");
const source = @import("tab_definition_source.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const Value = @import("../xml/root.zig").attribute_value.Value;
const Item = struct { pos: ?[]const u8, kind: ?[]const u8, leader: ?[]const u8, unit: ?[]const u8 };
const Row = struct { id: u32, auto_left: ?[]const u8, auto_right: ?[]const u8, items: []Item };
fn text(a: std.mem.Allocator, value: ?Value) !?[]const u8 {
    return if (value) |raw| try raw.toUtf8(a, 4096) else null;
}

fn encodeTree(a: std.mem.Allocator, tree: *const Tree, ids: []const u32) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const rows = try scratch.alloc(Row, ids.len);
    var count: usize = 0;
    var remaining: usize = 1_000_000;
    for (tree.elements, 0..) |_, node| {
        if (!source.contains(tree, node)) continue;
        if (count >= ids.len) return error.TabDefinitionResourceMismatch;
        const raw = try source.read(scratch, tree, node, remaining);
        remaining -= raw.items.len;
        const items = try scratch.alloc(Item, raw.items.len);
        for (raw.items, items) |item, *output| output.* = .{ .pos = try text(scratch, item.pos), .kind = try text(scratch, item.kind), .leader = try text(scratch, item.leader), .unit = try text(scratch, item.unit) };
        rows[count] = .{ .id = raw.id, .auto_left = try text(scratch, raw.auto_left), .auto_right = try text(scratch, raw.auto_right), .items = items };
        count += 1;
    }
    if (count != ids.len) return error.TabDefinitionResourceMismatch;
    std.mem.sort(Row, rows, {}, struct {
        fn less(_: void, left: Row, right: Row) bool {
            return left.id < right.id;
        }
    }.less);
    for (rows, ids) |row, id| if (row.id != id) return error.TabDefinitionResourceMismatch;
    return std.json.Stringify.valueAlloc(a, rows, .{});
}

pub fn encode(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session) ![]u8 {
    var doc = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer doc.deinit(a);
    var resources = try doc.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    var tree = try doc.readHeaderTree(a, .{});
    defer tree.deinit(a);
    return encodeTree(a, &tree, resources.table(.tab).ids.items);
}

test "HWPX tab definition snapshot detaches sparse sorted identities and cleans all failed allocations" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:tabProperties>" ++
        "<h:tabPr id='300' autoTabRight='1'><h:tabItem pos='12&#48;' type='FUTURE'/></h:tabPr>" ++
        "<h:tabPr id='0'/></h:tabProperties></h:refList></h:head>", .header, null, 0, .{});
    defer tree.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            const bytes = try encodeTree(allocator, input, &.{ 0, 300 });
            defer allocator.free(bytes);
            try std.testing.expectEqualStrings("[{\"id\":0,\"auto_left\":null,\"auto_right\":null,\"items\":[]},{\"id\":300,\"auto_left\":null,\"auto_right\":\"1\",\"items\":[{\"pos\":\"120\",\"kind\":\"FUTURE\",\"leader\":null,\"unit\":null}]}]", bytes);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{&tree});
    try std.testing.expectError(error.TabDefinitionResourceMismatch, encodeTree(a, &tree, &.{ 0, 301 }));
    try std.testing.expectError(error.TabDefinitionResourceMismatch, encodeTree(a, &tree, &.{0}));
    try std.testing.expectError(error.TabDefinitionResourceMismatch, encodeTree(a, &tree, &.{ 0, 300, 301 }));
}
