const std = @import("std");
const t = std.testing;
const batch = @import("table_border_sources_batch.zig");
const single = @import("table_border_sources.zig");
const editor = @import("editor_session.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";

fn compare(a: std.mem.Allocator, session: *const editor.Session, report: *const batch.Report) !void {
    for (report.entries) |entry| {
        var expected = single.read(a, session, entry.section) catch |err| {
            try t.expectEqual(err, entry.result.unavailable);
            continue;
        };
        defer expected.deinit(a);
        const actual = entry.result.value;
        const left = try std.json.Stringify.valueAlloc(a, expected, .{});
        defer a.free(left);
        const right = try std.json.Stringify.valueAlloc(a, actual, .{});
        defer a.free(right);
        try t.expectEqualStrings(left, right);
    }
}

fn load(path: []const u8) ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, t.allocator, .limited(64_000_000));
}

test "table border source batch allocation failures release partial values and shared header" {
    const bytes = try load("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx");
    defer t.allocator.free(bytes);
    var session = try editor.open(t.allocator, bytes, .{});
    defer session.deinit();
    // Duplicate references and an absent reference, using the fixture's ID 2.
    var good = try @import("section_tree.zig").parse(t.allocator, prefix ++ "<p:tbl><p:tr><p:tc borderFillIDRef='2'><p:subList/></p:tc><p:tc borderFillIDRef='2'><p:subList/></p:tc><p:tc><p:subList/></p:tc></p:tr></p:tbl></s:sec>", 0, 0, .{});
    defer good.deinit(t.allocator);
    var bad = try @import("section_tree.zig").parse(t.allocator, prefix ++ "<p:tc><p:subList/></p:tc></s:sec>", 0, 0, .{});
    defer bad.deinit(t.allocator);
    // Replace only the borrowed view, never install these trees in the owner.
    var sections = [_]editor.Section{ session.sections[0], session.sections[0] };
    sections[0].tree = good;
    sections[1].tree = bad;
    var view = session;
    view.sections = &sections;
    // Use the fixture's real header ID so a successful value owns style strings.
    var doc = try @import("package.zig").inspectDocument(t.allocator, bytes, .{});
    defer doc.deinit(t.allocator);
    var head = try doc.readHeaderTree(t.allocator, .{});
    defer head.deinit(t.allocator);
    var control = try single.readTrees(t.allocator, &good, &head);
    defer control.deinit(t.allocator);
    try t.expectEqual(@as(usize, 1), control.styles.len);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, source: *const editor.Session) !void {
            var result = try batch.read(a, source, &.{ 0, 1, 2, 0 });
            defer result.deinit(a);
            try t.expectEqual(@as(usize, 3), result.entries[0].result.value.cells.len);
            try t.expectEqual(error.InvalidTableBorderCell, result.entries[1].result.unavailable);
            try t.expectEqual(error.InvalidSectionIndex, result.entries[2].result.unavailable);
            try t.expectEqual(@as(usize, 1), result.entries[3].result.value.styles.len);
        }
    }.run, .{&view});
    var result = try batch.read(t.allocator, &view, &.{ 0, 1, 2, 0 });
    defer result.deinit(t.allocator);
    try compare(t.allocator, &view, &result);
    try t.expectEqualSlices(u8, bytes, session.source);
}

test "table border source batch empty ranges shared failure and detached lifetime" {
    const bytes = try load("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx");
    defer t.allocator.free(bytes);
    var session = try editor.open(t.allocator, bytes, .{});
    var alive = true;
    defer if (alive) session.deinit();
    var view = session;
    view.source = @constCast("broken ZIP");
    var empty = try batch.read(t.allocator, &view, &.{});
    defer empty.deinit(t.allocator);
    try t.expectEqual(@as(usize, 0), empty.entries.len);
    var invalid = try batch.read(t.allocator, &view, &.{ session.sections.len, std.math.maxInt(usize) });
    defer invalid.deinit(t.allocator);
    for (invalid.entries) |entry| try t.expectEqual(error.InvalidSectionIndex, entry.result.unavailable);
    var broken = try batch.read(t.allocator, &view, &.{ 0, session.sections.len, 0 });
    defer broken.deinit(t.allocator);
    try compare(t.allocator, &view, &broken);
    var owned = try batch.read(t.allocator, &session, &.{ 0, 0 });
    defer owned.deinit(t.allocator);
    const before = try std.json.Stringify.valueAlloc(t.allocator, owned, .{});
    defer t.allocator.free(before);
    session.deinit();
    alive = false;
    const after = try std.json.Stringify.valueAlloc(t.allocator, owned, .{});
    defer t.allocator.free(after);
    try t.expectEqualStrings(before, after);
}

