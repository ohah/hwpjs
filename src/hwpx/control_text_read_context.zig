//! Request-local control-aware read projection. No editing permission, source
//! normalization, History enablement, paragraph-prefix scans, or sorting.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Segment = @import("paragraph_text_positions.zig").Segment;
const spelling = @import("paragraph_text_positions.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Limits = struct {
    max_paragraphs: usize = 100000,
    max_bytes: usize = 64 * 1024 * 1024,
    max_units: usize = 32 * 1024 * 1024,
    max_nodes: usize = 2_000_000,
    max_attribute_bytes: usize = 4096,
    max_bindings: usize = 2_000_000,
    max_parts: usize = 2_000_000,
    max_control_routes: usize = 2_000_000,
    branch_policy: @import("compatibility_selection.zig").Policy = .{},
};
pub const Coverage = enum { complete, partial };
pub const Issue = enum { UnknownControl, UnresolvedField, MissingCurrentSite, InconsistentControlOwner };
pub const Control = struct { kind: @FieldType(Segment, "kind"), node: usize, startUnit: u32, endUnit: u32 };
pub const Row = struct {
    currentIndex: usize,
    sourceNode: usize,
    plain: []const u8,
    text: ?[]const u8,
    units: u32,
    controls: []const Control,
    segments: []const Segment,
    coverage: Coverage,
    issue: ?Issue,
};
pub const Counters = struct { selected_parent_nodes: usize = 0, selected_parent_rewrites: usize = 0, paragraph_content_events: usize = 0, nodes: usize = 0, events: usize = 0, sites: usize = 0, bindings: usize = 0, controls: usize = 0, rows: usize = 0, field_passes: usize = 0, point_lookups: usize = 0, binding_scans: usize = 0, control_routes: usize = 0 };
pub const Context = struct {
    arena: std.heap.ArenaAllocator,
    rows: []const Row,
    paragraphs: []const Paragraph,
    by_owner: std.AutoHashMapUnmanaged(usize, ?usize),
    counters: Counters,
    pub fn deinit(self: *Context) void {
        self.arena.deinit();
        self.* = undefined;
    }
    pub fn rowByIndex(self: *const Context, current_index: usize, actual_owner: usize) !Row {
        if (current_index >= self.rows.len or self.rows[current_index].sourceNode != actual_owner) return error.SourceBindingMismatch;
        return self.rows[current_index];
    }
    pub fn validateBoundary(self: *const Context, current_index: usize, actual_owner: usize, unit: u32) !void {
        const row = try self.rowByIndex(current_index, actual_owner);
        if (row.coverage != .complete) return error.IncompleteControlTextObservation;
        if (row.units == 0 and unit == 0) return;
        try spelling.validateBoundary(&self.paragraphs[current_index].sites, row.segments, unit);
    }
    pub fn uniqueRowByOwner(self: *const Context, actual_owner: usize) !Row {
        const at = self.by_owner.get(actual_owner) orelse return error.MissingCurrentParagraphReference;
        return self.rows[at orelse return error.AmbiguousCurrentParagraphReference];
    }
    pub fn copyVisibleText(self: *const Context, a: std.mem.Allocator, current_index: usize, actual_owner: usize, max_bytes: usize) ![]u8 {
        const row = try self.rowByIndex(current_index, actual_owner);
        const text = row.text orelse return error.IncompleteControlTextObservation;
        if (row.coverage != .complete) return error.IncompleteControlTextObservation;
        if (text.len > max_bytes) return error.LimitExceeded;
        return a.dupe(u8, text);
    }
    pub fn init(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph, limits: Limits) !Context {
        if (paragraphs.len > limits.max_paragraphs or tree.elements.len > limits.max_nodes) return error.LimitExceeded;
        var arena = std.heap.ArenaAllocator.init(a);
        errdefer arena.deinit();
        const owned = arena.allocator();
        var builder = try Builder.init(owned, tree, paragraphs, limits);
        try tree.visitOrdered(owned, .{ .context = &builder, .on_event = Builder.event });
        const rows = try builder.finish();
        return .{ .arena = arena, .rows = rows, .paragraphs = paragraphs, .by_owner = builder.by_owner, .counters = builder.counters };
    }
};
const Token = union(enum) { text: usize, control: Segment };
const Part = struct {
    row: usize,
    owner: usize,
    generated: bool,
    first_text: usize,
    emit: bool = true,
    tokens: std.ArrayList(Token) = .empty,
};
const Point = struct { offset: usize, node: usize, content_end: ?usize = null };
const Binding = struct { part: usize, site: usize, node: usize, seen: bool = false };
const Draft = struct { parts: std.ArrayList(usize) = .empty, owners: std.AutoHashMapUnmanaged(usize, ?usize) = .empty, issue: ?Issue = null };
const Builder = struct {
    a: std.mem.Allocator,
    tree: *const Tree,
    paragraphs: []const Paragraph,
    limits: Limits,
    owners: []?usize,
    frames: []const @import("xml_tree_selection.zig").Frame,
    selected_parents: @import("selected_run_owner.zig").Index = undefined,
    drafts: []Draft,
    parts: std.ArrayList(Part) = .empty,
    bindings: std.ArrayList(Binding) = .empty,
    by_offset: std.AutoHashMapUnmanaged(Point, std.ArrayList(usize)) = .empty,
    targets: std.AutoHashMapUnmanaged(usize, std.ArrayList(usize)) = .empty,
    owner_issues: std.AutoHashMapUnmanaged(usize, Issue) = .empty,
    owned_targets: std.AutoHashMapUnmanaged(usize, std.ArrayList(usize)) = .empty,
    by_owner: std.AutoHashMapUnmanaged(usize, ?usize) = .empty,
    control_kinds: std.AutoHashMapUnmanaged(usize, @FieldType(Segment, "kind")) = .empty,
    first_anchor: std.AutoHashMapUnmanaged(usize, usize) = .empty,
    note_prefix: std.AutoHashMapUnmanaged(usize, void) = .empty,
    field_nodes: std.AutoHashMapUnmanaged(usize, void) = .empty,
    owners_with_controls: std.AutoHashMapUnmanaged(usize, void) = .empty,
    counters: Counters = .{},
    fn init(a: std.mem.Allocator, tree: *const Tree, paragraphs: []const Paragraph, limits: Limits) !Builder {
        var self: Builder = .{ .a = a, .tree = tree, .paragraphs = paragraphs, .limits = limits, .owners = try a.alloc(?usize, tree.elements.len), .frames = try @import("xml_tree_selection.zig").build(a, tree, limits.branch_policy, limits.max_attribute_bytes), .drafts = try a.alloc(Draft, paragraphs.len) };
        for (self.drafts) |*draft| draft.* = .{};
        // One shared Native field parse; its linked source facts are indexed
        // before node classification, never queried again for every paragraph.
        var fields = try @import("field_markers.zig").inspectSection(a, tree, .{ .max_attribute_bytes = limits.max_attribute_bytes, .retain_raw_xml = false, .active_frames = self.frames });
        defer fields.deinit();
        self.counters.field_passes = 1;
        for (fields.markers) |marker| {
            if (marker.element_index < self.frames.len and self.frames[marker.element_index].active)
                try self.field_nodes.put(a, marker.element_index, {});
        }
        const ancestors = try @import("paragraph_site_owner.zig").indexAncestors(a, tree);
        // Parent indices precede children. Classify known controls and unknown
        // owners once before any fanout; partial rows must not expand controls.
        for (tree.elements, 0..) |element, at| {
            self.counters.nodes += 1;
            self.owners[at] = if (element.is(uri, "p")) at else ancestors[at];
        }
        self.selected_parents = try @import("selected_run_owner.zig").Index.build(a, tree, self.frames, self.owners, limits.max_nodes, limits.branch_policy.mode == .selected);
        self.counters.selected_parent_nodes = self.selected_parents.nodes;
        self.counters.selected_parent_rewrites = self.selected_parents.rewrites;
        for (tree.elements, 0..) |_, at| try self.classify(at);
        // Inspect direct paragraph CharData through the shared Native parser
        // once before target fanout. Do not use raw XML gaps: comments and
        // whitespace references are not visible unknown paragraph text.
        try tree.visitContent(a, .{ .context = &self, .on_content = Builder.paragraphContent });
        // The retained-note predicate may inspect a paragraph prefix. Invoke
        // it only for the first actual source anchor per owner, never for each
        // generated row/control fanout (nor for each prefix non-anchor).
        var first_anchors = self.first_anchor.iterator();
        while (first_anchors.next()) |entry| {
            if (@import("retained_note_number.zig").supported(tree, entry.value_ptr.*, entry.key_ptr.*, tree.source.len))
                try self.note_prefix.put(a, entry.value_ptr.*, {});
        }
        for (fields.markers) |marker| {
            if (marker.element_index >= self.frames.len or !self.frames[marker.element_index].active) continue;
            if (marker.link_issue != .none or marker.duplicate_begin_id or marker.matched_marker_index == null or marker.fieldid_mismatch or marker.non_lifo or (marker.begin != null and marker.begin.?.type_known != true)) {
                if (self.owners[marker.element_index]) |owner| try self.owner_issues.put(a, owner, .UnresolvedField);
            }
        }
        for (paragraphs, 0..) |*paragraph, row| {
            if (paragraph.template_element >= tree.elements.len or !tree.elements[paragraph.template_element].is(uri, "p")) return error.SourceBindingMismatch;
            const entry = try self.by_owner.getOrPut(a, paragraph.template_element);
            if (entry.found_existing) entry.value_ptr.* = null else entry.value_ptr.* = row;
            if (paragraph.joined()) |joined| {
                try joined.validate();
                for (joined.pieces) |piece| {
                    try self.addPart(row, piece.template_element, piece.first_site, piece.site_count, piece.output != .source_runs and piece.generated_id != null and piece.source_ordinal == null, piece.output != .inventory_only and !piece.template_only);
                    // source_runs retains source controls during serialization,
                    // but its text still comes from the same canonical Sites
                    // (column_boundary_extension_prefix.appendSource). Never
                    // reread lexical XML as another current text owner.
                }
            } else {
                if (paragraph.synthesized_run_character_id != null) try @import("runless_paragraph_current.zig").validateReadSource(tree, paragraph);
                try self.addPart(row, paragraph.template_element, 0, paragraph.sites.items.len, paragraph.generated_id != null and paragraph.source_ordinal == null, true);
            }
        }
        for (self.parts.items, 0..) |part, at| {
            if (!part.emit or self.drafts[part.row].issue != null or paragraphs[part.row].protected_positions != null) continue;
            const target = try self.targets.getOrPut(a, part.owner);
            if (!target.found_existing) target.value_ptr.* = .empty;
            try target.value_ptr.append(a, at);
        }
        for (paragraphs, 0..) |*paragraph, row| {
            if (self.drafts[row].issue != null) continue;
            if (paragraph.protected_positions) |items| for (items, 0..) |item, index| {
                if (index != 0 and item.unit <= items[index - 1].unit) return error.SourceBindingMismatch;
                if (item.element_index >= self.owners.len) return error.SourceBindingMismatch;
                const owner = self.owners[item.element_index] orelse return error.SourceBindingMismatch;
                const part = self.drafts[row].owners.get(owner) orelse return error.SourceBindingMismatch;
                const at = part orelse {
                    self.drafts[row].issue = .InconsistentControlOwner;
                    continue;
                };
                const slot = try self.owned_targets.getOrPut(a, item.element_index);
                if (!slot.found_existing) slot.value_ptr.* = .empty;
                try slot.value_ptr.append(a, at);
            };
        }
        return self;
    }
    fn addPart(self: *Builder, row: usize, owner: usize, first: usize, count: usize, generated: bool, emit: bool) !void {
        if (owner >= self.tree.elements.len or !self.tree.elements[owner].is(uri, "p")) return error.SourceBindingMismatch;
        const sites = &self.paragraphs[row].sites;
        if (first > sites.items.len or count > sites.items.len - first) return error.SourceBindingMismatch;
        if (self.parts.items.len >= self.limits.max_parts) return error.LimitExceeded;
        const at = self.parts.items.len;
        try self.parts.append(self.a, .{ .row = row, .owner = owner, .generated = generated, .first_text = self.tree.source.len, .emit = emit });
        try self.drafts[row].parts.append(self.a, at);
        if (emit) {
            const native_owner = try self.drafts[row].owners.getOrPut(self.a, owner);
            if (native_owner.found_existing) {
                native_owner.value_ptr.* = null;
                if (self.owners_with_controls.contains(owner)) self.drafts[row].issue = .InconsistentControlOwner;
            } else native_owner.value_ptr.* = at;
            if (self.owner_issues.get(owner)) |issue| self.drafts[row].issue = issue;
        }
        for (first..first + count) |site_index| {
            self.counters.sites += 1;
            try sites.validateTextOwnership(site_index);
            const site = sites.items[site_index];
            if (site.element_index >= self.tree.elements.len or site.start > self.tree.source.len or site.end > self.tree.source.len or site.end < site.start) return error.SourceBindingMismatch;
            const actual = self.owners[site.element_index];
            if (actual != owner) return error.SourceBindingMismatch;
            if (!site.anchor_boundary) self.parts.items[at].first_text = @min(self.parts.items[at].first_text, site.start);
            if (!emit) {
                if (site.text.len != 0) return error.SourceBindingMismatch;
                continue;
            }
            if (self.bindings.items.len >= self.limits.max_bindings) return error.LimitExceeded;
            const binding = self.bindings.items.len;
            try self.bindings.append(self.a, .{ .part = at, .site = site_index, .node = site.element_index });
            const content_end: ?usize = if (!site.empty_element and !site.missing_text and !site.anchor_boundary and site.start != site.end) site.end else null;
            const slot = try self.by_offset.getOrPut(self.a, .{ .offset = site.start, .node = site.element_index, .content_end = content_end });
            if (!slot.found_existing) slot.value_ptr.* = .empty;
            try slot.value_ptr.append(self.a, binding);
        }
    }
    fn emitPoint(self: *Builder, offset: usize, node: usize, content_end: ?usize) !void {
        self.counters.point_lookups += 1;
        const matches = self.by_offset.fetchRemove(.{ .offset = offset, .node = node, .content_end = content_end }) orelse return;
        for (matches.value.items) |at| {
            self.counters.binding_scans += 1;
            const binding = &self.bindings.items[at];
            if (binding.seen) return error.SourceBindingMismatch;
            const part = &self.parts.items[binding.part];
            if (self.drafts[part.row].issue == null)
                try part.tokens.append(self.a, .{ .text = binding.site });
            binding.seen = true;
            self.counters.bindings += 1;
        }
    }
    fn emitAt(self: *Builder, offset: usize, node: usize) !void {
        try self.emitPoint(offset, node, null);
        if (self.tree.elements[node].parent) |parent| try self.emitPoint(offset, parent, null);
    }
    fn rememberControl(self: *Builder, node: usize, kind: @FieldType(Segment, "kind")) !void {
        try self.control_kinds.put(self.a, node, kind);
        if (self.owners[node]) |owner| {
            try self.owners_with_controls.put(self.a, owner, {});
            if (kind == .anchor) {
                const first = try self.first_anchor.getOrPut(self.a, owner);
                if (!first.found_existing) first.value_ptr.* = node;
            }
        }
    }
    fn emitControl(self: *Builder, node: usize, kind: @FieldType(Segment, "kind")) !void {
        const owner = self.owners[node] orelse return error.SourceBindingMismatch;
        if (self.owned_targets.get(node)) |targets| for (targets.items) |at| {
            if (self.counters.control_routes >= self.limits.max_control_routes) return error.LimitExceeded;
            self.counters.control_routes += 1;
            try self.parts.items[at].tokens.append(self.a, .{ .control = .{ .kind = kind, .index = node, .source_start = self.tree.elements[node].start_tag.start } });
        };
        const target = self.targets.get(owner) orelse return;
        for (target.items) |at| {
            if (self.counters.control_routes >= self.limits.max_control_routes) return error.LimitExceeded;
            self.counters.control_routes += 1;
            const part = &self.parts.items[at];
            if (!part.emit or self.paragraphs[part.row].protected_positions != null) continue;
            if (kind == .anchor and part.generated and self.note_prefix.contains(node) and self.tree.elements[node].end <= part.first_text) continue;
            try part.tokens.append(self.a, .{ .control = .{ .kind = kind, .index = node, .source_start = self.tree.elements[node].start_tag.start } });
        }
    }
    fn classify(self: *Builder, node: usize) !void {
        if (!self.frames[node].active) return;
        const element = self.tree.elements[node];
        const physical_parent = element.parent orelse return;
        if (self.selected_parents.invalid_owners[node]) |invalid| {
            try self.owner_issues.put(self.a, invalid, .UnknownControl);
            return;
        }
        if (self.selected_parents.wrapper_runs[node] != null) return;
        const parent = self.selected_parents.parents[node] orelse return;
        const logical_read = parent != physical_parent;
        const owner = self.owners[node] orelse return;
        if (self.tree.elements[parent].is(uri, "p") and !element.is(uri, "run") and !element.is(uri, "linesegarray")) {
            try self.owner_issues.put(self.a, parent, .UnknownControl);
            return;
        }
        if (element.is(uri, "run") and element.parent == owner and !@import("element_whitespace_gaps.zig").empty(self.tree, node))
            try self.owner_issues.put(self.a, owner, .UnknownControl);
        if (self.tree.elements[parent].is(uri, "run") and self.tree.elements[parent].parent == owner) {
            const anchor = if (logical_read) @import("run_anchor.zig").knownReadChildKind(self.tree, node) else @import("run_anchor.zig").kind(self.tree, node);
            if (anchor != null) return self.rememberControl(node, .anchor);
            const metadata = if (logical_read) @import("retained_run_metadata.zig").readRunChildSupported(self.tree, node) else @import("retained_run_metadata.zig").runChildSupported(self.tree, node);
            const bookmark = if (logical_read) @import("retained_bookmark.zig").settingSupported(self.tree, node) else @import("retained_bookmark.zig").directSupported(self.tree, node);
            if (element.is(uri, "t") or metadata or bookmark) return;
            if (element.is(uri, "ctrl")) {
                var child = element.first_child;
                var known = child != null;
                while (child) |at| : (child = self.tree.elements[at].next_sibling) known = known and self.field_nodes.contains(at);
                if (known) return;
            }
            try self.owner_issues.put(self.a, owner, .UnknownControl);
        } else if (self.tree.elements[parent].is(uri, "t")) {
            if (@import("retained_inline_unit.zig").kind(self.tree, node)) |kind| {
                return self.rememberControl(node, switch (kind) {
                    .tab => .tab,
                    .nb_space => .nb_space,
                    .fw_space => .fw_space,
                    .line_break => .line_break,
                    .hypen => .hypen,
                });
            }
            if (!@import("retained_markpen_marker.zig").supported(self.tree, node) and !@import("title_mark_axis.zig").retained(self.tree, node)) try self.owner_issues.put(self.a, owner, .UnknownControl);
        }
    }
    fn paragraphContent(raw: *anyopaque, value: Tree.ContentEvent) anyerror!void {
        const self: *Builder = @ptrCast(@alignCast(raw));
        self.counters.paragraph_content_events += 1;
        const parent = value.parent_index;
        if (!self.frames[parent].active) return;
        const reject_owner = if (self.tree.elements[parent].is(uri, "p")) parent else wrapper: {
            const run = self.selected_parents.wrapper_runs[parent] orelse return;
            break :wrapper self.owners[run] orelse return error.SourceBindingMismatch;
        };
        const bytes = try value.value.toUtf8(self.a, self.limits.max_bytes);
        defer self.a.free(bytes);
        for (bytes) |byte| if (!std.ascii.isWhitespace(byte)) {
            try self.owner_issues.put(self.a, reject_owner, .UnknownControl);
            break;
        };
    }
    fn event(raw: *anyopaque, value: Tree.OrderedEvent) anyerror!void {
        const self: *Builder = @ptrCast(@alignCast(raw));
        self.counters.events += 1;
        switch (value) {
            .start_element, .empty_element => |node| {
                const element = self.tree.elements[node];
                try self.emitAt(element.start_tag.start, node);
                if (self.control_kinds.get(node)) |kind| try self.emitControl(node, kind);
                try self.emitAt(element.start_tag.end, node);
            },
            .end_element => |node| if (self.tree.elements[node].end_tag) |tag| {
                try self.emitAt(tag.start, node);
                try self.emitAt(tag.end, node);
            },
            .content => |content| {
                if (!self.frames[content.parent_index].active) return;
                const span = try @import("xml_content_source_span.zig").read(self.tree, content.value);
                try self.emitPoint(span.start, content.parent_index, span.end);
            },
        }
    }
    fn finish(self: *Builder) ![]Row {
        for (self.bindings.items) |binding| if (!binding.seen) {
            self.drafts[self.parts.items[binding.part].row].issue = .MissingCurrentSite;
        };
        const rows = try self.a.alloc(Row, self.paragraphs.len);
        var bytes: usize = 0;
        var total_units: usize = 0;
        for (self.paragraphs, self.drafts, rows, 0..) |*paragraph, *draft, *row, index| {
            self.counters.rows += 1;
            var plain: std.ArrayList(u8) = .empty;
            for (paragraph.sites.items) |site| {
                if (site.text.len > self.limits.max_bytes -| bytes -| plain.items.len) return error.LimitExceeded;
                try plain.appendSlice(self.a, site.text);
            }
            var out: Output = .{ .a = self.a, .builder = self, .paragraph = paragraph, .row_index = index, .max_bytes = self.limits.max_bytes -| bytes -| plain.items.len, .max_units = self.limits.max_units -| total_units };
            for (draft.parts.items) |at| {
                const part = &self.parts.items[at];
                if (!part.emit or draft.issue != null) continue;
                for (part.tokens.items) |token| switch (token) {
                    .text => |site| try out.literal(site),
                    .control => |segment| try out.control(segment.index, segment.kind),
                };
            }
            if (paragraph.protected_positions) |items| {
                if (out.owned_at != items.len) draft.issue = .InconsistentControlOwner;
            }
            if (out.issue) |issue| draft.issue = issue;
            const full = draft.issue == null;
            const visible = if (full) try out.text.toOwnedSlice(self.a) else null;
            const literal = try plain.toOwnedSlice(self.a);
            bytes = std.math.add(usize, bytes, literal.len) catch return error.LimitExceeded;
            if (visible) |text| bytes = std.math.add(usize, bytes, text.len) catch return error.LimitExceeded;
            if (bytes > self.limits.max_bytes) return error.LimitExceeded;
            total_units = std.math.add(usize, total_units, out.unit) catch return error.LimitExceeded;
            if (total_units > self.limits.max_units) return error.LimitExceeded;
            row.* = .{ .currentIndex = index, .sourceNode = paragraph.template_element, .plain = literal, .text = visible, .units = out.unit, .controls = if (full) try out.controls.toOwnedSlice(self.a) else &.{}, .segments = if (full) try out.segments.toOwnedSlice(self.a) else &.{}, .coverage = if (full) .complete else .partial, .issue = draft.issue };
        }
        return rows;
    }
};
const Output = struct {
    a: std.mem.Allocator,
    builder: *Builder,
    paragraph: *const Paragraph,
    max_bytes: usize,
    max_units: usize,
    row_index: usize,
    text: std.ArrayList(u8) = .empty,
    controls: std.ArrayList(Control) = .empty,
    segments: std.ArrayList(Segment) = .empty,
    seen: std.AutoHashMapUnmanaged(usize, void) = .empty,
    unit: u32 = 0,
    owned_at: usize = 0,
    issue: ?Issue = null,
    fn append(self: *Output, value: []const u8, units: u32) !void {
        if (value.len > self.max_bytes -| self.text.items.len or units > self.max_units -| self.unit) return error.LimitExceeded;
        try self.text.appendSlice(self.a, value);
        self.unit = std.math.add(u32, self.unit, units) catch return error.LimitExceeded;
    }
    fn control(self: *Output, node: usize, kind: @FieldType(Segment, "kind")) !void {
        if (self.paragraph.protected_positions) |items| {
            if (self.owned_at >= items.len) {
                self.issue = .InconsistentControlOwner;
                return;
            }
            const item = items[self.owned_at];
            if (item.element_index != node or item.unit != self.unit or (item.kind == .anchor) != (kind == .anchor)) {
                self.issue = .InconsistentControlOwner;
                return;
            }
            self.owned_at += 1;
        }
        if ((try self.seen.getOrPut(self.a, node)).found_existing) {
            self.issue = .InconsistentControlOwner;
            return;
        }
        const start = self.unit;
        try self.append(spelling.segmentText(&self.paragraph.sites, .{ .kind = kind, .index = node, .source_start = 0 }), 1);
        try self.controls.append(self.a, .{ .kind = kind, .node = node, .startUnit = start, .endUnit = self.unit });
        try self.segments.append(self.a, .{ .kind = kind, .index = node, .source_start = self.builder.tree.elements[node].start_tag.start, .start_unit = start, .end_unit = self.unit });
        self.builder.counters.controls += 1;
    }
    fn literal(self: *Output, index: usize) !void {
        const site = self.paragraph.sites.items[index];
        const units = try @import("text_site_edit.zig").utf16Length(site.text);
        const start = self.unit;
        try self.append(site.text, std.math.cast(u32, units) orelse return error.LimitExceeded);
        try self.segments.append(self.a, .{ .kind = .text, .index = index, .source_start = site.start, .start_unit = start, .end_unit = self.unit });
    }
};
