//! Current editable model values; immutable source supplies ownership only.
const std = @import("std");
const model = @import("../../model/document.zig");
const values = @import("../body/formula_values.zig");
pub const Reader = struct {
    allocator: std.mem.Allocator,
    section: model.Section,

    pub fn read(self: Reader, tree: @import("../body/tree.zig").Tree, group: @import("../body/list_groups.zig").Group) !f64 {
        const node = try values.paragraphNode(tree, group);
        var found: ?model.Paragraph = null;
        for (self.section.paragraphs) |paragraph| {
            if (paragraph.source_node != node) continue;
            if (found != null) return error.SourceBindingMismatch;
            found = paragraph;
        }
        const paragraph = found orelse return error.SourceBindingMismatch;
        const bytes = try @import("plain_text_content.zig").textBytes(self.allocator, paragraph);
        defer self.allocator.free(bytes);
        return values.numberFromText(bytes, paragraph.declared_units);
    }
};