test "table border source batch sparse duplicate missing IDs and invalid lists isolate errors" {
    const bytes = try load("legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx");
    defer t.allocator.free(bytes);
    var session = try editor.open(t.allocator, bytes, .{});
    defer session.deinit();
    var archive = try @import("../zip/archive.zig").open(t.allocator, bytes, .{});
    defer archive.deinit();
    var header_index: ?usize = null;
    for (archive.entries, 0..) |entry, i| if (std.mem.eql(u8, entry.name, "Contents/header.xml")) {
        header_index = i;
    };
    const head_prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:borderFills>";
    const head_suffix = "</h:borderFills></h:refList></h:head>";
    inline for (.{
        .{ "<h:borderFill id='0'/><h:borderFill id='4095'><h:leftBorder type='SOLID' color='#123456'/></h:borderFill>", @as(?anyerror, null) },
        .{ "<h:borderFill id='0'/><h:borderFill id='4095'/><h:borderFill id='4095'/>", @as(?anyerror, error.DuplicateBorderFillId) },
        .{ "<h:borderFill id='0'/>", @as(?anyerror, error.MissingBorderFillId) },
    }) |case| {
        const source = try @import("../zip/replace_writer.zig").write(t.allocator, bytes, &.{.{ .entry_index = header_index.?, .bytes = head_prefix ++ case[0] ++ head_suffix }}, .{});
        defer t.allocator.free(source);
        var zero = try @import("section_tree.zig").parse(t.allocator, prefix ++ "<p:tbl><p:tr><p:tc borderFillIDRef='0'><p:subList/></p:tc></p:tr></p:tbl></s:sec>", 0, 0, .{});
        defer zero.deinit(t.allocator);
        var sparse = try @import("section_tree.zig").parse(t.allocator, prefix ++ "<p:tbl><p:tr><p:tc borderFillIDRef='4095'><p:subList/></p:tc><p:tc borderFillIDRef='4095'><p:subList/></p:tc><p:tc><p:subList/></p:tc></p:tr></p:tbl></s:sec>", 0, 0, .{});
        defer sparse.deinit(t.allocator);
        var bad = try @import("section_tree.zig").parse(t.allocator, prefix ++ "<p:tbl><p:tr><p:tc><p:subList/><p:subList/></p:tc></p:tr></p:tbl></s:sec>", 0, 0, .{});
        defer bad.deinit(t.allocator);
        var missing = try @import("section_tree.zig").parse(t.allocator, prefix ++ "<p:tbl><p:tr><p:tc/></p:tr></p:tbl></s:sec>", 0, 0, .{});
        defer missing.deinit(t.allocator);
        var sections = [_]editor.Section{ session.sections[0], session.sections[0], session.sections[0], session.sections[0] };
        sections[0].tree = zero;
        sections[1].tree = sparse;
        sections[2].tree = bad;
        sections[3].tree = missing;
        var view = session;
        view.source = source;
        view.sections = &sections;
        var report = try batch.read(t.allocator, &view, &.{ 1, 2, 0, 3, 1 });
        defer report.deinit(t.allocator);
        try compare(t.allocator, &view, &report);
        try t.expectEqual(@as(?u32, 0), report.entries[2].result.value.cells[0].border_fill_id);
        try t.expectEqual(error.InvalidTableBorderCell, report.entries[1].result.unavailable);
        try t.expectEqual(error.InvalidTableBorderCell, report.entries[3].result.unavailable);
        if (case[1]) |err| {
            try t.expectEqual(err, report.entries[0].result.unavailable);
        } else {
            const value = report.entries[0].result.value;
            try t.expectEqual(@as(usize, 1), value.styles.len);
            try t.expectEqual(@as(?usize, 0), value.cells[0].style_index);
            try t.expectEqual(value.cells[0].style_index, value.cells[1].style_index);
            try t.expectEqual(@as(?usize, null), value.cells[2].style_index);
            // These strings remain owned after the shared header was released.
            try t.expectEqualStrings("#123456", value.styles[0].edges[0].?.color.?);
        }
    }
}
