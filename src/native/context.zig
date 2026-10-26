//! Instance service shared by future WASM/provider wrappers and native C ABI.
//! No parser, writer or history implementation lives here. Caller serializes access.
const std = @import("std");
const h5 = @import("../hwp5/edit/style_preservation.zig");
const hx = @import("../hwpx/editor_session.zig");
const H5History = @import("../hwp5/edit/editor_history.zig").History;
const history_policy = @import("../model/history_policy.zig");
const HistoryStats = @import("../model/history_stats.zig").Stats;
const HxHistory = @import("../hwpx/editor_history.zig").History;

pub const limit = 64 * 1024 * 1024;
pub const Token = extern struct { slot: u32 = 0, generation: u32 = 0 };
pub const Format = enum(u32) { hwp5 = 1, hwpx = 2 };
pub const Buffer = extern struct {
    token: Token = .{},
    owner: Token = .{},
    length: usize = 0,
    revision: u32 = 0,
    encoding: u32 = 0, // 0 binary, 1 UTF-8, 2 UTF-16LE (HWP5 original tokens)
    layout_requires_reflow: u32 = 0, // 0 no, 1 yes, 2 not reported by this backend
};
pub const State = extern struct { revision: u32, epoch: u32, history_revision: u32, undo_count: u32, redo_count: u32 };
const Document = union(Format) {
    hwp5: struct { session: *h5.Session, history: H5History },
    hwpx: struct { session: hx.Session, history: HxHistory },
};
pub const Context = struct {
    allocator: std.mem.Allocator,
    document: Document,
    revision: u32 = 0,
    epoch: u32 = 1,
    last_error: []const u8 = "",

    fn create(a: std.mem.Allocator, format: Format, input: []const u8, options: history_policy.Options) !*Context {
        _ = try history_policy.resolve(options);
        const self = try a.create(Context);
        errdefer a.destroy(self);
        self.* = .{ .allocator = a, .document = undefined };
        switch (format) {
            .hwp5 => {
                const session = try h5.Session.open(a, input);
                errdefer session.close();
                self.document = .{ .hwp5 = .{ .session = session, .history = try H5History.initV2(a, session, options) } };
            },
            .hwpx => {
                const session = try hx.open(a, input, .{});
                // V2 owner는 최종 Context 안의 고정 주소에 결합합니다.
                self.document = .{ .hwpx = .{ .session = session, .history = undefined } };
                const d = &self.document.hwpx;
                errdefer d.session.deinit();
                d.history = try HxHistory.initV2(&d.session, options);
            },
        }
        return self;
    }
    fn destroy(self: *Context) void {
        switch (self.document) {
            .hwp5 => |*d| {
                d.history.deinit();
                d.session.close();
            },
            .hwpx => |*d| {
                d.history.deinit();
                d.session.deinit();
            },
        }
        self.allocator.destroy(self);
    }
    pub fn state(self: *const Context) State {
        return switch (self.document) {
            inline else => |d| .{ .revision = self.revision, .epoch = self.epoch, .history_revision = d.history.revision(), .undo_count = @intCast(d.history.stats().undoCount), .redo_count = @intCast(d.history.stats().redoCount) },
        };
    }
    pub fn configureHistory(self: *Context, expected: u32, options: history_policy.Options) !void {
        try self.fence(expected);
        // 이미 편집한 이력을 초기화해 버리지 않습니다.
        if (self.revision != 0) return error.HistoryAlreadyActive;
        _ = try history_policy.resolve(options);
        switch (self.document) {
            .hwp5 => |*d| {
                const next = try H5History.initV2(self.allocator, d.session, options);
                d.history.deinit();
                d.history = next;
            },
            .hwpx => |*d| {
                const next = try HxHistory.initV2(&d.session, options);
                d.history.deinit();
                d.history = next;
            },
        }
    }
    pub fn historyStats(self: *const Context) HistoryStats {
        return switch (self.document) {
            inline else => |d| d.history.stats(),
        };
    }
    fn fence(self: *Context, expected: u32) !void {
        if (self.revision != expected) return error.StaleRevision;
        if (self.historyStats().poisoned) return error.HistoryMutationUncertain;
        if (self.revision == std.math.maxInt(u32) or self.epoch == std.math.maxInt(u32)) return error.LimitExceeded;
    }
    pub fn splice(self: *Context, expected: u32, section: u32, paragraph: u32, start: u32, deleted: u32, inserted: []const u8) !bool {
        try self.fence(expected);
        if (inserted.len > 4 * 1024 * 1024) return error.LimitExceeded;
        const end = std.math.add(u32, start, deleted) catch return error.InvalidTextPosition;
        // The low-level coordinate is intentionally format-native: HWPX is 1-based.
        // Public display-coordinate conversion remains the existing JS facade's job.
        const changed = (switch (self.document) {
            .hwp5 => |*d| d.history.apply(d.session, .{ .splice_text = .{ .section = section, .paragraph = paragraph, .start_unit = start, .end_unit = end, .utf8 = inserted } }),
            .hwpx => |*d| d.history.apply(&d.session, .{ .section = section, .paragraph = paragraph, .start = start, .deleted = deleted, .inserted = inserted }),
        }) catch |err| {
            // History normally rolls back failures, but its rollback may itself fail.
            // Fence conservatively; this does NOT claim changed=true or commit.
            if (err != error.MutationUncertain and err != error.HistoryMutationUncertain) return err;
            self.last_error = @errorName(err);
            self.revision += 1;
            self.epoch += 1;
            return error.MutationUncertain;
        };
        if (changed) {
            self.revision += 1;
            self.epoch += 1;
        }
        return changed;
    }
    pub fn moveHistory(self: *Context, expected: u32, redo: bool) !bool {
        try self.fence(expected);
        const changed = (switch (self.document) {
            .hwp5 => |*d| if (redo) d.history.redo(d.session) else d.history.undo(d.session),
            .hwpx => |*d| if (redo) d.history.redo(&d.session) else d.history.undo(&d.session),
        }) catch |err| {
            // History normally rolls back failures, but its rollback may itself fail.
            // Fence conservatively; this does NOT claim changed=true or commit.
            if (err != error.MutationUncertain and err != error.HistoryMutationUncertain) return err;
            self.last_error = @errorName(err);
            self.revision += 1;
            self.epoch += 1;
            return error.MutationUncertain;
        };
        if (changed) {
            self.revision += 1;
            self.epoch += 1;
        }
        return changed;
    }
};
const ContextSlot = struct { generation: u32 = 1, value: ?*Context = null };
const BufferSlot = struct { generation: u32 = 1, owner: Token = .{}, value: ?[]u8 = null };

