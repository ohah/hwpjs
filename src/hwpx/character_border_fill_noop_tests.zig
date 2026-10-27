//! a392 단독 resource no-op 회귀 후보. Native 실행은 최종 union 슬롯에서 수행합니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const history_module = @import("editor_history.zig");
const resource = @import("../model/border_fill_patch.zig");
const properties = @import("../model/document.zig");
fn exercise(background: bool, include_current_size: bool) !void {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try history_module.History.initV2(&session, .{});
    defer history.deinit();
    var fill: resource.Patch = .{};
    if (background) {
        fill.background = .{ .solid = .{ .color = 0xe31287 } };
    } else {
        fill.border.edges[0] = .{ .style = .SOLID, .width_hundredth_mm = 50, .color = 0xe31287 };
    }
    var patch: properties.CharacterPropertyPatch = .{ .border_fill = fill };
    if (include_current_size) {
        const spans = try @import("character_style_snapshot.zig").read(&session, 0, 1);
        defer a.free(spans);
        const id = spans[0].char_shape_id orelse return error.InvalidCharacterShapeReference;
        const shapes = try @import("character_style_resources.zig").displayShapes(&session);
        defer a.free(shapes);
        for (shapes) |shape| if (shape.id == id) {
            patch.size = shape.height orelse return error.MissingCharacterHeight;
            break;
        };
        try std.testing.expect(patch.size != null);
    }
    const command: history_module.Command = .{ .kind = .character_properties, .section = 0, .paragraph = 1, .start = 0, .deleted = 1, .inserted = "", .character_properties = patch };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const before_repeat = try session.save();
    defer a.free(before_repeat);
    const char_entries = session.character_resources.entries.items.len;
    var count_doc = try @import("package.zig").inspectDocument(a, before_repeat, .{});
    defer count_doc.deinit(a);
    var count_resources = try count_doc.inspectHeaderResources(a, .{});
    defer count_resources.deinit(a);
    const fill_count = count_resources.table(.border_fill).ids.items.len;
    const shape_count = count_resources.table(.char_shape).ids.items.len;
    try std.testing.expect(!try history.apply(&session, command));
    try std.testing.expectEqual(char_entries, session.character_resources.entries.items.len);
    const after_repeat = try session.save();
    defer a.free(after_repeat);
    try std.testing.expectEqualSlices(u8, before_repeat, after_repeat);
    var after_doc = try @import("package.zig").inspectDocument(a, after_repeat, .{});
    defer after_doc.deinit(a);
    var after_resources = try after_doc.inspectHeaderResources(a, .{});
    defer after_resources.deinit(a);
    try std.testing.expectEqual(fill_count, after_resources.table(.border_fill).ids.items.len);
    try std.testing.expectEqual(shape_count, after_resources.table(.char_shape).ids.items.len);
    try std.testing.expectEqual(@as(u32, 1), history.revision());
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(!try reopened.setCharacterProperties(0, 1, 0, 1, patch));
    const spans_after = try @import("character_style_snapshot.zig").read(&reopened, 0, 1);
    defer a.free(spans_after);
    try std.testing.expect(try @import("paragraph_border_fill_session.zig").matchesCharacterCurrent(&reopened, spans_after[0].char_shape_id.?, fill));
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
test "HX border-only changes once and retains exact V2 undo redo" {
    try exercise(false, false);
}
test "HX background-only changes once and retains exact V2 undo redo" {
    try exercise(true, false);
}
test "HX current size cannot hide a changed border" {
    try exercise(false, true);
}
test "HX empty border resource remains a true noop" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var history = try history_module.History.initV2(&session, .{});
    defer history.deinit();
    try std.testing.expect(!try history.apply(&session, .{ .kind = .character_properties, .paragraph = 1, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .border_fill = .{} } }));
    try std.testing.expectEqual(@as(u32, 0), history.revision());
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

test "HX current size cannot hide a changed background" {
    try exercise(true, true);
}
test "HX border resource absent reference absent ID and valid zero are distinct" {
    const a = std.testing.allocator;
    const resource_writer = @import("border_fill_resource_patch.zig");
    const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'><h:refList><h:borderFills itemCnt='1'><h:borderFill id='0'/></h:borderFills><h:charProperties itemCnt='3'><h:charPr id='0'/><h:charPr id='1' borderFillIDRef='9'/><h:charPr id='2' borderFillIDRef='0'/></h:charProperties></h:refList></h:head>";
    var tree = try @import("header_tree.zig").parse(a, prefix, 0, .{});
    defer tree.deinit(a);
    const absent = try resource_writer.target(a, &tree, "charPr", 0);
    try std.testing.expectError(error.MissingBorderFillReference, resource_writer.reference(a, &tree, absent));
    const missing_id = try resource_writer.target(a, &tree, "charPr", 1);
    const missing_ref = try resource_writer.reference(a, &tree, missing_id);
    try std.testing.expectEqual(@as(u32, 9), missing_ref);
    try std.testing.expectError(error.MissingBorderFillId, resource_writer.sourceNode(a, &tree, missing_ref));
    const valid = try resource_writer.target(a, &tree, "charPr", 2);
    const valid_ref = try resource_writer.reference(a, &tree, valid);
    try std.testing.expectEqual(@as(u32, 0), valid_ref);
    const source = try resource_writer.sourceNode(a, &tree, valid_ref);
    try std.testing.expect(tree.elements[source].is("http://www.hancom.co.kr/hwpml/2011/head", "borderFill"));
    // background도 source ID membership 검사를 우회하지 않습니다.
    try std.testing.expectError(error.MissingBorderFillId, resource_writer.write(a, &tree, missing_ref, .{ .background = .{ .solid = .{ .color = 0x123456 } } }, 1_000_000, .{}));
}
