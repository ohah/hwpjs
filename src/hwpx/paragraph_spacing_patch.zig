//! Source-bound line-spacing edits preserve unrelated paragraph XML.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("xml_source_writer.zig");
pub const Spacing = @import("../model/document.zig").ParagraphSpacing;
pub const names = [_][]const u8{ "PERCENT", "FIXED", "BETWEEN_LINES", "AT_LEAST" };
pub fn validate(spacing: Spacing) !void {
    if (spacing.kind >= names.len) return error.InvalidParagraphSpacing;
    if (spacing.kind == 0 and (spacing.value < 0 or spacing.value > 500)) return error.InvalidParagraphSpacing;
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, spacing: Spacing, limit: usize) ![]u8 {
    try validate(spacing);
    _ = try @import("paragraph_display_shape.zig").read(a, tree, node);
    const targets = try @import("paragraph_format_write_targets.zig").find(a, tree, node, "lineSpacing");
    if (targets.len == 0) return error.MissingParagraphSpacing;
    // Percentage is dimensionless in both branches. Absolute unit conversion is separate.
    if (targets.len == 2 and spacing.kind != 0) return error.UnsupportedConditionalParagraphSpacing;
    var replacements: [4]?[]u8 = @splat(null);
    defer for (replacements) |maybe| {
        if (maybe) |bytes| a.free(bytes);
    };
    var changes: [4]writer.Change = undefined;
    const fragment = tree.sourceOf(node);
    const base = @intFromPtr(fragment.ptr);
    for (targets.nodes[0..targets.len], 0..) |index, position| {
        if (spacing.kind != 0) {
            if (try tree.attributeValue(a, index, "", "unit")) |unit| {
                const value = try unit.toUtf8(a, 4096);
                defer a.free(value);
                if (!std.mem.eql(u8, value, "HWPUNIT")) return error.UnsupportedParagraphSpacingUnit;
            }
        }
        const kind = (try tree.attributeValue(a, index, "", "type")) orelse return error.MissingParagraphSpacing;
        const value = (try tree.attributeValue(a, index, "", "value")) orelse return error.MissingParagraphSpacing;
        const kind_text = try std.fmt.allocPrint(a, "{c}{s}{c}", .{ kind.raw[0], names[spacing.kind], kind.raw[0] });
        replacements[position * 2] = kind_text;
        const value_text = try std.fmt.allocPrint(a, "{c}{d}{c}", .{ value.raw[0], spacing.value, value.raw[0] });
        replacements[position * 2 + 1] = value_text;
        changes[position * 2] = .{ .start = @intFromPtr(kind.raw.ptr) - base, .end = @intFromPtr(kind.raw.ptr) - base + kind.raw.len, .text = "", .serialized_xml = kind_text };
        changes[position * 2 + 1] = .{ .start = @intFromPtr(value.raw.ptr) - base, .end = @intFromPtr(value.raw.ptr) - base + value.raw.len, .text = "", .serialized_xml = value_text };
    }
    const active = changes[0 .. targets.len * 2];
    std.mem.sort(writer.Change, active, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, fragment, active, limit);
}

