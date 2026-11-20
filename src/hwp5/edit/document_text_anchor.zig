//! Resolve actual current preview owner to a read ref, never to a write locator.
const std = @import("std");
const anchor = @import("../../model/document_text_anchor.zig");
pub fn query(a: std.mem.Allocator, document: *const @import("../../model/document.zig").Document, tables: []const @import("created_table_values.zig").Values, snapshot: *const @import("../../model/document_text_snapshot.zig").Snapshot, request: anchor.Request) !anchor.Response {
    try anchor.validate(snapshot, request);
    if (request.section >= document.sections.len or tables.len != document.sections.len) return error.SourceBindingMismatch;
    switch (request.target) {
        .paragraph => |point| {
            const paragraphs = document.sections[request.section].paragraphs;
            if (point.paragraph >= paragraphs.len) return error.InvalidParagraph;
            const row = try snapshot.rowForSource(request.section, .{ .paragraph = point.paragraph });
            const raw = try @import("plain_text_content.zig").editableTextBytes(a, paragraphs[point.paragraph]);
            defer a.free(raw);
            var projection = try @import("document_text_projection.zig").read(a, raw);
            defer projection.deinit(a);
            if (!std.mem.eql(u8, projection.text, row.text)) return error.SourceBindingMismatch;
            return anchor.respond(a, snapshot, request, row, projection.text, request.unit);
        },
        .created_cell => |point| {
            const row = try snapshot.rowForSource(request.section, .{ .created_cell = point });
            const text = try @import("created_cell_text.zig").copyUtf8(a, tables, .{ .section = request.section, .table = point.identity, .row = point.row, .column = point.column });
            defer a.free(text);
            if (!std.mem.eql(u8, row.text, text)) return error.SourceBindingMismatch;
            return anchor.respond(a, snapshot, request, row, text, request.unit);
        },
    }
}
