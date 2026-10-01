//! Prepare and verify split topology before swapping the current native section.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Split = struct { section: usize, paragraph: usize, at_unit: u32, end_unit: ?u32 = null };

pub fn split(a: std.mem.Allocator, decoded: []const []u8, document: *model.Document, version: Version, edit: Split, char_count: usize, output_limit: usize) !void {
    if (edit.section >= document.sections.len or decoded.len != document.sections.len) return error.InvalidSection;
    if (edit.paragraph >= document.sections[edit.section].paragraphs.len) return error.InvalidParagraph;
    var sections: std.ArrayList([]const u8) = .empty;
    defer sections.deinit(a);
    for (decoded) |bytes| {
        try @import("source_policy.zig").validate(bytes);
        try sections.append(a, bytes);
    }
    var ids: std.ArrayList(u32) = .empty;
    defer ids.deinit(a);
    for (document.sections) |section| for (section.paragraphs) |p| try ids.append(a, p.instance_id);
    const new_id = try @import("instance_ids.zig").fromSections(a, sections.items, version, ids.items, 2_000_000);
    var draft = try @import("../../model/clone.zig").section(a, document.sections[edit.section]);
    defer draft.deinit(a);
    if (edit.end_unit) |end| {
        if (end < edit.at_unit) return error.InvalidTextPosition;
        try @import("plain_text.zig").apply(a, decoded[edit.section], version, &draft.paragraphs[edit.paragraph], .{ .section = edit.section, .paragraph = edit.paragraph, .start_unit = edit.at_unit, .end_unit = end, .utf8 = "" }, char_count);
    }
    try @import("paragraph_split.zig").apply(a, &draft, decoded[edit.section], version, edit.paragraph, edit.at_unit, new_id, char_count);
    const verified = try @import("structure_section_writer.zig").writeWithDeletions(a, decoded[edit.section], draft, version, char_count, output_limit, true);
    defer a.free(verified);
    std.mem.swap(model.Section, &document.sections[edit.section], &draft);
}