pub const Bridge = struct {
    allocator: std.mem.Allocator,
    contexts: std.ArrayList(ContextSlot) = .empty,
    buffers: std.ArrayList(BufferSlot) = .empty,
    output_bytes: usize = 0,
    /// C ABI rejects concurrent operations. This is a guard, not a second scheduler.
    busy: std.atomic.Value(bool) = .init(false),

    pub fn init(a: std.mem.Allocator) Bridge {
        return .{ .allocator = a };
    }
    pub fn deinit(self: *Bridge) void {
        for (self.contexts.items) |slot| if (slot.value) |ctx| ctx.destroy();
        for (self.buffers.items) |slot| if (slot.value) |bytes| self.allocator.free(bytes);
        self.contexts.deinit(self.allocator);
        self.buffers.deinit(self.allocator);
        self.* = undefined;
    }
    pub fn get(self: *Bridge, token: Token) !*Context {
        if (token.slot == 0 or token.slot > self.contexts.items.len) return error.StaleHandle;
        const slot = &self.contexts.items[token.slot - 1];
        if (slot.generation != token.generation) return error.StaleHandle;
        return slot.value orelse error.StaleHandle;
    }
    pub fn open(self: *Bridge, format: Format, input: []const u8) !Token {
        return self.openWithHistory(format, input, .{});
    }
    pub fn openWithHistory(self: *Bridge, format: Format, input: []const u8, options: history_policy.Options) !Token {
        _ = try history_policy.resolve(options);
        if (input.len == 0 or input.len > limit) return error.LimitExceeded;
        // Own before parsing, even if a caller supplies a mutable native input buffer.
        const copy = try self.allocator.dupe(u8, input);
        defer self.allocator.free(copy);
        const ctx = try Context.create(self.allocator, format, copy, options);
        errdefer ctx.destroy();
        for (self.contexts.items, 0..) |*slot, i| {
            if (slot.value == null and slot.generation != std.math.maxInt(u32)) {
                slot.value = ctx;
                return .{ .slot = @intCast(i + 1), .generation = slot.generation };
            }
        }
        if (self.contexts.items.len >= 1024) return error.LimitExceeded;
        try self.contexts.append(self.allocator, .{ .value = ctx });
        return .{ .slot = @intCast(self.contexts.items.len), .generation = 1 };
    }
    pub fn close(self: *Bridge, token: Token) !void {
        const ctx = try self.get(token);
        ctx.destroy();
        const slot = &self.contexts.items[token.slot - 1];
        slot.value = null;
        slot.generation += 1; // Max generation is retired, never wrapped/reused.
    }
    fn retain(self: *Bridge, owner: Token, bytes: []u8, revision: u32, encoding: u32, reflow: u32) !Buffer {
        errdefer self.allocator.free(bytes);
        if (bytes.len > limit - self.output_bytes) return error.LimitExceeded;
        for (self.buffers.items, 0..) |*slot, i| {
            if (slot.value == null and slot.generation != std.math.maxInt(u32)) {
                slot.value = bytes;
                slot.owner = owner;
                self.output_bytes += bytes.len;
                return .{ .token = .{ .slot = @intCast(i + 1), .generation = slot.generation }, .owner = owner, .length = bytes.len, .revision = revision, .encoding = encoding, .layout_requires_reflow = reflow };
            }
        }
        if (self.buffers.items.len >= 4096) return error.LimitExceeded;
        try self.buffers.append(self.allocator, .{ .owner = owner, .value = bytes });
        self.output_bytes += bytes.len;
        return .{ .token = .{ .slot = @intCast(self.buffers.items.len), .generation = 1 }, .owner = owner, .length = bytes.len, .revision = revision, .encoding = encoding, .layout_requires_reflow = reflow };
    }
    pub fn output(self: *Bridge, token: Token) ![]const u8 {
        if (token.slot == 0 or token.slot > self.buffers.items.len) return error.StaleBuffer;
        const slot = &self.buffers.items[token.slot - 1];
        if (slot.generation != token.generation) return error.StaleBuffer;
        return slot.value orelse error.StaleBuffer;
    }
    pub fn release(self: *Bridge, token: Token) !void {
        const bytes = try self.output(token);
        self.output_bytes -= bytes.len;
        self.allocator.free(bytes);
        const slot = &self.buffers.items[token.slot - 1];
        slot.value = null;
        slot.generation += 1;
    }
    pub fn read(self: *Bridge, token: Token, section: u32, paragraph: u32) !Buffer {
        const ctx = try self.get(token);
        const bytes = switch (ctx.document) {
            .hwp5 => |d| try d.session.copyText(self.allocator, section, paragraph),
            .hwpx => |*d| try d.session.anchorText(section, paragraph),
        };
        return self.retain(token, bytes, ctx.revision, if (ctx.document == .hwp5) 2 else 1, 0);
    }
    pub fn save(self: *Bridge, token: Token, expected: u32, allow_stale_layout: bool) !Buffer {
        const ctx = try self.get(token);
        if (ctx.revision != expected) return error.StaleRevision;
        if (ctx.historyStats().poisoned) return error.HistoryMutationUncertain;
        return switch (ctx.document) {
            .hwp5 => |d| block: {
                const saved = try d.session.save(self.allocator, .{ .allow_stale_layout = allow_stale_layout, .max_output_bytes = limit });
                break :block self.retain(token, saved.bytes, ctx.revision, 0, @intFromBool(saved.layout_requires_reflow));
            },
            .hwpx => |*d| self.retain(token, try d.session.save(), ctx.revision, 0, 2),
        };
    }

    /// Owned observation only; no second document model or saved-byte parsing.
    pub fn snapshot(self: *Bridge, token: Token) !Buffer {
        const ctx = try self.get(token);
        var arena = std.heap.ArenaAllocator.init(self.allocator);
        defer arena.deinit();
        const a = arena.allocator();
        const Row = struct { section: usize, paragraph: usize, text: []const u8, selectionOwner: ?[]const u8, editable: bool, projectionUnavailable: bool };
        var rows: std.ArrayList(Row) = .empty;
        var revisions: std.ArrayList(u32) = .empty;
        var used: usize = 0;
        switch (ctx.document) {
            .hwp5 => |d| {
                for (0..d.session.sectionCount()) |s| {
                    const protection = d.session.textSourceProtection(a, s) catch null;
                    for (0..try d.session.paragraphCount(s)) |p| {
                        if (rows.items.len >= 4096) return error.LimitExceeded;
                        const info = try d.session.paragraph(s, p);
                        const raw = try d.session.copyText(a, s, p);
                        var plain = true;
                        @import("../hwp5/edit/plain_text_content.zig").validatePlain(raw) catch {
                            plain = false;
                        };
                        var text: []const u8 = "";
                        if (plain) {
                            const units = try a.alloc(u16, raw.len / 2 - 1);
                            for (units, 0..) |*unit, i| unit.* = std.mem.readInt(u16, raw[i * 2 ..][0..2], .little);
                            text = try std.unicode.utf16LeToUtf8Alloc(a, units);
                        }
                        const owner: ?[]const u8 = if (info.parent_node == null) try std.fmt.allocPrint(a, "section:{d}:body", .{s}) else null;
                        const allowed = if (protection) |pr| p < pr.protected_paragraphs.len and !pr.protected_paragraphs[p] else false;
                        used += text.len;
                        if (used > 4 * 1024 * 1024) return error.LimitExceeded;
                        try rows.append(a, .{ .section = s, .paragraph = p, .text = text, .selectionOwner = owner, .editable = plain and allowed and owner != null, .projectionUnavailable = !plain });
                    }
                }
                for (0..d.history.revisionCount()) |i| try revisions.append(a, d.history.revisionAt(i).?);
            },
            .hwpx => |*d| {
                for (d.session.sections, 0..) |*section, s| {
                    var view = try @import("../hwpx/display_current_paragraphs.zig").read(a, section, d.session.options);
                    defer view.deinit(a);
                    for (view.paragraphs, 0..) |p, i| {
                        if (rows.items.len >= 4096) return error.LimitExceeded;
                        const tree = &section.tree;
                        const root = tree.elements[p.template_element];
                        const body = if (root.parent) |parent| tree.elements[parent].is(@import("../hwpx/document_xml.zig").section_uri, "sec") else false;
                        var plain = body;
                        const uri = @import("../hwpx/document_xml.zig").paragraph_uri;
                        for (tree.elements[p.template_element + 1 ..]) |node| {
                            if (node.start_tag.start >= root.end) break;
                            if (!(node.is(uri, "run") or node.is(uri, "t") or node.is(uri, "linesegarray") or node.is(uri, "lineseg"))) {
                                plain = false;
                                break;
                            }
                        }
                        if (p.protected_positions) |items| {
                            if (items.len != 0) plain = false;
                        }
                        if (p.field_positions) |items| {
                            if (items.len != 0) plain = false;
                        }
                        if (p.title_positions) |items| {
                            if (items.len != 0) plain = false;
                        }
                        if (p.column_boundaries) |items| {
                            if (items.len != 0) plain = false;
                        }
                        if (p.page_area_positions) |items| {
                            if (items.len != 0) plain = false;
                        }
                        const ordinal = section.first_paragraph + i;
                        var available = true;
                        const text = d.session.anchorText(s, ordinal) catch block: {
                            available = false;
                            break :block try self.allocator.dupe(u8, "");
                        };
                        defer self.allocator.free(text);
                        used += text.len;
                        if (used > 4 * 1024 * 1024) return error.LimitExceeded;
                        try rows.append(a, .{ .section = s, .paragraph = ordinal, .text = try a.dupe(u8, text), .selectionOwner = if (body) try std.fmt.allocPrint(a, "section:{d}:body", .{s}) else null, .editable = plain and available, .projectionUnavailable = !available });
                    }
                }
                for (0..d.history.revisionCount()) |i| try revisions.append(a, d.history.revisionAt(i).?);
            },
        }
        const state = ctx.state();
        const json = try std.json.Stringify.valueAlloc(self.allocator, .{ .protocol = "hwpjs.native-snapshot/1", .format = if (ctx.document == .hwp5) "hwp5" else "hwpx", .projection = "plain-body-v1", .paragraphs = rows.items, .nativeRevision = state.revision, .historyRevision = state.history_revision, .historyRevisions = revisions.items, .historyStats = ctx.historyStats() }, .{});
        return self.retain(token, json, ctx.revision, 1, 0);
    }

    pub const Window = struct { section: u32, start: u32, count: u32, expected: u32 };
    pub fn snapshotV2(self: *Bridge, token: Token, query: ?Window) !Buffer {
        const ctx = try self.get(token);
        if (query) |q| if (q.expected != ctx.revision) return error.StaleRevision;
        var arena = std.heap.ArenaAllocator.init(self.allocator);
        defer arena.deinit();
        const a = arena.allocator();
        const Raw = struct { length: usize };
        const TokenView = struct { type: []const u8, startUnit: usize, text: []const u8 = "", code: ?u16 = null, raw: Raw };
        const Cell = struct { tableNode: usize, listNode: usize };
        const Row = struct { section: usize, paragraph: usize, text: []const u8, ownerKind: []const u8, sourceNode: ?usize, listNode: ?usize, selectionOwner: ?[]const u8, tableCell: ?Cell = null, editable: bool, rawPlain: bool, projectionUnavailable: bool = false, declaredUnits: usize = 0, tokens: ?[]const TokenView = null };
        var rows: std.ArrayList(Row) = .empty;
        var revisions: std.ArrayList(u32) = .empty;
        var used: usize = 0;
        switch (ctx.document) {
            .hwp5 => |d| {
                for (0..d.session.sectionCount()) |si| {
                    const flows = try d.session.paragraphFlow(a, si);
                    const bindings = try d.session.tableBindings(a, si);
                    const protection = d.session.textSourceProtection(a, si) catch null;
                    for (0..try d.session.paragraphCount(si)) |pi| {
                        if (rows.items.len >= 4096) return error.LimitExceeded;
                        if (pi >= flows.len) return error.SourceBindingMismatch;
                        const flow = flows[pi];
                        const raw = try d.session.copyText(a, si, pi);
                        var plain = true;
                        @import("../hwp5/edit/plain_text_content.zig").validatePlain(raw) catch {
                            plain = false;
                        };
                        var token_views: std.ArrayList(TokenView) = .empty;
                        var text: std.ArrayList(u8) = .empty;
                        var iter = try @import("../hwp5/body/text.zig").Iterator.init(raw);
                        while (try iter.next()) |t| {
                            var v: TokenView = .{ .type = "control", .startUnit = t.start_unit, .raw = .{ .length = t.raw.len } };
                            switch (t.value) {
                                .control => |c| v.code = c.code,
                                .text => |b| {
                                    const units = try a.alloc(u16, b.len / 2);
                                    for (units, 0..) |*u, i| u.* = std.mem.readInt(u16, b[i * 2 ..][0..2], .little);
                                    v.type = "text";
                                    v.text = try std.unicode.utf16LeToUtf8Alloc(a, units);
                                    try text.appendSlice(a, v.text);
                                },
                            }
                            try token_views.append(a, v);
                        }
                        const owner_kind = @tagName(flow.host);
                        var owner: ?[]const u8 = null;
                        var cell: ?Cell = null;
                        if (flow.host == .body) owner = try std.fmt.allocPrint(a, "section:{d}:body", .{si}) else if (flow.list_node) |li| owner = try std.fmt.allocPrint(a, "section:{d}:{s}:{d}:list:{d}", .{ si, owner_kind, flow.parent_node orelse flow.template_node, li });
                        for (bindings) |binding| if (binding.paragraph == pi) {
                            cell = .{ .tableNode = binding.table_node, .listNode = binding.list_node };
                            owner = try std.fmt.allocPrint(a, "section:{d}:table:{d}:list:{d}", .{ si, binding.table_node, binding.list_node });
                            break;
                        };
                        const allowed = if (protection) |pr| pi < pr.protected_paragraphs.len and !pr.protected_paragraphs[pi] else false;
                        used += text.items.len;
                        if (used > 4 * 1024 * 1024) return error.LimitExceeded;
                        try rows.append(a, .{ .section = si, .paragraph = pi, .text = text.items, .ownerKind = owner_kind, .sourceNode = if (flow.source_node) |n| @as(usize, n) else null, .listNode = flow.list_node, .selectionOwner = owner, .tableCell = cell, .editable = plain and allowed and flow.host == .body, .rawPlain = plain, .declaredUnits = raw.len / 2, .tokens = token_views.items });
                    }
                }
                for (0..d.history.revisionCount()) |i| try revisions.append(a, d.history.revisionAt(i).?);
            },
            .hwpx => |*d| {
                for (d.session.sections, 0..) |*section, si| {
                    var view = try @import("../hwpx/display_current_paragraphs.zig").read(a, section, d.session.options);
                    defer view.deinit(a);
                    const flows = try @import("../hwpx/paragraph_flow_snapshot.zig").read(a, &d.session, si);
                    const bindings = try @import("../hwpx/table_display_bindings.zig").fromParagraphs(a, section, view.paragraphs);
                    const texts = try @import("../hwpx/paragraph_text_snapshot.zig").read(a, &d.session, si);
                    if (flows.len != view.paragraphs.len or texts.len != view.paragraphs.len) return error.SourceBindingMismatch;
                    for (view.paragraphs, 0..) |p, i| {
                        if (rows.items.len >= 4096) return error.LimitExceeded;
                        const root = section.tree.elements[p.template_element];
                        const flow = flows[i];
                        var owner_kind: []const u8 = @tagName(flow.host);
                        var owner: ?[]const u8 = if (flow.host == .body) try std.fmt.allocPrint(a, "section:{d}:body", .{si}) else if (root.parent) |pa| try std.fmt.allocPrint(a, "section:{d}:{s}:list:{d}", .{ si, owner_kind, pa }) else null;
                        var cell: ?Cell = null;
                        for (bindings) |binding| if (binding.paragraph == section.first_paragraph + i) {
                            cell = .{ .tableNode = binding.owner.table_node, .listNode = binding.owner.list_node };
                            owner_kind = "table_cell";
                            owner = try std.fmt.allocPrint(a, "section:{d}:table:{d}:list:{d}", .{ si, binding.owner.table_node, binding.owner.list_node });
                            break;
                        };
                        var plain = true;
                        const uri = @import("../hwpx/document_xml.zig").paragraph_uri;
                        for (section.tree.elements[p.template_element + 1 ..]) |node| {
                            if (node.start_tag.start >= root.end) break;
                            if (!(node.is(uri, "run") or node.is(uri, "t") or node.is(uri, "linesegarray") or node.is(uri, "lineseg"))) {
                                plain = false;
                                break;
                            }
                        }
                        if (p.protected_positions) |items| {
                            if (items.len != 0) plain = false;
                        }
                        if (p.field_positions) |items| {
                            if (items.len != 0) plain = false;
                        }
                        if (p.title_positions) |items| {
                            if (items.len != 0) plain = false;
                        }
                        if (p.column_boundaries) |items| {
                            if (items.len != 0) plain = false;
                        }
                        if (p.page_area_positions) |items| {
                            if (items.len != 0) plain = false;
                        }
                        const text = texts[i].text;
                        used += text.len;
                        if (used > 4 * 1024 * 1024) return error.LimitExceeded;
                        try rows.append(a, .{ .section = si, .paragraph = section.first_paragraph + i, .text = text, .ownerKind = owner_kind, .sourceNode = p.template_element, .listNode = root.parent, .selectionOwner = owner, .tableCell = cell, .editable = plain and flow.host == .body, .rawPlain = plain });
                    }
                }
                for (0..d.history.revisionCount()) |i| try revisions.append(a, d.history.revisionAt(i).?);
            },
        }
        var selected: std.ArrayList(Row) = .empty;
        var scoped_total: usize = 0;
        var first: usize = 0;
        if (query) |q| {
            if (q.count == 0 or q.count > 4096) return error.InvalidWindowRange;
            for (rows.items) |row| if (row.section == q.section) {
                scoped_total += 1;
            };
            if (scoped_total == 0 or q.start > scoped_total or q.count > scoped_total - q.start) return error.InvalidWindowRange;
            var index: usize = 0;
            for (rows.items) |row| if (row.section == q.section) {
                if (index >= q.start and index < @as(usize, q.start) + q.count) try selected.append(a, row);
                index += 1;
            };
            first = q.start;
        } else {
            try selected.appendSlice(a, rows.items);
            scoped_total = rows.items.len;
        }
        const state = ctx.state();
        const json = try std.json.Stringify.valueAlloc(self.allocator, .{ .protocol = "hwpjs.native-snapshot/2", .format = if (ctx.document == .hwp5) "hwp5" else "hwpx", .projection = "native-owners-v2", .paragraphs = selected.items, .nativeRevision = state.revision, .historyRevision = state.history_revision, .historyRevisions = revisions.items, .historyStats = ctx.historyStats(), .window = .{ .section = if (query) |q| @as(?u32, q.section) else null, .startOrdinal = first, .returnedCount = selected.items.len, .scopeTotalRows = scoped_total, .documentTotalRows = rows.items.len, .enumerationComplete = query == null, .windowComplete = true, .hasMore = first + selected.items.len < scoped_total }, .capability = .{ .schema = "hwpjs.native-projection-capability/2", .ownerQueries = true, .sourceCoordinateSpace = "format-native-utf16", .displayCoordinateSpace = "display-utf16", .fullCanvas = false, .nestedOwnerWrites = false } }, .{});
        return self.retain(token, json, ctx.revision, 1, 0);
    }

    const RenderJson = struct {
        fn value(a: std.mem.Allocator, v: anytype) !std.json.Value {
            const bytes = try std.json.Stringify.valueAlloc(a, v, .{});
            const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .allocate = .alloc_always });
            return parsed.value;
        }
        fn sectionValue(a: std.mem.Allocator, v: anytype) !std.json.Value {
            const bytes = try std.json.Stringify.valueAlloc(a, v, .{ .emit_strings_as_arrays = true });
            const parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .allocate = .alloc_always });
            return parsed.value;
        }
        fn put(a: std.mem.Allocator, o: *std.json.ObjectMap, key: []const u8, result: anytype) !void {
            const v = result catch |err| {
                try o.put(a, key, try value(a, .{ .error_name = @errorName(err) }));
                return;
            };
            try o.put(a, key, try value(a, v));
        }
    };
    pub fn renderSnapshot(self: *Bridge, token: Token, expected: u32) !Buffer {
        const ctx = try self.get(token);
        if (ctx.revision != expected) return error.StaleRevision;
        if (ctx.document == .hwpx) return self.retain(token, try @import("render_hwpx_sources.zig").snapshot(self.allocator, &ctx.document.hwpx.session, ctx.revision), ctx.revision, 1, 0);
        if (ctx.document != .hwp5) return error.UnsupportedNativeRenderFormat;
        const session = ctx.document.hwp5.session;
        var arena = std.heap.ArenaAllocator.init(self.allocator);
        defer arena.deinit();
        const a = arena.allocator();
        var root = std.json.ObjectMap.empty;
        try root.put(a, "protocol", .{ .string = "hwpjs.native-render-sources/3" });
        try root.put(a, "format", .{ .string = "hwp5" });
        try root.put(a, "revision", try RenderJson.value(a, ctx.revision));
        try root.put(a, "fileVersion", try RenderJson.value(a, session.fileVersion()));
        try root.put(a, "sectionCount", try RenderJson.value(a, session.sectionCount()));
        try RenderJson.put(a, &root, "characterShapes", session.characterShapes(a));
        try RenderJson.put(a, &root, "paragraphShapes", session.paragraphShapes(a));
        try RenderJson.put(a, &root, "fontFaces", session.fontFaces(a));
        try RenderJson.put(a, &root, "borderFillSources", session.borderFillSources(a));
        try RenderJson.put(a, &root, "documentProperties", session.documentProperties(a));
        {
            const encoded = try @import("render_styles.zig").character_font_metrics(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterFontMetrics", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").character_text_colors(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterTextColors", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").character_shades(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterShades", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").character_effects(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterEffects", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").character_outlines(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterOutlines", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").character_font_references(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterFontReferences", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").font_face_metadata(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "fontFaceMetadata", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").character_strike_styles(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterStrikeStyles", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").character_strikes(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterStrikes", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").character_underlines(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterUnderlines", parsed.value);
        }
        {
            const encoded = try @import("render_styles.zig").character_underline_styles(a, session);
            const parsed = try std.json.parseFromSlice(std.json.Value, a, encoded, .{ .allocate = .alloc_always });
            try root.put(a, "characterUnderlineStyles", parsed.value);
        }
        var sections = std.json.Array.init(a);
        for (0..session.sectionCount()) |si| {
            var row = std.json.ObjectMap.empty;
            try RenderJson.put(a, &row, "pageSettings", session.pageSettings(a, si));
            try row.put(a, "sectionSettings", try RenderJson.sectionValue(a, try session.sectionSettings(a, si)));
            try RenderJson.put(a, &row, "tableBindings", session.tableBindings(a, si));
            try RenderJson.put(a, &row, "tablePlacements", session.tablePlacements(a, si));
            try RenderJson.put(a, &row, "tableLayoutSources", session.tableLayoutSources(a, si));
            try RenderJson.put(a, &row, "cellLayoutSources", session.cellLayoutSources(a, si));
            try RenderJson.put(a, &row, "tableAnchors", session.tableAnchors(a, si));
            try RenderJson.put(a, &row, "structuralAnchors", session.structuralAnchors(a, si));
            try RenderJson.put(a, &row, "paragraphFlow", session.paragraphFlow(a, si));
            try RenderJson.put(a, &row, "columnSources", session.columnSources(a, si));
            try RenderJson.put(a, &row, "pageAreaSources", session.pageAreaSources(a, si));
            try RenderJson.put(a, &row, "masterPageSources", session.masterPageSources(a, si));
            try RenderJson.put(a, &row, "noteSources", session.noteSources(a, si));
            try RenderJson.put(a, &row, "noteShapeSources", session.noteShapeSources(a, si));
            try RenderJson.put(a, &row, "automaticNumberSources", session.automaticNumberSources(a, si));
            try RenderJson.put(a, &row, "pageControlSources", session.pageControlSources(a, si));
            try RenderJson.put(a, &row, "captionSources", session.captionSources(a, si));
            try RenderJson.put(a, &row, "drawingSources", session.drawingSources(a, si));
            try RenderJson.put(a, &row, "drawingObjectExtras", session.drawingObjectExtras(a, si));
            try RenderJson.put(a, &row, "drawingComponentSources", session.drawingComponentSources(a, si));
            try RenderJson.put(a, &row, "drawingAnchors", session.drawingAnchors(a, si));
            try RenderJson.put(a, &row, "drawingListSources", session.drawingListSources(a, si));
            try RenderJson.put(a, &row, "drawingMatrixSources", session.drawingMatrixSources(a, si));
            try RenderJson.put(a, &row, "drawingLocalTransforms", session.drawingLocalTransforms(a, si));
            try RenderJson.put(a, &row, "drawingRectangleCorners", session.drawingRectangleCorners(a, si));
            try RenderJson.put(a, &row, "drawingLineEndpoints", session.drawingLineEndpoints(a, si));
            try RenderJson.put(a, &row, "formSources", session.formSources(a, si));
            try RenderJson.put(a, &row, "formProperties", session.formProperties(a, si));
            try RenderJson.put(a, &row, "formAnchors", session.formAnchors(a, si));
            try RenderJson.put(a, &row, "formulaSources", session.formulaSources(a, si));
            try RenderJson.put(a, &row, "pictureSources", session.pictureSources(a, si, .base73));
            try RenderJson.put(a, &row, "pictureTailSources", session.pictureTailSources(a, si, .dimensions8));
            try RenderJson.put(a, &row, "drawingStyleSources", session.drawingStyleSources(a, si, .{ .tail = .alpha_shadow_metadata }));
            try RenderJson.put(a, &row, "pictureSources:with_opacity74", session.pictureSources(a, si, .with_opacity74));
            try RenderJson.put(a, &row, "pictureSources:with_instance78", session.pictureSources(a, si, .with_instance78));
            try RenderJson.put(a, &row, "pictureTailSources:effects_only", session.pictureTailSources(a, si, null));
            try RenderJson.put(a, &row, "pictureTailSources:with_alpha9", session.pictureTailSources(a, si, .with_alpha9));
            try RenderJson.put(a, &row, "drawingStyleSources:fill_only", session.drawingStyleSources(a, si, .{ .tail = .fill_only }));
            try RenderJson.put(a, &row, "drawingPolygonPoints:observed_i32_points", session.drawingPolygonPoints(a, si, .observed_i32_points));
            try RenderJson.put(a, &row, "drawingCurvePoints:observed_i32_points", session.drawingCurvePoints(a, si, .observed_i32_points));
            var paras = std.json.Array.init(a);
            for (0..try session.paragraphCount(si)) |pi| {
                var para = std.json.ObjectMap.empty;
                try para.put(a, "textPresence", try RenderJson.value(a, try session.displayTextPresence(si, pi)));
                try para.put(a, "paragraphShapeId", try RenderJson.value(a, try session.paragraphShapeId(si, pi)));
                try RenderJson.put(a, &para, "characterRanges", session.characterRanges(a, si, pi));
                try paras.append(.{ .object = para });
            }
            try row.put(a, "paragraphs", .{ .array = paras });
            try sections.append(.{ .object = row });
        }
        try root.put(a, "sections", .{ .array = sections });
        const render_bytes = try std.json.Stringify.valueAlloc(self.allocator, std.json.Value{ .object = root }, .{});
        return self.retain(token, render_bytes, ctx.revision, 1, 0);
    }
    pub fn pictureBytes(self: *Bridge, token: Token, expected: u32, section: u32, node: u32) !Buffer {
        const ctx = try self.get(token);
        if (ctx.revision != expected) return error.StaleRevision;
        if (ctx.document == .hwpx) return self.retain(token, try @import("../hwpx/picture_source_bytes.zig").read(self.allocator, &ctx.document.hwpx.session, section, node, 32 * 1024 * 1024), ctx.revision, 0, 0);
        if (ctx.document != .hwp5) return error.UnsupportedNativeRenderFormat;
        const session = ctx.document.hwp5.session;
        const sources = try session.pictureSources(self.allocator, section, .base73);
        defer self.allocator.free(sources);
        var id: ?u16 = null;
        for (sources) |source| if (source.component_node == node) {
            if (id != null) return error.AmbiguousPictureSource;
            id = source.bin_data_id;
        };
        const ordinal = id orelse return error.MissingPictureSource;
        return self.retain(token, try session.binaryResource(self.allocator, ordinal, 32 * 1024 * 1024), ctx.revision, 0, 0);
    }

    pub fn historyStatsJson(self: *Bridge, token: Token) !Buffer {
        const ctx = try self.get(token);
        const bytes = try std.json.Stringify.valueAlloc(self.allocator, ctx.historyStats(), .{});
        return self.retain(token, bytes, ctx.revision, 1, 0);
    }
    pub fn copyError(self: *Bridge, token: Token) !Buffer {
        const ctx = try self.get(token);
        return self.retain(token, try self.allocator.dupe(u8, ctx.last_error), ctx.revision, 1, 0);
    }
};
