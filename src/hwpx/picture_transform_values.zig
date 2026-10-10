//! 그림 변환의 원값과 행렬 순서를 보존합니다. 배치는 별도 책임입니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
const xml = @import("document_xml.zig");
pub const Kind = @import("picture_matrix_fields.zig").Kind;
pub const Matrix = struct { kind: Kind, values: [6]?f64 };
pub const Values = struct {
    flip: [2]?bool = .{ null, null },
    angle: ?u32 = null,
    center: [2]?i64 = .{ null, null },
    rotate_image: ?bool = null,
    reverse: ?bool = null,
    matrices: []Matrix,
    unknown_matrix_nodes: usize = 0,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        a.free(self.matrices);
        self.* = undefined;
    }
};

/// null은 변환 부재를 항등 변환으로 가정할 수 없다는 뜻입니다.
pub fn identity(value: *const Values) ?bool {
    return identityComponent(value, true);
}

// reverse는 PictureType 전용입니다. 사각형 원값에는 기본값을 기록하지 않습니다.
pub fn rectangleIdentity(value: *const Values) ?bool {
    if (value.reverse != null) return null;
    return identityComponent(value, false);
}

fn identityComponent(value: *const Values, require_reverse: bool) ?bool {
    if (value.unknown_matrix_nodes != 0) return null;
    if (value.reverse == true or value.flip[0] == true or value.flip[1] == true) return false;
    if (value.angle) |angle| {
        if (angle != 0) return false;
    } else return null;
    if ((require_reverse and value.reverse == null) or value.flip[0] == null or value.flip[1] == null or value.matrices.len != 3) return null;
    const kinds = [_]Kind{ .translation, .scale, .rotation };
    const expected = [_]f64{ 1, 0, 0, 0, 1, 0 };
    for (value.matrices, kinds) |matrix, kind| {
        if (matrix.kind != kind) return null;
        for (matrix.values, expected) |number_value, number_expected| {
            const actual = number_value orelse return null;
            if (!std.math.isFinite(actual) or actual != number_expected) return false;
        }
    }
    return true;
}

