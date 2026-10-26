const std = @import("std");
const t = std.testing;
const parser = @import("parser.zig");
const options: parser.Options = .{ .delimiter_policy = .preserve_with_diagnostics };

test "equation delimiter recovery preserves exact source explicit unmatched tokens and open groups" {
    const input = "} {한😀";
    var tree = try parser.parse(t.allocator, input, options);
    defer tree.deinit();
    try t.expectEqualStrings(input, tree.source);
    try t.expectEqual(@as(usize, 2), tree.diagnostics.len);
    try t.expectEqual(.unexpected_closing_brace, tree.diagnostics[0].kind);
    try t.expectEqual(@as(usize, 0), tree.diagnostics[0].offset);
    try t.expectEqual(.missing_closing_brace, tree.diagnostics[1].kind);
    try t.expectEqual(@as(usize, 2), tree.diagnostics[1].offset);
    var unmatched: usize = 0;
    var unclosed: usize = 0;
    for (tree.nodes) |node| switch (node.data) {
        .unmatched_delimiter => |token| {
            unmatched += 1;
            try t.expectEqualStrings("}", token.value);
            try t.expectEqualStrings("}", tree.source[node.start..node.end]);
        },
        .group => |group| {
            if (!group.closed) {
                unclosed += 1;
                try t.expectEqual(input.len, node.end);
            }
        },
        else => {},
    };
    try t.expectEqual(@as(usize, 1), unmatched);
    try t.expectEqual(@as(usize, 1), unclosed);
    try t.expectError(error.UnexpectedEquationDelimiter, parser.parse(t.allocator, input, .{}));
    try t.expectError(error.UnclosedEquationGroup, parser.parse(t.allocator, "{rm", .{}));
    var clean = try parser.parse(t.allocator, "{x} over {y}", options);
    defer clean.deinit();
    try t.expectEqual(@as(usize, 0), clean.diagnostics.len);
}

test "equation delimiter recovery bounds diagnostics and never recovers unrelated errors" {
    var nested = try parser.parse(t.allocator, "{{x", options);
    defer nested.deinit();
    try t.expectEqual(@as(usize, 2), nested.diagnostics.len);
    try t.expectEqual(@as(usize, 1), nested.diagnostics[0].offset);
    try t.expectEqual(@as(usize, 0), nested.diagnostics[1].offset);
    try t.expectError(error.EquationDiagnosticLimitExceeded, parser.parse(t.allocator, "}}", .{ .delimiter_policy = .preserve_with_diagnostics, .max_diagnostics = 1 }));
    try t.expectError(error.EquationDiagnosticLimitExceeded, parser.parse(t.allocator, "{x", .{ .delimiter_policy = .preserve_with_diagnostics, .max_diagnostics = 0 }));
    try t.expectError(error.UnclosedEquationQuote, parser.parse(t.allocator, "\"x", options));
    try t.expectError(error.MissingEquationOperand, parser.parse(t.allocator, "x^}", options));
    try t.expectError(error.DuplicateEquationScript, parser.parse(t.allocator, "x^1^2", options));
    try t.expectError(error.EquationDepthLimitExceeded, parser.parse(t.allocator, @import("../testing/repeated_bytes.zig").repeat("{", 80) ++ "x", options));
}

fn allocationCase(a: std.mem.Allocator, max_diagnostics: usize) !void {
    var tree = parser.parse(a, "} {x", .{ .delimiter_policy = .preserve_with_diagnostics, .max_diagnostics = max_diagnostics }) catch |err| {
        if (max_diagnostics == 1 and err == error.EquationDiagnosticLimitExceeded) return;
        return err;
    };
    defer tree.deinit();
    try t.expectEqual(@as(usize, 2), tree.diagnostics.len);
    if (max_diagnostics == 1) return error.ExpectedDiagnosticLimit;
}

test "equation delimiter recovery frees diagnostic and node arenas under all allocation failures" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{2});
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{1});
}
