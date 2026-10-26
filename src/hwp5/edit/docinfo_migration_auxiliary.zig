//! Explicit structural validation, not interpretation of application item IDs.
const std = @import("std");
pub const Options = struct {
    parameters: @import("../parameters/parser.zig").Options,
    forbidden: @import("../docinfo/forbidden_validation.zig").Layout,
};
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, binary_count: usize, options: Options) !usize {
    const parameters = try @import("../parameters/sources.zig").inspectDocInfo(a, bytes, .{ .parameters = options.parameters, .list_layout = .observed8, .bin_data_count = binary_count });
    if (parameters.unsupported != 0 or parameters.trailing_bytes != 0) return error.UnsupportedDocInfoAuxiliaryPayload;
    var forbidden: @import("../docinfo/forbidden_validation.zig").Report = .{};
    var records = @import("../record.zig").Iterator.init(bytes, .{});
    while (try records.next()) |record| {
        if (record.tag == 27 and record.level != 0) return error.InvalidDocDataMigrationLevel;
        try forbidden.observe(record.tag, record.level, record.payload, options.forbidden);
    }
    if (forbidden.deferred != 0 or forbidden.extra_bytes != 0) return error.UnsupportedDocInfoAuxiliaryPayload;
    return parameters.parsed + forbidden.parsed;
}
