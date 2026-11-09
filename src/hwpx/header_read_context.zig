//! Request-local preparation of immutable source and current resource intents.
//! A scope must stay at a stable address; nothing here is an editing owner.
const std = @import("std");
const Session = @import("editor_session.zig").Session;
const package = @import("package.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Shape = @import("character_shape_display.zig").Shape;

pub const Context = struct {
    owner: *const Session,
    allocator: std.mem.Allocator,
    source: []const u8,
    serial: u64,
    max_xml_bytes: usize,
    document_value: ?package.Document = null,
    resources_value: ?package.HeaderResourceReport = null,
    original_tree: ?Tree = null,
    current_tree: ?Tree = null,
    batch_tree: ?Tree = null,
    shapes: ?[]Shape = null,
    profile_value: ?@import("source_color_profile.zig").Profile = null,

    pub fn init(owner: *const Session) Context {
        return .{ .owner = owner, .allocator = owner.allocator, .source = owner.source, .serial = owner.mutation_serial, .max_xml_bytes = owner.options.max_xml_bytes };
    }
    pub fn check(self: *const Context) !void {
        if (self.owner.mutation_serial != self.serial or self.owner.source.ptr != self.source.ptr or self.owner.source.len != self.source.len or self.owner.options.max_xml_bytes != self.max_xml_bytes) return error.StaleHeaderReadContext;
    }
    pub fn deinit(self: *Context) void {
        if (self.shapes) |values| self.allocator.free(values);
        if (self.batch_tree) |*tree| tree.deinit(self.allocator);
        if (self.current_tree) |*tree| tree.deinit(self.allocator);
        if (self.original_tree) |*tree| tree.deinit(self.allocator);
        if (self.resources_value) |*resources| resources.deinit(self.allocator);
        if (self.document_value) |*document_value| document_value.deinit(self.allocator);
        self.* = undefined;
    }
    pub fn document(self: *Context) !*const package.Document {
        try self.check();
        if (self.document_value == null) self.document_value = try package.inspectDocument(self.allocator, self.source, .{});
        return &self.document_value.?;
    }
    pub fn originalResources(self: *Context) !*const package.HeaderResourceReport {
        try self.check();
        if (self.resources_value == null) self.resources_value = try (try self.document()).inspectHeaderResources(self.allocator, .{});
        return &self.resources_value.?;
    }
    pub fn originalHeader(self: *Context) !*const Tree {
        try self.check();
        // Only the Native-owned immutable input contract permits this borrow.
        // Raw Sessions retain fresh parsing so direct source changes remain visible.
        if (self.owner.display_resource_trusted and self.owner.original_header_source.ptr == self.source.ptr and self.owner.original_header_source.len == self.source.len) {
            if (self.owner.original_header) |*header| {
                return header;
            }
        }
        if (self.original_tree == null) self.original_tree = try (try self.document()).readHeaderTree(self.allocator, .{});
        return &self.original_tree.?;
    }
    pub fn currentHeader(self: *Context, allow_formatting_batch: bool) !*const Tree {
        try self.check();
        const a = self.allocator;
        const session = self.owner;
        const batch = if (allow_formatting_batch) session.formatting_batch else null;
        const slot = if (batch != null) &self.batch_tree else &self.current_tree;
        if (slot.* == null) {
            const header = if (batch) |context|
                try @import("header_resource_save.zig").replacementBatch(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, self.max_xml_bytes, &context.header_stats)
            else
                try @import("header_resource_save.zig").replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, self.max_xml_bytes);
            defer a.free(header.bytes);
            slot.* = try @import("header_tree.zig").parse(a, header.bytes, 0, .{ .max_xml_bytes = self.max_xml_bytes });
        }
        return &slot.*.?;
    }
    pub fn profile(self: *Context) !@import("source_color_profile.zig").Profile {
        try self.check();
        if (self.profile_value == null) {
            var producer = try @import("source_version_metadata.zig").readDocument(self.allocator, try self.document(), .{ .max_xml_bytes = @min(self.max_xml_bytes, 1024 * 1024), .max_attribute_bytes = 4096 });
            defer producer.deinit(self.allocator);
            self.profile_value = @import("source_color_profile.zig").classify(if (producer.sourceVersion) |*value| value else null);
        }
        return self.profile_value.?;
    }
};

pub fn lookup(session: *const Session) !?*Context {
    const context = session.header_read_context orelse return null;
    // Copies used by validation/writers must derive their own current values.
    if (context.owner != session or session.allocator.ptr != context.allocator.ptr or session.allocator.vtable != context.allocator.vtable or session.formatting_batch != null) return null;
    try context.check();
    return context;
}

pub const Lease = union(enum) {
    borrowed: *Context,
    owned: Context,
    pub fn get(self: *Lease) *Context {
        return switch (self.*) {
            .borrowed => |context| context,
            .owned => &self.owned,
        };
    }
    pub fn deinit(self: *Lease) void {
        switch (self.*) {
            .borrowed => {},
            .owned => |*context| context.deinit(),
        }
        self.* = undefined;
    }
};
pub fn lease(session: *const Session) !Lease {
    if (try lookup(session)) |context| return .{ .borrowed = context };
    return .{ .owned = Context.init(session) };
}
