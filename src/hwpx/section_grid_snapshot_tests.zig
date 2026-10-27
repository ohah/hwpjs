const std = @import("std");
const snapshot = @import("section_grid_snapshot.zig");
const parse = @import("section_tree.zig").parse;
const Tree = @import("xml_part_tree.zig").Tree;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";
fn tree(a: std.mem.Allocator, content: []const u8, section: usize) !Tree {
    const xml = try std.fmt.allocPrint(a, "{s}{s}{s}", .{ prefix, content, suffix });
    defer a.free(xml);
    return parse(a, xml, section, 0, .{});
}
fn object(a: std.mem.Allocator, trees: []const Tree) !std.json.Parsed(std.json.Value) {
    const bytes = try snapshot.encodeTrees(a, trees);
    defer a.free(bytes);
    return std.json.parseFromSlice(std.json.Value, a, bytes, .{ .allocate = .alloc_always });
}
fn rows(value: std.json.Value) []std.json.Value {
    return value.object.get("rows").?.array.items;
}
fn sources(value: std.json.Value) []std.json.Value {
    return value.object.get("grid_sources").?.array.items;
}
test "section grid observation absence and explicit zero remain distinct without defaults" {
    const a = std.testing.allocator;
    var input = try tree(a, "<p:p><p:run><p:secPr/><p:secPr><p:grid lineGrid='0' charGrid='0' wonggojiFormat='0'/></p:secPr></p:run></p:p>", 0);
    defer input.deinit(a);
    var result = try object(a, &.{input});
    defer result.deinit();
    try std.testing.expect(!result.value.object.get("schemaDefaultApplied").?.bool);
    try std.testing.expectEqualStrings("none", result.value.object.get("normalization").?.string);
    const r = rows(result.value);
    try std.testing.expectEqual(@as(usize, 2), r.len);
    try std.testing.expectEqual(@as(usize, 0), sources(r[0]).len);
    const zero = sources(r[1])[0];
    try std.testing.expectEqual(@as(i64, 0), zero.object.get("line_grid_value").?.integer);
    try std.testing.expectEqualStrings("0", zero.object.get("line_grid_raw").?.string);
    try std.testing.expect(zero.object.get("line_grid_error").? == .null);
}
test "section grid observation active raw directions and axes are never swapped" {
    const a = std.testing.allocator;
    var input = try tree(a, "<p:p><p:run><p:secPr textDirection='VERTICAL'><p:grid lineGrid='+01500' charGrid='750'/></p:secPr></p:run></p:p>", 0);
    defer input.deinit(a);
    var result = try object(a, &.{input});
    defer result.deinit();
    const row = rows(result.value)[0];
    const g = sources(row)[0];
    try std.testing.expectEqualStrings("VERTICAL", row.object.get("text_direction_raw").?.string);
    try std.testing.expectEqualStrings("+01500", g.object.get("line_grid_raw").?.string);
    try std.testing.expectEqual(@as(i64, 1500), g.object.get("line_grid_value").?.integer);
    try std.testing.expectEqual(@as(i64, 750), g.object.get("char_grid_value").?.integer);
}
test "section grid observation malformed values do not contaminate another section" {
    const a = std.testing.allocator;
    var bad = try tree(a, "<p:p><p:run><p:secPr textDirection='FUTURE'><p:grid lineGrid='bad' charGrid='0'/></p:secPr></p:run></p:p>", 0);
    defer bad.deinit(a);
    var good = try tree(a, "<p:p><p:run><p:secPr textDirection='HORIZONTAL'><p:grid lineGrid='1500'/></p:secPr></p:run></p:p>", 1);
    defer good.deinit(a);
    var result = try object(a, &.{ bad, good });
    defer result.deinit();
    const r = rows(result.value);
    const invalid = sources(r[0])[0];
    const valid = sources(r[1])[0];
    try std.testing.expectEqualStrings("bad", invalid.object.get("line_grid_raw").?.string);
    try std.testing.expect(invalid.object.get("line_grid_value").? == .null);
    try std.testing.expectEqualStrings("InvalidNonNegativeInteger", invalid.object.get("line_grid_error").?.string);
    try std.testing.expectEqual(@as(i64, 1500), valid.object.get("line_grid_value").?.integer);
    try std.testing.expectEqualStrings("FUTURE", r[0].object.get("text_direction_raw").?.string);
}
test "section grid observation duplicate declarations and detached owner remain explicit" {
    const a = std.testing.allocator;
    var input = try tree(a, "<p:p><p:run><p:secPr><p:grid lineGrid='500'/><p:grid lineGrid='1000'/></p:secPr></p:run></p:p><p:secPr><p:grid lineGrid='900'/></p:secPr>", 0);
    defer input.deinit(a);
    var result = try object(a, &.{input});
    defer result.deinit();
    const r = rows(result.value);
    try std.testing.expectEqual(@as(usize, 2), sources(r[0]).len);
    try std.testing.expect(r[0].object.get("body_owner").? != .null);
    try std.testing.expect(r[1].object.get("body_owner").? == .null);
}
test "section grid observation does not weaken default strict parser" {
    const a = std.testing.allocator;
    var input = try tree(a, "<p:p><p:run><p:secPr><p:grid lineGrid='bad'/></p:secPr></p:run></p:p>", 0);
    defer input.deinit(a);
    try std.testing.expectError(error.InvalidNonNegativeInteger, @import("section_direct_settings.zig").inspect(a, &.{input}, .{}));
}
test "section grid observation all allocation failures clean up source-owned views" {
    const a = std.testing.allocator;
    var input = try tree(a, "<p:p><p:run><p:secPr><p:grid lineGrid='1500' charGrid='750'/></p:secPr></p:run></p:p>", 0);
    defer input.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, t: *const Tree) !void {
            const bytes = try snapshot.encodeTrees(allocator, &.{t.*});
            defer allocator.free(bytes);
        }
    }.run, .{&input});
}

