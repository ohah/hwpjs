//! Generated-table coordinate planning; paragraph mutations commit separately.
const std = @import("std");
const Host = @import("created_table_anchor.zig").Host;
const Entry = @import("created_table_values.zig").Entry;

fn validate(host: Host) !void {
    switch (host) {
        .original_node => {},
        .generated_instance => |id| if (id == 0) return error.InvalidTableOwner,
    }
}

/// Right affinity: a table at the split point belongs to the new suffix.
/// Caller reserves new_instance against every paragraph in the document.
pub fn split(entries: []Entry, host: Host, new_instance: u32, at: u32) !void {
    try validate(host);
    if (new_instance == 0) return error.InvalidParagraphInstanceId;
    const next: Host = .{ .generated_instance = new_instance };
    if (std.meta.eql(host, next)) return error.InvalidParagraphInstanceId;
    for (entries) |entry| {
        if (std.meta.eql(entry.anchor.host, next)) return error.InvalidParagraphInstanceId;
        for (entry.value.table.cells) |cell| if (cell.paragraph_id == new_instance) return error.InvalidParagraphInstanceId;
    }
    for (entries) |*entry| {
        if (std.meta.eql(entry.anchor.host, host) and entry.anchor.unit >= at) {
            entry.anchor.host = next;
            entry.anchor.unit -= at;
        }
    }
}

/// left_units excludes the removed paragraph terminator, and uses UTF-16 units.
pub fn merge(entries: []Entry, left: Host, right: Host, left_units: u32) !void {
    try validate(left);
    try validate(right);
    if (std.meta.eql(left, right)) return error.SourceBindingMismatch;
    for (entries) |entry| {
        if (std.meta.eql(entry.anchor.host, right)) _ = std.math.add(u32, left_units, entry.anchor.unit) catch return error.LimitExceeded;
    }
    for (entries) |*entry| {
        if (std.meta.eql(entry.anchor.host, right)) {
            entry.anchor.host = left;
            entry.anchor.unit += left_units;
        }
    }
}

/// Explicit object deletion must remove its owned value before host deletion.
pub fn requireUnanchored(entries: []const Entry, host: Host) !void {
    try validate(host);
    for (entries) |entry| if (std.meta.eql(entry.anchor.host, host)) return error.ProtectedCreatedTableAnchor;
}
