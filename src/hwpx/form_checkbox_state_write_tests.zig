const std = @import("std");
const trees = @import("xml_part_tree.zig");
const subject = @import("form_checkbox_state_write.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>";
const suffix = "<p:t>뒤😀</p:t></p:run></p:p></s:sec>";
const tag = "<p:checkBtn xmlns:x='urn:other' x:value='foreign' enabled='1' editable='1' triState='1' value = '&#67;HECKED' command='never execute' unknown='keep'><p:future/></p:checkBtn>";
fn case(a: std.mem.Allocator) !void {
    const xml = prefix ++ tag ++ suffix;
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    const unchanged = try subject.write(a, &tree, 3, .checked, 4096);
    defer a.free(unchanged);
    try std.testing.expectEqualStrings(xml, unchanged);
    const output = try subject.write(a, &tree, 3, .indeterminate, 4096);
    defer a.free(output);
    const expected = prefix ++ "<p:checkBtn xmlns:x='urn:other' x:value='foreign' enabled='1' editable='1' triState='1' value = 'INDETERMINATE' command='never execute' unknown='keep'><p:future/></p:checkBtn>" ++ suffix;
    try std.testing.expectEqualStrings(expected, output);
    try std.testing.expectError(error.LimitExceeded, subject.write(std.testing.allocator, &tree, 3, .indeterminate, tree.source.len));
    try std.testing.expectEqualStrings(xml, tree.source);
}
test "HWPX checkbox state writer changes only value and preserves entity no-op under OOM" {
    try @import("../testing/allocation_failures.zig").check(case, .{});
}
test "HWPX checkbox state writer rejects unknown absent protected and unsupported tri-state requests" {
    const a = std.testing.allocator;
    inline for (.{
        .{ "<p:radioBtn enabled='1' editable='1' value='CHECKED'/>", error.NotCheckBoxForm, .unchecked },
        .{ "<p:checkBtn value='CHECKED'/>", error.MissingFormEditPermission, .unchecked },
        .{ "<p:checkBtn enabled='0' editable='1' value='CHECKED'/>", error.FormValueProtected, .unchecked },
        .{ "<p:checkBtn enabled='1' editable='0' value='CHECKED'/>", error.FormValueProtected, .unchecked },
        .{ "<p:checkBtn enabled='1' editable='1' value='FUTURE'/>", error.UnknownFormButtonState, .unchecked },
        .{ "<p:checkBtn enabled='1' editable='1'/>", error.MissingFormState, .unchecked },
        .{ "<p:checkBtn enabled='1' editable='1' value='CHECKED' triState='0'/>", error.FormTriStateUnsupported, .indeterminate },
    }) |entry| {
        var tree = try trees.parse(a, prefix ++ entry[0] ++ suffix, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(entry[1], subject.write(a, &tree, 3, @as(subject.State, entry[2]), 4096));
        try std.testing.expectEqualStrings(prefix ++ entry[0] ++ suffix, tree.source);
    }
}
test "HWPX checkbox state writer updates actual checkbox without changing other form objects" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/form-01.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |_, node| {
        if (@import("run_anchor.zig").kind(&tree, node) != .check_button) continue;
        const output = try subject.write(a, &tree, node, .unchecked, 1_000_000);
        defer a.free(output);
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, tree.source, "value=\"CHECKED\""));
        const expected = try std.mem.replaceOwned(u8, a, tree.source, "value=\"CHECKED\"", "value=\"UNCHECKED\"");
        defer a.free(expected);
        try std.testing.expectEqualStrings(expected, output);
        var changed = try trees.parse(a, output, .section, 0, 0, .{});
        defer changed.deinit(a);
        var value = try @import("form_attribute_values.zig").read(a, &changed, node, .{});
        defer value.deinit(a);
        try std.testing.expectEqual(.unchecked, (try value.buttonState()).?);
        try std.testing.expectEqualStrings("선택 상자", value.string(.caption).?);
        try std.testing.expectError(error.LimitExceeded, subject.write(a, &tree, node, .unchecked, 1));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), count);
}
