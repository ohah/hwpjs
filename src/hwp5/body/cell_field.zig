const std = @import("std");
const parameters = @import("../parameters/parser.zig");
const Extension = @import("cell_extension.zig").Extension;
const field = @import("../parameters/field_name.zig");
pub const Result = field.Result;
/// Borrowed name and trailing bytes; temporary parameter nodes are always freed.
pub fn inspect(a: std.mem.Allocator, extension: Extension, options: parameters.Options) !?Result {
    if (!extension.parameterSetMarked()) return null;
    var doc = try parameters.Document.parse(a, extension.remaining, options);
    defer doc.deinit(a);
    return try fromDocument(doc);
}
/// Reuse an already parsed tree; the caller retains its input bytes.
pub fn fromDocument(doc: parameters.Document) !Result {
    return field.fromDocument(doc) catch |err| switch (err) {
        error.InvalidNamedFieldType => error.InvalidCellFieldType,
        error.DuplicateNamedFieldName => error.DuplicateCellFieldName,
        else => err,
    };
}
