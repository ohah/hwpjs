const std = @import("std");
const trees = @import("section_tree.zig");
const subject = @import("form_checkbox_state_save.zig");
const Entry = @import("form_checkbox_state_values.zig").Entry;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const checkbox = "<p:checkBtn enabled='1' editable='1' triState='1' value='CHECKED' name='unique'/>";
const source = prefix ++ "<p:p><p:run>" ++ checkbox ++ "<p:t>B</p:t></p:run></p:p></s:sec>";
const shifted = prefix ++ "<p:p><p:run><p:t>앞😀</p:t>" ++ checkbox ++ "<p:t>B</p:t></p:run></p:p></s:sec>";
test "HWPX checkbox state save binds shifted nodes and preserves all source under OOM" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *@import("xml_part_tree.zig").Tree) !void {
            const output = try subject.write(allocator, parsed, shifted, &.{.{ .form_node = 3, .state = .unchecked }}, 4096);
            defer allocator.free(output);
            const expected = try std.mem.replaceOwned(u8, allocator, shifted, "value='CHECKED'", "value='UNCHECKED'");
            defer allocator.free(expected);
            try std.testing.expectEqualStrings(expected, output);
        }
    }.run, .{&tree});
    try std.testing.expectEqualStrings(source, tree.source);
}
test "HWPX checkbox state save rejects removed changed duplicate and foreign-owner targets" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const entry: Entry = .{ .form_node = 3, .state = .unchecked };
    inline for (.{ prefix ++ "<p:p><p:run><p:t>B</p:t></p:run></p:p></s:sec>", prefix ++ "<p:p><p:run>" ++ checkbox ++ checkbox ++ "<p:t>B</p:t></p:run></p:p></s:sec>", prefix ++ "<p:p><p:run><p:container><p:subList><p:p><p:run>" ++ checkbox ++ "</p:run></p:p></p:subList></p:container></p:run></p:p></s:sec>" }) |changed| {
        try std.testing.expectError(error.SourceBindingMismatch, subject.write(a, &tree, changed, &.{entry}, 4096));
    }
    try std.testing.expectError(error.DuplicateFormStateEdit, subject.write(a, &tree, shifted, &.{ entry, entry }, 4096));
    const altered = try std.mem.replaceOwned(u8, a, source, "name='unique'", "name='changed'");
    defer a.free(altered);
    try std.testing.expectError(error.SourceBindingMismatch, subject.write(a, &tree, altered, &.{entry}, 4096));
}
