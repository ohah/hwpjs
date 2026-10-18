const std = @import("std");
const Tree = @import("tree.zig").Tree;
const Index = @import("table_list_index.zig").Index;
const lists = @import("table_lists.zig");
const controls = @import("control_rules.zig");

test "table list index matches existing formula ownership for actual nested cells and captions" {
    try @import("../../testing/checked_allocator.zig").run(verifyActual, .{});
}

fn verifyActual(a: std.mem.Allocator) !void {
    for ([_][]const u8{ "table-caption", "chart", "table-bug" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        var tree = try Tree.parse(a, bytes, source.header.version(), .{});
        defer tree.deinit(a);
        var groups = try @import("list_groups.zig").Groups.build(a, tree);
        defer groups.deinit(a);
        var flows = try @import("paragraph_flows.zig").Flows.build(a, tree, groups.items);
        defer flows.deinit(a);
        var index: Index = .{ .tree = tree };
        defer index.deinit(a);
        for (tree.nodes, 0..) |node, ordinal| {
            if (node.record.value != .header) continue;
            const expected = @import("formula_cell.zig").locate(tree, groups, ordinal, .observed8) catch |err| {
                try std.testing.expectError(err, @import("formula_cell.zig").locateIndexed(a, &index, flows, ordinal, .observed8));
                continue;
            };
            try std.testing.expectEqualDeep(expected, try @import("formula_cell.zig").locateIndexed(a, &index, flows, ordinal, .observed8));
        }
        try std.testing.expectError(error.InvalidParagraph, @import("formula_cell.zig").locateIndexed(a, &index, flows, tree.nodes.len, .observed8));
    }
}

test "table list index refuses foreign lists and retains missing duplicate marker errors" {
    try @import("../../testing/checked_allocator.zig").run(verifyFailures, .{});
}

fn verifyFailures(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try Tree.parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var index: Index = .{ .tree = tree };
    defer index.deinit(a);
    var first: ?usize = null;
    var second: ?usize = null;
    for (tree.nodes, 0..) |node, ordinal| {
        if (node.record.value == .control_header and node.record.value.control_header.id == controls.table_id) {
            if (first == null) first = ordinal else if (second == null) second = ordinal;
        }
    }
    try std.testing.expect(first != null and second != null);
    var iterator = try lists.Iterator.init(tree, first.?);
    const entry = iterator.next().?;
    const expected = try index.get(a, first.?, entry.node);
    try std.testing.expectEqual(entry.kind, expected.kind);
    try std.testing.expectEqual(iterator.table_node, expected.table_node);
    try std.testing.expectError(error.InvalidTableOwner, index.get(a, second.?, entry.node));
    try std.testing.expectError(error.InvalidTableOwner, index.get(a, first.?, tree.nodes.len));
    try std.testing.expectError(error.InvalidTableOwner, index.get(a, tree.nodes.len, entry.node));
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, borrowed: Tree, owner: usize, list: usize, wanted: @import("table_list_index.zig").Entry) !void {
            var scoped: Index = .{ .tree = borrowed };
            defer scoped.deinit(allocator);
            try std.testing.expectEqualDeep(wanted, try scoped.get(allocator, owner, list));
            try std.testing.expectEqualDeep(wanted, try scoped.get(allocator, owner, list));
        }
    }.run, .{ tree, first.?, entry.node, expected });
    var interrupted: Index = .{ .tree = tree };
    defer interrupted.deinit(a);
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 1 });
    try std.testing.expectError(error.OutOfMemory, interrupted.get(failing.allocator(), first.?, entry.node));
    try std.testing.expect(!interrupted.loaded.contains(first.?));
    try std.testing.expectEqualDeep(expected, try interrupted.get(a, first.?, entry.node));
    var no_allocation = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    try std.testing.expectEqualDeep(expected, try interrupted.get(no_allocation.allocator(), first.?, entry.node));
    // New scopes after mutations: an index never outlives its unchanged tree.
    const marker_value = tree.nodes[iterator.table_node].record.value;
    tree.nodes[iterator.table_node].record.value = tree.nodes[first.?].record.value;
    var missing: Index = .{ .tree = tree };
    defer missing.deinit(a);
    try std.testing.expectError(error.MissingTableRecord, missing.get(a, first.?, entry.node));
    tree.nodes[iterator.table_node].record.value = marker_value;
    const list_value = tree.nodes[entry.node].record.value;
    tree.nodes[entry.node].record.value = marker_value;
    var duplicate: Index = .{ .tree = tree };
    defer duplicate.deinit(a);
    try std.testing.expectError(error.DuplicateTableRecord, duplicate.get(a, first.?, entry.node));
    tree.nodes[entry.node].record.value = list_value;
}
