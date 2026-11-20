//! Private source candidates detached from the existing strict source context.
//! This module never publishes. The whole document coordinator validates source
//! and pending-cell values together before swapping their owned models.
const std = @import("std");
const editor = @import("editor_session.zig");
const model = @import("paragraph_structure_values.zig");
const sites_mod = @import("text_sites.zig");
pub const Section = struct {
    values: ?model.Values,
    sites: sites_mod.Sites,
    original_values: ?[*]model.Paragraph,
    original_sites: [*]sites_mod.Site,
};
pub const Publication = struct {
    allocator: std.mem.Allocator,
    owner: *editor.Session,
    source_pointer: [*]u8,
    sections_pointer: [*]editor.Section,
    serial: u64,
    active: bool,
    sections: []?Section,
    pub fn deinit(self: *Publication) void {
        for (self.sections) |*slot| if (slot.*) |*section| {
            if (section.values) |*values| values.deinit(self.allocator);
            section.sites.deinit(self.allocator);
        };
        self.allocator.free(self.sections);
        self.* = undefined;
    }
    pub fn validateCurrent(self: *const Publication, live: *const editor.Session) !void {
        if (live != self.owner or live.source.ptr != self.source_pointer or
            live.sections.ptr != self.sections_pointer or live.sections.len != self.sections.len or
            live.mutation_serial != self.serial or live.history_transaction_active != self.active or
            !live.history_delta_managed) return error.StaleDocumentTextPublication;
        for (live.sections, self.sections) |*section, slot| if (slot) |prepared| {
            try section.validateSourceBasis();
            if (section.sites.items.ptr != prepared.original_sites or
                (if (section.structure_values) |values| values.paragraphs.ptr else null) != prepared.original_values)
                return error.StaleDocumentTextPublication;
        };
    }
};
