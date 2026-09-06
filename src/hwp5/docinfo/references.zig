const d = @import("reader.zig");
const resources = @import("resources.zig");
const rules = @import("reference_rules.zig");
const Version = @import("../version.zig").Version;
const Options = @import("../record.zig").Options;
pub const Field = enum { font, char_border, numbering_char, bullet_char, bullet_image, fill_image, para_tab, para_border, para_numbering, para_bullet, style_next, style_para, style_char };
pub const Issue = struct { record_offset: usize, tag: u10, field: Field, slot: u8, id: u32 };
pub const Report = struct {
    checked: usize = 0,
    invalid: usize = 0,
    deferred: usize = 0,
    unknown_records: usize = 0,
    first_issue: ?Issue = null,
    /// Only known active references. Deferred/unknown work remains explicit.
    pub fn validateKnown(self: Report) !void {
        if (self.invalid != 0) return error.InvalidResourceReference;
    }
    fn check(self: *Report, r: d.Record, field: Field, slot: u8, id: u32, count: usize, rule: rules.Rule) void {
        switch (rules.resolve(rule, id, count)) {
            .absent => {},
            .ordinal => self.checked += 1,
            .invalid => {
                self.checked += 1;
                self.invalid += 1;
                if (self.first_issue == null) self.first_issue = .{ .record_offset = r.framing.offset, .tag = r.framing.tag, .field = field, .slot = slot, .id = id };
            },
        }
    }
};

/// Two bounded scans, no declared-count allocation or reference following.
/// Input stays borrowed/unmodified. Counts must agree before resolving IDs.
/// BinData references address 1-based item ordinals, not CFB storage IDs.
pub fn inspect(bytes: []const u8, version: Version, options: Options) !Report {
    const counts = try resources.inspect(bytes, version, options);
    try counts.validateKnownCounts();
    var it = try d.Iterator.init(bytes, version, options);
    var report: Report = .{};
    while (try it.next()) |r| switch (r.value) {
        .char_shape => |v| {
            for (v.font_ids, 0..) |id, i| report.check(r, .font, @intCast(i), id, @intCast(counts.fontCount(@enumFromInt(i))), .zero_based);
            if (v.border_fill_id) |id| report.check(r, .char_border, 0, id, counts.count(.border_fill), .optional_one_based);
        },
        .numbering => |v| {
            for (v.levels, 0..) |l, i| report.check(r, .numbering_char, @intCast(i), l.head.char_shape_id, counts.count(.char_shape), .inherited_char_shape);
            if (v.extension) |ext| for (ext.levels, 7..) |l, i| {
                report.check(r, .numbering_char, @intCast(i), l.head.char_shape_id, counts.count(.char_shape), .inherited_char_shape);
            };
        },
        .bullet => |v| {
            report.check(r, .bullet_char, 0, v.head.char_shape_id, counts.count(.char_shape), .inherited_char_shape);
            if (v.image) |img| switch (img.identifier) {
                0 => {},
                1 => report.check(r, .bullet_image, 0, img.bin_data_id, counts.bin_data_count, .one_based),
                else => report.deferred += 1,
            };
        },
        .border_fill => |v| switch (v.fill.data) {
            .unknown => report.deferred += 1,
            .known => |fill| if (fill.image) |img| {
                report.check(r, .fill_image, 0, img.picture.bin_data_id, counts.bin_data_count, .one_based);
            },
        },
        .para_shape => |v| {
            report.check(r, .para_tab, 0, v.tab_def_id, counts.count(.tab_def), .zero_based);
            report.check(r, .para_border, 0, v.border_fill_id, counts.count(.border_fill), .optional_one_based);
            switch ((v.attributes >> 23) & 3) {
                0 => {}, // inactive stored head ID is not a dangling reference
                1 => if (v.head_id == 0) {
                    report.deferred += 1;
                } else {
                    report.check(r, .para_numbering, 0, v.head_id, counts.count(.numbering), .one_based);
                },
                2 => report.check(r, .para_numbering, 0, v.head_id, counts.count(.numbering), .one_based),
                3 => report.check(r, .para_bullet, 0, v.head_id, counts.count(.bullet), .one_based),
                else => unreachable,
            }
        },
        .style => |v| switch (v.attributes & 7) {
            0 => {
                report.check(r, .style_next, 0, v.next_style_id, counts.count(.style), .zero_based);
                report.check(r, .style_para, 0, v.para_shape_id, counts.count(.para_shape), .zero_based);
                report.check(r, .style_char, 0, v.char_shape_id, counts.count(.char_shape), .zero_based);
            },
            1 => report.check(r, .style_char, 0, v.char_shape_id, counts.count(.char_shape), .zero_based),
            else => report.deferred += 1,
        },
        .unknown => report.unknown_records += 1,
        else => {},
    };
    return report;
}
