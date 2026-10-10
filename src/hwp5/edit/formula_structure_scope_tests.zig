const std = @import("std");
const scope = @import("formula_structure_scope.zig");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;

test "formula structure scope protects dependencies and validates generated provenance with bounded work" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const version = source.header.version();
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    const label = document.sections[0].paragraphs[12];
    try scope.validate(a, raw, version, label);
    try std.testing.expectError(error.LimitExceeded, scope.validateLimited(a, raw, version, label, 0));
    try std.testing.expectError(error.LimitExceeded, scope.validateLimited(a, raw, version, label, 1));
    try std.testing.expectError(error.UnsupportedStructuralControl, scope.validate(a, raw, version, document.sections[0].paragraphs[19]));
    try std.testing.expectError(error.UnsupportedStructuralControl, scope.validate(a, raw, version, document.sections[0].paragraphs[23]));
    var continuation = label;
    continuation.header_template = label.source_node;
    continuation.source_node = null;
    try scope.validate(a, raw, version, continuation);
    continuation.header_template = document.sections[0].paragraphs[19].source_node;
    try std.testing.expectError(error.UnsupportedStructuralControl, scope.validate(a, raw, version, continuation));
    continuation.header_template = null;
    try std.testing.expectError(error.MissingParagraphTemplate, scope.validate(a, raw, version, continuation));
    continuation.header_template = std.math.maxInt(u32);
    try std.testing.expectError(error.SourceBindingMismatch, scope.validate(a, raw, version, continuation));
    continuation.header_template = label.source_node;
    continuation.parent_node = std.math.maxInt(u32);
    try std.testing.expectError(error.SourceBindingMismatch, scope.validate(a, raw, version, continuation));
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    const first_row = document.sections[0].paragraphs[13];
    const list = (try @import("paragraph_owner.zig").logicalOwner(tree, groups, first_row.source_node.?)).?;
    const cell = (try tree.nodes[list].record.value.list_header.view(.observed8)).extra;
    const cell_offset = @intFromPtr(cell.ptr) - @intFromPtr(raw.ptr);
    for ([_]u16{ 0, 2, std.math.maxInt(u16) }) |span| {
        const changed = try a.dupe(u8, raw);
        defer a.free(changed);
        // Table 80: row span follows column, row and column span (three u16s).
        std.mem.writeInt(u16, changed[cell_offset + 6 ..][0..2], span, .little);
        try std.testing.expectError(if (span == 2) error.UnsupportedStructuralControl else error.InvalidCellSpan, scope.validate(a, changed, version, first_row));
    }
    var expression: ?[]const u8 = null;
    for (tree.nodes) |node| {
        if (node.record.value != .control_header) continue;
        const header = node.record.value.control_header;
        if (header.id != @import("../body/control_rules.zig").id("%fmu")) continue;
        expression = (try (try @import("../body/field_start.zig").Properties.parse(header.properties)).formulaView()).expression;
        break;
    }
    const original_expression = expression orelse return error.MissingFormulaCell;
    const expression_offset = @intFromPtr(original_expression.ptr) - @intFromPtr(raw.ptr);
    inline for (.{
        .{ "SUM(B1:E1)", error.UnsupportedStructuralControl },
        .{ "SUM(E1:B1)", error.UnsupportedReversedFormulaRange },
        .{ "SUM(B9:E9)", error.FormulaReferenceOutOfBounds },
        .{ "MAX(B1:E1)", error.UnsupportedFormulaExpression },
        .{ "SUM(B0:E0)", error.InvalidFormulaReference },
    }) |mutation| {
        const wire = try std.unicode.utf8ToUtf16LeAlloc(a, mutation[0]);
        defer a.free(wire);
        const replacement = std.mem.sliceAsBytes(wire);
        try std.testing.expectEqual(original_expression.len, replacement.len);
        const changed = try a.dupe(u8, raw);
        defer a.free(changed);
        @memcpy(changed[expression_offset..][0..replacement.len], replacement);
        try std.testing.expectError(mutation[1], scope.validate(a, changed, version, first_row));
    }
    try scope.validate(a, raw, version, first_row);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, v: Version, p: model.Paragraph) !void {
            try scope.validate(allocator, bytes, v, p);
        }
    }.run, .{ raw, version, label });
}
