//! Current display -> observation inverse through the canonical serializer SSOT.
const std = @import("std");
const editor = @import("editor_session.zig");
const anchor = @import("../model/document_text_anchor.zig");
pub fn query(a: std.mem.Allocator, live: *const editor.Session, lifetime: @import("../model/formatting_binding.zig").State, revision: ?u32, request: anchor.Request) !anchor.Response {
    var observation = try @import("document_text_snapshot.zig").observe(a, live, lifetime, revision);
    defer observation.deinit();
    if (request.read_stamp) |stamp| try observation.snapshot.bindReadStamp(stamp);
    try anchor.validate(&observation.snapshot, request);
    switch (request.target) {
        .paragraph => |point| {
            const bytes = try @import("editor_display_save.zig").save(live);
            defer live.allocator.free(bytes);
            var display = try editor.open(a, bytes, live.options);
            defer display.deinit();
            if (display.sections.len != live.sections.len) return error.SourceBindingMismatch;
            for (display.sections, live.sections) |base, current|
                if (base.first_paragraph != current.first_paragraph) return error.SourceBindingMismatch;
            const section = &display.sections[request.section];
            if (point.paragraph < section.first_paragraph) return error.InvalidParagraph;
            const index = point.paragraph - section.first_paragraph;
            var physical = try @import("display_current_paragraphs.zig").read(a, section, display.options);
            defer physical.deinit(a);
            if (physical.paragraphs.len != observation.pending_positions[request.section].len or index >= physical.paragraphs.len)
                return error.SourceBindingMismatch;
            const row = try observation.snapshot.rowForSource(request.section, .{ .paragraph = index });
            const read_limits = try @import("document_text_read_options.zig").fromSession(display.options);
            var read_context = try @import("control_text_read_context.zig").Context.init(a, &section.tree, physical.paragraphs, read_limits);
            defer read_context.deinit();
            const text = try read_context.copyVisibleText(a, index, physical.paragraphs[index].template_element, read_limits.max_bytes);
            defer a.free(text);
            const unit = try @import("document_text_source_axis.zig").unprojectPoint(row.text, text, observation.pending_positions[request.section][index], request.unit);
            try observation.assertCurrent(live);
            return anchor.respond(a, &observation.snapshot, request, row, text, unit);
        },
        .created_cell => |point| {
            const row = try observation.snapshot.rowForSource(request.section, .{ .created_cell = point });
            const entries = live.sections[request.section].created_tables.entries.items;
            var table: ?*const @import("../model/created_table.zig").Table = null;
            for (entries) |*entry| if (entry.table.identity == point.identity) {
                if (table != null) return error.InvalidCreatedTableIdentity;
                table = &entry.table;
            };
            const current = table orelse return error.InvalidCreatedTableIdentity;
            _ = try current.plan.cell(point.row, point.column);
            const index = try std.math.add(usize, try std.math.mul(usize, point.row, current.plan.columns), point.column);
            if (index >= current.cells.len) return error.InvalidTableCell;
            const text = current.cells[index].text;
            if (!std.mem.eql(u8, row.text, text)) return error.SourceBindingMismatch;
            try observation.assertCurrent(live);
            return anchor.respond(a, &observation.snapshot, request, row, text, request.unit);
        },
    }
}
