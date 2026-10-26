//! Curve-local source segments. No interpolation, flattening or rectangle fallback.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const xml = @import("document_xml.zig");
const fields = @import("table_xml_fields.zig");
pub const Segment = struct {
    kind: ?[]const u8 = null,
    x1: ?i64 = null,
    y1: ?i64 = null,
    x2: ?i64 = null,
    y2: ?i64 = null,
};
pub const Options = struct { max_segments: usize = 65536, max_attribute_bytes: usize = 4096 };
pub const Values = struct {
    arena: std.heap.ArenaAllocator,
    segments: []const Segment,
    pub fn deinit(self: *Values) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, options: Options) !Values {
    if (node >= tree.elements.len or !tree.elements[node].is(xml.paragraph_uri, "curve")) return error.InvalidCurveGeometryNode;
    var result: Values = .{ .arena = std.heap.ArenaAllocator.init(a), .segments = &.{} };
    errdefer result.deinit();
    const owned = result.arena.allocator();
    var segments: std.ArrayList(Segment) = .empty;
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        if (!tree.elements[index].is(xml.paragraph_uri, "seg")) continue;
        if (segments.items.len >= options.max_segments) return error.CurveSegmentLimitExceeded;
        var value: Segment = .{};
        if (try tree.attributeValue(owned, index, "", "type")) |raw| value.kind = try raw.toUtf8(owned, options.max_attribute_bytes);
        inline for (.{ "x1", "y1", "x2", "y2" }) |name| {
            if (try tree.attributeValue(owned, index, "", name)) |raw| @field(value, name) = try fields.margin(owned, raw, options.max_attribute_bytes);
        }
        try segments.append(owned, value);
    }
    result.segments = try segments.toOwnedSlice(owned);
    return result;
}

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'>";
fn allocationCase(a: std.mem.Allocator) !void {
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:curve><p:seg type='FUTURE' x1='-1' y1='&#48;' x2='4294967295'/><x:seg x1='7'/><p:drawText><p:seg x1='8'/></p:drawText><p:seg type='LINE'/></p:curve></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    var value = try read(a, &tree, 1, .{});
    defer value.deinit();
    try std.testing.expectEqual(@as(usize, 2), value.segments.len);
    try std.testing.expectEqualStrings("FUTURE", value.segments[0].kind.?);
    try std.testing.expectEqual(@as(?i64, -1), value.segments[0].x1);
    try std.testing.expectEqual(@as(?i64, 0), value.segments[0].y1);
    try std.testing.expectEqual(@as(?i64, 4294967295), value.segments[0].x2);
    try std.testing.expect(value.segments[0].y2 == null);
    try std.testing.expectEqual(@as(?i64, null), value.segments[1].x1);
}
test "curve local source preserves segment order types absence namespaces and allocation failures" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}
test "curve local source rejects invalid coordinates wrong nodes and exhausted segment budget" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:curve><p:seg x1='bad'/></p:curve><p:curve><p:seg/><p:seg/></p:curve></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidSignedOrUnsigned32, read(a, &tree, 1, .{}));
    try std.testing.expectError(error.CurveSegmentLimitExceeded, read(a, &tree, 3, .{ .max_segments = 1 }));
    try std.testing.expectError(error.CurveSegmentLimitExceeded, read(a, &tree, 3, .{ .max_segments = 0 }));
    try std.testing.expectError(error.InvalidCurveGeometryNode, read(a, &tree, tree.elements.len, .{}));
}
test "curve local source reads actual grouped text owner without losing repeated points or closing line" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/3-09월_교육_통합_2022.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var value = try read(a, &session.sections[0].tree, 1924, .{});
    defer value.deinit();
    try std.testing.expectEqual(@as(usize, 417), value.segments.len);
    try std.testing.expectEqualStrings("CURVE", value.segments[0].kind.?);
    try std.testing.expectEqualDeep([4]?i64{ 190, 50, 190, 50 }, .{ value.segments[0].x1, value.segments[0].y1, value.segments[0].x2, value.segments[0].y2 });
    const last = value.segments[value.segments.len - 1];
    try std.testing.expectEqualStrings("LINE", last.kind.?);
    try std.testing.expectEqualDeep([4]?i64{ 2775, 50, 190, 50 }, .{ last.x1, last.y1, last.x2, last.y2 });
    try std.testing.expectError(error.InvalidCurveGeometryNode, read(a, &session.sections[0].tree, 0, .{}));
}
