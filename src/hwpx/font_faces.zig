const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");
const header_resources = @import("header_resources.zig");

pub const Language = enum(u8) { hangul, latin, hanja, japanese, other, symbol, user };
pub const languages = [_]Language{ .hangul, .latin, .hanja, .japanese, .other, .symbol, .user };
pub const source_names = [_][]const u8{ "HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER" };
pub const reference_names = [_][]const u8{ "hangul", "latin", "hanja", "japanese", "other", "symbol", "user" };

pub fn languageFromSource(value: []const u8) ?Language {
    for (source_names, 0..) |name, index| {
        if (std.mem.eql(u8, value, name)) return @enumFromInt(index);
    }
    return null;
}

pub const Report = struct {
    xml_bytes: usize,
    fontfaces_present: bool,
    declared_language_count: ?u32,
    tables: [languages.len]header_resources.Table,

    pub fn table(self: *const Report, language: Language) *const header_resources.Table {
        return &self.tables[@intFromEnum(language)];
    }

    pub fn languageCountMatches(self: *const Report) ?bool {
        const declared = self.declared_language_count orelse return null;
        var actual: usize = 0;
        for (self.tables) |entry| if (entry.present) {
            actual += 1;
        };
        return declared == actual;
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (&self.tables) |*entry| entry.ids.deinit(a);
        self.* = undefined;
    }
};

pub const Options = struct {
    max_xml_bytes: usize = 32 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_font_ids: usize = 1_000_000,
    xml: document_xml.Options = .{},
};

const Context = struct {
    allocator: std.mem.Allocator,
    options: Options,
    ref_list_seen: bool = false,
    within_ref_list: bool = false,
    fontfaces_present: bool = false,
    within_fontfaces: bool = false,
    declared_language_count: ?u32 = null,
    tables: [languages.len]header_resources.Table = @splat(.{}),
    active_language: ?Language = null,
    total_ids: usize = 0,

    fn deinit(self: *Context) void {
        for (&self.tables) |*table| table.ids.deinit(self.allocator);
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 4) self.active_language = null;
            if (depth == 3) self.within_fontfaces = false;
            if (depth == 2) self.within_ref_list = false;
            return;
        }
        if (depth == 1) {
            if (!try attrs.element(tag, scope, document_xml.head_uri, "head")) return error.InvalidHeaderRoot;
            return;
        }
        if (depth == 2) {
            if (!try attrs.element(tag, scope, document_xml.head_uri, "refList")) return;
            if (self.ref_list_seen) return error.DuplicateReferenceList;
            self.ref_list_seen = true;
            self.within_ref_list = tag.kind == .start;
            return;
        }
        if (!self.within_ref_list) return;
        if (depth == 3) {
            if (!try attrs.element(tag, scope, document_xml.head_uri, "fontfaces")) return;
            if (self.fontfaces_present) return error.DuplicateFontfaces;
            self.fontfaces_present = true;
            const count = try attrs.attribute(self.allocator, tag, scope, "itemCnt", self.options.max_attribute_bytes);
            defer if (count) |value| self.allocator.free(value);
            if (count) |value| self.declared_language_count = std.fmt.parseInt(u32, value, 10) catch return error.InvalidFontCount;
            self.within_fontfaces = tag.kind == .start;
            return;
        }
        if (!self.within_fontfaces) return;
        if (depth == 4) {
            if (!try attrs.element(tag, scope, document_xml.head_uri, "fontface")) return;
            const raw_language = (try attrs.attribute(self.allocator, tag, scope, "lang", self.options.max_attribute_bytes)) orelse return error.MissingFontLanguage;
            defer self.allocator.free(raw_language);
            const language = languageFromSource(raw_language) orelse return error.InvalidFontLanguage;
            const table = &self.tables[@intFromEnum(language)];
            if (table.present) return error.DuplicateFontLanguage;
            table.present = true;
            const count = try attrs.attribute(self.allocator, tag, scope, "fontCnt", self.options.max_attribute_bytes);
            defer if (count) |value| self.allocator.free(value);
            if (count) |value| table.declared_count = std.fmt.parseInt(u32, value, 10) catch return error.InvalidFontCount;
            self.active_language = if (tag.kind == .start) language else null;
            return;
        }
        if (depth != 5) return;
        const language = self.active_language orelse return;
        if (!try attrs.element(tag, scope, document_xml.head_uri, "font")) return;
        const raw_id = (try attrs.attribute(self.allocator, tag, scope, "id", self.options.max_attribute_bytes)) orelse return error.MissingFontId;
        defer self.allocator.free(raw_id);
        const id = std.fmt.parseInt(u32, raw_id, 10) catch return error.InvalidFontId;
        if (self.total_ids == self.options.max_font_ids) return error.LimitExceeded;
        try self.tables[@intFromEnum(language)].ids.append(self.allocator, id);
        self.total_ids += 1;
    }
};

fn less(_: void, a: u32, b: u32) bool {
    return a < b;
}

/// Owns exact per-language font ID sets. Unknown font payload is only XML
/// syntax-checked; no font fallback or face-name policy is inferred.
pub fn read(a: std.mem.Allocator, archive: zip.Archive, entry: zip.Entry, options: Options) !Report {
    const bytes = try archive.decode(entry, options.max_xml_bytes);
    defer archive.allocator.free(bytes);
    var context: Context = .{ .allocator = a, .options = options };
    errdefer context.deinit();
    _ = try document_xml.visitBytes(a, bytes, options.max_xml_bytes, options.xml, .{ .context = &context, .on_tag = Context.onTag });
    if (!context.ref_list_seen) return error.MissingReferenceList;
    for (&context.tables) |*table| {
        std.mem.sort(u32, table.ids.items, {}, less);
        if (table.ids.items.len > 1) {
            for (table.ids.items[1..], table.ids.items[0 .. table.ids.items.len - 1]) |id, previous| {
                if (id == previous) return error.DuplicateFontId;
            }
        }
    }
    return .{
        .xml_bytes = bytes.len,
        .fontfaces_present = context.fontfaces_present,
        .declared_language_count = context.declared_language_count,
        .tables = context.tables,
    };
}
