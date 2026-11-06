const std = @import("std");
test "new document authored HWPX profile uses explicit RGB without changing unknown producer policy" {
    const a = std.testing.allocator;
    const bytes = try @import("root.zig").hwpx(a);
    defer a.free(bytes);
    const policy = @import("../hwpx/source_color_profile.zig");
    const profile = try @import("../hwpx/border_fill_profile.zig").read(a, bytes);
    try std.testing.expect(profile.verified);
    try std.testing.expectEqual(policy.Encoding.rgb24, profile.encoding);
    inline for (.{ policy.Field.win_brush_face_color, policy.Field.win_brush_hatch_color, policy.Field.character_text_color, policy.Field.other }) |field| {
        try std.testing.expectEqual(@as(u32, 0x123456), try policy.encodeNumber(profile, field, 0x123456));
        try std.testing.expectEqual(@as(?u32, 0x123456), policy.decode(profile, field, "#123456"));
    }
    var document = try @import("../hwpx/package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var metadata = try @import("../hwpx/source_version_metadata.zig").readDocument(a, &document, .{});
    defer metadata.deinit(a);
    const source = &metadata.sourceVersion.?;
    source.os = 1;
    try std.testing.expect(!policy.classify(source).verified);
    source.os = 0;
    source.micro = 9;
    try std.testing.expect(!policy.classify(source).verified);
    try std.testing.expect(!policy.classify(null).verified);
}
