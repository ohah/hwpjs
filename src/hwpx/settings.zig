const std = @import("std");
const xml = @import("../xml/root.zig");
const zip = @import("../zip/archive.zig");
const manifest = @import("content_manifest.zig");
const document_xml = @import("document_xml.zig");
const attrs = @import("xml_attributes.zig");
const values = @import("xml_values.zig");
const namespace_profile = @import("namespace_profile.zig");

pub const app_uri = "http://www.hancom.co.kr/hwpml/2011/app";
pub const config_uri = "urn:oasis:names:tc:opendocument:xmlns:config:1.0";

pub const Options = struct {
    max_xml_bytes: usize = 4 * 1024 * 1024,
    max_attribute_bytes: usize = 4096,
    max_value_bytes: usize = 4096,
    max_carets: usize = 1024,
    max_sets: usize = 4096,
    max_items: usize = 65_535,
    xml: document_xml.Options = .{},
};

pub const Caret = struct {
    list_id_ref: ?[]u8,
    para_id_ref: ?[]u8,
    pos: ?[]u8,

    fn deinit(self: *Caret, a: std.mem.Allocator) void {
        if (self.list_id_ref) |v| a.free(v);
        if (self.para_id_ref) |v| a.free(v);
        if (self.pos) |v| a.free(v);
    }
};

pub const ConfigSet = struct {
    name: ?[]u8,
    first_item: usize,
    item_count: usize = 0,

    fn deinit(self: *ConfigSet, a: std.mem.Allocator) void {
        if (self.name) |v| a.free(v);
    }
};

pub const ConfigItem = struct {
    name: ?[]u8,
    type_name: ?[]u8,
    value: std.ArrayList(u8) = .empty,

    fn deinit(self: *ConfigItem, a: std.mem.Allocator) void {
        if (self.name) |v| a.free(v);
        if (self.type_name) |v| a.free(v);
        self.value.deinit(a);
    }
};

pub const Report = struct {
    present: bool,
    entry_index: ?usize,
    xml_bytes: usize,
    carets: []Caret,
    sets: []ConfigSet,
    items: []ConfigItem,
    other_elements: usize,
    unsupported_types: usize,

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.carets) |*v| v.deinit(a);
        for (self.sets) |*v| v.deinit(a);
        for (self.items) |*v| v.deinit(a);
        a.free(self.carets);
        a.free(self.sets);
        a.free(self.items);
        self.* = undefined;
    }
};

