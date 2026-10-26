const std = @import("std");
const trees = @import("xml_part_tree.zig");
const Values = @import("equation_script_values.zig").Values;
const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:equation><p:script>A<![CDATA[😀]]></p:script></p:equation><p:equation><p:script>B</p:script></p:equation></p:run></p:p></s:sec>";

test "equation script values own independent snapshots and restore decoded originals" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expect(!try values.set(a, &tree, 3, "A😀", .{}, 4096));
    var caller = [_]u8{'X'};
    try std.testing.expect(try values.set(a, &tree, 3, &caller, .{}, 4096));
    caller[0] = 'Y';
    var snapshot = try values.clone(a);
    defer snapshot.deinit(a);
    try std.testing.expect(try values.set(a, &tree, 5, "new😀<&", .{}, 4096));
    const owned = try snapshot.read(a, &tree, 3, .{});
    defer a.free(owned);
    try std.testing.expectEqualStrings("X", owned);
    try std.testing.expectEqual(@as(usize, 1), snapshot.entries.items.len);
    try std.testing.expect(try values.set(a, &tree, 3, "A😀", .{}, 4096));
    try std.testing.expectEqual(@as(usize, 1), values.entries.items.len);
    try std.testing.expectEqual(@as(usize, 5), values.entries.items[0].equation);
    const size = try values.byteSize(4096);
    try std.testing.expectError(error.LimitExceeded, values.byteSize(size - 1));
    try std.testing.expectError(error.InvalidXmlCharacter, values.set(a, &tree, 5, &.{0}, .{}, 4096));
    try std.testing.expectError(error.LimitExceeded, values.set(a, &tree, 5, "changed", .{}, 0));
    try std.testing.expectEqualStrings("new😀<&", values.entries.items[0].text);
    try std.testing.expectEqualStrings(source, tree.source);
}

test "equation script values every allocation failure preserves prior ownership" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var values: Values = .{};
    defer values.deinit(a);
    _ = try values.set(a, &tree, 3, "prior", .{}, 4096);
    for ([_]struct { node: usize, text: []const u8, expected_count: usize }{
        .{ .node = 5, .text = "next😀<&", .expected_count = 2 },
        .{ .node = 3, .text = "replacement😀", .expected_count = 1 },
        .{ .node = 3, .text = "A😀", .expected_count = 0 },
    }) |change| try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree, prior: *const Values, node: usize, text: []const u8, count: usize) !void {
            var copy = try prior.clone(allocator);
            defer copy.deinit(allocator);
            const result = copy.set(allocator, parsed, node, text, .{}, 4096);
            if (result) |changed| {
                try std.testing.expect(changed);
                try std.testing.expectEqual(count, copy.entries.items.len);
            } else |err| {
                try std.testing.expectEqual(@as(usize, 1), copy.entries.items.len);
                try std.testing.expectEqualStrings("prior", copy.entries.items[0].text);
                return err;
            }
            try std.testing.expectEqualStrings("prior", prior.entries.items[0].text);
        }
    }.run, .{ &tree, &values, change.node, change.text, change.expected_count });
}

test "equation script values reject duplicate source identities without hiding corruption" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var values: Values = .{};
    defer values.deinit(a);
    for (0..2) |_| {
        const text = try a.dupe(u8, "same");
        errdefer a.free(text);
        try values.entries.append(a, .{ .equation = 3, .text = text });
    }
    try std.testing.expectError(error.DuplicateEquationScriptEdit, values.clone(a));
    try std.testing.expectError(error.DuplicateEquationScriptEdit, values.read(a, &tree, 3, .{}));
    try std.testing.expectError(error.DuplicateEquationScriptEdit, values.set(a, &tree, 3, "same", .{}, 4096));
    try std.testing.expectEqual(@as(usize, 2), values.entries.items.len);
}
