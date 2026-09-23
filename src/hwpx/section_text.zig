const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const content_manifest = @import("content_manifest.zig");
const document_structure = @import("document_structure.zig");

pub const InlineKind = enum(u8) {
    tab,
    fw_space,
    nb_space,
    line_break,
    title_mark,
    markpen_begin,
    markpen_end,
    hypen,
    unknown,
};

pub const OtherContentKind = enum(u8) {
    script,
    string_param,
    shape_comment,
    integer_param,
    boolean_param,
    meta_tag,
    first_key,
    main_text,
    sub_text,
    unknown,
};

pub const Location = struct {
    section_ordinal: usize,
    item_index: usize,
    paragraph_ordinal: usize,
    run_ordinal: usize,
    text_ordinal: usize,
};

pub const InlineEvent = struct { location: Location, kind: InlineKind, tag: xml.tags.Tag, scope: *const xml.namespaces.State };

/// Tag and scope borrow the XML visitor's storage. Text bytes are normalized
/// UTF-8 and borrow a temporary allocation. Copy anything retained past the
/// callback. Start/end events preserve nested inline element boundaries.
pub const Event = union(enum) {
    text_start: struct { location: Location, tag: xml.tags.Tag, scope: *const xml.namespaces.State },
    text_end: Location,
    content: struct { location: Location, bytes: []const u8 },
    inline_start: InlineEvent,
    inline_end: InlineEvent,
    inline_empty: InlineEvent,
};

pub const Visitor = struct {
    context: *anyopaque,
    on_event: *const fn (*anyopaque, Event) anyerror!void,
};

pub const Options = struct {
    max_section_xml_bytes: usize = 128 * 1024 * 1024,
    max_total_section_xml_bytes: usize = 256 * 1024 * 1024,
    max_text_elements: usize = 2_000_000,
    max_inline_elements: usize = 2_000_000,
    max_text_bytes: usize = 64 * 1024 * 1024,
    xml: document_xml.Options = .{},
};

pub const Report = struct {
    sections: usize = 0,
    paragraphs: usize = 0,
    runs: usize = 0,
    text_elements: usize = 0,
    empty_text_elements: usize = 0,
    text_bytes: usize = 0,
    text_chunks: usize = 0,
    inline_counts: [@typeInfo(InlineKind).@"enum".fields.len]usize = @splat(0),
    non_direct_text_elements: usize = 0,
    nested_inline_elements: usize = 0,
    non_text_content_chunks: usize = 0,
    other_content_counts: [@typeInfo(OtherContentKind).@"enum".fields.len]usize = @splat(0),
    decoded_xml_bytes: usize = 0,

    pub fn inlineCount(self: *const Report, kind: InlineKind) usize {
        return self.inline_counts[@intFromEnum(kind)];
    }

    pub fn issues(self: *const Report) usize {
        return self.non_direct_text_elements + self.nested_inline_elements + self.inlineCount(.unknown) + self.otherContentCount(.unknown);
    }

    pub fn otherContentCount(self: *const Report, kind: OtherContentKind) usize {
        return self.other_content_counts[@intFromEnum(kind)];
    }
};

const Node = struct {
    kind: enum { other, paragraph, run, text, control } = .other,
    inline_kind: InlineKind = .unknown,
    other_content_kind: OtherContentKind = .unknown,
    paragraph: usize = 0,
    run: usize = 0,
    text: usize = 0,
};

fn inlineKind(tag: xml.tags.Tag, scope: *const xml.namespaces.State) !InlineKind {
    const name = try scope.expandElement(tag.name);
    if (!std.mem.eql(u8, name.uri, document_xml.paragraph_uri)) return .unknown;
    if (name.local.equals("tab", false)) return .tab;
    if (name.local.equals("fwSpace", false)) return .fw_space;
    if (name.local.equals("nbSpace", false)) return .nb_space;
    if (name.local.equals("lineBreak", false)) return .line_break;
    if (name.local.equals("titleMark", false)) return .title_mark;
    if (name.local.equals("markpenBegin", false)) return .markpen_begin;
    if (name.local.equals("markpenEnd", false)) return .markpen_end;
    if (name.local.equals("hypen", false)) return .hypen;
    return .unknown;
}

fn otherContentKind(tag: xml.tags.Tag, scope: *const xml.namespaces.State) !OtherContentKind {
    const name = try scope.expandElement(tag.name);
    if (!std.mem.eql(u8, name.uri, document_xml.paragraph_uri)) return .unknown;
    if (name.local.equals("script", false)) return .script;
    if (name.local.equals("stringParam", false)) return .string_param;
    if (name.local.equals("shapeComment", false)) return .shape_comment;
    if (name.local.equals("integerParam", false)) return .integer_param;
    if (name.local.equals("booleanParam", false)) return .boolean_param;
    if (name.local.equals("metaTag", false)) return .meta_tag;
    if (name.local.equals("firstKey", false)) return .first_key;
    if (name.local.equals("mainText", false)) return .main_text;
    if (name.local.equals("subText", false)) return .sub_text;
    return .unknown;
}

