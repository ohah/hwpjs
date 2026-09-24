const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const values = @import("xml_values.zig");

// 2011 XSD lexical names and Hancom LineType2 model extensions. Numeric
// values are kept as a distinct form; no undocumented name->number mapping.
const type_names = [_][]const u8{ "LEFT", "RIGHT", "CENTER", "DECIMAL" };
const leader_base_names = [_][]const u8{
    "NONE",        "SOLID",      "DOT",        "DASH",            "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE",
    "DOUBLE_SLIM", "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM",
};
const leader_extended_names = [_][]const u8{ "WAVE", "DOUBLEWAVE", "THICK3D", "THICKREV3D", "3D", "REV3D" };

pub const Report = struct {
    tabs: usize = 0,
    width_present: usize = 0,
    width_zero: usize = 0,
    width_over_u32: usize = 0,
    width_sum: u64 = 0,
    type_present: usize = 0,
    type_numeric: usize = 0,
    type_named: usize = 0,
    type_other: usize = 0,
    type_over_u32: usize = 0,
    type_numeric_sum: u64 = 0,
    type_above_observed_4: usize = 0,
    leader_present: usize = 0,
    leader_numeric: usize = 0,
    leader_named_base: usize = 0,
    leader_named_extended: usize = 0,
    leader_other: usize = 0,
    leader_over_u32: usize = 0,
    leader_numeric_sum: u64 = 0,
    leader_above_model_17: usize = 0,
    extra_attributes: usize = 0,

    pub fn counts(self: Report) [21]u64 {
        return .{
            self.tabs,                  self.width_present,         self.width_zero,      self.width_over_u32,     self.width_sum,
            self.type_present,          self.type_numeric,          self.type_named,      self.type_other,         self.type_over_u32,
            self.type_numeric_sum,      self.type_above_observed_4, self.leader_present,  self.leader_numeric,     self.leader_named_base,
            self.leader_named_extended, self.leader_other,          self.leader_over_u32, self.leader_numeric_sum, self.leader_above_model_17,
            self.extra_attributes,
        };
    }
};

fn matches(raw: []const u8, names: []const []const u8) bool {
    for (names) |name| if (std.mem.eql(u8, raw, name)) return true;
    return false;
}

fn decimalCandidate(raw: []const u8) bool {
    const value = std.mem.trim(u8, raw, " \t\r\n");
    if (value.len == 0) return false;
    const start: usize = if (value[0] == '+' or value[0] == '-') 1 else 0;
    if (start == value.len) return false;
    for (value[start..]) |byte| if (byte < '0' or byte > '9') return false;
    return true;
}

fn numeric32(raw: []const u8) !?u32 {
    if (!decimalCandidate(raw)) return null;
    const zero = values.nonNegative(raw) catch return null;
    if (zero) return 0;
    const trimmed = std.mem.trim(u8, raw, " \t\r\n");
    const digits = if (trimmed[0] == '+') trimmed[1..] else trimmed;
    return std.fmt.parseInt(u32, digits, 10) catch error.Overflow;
}

fn noteWidth(report: *Report, raw: []const u8) !void {
    report.width_present += 1;
    const zero = try values.nonNegative(raw);
    if (zero) {
        report.width_zero += 1;
        return;
    }
    const trimmed = std.mem.trim(u8, raw, " \t\r\n");
    const digits = if (trimmed[0] == '+') trimmed[1..] else trimmed;
    const value = std.fmt.parseInt(u32, digits, 10) catch {
        report.width_over_u32 += 1;
        return;
    };
    report.width_sum = std.math.add(u64, report.width_sum, value) catch return error.LimitExceeded;
}

fn noteType(report: *Report, raw: []const u8) !void {
    report.type_present += 1;
    const maybe_number = numeric32(raw) catch {
        report.type_numeric += 1;
        report.type_over_u32 += 1;
        return;
    };
    if (maybe_number) |value| {
        report.type_numeric += 1;
        report.type_numeric_sum = std.math.add(u64, report.type_numeric_sum, value) catch return error.LimitExceeded;
        report.type_above_observed_4 += @intFromBool(value > 4);
    } else if (matches(raw, &type_names)) {
        report.type_named += 1;
    } else report.type_other += 1;
}

fn noteLeader(report: *Report, raw: []const u8) !void {
    report.leader_present += 1;
    const maybe_number = numeric32(raw) catch {
        report.leader_numeric += 1;
        report.leader_over_u32 += 1;
        return;
    };
    if (maybe_number) |value| {
        report.leader_numeric += 1;
        report.leader_numeric_sum = std.math.add(u64, report.leader_numeric_sum, value) catch return error.LimitExceeded;
        report.leader_above_model_17 += @intFromBool(value > 17);
    } else if (matches(raw, &leader_base_names)) {
        report.leader_named_base += 1;
    } else if (matches(raw, &leader_extended_names)) {
        report.leader_named_extended += 1;
    } else report.leader_other += 1;
}

/// Called only for a direct 2011 hp:tab child of hp:t. Missing fields stay
/// missing; numeric C++ and named XSD forms are never mapped to one another.
pub fn noteTag(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, max_attribute_bytes: usize, report: *Report) !void {
    const width = try attrs.attribute(a, tag, scope, "width", max_attribute_bytes);
    defer if (width) |value| a.free(value);
    const kind = try attrs.attribute(a, tag, scope, "type", max_attribute_bytes);
    defer if (kind) |value| a.free(value);
    const leader = try attrs.attribute(a, tag, scope, "leader", max_attribute_bytes);
    defer if (leader) |value| a.free(value);
    report.tabs += 1;
    if (width) |value| try noteWidth(report, value);
    if (kind) |value| try noteType(report, value);
    if (leader) |value| try noteLeader(report, value);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try scope.expandAttribute(attribute.name);
        if (name.uri.len != 0 or !(name.local.equals("width", false) or name.local.equals("type", false) or name.local.equals("leader", false))) {
            report.extra_attributes += 1;
        }
    }
}