test "HWPX paragraph percent spacing updates both known branches atomically" {
    const a = std.testing.allocator;
    const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><h:paraPr id='26'><p:switch><p:case p:required-namespace='http://www.hancom.co.kr/hwpml/2016/HwpUnitChar'><h:lineSpacing type='PERCENT' value='";
    const middle = "' opaque='140'/></p:case><p:default><!--keep--><h:lineSpacing value='";
    const suffix = "' type='PERCENT' unit='HWPUNIT'/></p:default></p:switch></h:paraPr></h:head>";
    const source = prefix ++ "140" ++ middle ++ "140" ++ suffix;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .header, null, 0, .{});
    defer tree.deinit(a);
    const expected = "<h:paraPr id='26'><p:switch><p:case p:required-namespace='http://www.hancom.co.kr/hwpml/2016/HwpUnitChar'><h:lineSpacing type='PERCENT' value='150' opaque='140'/></p:case><p:default><!--keep--><h:lineSpacing value='150' type='PERCENT' unit='HWPUNIT'/></p:default></p:switch></h:paraPr>";
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree, wanted: []const u8) !void {
            const output = try write(allocator, input, 1, .{ .kind = 0, .value = 150 }, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings(wanted, output);
        }
    }.run, .{ &tree, expected });
    try std.testing.expectError(error.UnsupportedConditionalParagraphSpacing, write(a, &tree, 1, .{ .kind = 1, .value = 720 }, 4096));
    try std.testing.expectEqualStrings(source, tree.source);
    const foreign = try std.mem.replaceOwned(u8, a, source, @import("paragraph_format_write_targets.zig").unit_char_uri, "urn:unknown");
    defer a.free(foreign);
    var foreign_tree = try @import("xml_part_tree.zig").parse(a, foreign, .header, null, 0, .{});
    defer foreign_tree.deinit(a);
    try std.testing.expectError(error.UnsupportedParagraphFormatBranch, write(a, &foreign_tree, 1, .{ .kind = 0, .value = 150 }, 4096));
    const shadow = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><h:paraPr id='1'><h:lineSpacing type='PERCENT' value='140'/><p:switch><p:case p:required-namespace='urn:unknown'><h:lineSpacing type='PERCENT' value='160'/></p:case><p:default/></p:switch></h:paraPr></h:head>";
    var shadow_tree = try @import("xml_part_tree.zig").parse(a, shadow, .header, null, 0, .{});
    defer shadow_tree.deinit(a);
    try std.testing.expectError(error.UnsupportedParagraphFormatBranch, write(a, &shadow_tree, 1, .{ .kind = 0, .value = 150 }, 4096));
}

test "HWPX paragraph spacing patch preserves default unit opaque XML and allocation failures" {
    const a = std.testing.allocator;
    const input = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:paraPr id='9' opaque='keep'><h:lineSpacing value='160' type='PERCENT'/><!--keep--></h:paraPr></h:head>";
    var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 1, .{ .kind = 3, .value = 720 }, 4096);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<h:paraPr id='9' opaque='keep'><h:lineSpacing value='720' type='AT_LEAST'/><!--keep--></h:paraPr>", output);
        }
    }.run, .{&tree});
    try std.testing.expectError(error.InvalidParagraphSpacing, write(a, &tree, 1, .{ .kind = 0, .value = 501 }, 4096));
    try std.testing.expectError(error.InvalidParagraphSpacing, write(a, &tree, 1, .{ .kind = 0, .value = -1 }, 4096));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX paragraph spacing patch distinguishes character unit from schema default and percentage" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "", " unit='HWPUNIT'", " unit='CHAR'", " unit='future'" }) |unit| {
        const input = try std.fmt.allocPrint(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:paraPr id='9'><h:lineSpacing type='PERCENT' value='160'{s}/></h:paraPr></h:head>", .{unit});
        defer a.free(input);
        var tree = try @import("xml_part_tree.zig").parse(a, input, .header, null, 0, .{});
        defer tree.deinit(a);
        for ([_]i32{ 0, 500 }) |value| {
            const output = try write(a, &tree, 1, .{ .kind = 0, .value = value }, 4096);
            defer a.free(output);
            if (unit.len != 0) try std.testing.expect(std.mem.indexOf(u8, output, unit) != null);
        }
        if (std.mem.eql(u8, unit, " unit='CHAR'") or std.mem.eql(u8, unit, " unit='future'")) {
            try std.testing.expectError(error.UnsupportedParagraphSpacingUnit, write(a, &tree, 1, .{ .kind = 1, .value = 720 }, 4096));
        } else {
            const output = try write(a, &tree, 1, .{ .kind = 1, .value = 720 }, 4096);
            defer a.free(output);
            if (unit.len == 0) try std.testing.expect(std.mem.indexOf(u8, output, " unit=") == null);
        }
        try std.testing.expectEqualStrings(input, tree.source);
    }
}