const Scanner = struct {
    allocator: std.mem.Allocator,
    options: Options,
    report: *Report,
    visitor: ?Visitor,
    section_ordinal: usize,
    item_index: usize,
    nodes: [256]Node = @splat(.{}),
    current_text_bytes: usize = 0,

    fn location(self: *const Scanner, node: Node) Location {
        return .{
            .section_ordinal = self.section_ordinal,
            .item_index = self.item_index,
            .paragraph_ordinal = node.paragraph,
            .run_ordinal = node.run,
            .text_ordinal = node.text,
        };
    }

    fn emit(self: *Scanner, event: Event) !void {
        if (self.visitor) |visitor| try visitor.on_event(visitor.context, event);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Scanner = @ptrCast(@alignCast(raw));
        if (depth == 0 or depth > self.nodes.len) return error.LimitExceeded;
        if (tag.kind == .end) {
            const node = self.nodes[depth - 1];
            switch (node.kind) {
                .text => {
                    if (self.current_text_bytes == 0) self.report.empty_text_elements += 1;
                    try self.emit(.{ .text_end = self.location(node) });
                    self.current_text_bytes = 0;
                },
                .control => try self.emit(.{ .inline_end = .{ .location = self.location(node), .kind = node.inline_kind, .tag = tag, .scope = scope } }),
                else => {},
            }
            return;
        }
        if (depth == 1 and !try attrs.element(tag, scope, document_xml.section_uri, "sec")) return error.InvalidSectionRoot;
        const parent: Node = if (depth == 1) .{} else self.nodes[depth - 2];
        var node = parent;
        node.kind = .other;
        node.inline_kind = .unknown;
        node.other_content_kind = try otherContentKind(tag, scope);
        if (parent.text != 0) {
            node.kind = .control;
            node.inline_kind = try inlineKind(tag, scope);
            const used = inlineTotal(self.report);
            if (used == self.options.max_inline_elements) return error.LimitExceeded;
            self.report.inline_counts[@intFromEnum(node.inline_kind)] += 1;
            if (parent.kind == .control) self.report.nested_inline_elements += 1;
            const event: InlineEvent = .{ .location = self.location(node), .kind = node.inline_kind, .tag = tag, .scope = scope };
            if (tag.kind == .empty) try self.emit(.{ .inline_empty = event }) else try self.emit(.{ .inline_start = event });
        } else if (try attrs.element(tag, scope, document_xml.paragraph_uri, "p")) {
            self.report.paragraphs += 1;
            node.kind = .paragraph;
            node.paragraph = self.report.paragraphs;
            node.run = 0;
        } else if (try attrs.element(tag, scope, document_xml.paragraph_uri, "run")) {
            self.report.runs += 1;
            node.kind = .run;
            node.run = self.report.runs;
        } else if (try attrs.element(tag, scope, document_xml.paragraph_uri, "t")) {
            if (self.report.text_elements == self.options.max_text_elements) return error.LimitExceeded;
            self.report.text_elements += 1;
            node.kind = .text;
            node.text = self.report.text_elements;
            self.current_text_bytes = 0;
            if (parent.kind != .run) self.report.non_direct_text_elements += 1;
            try self.emit(.{ .text_start = .{ .location = self.location(node), .tag = tag, .scope = scope } });
            if (tag.kind == .empty) {
                self.report.empty_text_elements += 1;
                try self.emit(.{ .text_end = self.location(node) });
            }
        }
        if (tag.kind == .start) self.nodes[depth - 1] = node;
    }

    fn inlineTotal(report: *const Report) usize {
        var result: usize = 0;
        for (report.inline_counts) |count| result += count;
        return result;
    }

    fn onContent(raw: *anyopaque, value: xml.text_content.View, depth: usize) anyerror!void {
        const self: *Scanner = @ptrCast(@alignCast(raw));
        if (depth == 0 or depth > self.nodes.len) return error.LimitExceeded;
        const node = self.nodes[depth - 1];
        if (node.text == 0) {
            // XML formatting whitespace is not document text. Flag only
            // non-whitespace content that no hp:t owner receives.
            const bytes = try value.toUtf8(self.allocator, self.options.max_section_xml_bytes);
            defer self.allocator.free(bytes);
            for (bytes) |byte| if (!std.ascii.isWhitespace(byte)) {
                self.report.non_text_content_chunks += 1;
                self.report.other_content_counts[@intFromEnum(node.other_content_kind)] += 1;
                break;
            };
            return;
        }
        const remaining = self.options.max_text_bytes - self.report.text_bytes;
        const bytes = try value.toUtf8(self.allocator, remaining);
        defer self.allocator.free(bytes);
        self.report.text_bytes += bytes.len;
        self.current_text_bytes += bytes.len;
        self.report.text_chunks += 1;
        try self.emit(.{ .content = .{ .location = self.location(node), .bytes = bytes } });
    }
};

/// Re-reads structure-selected sections in spine order. It never guesses
/// visible branch selection or converts inline controls into characters.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, manifest: content_manifest.Manifest, sections: []const document_structure.Section, options: Options, visitor: ?Visitor) !Report {
    var report: Report = .{ .sections = sections.len };
    var remaining = options.max_total_section_xml_bytes;
    for (sections, 0..) |section, ordinal| {
        const item = manifest.items[section.item_index];
        const entry_index = item.entry_index orelse return error.ExternalSpineXml;
        const max_bytes = @min(options.max_section_xml_bytes, remaining);
        const bytes = try archive.decode(archive.entries[entry_index], max_bytes);
        defer archive.allocator.free(bytes);
        var scanner: Scanner = .{ .allocator = a, .options = options, .report = &report, .visitor = visitor, .section_ordinal = ordinal, .item_index = section.item_index };
        _ = try document_xml.visitBytes(a, bytes, max_bytes, options.xml, .{ .context = &scanner, .on_tag = Scanner.onTag, .on_content = Scanner.onContent });
        remaining -= bytes.len;
    }
    report.decoded_xml_bytes = options.max_total_section_xml_bytes - remaining;
    return report;
}
