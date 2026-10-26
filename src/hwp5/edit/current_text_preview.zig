//! Read-only current ordinary paragraphs; generated cells remain separate values.
const std = @import("std");
const wire = @import("../text_preview_wire.zig");
pub fn encode(a: std.mem.Allocator, document: *const @import("../../model/document.zig").Document, version: u32) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try wire.append(a, &out, "H5T1");
    try wire.word(a, &out, version);
    try wire.word(a, &out, try wire.cast(document.sections.len));
    for (document.sections, 0..) |section, si| {
        try wire.word(a, &out, try wire.cast(si));
        try wire.word(a, &out, try wire.cast(section.paragraphs.len));
        for (section.paragraphs) |paragraph| {
            // Sentinel explicitly means no immutable source node, not a template ID.
            try wire.word(a, &out, paragraph.source_node orelse std.math.maxInt(u32));
            try wire.word(a, &out, paragraph.parent_node orelse std.math.maxInt(u32));
            try wire.word(a, &out, paragraph.declared_units);
            try wire.word(a, &out, @intFromBool(paragraph.text_present));
            try wire.word(a, &out, try wire.cast(paragraph.tokens.len));
            if (!paragraph.text_present and paragraph.tokens.len != 0) return error.SourceBindingMismatch;
            for (paragraph.tokens) |token| {
                if (token.encoding != .utf16le) return error.SourceBindingMismatch;
                try wire.word(a, &out, @intFromBool(token.kind == .control));
                try wire.word(a, &out, token.start_unit);
                try wire.word(a, &out, try wire.cast(token.raw.len));
                try wire.append(a, &out, token.raw);
            }
        }
    }
    return out.toOwnedSlice(a);
}
