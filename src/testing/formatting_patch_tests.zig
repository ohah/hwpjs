//! Compile/run only after the existing fullNative job has terminated.
const std = @import("std");
const decoder = @import("../wasm/formatting_patch_request.zig");
const observation = @import("../model/formatting_observation.zig");
test "formatting request preserves sparse color-only and explicit false" {
    var request = try decoder.decode(std.testing.allocator,
        \\{"schemaVersion":1,"binding":{"session":"s1","revision":0},"targets":[{"ref":"r1","ranges":[{"startUnit":0,"endUnit":2}]}],"patch":{"character":{"bold":false,"underline":{"color":0},"strike":{"color":16777215}}}}
    );
    defer request.deinit();
    const p = request.value.patch.character;
    try std.testing.expectEqual(@as(?bool, false), p.bold);
    try std.testing.expectEqual(@as(?u32, 0), p.underline_color);
    try std.testing.expectEqual(@as(?u32, 0xffffff), p.strike_color);
    try std.testing.expect(p.underline_kind == null and p.strike_enabled == null);
}
test "formatting strict last-field validation and duplicate keys reject" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidParagraphSpacing, decoder.decode(a,
        \\{"schemaVersion":1,"binding":{"session":"s1","revision":0},"targets":[{"ref":"r1","ranges":[{"startUnit":0,"endUnit":2}]}],"patch":{"character":{"bold":true},"paragraph":{"spacing":{"kind":"percent","value":501}}}}
    ));
    try std.testing.expectError(error.DuplicateField, decoder.decode(a,
        \\{"schemaVersion":1,"schemaVersion":1,"binding":{"session":"s1","revision":0},"targets":[{"ref":"r1"}],"patch":{}}
    ));
}
fn equal(a: u32, b: u32) bool {
    return a == b;
}
test "query aggregate never discards unavailable or unknown owners" {
    const O = observation.Observation(u32);
    const known: O = .{ .state = .known, .value = 1, .writable = true };
    const unknown: O = .{ .state = .unknown, .reason = "MissingSourceField", .writable = false, .writeUnavailableReason = "NoCreationWriter" };
    const unavailable: O = .{ .state = .unavailable, .reason = "UnsupportedOwner", .writable = false, .writeUnavailableReason = "UnsupportedOwner" };
    const value = try observation.aggregate(u32, &.{ known, unknown, unavailable }, equal);
    try std.testing.expectEqualDeep(O{ .state = .unavailable, .reason = "UnsupportedOwner", .writable = false, .writeUnavailableReason = "NoCreationWriter" }, value);
}
