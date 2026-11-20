//! Translate the Native complete literal plan into actual private model owners.
//! Original search units are mapped through the same projection used to read.
const std = @import("std");
const model = @import("../../model/document.zig");
const Group = @import("document_text_session.zig").Group;
pub const Plan = struct {
    arena: std.heap.ArenaAllocator,
    groups: []const Group,
    pub fn deinit(self: *Plan) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
pub fn prepare(a: std.mem.Allocator, document: *const model.Document, input: @import("../../model/document_replace_all.zig").Plan) !Plan {
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned = arena.allocator();
    const groups = try owned.alloc(Group, input.groups.len);
    for (input.groups, groups) |item, *group| {
        const row = item.row;
        if (row.section >= document.sections.len) return error.InvalidSection;
        group.* = .{ .section = row.section, .source = row.source, .edits = item.edits };
        switch (row.source) {
            .created_cell => {}, // Text/expected owned by the request, alive through History.
            .paragraph => |index| {
                const section = &document.sections[row.section];
                if (index >= section.paragraphs.len) return error.InvalidParagraph;
                const bytes = try @import("plain_text_content.zig").editableTextBytes(a, section.paragraphs[index]);
                defer a.free(bytes);
                var projection = try @import("document_text_projection.zig").read(a, bytes);
                defer projection.deinit(a);
                if (!std.mem.eql(u8, projection.text, row.text)) return error.SourceBindingMismatch;
                var mapped = try @import("document_text_projection.zig").sourceEdits(a, projection, item.edits);
                defer mapped.deinit();
                const edits = try owned.alloc(@import("../../model/independent_text_edits.zig").Edit, mapped.edits.len);
                for (mapped.edits, edits) |edit, *target| target.* = .{
                    .start = edit.start,
                    .end = edit.end,
                    .text = try owned.dupe(u8, edit.text),
                    .expected = try owned.dupe(u8, edit.expected.?),
                };
                group.edits = edits;
            },
        }
    }
    return .{ .arena = arena, .groups = groups };
}
