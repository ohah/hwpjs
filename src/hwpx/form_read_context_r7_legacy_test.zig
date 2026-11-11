//! Ephemeral index under the existing synchronous paragraph read lease.
//! Borrows the immutable Native tree and owned pending values; owns no text.
//! Move into final storage before attach, and never serialize/clone this index.
const std = @import("std");
const editor = @import("editor_session.zig");
const Tree = @import("xml_part_tree.zig").Tree;
const selection = @import("xml_tree_selection.zig");
const values = @import("form_text_values.zig");
const source = @import("form_text_source.zig");
const View = @import("../xml/text_content.zig").View;
const missing = std.math.maxInt(usize);
const Content = struct { value: View, next: ?usize = null };
const Index = struct {
    owners: []?usize,
    pending: std.AutoHashMapUnmanaged(usize, usize) = .empty,
    fn deinit(self: *Index, a: std.mem.Allocator) void {
        a.free(self.owners);
        self.pending.deinit(a);
    }
};
const Contents = struct {
    first: []?usize,
    items: std.ArrayList(Content) = .empty,
    fn deinit(self: *Contents, a: std.mem.Allocator) void {
        a.free(self.first);
        self.items.deinit(a);
    }
};
pub const Context = struct {
    session: *const editor.Session,
    section_index: usize,
    section: *const editor.Section,
    tree: Tree,
    basis: ?*const @import("section_source_basis.zig").Basis,
    locations: []const @import("section_text.zig").Location,
    pending: []const values.Entry,
    choice_pending: []const @import("form_checkbox_state_values.zig").Entry,
    frames: ?[]selection.Frame = null,
    choices: ?std.AutoHashMapUnmanaged(usize, usize) = null,
    serial: u64,
    index: ?Index = null,
    contents: ?Contents = null,

    pub fn init(s: *const editor.Session, section: usize) Context {
        const part = &s.sections[section];
        return .{ .session = s, .section_index = section, .section = part, .tree = part.tree, .basis = part.activeSourceBasis(), .locations = part.locations, .pending = part.form_texts.entries.items, .choice_pending = part.checkbox_states.items, .serial = s.mutation_serial };
    }
    pub fn deinit(self: *Context) void {
        const a = self.session.allocator;
        if (self.frames) |v| a.free(v);
        if (self.choices) |*v| v.deinit(a);
        if (self.contents) |*v| v.deinit(a);
        if (self.index) |*v| v.deinit(a);
        self.* = undefined;
    }
    /// Native identity and monotone managed mutation serial, never public XML IDs.
    pub fn check(self: *const Context, s: *const editor.Session, section: usize) !void {
        if (s != self.session or section != self.section_index or section >= s.sections.len or &s.sections[section] != self.section or s.mutation_serial != self.serial) return error.StaleParagraphReadScope;
        const part = &s.sections[section];
        if (part.activeSourceBasis() != self.basis or part.locations.ptr != self.locations.ptr or part.locations.len != self.locations.len or part.tree.part_kind != self.tree.part_kind or part.tree.section_ordinal != self.tree.section_ordinal or part.tree.item_index != self.tree.item_index) return error.StaleParagraphReadScope;
        if (part.checkbox_states.items.ptr != self.choice_pending.ptr or part.checkbox_states.items.len != self.choice_pending.len) return error.StaleParagraphReadScope;
        if (part.tree.source.ptr != self.tree.source.ptr or part.tree.source.len != self.tree.source.len or part.tree.elements.ptr != self.tree.elements.ptr or part.tree.elements.len != self.tree.elements.len or part.tree.uris.ptr != self.tree.uris.ptr or part.tree.uris.len != self.tree.uris.len or part.form_texts.entries.items.ptr != self.pending.ptr or part.form_texts.entries.items.len != self.pending.len) return error.StaleParagraphReadScope;
    }
    fn ensureFrames(self: *Context) !void {
        if (self.frames != null) return;
        self.frames = try selection.build(self.session.allocator, &self.tree, editor.siteOptions(self.session.options).branch_policy, 65536);
    }
    fn ensureIndex(self: *Context) !void {
        if (self.index != null) return;
        const a = self.session.allocator;
        try self.section.validateSourceBasis();
        try self.ensureFrames();
        const owners = try a.alloc(?usize, self.tree.elements.len);
        errdefer a.free(owners);
        // The same parent-before-child tree order already checked by build.
        for (self.tree.elements, owners) |element, *owner| {
            owner.* = if (element.parent) |p| if (self.tree.elements[p].is(@import("document_xml.zig").paragraph_uri, "p")) p else owners[p] else null;
        }
        var pending: std.AutoHashMapUnmanaged(usize, usize) = .empty;
        errdefer pending.deinit(a);
        for (self.pending, 0..) |entry, i| {
            const item = try pending.getOrPut(a, entry.form_node);
            item.value_ptr.* = if (item.found_existing) missing else i;
        }
        self.index = .{ .owners = owners, .pending = pending };
    }
    pub fn validate(self: *Context, s: *const editor.Session, section: usize, node: usize) !void {
        try self.check(s, section);
        if (node >= self.tree.elements.len) return error.InvalidFormNode;
        try self.ensureIndex();
        const index = &self.index.?;
        if (!self.frames.?[node].active or self.frames.?[node].in_text) return error.InactiveFormNode;
        if (index.owners[node] == null) return error.SourceBindingMismatch;
    }
    pub fn choice(self: *Context, s: *const editor.Session, section: usize, node: usize, radio: bool) !@import("form_checkbox_state_write.zig").State {
        // Checkbox reads historically check activity only. Do not turn the
        // shared index into a new paragraph-owner/source permission grant.
        if (radio) try self.validate(s, section, node) else {
            try self.check(s, section);
            if (node >= self.tree.elements.len) return error.InvalidFormNode;
            try self.ensureFrames();
            if (!self.frames.?[node].active) return error.InactiveFormNode;
        }
        const a = s.allocator;
        const original = try @import("form_checkbox_state_values.zig").original(a, &self.tree, node, radio);
        if (self.choices == null) {
            var map: std.AutoHashMapUnmanaged(usize, usize) = .empty;
            errdefer map.deinit(a);
            for (self.choice_pending, 0..) |entry, i| {
                const item = try map.getOrPut(a, entry.form_node);
                item.value_ptr.* = if (item.found_existing) missing else i;
            }
            self.choices = map;
        }
        const current = if (self.choices.?.get(node)) |at| blk: {
            if (at == missing) return error.DuplicateFormStateEdit;
            break :blk self.choice_pending[at].state;
        } else original;
        if (radio and current == .indeterminate) return error.UnsupportedRadioState;
        return current;
    }
    fn ensureContents(self: *Context) !void {
        if (self.contents != null) return;
        const a = self.session.allocator;
        var result: Contents = .{ .first = try a.alloc(?usize, self.tree.elements.len) };
        errdefer result.deinit(a);
        @memset(result.first, null);
        const last = try a.alloc(?usize, self.tree.elements.len);
        defer a.free(last);
        @memset(last, null);
        const Builder = struct {
            a: std.mem.Allocator,
            result: *Contents,
            last: []?usize,
            fn content(raw: *anyopaque, event: Tree.ContentEvent) anyerror!void {
                const b: *@This() = @ptrCast(@alignCast(raw));
                const at = b.result.items.items.len;
                try b.result.items.append(b.a, .{ .value = event.value });
                if (b.last[event.parent_index]) |previous| b.result.items.items[previous].next = at else b.result.first[event.parent_index] = at;
                b.last[event.parent_index] = at;
            }
        };
        var builder: Builder = .{ .a = a, .result = &result, .last = last };
        try self.tree.visitContent(a, .{ .context = &builder, .on_content = Builder.content });
        self.contents = result;
    }
    pub fn read(self: *Context, s: *const editor.Session, section: usize, node: usize) ![]u8 {
        try self.validate(s, section, node);
        // Preserve target-before-selected-duplicate and current validation order.
        const leaf = try source.target(&self.tree, node);
        const a = s.allocator;
        if (self.index.?.pending.get(node)) |at| {
            if (at == missing) return error.DuplicateFormTextEdit;
            const text = self.pending[at].text;
            try source.validateValue(a, &self.tree, node, text);
            return a.dupe(u8, text);
        }
        try self.ensureContents();
        var text: std.ArrayList(u8) = .empty;
        defer text.deinit(a);
        var next = self.contents.?.first[leaf];
        while (next) |i| {
            const content = self.contents.?.items.items[i];
            const decoded = try content.value.toUtf8(a, source.max_bytes -| text.items.len);
            defer a.free(decoded);
            try text.appendSlice(a, decoded);
            next = content.next;
        }
        return text.toOwnedSlice(a);
    }
};
