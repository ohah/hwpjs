const framing = @import("../record.zig");
const Version = @import("../version.zig").Version;
pub const Properties = @import("properties.zig").Properties;
pub const IdMappings = @import("id_mappings.zig").IdMappings;
pub const MappingField = @import("id_mappings.zig").Field;
pub const BinData = @import("bin_data.zig").BinData;
pub const FaceName = @import("face_name.zig").FaceName;
pub const Tag = enum(u10) { document_properties = 16, id_mappings = 17, bin_data = 18, face_name = 19 };
pub const Value = union(enum) { properties: Properties, id_mappings: IdMappings, bin_data: BinData, face_name: FaceName, unknown };
pub const Record = struct { framing: framing.Record, value: Value };

/// Incremental semantic decoding; all records retain their exact raw framing.
/// Not a complete DocInfo validator: order, duplicates and resource references
/// are left to the future document assembler. Failures are atomic.
pub const Iterator = struct {
    records: framing.Iterator,
    version: Version,

    pub fn init(bytes: []const u8, version: Version, options: framing.Options) !Iterator {
        try version.requireSupported();
        return .{ .records = framing.Iterator.init(bytes, options), .version = version };
    }
    pub fn next(self: *Iterator) !?Record {
        var candidate = self.records;
        const r = (try candidate.next()) orelse return null;
        const value: Value = switch (r.tag) {
            @intFromEnum(Tag.document_properties) => .{ .properties = try Properties.parse(r.payload) },
            @intFromEnum(Tag.id_mappings) => .{ .id_mappings = try IdMappings.parse(r.payload, self.version) },
            @intFromEnum(Tag.bin_data) => .{ .bin_data = try BinData.parse(r.payload) },
            @intFromEnum(Tag.face_name) => .{ .face_name = try FaceName.parse(r.payload) },
            else => .unknown,
        };
        const expected_level: ?u10 = switch (value) {
            .properties, .id_mappings => 0,
            .bin_data, .face_name => 1,
            .unknown => null,
        };
        if (expected_level) |level| if (r.level != level) return error.InvalidDocInfoLevel;
        self.records = candidate;
        return .{ .framing = r, .value = value };
    }
};
