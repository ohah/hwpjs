//! Connector-local lexical geometry. No target resolution, transforms, or paint.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;
const lexical = @import("xml_values.zig");

pub const Point = struct {
    x: ?[]const u8 = null,
    y: ?[]const u8 = null,
    subject_id_ref: ?[]const u8 = null,
    subject_index: ?[]const u8 = null,
    control_type: ?[]const u8 = null,
};
pub const Values = struct {
    arena: std.heap.ArenaAllocator,
    raw_type: ?[]const u8 = null,
    known_type: bool = false,
    start: ?Point = null,
    end: ?Point = null,
    controls_present: bool = false,
    controls: []const Point = &.{},
    unexpected_children: usize = 0,

    pub fn deinit(self: *Values) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
pub const Options = struct { max_attribute_bytes: usize = 4096, max_control_points: usize = 4096 };

fn attribute(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8, limit: usize) !?[]const u8 {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try raw.toUtf8(a, limit);
}

// xs:integer has no machine-width bound. Keep the decoded spelling, using the
// existing nonnegative lexical validator for digits rather than truncating it.
fn integer(value: []const u8) !void {
    const trimmed = std.mem.trim(u8, value, " \t\r\n");
    if (trimmed.len > 0 and trimmed[0] == '-') {
        if (trimmed.len == 1 or !std.ascii.isDigit(trimmed[1])) return error.InvalidConnectorInteger;
        _ = try lexical.nonNegative(trimmed[1..]);
    } else _ = try lexical.nonNegative(trimmed);
}

fn point(a: std.mem.Allocator, tree: *const Tree, node: usize, control: bool, limit: usize) !Point {
    var result: Point = .{};
    result.x = try attribute(a, tree, node, "x", limit);
    result.y = try attribute(a, tree, node, "y", limit);
    if (result.x) |value| try integer(value);
    if (result.y) |value| try integer(value);
    if (control) {
        result.control_type = try attribute(a, tree, node, "type", limit);
        if (result.control_type) |value| _ = try lexical.nonNegative(value);
    } else {
        result.subject_id_ref = try attribute(a, tree, node, "subjectIDRef", limit);
        result.subject_index = try attribute(a, tree, node, "subjectIdx", limit);
        if (result.subject_id_ref) |value| _ = try lexical.nonNegative(value);
        if (result.subject_index) |value| _ = try lexical.nonNegative(value);
    }
    return result;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, options: Options) !Values {
    if (node >= tree.elements.len or !tree.elements[node].is(uri, "connectLine")) return error.InvalidConnectorGeometryNode;
    var result: Values = .{ .arena = std.heap.ArenaAllocator.init(a) };
    errdefer result.deinit();
    const owned = result.arena.allocator();
    result.raw_type = try attribute(owned, tree, node, "type", options.max_attribute_bytes);
    if (result.raw_type) |value| {
        inline for (.{ "STRAIGHT_NOARROW", "STRAIGHT_ONEWAY", "STRAIGHT_BOTH", "STROKE_NOARROW", "STROKE_ONEWAY", "STROKE_BOTH", "ARC_NOARROW", "ARC_ONEWAY", "ARC_BOTH" }) |known| {
            if (std.mem.eql(u8, value, known)) result.known_type = true;
        }
    }
    var controls: std.ArrayList(Point) = .empty;
    var child = tree.elements[node].first_child;
    while (child) |index| : (child = tree.elements[index].next_sibling) {
        const element = tree.elements[index];
        if (element.is(uri, "startPt")) {
            if (result.start != null) return error.DuplicateConnectorGeometryChild;
            result.start = try point(owned, tree, index, false, options.max_attribute_bytes);
        } else if (element.is(uri, "endPt")) {
            if (result.end != null) return error.DuplicateConnectorGeometryChild;
            result.end = try point(owned, tree, index, false, options.max_attribute_bytes);
        } else if (element.is(uri, "controlPoints")) {
            if (result.controls_present) return error.DuplicateConnectorGeometryChild;
            result.controls_present = true;
            var cursor = element.first_child;
            while (cursor) |control| : (cursor = tree.elements[control].next_sibling) {
                if (!tree.elements[control].is(uri, "point")) {
                    result.unexpected_children += 1;
                    continue;
                }
                if (controls.items.len == options.max_control_points) return error.LimitExceeded;
                try controls.append(owned, try point(owned, tree, control, true, options.max_attribute_bytes));
            }
        } else result.unexpected_children += 1;
    }
    result.controls = try controls.toOwnedSlice(owned);
    return result;
}

test "connector lexical geometry preserves wide IDs zero namespace and every allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:connectLine type='ARC_BOTH'><c:startPt x='99'/><p:startPt x='-99999999999999999999999' y='&#48;' subjectIDRef='4294967296' subjectIdx='0'/><p:endPt/><p:controlPoints><p:point x='+01' y='-0' type='3'/></p:controlPoints></p:connectLine></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const Tree) !void {
            var result = try read(allocator, input, 1, .{});
            defer result.deinit();
            try std.testing.expect(result.known_type);
            try std.testing.expectEqualStrings("4294967296", result.start.?.subject_id_ref.?);
            try std.testing.expectEqualStrings("0", result.start.?.y.?);
            try std.testing.expect(result.end.?.x == null);
            try std.testing.expectEqual(@as(usize, 1), result.controls.len);
            try std.testing.expectEqual(@as(usize, 1), result.unexpected_children);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectError(error.LimitExceeded, read(a, &tree, 1, .{ .max_control_points = 0 }));
    try std.testing.expectError(error.InvalidConnectorGeometryNode, read(a, &tree, 2, .{}));
}

