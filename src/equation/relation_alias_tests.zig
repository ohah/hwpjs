const std = @import("std");
const t = std.testing;
const commands = @import("commands.zig");
const symbols = @import("symbols.zig");
const parser = @import("parser.zig");
const planner = @import("measurement_plan.zig");
const measured = @import("measured_requests.zig");
const layout = @import("ast_layout.zig");
const Stream = @import("command_stream.zig").Stream;
fn check(a: std.mem.Allocator, source: []const u8) !void {
    var tree = try parser.parse(a, source, .{});
    defer tree.deinit();
    var plan = try planner.build(a, &tree, .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 });
    defer plan.deinit();
    try t.expect(plan.ready());
    const values = try a.alloc(measured.Measurement, plan.requests.len);
    defer a.free(values);
    for (values, plan.requests, 0..) |*value, request, index| value.* = .{ .request = index, .box = .{ .width = request.size / 2, .ascent = request.size * 0.6, .descent = request.size * 0.2 } };
    var result = try layout.build(a, &tree, &plan, values, .{
        .fraction = .{ .padding = 0.1, .gap = 0.1, .rule_thickness = 0.05, .axis = 0.25 },
        .script = .{ .gap = 0.1, .superscript_shift = 0.5, .subscript_shift = 0.3, .clearance = 0.1 },
        .normal_space = 0.25,
        .thin_space = 0.1,
    });
    defer result.deinit();
    try t.expectEqual(plan.requests.len, result.glyphs.len);
    try t.expectEqualStrings(source, tree.source);
    if (std.mem.eql(u8, source, "ge0")) {
        try t.expectEqual(@as(usize, 2), plan.requests.len);
        try t.expectEqualStrings("≥", plan.requests[0].text);
        try t.expectEqualStrings("0", plan.requests[1].text);
        try t.expectEqual(@as(usize, 2), plan.requests[0].source_end);
        try t.expectEqual(@as(usize, 2), plan.requests[1].source_start);
    }
}
test "equation relation aliases keep numeric glue longest names and ordinary words separate" {
    try t.expectEqual(symbols.Basis.observed_alias, symbols.lookup("GE").?.basis);
    try t.expectEqualStrings("≤", symbols.lookup("le").?.glyph);
    for ([_][]const u8{ "geometry", "geometric", "legacy", "letter", "level", "gefoo", "lefoo", "ge😀" }) |word|
        try t.expect(commands.prefix(word) == null);
    try t.expectEqual(@as(usize, 3), commands.prefix("GEQ0").?.consumed);
    try t.expectEqual(@as(usize, 2), commands.prefix("ge0").?.consumed);
    var stream = try Stream.init("ge0le1GEQ2", .{});
    for ([_][]const u8{ "ge", "0", "le", "1", "GEQ", "2" }) |wanted| try t.expectEqualStrings(wanted, (try stream.next()).value);
    for ([_][]const u8{ "ge0", "GE0", "le2", "LE", "geq0", "leq1", "geometry", "legacy", "\"ge0\"", "=(a+1)^2 ge0" }) |source| try check(t.allocator, source);
}
test "equation relation aliases preserve actual source and allocation safety" {
    try @import("../testing/allocation_failures.zig").check(check, .{"=(a+1)^2 ge0"});
}
