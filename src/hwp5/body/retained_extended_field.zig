//! Immutable source classification and protection preparation, NOT edit admission.
//! Only observed Company and local page-result field envelopes are classified.
//! Caller retains source lifetime and immutability; no evaluation, target resolution or writer.
const std = @import("std");
const Header = @import("control_header.zig").Header;
const Properties = @import("field_start.zig").Properties;
const Version = @import("../version.zig").Version;
const rules = @import("control_rules.zig");
pub const Kind = enum { company, table_page, bookmark_page };
pub const Range = struct { start: usize, end: usize };
pub const Classification = struct { kind: Kind, properties: Properties };
pub const Field = struct {
    classification: Classification,
    control_node: usize,
    control_id: u32,
    raw_header: []const u8,
    begin_control: Range,
    result: Range,
    end_control: Range,
};
pub const Protection = struct {
    paragraph_node: usize,
    text_node: usize,
    text: []const u8,
    fields: []Field,
    controls: []Range,
    pub fn deinit(self: *Protection, a: std.mem.Allocator) void {
        a.free(self.fields);
        a.free(self.controls);
        self.* = undefined;
    }
    /// Source UTF-16 positions only. Passing is a protection prerequisite,
    /// never whole-section policy, mutation or insertion-content permission.
    pub fn checkRange(self: Protection, start: usize, end: usize) !void {
        if (start > end or end >= self.text.len / 2) return error.InvalidTextPosition;
        for (self.fields) |field| {
            const r = field.result;
            if (if (start == end) start >= r.start and start <= r.end else start < r.end and end > r.start)
                return error.ProtectedRetainedFieldResult;
        }
        for (self.controls) |r| {
            if (if (start == end) start > r.start and start < r.end else start < r.end and end > r.start)
                return error.ProtectedRetainedControl;
        }
        try scalarBoundary(self.text, start);
        try scalarBoundary(self.text, end);
    }
};

// Use scalar decoding without importing the editor/model layer into body.
fn scalarBoundary(bytes: []const u8, unit: usize) !void {
    var tokens = (@import("text.zig").Text{ .raw = bytes }).tokens();
    while (try tokens.next()) |token| {
        if (token.value != .text or unit <= token.start_unit or unit >= token.start_unit + token.raw.len / 2) continue;
        const byte = (unit - token.start_unit) * 2;
        var at: usize = 0;
        while (try @import("../../text/scalars.zig").read(token.raw, at, .utf16le)) |scalar| {
            if (byte > scalar.start and byte < scalar.end) return error.SplitSurrogatePair;
            at = scalar.end;
        }
    }
}

fn hasAsciiSuffix(bytes: []const u8, comptime suffix: []const u8) bool {
    if (bytes.len < suffix.len * 2) return false;
    const tail = bytes[bytes.len - suffix.len * 2 ..];
    for (suffix, 0..) |c, i| {
        if (tail[i * 2] != c or tail[i * 2 + 1] != 0) return false;
    }
    return true;
}

pub fn classify(header: Header, version: Version) !Classification {
    try version.requireSupported();
    if (header.id != rules.id("%usr") and header.id != rules.id("%xrf")) return error.UnsupportedRetainedField;
    const p = try Properties.parse(header.properties);
    if (p.instance_id == 0 or p.extra.len != 4 or !std.mem.allEqual(u8, p.extra, 0)) return error.UnsupportedRetainedField;
    if (header.id == rules.id("%usr")) {
        if (version.raw != 0x05000204) return error.UnsupportedRetainedFieldVersion;
        const company = [_]u8{ '$', 0, 'C', 0, 'o', 0, 'm', 0, 'p', 0, 'a', 0, 'n', 0, 'y', 0 };
        if (p.attributes != 0 or p.other != 8 or !std.mem.eql(u8, p.command, &company)) return error.UnsupportedRetainedField;
        return .{ .kind = .company, .properties = p };
    }
    if (version.raw != 0x05010100) return error.UnsupportedRetainedFieldVersion;
    if ((p.attributes != 2 and p.attributes != 0x1002) or p.other != 0 or p.command.len < 2 or
        !std.mem.eql(u8, p.command[p.command.len - 2 ..], &.{ ';', 0 })) return error.UnsupportedRetainedField;
    const view = try @import("cross_reference_command.zig").View.parse(p.command);
    const semantic = try view.semantics();
    if (view.external_document != null or semantic.content != .page or !semantic.hyperlink or semantic.open_mode != .current)
        return error.UnsupportedRetainedField;
    // UTF-16 validity and forbidden control scalars are shared with core decoding.
    var at: usize = 0;
    while (try @import("../../text/scalars.zig").read(p.command, at, .utf16le)) |scalar| {
        if (scalar.value < 32) return error.UnsupportedRetainedField;
        at = scalar.end;
    }
    const kind: Kind = switch (semantic.object) {
        .table => blk: {
            if (view.target != .numeric or view.target.numeric == 0 or
                !hasAsciiSuffix(p.command, ";0;0;1;0;") or
                std.mem.readInt(u16, p.command[4..6], .little) == '0') return error.UnsupportedRetainedField;
            break :blk .table_page;
        },
        .bookmark => blk: {
            if (p.attributes != 2 or !hasAsciiSuffix(p.command, ";6;0;1;0;")) return error.UnsupportedRetainedField;
            break :blk .bookmark_page;
        },
        else => return error.UnsupportedRetainedField,
    };
    return .{ .kind = kind, .properties = p };
}

