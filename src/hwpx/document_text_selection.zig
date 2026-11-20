//! Read-only resolution to the existing saveForDisplay address space. No edit
//! eligibility, current-reference mutation ticket or renderer geometry is issued.
const std = @import("std");
const editor = @import("editor_session.zig");
const selection = @import("../model/document_text_selection.zig");
pub fn query(a: std.mem.Allocator, live: *const editor.Session, lifetime: @import("../model/formatting_binding.zig").State, revision: ?u32, request: selection.Request) !selection.Response {
    var observation = try @import("document_text_snapshot.zig").observe(a, live, lifetime, revision);
    defer observation.deinit();
    if (request.read_stamp) |stamp| try observation.snapshot.bindReadStamp(stamp);
    const row = try selection.resolve(&observation.snapshot, request);
    switch (row.source) {
        .paragraph => |index| {
            // Reuse the Runtime's canonical read-only display save. That SSOT
            // preserves current source addresses and supplies typed tables apart.
            const bytes = try @import("editor_display_save.zig").save(live);
            defer live.allocator.free(bytes);
            var display = try editor.open(a, bytes, live.options);
            defer display.deinit();
            if (display.sections.len != live.sections.len) return error.SourceBindingMismatch;
            for (display.sections, live.sections) |base, current|
                if (base.first_paragraph != current.first_paragraph) return error.SourceBindingMismatch;
            const section = &display.sections[row.section];
            var physical = try @import("display_current_paragraphs.zig").read(a, section, display.options);
            defer physical.deinit(a);
            if (physical.paragraphs.len != observation.pending_positions[row.section].len or index >= physical.paragraphs.len)
                return error.SourceBindingMismatch;
            const read_limits = try @import("document_text_read_options.zig").fromSession(display.options);
            var read_context = try @import("control_text_read_context.zig").Context.init(a, &section.tree, physical.paragraphs, read_limits);
            defer read_context.deinit();
            const text = try read_context.copyVisibleText(a, index, physical.paragraphs[index].template_element, read_limits.max_bytes);
            defer a.free(text);
            const mapped = try @import("document_text_source_axis.zig").map(a, row.text, text, observation.pending_positions[row.section][index], &.{.{
                .start = request.start,
                .end = request.end,
                .text = request.expected,
                .expected = request.expected,
            }});
            defer a.free(mapped);
            try observation.assertCurrent(live);
            return selection.paragraph(a, &observation.snapshot, request, try std.math.add(usize, section.first_paragraph, index), text, mapped[0].start, mapped[0].end);
        },
        .created_cell => |point| {
            const tables = live.sections[row.section].created_tables.entries.items;
            var table: ?*const @import("../model/created_table.zig").Table = null;
            for (tables) |*entry| if (entry.table.identity == point.identity) {
                if (table != null) return error.InvalidCreatedTableIdentity;
                table = &entry.table;
            };
            const current = table orelse return error.InvalidCreatedTableIdentity;
            _ = try current.plan.cell(point.row, point.column);
            const index = try std.math.add(usize, try std.math.mul(usize, point.row, current.plan.columns), point.column);
            if (index >= current.cells.len) return error.InvalidTableCell;
            try observation.assertCurrent(live);
            return selection.cell(a, &observation.snapshot, request, current.cells[index].text);
        },
    }
}
