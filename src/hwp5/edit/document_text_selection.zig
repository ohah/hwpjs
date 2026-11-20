//! Native H5 current preview paragraph/cell coordinates only. Returned locators
//! are read observations; raw HWP control offsets remain private to edit plans.
const std = @import("std");
const model = @import("../../model/document.zig");
const selection = @import("../../model/document_text_selection.zig");
pub fn query(a: std.mem.Allocator, document: *const model.Document, tables: []const @import("created_table_values.zig").Values, snapshot: *const @import("../../model/document_text_snapshot.zig").Snapshot, request: selection.Request) !selection.Response {
    const row = try selection.resolve(snapshot, request);
    if (row.section >= document.sections.len or tables.len != document.sections.len) return error.SourceBindingMismatch;
    switch (row.source) {
        .paragraph => |index| {
            const paragraphs = document.sections[row.section].paragraphs;
            if (index >= paragraphs.len) return error.InvalidParagraph;
            const raw = try @import("plain_text_content.zig").editableTextBytes(a, paragraphs[index]);
            defer a.free(raw);
            var projection = try @import("document_text_projection.zig").read(a, raw);
            defer projection.deinit(a);
            if (!std.mem.eql(u8, projection.text, row.text)) return error.SourceBindingMismatch;
            return selection.paragraph(a, snapshot, request, index, projection.text, request.start, request.end);
        },
        .created_cell => |point| {
            const text = try @import("created_cell_text.zig").copyUtf8(a, tables, .{ .section = row.section, .table = point.identity, .row = point.row, .column = point.column });
            defer a.free(text);
            return selection.cell(a, snapshot, request, text);
        },
    }
}
