const d = @import("reader.zig");
const Version = @import("../version.zig").Version;
const Options = @import("../record.zig").Options;
pub const Language = enum(u3) { korean, english, hanja, japanese, other, symbol, user };

pub const Report = struct {
    mappings: d.IdMappings,
    bin_data_count: usize,
    face_name_count: usize,

    pub fn validate(self: Report) !void {
        const bins = self.mappings.get(.bin_data).?;
        if (bins < 0) return error.NegativeMappingCount;
        var fonts: u64 = 0;
        for (0..7) |i| {
            const n = self.fontCount(@enumFromInt(i));
            if (n < 0) return error.NegativeMappingCount;
            fonts += @intCast(n);
        }
        if (@as(u64, @intCast(bins)) != self.bin_data_count or fonts != self.face_name_count)
            return error.ResourceCountMismatch;
    }
    pub fn fontCount(self: Report, language: Language) i32 {
        return self.mappings.get(@enumFromInt(@as(usize, @intFromEnum(d.MappingField.font_korean)) + @intFromEnum(language))).?;
    }
    /// A 0-based language-local font ID -> 0-based FACE_NAME record ordinal.
    /// Requires validated totals; this is not a CFB stream ID or a glyph lookup.
    pub fn fontOrdinal(self: Report, language: Language, id: usize) !?usize {
        try self.validate();
        if (id >= @as(usize, @intCast(self.fontCount(language)))) return null;
        var offset: usize = 0;
        for (0..@intFromEnum(language)) |i| offset += @intCast(self.fontCount(@enumFromInt(i)));
        return offset + id;
    }
};

/// No allocations from declared counts; preserve mismatches as a report.
/// Checks only BinData and FACE_NAME counts, not all DocInfo resource types.
pub fn inspect(bytes: []const u8, version: Version, options: Options) !Report {
    var it = try d.Iterator.init(bytes, version, options);
    var mappings: ?d.IdMappings = null;
    var bins: usize = 0;
    var fonts: usize = 0;
    while (try it.next()) |r| switch (r.value) {
        .id_mappings => |m| {
            if (mappings != null) return error.DuplicateIdMappings;
            mappings = m;
        },
        .bin_data => bins += 1,
        .face_name => fonts += 1,
        else => {},
    };
    return .{ .mappings = mappings orelse return error.MissingIdMappings, .bin_data_count = bins, .face_name_count = fonts };
}
