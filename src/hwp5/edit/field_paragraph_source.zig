//! Generated plain paragraphs inherit list ownership, never original field headers.
const std = @import("std");
pub fn resolve(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, paragraph: @import("../../model/document.zig").Paragraph) !usize {
    if (paragraph.source_node) |node| return node;
    _ = try @import("plain_text_source.zig").validateFieldTransaction(a, source, version, paragraph, std.math.maxInt(usize));
    return paragraph.header_template orelse error.MissingParagraphSource;
}
