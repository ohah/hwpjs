//! Declared synthetic Native tests. Do not execute before Main's frozen slot.
const std = @import("std");
const insert = @import("inline_object_insert.zig");
const trees = @import("xml_part_tree.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";
const body = "<p:p><p:run><p:t>body</p:t></p:run></p:p>";
const cell_xml = "<p:p><p:run><p:tbl rowCnt='1' colCnt='1' lock='0'><p:tr><p:tc protect='0'><p:subList><p:p><p:run><p:t>앞😀뒤</p:t></p:run><p:linesegarray/></p:p></p:subList><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl></p:run></p:p>";

fn laterCell(a: std.mem.Allocator) !void {
    var first = try trees.parse(a, prefix ++ body ++ body ++ suffix, .section, 0, 0, .{});
    defer first.deinit(a);
    var later = try trees.parse(a, prefix ++ cell_xml ++ suffix, .section, 1, 1, .{});
    defer later.deinit(a);
    const target: insert.Target = .{ .section = 1, .paragraph = 4, .unit = 3, .expected_text = "앞😀뒤" };
    var counters: @import("section_text.zig").Report = .{};
    try std.testing.expectEqual(@as(?insert.Binding, null), try insert.bind(a, &first, target, &counters));
    const binding = (try insert.bind(a, &later, target, &counters)).?;
    try std.testing.expectEqual(@as(usize, 2), binding.paragraph_base);
    const output = try insert.writeBound(a, &later, binding, target, "<p:equation/>", 64000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:t>앞😀</p:t><p:equation/><p:t>뒤</p:t>") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:linesegarray/>") == null);
    try std.testing.expectEqualStrings(prefix ++ cell_xml ++ suffix, later.source);
    var wrong = binding;
    wrong.paragraph_base = 0;
    if (insert.writeBound(a, &later, wrong, target, "<p:equation/>", 64000)) |unexpected| {
        a.free(unexpected);
        return error.TestExpectedError;
    } else |err| {
        // The allocation sweep must observe the original injected failure.
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(error.InvalidParagraphIndex, err);
    }
}

test "HWPX inline placement later section cell uses captured global prefix and owns no source bytes" {
    try laterCell(std.testing.allocator);
}

test "HWPX inline placement later section cell allocation failures preserve source" {
    try @import("../testing/allocation_failures.zig").check(laterCell, .{});
}

test "HWPX inline placement rejects locked tables protected cells and opaque physical ancestors" {
    const a = std.testing.allocator;
    for ([_][2][]const u8{ .{ "lock='0'", "lock='1'" }, .{ "protect='0'", "protect='true'" } }) |pair| {
        const input = try std.mem.replaceOwned(u8, a, prefix ++ cell_xml ++ suffix, pair[0], pair[1]);
        defer a.free(input);
        var tree = try trees.parse(a, input, .section, 0, 0, .{});
        defer tree.deinit(a);
        const target: insert.Target = .{ .section = 0, .paragraph = 2, .unit = 0, .expected_text = "앞😀뒤" };
        var counters: @import("section_text.zig").Report = .{};
        const binding = (try insert.bind(a, &tree, target, &counters)).?;
        try std.testing.expectError(error.ProtectedInlineObjectOwner, insert.writeBound(a, &tree, binding, target, "<p:equation/>", 64000));
    }
    var opaque_tree = try trees.parse(a, prefix ++ "<p:opaque>" ++ cell_xml ++ "</p:opaque>" ++ suffix, .section, 0, 0, .{});
    defer opaque_tree.deinit(a);
    for (opaque_tree.elements, 0..) |e, node| {
        if (!e.is(@import("document_xml.zig").paragraph_uri, "p")) continue;
        try std.testing.expectError(error.UnsupportedInlineObjectOwner, @import("inline_object_owner.zig").validate(a, &opaque_tree, node));
    }
}

// Separate source declarations; not included in the retained exact10 grant.
fn selectedFieldScope(a: std.mem.Allocator) !void {
    const input = prefix ++ "<p:p><p:run><p:fieldBegin id='1' type='CLICK_HERE'/><p:fieldEnd beginIDRef='1'/></p:run></p:p>" ++ suffix;
    var tree = try trees.parse(a, input, .section, 7, 7, .{});
    defer tree.deinit(a);
    var report = try @import("field_markers.zig").inspectSection(a, &tree, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 2), report.markers.len);
    for (report.markers) |marker| try std.testing.expectEqual(@as(usize, 7), marker.section_ordinal);
    try std.testing.expectError(error.InvalidPartKind, @import("field_markers.zig").inspect(a, &.{tree}, .{}));
    var invalid = tree;
    invalid.section_ordinal = null;
    try std.testing.expectError(error.InvalidPartKind, @import("field_markers.zig").inspectSection(a, &invalid, .{}));
    invalid = tree;
    invalid.part_kind = .header;
    try std.testing.expectError(error.InvalidPartKind, @import("field_markers.zig").inspectSection(a, &invalid, .{}));
    @import("field_free_section.zig").validate(a, &tree, 64000) catch |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(error.ProtectedFieldRange, err);
        try std.testing.expectEqualStrings(input, tree.source);
        return;
    };
    return error.ExpectedProtectedFieldRange;
}

test "HWPX inline placement selected field scope preserves actual ordinal and strict collection contract" {
    try selectedFieldScope(std.testing.allocator);
    const a = std.testing.allocator;
    const input = prefix ++ "<p:p><p:run><p:fieldBegin id='1' type='CLICK_HERE'/><p:fieldEnd beginIDRef='1'/></p:run></p:p>" ++ suffix;
    var zero = try trees.parse(a, input, .section, 0, 0, .{});
    defer zero.deinit(a);
    var one = try trees.parse(a, input, .section, 1, 1, .{});
    defer one.deinit(a);
    var two = try trees.parse(a, input, .section, 2, 2, .{});
    defer two.deinit(a);
    var header = try trees.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", .header, null, 0, .{});
    defer header.deinit(a);
    const markers = @import("field_markers.zig");
    var whole = try markers.inspect(a, &.{ zero, one }, .{});
    defer whole.deinit();
    try std.testing.expectEqual(@as(usize, 2), whole.sections);
    try std.testing.expectEqual(@as(usize, 4), whole.markers.len);
    for (whole.markers, 0..) |marker, index| try std.testing.expectEqual(index / 2, marker.section_ordinal);
    try std.testing.expectError(error.InvalidPartKind, markers.inspect(a, &.{ zero, zero }, .{}));
    try std.testing.expectError(error.InvalidPartKind, markers.inspect(a, &.{ one, zero }, .{}));
    try std.testing.expectError(error.InvalidPartKind, markers.inspect(a, &.{ zero, two }, .{}));
    try std.testing.expectError(error.InvalidPartKind, markers.inspect(a, &.{ zero, header }, .{}));
    try std.testing.expectError(error.InvalidPartKind, markers.inspectSection(a, &header, .{}));
    for ([_]usize{ 0, 1, 7 }) |ordinal| {
        var tree = try trees.parse(std.testing.allocator, prefix ++ body ++ suffix, .section, ordinal, ordinal, .{});
        defer tree.deinit(std.testing.allocator);
        try @import("field_free_section.zig").validate(std.testing.allocator, &tree, 64000);
    }
}

test "HWPX inline placement selected section field protection allocation failures preserve source" {
    try @import("../testing/allocation_failures.zig").check(selectedFieldScope, .{});
}
