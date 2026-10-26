const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const save = @import("equation_script_save.zig");
const Entry = @import("equation_script_values.zig").Entry;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>";
const tail = "</p:t><p:equation baseLine='7'><p:script>A</p:script></p:equation><p:equation><p:script>B</p:script></p:equation></p:run><p:linesegarray/></p:p><p:p><p:linesegarray/></p:p></s:sec>";
const body = prefix ++ "long😀body" ++ tail;
const expected = prefix ++ "long😀body</p:t><p:equation baseLine='7'><p:script>X&lt;&amp;</p:script></p:equation><p:equation><p:script>Y</p:script></p:equation></p:run></p:p><p:p><p:linesegarray/></p:p></s:sec>";

test "equation script composed save rebinds body offsets and invalidates only owning cache" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, prefix ++ "old" ++ tail, 0, 0, .{});
    defer tree.deinit(a);
    var x = [_]u8{ 'X', '<', '&' };
    var y = [_]u8{'Y'};
    const entries = [_]Entry{ .{ .equation = 4, .text = &x }, .{ .equation = 6, .text = &y } };
    const output = try save.write(a, &tree, body, &entries, .{});
    defer a.free(output);
    try std.testing.expectEqualStrings(expected, output);
    try std.testing.expectError(error.DuplicateEquationScriptEdit, save.write(a, &tree, body, &.{ entries[0], entries[0] }, .{}));
    try std.testing.expectError(error.SourceBindingMismatch, save.write(a, &tree, prefix ++ "other</p:t><p:equation baseLine='8'><p:script>A</p:script></p:equation></p:run></p:p></s:sec>", &entries, .{}));
    const stale = prefix ++ "long😀body</p:t><p:equation baseLine='7'><p:script>changed</p:script></p:equation><p:equation><p:script>B</p:script></p:equation></p:run><p:linesegarray/></p:p><p:p><p:linesegarray/></p:p></s:sec>";
    try std.testing.expectError(error.SourceBindingMismatch, save.write(a, &tree, stale, &entries, .{}));
    var original_text = [_]u8{'A'};
    const no_op = try save.write(a, &tree, body, &.{.{ .equation = 4, .text = &original_text }}, .{});
    defer a.free(no_op);
    try std.testing.expectEqualStrings(body, no_op);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const Tree, edits: []const Entry) !void {
            const xml = try save.write(allocator, original, body, edits, .{});
            defer allocator.free(xml);
            try std.testing.expectEqualStrings(expected, xml);
        }
    }.run, .{ &tree, &entries });
    try std.testing.expectEqualStrings(prefix ++ "old" ++ tail, tree.source);
}
