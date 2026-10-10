//! 셀 크기 원값에서 저장 태그를 유도합니다. 편집 세션이나 XML 캐시는 소유하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Size = struct { width: u32, height: u32 };

pub fn write(a: std.mem.Allocator, tree: *const Tree, cell: usize, size: Size, max_bytes: usize) ![]u8 {
    if (cell >= tree.elements.len or !fields.childIs(tree, cell, "tc")) return error.InvalidCellDisplayNode;
    var missing: usize = 0;
    var duplicate: usize = 0;
    const node = fields.uniqueChild(tree, cell, "cellSz", &missing, &duplicate) orelse {
        if (duplicate != 0) return error.DuplicateCellDisplayChild;
        return error.MissingCellSizeElement;
    };
    return @import("xml_unsigned_attributes_write.zig").write(a, tree, node, &.{ "width", "height" }, .{ size.width, size.height }, max_bytes) catch |err| switch (err) {
        error.MissingXmlUnsignedAttribute => error.MissingCellSizeAttribute,
        else => err,
    };
}

test "HWPX cell size writer preserves lexical unrelated attributes and every allocation failure" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tc><p:cellSz height = '20' opaque='keep' width='&#49;'/></p:tc></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree) !void {
            const output = try write(allocator, source, 1, .{ .width = 0, .height = 40 }, 1000);
            defer allocator.free(output);
            try std.testing.expectEqualStrings("<p:cellSz height = '40' opaque='keep' width='0'/>", output);
        }
    }.run, .{&tree});
    const unchanged = try write(a, &tree, 1, .{ .width = 1, .height = 20 }, 1000);
    defer a.free(unchanged);
    try std.testing.expectEqualStrings("<p:cellSz height = '20' opaque='keep' width='&#49;'/>", unchanged);
    try std.testing.expectEqualStrings(input, tree.source);
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, .{ .width = 0, .height = 40 }, 1));
    try std.testing.expectError(error.InvalidCellDisplayNode, write(a, &tree, 0, .{ .width = 0, .height = 0 }, 1000));
}

test "HWPX cell size writer refuses absent and duplicate size instead of guessing" {
    const a = std.testing.allocator;
    for ([_]struct { xml: []const u8, err: anyerror }{
        .{ .xml = "<p:tc/>", .err = error.MissingCellSizeElement },
        .{ .xml = "<p:tc><p:cellSz width='1'/></p:tc>", .err = error.MissingCellSizeAttribute },
        .{ .xml = "<p:tc><p:cellSz/><p:cellSz/></p:tc>", .err = error.DuplicateCellDisplayChild },
    }) |case| {
        const input = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>{s}</s:sec>", .{case.xml});
        defer a.free(input);
        var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case.err, write(a, &tree, 1, .{ .width = 0, .height = 0 }, 1000));
    }
}

test "HWPX cell size writer keeps every actual table fixture cell unchanged for identical values" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(2_000_000));
    defer a.free(bytes);
    var package = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer package.deinit(a);
    var tree = try package.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var cells: usize = 0;
    for (tree.elements, 0..) |_, index| {
        if (!fields.childIs(&tree, index, "tc")) continue;
        const cell = try @import("table_display_cell.zig").read(a, &tree, index);
        const output = try write(a, &tree, index, .{ .width = cell.width.?, .height = cell.height.? }, 4096);
        defer a.free(output);
        var missing: usize = 0;
        var duplicate: usize = 0;
        const node = fields.uniqueChild(&tree, index, "cellSz", &missing, &duplicate).?;
        const span = tree.elements[node].start_tag;
        try std.testing.expectEqualSlices(u8, tree.source[span.start..span.end], output);
        cells += 1;
    }
    try std.testing.expect(cells > 0);
}
