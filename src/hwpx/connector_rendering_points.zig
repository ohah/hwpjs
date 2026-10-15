//! Apply shared renderingInfo matrices, not page placement or subject resolution.
const std = @import("std");
const geometry = @import("connector_geometry_values.zig");
const transforms = @import("picture_transform_values.zig");
const affine = @import("picture_transform_affine.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Values = struct {
    endpoints: [2][2]f64,
    controls: [][2]f64,
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        a.free(self.controls);
        self.* = undefined;
    }
};
fn coordinate(raw: ?[]const u8) !f64 {
    const text = raw orelse return error.IncompleteConnectorGeometry;
    const number = std.fmt.parseInt(i64, std.mem.trim(u8, text, " \t\r\n"), 10) catch return error.UnsupportedConnectorCoordinateRange;
    // Rendering conversion must not silently round an unbounded XML integer.
    if (number < -9007199254740992 or number > 9007199254740992) return error.UnsupportedConnectorCoordinateRange;
    return @floatFromInt(number);
}
fn transform(point: geometry.Point, matrix: affine.Matrix) ![2]f64 {
    return affine.transformPoint(matrix, .{ try coordinate(point.x), try coordinate(point.y) });
}
pub fn apply(a: std.mem.Allocator, value: *const geometry.Values, matrix: affine.Matrix) !Values {
    const start = value.start orelse return error.IncompleteConnectorGeometry;
    const end = value.end orelse return error.IncompleteConnectorGeometry;
    const endpoints = [2][2]f64{ try transform(start, matrix), try transform(end, matrix) };
    const controls = try a.alloc([2]f64, value.controls.len);
    errdefer a.free(controls);
    for (value.controls, controls) |point, *output| output.* = try transform(point, matrix);
    return .{ .endpoints = endpoints, .controls = controls };
}
pub fn read(a: std.mem.Allocator, tree: *const Tree, node: usize, max_matrices: usize) !Values {
    var value = try geometry.read(a, tree, node, .{});
    defer value.deinit();
    var matrices = try transforms.readConnector(a, tree, node, max_matrices);
    defer matrices.deinit(a);
    return apply(a, &value, try affine.renderingMatrix(&matrices));
}
test "connector rendering points share affine order and refuse lossy integer conversion" {
    const a = std.testing.allocator;
    var value: geometry.Values = .{ .arena = std.heap.ArenaAllocator.init(a), .start = .{ .x = "1", .y = "2" }, .end = .{ .x = "3", .y = "4" } };
    defer value.deinit();
    var result = try apply(a, &value, .{ 0, -3, 10, 2, 0, 20 });
    defer result.deinit(a);
    try std.testing.expectEqualDeep([2][2]f64{ .{ 4, 22 }, .{ -2, 26 } }, result.endpoints);
    value.start.?.x = "9007199254740993";
    try std.testing.expectError(error.UnsupportedConnectorCoordinateRange, apply(a, &value, .{ 1, 0, 0, 0, 1, 0 }));
    value.start.?.x = "-9007199254740993";
    try std.testing.expectError(error.UnsupportedConnectorCoordinateRange, apply(a, &value, .{ 1, 0, 0, 0, 1, 0 }));
    value.start.?.x = null;
    try std.testing.expectError(error.IncompleteConnectorGeometry, apply(a, &value, .{ 1, 0, 0, 0, 1, 0 }));
    value.start.?.x = "9007199254740992";
    var boundary = try apply(a, &value, .{ 1, 0, 0, 0, 1, 0 });
    defer boundary.deinit(a);
    try std.testing.expectEqual(@as(f64, 9007199254740992), boundary.endpoints[0][0]);
    value.start.?.x = "2";
    value.controls = &.{.{ .x = null, .y = "0" }};
    try std.testing.expectError(error.IncompleteConnectorGeometry, apply(a, &value, .{ 1, 0, 0, 0, 1, 0 }));
    value.controls = &.{};
    try std.testing.expectError(error.NonFinitePictureMatrix, apply(a, &value, .{ 1e308, 0, 0, 0, 1, 0 }));
}
test "connector rendering points actual four connectors preserve source and allocation failures" {
    try @import("../testing/checked_allocator.zig").run(verifyActualConnectorRendering, .{});
}

fn verifyActualConnectorRendering(a: std.mem.Allocator) !void {
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
        if (!element.is(@import("document_xml.zig").paragraph_uri, "connectLine")) continue;
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: *const Tree, index: usize) !void {
                var result = try read(allocator, source, index, 32);
                defer result.deinit(allocator);
                try std.testing.expectEqual(@as(usize, 2), result.controls.len);
                for (result.endpoints) |point| for (point) |number| try std.testing.expect(std.math.isFinite(number));
            }
        }.run, .{ &tree, node });
        if (std.testing.environ.getPosix("HWPJS_CONNECTOR_RENDERING_LOG")) |enabled| {
            if (!std.mem.eql(u8, enabled, "1")) return error.InvalidConnectorRenderingLogOption;
            var observed = try read(a, &tree, node, 32);
            defer observed.deinit(a);
            const json = try std.json.Stringify.valueAlloc(a, observed, .{});
            defer a.free(json);
            std.debug.print("\nCONNECTOR_RENDERING {s}\n", .{json});
        }
        try std.testing.expectError(error.LimitExceeded, transforms.readConnector(a, &tree, node, 0));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 4), count);
    try std.testing.expectEqualSlices(u8, before, tree.source);
}
