const d = @import("reader.zig");
const Version = @import("../version.zig").Version;
const Options = @import("../record.zig").Options;
pub const Language = enum(u3) { korean, english, hanja, japanese, other, symbol, user };
/// Same contiguous order as ID_MAPPINGS slots 8..14.
pub const Kind = enum { border_fill, char_shape, tab_def, numbering, bullet, para_shape, style };
const kind_count = @typeInfo(Kind).@"enum".fields.len;
pub fn mappingField(kind: Kind) d.MappingField {
    return @enumFromInt(@intFromEnum(d.MappingField.border_fill) + @intFromEnum(kind));
}

pub const Report = struct {
    mappings: d.IdMappings,
    bin_data_count: usize,
    face_name_count: usize,
    memo_shape_count: usize = 0,
    track_change_author_count: usize = 0,
    track_change_count: usize = 0,
    counts: [kind_count]usize = @splat(0),

    pub fn count(self: Report, kind: Kind) usize {
        return self.counts[@intFromEnum(kind)];
    }
    /// Extends the legacy BinData/font check without changing validate().
    /// Optional resource counts are checked only when their mapping slots are present.
    /// Missing slots remain distinguishable through mappings.get().
    pub fn validateKnownCounts(self: Report) !void {
        try self.validate();
        try self.validateOptionalCount(.memo_shape, self.memo_shape_count);
        try self.validateOptionalCount(.track_change_author, self.track_change_author_count);
        try self.validateOptionalCount(.track_change, self.track_change_count);
        inline for (@typeInfo(Kind).@"enum".fields) |field| {
            const kind: Kind = @enumFromInt(field.value);
            const n = self.mappings.get(mappingField(kind)).?;
            if (n < 0) return error.NegativeMappingCount;
            if (@as(u64, @intCast(n)) != self.count(kind)) return error.ResourceCountMismatch;
        }
    }

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
    fn validateOptionalCount(self: Report, field: d.MappingField, actual: usize) !void {
        if (self.mappings.get(field)) |n| {
            if (n < 0) return error.NegativeMappingCount;
            if (@as(u64, @intCast(n)) != actual) return error.ResourceCountMismatch;
        }
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
/// Counts BinData, FACE_NAME, formatting, memo and raw track-change resources.
pub fn inspect(bytes: []const u8, version: Version, options: Options) !Report {
    var it = try d.Iterator.init(bytes, version, options);
    var mappings: ?d.IdMappings = null;
    var bins: usize = 0;
    var fonts: usize = 0;
    var memos: usize = 0;
    var authors: usize = 0;
    var changes: usize = 0;
    var counts: [kind_count]usize = @splat(0);
    while (try it.next()) |r| switch (r.value) {
        .id_mappings => |m| {
            if (mappings != null) return error.DuplicateIdMappings;
            mappings = m;
        },
        .bin_data => bins += 1,
        .face_name => fonts += 1,
        .memo_shape => memos += 1,
        else => {
            if (r.framing.tag == @intFromEnum(d.Tag.track_change_author)) authors += 1;
            if (r.framing.tag == @intFromEnum(d.Tag.track_change)) changes += 1;
            inline for (@typeInfo(Kind).@"enum".fields) |field| {
                if (r.framing.tag == @intFromEnum(@field(d.Tag, field.name))) counts[field.value] += 1;
            }
        },
    };
    return .{ .mappings = mappings orelse return error.MissingIdMappings, .bin_data_count = bins, .face_name_count = fonts, .memo_shape_count = memos, .track_change_author_count = authors, .track_change_count = changes, .counts = counts };
}
