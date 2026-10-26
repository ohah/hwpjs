const std = @import("std");
const t = std.testing;
const commands = @import("commands.zig");
const Stream = @import("command_stream.zig").Stream;
const parser = @import("parser.zig");

test "equation command stream separates fixture geometry and relation operands without splitting Greek names" {
    const source = "trianglePQR leq6 geq8 geq73 alphabet sigmaRIGHT";
    var stream = try Stream.init(source, .{});
    const expected = [_][]const u8{ "triangle", "PQR", "leq", "6", "geq", "8", "geq", "73", "alphabet", "sigmaRIGHT" };
    for (expected) |value| {
        const token = try stream.next();
        try t.expectEqualStrings(value, token.value);
        try t.expectEqualStrings(value, source[token.start..token.end]);
    }
    try t.expectEqual(@import("token.zig").Kind.eof, (try stream.next()).kind);
    var tree = try parser.parse(t.allocator, "trianglePQR leq6 geq8", .{});
    defer tree.deinit();
    var symbols: usize = 0;
    for (tree.nodes) |node| if (node.data == .symbol) {
        symbols += 1;
    };
    try t.expectEqual(@as(usize, 3), symbols);
    try t.expectEqualStrings("trianglePQR leq6 geq8", tree.source);
    var limited = try Stream.init("trianglePQR", .{ .max_tokens = 1 });
    _ = try limited.next();
    for (0..2) |_| try t.expectError(error.EquationTokenLimitExceeded, limited.next());
    try t.expectEqual(@as(usize, 8), limited.lexer.offset);
}

test "equation command registry preserves case-sensitive limits and whole-word priority" {
    for (commands.groups) |group| for (group.names) |name| {
        try t.expectEqual(group.family, commands.lookup(name).?.family);
        if (!group.case_sensitive) {
            const upper = try std.ascii.allocUpperString(t.allocator, name);
            defer t.allocator.free(upper);
            try t.expectEqual(group.family, commands.lookup(upper).?.family);
        }
    };
    try t.expectEqual(commands.Family.lower_limit, commands.lookup("lim").?.family);
    try t.expectEqual(commands.Family.upper_limit, commands.lookup("Lim").?.family);
    try t.expect(commands.lookup("LIM") == null);
    try t.expectEqual(@as(usize, 4), commands.prefix("sinh").?.consumed);
    try t.expectEqual(@as(usize, 4), commands.prefix("sinhx").?.consumed);
    try t.expectEqual(commands.Family.decoration, commands.prefix("overline").?.family);
    for ([_][]const u8{ "", "overlap", "rootn", "mineral", "maximum", "expression", "overa", "sin😀", "unknownWord" }) |word| try t.expect(commands.prefix(word) == null);
    try t.expectEqual(@as(usize, 4), commands.prefix("over20").?.consumed);
    try t.expectEqual(@as(usize, 2), commands.prefix("rmK").?.consumed);
}

test "equation command stream relexes glued numeric operands and retains source offsets budgets" {
    var stream = try Stream.init("over20x rmK sinx sinh coshx sqrt3 overline overlap rootn mineral", .{});
    const expected = [_][]const u8{ "over", "20", "x", "rm", "K", "sin", "x", "sinh", "cosh", "x", "sqrt", "3", "overline", "overlap", "rootn", "mineral" };
    var previous: usize = 0;
    for (expected) |value| {
        const token = try stream.next();
        try t.expectEqualStrings(value, token.value);
        try t.expectEqualStrings(value, stream.lexer.source[token.start..token.end]);
        try t.expectEqual(token.start > previous, token.space_before);
        previous = token.end;
    }
    const eof = try stream.next();
    try t.expectEqual(@import("token.zig").Kind.eof, eof.kind);
    try t.expectEqualDeep(eof, try stream.next());
    var limited = try Stream.init("rmK", .{ .max_tokens = 1 });
    _ = try limited.next();
    for (0..2) |_| try t.expectError(error.EquationTokenLimitExceeded, limited.next());
    try t.expectEqual(@as(usize, 2), limited.lexer.offset);
    try t.expectEqual(@as(usize, 1), limited.lexer.count);
}

test "equation command parser connects aliases glued fractions and explicit unimplemented families" {
    var tree = try parser.parse(t.allocator, "x sub {a+b} SUP 2", .{});
    defer tree.deinit();
    const root = tree.nodes[tree.root].data.row;
    const scripts = tree.nodes[tree.children[root.start]].data.scripts;
    try t.expect(scripts.sub != null and scripts.sup != null);
    try t.expectEqualStrings("x", tree.nodes[scripts.base].data.literal.value);
    try t.expectEqualStrings("2", tree.nodes[scripts.sup.?].data.literal.value);
    var fraction = try parser.parse(t.allocator, "x over20", .{});
    defer fraction.deinit();
    const pair = fraction.nodes[fraction.children[fraction.nodes[fraction.root].data.row.start]].data.fraction;
    try t.expectEqualStrings("20", fraction.nodes[pair.bottom].data.literal.value);
    var classified = try parser.parse(t.allocator, "rmK sinx root3 CASES{x}", .{});
    defer classified.deinit();
    var families: std.ArrayList(commands.Family) = .empty;
    defer families.deinit(t.allocator);
    for (classified.nodes) |node| if (node.data == .command) try families.append(t.allocator, node.data.command.family);
    try t.expectEqual(@as(usize, 0), families.items.len);
    var cases: usize = 0;
    for (classified.nodes) |node| if (node.data == .grid and node.data.grid.kind == .cases) {
        cases += 1;
    };
    try t.expectEqual(@as(usize, 1), cases);
    var radicals: usize = 0;
    for (classified.nodes) |node| if (node.data == .radical) {
        radicals += 1;
    };
    try t.expectEqual(@as(usize, 1), radicals);
    var styled: usize = 0;
    var functions: usize = 0;
    for (classified.nodes) |node| switch (node.data) {
        .styled => styled += 1,
        .function => functions += 1,
        else => {},
    };
    try t.expectEqual(@as(usize, 1), styled);
    try t.expectEqual(@as(usize, 1), functions);
    try t.expectEqualStrings("rmK sinx root3 CASES{x}", classified.source);
    try t.expectError(error.EquationTokenLimitExceeded, parser.parse(t.allocator, "rmitboldK", .{ .lexical = .{ .max_tokens = 3 } }));
    try t.checkAllAllocationFailures(t.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var result = try parser.parse(a, "rmK sinx over20 + sqrt3", .{});
            defer result.deinit();
            try t.expectEqualStrings("rmK sinx over20 + sqrt3", result.source);
        }
    }.run, .{});
}
