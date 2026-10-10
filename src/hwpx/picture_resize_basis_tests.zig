const std = @import("std");
const editor = @import("editor_session.zig");
const corners_api = @import("picture_rendering_corners.zig");
const transforms = @import("picture_transform_values.zig");

test "picture resize direct one-unit no-op retains direct ownership classification" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapepict-scaled.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    for (session.sections[0].tree.elements, 0..) |element, picture| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "pic")) continue;
        try std.testing.expect(try session.resizePicture(0, picture, .{ 1, 1 }));
        const plan = try @import("picture_resize_plan.zig").build(&session, 0, picture, .{ 1, 1 });
        try std.testing.expect(!plan.grouped);
        try std.testing.expect(plan.dimensions.display == null);
        try std.testing.expect(plan.dimensions.current == null);
        return;
    }
    return error.MissingPictureImage;
}

test "picture resize grouped fixture edits current axes without inserting display size" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapecontainer-2.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var count: usize = 0;
    for (session.sections[0].tree.elements, 0..) |element, node| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "pic")) continue;
        var checkpoint = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
        defer checkpoint.deinit();
        try std.testing.expect(try session.resizePicture(0, node, .{ 10000, 6000 }));
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        const dimensions = try @import("picture_dimension_values.zig").read(a, &reopened.sections[0].tree, node);
        try std.testing.expectEqualDeep([2]?u32{ null, null }, dimensions.display);
        try std.testing.expectEqualDeep([2]?u32{ 10000, 6000 }, dimensions.current);
        const corners = try corners_api.read(a, &reopened.sections[0].tree, node, 1024);
        try std.testing.expectApproxEqAbs(@as(f64, 10000), std.math.hypot(corners[1][0] - corners[0][0], corners[1][1] - corners[0][1]), 1e-8);
        try std.testing.expectApproxEqAbs(@as(f64, 6000), std.math.hypot(corners[3][0] - corners[0][0], corners[3][1] - corners[0][1]), 1e-8);
        try checkpoint.exchange(&session);
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

test "picture resize skewed source basis preserves fixed point multiple matrix pairs and saved history" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core'><p:p><p:run><p:pic><p:sz width='400' height='400' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/><p:orgSz width='200' height='200'/><p:curSz width='0' height='0'/><p:renderingInfo><c:transMatrix e1='1' e2='0' e3='7' e4='0' e5='1' e6='11'/><c:scaMatrix e1='2' e2='0' e3='0' e4='0' e5='3' e6='0'/><c:rotMatrix e1='0' e2='-1' e3='0' e4='1' e5='0' e6='0'/><c:scaMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/><c:rotMatrix e1='1' e2='0' e3='0' e4='0' e5='1' e6='0'/></p:renderingInfo><p:imgRect><c:pt0 x='10' y='20'/><c:pt1 x='110' y='120'/><c:pt2 x='10' y='220'/><c:pt3 x='-90' y='120'/></p:imgRect></p:pic></p:run></p:p></s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 4_000_000);
    defer history.deinit();
    const picture = 3;
    const tree = &session.sections[0].tree;
    const source = try corners_api.read(a, tree, picture, 1024);
    var source_transform = try transforms.read(a, tree, picture, 1024);
    defer source_transform.deinit(a);
    for ([_][2]u32{ .{ 720, 180 }, .{ 360, 540 } }) |target| {
        try std.testing.expect(try history.apply(&session, .{ .kind = .picture_resize, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_node = picture, .picture_size = target }));
        const current = try corners_api.readCurrent(a, tree, picture, &session.sections[0].picture_matrices, 1024);
        for (source[0], current[0]) |before, after| try std.testing.expectApproxEqAbs(before, after, 1e-9);
        for ([_]usize{ 1, 3 }, target) |end, length| {
            const old_vector = [2]f64{ source[end][0] - source[0][0], source[end][1] - source[0][1] };
            const new_vector = [2]f64{ current[end][0] - current[0][0], current[end][1] - current[0][1] };
            const factor = @as(f64, @floatFromInt(length)) / std.math.hypot(old_vector[0], old_vector[1]);
            for (old_vector, new_vector) |old, new| try std.testing.expectApproxEqAbs(old * factor, new, 1e-9);
        }
        var current_transform = try transforms.readCurrent(a, tree, picture, &session.sections[0].picture_matrices, 1024);
        defer current_transform.deinit(a);
        for ([_]usize{ 1, 2, 4 }) |index| try std.testing.expectEqualDeep(source_transform.matrices[index], current_transform.matrices[index]);
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        try std.testing.expectEqualDeep(current, try corners_api.read(a, &reopened.sections[0].tree, picture, 1024));
    }
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
}
