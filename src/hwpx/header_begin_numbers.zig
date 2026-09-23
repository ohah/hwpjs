const std = @import("std");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");

pub const Field = enum(u8) { page, footnote, endnote, pic, tbl, equation };
pub const fields = std.meta.fieldNames(Field);

pub const Options = struct {
    max_attribute_bytes: usize = 4096,
};

pub const Report = struct {
    present: bool = false,
    nested_ignored: usize = 0,
    values: [fields.len]?[]u8 = @splat(null),

    pub fn value(self: *const Report, field: Field) ?[]const u8 {
        return self.values[@intFromEnum(field)];
    }

    pub fn missingAttributes(self: *const Report) usize {
        if (!self.present) return 0;
        var missing: usize = 0;
        for (self.values) |entry| if (entry == null) {
            missing += 1;
        };
        return missing;
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        for (self.values) |entry| if (entry) |bytes| {
            a.free(bytes);
        };
        self.* = undefined;
    }
};

// xs:positiveInteger has no fixed width. A leading '+' and surrounding XML
// whitespace are legal; zero and negative zero are not positive values.
fn positive(raw: []const u8) !void {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    if (value.len == 0) return error.InvalidPositiveInteger;
    var offset: usize = 0;
    if (value[0] == '+') offset = 1 else if (value[0] == '-') return error.InvalidPositiveInteger;
    if (offset == value.len) return error.InvalidPositiveInteger;
    var nonzero = false;
    for (value[offset..]) |byte| {
        if (byte < '0' or byte > '9') return error.InvalidPositiveInteger;
        if (byte != '0') nonzero = true;
    }
    if (!nonzero) return error.InvalidPositiveInteger;
}

/// Reads one direct 2011 header beginNum while preserving absent fields. The
/// returned normalized values are owned; the caller must deinit the report.
pub fn inspect(a: std.mem.Allocator, header: *const part_tree.Tree, options: Options) !Report {
    if (header.part_kind != .header or header.elements.len == 0) return error.InvalidPartKind;
    var report: Report = .{};
    errdefer report.deinit(a);
    for (header.elements, 0..) |element, index| {
        if (!element.is(document_xml.head_uri, "beginNum")) continue;
        if (element.parent != 0) {
            report.nested_ignored += 1;
            continue;
        }
        if (report.present) return error.DuplicateBeginNumber;
        report.present = true;
        inline for (fields, 0..) |field_name, field_index| {
            const raw = try header.attributeValue(a, index, "", field_name);
            if (raw) |value| {
                const normalized = try value.toUtf8(a, options.max_attribute_bytes);
                positive(normalized) catch |err| {
                    a.free(normalized);
                    return err;
                };
                report.values[field_index] = normalized;
            }
        }
    }
    return report;
}
