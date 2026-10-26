//! Atomic native merge topology and serialization verification.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Merge = struct { section: usize, paragraph: usize };

pub fn apply(a: std.mem.Allocator, decoded: []const []u8, document: *model.Document, version: Version, command: Merge, char_count: usize, output_limit: usize) !void {
    if (command.section >= document.sections.len or decoded.len != document.sections.len) return error.InvalidSection;
    for (decoded, 0..) |bytes, index| {
        if (index != command.section) try @import("source_policy.zig").validateUnselectedStructureSection(a, bytes, version);
    }
    const raw = decoded[command.section];
    const formulas = try @import("structure_source_policy.zig").inspect(a, raw, version);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, raw, version, .{});
    defer tree.deinit(a);
    const current = document.sections[command.section];
    var plan = try @import("structure_plan.zig").buildWithDeletions(a, tree, current, version, true);
    defer plan.deinit(a);
    _ = try @import("paragraph_merge_scope.zig").validate(a, tree, current, command.paragraph, version);
    const left = current.paragraphs[command.paragraph];
    const right = current.paragraphs[command.paragraph + 1];
    const restart = try @import("page_restart_merge_plan.zig").read(a, tree, current.paragraphs, command.paragraph);
    for ([_]model.Paragraph{ left, right }) |p| {
        if (formulas) try @import("formula_structure_scope.zig").validate(a, raw, version, p);
        const eligible = try @import("plain_text_source.zig").validateStructureTransaction(a, raw, version, p, char_count);
        if (eligible.preserved_direct_records != 0) {
            const binding = restart orelse return error.UnsupportedStructuralControl;
            if ((p.source_node orelse p.header_template) != @as(u32, @intCast(binding.source_paragraph)) and p.restart_control_source != binding.control_node) return error.UnsupportedStructuralControl;
        }
        if (eligible.ranges) |ranges| if (ranges.count() != 0) return error.UnsupportedRangeSemantics;
    }
    var draft = try @import("../../model/clone.zig").section(a, current);
    defer draft.deinit(a);
    var first = left;
    var second = right;
    if (restart) |binding| {
        first.deferred_direct_records = binding.left_records;
        second.deferred_direct_records = binding.right_records;
    }
    var merged = if (restart != null)
        try @import("paragraph_merge.zig").prepareRestart(a, first, second, char_count, output_limit)
    else
        try @import("paragraph_merge.zig").prepare(a, first, second, char_count, output_limit);
    if (restart) |binding| merged.restart_control_source = binding.reference;
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