fn child(tree: *const Tree, picture: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const result = fields.uniqueChild(tree, picture, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicatePictureTransformChild;
    return result;
}

fn boolean(a: std.mem.Allocator, tree: *const Tree, node: usize, name: []const u8) !?bool {
    const raw = (try tree.attributeValue(a, node, "", name)) orelse return null;
    return try fields.boolean(a, raw, 4096);
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, picture: usize, max_matrices: usize) !Values {
    if (picture >= tree.elements.len or !fields.childIs(tree, picture, "pic")) return error.InvalidPictureDisplayNode;
    return readComponent(a, tree, picture, max_matrices);
}

pub fn readCurrent(a: std.mem.Allocator, tree: *const Tree, picture: usize, edits: *const @import("picture_matrix_edit_values.zig").Values, max_matrices: usize) !Values {
    var result = try read(a, tree, picture, max_matrices);
    errdefer result.deinit(a);
    const rendering = (try child(tree, picture, "renderingInfo")) orelse return result;
    var cursor = tree.elements[rendering].first_child;
    var index: usize = 0;
    while (cursor) |node| : (cursor = tree.elements[node].next_sibling) {
        if (@import("picture_matrix_fields.zig").kind(tree, node) == null) continue;
        if (index >= result.matrices.len) return error.SourceBindingMismatch;
        for (edits.items) |entry| if (entry.matrix_node == node) {
            for (entry.values, 0..) |value, coefficient| result.matrices[index].values[coefficient] = value;
            break;
        };
        index += 1;
    }
    if (index != result.matrices.len) return error.SourceBindingMismatch;
    return result;
}

test "HWPX rectangle identity excludes picture-only reverse without changing raw values" {
    var matrices = [_]Matrix{
        .{ .kind = .translation, .values = .{ 1, 0, 0, 0, 1, 0 } },
        .{ .kind = .scale, .values = .{ 1, 0, 0, 0, 1, 0 } },
        .{ .kind = .rotation, .values = .{ 1, 0, 0, 0, 1, 0 } },
    };
    var value: Values = .{ .matrices = &matrices, .flip = .{ false, false }, .angle = 0 };
    try std.testing.expectEqual(@as(?bool, true), rectangleIdentity(&value));
    try std.testing.expectEqual(@as(?bool, null), identity(&value));
    try std.testing.expectEqual(@as(?bool, null), value.reverse);
    value.reverse = false;
    try std.testing.expectEqual(@as(?bool, null), rectangleIdentity(&value));
    try std.testing.expectEqual(@as(?bool, true), identity(&value));
    value.reverse = null;
    value.flip[0] = true;
    try std.testing.expectEqual(@as(?bool, false), rectangleIdentity(&value));
}

pub fn readContainer(a: std.mem.Allocator, tree: *const Tree, container: usize, max_matrices: usize) !Values {
    if (container >= tree.elements.len or !fields.childIs(tree, container, "container")) return error.InvalidPictureContainerNode;
    return readComponent(a, tree, container, max_matrices);
}

pub fn readLine(a: std.mem.Allocator, tree: *const Tree, line: usize, max_matrices: usize) !Values {
    if (line >= tree.elements.len or !fields.childIs(tree, line, "line")) return error.InvalidLineGeometryNode;
    return readComponent(a, tree, line, max_matrices);
}

pub fn readConnector(a: std.mem.Allocator, tree: *const Tree, node: usize, max_matrices: usize) !Values {
    if (node >= tree.elements.len or !fields.childIs(tree, node, "connectLine")) return error.InvalidConnectorGeometryNode;
    return readComponent(a, tree, node, max_matrices);
}

pub fn readRectangle(a: std.mem.Allocator, tree: *const Tree, rectangle: usize, max_matrices: usize) !Values {
    if (rectangle >= tree.elements.len or !fields.childIs(tree, rectangle, "rect")) return error.InvalidDrawingTextNode;
    return readComponent(a, tree, rectangle, max_matrices);
}

fn readComponent(a: std.mem.Allocator, tree: *const Tree, picture: usize, max_matrices: usize) !Values {
    var matrices: std.ArrayList(Matrix) = .empty;
    defer matrices.deinit(a);
    var result: Values = .{ .matrices = &.{} };
    result.reverse = try boolean(a, tree, picture, "reverse");
    if (try child(tree, picture, "flip")) |flip| {
        result.flip = .{ try boolean(a, tree, flip, "horizontal"), try boolean(a, tree, flip, "vertical") };
    }
    if (try child(tree, picture, "rotationInfo")) |rotation| {
        result.angle = try fields.optionalUnsigned(a, tree, rotation, "angle", 4096);
        for ([_][]const u8{ "centerX", "centerY" }, 0..) |name, index| {
            if (try tree.attributeValue(a, rotation, "", name)) |raw| result.center[index] = try fields.margin(a, raw, 4096);
        }
        result.rotate_image = try boolean(a, tree, rotation, "rotateimage");
    }
    if (try child(tree, picture, "renderingInfo")) |rendering| {
        var cursor = tree.elements[rendering].first_child;
        while (cursor) |node| : (cursor = tree.elements[node].next_sibling) {
            const kind = @import("picture_matrix_fields.zig").kind(tree, node) orelse {
                result.unknown_matrix_nodes += 1;
                continue;
            };
            if (matrices.items.len >= max_matrices) return error.LimitExceeded;
            const matrix: Matrix = .{ .kind = kind, .values = try @import("picture_matrix_fields.zig").read(a, tree, node) };
            try matrices.append(a, matrix);
        }
    }
    result.matrices = try matrices.toOwnedSlice(a);
    return result;
}

test "HWPX container transform shares parser while separating node contracts" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:container reverse='0'><p:flip horizontal='0' vertical='1'/><p:rotationInfo angle='90'/><p:renderingInfo><c:transMatrix e1='1' e2='0' e3='10' e4='0' e5='1' e6='20'/></p:renderingInfo><p:pic reverse='1'/></p:container></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.InvalidPictureDisplayNode, read(a, &tree, 1, 3));
    try std.testing.expectError(error.InvalidPictureContainerNode, readContainer(a, &tree, 6, 3));
    try std.testing.expectError(error.InvalidPictureContainerNode, readContainer(a, &tree, tree.elements.len, 3));
    try std.testing.expectError(error.LimitExceeded, readContainer(a, &tree, 1, 0));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree) !void {
            var value = try readContainer(allocator, parsed, 1, 3);
            defer value.deinit(allocator);
            try std.testing.expectEqual(@as(?bool, false), value.reverse);
            try std.testing.expectEqual(@as(?bool, true), value.flip[1]);
            try std.testing.expectEqual(@as(?u32, 90), value.angle);
            try std.testing.expectEqual(@as(usize, 1), value.matrices.len);
            try std.testing.expectEqual(@as(?f64, 10), value.matrices[0].values[2]);
        }
    }.run, .{&tree});
}

