const framing = @import("../record.zig");
const Version = @import("../version.zig").Version;
pub const Properties = @import("properties.zig").Properties;
pub const IdMappings = @import("id_mappings.zig").IdMappings;
pub const MappingField = @import("id_mappings.zig").Field;
pub const BinData = @import("bin_data.zig").BinData;
pub const FaceName = @import("face_name.zig").FaceName;
pub const TabDef = @import("tab_def.zig").TabDef;
pub const Numbering = @import("numbering.zig").Numbering;
pub const Bullet = @import("bullet.zig").Bullet;
pub const Style = @import("style.zig").Style;
pub const BorderFill = @import("border_fill.zig").BorderFill;
pub const CharShape = @import("char_shape.zig").CharShape;
pub const ParaShape = @import("para_shape.zig").ParaShape;
pub const Tag = enum(u10) { document_properties = 16, id_mappings = 17, bin_data = 18, face_name = 19, border_fill = 20, char_shape = 21, tab_def = 22, numbering = 23, bullet = 24, para_shape = 25, style = 26 };
pub const Value = union(enum) { properties: Properties, id_mappings: IdMappings, bin_data: BinData, face_name: FaceName, border_fill: BorderFill, char_shape: CharShape, tab_def: TabDef, numbering: Numbering, bullet: Bullet, para_shape: ParaShape, style: Style, unknown };
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
            @intFromEnum(Tag.tab_def) => .{ .tab_def = try TabDef.parse(r.payload) },
            @intFromEnum(Tag.numbering) => .{ .numbering = try Numbering.parse(r.payload, self.version) },
            @intFromEnum(Tag.bullet) => .{ .bullet = try Bullet.parse(r.payload) },
            @intFromEnum(Tag.style) => .{ .style = try Style.parse(r.payload) },
            @intFromEnum(Tag.border_fill) => .{ .border_fill = try BorderFill.parse(r.payload) },
            @intFromEnum(Tag.char_shape) => .{ .char_shape = try CharShape.parse(r.payload, self.version) },
            @intFromEnum(Tag.para_shape) => .{ .para_shape = try ParaShape.parse(r.payload, self.version) },
            else => .unknown,
        };
        const expected_level: ?u10 = switch (value) {
            .properties, .id_mappings => 0,
            .bin_data, .face_name, .tab_def, .numbering, .bullet, .style, .border_fill, .char_shape, .para_shape => 1,
            .unknown => null,
        };
        if (expected_level) |level| if (r.level != level) return error.InvalidDocInfoLevel;
        self.records = candidate;
        return .{ .framing = r, .value = value };
    }
};
