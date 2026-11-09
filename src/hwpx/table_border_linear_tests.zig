//! Synthetic DTO/error/ownership checks; no repository fixture dependency.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const borders = @import("border_fill_source.zig");
const tables = @import("table_border_sources.zig");
const editor = @import("editor_session.zig");
const headers = @import("header_read_context.zig");
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:future' secCnt='1'><h:refList><h:borderFills>";
const suffix = "</h:borderFills></h:refList></h:head>";
const section_prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const section = section_prefix ++ "<p:p><p:run><p:tbl><p:tr><p:tc borderFillIDRef='9'><p:subList><p:p><p:run><p:t>abc</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p></s:sec>";
const style = "<h:borderFill id='9' threeD='future' shadow='' centerLine='&#x31;' breakCellSeparateLine='opaque' mystery='x' x:shadow='foreign'>" ++
    "<h:leftBorder type='FUTURE &amp; X' width='' color='raw' mystery='v' x:color='foreign'/>" ++
    "<h:diagonal color=''/><h:slash type='opaque' Crooked='0' isCounter='raw'/>" ++
    "<h:backSlash type='' Crooked='future' isCounter='0'/><x:extension/></h:borderFill>";

fn header(allocator: std.mem.Allocator, body: []const u8) !@import("xml_part_tree.zig").Tree {
    const xml = try std.mem.concat(allocator, u8, &.{ prefix, body, suffix });
    defer allocator.free(xml);
    return @import("header_tree.zig").parse(allocator, xml, 0, .{});
}
fn fixture(body: []const u8) ![]u8 {
    const xml = try std.mem.concat(a, u8, &.{ prefix, body, suffix });
    defer a.free(xml);
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, section, xml);
}
fn encoded(report: *const tables.Report) ![]u8 {
    return std.json.Stringify.valueAlloc(a, report.*, .{});
}

test "table border linear selected tags preserve absent empty opaque namespace and unknown values" {
    var tree = try header(a, style);
    defer tree.deinit(a);
    var value = try borders.read(a, &tree, 9);
    defer value.deinit();
    try t.expectEqual(@as(usize, 4), value.unknown_attributes);
    try t.expectEqual(@as(usize, 1), value.unknown_children);
    try t.expectEqualStrings("future", value.three_d.?);
    try t.expectEqualStrings("", value.shadow.?);
    try t.expectEqualStrings("1", value.center_line.?);
    try t.expectEqualStrings("opaque", value.break_cell_separate_line.?);
    try t.expectEqualStrings("FUTURE & X", value.edges[0].?.style.?);
    try t.expectEqualStrings("", value.edges[0].?.width.?);
    try t.expectEqualStrings("raw", value.edges[0].?.color.?);
    try t.expect(value.edges[1] == null);
    try t.expect(value.diagonal.?.style == null);
    try t.expectEqualStrings("", value.diagonal.?.color.?);
    try t.expectEqualStrings("opaque", value.slash.?);
    try t.expectEqualStrings("0", value.slash_crooked.?);
    try t.expectEqualStrings("raw", value.slash_is_counter.?);
    try t.expectEqualStrings("", value.back_slash.?);
    try t.expectEqualStrings("future", value.back_slash_crooked.?);
    var second = try borders.read(a, &tree, 9);
    defer second.deinit();
    try t.expect(value.edges[0].?.style.?.ptr != second.edges[0].?.style.?.ptr);
    @constCast(value.edges[0].?.style.?)[0] = 'X';
    try t.expectEqualStrings("FUTURE & X", second.edges[0].?.style.?);
}

test "table border linear named values fail before later fields and duplicate children" {
    const long = try a.alloc(u8, 4097);
    defer a.free(long);
    @memset(long, 'x');
    for ([_][]const u8{ "threeD", "shadow", "centerLine", "breakCellSeparateLine" }) |name| {
        const body = try std.mem.concat(a, u8, &.{ "<h:borderFill id='9' ", name, "='", long, "'><h:leftBorder/><h:leftBorder/></h:borderFill>" });
        defer a.free(body);
        var tree = try header(a, body);
        defer tree.deinit(a);
        try t.expectError(error.LimitExceeded, borders.read(a, &tree, 9));
    }
    const body = try std.mem.concat(a, u8, &.{ "<h:borderFill id='9' future='", long, "'><h:leftBorder/><h:leftBorder/></h:borderFill>" });
    defer a.free(body);
    var unknown = try header(a, body);
    defer unknown.deinit(a);
    try t.expectError(error.DuplicateBorderFillChild, borders.read(a, &unknown, 9));
    for ([_][]const u8{ "type", "width", "color" }) |name| {
        const edge = try std.mem.concat(a, u8, &.{ "<h:borderFill id='9'><h:leftBorder ", name, "='", long, "'/><h:leftBorder/></h:borderFill>" });
        defer a.free(edge);
        var tree = try header(a, edge);
        defer tree.deinit(a);
        try t.expectError(error.LimitExceeded, borders.read(a, &tree, 9));
    }
}

