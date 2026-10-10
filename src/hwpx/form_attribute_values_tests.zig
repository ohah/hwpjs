const std = @import("std");
const subject = @import("form_attribute_values.zig");
const trees = @import("xml_part_tree.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";
fn case(a: std.mem.Allocator) !void {
    const xml = prefix ++ "<p:checkBtn caption='한글&amp;😀' name='' value='INDETERMINATE' enabled='0' editable='1' triState='true' tabOrder='0'/>" ++ suffix;
    var tree = try trees.parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var value = try subject.read(a, &tree, 3, .{});
    defer value.deinit(a);
    try std.testing.expectEqualStrings("한글&😀", value.string(.caption).?);
    try std.testing.expectEqualStrings("", value.string(.name).?);
    try std.testing.expect(value.string(.command) == null);
    try std.testing.expectEqual(@as(?bool, false), value.boolean(.enabled));
    try std.testing.expectEqual(@as(?bool, true), value.boolean(.triState));
    try std.testing.expect(value.boolean(.numOnly) == null);
    try std.testing.expectEqual(@as(?u32, 0), value.integer(.tabOrder));
    try std.testing.expect(value.integer(.maxLength) == null);
    try std.testing.expectEqual(.indeterminate, (try value.buttonState()).?);
    try std.testing.expectEqualStrings(xml, tree.source);
}
test "HWPX form attributes preserve absent empty false zero and tri-state under OOM" {
    try @import("../testing/allocation_failures.zig").check(case, .{});
}
test "HWPX form attributes retain unknown button state and refuse invalid booleans or overflow" {
    const a = std.testing.allocator;
    inline for (.{ "<p:checkBtn value='FUTURE'/>", "<p:checkBtn enabled='TRUE'/>", "<p:edit maxLength='4294967296'/>", "<p:edit maxLength='-1'/>" }, 0..) |body, index| {
        var tree = try trees.parse(a, prefix ++ body ++ suffix, .section, 0, 0, .{});
        defer tree.deinit(a);
        if (index == 0) {
            var value = try subject.read(a, &tree, 3, .{});
            defer value.deinit(a);
            try std.testing.expectEqualStrings("FUTURE", value.string(.value).?);
            try std.testing.expectError(error.UnknownFormButtonState, value.buttonState());
        } else try std.testing.expectError(if (index == 1) error.InvalidXmlBoolean else if (index == 2) error.InvalidUnsigned32 else error.InvalidNonNegativeInteger, subject.read(a, &tree, 3, .{}));
    }
}
test "HWPX form attributes read five actual form types without inventing defaults" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/form-01.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var document = try @import("package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |_, node| {
        const kind = @import("run_anchor.zig").kind(&tree, node) orelse continue;
        switch (kind) {
            .button, .check_button, .radio_button, .combo_box, .edit_box => {},
            else => continue,
        }
        var value = try subject.read(a, &tree, node, .{});
        defer value.deinit(a);
        try std.testing.expectEqual(@as(?bool, true), value.boolean(.enabled));
        if (kind == .check_button) try std.testing.expectEqual(.checked, (try value.buttonState()).?);
        if (kind == .combo_box) try std.testing.expectEqualStrings("", value.string(.selectedValue).?);
        if (kind == .edit_box) try std.testing.expectEqual(@as(?u32, 2147483647), value.integer(.maxLength));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 5), count);
}

test "HWPX form attributes keep namespaces ownership and budgets explicit" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, prefix ++ "<p:comboBox xmlns:x='urn:other' x:enabled='1' name='owned😀' selectedValue=''/>" ++ suffix, .section, 0, 0, .{});
    var tree_live = true;
    defer if (tree_live) tree.deinit(a);
    var value = try subject.read(a, &tree, 3, .{});
    defer value.deinit(a);
    try std.testing.expect(value.boolean(.enabled) == null);
    try std.testing.expectError(error.NotButtonForm, value.buttonState());
    try std.testing.expectError(error.LimitExceeded, subject.read(a, &tree, 3, .{ .max_attribute_bytes = 1 }));
    try std.testing.expectError(error.InvalidFormNode, subject.read(a, &tree, tree.elements.len, .{}));
    try std.testing.expectError(error.InvalidFormNode, subject.read(a, &tree, 2, .{}));
    tree.deinit(a);
    tree_live = false;
    try std.testing.expectEqualStrings("owned😀", value.string(.name).?);
    try std.testing.expectEqualStrings("", value.string(.selectedValue).?);
    var foreign = try trees.parse(a, prefix ++ "<x:checkBtn xmlns:x='urn:other' value='CHECKED'/>" ++ suffix, .section, 0, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectError(error.InvalidFormNode, subject.read(a, &foreign, 3, .{}));
}
