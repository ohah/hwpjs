//! Borrowed header tab definitions, independent of stored inline tab advances.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Value = @import("../xml/root.zig").attribute_value.Value;
const head = @import("document_xml.zig").head_uri;
pub const Item = struct { node: usize, pos: ?Value, kind: ?Value, leader: ?Value, unit: ?Value = null };
pub const Definition = struct {
    node: usize,
    id: u32,
    auto_left: ?Value,
    auto_right: ?Value,
    items: []Item,
    pub fn deinit(self: *Definition, a: std.mem.Allocator) void {
        a.free(self.items);
        self.* = undefined;
    }
};

pub fn contains(tree: *const Tree, node: usize) bool {
    if (tree.part_kind != .header or node >= tree.elements.len) return false;
    const element = tree.elements[node];
    if (!element.is(head, "tabPr")) return false;
    const group = element.parent orelse return false;
    if (!tree.elements[group].is(head, "tabProperties")) return false;
    const refs = tree.elements[group].parent orelse return false;
    if (!tree.elements[refs].is(head, "refList")) return false;
    const root = tree.elements[refs].parent orelse return false;
    return root == 0 and tree.elements[root].is(head, "head");
}

/// Only the item array is owned; all attributes borrow the input tree.
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, max_items: usize) !Definition {
    if (!contains(tree, node)) return error.InvalidTabDefinitionSource;
    const id = (try tree.attributeValue(a, node, "", "id")) orelse return error.MissingTabDefinitionId;
    var result = Definition{ .node = node, .id = try @import("table_xml_fields.zig").unsigned(a, id, 4096), .auto_left = try tree.attributeValue(a, node, "", "autoTabLeft"), .auto_right = try tree.attributeValue(a, node, "", "autoTabRight"), .items = undefined };
    var items: std.ArrayList(Item) = .empty;
    defer items.deinit(a);
    const Context = struct {
        allocator: std.mem.Allocator,
        tree: *const Tree,
        items: *std.ArrayList(Item),
        limit: usize,
        pub fn accept(self: *@This(), index: usize) !void {
            if (self.items.items.len >= self.limit) return error.LimitExceeded;
            try self.items.append(self.allocator, .{ .node = index, .pos = try self.tree.attributeValue(self.allocator, index, "", "pos"), .kind = try self.tree.attributeValue(self.allocator, index, "", "type"), .leader = try self.tree.attributeValue(self.allocator, index, "", "leader"), .unit = try self.tree.attributeValue(self.allocator, index, "", "unit") });
        }
    };
    var context = Context{ .allocator = a, .tree = tree, .items = &items, .limit = max_items };
    try @import("selected_display_children.zig").visit(a, tree, node, head, "tabItem", &context);
    result.items = try items.toOwnedSlice(a);
    return result;
}

test "HWPX header tab definitions preserve absent zero opaque and source order with allocation failures" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:f='urn:future'>" ++
        "<h:refList><h:tabProperties><h:tabPr id='&#48;' autoTabLeft='0' autoTabRight='1'>" ++
        "<h:tabItem pos='0' type='LEFT' leader='NONE'/><h:tabItem pos='12&#48;' type='FUTURE'/>" ++
        "<h:tabItem/><f:tabItem pos='999'/><f:holder><h:tabItem pos='777'/></f:holder>" ++
        "</h:tabPr><h:tabPr id='2'/><h:tabPr/></h:tabProperties></h:refList>" ++
        "<h:tabPr id='9'/></h:head>", .header, null, 0, .{});
    defer tree.deinit(a);
    const Probe = struct {
        fn text(allocator: std.mem.Allocator, raw: ?Value, expected: []const u8) !void {
            const value = try raw.?.toUtf8(allocator, 4096);
            defer allocator.free(value);
            try std.testing.expectEqualStrings(expected, value);
        }
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            var def = try read(allocator, input, 3, 3);
            defer def.deinit(allocator);
            try std.testing.expectEqual(@as(u32, 0), def.id);
            try std.testing.expectEqual(@as(usize, 3), def.items.len);
            try text(allocator, def.auto_left, "0");
            try text(allocator, def.auto_right, "1");
            try text(allocator, def.items[0].pos, "0");
            try text(allocator, def.items[1].pos, "120");
            try text(allocator, def.items[1].kind, "FUTURE");
            try std.testing.expect(def.items[1].leader == null);
            try std.testing.expect(def.items[2].pos == null and def.items[2].kind == null and def.items[2].leader == null);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, read(a, &tree, 3, 2));
    var count: usize = 0;
    for (tree.elements, 0..) |_, index| if (contains(&tree, index)) {
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 3), count);
    for (tree.elements, 0..) |_, index| if (contains(&tree, index)) {
        const raw = try tree.attributeValue(a, index, "", "id");
        if (raw == null) {
            try std.testing.expectError(error.MissingTabDefinitionId, read(a, &tree, index, 3));
        } else if (index != 3) {
            var empty = try read(a, &tree, index, 0);
            defer empty.deinit(a);
            try std.testing.expectEqual(@as(u32, 2), empty.id);
            try std.testing.expectEqual(@as(usize, 0), empty.items.len);
            try std.testing.expect(empty.auto_left == null and empty.auto_right == null);
        }
    };
    try std.testing.expectError(error.InvalidTabDefinitionSource, read(a, &tree, 0, 3));
    try std.testing.expectError(error.InvalidTabDefinitionSource, read(a, &tree, tree.elements.len, 3));
    tree.part_kind = .section;
    try std.testing.expect(!contains(&tree, 3));
}

