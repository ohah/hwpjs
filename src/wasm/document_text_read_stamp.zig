//! Captured Native read counters only; this decoder never substitutes current values.
const std = @import("std");
const fields = @import("formatting_patch_request.zig");
pub fn decode(root: std.json.Value) !?@import("../model/document_text_read_binding.zig").Stamp {
    const value = fields.get(root, "readBinding") orelse return null;
    try fields.keys(value, &.{ "epoch", "serial" });
    const epoch = try @import("../model/formatting_binding.zig").decimal(try fields.string(try fields.required(value, "epoch")));
    const serial = try @import("../model/formatting_binding.zig").decimal(try fields.string(try fields.required(value, "serial")));
    if (epoch == 0) return error.InvalidDocumentTextReadBinding;
    return .{ .epoch = epoch, .serial = serial };
}