/// Independent paragraph preparation against an unchanged decoded Section.
/// Tree projection decodes only paragraph/text/CTRL_HEADER; other tags are NOT
/// validated by this module. Control links/type checks remain their own SSOT.
/// Rejects any unsupported field in this paragraph, nesting and cross-paragraph
/// fields. Other paragraphs do not receive classification or editing permission.
pub fn read(a: std.mem.Allocator, source: []const u8, version: Version, paragraph_node: usize) !Protection {
    var tree = try @import("tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    for (tree.nodes) |*node| {
        if (node.record.framing.tag == 71)
            node.record.value = .{ .control_header = try Header.parse(node.record.framing.payload) };
    }
    if (paragraph_node >= tree.nodes.len or tree.nodes[paragraph_node].record.value != .header) return error.InvalidRetainedParagraph;
    const children = try @import("paragraph_children.zig").collect(tree, paragraph_node);
    const text_node = children.text_node orelse return error.MissingRetainedText;
    const text = tree.nodes[text_node].record.value.text;
    try text.validateCount(tree.nodes[paragraph_node].record.value.header);
    if (text.raw.len < 2 or std.mem.readInt(u16, text.raw[text.raw.len - 2 ..][0..2], .little) != 13) return error.UnsupportedParagraphTerminator;
    var links = try @import("control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    const types = try @import("control_type_validation.zig").inspect(links.items);
    if (types.deferred != 0) return error.UnsupportedRetainedField;
    var fields: std.ArrayList(Field) = .empty;
    errdefer fields.deinit(a);
    var controls: std.ArrayList(Range) = .empty;
    defer controls.deinit(a);
    var open: ?Field = null;
    var tokens = text.tokens();
    while (try tokens.next()) |token| {
        if (token.value != .control) {
            var at: usize = 0;
            while (try @import("../../text/scalars.zig").read(token.raw, at, .utf16le)) |scalar| at = scalar.end;
            continue;
        }
        const c = token.value.control;
        const range = Range{ .start = token.start_unit, .end = token.start_unit + token.raw.len / 2 };
        try controls.append(a, range);
        if (c.code == 3) {
            if (!std.mem.allEqual(u8, c.data[4..], 0)) return error.UnsupportedRetainedMarkerData;
            if (open != null) return error.UnsupportedRetainedFieldNesting;
            const link = blk: {
                for (links.items) |link| {
                    if (link.paragraph_node == paragraph_node and link.start_unit == token.start_unit) break :blk link;
                }
                return error.SourceBindingMismatch;
            };
            if (link.identity != .exact or link.code != 3) return error.SourceBindingMismatch;
            const node = tree.nodes[link.control_node];
            if (node.subtree_end != link.control_node + 1) return error.UnsupportedRetainedFieldChildren;
            const classification = try classify(node.record.value.control_header, version);
            var ordinal: usize = 0;
            for (fields.items) |field| if (field.control_id == link.id) {
                ordinal += 1;
            };
            // Reuse the established complete-paragraph marker/end identity scan.
            const span = if (classification.kind == .company)
                @import("field_span.zig").Span{ .start_unit = @intCast(range.end), .end_unit = std.math.maxInt(u32) }
            else
                try @import("field_span.zig").find(text.raw, link.id, ordinal);
            open = .{ .classification = classification, .control_id = link.id, .control_node = link.control_node, .raw_header = node.record.framing.raw, .begin_control = range, .result = .{ .start = span.start_unit, .end = span.end_unit }, .end_control = undefined };
        } else if (c.code == 4) {
            if (!std.mem.allEqual(u8, c.data[4..], 0)) return error.UnsupportedRetainedMarkerData;
            var field = open orelse return error.OrphanRetainedFieldEnd;
            const end_id = std.mem.readInt(u32, c.data[0..4], .little);
            // Existing SSOT does not admit the actual Company high-byte 08 end.
            // This exact exception is local to the already classified profile;
            // never patch or normalize original text/marker IDs for a scanner.
            const observed_company_end = field.classification.kind == .company and
                end_id == ((rules.id("%usr") & 0x00ffffff) | 0x08000000);
            if (!@import("field_end_identity.zig").matches(field.control_id, end_id) and !observed_company_end)
                return error.FieldMarkerMismatch;
            if (field.classification.kind != .company and field.result.end != token.start_unit) return error.FieldMarkerMismatch;
            field.result.end = token.start_unit;
            const stored = text.raw[field.result.start * 2 .. field.result.end * 2];
            // Observed Company result is empty; page results are stored decimal
            // glyphs only. Preserve those bytes without treating them as current.
            if (field.classification.kind == .company) {
                if (stored.len != 0) return error.UnsupportedRetainedResult;
            } else {
                if (stored.len == 0) return error.UnsupportedRetainedResult;
                var at: usize = 0;
                while (at < stored.len) : (at += 2) {
                    const unit = std.mem.readInt(u16, stored[at..][0..2], .little);
                    if (unit < '0' or unit > '9') return error.UnsupportedRetainedResult;
                }
            }
            for (fields.items) |previous| {
                if (previous.classification.properties.instance_id == field.classification.properties.instance_id)
                    return error.DuplicateRetainedFieldInstance;
            }
            field.end_control = range;
            try fields.append(a, field);
            open = null;
        } else if (open != null) return error.UnsupportedRetainedResultControl;
    }
    if (open != null) return error.UnclosedRetainedField;
    if (fields.items.len == 0) return error.UnsupportedRetainedField;
    const owned_controls = try controls.toOwnedSlice(a);
    errdefer a.free(owned_controls);
    return .{ .paragraph_node = paragraph_node, .text_node = text_node, .text = text.raw, .fields = try fields.toOwnedSlice(a), .controls = owned_controls };
}
