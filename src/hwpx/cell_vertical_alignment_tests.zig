const std = @import("std");
const plan = @import("cell_vertical_alignment_plan.zig");
const alignment = @import("../model/cell_vertical_alignment.zig");
const ticket: @import("../model/history_mutation_epoch.zig").Ticket = .{ .binding = .{ .document = 1, .generation = 1, .owner = 1 }, .epoch = 1 };
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc protect='0' opaque='keep'><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='1000' height='4000'/>";
const suffix = " x:vertAlign='FUTURE' textDirection='HORIZONTAL'><p:p><p:run><p:t>cell A</p:t></p:run></p:p></p:subList></p:tc><p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='2000' height='4000'/><p:subList vertAlign='BOTTOM'><p:p><p:run><p:t>cell B</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></s:sec>";
fn input(a: std.mem.Allocator, attrs: []const u8) ![]u8 {
    return std.fmt.allocPrint(a, "{s}<p:subList{s}{s}", .{ prefix, attrs, suffix });
}
fn template(tree: *const @import("xml_part_tree.zig").Tree) !usize {
    for (tree.elements, 0..) |e, i| if (e.is(@import("document_xml.zig").paragraph_uri, "p")) return i;
    return error.MissingOwnCellParagraph;
}
test "original cell vertical HX all explicit values preserve lexical styles text and other cell" {
    const a = std.testing.allocator;
    for (std.enums.values(alignment.Alignment)) |value| {
        const raw = try input(a, " vertAlign = 'TOP'");
        defer a.free(raw);
        var tree = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
        defer tree.deinit(a);
        var before = try plan.observe(a, &tree, try template(&tree), ticket, false);
        defer before.deinit(a);
        const result = try plan.write(a, &tree, .{ .before = before, .value = value }, ticket, false, raw.len + 3);
        if (result) |output| {
            defer a.free(output);
            const old = " vertAlign = 'TOP'";
            const new = try std.fmt.allocPrint(a, " vertAlign = '{s}'", .{alignment.text(value)});
            defer a.free(new);
            const expected = try std.mem.replaceOwned(u8, a, raw, old, new);
            defer a.free(expected);
            try std.testing.expectEqualSlices(u8, expected, output);
        } else try std.testing.expectEqual(alignment.Alignment.top, value);
        try std.testing.expectEqualStrings(raw, tree.source);
    }
}
test "original cell vertical HX missing entity and unknown source values remain distinct" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "", " vertAlign='C&#69;NTER'", " vertAlign='FUTURE'" }) |attrs| {
        const raw = try input(a, attrs);
        defer a.free(raw);
        var tree = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
        defer tree.deinit(a);
        var before = try plan.observe(a, &tree, try template(&tree), ticket, false);
        defer before.deinit(a);
        if (attrs.len == 0) {
            try std.testing.expect(before.raw == null and before.value == null);
            const output = (try plan.write(a, &tree, .{ .before = before, .value = .top }, ticket, false, raw.len + 20)).?;
            defer a.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "vertAlign=\"TOP\"") != null);
        } else if (before.value != null and before.value.? == .center) {
            try std.testing.expectEqual(@as(?[]u8, null), try plan.write(a, &tree, .{ .before = before, .value = .center }, ticket, false, raw.len));
        } else {
            try std.testing.expectEqualStrings("FUTURE", before.raw.?);
            try std.testing.expectError(error.UnsupportedCellVerticalAlignment, plan.write(a, &tree, .{ .before = before, .value = .top }, ticket, false, raw.len));
        }
        try std.testing.expectEqualStrings(raw, tree.source);
    }
}
test "original cell vertical HX stale source ticket owner and read only refuse unchanged" {
    const a = std.testing.allocator;
    const raw = try input(a, " vertAlign='TOP'");
    defer a.free(raw);
    var tree = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
    defer tree.deinit(a);
    var before = try plan.observe(a, &tree, try template(&tree), ticket, false);
    defer before.deinit(a);
    var foreign = ticket;
    foreign.epoch += 1;
    try std.testing.expectError(error.StaleCellVerticalAlignment, plan.write(a, &tree, .{ .before = before, .value = .bottom }, foreign, false, raw.len + 3));
    var stale = before;
    stale.source_sha256[0] ^= 1;
    try std.testing.expectError(error.StaleCellVerticalAlignment, plan.write(a, &tree, .{ .before = stale, .value = .bottom }, ticket, false, raw.len + 3));
    stale = before;
    stale.cell_node += 1;
    try std.testing.expectError(error.StaleCellVerticalAlignment, plan.write(a, &tree, .{ .before = stale, .value = .bottom }, ticket, false, raw.len + 3));
    stale = before;
    stale.read_only = true;
    try std.testing.expectError(error.CellVerticalAlignmentReadOnly, plan.write(a, &tree, .{ .before = stale, .value = .bottom }, ticket, true, raw.len + 3));
    try std.testing.expectEqualStrings(raw, tree.source);
}
test "original cell vertical HX protected cell and noncell physical owner remain closed" {
    const a = std.testing.allocator;
    const plain = try input(a, " vertAlign='TOP'");
    defer a.free(plain);
    const raw = try std.mem.replaceOwned(u8, a, plain, "protect='0'", "protect='1'");
    defer a.free(raw);
    var tree = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
    defer tree.deinit(a);
    var before = try plan.observe(a, &tree, try template(&tree), ticket, false);
    defer before.deinit(a);
    try std.testing.expect(before.read_only);
    try std.testing.expectError(error.CellVerticalAlignmentReadOnly, plan.write(a, &tree, .{ .before = before, .value = .bottom }, ticket, false, raw.len + 3));
    try std.testing.expectError(error.InvalidCellParagraphTemplate, plan.observe(a, &tree, 0, ticket, false));
}
test "original cell vertical HX exact plus one output budget and allocation failures preserve raw" {
    const a = std.testing.allocator;
    const raw = try input(a, " vertAlign='TOP'");
    defer a.free(raw);
    var tree = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
    defer tree.deinit(a);
    var before = try plan.observe(a, &tree, try template(&tree), ticket, false);
    defer before.deinit(a);
    const output = (try plan.write(a, &tree, .{ .before = before, .value = .center }, ticket, false, raw.len + 3)).?;
    defer a.free(output);
    try std.testing.expectEqual(raw.len + 3, output.len);
    try std.testing.expectError(error.LimitExceeded, plan.write(a, &tree, .{ .before = before, .value = .center }, ticket, false, output.len - 1));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree, witness: plan.Observation, expected: []const u8) !void {
            const actual = (try plan.write(allocator, source, .{ .before = witness, .value = .center }, ticket, false, expected.len)).?;
            defer allocator.free(actual);
            try std.testing.expectEqualSlices(u8, expected, actual);
        }
    }.run, .{ &tree, before, output });
    try std.testing.expectEqualStrings(raw, tree.source);
}

test "original cell vertical HX identical XML in another section does not retarget witness" {
    const a = std.testing.allocator;
    const raw = try input(a, " vertAlign='TOP'");
    defer a.free(raw);
    var first = try @import("section_tree.zig").parse(a, raw, 0, 0, .{});
    defer first.deinit(a);
    var second = try @import("section_tree.zig").parse(a, raw, 1, 1, .{});
    defer second.deinit(a);
    var before = try plan.observe(a, &first, try template(&first), ticket, false);
    defer before.deinit(a);
    try std.testing.expectError(error.StaleCellVerticalAlignment, plan.write(a, &second, .{ .before = before, .value = .center }, ticket, false, raw.len + 3));
}