test "HWPX header tab definitions match actual tabdef and pr1674 validated resource IDs" {
    const a = std.testing.allocator;
    const Case = struct { path: []const u8, definitions: usize, items: usize, auto_left: usize, auto_right: usize };
    const cases = [_]Case{
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/tabdef.hwpx", .definitions = 10, .items = 19, .auto_left = 3, .auto_right = 2 },
        .{ .path = "reference/rhwp/samples/hwpx/pr-1674.hwpx", .definitions = 16, .items = 119, .auto_left = 2, .auto_right = 1 },
    };
    for (cases) |case| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case.path, a, .limited(4_000_000));
        defer a.free(bytes);
        var doc = try @import("package.zig").inspectDocument(a, bytes, .{});
        defer doc.deinit(a);
        var resources = try doc.inspectHeaderResources(a, .{});
        defer resources.deinit(a);
        var tree = try doc.readHeaderTree(a, .{});
        defer tree.deinit(a);
        var definitions: usize = 0;
        var items: usize = 0;
        var left: usize = 0;
        var right: usize = 0;
        for (tree.elements, 0..) |_, node| {
            if (!contains(&tree, node)) continue;
            var def = try read(a, &tree, node, 1000);
            defer def.deinit(a);
            try std.testing.expect(resources.table(.tab).hasId(def.id));
            try std.testing.expectEqual(@as(u32, @intCast(definitions)), def.id);
            definitions += 1;
            items += def.items.len;
            const l = try def.auto_left.?.toUtf8(a, 4096);
            defer a.free(l);
            const r = try def.auto_right.?.toUtf8(a, 4096);
            defer a.free(r);
            if (std.mem.eql(u8, l, "1")) left += 1;
            if (std.mem.eql(u8, r, "1")) right += 1;
            if (case.definitions == 10 and def.id == 3) {
                try std.testing.expectEqual(@as(usize, 3), def.items.len);
                const pos = try def.items[0].pos.?.toUtf8(a, 4096);
                defer a.free(pos);
                const kind = try def.items[0].kind.?.toUtf8(a, 4096);
                defer a.free(kind);
                try std.testing.expectEqualStrings("6000", pos);
                try std.testing.expectEqualStrings("RIGHT", kind);
            }
        }
        try std.testing.expectEqual(case.definitions, definitions);
        try std.testing.expectEqual(case.items, items);
        try std.testing.expectEqual(case.auto_left, left);
        try std.testing.expectEqual(case.auto_right, right);
        try std.testing.expectEqual(resources.table(.tab).ids.items.len, definitions);
    }
}

test "HWPX header tab definitions select fallback once and preserve selected unit provenance" {
    const a = std.testing.allocator;
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:f='urn:foreign'>" ++
        "<h:refList><h:tabProperties><h:tabPr id='0'>" ++
        "<h:tabItem pos='0' unit='FUTURE'/>" ++
        "<p:switch><p:case p:required-namespace='http://www.hancom.co.kr/hwpml/2016/HwpUnitChar'>" ++
        "<h:tabItem pos='50' unit='HWPUNIT'/></p:case><p:default><h:tabItem pos='101'/>" ++
        "<p:switch><p:case p:required-namespace='urn:unsupported'><h:tabItem pos='999'/></p:case>" ++
        "<p:default><h:tabItem pos='2&#48;0' unit='HWPUNIT'/></p:default></p:switch>" ++
        "</p:default><p:default><h:tabItem pos='777'/></p:default></p:switch>" ++
        "<p:switch><p:case p:required-namespace='urn:unsupported'><h:tabItem pos='888'/></p:case></p:switch>" ++
        "<f:switch><p:default><h:tabItem pos='666'/></p:default></f:switch>" ++
        "</h:tabPr></h:tabProperties></h:refList></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .header, null, 0, .{});
    defer tree.deinit(a);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            var def = try read(allocator, input, 3, 3);
            defer def.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), def.items.len);
            for (def.items, [_][]const u8{ "0", "101", "200" }, [_]?[]const u8{ "FUTURE", null, "HWPUNIT" }) |item, pos, unit| {
                const p = try item.pos.?.toUtf8(allocator, 4096);
                defer allocator.free(p);
                try std.testing.expectEqualStrings(pos, p);
                if (unit) |expected| {
                    const u = try item.unit.?.toUtf8(allocator, 4096);
                    defer allocator.free(u);
                    try std.testing.expectEqualStrings(expected, u);
                } else try std.testing.expect(item.unit == null);
            }
        }
    };
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{&tree});
    try std.testing.expectError(error.LimitExceeded, read(a, &tree, 3, 2));
    try std.testing.expectEqualStrings(xml, tree.source);
}
