const std = @import("std");
const a = std.testing.allocator;
const editor = @import("hwpx/editor_session.zig");
const Current = @import("hwpx/form_read_context.zig").Context;
const Legacy = @import("hwpx/form_read_context_r7_legacy_test.zig").Context;
fn open() !editor.Session {
    var xml: std.ArrayList(u8) = .empty;
    defer xml.deinit(a);
    try xml.appendSlice(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:edit enabled='1' editable='1'><p:text>unowned</p:text></p:edit>");
    for (0..64) |_| try xml.appendSlice(a, "<p:p id='0'><p:run><p:t>BODY😀</p:t><p:edit enabled='1' editable='1' readOnly='0' numOnly='0' multiLine='1'><p:text>source😀é</p:text></p:edit><p:unknown><p:edit><p:text>inactive</p:text></p:edit></p:unknown></p:run></p:p>");
    try xml.appendSlice(a, "</s:sec>");
    const bytes = try @import("hwpx/test_formula_fixture.zig").zipWithSection(a, xml.items);
    defer a.free(bytes);
    return editor.open(a, bytes, .{});
}
test "R8 bool owner presence matches frozen nearest owner validation for every actual Native node" {
    var s = try open();
    defer s.deinit();
    var current = Current.init(&s, 0);
    defer current.deinit();
    var legacy = Legacy.init(&s, 0);
    defer legacy.deinit();
    var accepted: usize = 0;
    var rejected: usize = 0;
    for (0..s.sections[0].tree.elements.len + 1) |node| {
        if (legacy.validate(&s, 0, node)) |_| {
            try current.validate(&s, 0, node);
            accepted += 1;
        } else |err| {
            try std.testing.expectError(err, current.validate(&s, 0, node));
            rejected += 1;
        }
    }
    for (legacy.index.?.owners, current.index.?.owners) |nearest, has_owner| {
        try std.testing.expectEqual(nearest != null, has_owner);
    }
    try std.testing.expect(accepted > 0 and rejected > 0);
    std.debug.print("R8 actual Native validation nodes={d} accepted={d} rejected={d}\n", .{ s.sections[0].tree.elements.len + 1, accepted, rejected });
}
fn allocationBytes(comptime C: type, s: *editor.Session, node: usize) !usize {
    var allocator = std.testing.FailingAllocator.init(a, .{});
    s.allocator = allocator.allocator();
    defer s.allocator = a;
    var context = C.init(s, 0);
    try context.validate(s, 0, node);
    context.deinit();
    try std.testing.expectEqual(allocator.allocated_bytes, allocator.freed_bytes);
    return allocator.allocated_bytes;
}
test "R8 Native owner presence saves exactly optional usize minus bool bytes per tree element" {
    var s = try open();
    defer s.deinit();
    const tree = &s.sections[0].tree;
    var selected: ?usize = null;
    for (tree.elements, 0..) |_, i| if (@import("hwpx/run_anchor.zig").kind(tree, i) == .edit_box and tree.elements[i].parent != null) {
        var probe = Legacy.init(&s, 0);
        defer probe.deinit();
        probe.validate(&s, 0, i) catch continue;
        selected = i;
        break;
    };
    const node = selected orelse return error.NoOwnedForm;
    const before = try allocationBytes(Legacy, &s, node);
    const after = try allocationBytes(Current, &s, node);
    const saving = (@sizeOf(?usize) - @sizeOf(bool)) * tree.elements.len;
    try std.testing.expectEqual(saving, before - after);
    std.debug.print("R8 Native memory elements={d} optional_usize={d} bool={d} allocated_before={d} allocated_after={d} saved={d}\n", .{ tree.elements.len, @sizeOf(?usize), @sizeOf(bool), before, after, saving });
}