fn allocationCase(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:x='urn:other'><p:pic reverse='0'><p:flip horizontal='1'/><p:rotationInfo angle='0'/><p:renderingInfo><c:scaMatrix e1='&#49;.5' e2='-0' e3='INF'/><x:scaMatrix/><c:rotMatrix e1='NaN'/></p:renderingInfo></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var result = try read(a, &tree, 1, 2);
    defer result.deinit(a);
    try std.testing.expectEqual(@as(?bool, true), result.flip[0]);
    try std.testing.expectEqual(@as(?bool, null), result.flip[1]);
    try std.testing.expectEqual(@as(usize, 2), result.matrices.len);
    try std.testing.expectEqual(@as(usize, 1), result.unknown_matrix_nodes);
    try std.testing.expectEqual(@as(?f64, 1.5), result.matrices[0].values[0]);
    try std.testing.expect(std.math.isPositiveInf(result.matrices[0].values[2].?));
    try std.testing.expect(std.math.isNan(result.matrices[1].values[0].?));
    try std.testing.expectEqual(Kind.scale, result.matrices[0].kind);
    if (read(a, &tree, 1, 1)) |unexpected| {
        var owned = unexpected;
        owned.deinit(a);
        return error.TestUnexpectedResult;
    } else |err| {
        if (err != error.LimitExceeded) return err;
    }
}

test "HWPX container transform reads tracked owner independently from child matrices" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var count: usize = 0;
    for (tree.elements, 0..) |element, node| {
        if (!element.is(xml.paragraph_uri, "pic")) continue;
        const owner = try @import("picture_display_host.zig").sourceAnchor(tree, node);
        var parent = try readContainer(a, tree, owner, 32);
        defer parent.deinit(a);
        var picture = try read(a, tree, node, 32);
        defer picture.deinit(a);
        try std.testing.expectEqual(@as(usize, 3), parent.matrices.len);
        try std.testing.expectEqual(@as(usize, 5), picture.matrices.len);
        for (parent.matrices) |matrix| {
            const expected = [_]?f64{ 1, 0, 0, 0, 1, 0 };
            try std.testing.expectEqualSlices(?f64, &expected, &matrix.values);
        }
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
test "HWPX picture transform values preserve matrix order namespace missing and float forms" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX picture transform values distinguish actual identity from scaled images" {
    const a = std.testing.allocator;
    inline for (.{ .{ "sample-5017-pics", true }, .{ "shapepict-scaled", false } }) |case| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/" ++ case[0] ++ ".hwpx", a, .limited(16_000_000));
        defer a.free(bytes);
        var session = try @import("editor_session.zig").open(a, bytes, .{});
        defer session.deinit();
        const tree = &session.sections[0].tree;
        var found = false;
        for (tree.elements, 0..) |_, node| {
            if (!fields.childIs(tree, node, "pic")) continue;
            var result = try read(a, tree, node, 32);
            defer result.deinit(a);
            try std.testing.expectEqual(@as(?bool, case[1]), identity(&result));
            found = true;
            break;
        }
        try std.testing.expect(found);
    }
    const unknown: Values = .{ .matrices = &.{} };
    try std.testing.expectEqual(@as(?bool, null), identity(&unknown));
}

test "HWPX picture transform identity refuses incomplete nonfinite and unknown matrices" {
    const a = std.testing.allocator;
    var matrices = [_]Matrix{
        .{ .kind = .translation, .values = .{ 1, 0, 0, 0, 1, 0 } },
        .{ .kind = .scale, .values = .{ 1, 0, 0, 0, 1, 0 } },
        .{ .kind = .rotation, .values = .{ 1, 0, 0, 0, 1, 0 } },
    };
    var value: Values = .{ .flip = .{ false, false }, .angle = 0, .reverse = false, .matrices = &matrices };
    try std.testing.expectEqual(@as(?bool, true), identity(&value));
    matrices[1].values[0] = null;
    try std.testing.expectEqual(@as(?bool, null), identity(&value));
    matrices[1].values[0] = std.math.nan(f64);
    try std.testing.expectEqual(@as(?bool, false), identity(&value));
    matrices[1].values[0] = 1;
    value.unknown_matrix_nodes = 1;
    try std.testing.expectEqual(@as(?bool, null), identity(&value));
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic>";
    inline for (.{ "<p:flip/><p:flip/>", "<p:rotationInfo/><p:rotationInfo/>", "<p:renderingInfo/><p:renderingInfo/>" }) |inside| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ inside ++ "</p:pic></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.DuplicatePictureTransformChild, read(a, &tree, 1, 3));
    }
}
