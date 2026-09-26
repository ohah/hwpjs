const std = @import("std");
const text = @import("section_text.zig");

pub const Options = struct {
    max_events: usize = 4_000_000,
    max_owned_bytes: usize = 128 * 1024 * 1024,
};

pub const Inline = struct {
    kind: text.InlineKind,
    raw_tag: []const u8,
};

/// Raw element tags and normalized hp:t content are owned by Snapshot.
/// A text_end has no raw tag because the source event reports only its location.
pub const Event = struct {
    location: text.Location,
    value: union(enum) {
        paragraph_start: []const u8,
        paragraph_end: []const u8,
        run_start: []const u8,
        run_end: []const u8,
        text_start: []const u8,
        text_end,
        content: []const u8,
        inline_start: Inline,
        inline_end: Inline,
        inline_empty: Inline,
    },
};

pub const Snapshot = struct {
    arena: std.heap.ArenaAllocator,
    events: []const Event,
    report: text.Report,
    owned_bytes: usize,

    pub fn deinit(self: *Snapshot) void {
        self.arena.deinit();
        self.* = undefined;
    }
};

pub const MasterSnapshot = struct {
    snapshot: Snapshot,
    parts: usize,
    sub_lists: usize,
    xml_bytes: usize,

    pub fn deinit(self: *MasterSnapshot) void {
        self.snapshot.deinit();
        self.* = undefined;
    }
};

/// Consumes the existing section scanner's callback, never reparses XML.
/// On any failure the caller must deinit the builder; no partial snapshot escapes.
pub const Builder = struct {
    arena: std.heap.ArenaAllocator,
    events: std.ArrayList(Event) = .empty,
    options: Options,
    owned_bytes: usize = 0,

    pub fn init(a: std.mem.Allocator, options: Options) Builder {
        return .{ .arena = std.heap.ArenaAllocator.init(a), .options = options };
    }

    pub fn deinit(self: *Builder) void {
        self.arena.deinit();
        self.* = undefined;
    }

    pub fn visitor(self: *Builder) text.Visitor {
        return .{ .context = self, .on_event = onEvent };
    }

    fn copy(self: *Builder, bytes: []const u8) ![]const u8 {
        if (bytes.len > self.options.max_owned_bytes -| self.owned_bytes) return error.LimitExceeded;
        const result = try self.arena.allocator().dupe(u8, bytes);
        self.owned_bytes += bytes.len;
        return result;
    }

    fn onEvent(raw: *anyopaque, input: text.Event) anyerror!void {
        const self: *Builder = @ptrCast(@alignCast(raw));
        if (self.events.items.len >= self.options.max_events) return error.LimitExceeded;
        const event: Event = switch (input) {
            .paragraph_start => |item| .{ .location = item.location, .value = .{ .paragraph_start = try self.copy(item.tag.raw) } },
            .paragraph_end => |item| .{ .location = item.location, .value = .{ .paragraph_end = try self.copy(item.tag.raw) } },
            .run_start => |item| .{ .location = item.location, .value = .{ .run_start = try self.copy(item.tag.raw) } },
            .run_end => |item| .{ .location = item.location, .value = .{ .run_end = try self.copy(item.tag.raw) } },
            .text_start => |item| .{ .location = item.location, .value = .{ .text_start = try self.copy(item.tag.raw) } },
            .text_end => |location| .{ .location = location, .value = .text_end },
            .content => |item| .{ .location = item.location, .value = .{ .content = try self.copy(item.bytes) } },
            .inline_start => |item| .{ .location = item.location, .value = .{ .inline_start = .{ .kind = item.kind, .raw_tag = try self.copy(item.tag.raw) } } },
            .inline_end => |item| .{ .location = item.location, .value = .{ .inline_end = .{ .kind = item.kind, .raw_tag = try self.copy(item.tag.raw) } } },
            .inline_empty => |item| .{ .location = item.location, .value = .{ .inline_empty = .{ .kind = item.kind, .raw_tag = try self.copy(item.tag.raw) } } },
        };
        try self.events.append(self.arena.allocator(), event);
    }

    pub fn finish(self: *Builder, report: text.Report) !Snapshot {
        const events = try self.events.toOwnedSlice(self.arena.allocator());
        const result: Snapshot = .{ .arena = self.arena, .events = events, .report = report, .owned_bytes = self.owned_bytes };
        self.* = undefined;
        return result;
    }

    pub fn finishMaster(self: *Builder, report: text.MasterReport) !MasterSnapshot {
        return .{
            .snapshot = try self.finish(report.text),
            .parts = report.parts,
            .sub_lists = report.sub_lists,
            .xml_bytes = report.xml_bytes,
        };
    }
};
