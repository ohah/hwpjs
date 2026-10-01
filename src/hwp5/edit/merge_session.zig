//! Atomic native merge topology and serialization verification.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Merge = struct { section: usize, paragraph: usize };

pub fn apply(a: std.mem.Allocator, decoded: []const []u8, document: *model.Document, version: Version, command: Merge, char_count: usize, output_limit: usize) !void {
    if (command.section >= document.sections.len or decoded.len != document.sections.len) return error.InvalidSection;
    for (decoded) |bytes| try @import("source_policy.zig").validate(bytes);
    const raw = decoded[command.section];
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, raw, version, .{});
    defer tree.deinit(a);
    const current = document.sections[command.section];
    var plan = try @import("structure_plan.zig").buildWithDeletions(a, tree, current, version, true);
    defer plan.deinit(a);
    _ = try @import("paragraph_merge_scope.zig").validate(a, tree, current, command.paragraph, version);
    const left = current.paragraphs[command.paragraph];
    const right = current.paragraphs[command.paragraph + 1];
    for ([_]model.Paragraph{ left, right }) |p| {
        const eligible = try @import("plain_text_source.zig").validate(a, raw, version, p, char_count);
        if (eligible.preserved_direct_records != 0) return error.UnsupportedStructuralControl;
        if (eligible.ranges) |ranges| if (ranges.count() != 0) return error.UnsupportedRangeSemantics;
    }
    var draft = try @import("../../model/clone.zig").section(a, current);
    defer draft.deinit(a);
    var merged = try @import("paragraph_merge.zig").prepare(a, left, right, char_count, output_limit);
    var transferred = false;
    defer if (!transferred) merged.deinit(a);
    const next = try a.alloc(model.Paragraph, draft.paragraphs.len - 1);
    @memcpy(next[0..command.paragraph], draft.paragraphs[0..command.paragraph]);
    next[command.paragraph] = merged;
    @memcpy(next[command.paragraph + 1 ..], draft.paragraphs[command.paragraph + 2 ..]);
    draft.paragraphs[command.paragraph].deinit(a);
    draft.paragraphs[command.paragraph + 1].deinit(a);
    a.free(draft.paragraphs);
    draft.paragraphs = next;
    transferred = true;
    if (right.source_node) |removed| {
        const template = left.source_node orelse left.header_template orelse return error.MissingParagraphTemplate;
        for (draft.paragraphs[command.paragraph + 1 ..]) |*p| {
            if (p.source_node == null and p.header_template == removed) p.header_template = template;
        }
    }
    const verified = try @import("structure_section_writer.zig").writeWithDeletions(a, raw, draft, version, char_count, output_limit, true);
    defer a.free(verified);
    std.mem.swap(model.Section, &document.sections[command.section], &draft);
}