const Context = struct {
    a: std.mem.Allocator,
    options: Options,
    carets: std.ArrayList(Caret) = .empty,
    sets: std.ArrayList(ConfigSet) = .empty,
    items: std.ArrayList(ConfigItem) = .empty,
    active_caret: bool = false,
    active_set: ?usize = null,
    active_item: ?usize = null,
    other_elements: usize = 0,
    unsupported_types: usize = 0,

    fn deinit(self: *Context) void {
        for (self.carets.items) |*v| v.deinit(self.a);
        for (self.sets.items) |*v| v.deinit(self.a);
        for (self.items.items) |*v| v.deinit(self.a);
        self.carets.deinit(self.a);
        self.sets.deinit(self.a);
        self.items.deinit(self.a);
    }

    fn configAttribute(self: *Context, tag: xml.tags.Tag, scope: *const xml.namespaces.State, local: []const u8) !?[]u8 {
        const plain = try attrs.attribute(self.a, tag, scope, local, self.options.max_attribute_bytes);
        errdefer if (plain) |v| self.a.free(v);
        const qualified = try attrs.attributeInNamespace(self.a, tag, scope, config_uri, local, self.options.max_attribute_bytes);
        if (plain != null and qualified != null) {
            self.a.free(qualified.?);
            return error.AmbiguousConfigAttribute;
        }
        return plain orelse qualified;
    }

    fn finishItem(self: *Context) !void {
        const index = self.active_item orelse return;
        const item = &self.items.items[index];
        if (item.type_name) |type_name| {
            if (std.mem.eql(u8, type_name, "boolean")) {
                _ = try values.boolean(item.value.items);
            } else if (std.mem.eql(u8, type_name, "short")) {
                _ = try values.short(item.value.items);
            } else self.unsupported_types += 1;
        } else self.unsupported_types += 1;
        self.active_item = null;
    }

    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (tag.kind == .end) {
            if (depth == 3 and self.active_item != null) try self.finishItem();
            if (depth == 2) {
                self.active_caret = false;
                self.active_set = null;
            }
            return;
        }
        if (depth == 1) {
            if (try attrs.element(tag, scope, app_uri, "HWPApplicationSetting")) return;
            const name = try scope.expandElement(tag.name);
            if (namespace_profile.isVersionedRoot(name, "HWPApplicationSetting", "app")) return error.UnsupportedHwpxNamespaceProfile;
            return error.InvalidSettingsRoot;
        }
        if (self.active_item != null) return error.InvalidConfigItemChild;
        if (self.active_caret) return error.InvalidCaretChild;
        if (depth == 2 and try attrs.element(tag, scope, app_uri, "CaretPosition")) {
            if (self.carets.items.len == self.options.max_carets) return error.LimitExceeded;
            var caret: Caret = .{
                .list_id_ref = try attrs.attribute(self.a, tag, scope, "listIDRef", self.options.max_attribute_bytes),
                .para_id_ref = null,
                .pos = null,
            };
            errdefer caret.deinit(self.a);
            caret.para_id_ref = try attrs.attribute(self.a, tag, scope, "paraIDRef", self.options.max_attribute_bytes);
            caret.pos = try attrs.attribute(self.a, tag, scope, "pos", self.options.max_attribute_bytes);
            if (caret.list_id_ref) |v| _ = try values.unsigned32(v);
            if (caret.para_id_ref) |v| _ = try values.unsigned32(v);
            if (caret.pos) |v| _ = try values.unsigned32(v);
            try self.carets.append(self.a, caret);
            if (tag.kind == .start) self.active_caret = true;
            return;
        }
        if (depth == 2 and try attrs.element(tag, scope, config_uri, "config-item-set")) {
            if (self.sets.items.len == self.options.max_sets) return error.LimitExceeded;
            const set: ConfigSet = .{ .name = try self.configAttribute(tag, scope, "name"), .first_item = self.items.items.len };
            errdefer if (set.name) |v| self.a.free(v);
            try self.sets.append(self.a, set);
            if (tag.kind == .start) self.active_set = self.sets.items.len - 1;
            return;
        }
        if (depth == 3 and self.active_set != null and try attrs.element(tag, scope, config_uri, "config-item")) {
            if (self.items.items.len == self.options.max_items) return error.LimitExceeded;
            var item: ConfigItem = .{ .name = try self.configAttribute(tag, scope, "name"), .type_name = null };
            errdefer item.deinit(self.a);
            item.type_name = try self.configAttribute(tag, scope, "type");
            try self.items.append(self.a, item);
            self.sets.items[self.active_set.?].item_count += 1;
            self.active_item = self.items.items.len - 1;
            if (tag.kind == .empty) try self.finishItem();
            return;
        }
        self.other_elements += 1;
    }

    fn onContent(raw: *anyopaque, view: xml.text_content.View, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (depth == 2 and (self.active_caret or self.active_set != null)) {
            const content = try view.toUtf8(self.a, self.options.max_xml_bytes);
            defer self.a.free(content);
            if (std.mem.trim(u8, content, " \t\r\n").len != 0)
                return if (self.active_caret) error.InvalidCaretContent else error.InvalidConfigSetContent;
            return;
        }
        if (depth != 3 or self.active_item == null) return;
        const item = &self.items.items[self.active_item.?];
        if (item.value.items.len > self.options.max_value_bytes) return error.LimitExceeded;
        const chunk = try view.toUtf8(self.a, self.options.max_value_bytes - item.value.items.len);
        defer self.a.free(chunk);
        try item.value.appendSlice(self.a, chunk);
    }
};

/// Reads only the exact embedded settings.xml manifest part. Absence is not a
/// synthesized default. Unknown extension nodes and types remain unresolved.
pub fn inspect(a: std.mem.Allocator, archive: zip.Archive, manifest_items: []const manifest.Item, options: Options) !Report {
    var selected: ?usize = null;
    for (manifest_items) |item| {
        if (!std.mem.eql(u8, item.href, "settings.xml")) continue;
        if (selected != null) return error.DuplicateSettingsItem;
        if (!std.mem.eql(u8, item.media_type, manifest.xml_media_type)) return error.InvalidSettingsMediaType;
        selected = item.entry_index orelse return error.UnsupportedExternalSettings;
    }
    var context: Context = .{ .a = a, .options = options };
    defer context.deinit();
    var xml_bytes: usize = 0;
    if (selected) |entry_index| {
        if (entry_index >= archive.entries.len) return error.InvalidManifestEntryIndex;
        const bytes = try archive.decode(archive.entries[entry_index], options.max_xml_bytes);
        defer archive.allocator.free(bytes);
        xml_bytes = bytes.len;
        var xml_options = options.xml;
        xml_options.max_attribute_bytes = @min(xml_options.max_attribute_bytes, options.max_attribute_bytes);
        _ = try document_xml.visitBytes(a, bytes, options.max_xml_bytes, xml_options, .{
            .context = &context,
            .on_tag = Context.onTag,
            .on_content = Context.onContent,
        });
    }
    const carets = try context.carets.toOwnedSlice(a);
    errdefer {
        for (carets) |*v| v.deinit(a);
        a.free(carets);
    }
    const sets = try context.sets.toOwnedSlice(a);
    errdefer {
        for (sets) |*v| v.deinit(a);
        a.free(sets);
    }
    const items = try context.items.toOwnedSlice(a);
    return .{ .present = selected != null, .entry_index = selected, .xml_bytes = xml_bytes, .carets = carets, .sets = sets, .items = items, .other_elements = context.other_elements, .unsupported_types = context.unsupported_types };
}
