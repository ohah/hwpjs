//! Query-local host/anchor lookup. Existing projection builders remain authority.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Pair = struct { template: usize, node: usize };
const Host = struct { first: usize, count: usize = 0, protected: bool = false, unprotected: bool = false, first_unprotected: ?usize = null, first_protected: ?usize = null };
const Anchor = struct { first: usize, duplicate: ?usize = null };
const Units = struct {
    positions: std.AutoHashMapUnmanaged(usize, usize) = .empty,
    failure: ?anyerror = null,
};
pub const Index = struct {
    a: std.mem.Allocator,
    tree: *const Tree,
    paragraphs: []const Paragraph,
    hosts: std.AutoHashMapUnmanaged(usize, Host) = .empty,
    anchors: std.AutoHashMapUnmanaged(Pair, Anchor) = .empty,
    units: []?Units,
    barrier: ?struct { row: usize, failure: anyerror } = null,
    pub fn init(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph) !Index {
        var result: Index = .{ .a = a, .tree = tree, .paragraphs = paragraphs, .units = try a.alloc(?Units, paragraphs.len) };
        @memset(result.units, null);
        errdefer result.deinit();
        var membership: std.AutoHashMapUnmanaged(Pair, void) = .empty;
        defer membership.deinit(a);
        for (paragraphs, 0..) |paragraph, row| {
            if (paragraph.joined()) |view| {
                view.validate() catch |err| {
                    // The legacy search can stop at an earlier ambiguous owner.
                    // Keep the first semantic barrier; never eagerly reject later rows.
                    result.barrier = .{ .row = row, .failure = err };
                    break;
                };
                for (view.pieces) |piece| try result.addHost(&membership, piece.template_element, row);
            } else try result.addHost(&membership, paragraph.template_element, row);
        }
        const owners = try a.alloc(?usize, tree.elements.len);
        defer a.free(owners);
        for (tree.elements, owners, 0..) |element, *owner, i| {
            owner.* = if (element.parent) |p| blk: {
                if (p >= i) return error.InvalidSectionTreeDepth;
                break :blk if (tree.elements[p].is(@import("document_xml.zig").paragraph_uri, "p")) p else owners[p];
            } else null;
        }
        for (paragraphs[0..if (result.barrier) |v| v.row else paragraphs.len], 0..) |paragraph, row| for (paragraph.protected_positions orelse continue) |item| {
            if (item.kind != .anchor or item.element_index >= owners.len) continue;
            const template = owners[item.element_index] orelse continue;
            if (!membership.contains(.{ .template = template, .node = row })) continue;
            const at = try result.anchors.getOrPut(a, .{ .template = template, .node = item.element_index });
            if (at.found_existing) {
                if (at.value_ptr.duplicate == null) at.value_ptr.duplicate = row;
            } else at.value_ptr.* = .{ .first = row };
        };
        return result;
    }
    fn addHost(self: *Index, membership: *std.AutoHashMapUnmanaged(Pair, void), template: usize, row: usize) !void {
        if ((try membership.getOrPut(self.a, .{ .template = template, .node = row })).found_existing) return;
        const entry = try self.hosts.getOrPut(self.a, template);
        if (!entry.found_existing) entry.value_ptr.* = .{ .first = row };
        entry.value_ptr.count += 1;
        if (self.paragraphs[row].protected_positions != null) {
            entry.value_ptr.protected = true;
            if (entry.value_ptr.first_protected == null) entry.value_ptr.first_protected = row;
        } else {
            entry.value_ptr.unprotected = true;
            if (entry.value_ptr.first_unprotected == null) entry.value_ptr.first_unprotected = row;
        }
    }
    pub fn deinit(self: *Index) void {
        for (self.units) |*maybe| if (maybe.*) |*unit| unit.positions.deinit(self.a);
        self.a.free(self.units);
        self.anchors.deinit(self.a);
        self.hosts.deinit(self.a);
        self.* = undefined;
    }
    pub fn ordinal(self: *const Index, first: usize, template: usize, anchor: usize) !usize {
        const selected = self.hosts.get(template);
        // First pass only stops at a matching protected row. An earlier invalid
        // joined row wins even over unprotected duplicates in the prefix.
        if (self.barrier) |barrier| {
            if (selected == null or selected.?.first_protected == null) return barrier.failure;
        }
        const host = selected orelse return error.MissingCurrentParagraphDisplayHost;
        if (host.protected) {
            const found = self.anchors.get(.{ .template = template, .node = anchor });
            if (host.first_unprotected) |barrier| {
                if (found == null or barrier < found.?.first) return error.AmbiguousParagraphDisplayHost;
                _ = std.math.add(usize, first, found.?.first) catch return error.LimitExceeded;
                return error.AmbiguousParagraphDisplayHost;
            }
            const hit = found orelse {
                if (self.barrier) |barrier| return barrier.failure;
                return error.MissingCurrentParagraphDisplayHost;
            };
            const ordinal_value = std.math.add(usize, first, hit.first) catch return error.LimitExceeded;
            if (hit.duplicate != null) return error.AmbiguousParagraphDisplayHost;
            if (self.barrier) |barrier| return barrier.failure;
            return ordinal_value;
        }
        const ordinal_value = std.math.add(usize, first, host.first) catch return error.LimitExceeded;
        if (host.count != 1) return error.AmbiguousParagraphDisplayHost;
        return ordinal_value;
    }

    fn prepareUnits(self: *Index, row: usize) !Units {
        var result: Units = .{};
        errdefer result.positions.deinit(self.a);
        const paragraph = &self.paragraphs[row];
        const segments = if (paragraph.protected_positions != null)
            try @import("paragraph_protected_positions.zig").build(self.a, self.tree, paragraph)
        else blk: {
            const locations = try @import("paragraph_structure_locations.zig").build(self.a, self.tree, paragraph);
            defer self.a.free(locations);
            break :blk try @import("anchor_text_positions.zig").build(self.a, self.tree, &paragraph.sites, locations, 1);
        };
        defer self.a.free(segments);
        for (segments) |segment| if (segment.kind == .anchor) {
            const entry = try result.positions.getOrPut(self.a, segment.index);
            if (!entry.found_existing) entry.value_ptr.* = segment.start_unit;
        };
        return result;
    }
    pub fn position(self: *Index, row: usize, node: usize) !usize {
        if (self.units[row] == null) self.units[row] = self.prepareUnits(row) catch |err| blk: {
            if (err == error.OutOfMemory) return err;
            break :blk .{ .failure = err };
        };
        const unit = &self.units[row].?;
        if (unit.failure) |err| return err;
        return unit.positions.get(node) orelse error.MissingProtectedDisplayAnchor;
    }
};
