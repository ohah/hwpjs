//! 문서 producer 해석은 기존 Native profile SSOT만 사용합니다.
const std = @import("std");
pub fn read(a: std.mem.Allocator, source: []const u8) !@import("source_color_profile.zig").Profile {
    var document = try @import("package.zig").inspectDocument(a, source, .{});
    defer document.deinit(a);
    var producer = try @import("source_version_metadata.zig").readDocument(a, &document, .{});
    defer producer.deinit(a);
    return @import("source_color_profile.zig").classify(if (producer.sourceVersion) |*v| v else null);
}

pub fn needs(properties: @import("../model/document.zig").CharacterPropertyPatch) bool {
    return properties.text_color != null or (if (properties.border_fill) |resource| needsBorder(resource) else false);
}
pub fn needsBorder(resource: @import("../model/border_fill_patch.zig").Patch) bool {
    return if (resource.background) |background| background != .none else false;
}
