//! 텍스트/문단 출력의 셀 구조를 원문과 검증한 뒤 native 크기 값을 적용합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const writer = @import("xml_source_writer.zig");

fn identity(tree: *const Tree, index: usize) bool {
    for ([_][]const u8{ "tbl", "tr", "tc", "cellAddr", "cellSpan", "cellSz" }) |name| if (fields.childIs(tree, index, name)) return true;
    return false;
}
pub fn write(a: std.mem.Allocator, source: *const Tree, xml: []const u8, values: []const @import("table_cell_size_values.zig").Entry, limit: usize) ![]u8 {
    if (xml.len > limit or values.len > 100000) return error.LimitExceeded;
    var current = try @import("section_tree.zig").parse(a, xml, source.section_ordinal orelse return error.InvalidPartOrdinal, source.item_index, .{});
    defer current.deinit(a);
    var mapping = try @import("xml_identity_binding.zig").bind(a, source, &current, identity);
    defer mapping.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| a.free(change.start_tag.?);
        changes.deinit(a);
    }
    for (values) |entry| {
        const node = mapping.get(entry.cell_node) orelse return error.SourceBindingMismatch;
        if (!fields.childIs(&current, node, "tc")) return error.SourceBindingMismatch;
        const tag = try @import("table_cell_size_write.zig").write(a, &current, node, entry.size, limit);
        var missing: usize = 0;
        var duplicate: usize = 0;
        const size = fields.uniqueChild(&current, node, "cellSz", &missing, &duplicate) orelse {
            a.free(tag);
            return error.SourceBindingMismatch;
        };
        const span = current.elements[size].start_tag;
        changes.append(a, .{ .start = span.start, .end = span.end, .text = "", .start_tag = tag }) catch |err| {
            a.free(tag);
            return err;
        };
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, current.source, changes.items, limit);
}

test "HWPX cell size save composes shifted text output with allocation cleanup and rejects changed structure" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    const original = prefix ++ "<p:tbl><p:tr><p:tc><p:cellSz width='10' height='20'/><p:subList><p:p><p:run><p:t>A</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></s:sec>";
    const changed = prefix ++ "<p:tbl><p:tr><p:tc><p:cellSz width='10' height='20'/><p:subList><p:p><p:run><p:t>한😀B</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, original, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, text: []const u8) !void {
            const output = try write(allocator, source, text, &.{.{ .cell_node = 3, .size = .{ .width = 0, .height = 40 } }}, 4096);
            defer allocator.free(output);
            try std.testing.expect(std.mem.indexOf(u8, output, "<p:cellSz width='0' height='40'/>") != null);
            try std.testing.expect(std.mem.indexOf(u8, output, "한😀B") != null);
        }
    }.run, .{ &tree, changed });
    const wrong = prefix ++ "<p:tbl><p:tr><p:tc/><p:cellSz width='10' height='20'/></p:tr></p:tbl></s:sec>";
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, wrong, &.{.{ .cell_node = 3, .size = .{ .width = 0, .height = 40 } }}, 4096));
    try std.testing.expectEqualStrings(original, tree.source);
}

test "HWPX cell size save survives actual cell paragraph split and input" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(2_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const bindings = try @import("table_display_bindings.zig").read(a, &session, 0);
    defer a.free(bindings);
    const target = bindings[0];
    try std.testing.expect(try session.setCellSize(0, target.owner.cell_node, .{ .width = 1234, .height = 5678 }));
    try std.testing.expect(try session.splitParagraph(0, target.paragraph, 0, 0));
    try std.testing.expect(try session.splice(0, target.paragraph + 1, 0, 0, "크기😀"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(std.mem.indexOf(u8, reopened.sections[0].tree.source, "크기😀") != null);
    const after = try @import("table_display_bindings.zig").read(a, &reopened, 0);
    defer a.free(after);
    try std.testing.expectEqual(@as(usize, bindings.len + 1), after.len);
    for (after[0..2]) |binding| {
        try std.testing.expectEqual(@as(?u32, 1234), binding.owner.cell.width);
        try std.testing.expectEqual(@as(?u32, 5678), binding.owner.cell.height);
    }
}
