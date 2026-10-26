//! 원문은 불변이다. Company 행 전체를 보호하고 원래 plain body 행만 추가 후보로 둔다.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Plan = struct {
    protected_paragraphs: []bool,
    retained_headers: usize,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.protected_paragraphs);
        self.* = undefined;
    }
};
pub fn read(a: std.mem.Allocator, source: []const u8, version: Version, current: model.Section) !Plan {
    const owner = try @import("company_source.zig").owner(a, source, version);
    var original = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{source});
    defer original.deinit(a);
    const baseline = original.sections[0];
    if (baseline.paragraphs.len != current.paragraphs.len) return error.SourceBindingMismatch;
    const protected = try a.alloc(bool, current.paragraphs.len);
    errdefer a.free(protected);
    @memset(protected, true);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    var found = false;
    for (baseline.paragraphs, current.paragraphs, 0..) |before, after, index| {
        if (before.source_node != after.source_node or before.parent_node != after.parent_node or after.header_template != null) return error.SourceBindingMismatch;
        if (try before.originalNode() == owner) {
            if (found or !@import("../../model/equality.zig").paragraph(before, after)) return error.SourceBindingMismatch;
            found = true;
            continue;
        }
        if (!try @import("company_source.zig").isPlainBody(a, tree, before)) {
            if (!@import("../../model/equality.zig").paragraph(before, after)) return error.SourceBindingMismatch;
            continue;
        }
        if (after.field_attributes != null or after.formula_results != null) return error.SourceBindingMismatch;
        const now = try @import("plain_text_content.zig").textBytes(a, after);
        defer a.free(now);
        try @import("plain_text_content.zig").validatePlain(now);
        protected[index] = false;
    }
    if (!found) return error.SourceBindingMismatch;
    return .{ .protected_paragraphs = protected, .retained_headers = 1 };
}
