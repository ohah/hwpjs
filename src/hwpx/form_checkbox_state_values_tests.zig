const std = @import("std");
const trees = @import("xml_part_tree.zig");
const subject = @import("form_checkbox_state_values.zig");
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:checkBtn enabled='1' editable='1' triState='1' value='CHECKED'/></p:run></p:p></s:sec>";
fn case(a: std.mem.Allocator) !void {
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var values: subject.Values = .empty;
    defer values.deinit(a);
    try std.testing.expect(!try subject.set(a, &tree, &values, 3, .checked, 4096));
    try std.testing.expect(try subject.set(a, &tree, &values, 3, .unchecked, 4096));
    try std.testing.expectEqual(.unchecked, try subject.read(a, &tree, &values, 3));
    try std.testing.expect(!try subject.set(a, &tree, &values, 3, .unchecked, 4096));
    try std.testing.expect(try subject.set(a, &tree, &values, 3, .checked, 4096));
    try std.testing.expectEqual(@as(usize, 0), values.items.len);
    try std.testing.expectEqualStrings(xml, tree.source);
}
test "HWPX checkbox pending values remove restored state and preserve no-op under OOM" {
    try @import("../testing/allocation_failures.zig").check(case, .{});
}
test "HWPX checkbox pending values preserve an existing state on failed validation allocations" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const trees.Tree) !void {
            var values: subject.Values = .empty;
            defer values.deinit(std.testing.allocator);
            try values.append(std.testing.allocator, .{ .form_node = 3, .state = .unchecked });
            _ = subject.set(allocator, parsed, &values, 3, .indeterminate, 4096) catch |err| {
                try std.testing.expectEqual(.unchecked, values.items[0].state);
                return err;
            };
            try std.testing.expectEqual(.indeterminate, values.items[0].state);
        }
    }.run, .{&tree});
    var duplicated: subject.Values = .empty;
    defer duplicated.deinit(a);
    try duplicated.appendSlice(a, &.{ .{ .form_node = 3, .state = .unchecked }, .{ .form_node = 3, .state = .indeterminate } });
    try std.testing.expectError(error.DuplicateFormStateEdit, subject.read(a, &tree, &duplicated, 3));
}
