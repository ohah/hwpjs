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
pub const CompatibleDocument = @import("compatible_document.zig").CompatibleDocument;
pub const LayoutCompatibility = @import("layout_compatibility.zig").LayoutCompatibility;
pub const MemoShape = @import("memo_shape.zig").Shape;
pub const Tag = enum(u10) { document_properties = 16, id_mappings = 17, bin_data = 18, face_name = 19, border_fill = 20, char_shape = 21, tab_def = 22, numbering = 23, bullet = 24, para_shape = 25, style = 26, compatible_document = 30, layout_compatibility = 31, track_change_info = 32, track_change = 96, track_change_author = 97 };
pub const Value = union(enum) { properties: Properties, id_mappings: IdMappings, bin_data: BinData, face_name: FaceName, border_fill: BorderFill, char_shape: CharShape, tab_def: TabDef, numbering: Numbering, bullet: Bullet, para_shape: ParaShape, style: Style, compatible_document: CompatibleDocument, layout_compatibility: LayoutCompatibility, memo_shape: MemoShape, unknown };
pub const Record = struct { framing: framing.Record, value: Value };

/// Incremental semantic decoding; all records retain their exact raw framing.
/// Not a complete DocInfo validator: count/reference checks live in resources
/// and references; full document ordering/assembly is separate. Failures are atomic.
pub const Iterator = struct {
    records: framing.Iterator,
    version: Version,
    caret_policy: @import("properties.zig").CaretPolicy = .required,
    font_type_policy: @import("face_name.zig").TypeInfoPolicy = .required,
    style_character_policy: @import("style.zig").CharacterPolicy = .required,
    character_tail_policy: @import("char_shape.zig").TailPolicy = .required,
    fill_additional_policy: @import("fill.zig").AdditionalPolicy = .required,

    pub fn init(bytes: []const u8, version: Version, options: framing.Options) !Iterator {
        try version.requireSupported();
        return .{ .records = framing.Iterator.init(bytes, options), .version = version };
    }
    pub fn next(self: *Iterator) !?Record {
        var candidate = self.records;
        const r = (try candidate.next()) orelse return null;
        // Envelope validation does not make track-change fields understood.
        if (r.tag == @backingInt(Tag.track_change_info)) _ = try @import("track_change_info.zig").View.parse(r.payload);
        const value: Value = switch (r.tag) {
            @backingInt(Tag.document_properties) => .{ .properties = try Properties.parseWithCaretPolicy(r.payload, self.caret_policy) },
            @backingInt(Tag.id_mappings) => .{ .id_mappings = try IdMappings.parse(r.payload, self.version) },
            @backingInt(Tag.bin_data) => .{ .bin_data = try BinData.parse(r.payload) },
            @backingInt(Tag.face_name) => .{ .face_name = try FaceName.parseWithTypeInfoPolicy(r.payload, self.font_type_policy) },
            @backingInt(Tag.tab_def) => .{ .tab_def = try TabDef.parse(r.payload) },
            @backingInt(Tag.numbering) => .{ .numbering = try Numbering.parse(r.payload, self.version) },
            @backingInt(Tag.bullet) => .{ .bullet = try Bullet.parse(r.payload) },
            @backingInt(Tag.style) => .{ .style = try Style.parseWithCharacterPolicy(r.payload, self.style_character_policy) },
            @backingInt(Tag.border_fill) => .{ .border_fill = try BorderFill.parseWithAdditionalPolicy(r.payload, self.fill_additional_policy) },
            @backingInt(Tag.char_shape) => .{ .char_shape = try CharShape.parseWithTailPolicy(r.payload, self.version, self.character_tail_policy) },
            @backingInt(Tag.para_shape) => .{ .para_shape = try ParaShape.parse(r.payload, self.version) },
            @backingInt(Tag.compatible_document) => .{ .compatible_document = try CompatibleDocument.parse(r.payload) },
            @backingInt(Tag.layout_compatibility) => .{ .layout_compatibility = try LayoutCompatibility.parse(r.payload) },
            @import("memo_shape.zig").tag => .{ .memo_shape = try MemoShape.parse(r.payload) },
            else => .unknown,
        };
        const expected_level: ?u10 = switch (value) {
            .properties, .id_mappings, .compatible_document => 0,
            .bin_data, .face_name, .tab_def, .numbering, .bullet, .style, .border_fill, .char_shape, .para_shape, .layout_compatibility => 1,
            .unknown => switch (r.tag) {
                @backingInt(Tag.track_change_info), @backingInt(Tag.track_change), @backingInt(Tag.track_change_author) => 1,
                else => null,
            },
            .memo_shape => 1,
        };
        if (expected_level) |level| if (r.level != level) return error.InvalidDocInfoLevel;
        self.records = candidate;
        return .{ .framing = r, .value = value };
    }
};
