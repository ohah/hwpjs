const std = @import("std");
const types = @import("types.zig");
const d = @import("../docinfo/reader.zig");
const resources = @import("../docinfo/resources.zig");
const references = @import("../docinfo/references.zig");
const sources = @import("../parameters/sources.zig");
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, options: types.Options) !types.DocInfo {
    var it = try d.Iterator.init(bytes, version, options.framing);
    var properties: ?d.Properties = null;
    var records: usize = 0;
    while (try it.next()) |r| {
        records += 1;
        if (r.value == .properties) {
            if (properties != null) return error.DuplicateDocumentProperties;
            properties = r.value.properties;
        }
    }
    const props = properties orelse return error.MissingDocumentProperties;
    const counts = try resources.inspect(bytes, version, options.framing);
    try counts.validateKnownCounts();
    const refs = try references.inspect(bytes, version, options.framing);
    try refs.validateKnown();
    return .{ .properties = props, .resources = counts, .references = refs, .parameters = try sources.inspectDocInfo(a, bytes, types.parameterOptions(options, counts.bin_data_count)), .records = records };
}
