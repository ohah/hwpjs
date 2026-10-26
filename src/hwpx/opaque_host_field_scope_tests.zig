const std = @import("std");
const editor = @import("editor_session.zig");
const a = std.testing.allocator;

test "opaque host field scope retains actual anchors after unrelated insertion" {
    const cases = .{
        .{ "reference/rhwp/samples/issue1893_clickhere_field_roundtrip.hwpx", &[_]usize{ 2, 29 } },
        .{ "reference/rhwp/samples/issue5880/rowbreak_fragment_overfill.hwpx", &[_]usize{2} },
        .{ "reference/rhwp/samples/issue6124/2737927_housing_evaluation_guideline.hwpx", &[_]usize{2} },
    };
    inline for (cases) |case| {
        const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, case[0], a, .limited(64 * 1024 * 1024)) catch |err| switch (err) {
            error.FileNotFound => return error.SkipZigTest,
            else => return err,
        };
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        for (case[1]) |paragraph| {
            const text = try session.anchorText(0, paragraph);
            defer a.free(text);
            try std.testing.expectEqualStrings("\xef\xbf\xbc", text);
        }
        try std.testing.expect(try session.splice(0, 1, 0, 0, "outside"));
        for (case[1]) |paragraph| {
            const text = try session.anchorText(0, paragraph);
            defer a.free(text);
            try std.testing.expectEqualStrings("\xef\xbf\xbc", text);
            try std.testing.expect(!try session.canEdit(0, paragraph));
        }
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try editor.open(a, saved, .{});
        defer reopened.deinit();
        for (case[1]) |paragraph| {
            const text = try reopened.anchorText(0, paragraph);
            defer a.free(text);
            try std.testing.expectEqualStrings("\xef\xbf\xbc", text);
        }
        try std.testing.expectEqualSlices(u8, input, session.source);
    }
}

test "opaque host field scope keeps nested label protected and host object retained" {
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>outside</p:t></p:run></p:p>" ++
        "<p:p><p:run><p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></p:subList></p:tc></p:tr></p:tbl><p:t/></p:run></p:p></s:sec>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try session.splice(0, 1, 0, 0, "Q"));
    const anchor = try session.anchorText(0, 2);
    defer a.free(anchor);
    try std.testing.expectEqualStrings("\xef\xbf\xbc", anchor);
    try std.testing.expect(!try session.canEdit(0, 3));
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, 3, 0, 0, "NO"));
    try std.testing.expectError(error.ProtectedInlineControl, session.spliceAnchored(0, 2, 0, 1, ""));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
