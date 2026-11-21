//! H5-only optional v1. Full native identities travel as exact u32 words.
const std = @import("std");
const native = @import("../hwp5/edit/object_outer_margins.zig");
const epoch = @import("../model/history_mutation_epoch.zig");
pub const version: u32 = 1;
pub const max_bytes: usize = 16384;
pub const Words = struct {
    lo: u32,
    hi: u32,
    pub fn from(v: u64) Words {
        return .{ .lo = @truncate(v), .hi = @truncate(v >> 32) };
    }
    pub fn value(v: Words) u64 {
        return @as(u64, v.hi) << 32 | v.lo;
    }
};
pub const Ticket = struct {
    document: Words,
    generation: Words,
    owner: Words,
    epoch: Words,
    fn from(v: epoch.Ticket) Ticket {
        return .{ .document = Words.from(v.binding.document), .generation = Words.from(v.binding.generation), .owner = Words.from(v.binding.owner), .epoch = Words.from(v.epoch) };
    }
    fn value(v: Ticket) epoch.Ticket {
        return .{ .binding = .{ .document = v.document.value(), .generation = v.generation.value(), .owner = v.owner.value() }, .epoch = v.epoch.value() };
    }
};
pub const Margins = struct {
    left: i16,
    right: i16,
    top: i16,
    bottom: i16,
    fn from(v: [4]i16) Margins {
        return .{ .left = v[0], .right = v[1], .top = v[2], .bottom = v[3] };
    }
    fn values(v: Margins) [4]i16 {
        return .{ v.left, v.right, v.top, v.bottom };
    }
};
pub const Owner = struct { control_node: u32, component_node: u32, paragraph_node: u32, paragraph: u32, anchor_unit: u32, instance_id: u32, source_sha256: [32]u8 };
pub const Observation = struct {
    schemaVersion: u32,
    format: enum { hwp5 },
    selector: native.Selector,
    owner: Owner,
    ticket: Ticket,
    viewEpoch: Words,
    historyRevision: u32,
    margins: Margins,
    editable: bool,
    reason: ?[]const u8,
    wrapOrdinal: u3,
    @"inline": bool,
    pub fn from(v: native.Observation, view: u64, revision: u32) Observation {
        const t = v.target;
        return .{ .schemaVersion = version, .format = .hwp5, .selector = t.selector, .owner = .{ .control_node = t.control_node, .component_node = t.component_node, .paragraph_node = t.paragraph_node, .paragraph = t.paragraph, .anchor_unit = t.anchor_unit, .instance_id = t.instance_id, .source_sha256 = t.source_sha256 }, .ticket = Ticket.from(t.ticket), .viewEpoch = Words.from(view), .historyRevision = revision, .margins = Margins.from(v.margins), .editable = v.editable, .reason = v.reason, .wrapOrdinal = v.wrap_ordinal, .@"inline" = v.treat_as_character };
    }
    fn target(v: Observation) native.Target {
        const o = v.owner;
        return .{ .selector = v.selector, .control_node = o.control_node, .component_node = o.component_node, .paragraph_node = o.paragraph_node, .paragraph = o.paragraph, .anchor_unit = o.anchor_unit, .instance_id = o.instance_id, .source_sha256 = o.source_sha256, .ticket = v.ticket.value() };
    }
};
pub const Request = struct {
    schemaVersion: u32,
    witness: Observation,
    margins: Margins,
    pub fn validate(v: Request, ticket: epoch.Ticket, view: u64, revision: u32) !native.Request {
        if (v.schemaVersion != version or v.witness.schemaVersion != version) return error.UnsupportedOuterMarginsWire;
        if (!std.meta.eql(v.witness.ticket.value().binding, ticket.binding)) return error.SourceBindingMismatch;
        if (v.witness.ticket.value().epoch != ticket.epoch) return error.StaleMutationEpoch;
        if (v.witness.viewEpoch.value() != view or v.witness.historyRevision != revision) return error.StaleCurrentReference;
        if (!v.witness.editable or v.witness.@"inline" or v.witness.wrapOrdinal != 0 or v.witness.reason != null) return error.UnsupportedOuterMarginsPolicy;
        for (v.margins.values()) |n| if (n < 0) return error.InvalidOuterMargins;
        return .{ .target = v.witness.target(), .expected = v.witness.margins.values(), .margins = v.margins.values() };
    }
};
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Request) {
    if (bytes.len == 0 or bytes.len > max_bytes) return error.LimitExceeded;
    return std.json.parseFromSlice(Request, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
}