test "section grid observation actual readonly query preserves original save bytes" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const output = try snapshot.encode(a, &session);
    defer a.free(output);
    var result = try std.json.parseFromSlice(std.json.Value, a, output, .{});
    defer result.deinit();
    try std.testing.expectEqual(@as(i64, 1), result.value.object.get("schemaVersion").?.integer);
    try std.testing.expect(rows(result.value).len > 0);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

test "section grid empty declaration has absent values rather than schema defaults" {
    const a = std.testing.allocator;
    var input = try tree(a, "<p:p><p:run><p:secPr><p:grid/></p:secPr></p:run></p:p>", 0);
    defer input.deinit(a);
    var result = try object(a, &.{input});
    defer result.deinit();
    const grid = sources(rows(result.value)[0])[0];
    inline for (.{ "line_grid_raw", "line_grid_value", "char_grid_raw", "char_grid_value", "wonggoji_format_raw", "wonggoji_format_value" }) |key| try std.testing.expect(grid.object.get(key).? == .null);
}
test "section grid malformed flags and unknown direction remain raw in mixed sections" {
    const a = std.testing.allocator;
    var first = try tree(a, "<p:p><p:run><p:secPr textDirection='FUTURE'><p:grid lineGrid='0' wonggojiFormat='bad'/></p:secPr></p:run></p:p>", 0);
    defer first.deinit(a);
    var second = try tree(a, "<p:p><p:run><p:secPr textDirection='HORIZONTAL'><p:grid lineGrid='1500' charGrid='750' wonggojiFormat='false'/></p:secPr></p:run></p:p>", 1);
    defer second.deinit(a);
    var result = try object(a, &.{ first, second });
    defer result.deinit();
    const items = rows(result.value);
    const bad = sources(items[0])[0];
    try std.testing.expectEqualStrings("FUTURE", items[0].object.get("text_direction_raw").?.string);
    try std.testing.expectEqualStrings("bad", bad.object.get("wonggoji_format_raw").?.string);
    try std.testing.expectEqualStrings("InvalidXmlBoolean", bad.object.get("wonggoji_format_error").?.string);
    try std.testing.expect(bad.object.get("wonggoji_format_value").? == .null);
    const good = sources(items[1])[0];
    try std.testing.expectEqual(@as(i64, 1500), good.object.get("line_grid_value").?.integer);
    try std.testing.expect(!good.object.get("wonggoji_format_value").?.bool);
}
