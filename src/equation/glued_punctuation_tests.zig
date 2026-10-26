const std = @import("std");
const t = std.testing;
const Stream = @import("command_stream.zig").Stream;
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");
const layout = @import("ast_layout.zig");
fn check(a: std.mem.Allocator, source: []const u8) !void {
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    var plan = try planner.build(a, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(plan.ready());
    const values = try a.alloc(measured.Measurement, plan.requests.len);
    defer a.free(values);
    for (values, 0..) |*value, request| value.* = .{ .request = request, .box = .{ .width = 10, .ascent = 12, .descent = 4 } };
    var result = try layout.build(a, &tree, &plan, values, .{
        .fraction = .{ .padding = 0.1, .gap = 0.1, .rule_thickness = 0.05, .axis = 0.25 },
        .script = .{ .gap = 0.1, .superscript_shift = 0.5, .subscript_shift = 0.3, .clearance = 0.1 },
        .normal_space = 0.25,
        .thin_space = 0.1,
    });
    defer result.deinit();
    try t.expectEqual(plan.requests.len, result.glyphs.len);
    try t.expectEqualStrings(source, tree.source);
    try t.expectEqualStrings(source, plan.source);
    if (std.mem.eql(u8, source, "cdotscdots")) {
        try t.expectEqual(@as(usize, 2), plan.requests.len);
        for (plan.requests, 0..) |request, i| {
            try t.expectEqualStrings("⋯", request.text);
            try t.expectEqual(@as(usize, i * 5), request.source_start);
            try t.expectEqual(@as(usize, (i + 1) * 5), request.source_end);
        }
        try t.expectEqual(@as(f64, 20), result.box.width);
    }
}
test "equation glued punctuation retains exact original spans glyph counts and allocation safety" {
    for ([_][]const u8{ "cdotscdots", "CDOTScdots", "ldotsvdotsddots", "cdots1", "cdotsx", "{cdotscdots}^2", "\"cdotscdots\"" }) |source| try check(t.allocator, source);
    try @import("../testing/allocation_failures.zig").check(check, .{"cdotscdots"});
}
test "equation semantic stream caches long glued suffixes and preserves failed token budget state" {
    const count = 8192;
    const source = try t.allocator.alloc(u8, count * 5);
    defer t.allocator.free(source);
    for (0..count) |i| @memcpy(source[i * 5 ..][0..5], "cdots");
    var stream = try Stream.init(source, .{ .max_tokens = count });
    for (0..count) |i| {
        const token = try stream.next();
        try t.expectEqualStrings("cdots", token.value);
        try t.expectEqual(i * 5, token.start);
        try t.expectEqual((i + 1) * 5, token.end);
        try t.expectEqual(source.len, stream.lexer.source.len);
        try t.expectEqual(if (i + 1 == count) null else @as(?usize, source.len), stream.pending_identifier_end);
    }
    try t.expectEqual(@import("token.zig").Kind.eof, (try stream.next()).kind);
    var limited = try Stream.init("cdotscdots", .{ .max_tokens = 1 });
    _ = try limited.next();
    const before = limited;
    for (0..2) |_| try t.expectError(error.EquationTokenLimitExceeded, limited.next());
    try t.expectEqualDeep(before, limited);
    var mixed = try Stream.init("sqrt20x cdots2x rmK", .{});
    for ([_][]const u8{ "sqrt", "20", "x", "cdots", "2", "x", "rm", "K" }) |wanted|
        try t.expectEqualStrings(wanted, (try mixed.next()).value);
}