test "table border linear UTF16 selected attributes match UTF8 owned values" {
    const bytes = try std.mem.concat(a, u8, &.{ prefix, style, suffix });
    defer a.free(bytes);
    var plain = try @import("header_tree.zig").parse(a, bytes, 0, .{});
    defer plain.deinit(a);
    var expected = try borders.read(a, &plain, 9);
    defer expected.deinit();
    const expected_json = try std.json.Stringify.valueAlloc(a, expected, .{});
    defer a.free(expected_json);
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |endian| {
        const wide = try a.alloc(u8, 2 + bytes.len * 2);
        defer a.free(wide);
        std.mem.writeInt(u16, wide[0..2], 0xfeff, endian);
        for (bytes, 0..) |byte, i| std.mem.writeInt(u16, wide[2 + i * 2 ..][0..2], byte, endian);
        var tree = try @import("header_tree.zig").parse(a, wide, 0, .{});
        defer tree.deinit(a);
        var actual = try borders.read(a, &tree, 9);
        defer actual.deinit();
        const actual_json = try std.json.Stringify.valueAlloc(a, actual, .{});
        defer a.free(actual_json);
        try t.expectEqualStrings(expected_json, actual_json);
    }
}

test "table border linear live context reuses original header and keeps DTOs detached" {
    const bytes = try fixture(style);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var expected = try tables.read(a, &session, 0);
    defer expected.deinit(a);
    const expected_json = try encoded(&expected);
    defer a.free(expected_json);
    var context = headers.Context.init(&session);
    var live = true;
    defer if (live) context.deinit();
    session.header_read_context = &context;
    defer session.header_read_context = null;
    var first = try tables.read(a, &session, 0);
    defer first.deinit(a);
    const original = context.original_tree.?.elements.ptr;
    try t.expect(context.current_tree == null);
    var second = try tables.read(a, &session, 0);
    defer second.deinit(a);
    try t.expect(original == context.original_tree.?.elements.ptr);
    try t.expect(first.cells.ptr != second.cells.ptr);
    try t.expect(first.styles[0].edges[0].?.style.?.ptr != second.styles[0].edges[0].?.style.?.ptr);
    var fail = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    try t.expectError(error.OutOfMemory, tables.read(fail.allocator(), &session, 0));
    // A copied Session has no authority to reuse the owner's request slot.
    var copy = session;
    try t.expect(try headers.lookup(&copy) == null);
    var detached = try tables.read(a, &copy, 0);
    defer detached.deinit(a);
    const detached_json = try encoded(&detached);
    defer a.free(detached_json);
    try t.expectEqualStrings(expected_json, detached_json);
    context.deinit();
    live = false;
    session.header_read_context = null;
    const actual_json = try encoded(&second);
    defer a.free(actual_json);
    try t.expectEqualStrings(expected_json, actual_json);
    try t.expectEqualSlices(u8, bytes, session.source);
}

test "table border linear stale cache preserves section cell and provenance error order" {
    const bytes = try fixture(style);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var context = headers.Context.init(&session);
    defer context.deinit();
    session.header_read_context = &context;
    defer session.header_read_context = null;
    session.mutation_serial += 1;
    try t.expectError(error.InvalidSectionIndex, tables.read(a, &session, 1));
    var invalid = try @import("section_tree.zig").parse(a, section_prefix ++ "<p:tc><p:subList/></p:tc></s:sec>", 0, 0, .{});
    defer invalid.deinit(a);
    const original = session.sections[0].tree;
    session.sections[0].tree = invalid;
    defer session.sections[0].tree = original;
    try t.expectError(error.InvalidTableBorderCell, tables.read(a, &session, 0));
    session.sections[0].tree = original;
    try t.expectError(error.StaleHeaderReadContext, tables.read(a, &session, 0));
    // Cell intent validation remains authoritative even when the scope is stale.
    try session.cell_backgrounds.append(a, .{ .section = 99, .table_node = 0, .cell_node = 0, .list_node = 0, .source_id = 9 });
    try t.expectError(error.InvalidSectionIndex, tables.read(a, &session, 0));
}

fn allocationProbe(allocator: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree) !void {
    var value = try borders.read(allocator, tree, 9);
    defer value.deinit();
    try t.expectEqualStrings("FUTURE & X", value.edges[0].?.style.?);
}
test "table border linear selected tag allocation failures release partial owned strings" {
    var tree = try header(a, style);
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(allocationProbe, .{&tree});
}

const Stateless = struct {
    const allocator: std.mem.Allocator = .{ .ptr = undefined, .vtable = &.{ .alloc = alloc, .resize = resize, .remap = remap, .free = free } };
    fn alloc(_: *anyopaque, n: usize, alignment: std.mem.Alignment, ra: usize) ?[*]u8 {
        return a.rawAlloc(n, alignment, ra);
    }
    fn resize(_: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, n: usize, ra: usize) bool {
        return a.rawResize(bytes, alignment, n, ra);
    }
    fn remap(_: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, n: usize, ra: usize) ?[*]u8 {
        return a.rawRemap(bytes, alignment, n, ra);
    }
    fn free(_: *anyopaque, bytes: []u8, alignment: std.mem.Alignment, ra: usize) void {
        a.rawFree(bytes, alignment, ra);
    }
};

test "table border linear unscoped reads do not inspect an unused stateless allocator context" {
    const bytes = try fixture("<h:borderFill id='9'><h:leftBorder type='SOLID' color='#123456'/></h:borderFill>");
    defer a.free(bytes);
    var session = try editor.open(Stateless.allocator, bytes, .{});
    defer session.deinit();
    try t.expect(session.header_read_context == null);
    var report = try tables.read(Stateless.allocator, &session, 0);
    defer report.deinit(Stateless.allocator);
    try t.expectEqual(@as(usize, 1), report.cells.len);
    try t.expectEqual(@as(usize, 1), report.styles.len);
    try t.expectEqualStrings("#123456", report.styles[0].edges[0].?.color.?);
}
