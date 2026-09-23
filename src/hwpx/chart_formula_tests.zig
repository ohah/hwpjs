const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");
const formula = @import("chart_formula.zig");

const prefix = "<c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\">";
const suffix = "</c:chartSpace>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: formula.Options) !formula.Report {
    var report: formula.Report = .{};
    var scanner: formula.Scanner = .{ .allocator = a, .options = options, .report = &report };
    const Context = struct {
        fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
            const value: *formula.Scanner = @ptrCast(@alignCast(raw));
            try value.onTag(tag, scope, depth);
        }
        fn onContent(raw: *anyopaque, value: xml.text_content.View, depth: usize) anyerror!void {
            const self: *formula.Scanner = @ptrCast(@alignCast(raw));
            try self.onContent(value, depth);
        }
    };
    _ = try document_xml.visitBytes(a, source, source.len, .{}, .{ .context = &scanner, .on_tag = Context.onTag, .on_content = Context.onContent });
    return report;
}

test "HWPX chart formulas count numeric and string references with matching caches" {
    const source = prefix ++
        "<c:numRef><c:f>Sheet1!$A$1:$A$2</c:f><c:numCache><c:ptCount val=\"0\"/></c:numCache></c:numRef>" ++
        "<c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val=\"0\"/></c:strCache></c:strRef>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.numeric_references);
    try std.testing.expectEqual(@as(usize, 1), report.string_references);
    try std.testing.expectEqual(@as(usize, 2), report.formulas);
    try std.testing.expectEqual(@as(usize, 2), report.attached_caches);
    try std.testing.expectEqual(@as(usize, 0), report.issues());
}

test "HWPX chart formulas allow an omitted optional cache" {
    const source = prefix ++ "<c:numRef><c:f>Sheet1!$A$1</c:f></c:numRef>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.numeric_references);
    try std.testing.expectEqual(@as(usize, 1), report.references_without_cache);
    try std.testing.expectEqual(@as(usize, 0), report.issues());
}

test "HWPX chart formulas report missing duplicate wrong-cache and nested-leaf structures" {
    const source = prefix ++
        "<c:numRef><c:numCache/><c:strCache/></c:numRef>" ++
        "<c:strRef><c:f><c:bogus/></c:f><c:f/><c:numCache/></c:strRef>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.missing_formula);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_formula);
    try std.testing.expectEqual(@as(usize, 1), report.duplicate_cache);
    try std.testing.expectEqual(@as(usize, 2), report.wrong_cache_kind);
    try std.testing.expectEqual(@as(usize, 1), report.nested_formula_element);
    try std.testing.expectEqual(@as(usize, 6), report.issues());
}

test "HWPX chart formulas reject nested references and enforce a shared exact budget" {
    try std.testing.expectError(error.NestedChartReference, inspect(std.testing.allocator, prefix ++ "<c:numRef><c:strRef/></c:numRef>" ++ suffix, .{}));
    const one = prefix ++ "<c:numRef><c:f>x</c:f></c:numRef>" ++ suffix;
    const report = try inspect(std.testing.allocator, one, .{ .max_references = 1 });
    try std.testing.expectEqual(@as(usize, 1), report.references());
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, one, .{ .max_references = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, prefix ++ "<c:numRef/><c:strRef/>" ++ suffix, .{ .max_references = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, prefix ++ "<c:multiLvlStrRef/><c:numRef/>" ++ suffix, .{ .max_references = 1 }));
}

test "HWPX chart formulas expose unsupported multilevel and misplaced reference children" {
    const source = prefix ++
        "<c:multiLvlStrRef><c:f>Sheet1!$A$1</c:f><c:numRef/></c:multiLvlStrRef>" ++
        "<c:numRef><c:numCache/><c:f>Sheet1!$B$1</c:f><c:numLit/></c:numRef>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.unsupported_multilevel_references);
    try std.testing.expectEqual(@as(usize, 1), report.numeric_references);
    try std.testing.expectEqual(@as(usize, 1), report.formula_after_cache);
    try std.testing.expectEqual(@as(usize, 1), report.unexpected_data_container);
    try std.testing.expectEqual(@as(usize, 3), report.issues());
}

test "HWPX chart formulas ignore lookalike namespaces and out-of-reference formulas" {
    const source = prefix ++ "<x:numRef xmlns:x=\"urn:other\"><x:f>x</x:f></x:numRef><c:f>other context</c:f>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 0), report.references());
    try std.testing.expectEqual(@as(usize, 0), report.formulas);
}

test "HWPX chart formulas recognize remapped namespace prefixes" {
    const source = "<c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\" xmlns:z=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"><z:strRef><z:f>A1</z:f><z:strCache/></z:strRef></c:chartSpace>";
    const report = try inspect(std.testing.allocator, source, .{});
    try std.testing.expectEqual(@as(usize, 1), report.string_references);
    try std.testing.expectEqual(@as(usize, 1), report.attached_caches);
    try std.testing.expectEqual(@as(usize, 0), report.issues());
}

test "HWPX chart formula text counts decoded bytes and enforces exact budgets" {
    const source = prefix ++
        "<c:numRef><c:f>A&amp;<![CDATA[B]]></c:f></c:numRef>" ++
        "<c:strRef><c:f/></c:strRef>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{ .max_formula_bytes = 3, .max_total_formula_bytes = 3 });
    try std.testing.expectEqual(@as(usize, 3), report.formula_text_bytes);
    try std.testing.expectEqual(@as(usize, 3), report.max_observed_formula_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.empty_formulas);
    try std.testing.expectEqual(@as(usize, 0), report.issues());
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, source, .{ .max_formula_bytes = 2 }));
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, source, .{ .max_total_formula_bytes = 2 }));
}

test "HWPX chart formula visitor releases all allocations on failure" {
    const source = prefix ++ "<c:numRef><c:f>Sheet1!$A$1</c:f><c:numCache/></c:numRef>" ++ suffix;
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            _ = try inspect(a, bytes, .{});
        }
    }.run, .{source});
}
