const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const plan = @import("measurement_plan.zig");
const opts: plan.Options = .{ .size = 20, .script_scale = 0.5, .fraction_scale = 0.75 };
test "equation measurement plan owns text and propagates style fractions and script sizes" {
    var tree = try parser.parse(t.allocator, "rm {x over y} + bold z^2 + SIN a", .{});
    var result = plan.build(t.allocator, &tree, opts) catch |err| {
        tree.deinit();
        return err;
    };
    defer result.deinit();
    tree.deinit();
    try t.expect(result.ready());
    try t.expectEqual(@as(usize, 8), result.requests.len);
    try t.expectEqualStrings("x", result.requests[0].text);
    try t.expectEqual(@as(f64, 15), result.requests[0].size);
    try t.expect(!result.requests[0].style.italic);
    try t.expectEqualStrings("z", result.requests[3].text);
    try t.expect(result.requests[3].style.bold);
    try t.expectEqualStrings("2", result.requests[4].text);
    try t.expectEqual(@as(f64, 10), result.requests[4].size);
    try t.expect(!result.requests[4].style.bold);
    try t.expectEqualStrings("sin", result.requests[6].text);
    try t.expect(!result.requests[6].style.italic);
}
test "equation measurement plan applies inherited context fonts without measuring carriers twice" {
    var tree = try parser.parse(t.allocator, "bold {it _7 rm P it _4}", .{});
    defer tree.deinit();
    var result = try plan.build(t.allocator, &tree, opts);
    defer result.deinit();
    try t.expect(result.ready());
    try t.expectEqual(@as(usize, 3), result.requests.len);
    var numbers: usize = 0;
    for (result.requests) |request| {
        if (request.role == .number) {
            numbers += 1;
            try t.expect(request.style.bold);
            try t.expectEqual(@as(f64, 10), request.size);
        }
    }
    try t.expectEqual(@as(usize, 2), numbers);
}
test "equation measurement plan reports unsupported and observed semantics instead of declaring paint ready" {
    for ([_][]const u8{ "SLADDER{x}", "x#y", "unknownWord", "CAP", "it _r" }) |source| {
        var tree = try parser.parse(t.allocator, source, .{});
        defer tree.deinit();
        var result = try plan.build(t.allocator, &tree, opts);
        defer result.deinit();
        try t.expect(!result.ready());
    }
    var tree = try parser.parse(t.allocator, "CAP", .{});
    defer tree.deinit();
    var options = opts;
    options.accept_observed_symbols = true;
    var accepted = try plan.build(t.allocator, &tree, options);
    defer accepted.deinit();
    try t.expect(accepted.ready());
    try t.expectEqualStrings("∩", accepted.requests[0].text);
}
test "equation measurement plan bounds output sizes and releases every partial allocation" {
    var tree = try parser.parse(t.allocator, "rm {x over y} + it _7 rm P it _4 + LEFT (x RIGHT )", .{});
    defer tree.deinit();
    try t.checkAllAllocationFailures(t.allocator, struct {
        fn run(a: std.mem.Allocator, original: *const @import("ast.zig").Tree) !void {
            var result = try plan.build(a, original, opts);
            defer result.deinit();
        }
    }.run, .{&tree});
    var limited = opts;
    limited.max_requests = 1;
    try t.expectError(error.EquationMeasurementLimitExceeded, plan.build(t.allocator, &tree, limited));
    limited = opts;
    limited.script_scale = std.math.nan(f64);
    try t.expectError(error.InvalidEquationMeasurementSize, plan.build(t.allocator, &tree, limited));
    limited = opts;
    limited.max_size = 1;
    try t.expectError(error.EquationMeasurementLimitExceeded, plan.build(t.allocator, &tree, limited));
    limited = opts;
    limited.max_request_bytes = 0;
    try t.expectError(error.EquationMeasurementLimitExceeded, plan.build(t.allocator, &tree, limited));
    limited = opts;
    limited.max_steps = 0;
    try t.expectError(error.EquationScriptContextLimitExceeded, plan.build(t.allocator, &tree, limited));
}

test "equation measurement plan preserves ordinary Latin terms and refuses unresolved long boundaries" {
    const identifier = @import("identifier.zig");
    for ([_][]const u8{ "", "a1", "한글", "a_b", "abcdefghij" }) |value| try t.expect(!identifier.isOrdinaryTerm(value));
    for ([_][]const u8{ "abc", "abcdefghi", "rm ABC", "(abc) {pmatrix{p#q#r}} =(ab+bq+cr)" }) |source| {
        var tree = try parser.parse(t.allocator, source, .{});
        defer tree.deinit();
        var result = try plan.build(t.allocator, &tree, opts);
        defer result.deinit();
        try t.expect(result.ready());
        try t.expectEqualStrings(source, result.source);
        try t.expectEqualStrings(if (std.mem.eql(u8, source, "rm ABC")) "ABC" else if (source[0] == '(') "(" else source, result.requests[0].text);
        if (std.mem.eql(u8, source, "rm ABC")) try t.expect(!result.requests[0].style.italic);
        if (std.mem.eql(u8, source, "abc")) try t.expect(result.requests[0].style.italic);
    }
    var tree = try parser.parse(t.allocator, "abcdefghij", .{});
    defer tree.deinit();
    var result = try plan.build(t.allocator, &tree, opts);
    defer result.deinit();
    try t.expect(!result.ready());
    try t.expectEqualStrings("abcdefghij", result.requests[0].text);
    try t.expectEqual(.unresolved_identifier, result.blockers[0].kind);
}

test "equation measurement plan diagnostics retain exact command source spans after tree release" {
    var tree = try parser.parse(t.allocator, "한글 + LEFT x + RIGHT x + sum _{i=1} ^n + bar", .{});
    var result = plan.build(t.allocator, &tree, opts) catch |err| {
        tree.deinit();
        return err;
    };
    defer result.deinit();
    tree.deinit();
    const names = [_][]const u8{ "LEFT", "RIGHT", "bar" };
    const families = [_]@import("commands.zig").Family{ .left_delimiter, .right_delimiter, .decoration };
    try t.expectEqual(names.len, result.blockers.len);
    for (result.blockers, names, families) |blocker, name, family| {
        try t.expectEqual(.unsupported_command, blocker.kind);
        try t.expectEqual(family, blocker.command_family.?);
        try t.expectEqualStrings(name, result.source[blocker.source_start.?..blocker.source_end.?]);
    }
}