test "connector lexical geometry rejects malformed numbers duplicates and wrong namespaces" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    inline for (.{ "--0", "-+1", "1.5", "", "1e2", "- 0", "-&#9;1" }) |bad| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:connectLine><p:startPt x='" ++ bad ++ "'/></p:connectLine></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        if (read(a, &tree, 1, .{})) |value| {
            var accepted = value;
            accepted.deinit();
            return error.TestUnexpectedResult;
        } else |err| try std.testing.expect(err == error.InvalidConnectorInteger or err == error.InvalidNonNegativeInteger);
    }
    var duplicate = try @import("section_tree.zig").parse(a, prefix ++ "<p:connectLine><p:startPt/><p:startPt/></p:connectLine></s:sec>", 0, 0, .{});
    defer duplicate.deinit(a);
    try std.testing.expectError(error.DuplicateConnectorGeometryChild, read(a, &duplicate, 1, .{}));
    var unknown = try @import("section_tree.zig").parse(a, prefix ++ "<p:connectLine type='FUTURE'/></s:sec>", 0, 0, .{});
    defer unknown.deinit(a);
    var result = try read(a, &unknown, 1, .{});
    defer result.deinit();
    try std.testing.expect(!result.known_type);
    try std.testing.expectEqualStrings("FUTURE", result.raw_type.?);
    try std.testing.expect(result.start == null and result.end == null);
    try std.testing.expect(!result.controls_present);
    try std.testing.expectError(error.LimitExceeded, read(a, &unknown, 1, .{ .max_attribute_bytes = 1 }));
}

test "connector lexical geometry reads actual large reference connector points without source mutation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/2025 행정업무운영 편람(최종).hwpx", a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 2, .{});
    defer tree.deinit(a);
    const before = try a.dupe(u8, tree.source);
    defer a.free(before);
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(uri, "connectLine")) continue;
        var result = try read(a, &tree, node, .{});
        defer result.deinit();
        try std.testing.expect(result.known_type);
        try std.testing.expect(result.start != null and result.end != null);
        if (std.testing.environ.getPosix("HWPJS_CONNECTOR_GEOMETRY_LOG")) |enabled| {
            if (!std.mem.eql(u8, enabled, "1")) return error.InvalidConnectorGeometryLogOption;
            const json = try std.json.Stringify.valueAlloc(a, .{ .raw_type = result.raw_type, .known_type = result.known_type, .start = result.start, .end = result.end, .controls_present = result.controls_present, .controls = result.controls, .unexpected_children = result.unexpected_children }, .{});
            defer a.free(json);
            std.debug.print("\nCONNECTOR_GEOMETRY {s}\n", .{json});
        }
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 4), count);
    try std.testing.expectEqualStrings(before, tree.source);
}
