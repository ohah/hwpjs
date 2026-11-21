//! Managed History2 scalar request. No caller-selected lifetime binding strings.
const std = @import("std");
const source = @import("page_restart_edit.zig");
const epoch = @import("../../model/history_mutation_epoch.zig");
pub const Observation = struct { target: source.Target, anchor: source.Anchor, ticket: epoch.Ticket, revision: u32 };
pub const Request = struct { before: Observation, number: u16 };
pub fn observe(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, paragraphs: []const @import("../../model/document.zig").Paragraph, section: usize, control: usize, ticket: epoch.Ticket, revision: u32, read_only: bool) !Observation {
    if (read_only) return error.PageRestartReadOnly;
    const target = try source.capture(a, raw, version, section, control);
    return .{ .target = target, .anchor = try source.currentAnchor(a, raw, version, paragraphs, target), .ticket = ticket, .revision = revision };
}
pub fn validate(before: Observation, current: Observation, number: u16) !bool {
    if (!std.meta.eql(before, current)) return error.StalePageRestartBinding;
    if (number == 0) return error.InvalidPageRestartNumber;
    return number != current.target.number;
}
