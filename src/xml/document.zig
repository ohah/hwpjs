const std = @import("std");
const prolog = @import("prolog.zig");
const tags = @import("tags.zig");
const markup = @import("markup.zig");
pub const Options = struct {
    prolog: prolog.Options = .{},
    tags: tags.Options = .{},
    max_markup_bytes: usize = 16 * 1024 * 1024,
    max_text_bytes: usize = 16 * 1024 * 1024,
    max_elements: usize = 1000000,
    max_depth: usize = 256,
    max_events: usize = 1000000,
    max_attributes: usize = 1000000,
    max_references: usize = 1000000,
};
/// XML 1.0 document structure WITHOUT DTD or namespace validation. DTD/unknown
/// entities are explicit errors, not successful deferred records. Scalar report only.
pub const Report = struct {
    bytes: usize = 0,
    characters: usize = 0,
    events: usize = 0,
    elements: usize = 0,
    end_tags: usize = 0,
    attributes: usize = 0,
    references: usize = 0,
    text_scalars: usize = 0,
    comments: usize = 0,
    cdata: usize = 0,
    processing_instructions: usize = 0,
    max_depth: usize = 0,
    namespaces_validated: bool = false,
};
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !Report {
    var opened = try prolog.open(bytes, options.prolog);
    var stack: std.ArrayList([]const u8) = .empty;
    defer stack.deinit(a);
    var report: Report = .{};
    var root_seen = false;
    while (true) {
        var look = opened.input;
        const first = (try look.next()) orelse break;
        if (report.events == options.max_events) return error.LimitExceeded;
        report.events += 1;
        if (first.value != '<') {
            const text = try @import("content.zig").inspect(&opened.input, options.max_text_bytes, options.tags.references, options.max_references - report.references, stack.items.len == 0);
            report.references += text.references;
            if (stack.items.len != 0) report.text_scalars += text.scalars;
            continue;
        }
        const kind = try markup.classify(opened.input);
        if (kind == .doctype) return error.UnsupportedXmlDtd;
        if (kind != .tag) {
            if (kind == .cdata and stack.items.len == 0) return error.CdataOutsideXmlRoot;
            const scalars = try markup.parse(&opened.input, kind, options.max_markup_bytes, options.tags.max_name_bytes);
            switch (kind) {
                .comment => report.comments += 1,
                .pi => report.processing_instructions += 1,
                .cdata => {
                    report.cdata += 1;
                    report.text_scalars += scalars;
                },
                else => unreachable,
            }
            continue;
        }
        var local = options.tags;
        local.max_attributes = @min(local.max_attributes, options.max_attributes - report.attributes);
        local.max_references = @min(local.max_references, options.max_references - report.references);
        var tag = try tags.parse(a, &opened.input, local);
        defer tag.deinit(a);
        if (tag.unresolved != 0) return error.UnresolvedXmlEntity;
        report.attributes += tag.attributes.len;
        report.references += tag.references;
        if (tag.kind == .end) {
            if (stack.items.len == 0) return error.UnexpectedXmlEndTag;
            if (!std.mem.eql(u8, stack.items[stack.items.len - 1], tag.name.raw)) return error.XmlElementNameMismatch;
            _ = stack.pop();
            report.end_tags += 1;
        } else {
            if (stack.items.len == 0) {
                if (root_seen) return error.MultipleXmlRoots;
                root_seen = true;
            }
            if (report.elements == options.max_elements or stack.items.len == options.max_depth) return error.LimitExceeded;
            report.elements += 1;
            report.max_depth = @max(report.max_depth, stack.items.len + 1);
            if (tag.kind == .start) try stack.append(a, tag.name.raw);
        }
    }
    if (!root_seen) return error.MissingXmlRoot;
    if (stack.items.len != 0) return error.UnclosedXmlElement;
    report.bytes = bytes.len;
    report.characters = options.prolog.input.max_characters - opened.input.remaining;
    return report;
}
