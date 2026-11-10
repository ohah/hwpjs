//! 실제 문단 style의 원본 참조를 확인합니다. ID0/default font를 추정하지 않습니다.
const std = @import("std");
const m = @import("../model/formatting_patch.zig");
const head = @import("document_xml.zig").head_uri;
pub fn read(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, owner: m.Owner) !m.ResetResources {
    const backend = @import("formatting_projection.zig").Backend{ .session = session, .allocator = a };
    return backend.resetResources(owner, a);
}
/// The caller supplies the live resolver, not a trusted bit or template index.
/// Backend reuses its request-local current view and completed owner proof.
pub fn readWithContext(a: std.mem.Allocator, backend: anytype, owner: m.Owner, context: *@import("formatting_preflight.zig").Context, index: *Index) !m.ResetResources {
    return readIdentity(a, context, try backend.resetStyleIdentity(a, owner), index);
}
/// One header style inventory per readonly request. Duplicate IDs are retained
/// as selected-ID errors, not global errors. Stop at the first malformed ID:
/// the old scan would stop there for every selection except an earlier selected
/// duplicate, which keeps priority over that later failure.
pub const Index = struct {
    allocator: std.mem.Allocator,
    characters: ResourceIndex = .{},
    paragraphs: ResourceIndex = .{},
    resources: std.AutoHashMapUnmanaged(u32, m.ResetResources) = .empty,
    nodes: std.AutoHashMapUnmanaged(u32, Entry) = .empty,
    failure: ?anyerror = null,
    prepared: bool = false,
    const Entry = struct { node: usize, duplicate: bool = false };
    pub fn deinit(self: *Index) void {
        self.characters.deinit(self.allocator);
        self.paragraphs.deinit(self.allocator);
        self.resources.deinit(self.allocator);
        self.nodes.deinit(self.allocator);
    }
    pub fn resourceNode(self: *Index, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, comptime kind: ResourceKind, identity: u32) !usize {
        const resource = if (kind == .character) &self.characters else &self.paragraphs;
        return resource.node(self.allocator, a, tree, kind, identity);
    }
    fn prepare(self: *Index, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree) !void {
        var nodes: std.AutoHashMapUnmanaged(u32, Entry) = .empty;
        errdefer nodes.deinit(self.allocator);
        var failure: ?anyerror = null;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(head, "style")) continue;
            const parent = element.parent orelse continue;
            if (!tree.elements[parent].is(head, "styles")) continue;
            const id = styleId(a, tree, index) catch |err| {
                if (err == error.OutOfMemory) return err;
                failure = err;
                break;
            };
            const entry = try nodes.getOrPut(self.allocator, id);
            if (entry.found_existing) entry.value_ptr.duplicate = true else entry.value_ptr.* = .{ .node = index };
        }
        self.nodes = nodes;
        self.failure = failure;
        self.prepared = true;
    }
    pub fn node(self: *Index, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, identity: u32) !usize {
        if (!self.prepared) try self.prepare(a, tree);
        const entry = self.nodes.get(identity);
        if (entry) |value| if (value.duplicate) return error.DuplicateResetStyle;
        if (self.failure) |err| return err;
        return if (entry) |value| value.node else error.MissingResetStyle;
    }
};
pub const ResourceKind = enum { character, paragraph };
/// Reset-only equivalent of preflight.node. Keep the first match and stop at
/// the first malformed present ID. A retained earlier match wins over that
/// barrier; absent IDs and unselected duplicates never become global errors.
const ResourceIndex = struct {
    nodes: std.AutoHashMapUnmanaged(u32, usize) = .empty,
    failure: ?anyerror = null,
    prepared: bool = false,
    fn deinit(self: *ResourceIndex, allocator: std.mem.Allocator) void {
        self.nodes.deinit(allocator);
    }
    fn prepare(self: *ResourceIndex, allocator: std.mem.Allocator, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, comptime kind: ResourceKind) !void {
        var nodes: std.AutoHashMapUnmanaged(u32, usize) = .empty;
        errdefer nodes.deinit(allocator);
        var failure: ?anyerror = null;
        const name = if (kind == .character) "charPr" else "paraPr";
        const group = if (kind == .character) "charProperties" else "paraProperties";
        for (tree.elements, 0..) |element, index| {
            if (!element.is(head, name)) continue;
            const parent = element.parent orelse continue;
            if (!tree.elements[parent].is(head, group)) continue;
            const raw = tree.attributeValue(a, index, "", "id") catch |err| {
                if (err == error.OutOfMemory) return err;
                failure = err;
                break;
            };
            const id = @import("table_xml_fields.zig").unsigned(a, raw orelse continue, 4096) catch |err| {
                if (err == error.OutOfMemory) return err;
                failure = err;
                break;
            };
            const entry = try nodes.getOrPut(allocator, id);
            if (!entry.found_existing) entry.value_ptr.* = index;
        }
        // Publish only complete preparation or a deterministic source barrier.
        // OOM leaves this index unprepared and retryable, with no partial map.
        self.nodes = nodes;
        self.failure = failure;
        self.prepared = true;
    }
    fn node(self: *ResourceIndex, allocator: std.mem.Allocator, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, comptime kind: ResourceKind, identity: u32) !usize {
        if (!self.prepared) try self.prepare(allocator, a, tree, kind);
        if (self.nodes.get(identity)) |index| return index;
        if (self.failure) |err| return err;
        return error.InvalidResourceReference;
    }
};

fn styleId(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, index: usize) !u32 {
    const id = (try tree.attributeValue(a, index, "", "id")) orelse return error.MissingResetStyle;
    return @import("table_xml_fields.zig").unsigned(a, id, 4096);
}
fn readIdentity(a: std.mem.Allocator, context: *@import("formatting_preflight.zig").Context, identity: u32, index: *Index) !m.ResetResources {
    const node = try index.node(a, &context.tree, identity);
    if (index.resources.get(identity)) |resources| return resources;
    const kind = (try context.tree.attributeValue(a, node, "", "type")) orelse return error.MissingResetStyle;
    const token = try kind.toUtf8(a, 4096);
    defer a.free(token);
    if (!std.mem.eql(u8, token, "PARA")) return error.UnsupportedResetStyle;
    var result: m.ResetResources = .{ .style_id = identity };
    if (try context.tree.attributeValue(a, node, "", "charPrIDRef")) |ref| {
        const id = try @import("table_xml_fields.zig").unsigned(a, ref, 4096);
        _ = try index.resourceNode(a, &context.tree, .character, id);
        result.character = id;
    }
    if (try context.tree.attributeValue(a, node, "", "paraPrIDRef")) |ref| {
        const id = try @import("table_xml_fields.zig").unsigned(a, ref, 4096);
        _ = try index.resourceNode(a, &context.tree, .paragraph, id);
        result.paragraph = id;
    }
    try index.resources.put(index.allocator, identity, result);
    return result;
}
