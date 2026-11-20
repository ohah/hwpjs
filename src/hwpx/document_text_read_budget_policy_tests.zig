//! Own policy tests: no external implementation or expected JSON.
const std = @import("std");
const policy = @import("document_text_read_options.zig");
const editor = @import("editor_session.zig");

test "document read budget policy defaults track semantic cap with checked multiplication" {
    try std.testing.expectEqual(@as(usize, 128 * 1024 * 1024), try policy.retainedBytes(.{}));
    try std.testing.expectEqual(@as(usize, 124), (try policy.fromSession(.{ .max_text_bytes = 62 })).max_bytes);
    try std.testing.expectEqual(@as(usize, 0), try policy.retainedBytes(.{ .max_text_bytes = 0 }));
}

test "document read budget policy explicit cap remains independent including zero" {
    for ([_]usize{ 0, 1, 61, 122, 124, std.math.maxInt(usize) }) |cap| {
        const options: editor.Options = .{ .max_text_bytes = 62, .max_read_retained_bytes = cap };
        try std.testing.expectEqual(cap, (try policy.fromSession(options)).max_bytes);
        try std.testing.expectEqual(@as(usize, 62), options.max_text_bytes);
    }
}

test "document read budget policy default arithmetic exact edge and one over refuse overflow" {
    const edge = std.math.maxInt(usize) / 2;
    try std.testing.expectEqual(edge * 2, try policy.retainedBytes(.{ .max_text_bytes = edge }));
    try std.testing.expectError(error.LimitExceeded, policy.fromSession(.{ .max_text_bytes = edge + 1 }));
    try std.testing.expectError(error.LimitExceeded, policy.fromSession(.{ .max_text_bytes = std.math.maxInt(usize) }));
    try std.testing.expectEqual(@as(usize, 7), try policy.retainedBytes(.{ .max_text_bytes = std.math.maxInt(usize), .max_read_retained_bytes = 7 }));
}

test "document read budget policy explicit retained cap admits visible controls beyond semantic text" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1' paraPrIDRef='0' styleIDRef='0'><p:run charPrIDRef='0'><p:t>A<p:tab/>B<p:lineBreak/>C</p:t></p:run></p:p></s:sec>";
    const bytes = try @import("document_text_test_fixture.zig").inputWithSection(a, xml);
    defer a.free(bytes);
    const state: @import("../model/formatting_binding.zig").State = .{ .epoch = 7, .opened = true };
    const stamp: @import("../model/document_text_read_binding.zig").Stamp = .{ .epoch = 7, .serial = 13 };
    var session = try editor.open(a, bytes, .{ .max_text_bytes = 3, .max_read_retained_bytes = 8 });
    defer session.deinit();
    try std.testing.expectEqual(@as(usize, 3), try session.sections[0].textBytes(3));
    var observed = try @import("document_text_snapshot.zig").observe(a, &session, state, null);
    defer observed.deinit();
    try std.testing.expectEqual(@as(usize, 1), observed.snapshot.rows.items.len);
    try std.testing.expectEqualStrings("A\tB\nC", observed.snapshot.rows.items[0].text);
    try observed.snapshot.bindReadStamp(stamp);
    var selection = try @import("document_text_selection.zig").query(a, &session, state, null, .{
        .binding = observed.snapshot.binding,
        .read_stamp = stamp,
        .ref = observed.snapshot.rows.items[0].ref,
        .start = 1,
        .end = 2,
        .expected = "\t",
    });
    defer selection.deinit();
    try std.testing.expectEqualStrings("A\tB\nC", selection.before_text);
    var anchor = try @import("document_text_anchor.zig").query(a, &session, state, null, .{
        .binding = observed.snapshot.binding,
        .read_stamp = stamp,
        .section = 0,
        .target = .{ .paragraph = .{ .paragraph = 1 } },
        .unit = 3,
        .before_text = "A\tB\nC",
    });
    defer anchor.deinit();
    try std.testing.expectEqualStrings(observed.snapshot.rows.items[0].ref, anchor.ref);
    try std.testing.expectEqual(@as(u32, 3), anchor.unit);
    session.options.max_read_retained_bytes = 7;
    if (@import("document_text_snapshot.zig").observe(a, &session, state, null)) |value| {
        var unexpected = value;
        defer unexpected.deinit();
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(error.LimitExceeded, err);
}
