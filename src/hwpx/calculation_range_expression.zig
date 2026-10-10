//! Range aggregate syntax. Does not resolve cells, format results, or write XML.
const std = @import("std");
const references = @import("calculation_cell_reference.zig");
pub const Operation = enum { sum, average };
pub const Expression = struct { operation: Operation, range: references.Range };

pub fn parse(source: []const u8) !Expression {
    if (source.len > 1024) return error.LimitExceeded;
    var text = std.mem.trim(u8, source, " \t\r\n");
    if (text.len == 0) return error.InvalidCalculationExpression;
    if (text[0] == '=' or text[0] == '@') text = std.mem.trim(u8, text[1..], " \t\r\n");
    const open = std.mem.indexOfScalar(u8, text, '(') orelse return error.InvalidCalculationExpression;
    const name = std.mem.trim(u8, text[0..open], " \t\r\n");
    const operation: Operation = if (std.ascii.eqlIgnoreCase(name, "SUM")) .sum else if (std.ascii.eqlIgnoreCase(name, "AVG")) .average else return error.UnsupportedCalculationFunction;
    if (text.len <= open + 2 or text[text.len - 1] != ')') return error.InvalidCalculationExpression;
    const argument = std.mem.trim(u8, text[open + 1 .. text.len - 1], " \t\r\n");
    if (std.mem.indexOfAny(u8, argument, "(),+-*/") != null) return error.UnsupportedCalculationExpression;
    return .{ .operation = operation, .range = try references.parseRange(argument) };
}

test "HWPX calculation range expression parses actual functions without guessing richer syntax" {
    const horizontal = try parse("=SUM(B?:E?)");
    try std.testing.expectEqual(Operation.sum, horizontal.operation);
    try std.testing.expectEqualDeep(try references.parseRange("B?:E?"), horizontal.range);
    try std.testing.expectEqual(Operation.average, (try parse(" @ avg ( B? : E? ) ")).operation);
    try std.testing.expectEqualDeep(try references.parseRange("?2:?4"), (try parse("=SUM(?2:?4)")).range);
    const single = try parse("sum(a1)");
    try std.testing.expectEqualDeep(single.range.first, single.range.last);
    for ([_][]const u8{ "", "SUM", "SUM()", "SUM(A1", "SUM(A1))", "SUM(A1)tail", "=SUM(A1:B2:C3)" }) |text| {
        if (std.mem.eql(u8, text, "SUM(A1))")) {
            try std.testing.expectError(error.UnsupportedCalculationExpression, parse(text));
        } else if (std.mem.eql(u8, text, "=SUM(A1:B2:C3)")) {
            try std.testing.expectError(error.InvalidCalculationCellReference, parse(text));
        } else try std.testing.expectError(error.InvalidCalculationExpression, parse(text));
    }
    try std.testing.expectError(error.UnsupportedCalculationFunction, parse("MAX(A1:A2)"));
    for ([_][]const u8{ "SUM(A1,B2)", "AVG(SUM(A1:A2))", "SUM(A1+3)" }) |text| try std.testing.expectError(error.UnsupportedCalculationExpression, parse(text));
    var oversized: [1025]u8 = @splat(' ');
    try std.testing.expectError(error.LimitExceeded, parse(&oversized));
}
