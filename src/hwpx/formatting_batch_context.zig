//! Request-only immutable source inventories; current COW resources stay in Session.
const std = @import("std");
const package = @import("package.zig");
pub const Context = struct {
    document: ?package.Document = null,
    resources: ?package.HeaderResourceReport = null,
    fonts: ?package.FontReferenceReport = null,
    validation: ?@import("character_style_session.zig").QueryValidation = null,
    dirty_sections: std.AutoHashMapUnmanaged(usize, void) = .empty,
    prepared_sections: std.AutoHashMapUnmanaged(usize, [*]const @import("paragraph_structure_values.zig").Paragraph) = .empty,
    section_copies: usize = 0,
    section_borrows: usize = 0,
    resource_index: @import("character_resource_values.zig").Index = .{},
    original_ids: std.AutoHashMapUnmanaged(u32, void) = .empty,
    current_ids: std.AutoHashMapUnmanaged(u32, void) = .empty,
    intent_indices: std.AutoHashMapUnmanaged(u32, usize) = .empty,
    original_shapes: std.AutoHashMapUnmanaged(u32, @import("character_shape_display.zig").Shape) = .empty,
    current_shapes: std.AutoHashMapUnmanaged(u32, @import("character_shape_display.zig").Shape) = .empty,
    ids_initialized: bool = false,
    shapes_initialized: bool = false,
    indexed_entries: usize = 0,
    projected_entries: usize = 0,
    shape_inventory_builds: usize = 0,
    header_stats: @import("header_batch_resource_save.zig").Stats = .{},
    save_calls: usize = 0,
    document_builds: usize = 0,
    resource_builds: usize = 0,
    font_builds: usize = 0,
    pub fn deinit(self: *Context, a: std.mem.Allocator) void {
        if (self.validation) |*value| value.deinit();
        self.dirty_sections.deinit(a);
        self.prepared_sections.deinit(a);
        self.resource_index.deinit(a);
        self.original_ids.deinit(a);
        self.current_ids.deinit(a);
        self.intent_indices.deinit(a);
        self.original_shapes.deinit(a);
        self.current_shapes.deinit(a);
        if (self.fonts) |*value| value.deinit(a);
        if (self.resources) |*value| value.deinit(a);
        if (self.document) |*value| value.deinit(a);
        self.* = .{};
    }
    pub fn invalidateSections(self: *Context) void {
        if (self.validation) |*value| value.deinit();
        self.validation = null;
        self.dirty_sections.clearRetainingCapacity();
        self.prepared_sections.clearRetainingCapacity();
        self.resource_index.reset();
        self.original_ids.clearRetainingCapacity();
        self.current_ids.clearRetainingCapacity();
        self.intent_indices.clearRetainingCapacity();
        self.original_shapes.clearRetainingCapacity();
        self.current_shapes.clearRetainingCapacity();
        self.ids_initialized = false;
        self.shapes_initialized = false;
        self.indexed_entries = 0;
        self.projected_entries = 0;
    }
    pub fn canBorrow(self: *const Context, section: usize, values: *@import("paragraph_structure_values.zig").Values) bool {
        return if (self.prepared_sections.get(section)) |pointer| pointer == values.paragraphs.ptr else false;
    }
    pub fn prepared(self: *Context, a: std.mem.Allocator, section: usize, values: *@import("paragraph_structure_values.zig").Values) !void {
        try self.prepared_sections.put(a, section, values.paragraphs.ptr);
    }
    pub fn originalDocument(self: *Context, a: std.mem.Allocator, source: []const u8) !*package.Document {
        if (self.document == null) {
            self.document = try package.inspectDocument(a, source, .{});
            self.document_builds += 1;
        }
        return &self.document.?;
    }
    pub fn originalResources(self: *Context, a: std.mem.Allocator, document: *const package.Document) !*package.HeaderResourceReport {
        if (self.resources == null) {
            self.resources = try document.inspectHeaderResources(a, .{});
            self.resource_builds += 1;
        }
        return &self.resources.?;
    }
    pub fn originalFonts(self: *Context, a: std.mem.Allocator, document: *const package.Document) !*package.FontReferenceReport {
        if (self.fonts == null) {
            self.fonts = try document.inspectFontReferences(a, .{});
            self.font_builds += 1;
        }
        return &self.fonts.?;
    }
};
