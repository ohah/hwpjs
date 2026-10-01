//! Section-atomic text edits with cross-paragraph hyperlink attribute ownership.
const std = @import("std");
const model = @import("../../model/document.zig");
const plain = @import("plain_text.zig");
const spans = @import("hyperlink_spans.zig");
const Tree = @import("../body/tree.zig").Tree;
const body = @import("../body/reader.zig");
const Version = @import("../version.zig").Version;

pub fn hasCrossParagraph(a: std.mem.Allocator, section: model.Section) !bool {
    const found = try spans.collect(a, section);
    defer a.free(found);
    for (found) |span| if (span.begin.paragraph != span.end.paragraph) return true;
    return false;
}

const Context = struct {
    source: []const u8,
    version: Version,
    edit: plain.Splice,
    char_count: usize,

    fn prepare(a: std.mem.Allocator, draft: *model.Section, self: @This()) !void {
        const found = try spans.collect(a, draft.*);
        defer a.free(found);
        const target = &draft.paragraphs[self.edit.paragraph];
        const before = try plain.textBytes(a, target.*);
        defer a.free(before);
        try plain.applyHyperlinkTransaction(a, self.source, self.version, target, self.edit, self.char_count);
        const after = try plain.textBytes(a, target.*);
        defer a.free(after);
        if (std.mem.eql(u8, before, after)) return;
        var tree = try Tree.parseTextPreview(a, self.source, self.version, .{});
        defer tree.deinit(a);
        for (found) |span| {
            const pi = self.edit.paragraph;
            if (pi < span.begin.paragraph or pi > span.end.paragraph) continue;
            const start = if (pi == span.begin.paragraph) span.begin.unit else 0;
            const end = if (pi == span.end.paragraph) span.end.unit else std.math.maxInt(u32);
            const touched = if (self.edit.start_unit == self.edit.end_unit)
                self.edit.start_unit >= start and self.edit.start_unit <= end
            else
                self.edit.start_unit < end and self.edit.end_unit > start;
            if (!touched) continue;
            const owner = &draft.paragraphs[span.begin.paragraph];
            _ = try @import("plain_text_source.zig").validateHyperlinkTransaction(a, self.source, self.version, owner.*, self.char_count);
            if (owner.field_attributes == null) {
                var fields: std.ArrayList(model.FieldAttributes) = .empty;
                errdefer fields.deinit(a);
                var child = @as(usize, owner.source_node) + 1;
                while (child < tree.nodes[owner.source_node].subtree_end) {
                    const node = tree.nodes[child];
                    if (node.parent != owner.source_node) return error.SourceBindingMismatch;
                    if (node.record.framing.tag == @intFromEnum(body.Tag.control_header)) {
                        const header = try body.ControlHeader.parse(node.record.framing.payload);
                        if (header.id == @import("../body/control_rules.zig").id("%hlk")) {
                            const props = try @import("../body/field_start.zig").Properties.parse(header.properties);
                            try fields.append(a, .{ .source_node = @intCast(child), .attributes = props.attributes });
                        }
                    }
                    child = node.subtree_end;
                }
                owner.field_attributes = try fields.toOwnedSlice(a);
            }
            if (span.ordinal >= owner.field_attributes.?.len) return error.SourceBindingMismatch;
            owner.field_attributes.?[span.ordinal].attributes |= @import("../body/field_start.zig").modified_mask;
        }
        const verified = try spans.collect(a, draft.*);
        a.free(verified);
    }
};

pub fn apply(a: std.mem.Allocator, source: []const u8, version: Version, section: *model.Section, edit: plain.Splice, char_count: usize) !void {
    if (edit.paragraph >= section.paragraphs.len) return error.InvalidParagraph;
    try @import("../../model/transaction.zig").apply(a, section, Context{ .source = source, .version = version, .edit = edit, .char_count = char_count }, Context.prepare);
}
