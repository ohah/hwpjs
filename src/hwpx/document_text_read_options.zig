//! Session read admission keeps semantic and retained-buffer budgets distinct.
const std = @import("std");
const editor = @import("editor_session.zig");

/// Default policy reserves two UTF-8 copies of the semantic allowance per
/// section. Generated/control expansions may require an explicit larger cap.
/// This is not a heap bound: nodes, units and snapshot storage have other limits.
/// Explicit zero means zero; explicit caps bypass default derivation, including
/// its overflow. Never saturate, wrap, silently clamp or retry with a larger cap.
pub fn retainedBytes(options: editor.Options) error{LimitExceeded}!usize {
    if (options.max_read_retained_bytes) |cap| return cap;
    return std.math.mul(usize, options.max_text_bytes, 2) catch error.LimitExceeded;
}

pub fn fromSession(options: editor.Options) !@import("control_text_read_context.zig").Limits {
    return .{
        .max_paragraphs = @import("../model/text_transaction.zig").limits.snapshot_paragraphs,
        .max_bytes = try retainedBytes(options),
        .max_units = @import("../model/text_transaction.zig").limits.text_units,
        .branch_policy = editor.siteOptions(options).branch_policy,
    };
}
