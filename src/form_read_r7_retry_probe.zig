const std = @import("std");
const a = std.testing.allocator;
const editor = @import("hwpx/editor_session.zig");
fn open() !editor.Session {
    const b = try @import("hwpx/test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>BODY</p:t><p:edit enabled='1' editable='1' readOnly='0' numOnly='0'><p:text>source😀</p:text></p:edit></p:run></p:p></s:sec>");
    defer a.free(b);
    return editor.open(a, b, .{});
}
fn node(s: *const editor.Session) !usize {
    for (s.sections[0].tree.elements, 0..) |_, i| if (@import("hwpx/run_anchor.zig").kind(&s.sections[0].tree, i) == .edit_box) return i;
    return error.MissingForm;
}
test "R7 retry failed owner index and content traversal never cache OOM" {
    var s = try open();
    defer s.deinit();
    const n = try node(&s);
    const before = try s.save();
    defer a.free(before);
    var c = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer c.deinit();
    var failure = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    s.allocator = failure.allocator();
    try std.testing.expectError(error.OutOfMemory, c.read(&s, 0, n));
    s.allocator = a;
    try std.testing.expect(c.index == null);
    try std.testing.expect(c.contents == null);
    try c.validate(&s, 0, n);
    failure = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    s.allocator = failure.allocator();
    try std.testing.expectError(error.OutOfMemory, c.read(&s, 0, n));
    s.allocator = a;
    try std.testing.expect(c.index != null);
    try std.testing.expect(c.contents == null);
    const t = try c.read(&s, 0, n);
    defer a.free(t);
    try std.testing.expectEqualStrings("source😀", t);
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(s.form_read_context == null);
}
test "R7 retry failed anchor metadata preparation never caches OOM" {
    var s = try open();
    defer s.deinit();
    const n = try node(&s);
    var current = try @import("hwpx/display_current_paragraphs.zig").read(a, &s.sections[0], s.options);
    defer current.deinit(a);
    var index = try @import("hwpx/form_display_index.zig").Index.init(a, &s.sections[0].tree, current.paragraphs);
    defer index.deinit();
    var failure = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    index.a = failure.allocator();
    try std.testing.expectError(error.OutOfMemory, index.position(0, n));
    index.a = a;
    try std.testing.expect(index.units[0] == null);
    try std.testing.expectEqual(@as(usize, 4), try index.position(0, n));
}
