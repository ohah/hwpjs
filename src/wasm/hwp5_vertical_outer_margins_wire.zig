//! Separate observed-compact raw1 contract. Square-v1 and official Tight are unchanged.
const std = @import("std");
const base = @import("hwp5_object_outer_margins_wire.zig");
const native = @import("../hwp5/edit/object_outer_margins.zig");
const epoch = @import("../model/history_mutation_epoch.zig");
pub const version: u32 = 1;
pub const max_bytes = base.max_bytes;
pub const Profile = enum { @"hwp5-observed-vertical-outer-margins-v1" };
pub const Observation = struct {
    schemaVersion: u32,
    profile: Profile,
    witness: base.Observation,
    pub fn from(value: native.Observation, view: u64, revision: u32) Observation {
        return .{ .schemaVersion = version, .profile = .@"hwp5-observed-vertical-outer-margins-v1", .witness = base.Observation.from(value, view, revision) };
    }
};
pub const Request = struct {
    schemaVersion: u32,
    profile: Profile,
    witness: base.Observation,
    top: i16,
    bottom: i16,
    pub fn validate(value: Request, actual: epoch.Ticket, view: u64, revision: u32) !native.Request {
        const w = value.witness;
        if (value.schemaVersion != version or w.schemaVersion != base.version) return error.UnsupportedVerticalMarginsWire;
        const t = w.ticket;
        const supplied: epoch.Ticket = .{ .binding = .{ .document = t.document.value(), .generation = t.generation.value(), .owner = t.owner.value() }, .epoch = t.epoch.value() };
        if (!std.meta.eql(supplied.binding, actual.binding)) return error.SourceBindingMismatch;
        if (supplied.epoch != actual.epoch) return error.StaleMutationEpoch;
        if (w.viewEpoch.value() != view or w.historyRevision != revision) return error.StaleCurrentReference;
        if (!w.editable or w.@"inline" or w.wrapOrdinal != 1 or w.reason != null) return error.UnsupportedVerticalMarginsPolicy;
        // A negative source word can be retained exactly, never introduced or normalized.
        if ((value.top < 0 and value.top != w.margins.top) or (value.bottom < 0 and value.bottom != w.margins.bottom)) return error.InvalidVerticalMargin;
        const o = w.owner;
        return .{
            .target = .{ .selector = w.selector, .control_node = o.control_node, .component_node = o.component_node, .paragraph_node = o.paragraph_node, .paragraph = o.paragraph, .anchor_unit = o.anchor_unit, .instance_id = o.instance_id, .source_sha256 = o.source_sha256, .ticket = supplied },
            .expected = .{ w.margins.left, w.margins.right, w.margins.top, w.margins.bottom },
            .margins = .{ w.margins.left, w.margins.right, value.top, value.bottom },
        };
    }
};
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !std.json.Parsed(Request) {
    if (bytes.len == 0 or bytes.len > max_bytes) return error.LimitExceeded;
    return std.json.parseFromSlice(Request, a, bytes, .{ .allocate = .alloc_always, .ignore_unknown_fields = false, .duplicate_field_behavior = .@"error" });
}
