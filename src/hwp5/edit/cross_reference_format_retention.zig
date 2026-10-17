//! Shared semantic predicates for retaining local numeric object labels.
//! Callers must preserve declarations and protect derived text result spans.
//! Retention does not resolve a target or certify the stored result as current.
const command = @import("../body/cross_reference_command.zig");
pub fn tableNumber(view: command.View) !bool {
    return localNumber(view, false);
}

pub fn objectNumber(view: command.View) !bool {
    return localNumber(view, true);
}

fn localNumber(view: command.View, object_numbers: bool) !bool {
    const semantic = try view.semantics();
    return view.external_document == null and semantic.content == .number_or_name and
        (if (object_numbers) semantic.targetSpace() == .object_instance else semantic.object == .table);
}

test "object number retention includes picture and equation IDs but excludes page text notes and external targets" {
    const std = @import("std");
    const Case = struct { text: []const u8, allowed: bool };
    for ([_]Case{
        .{ .text = "?#1;0;1;0;0;", .allowed = true },
        .{ .text = "?#1;1;1;0;0;", .allowed = true },
        .{ .text = "?#1;2;1;1;2;", .allowed = true },
        .{ .text = "?#1;1;0;0;0;", .allowed = false },
        .{ .text = "?#1;1;2;0;0;", .allowed = false },
        .{ .text = "?#1;1;3;0;0;", .allowed = false },
        .{ .text = "?#1;3;1;0;0;", .allowed = false },
        .{ .text = "?#1;4;1;0;0;", .allowed = false },
        .{ .text = "?#1;5;1;0;0;", .allowed = false },
        .{ .text = "?name;6;1;0;0;", .allowed = false },
        .{ .text = "other.hwp?#1;1;1;0;0;", .allowed = false },
    }) |case| {
        var bytes: [128]u8 = @splat(0);
        for (case.text, 0..) |ch, i| bytes[i * 2] = ch;
        try std.testing.expectEqual(case.allowed, try objectNumber(try command.View.parse(bytes[0 .. case.text.len * 2])));
    }
    var invalid: command.View = .{ .target = .{ .numeric = 1 }, .external_document = null, .options = .{ 1, 1, 2, 0 }, .raw = "" };
    try std.testing.expectError(error.UnsupportedCrossReferenceHyperlink, objectNumber(invalid));
    invalid.options = .{ 1, 1, 0, 3 };
    try std.testing.expectError(error.UnsupportedCrossReferenceOpenMode, objectNumber(invalid));
    invalid.options = .{ 7, 1, 0, 0 };
    try std.testing.expectError(error.UnsupportedCrossReferenceObjectKind, objectNumber(invalid));
}

test "table number format retention rejects external page text and malformed semantics" {
    const std = @import("std");
    const Case = struct { text: []const u8, allowed: bool };
    for ([_]Case{
        .{ .text = "?#0;0;1;0;0;", .allowed = true },
        .{ .text = "?#4294967295;0;1;1;2;", .allowed = true },
        .{ .text = "other.hwp?#1;0;1;0;0;", .allowed = false },
        .{ .text = "?#1;0;0;0;0;", .allowed = false },
        .{ .text = "?#1;0;2;0;0;", .allowed = false },
        .{ .text = "?#1;0;3;0;0;", .allowed = false },
        .{ .text = "?#1;1;1;0;0;", .allowed = false },
        .{ .text = "?bookmark;6;1;0;0;", .allowed = false },
    }) |case| {
        var bytes: [128]u8 = @splat(0);
        for (case.text, 0..) |ch, i| bytes[i * 2] = ch;
        try std.testing.expectEqual(case.allowed, try tableNumber(try command.View.parse(bytes[0 .. case.text.len * 2])));
    }
    var invalid: command.View = .{ .target = .{ .numeric = 1 }, .external_document = null, .options = .{ 0, 1, 2, 0 }, .raw = "" };
    try std.testing.expectError(error.UnsupportedCrossReferenceHyperlink, tableNumber(invalid));
    invalid.options = .{ 0, 1, 0, 3 };
    try std.testing.expectError(error.UnsupportedCrossReferenceOpenMode, tableNumber(invalid));
}
