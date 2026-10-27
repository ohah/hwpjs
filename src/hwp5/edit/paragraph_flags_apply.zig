//! 동일한 source-bound 문단 clone과 기존 undo owner를 사용합니다.
pub fn apply(a: @import("std").mem.Allocator, document: *@import("../../model/document.zig").Document, decoded: []const u8, version: @import("../version.zig").Version, original_count: usize, section: usize, paragraph: usize, flags: @import("../../model/paragraph_flags.zig").Patch, limit: usize) !void {
    return @import("paragraph_alignment_apply.zig").applyWithFlags(a, document, decoded, version, original_count, section, paragraph, null, .{}, null, flags, limit);
}
