const std = @import("std");
const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const document_xml = @import("document_xml.zig");

const chart_namespace = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart";

pub const State = struct {
    cases: usize = 0,
    defaults: usize = 0,
    case_after_default: bool = false,
};

/// Direct hp:run/hp:switch shape only; no conditional branch is selected.
pub const Report = struct {
    switches: usize = 0,
    switch_extra_attributes: usize = 0,
    cases: usize = 0,
    defaults: usize = 0,
    other_children: usize = 0,
    required_ns_present: usize = 0,
    required_ns_empty: usize = 0,
    required_chart_ns: usize = 0,
    required_other_ns: usize = 0,
    unqualified_required_present: usize = 0,
    both_required_forms: usize = 0,
    case_extra_attributes: usize = 0,
    default_extra_attributes: usize = 0,
    case_chart_children: usize = 0,
    case_other_children: usize = 0,
    default_ole_children: usize = 0,
    default_other_children: usize = 0,
    missing_case_switches: usize = 0,
    missing_default_switches: usize = 0,
    duplicate_default_switches: usize = 0,
    case_after_default_switches: usize = 0,

    pub fn counts(self: Report) [21]u64 {
        return .{
            self.switches,                    self.switch_extra_attributes, self.cases,                    self.defaults,                 self.other_children,
            self.required_ns_present,         self.required_ns_empty,       self.required_chart_ns,        self.required_other_ns,        self.unqualified_required_present,
            self.both_required_forms,         self.case_extra_attributes,   self.default_extra_attributes, self.case_chart_children,      self.case_other_children,
            self.default_ole_children,        self.default_other_children,  self.missing_case_switches,    self.missing_default_switches, self.duplicate_default_switches,
            self.case_after_default_switches,
        };
    }

    pub fn finish(self: *Report, state: State) void {
        self.missing_case_switches += @intFromBool(state.cases == 0);
        self.missing_default_switches += @intFromBool(state.defaults == 0);
        self.duplicate_default_switches += @intFromBool(state.defaults > 1);
        self.case_after_default_switches += @intFromBool(state.case_after_default);
    }
};

fn countExtras(tag: xml.tags.Tag, scope: *const xml.namespaces.State, uri: []const u8, local: []const u8) !usize {
    var count: usize = 0;
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try scope.expandAttribute(attribute.name);
        if (!std.mem.eql(u8, name.uri, uri) or !name.local.equals(local, false)) count += 1;
    }
    return count;
}

pub fn noteSwitch(tag: xml.tags.Tag, scope: *const xml.namespaces.State, report: *Report) !void {
    report.switches += 1;
    report.switch_extra_attributes += try countExtras(tag, scope, "", "");
}

pub fn noteCase(a: std.mem.Allocator, tag: xml.tags.Tag, scope: *const xml.namespaces.State, max_attribute_bytes: usize, state: *State, report: *Report) !void {
    const required = try attrs.attributeInNamespace(a, tag, scope, document_xml.paragraph_uri, "required-namespace", max_attribute_bytes);
    defer if (required) |value| a.free(value);
    const unqualified = try attrs.attribute(a, tag, scope, "required-namespace", max_attribute_bytes);
    defer if (unqualified) |value| a.free(value);
    state.cases += 1;
    state.case_after_default = state.case_after_default or state.defaults != 0;
    report.cases += 1;
    report.unqualified_required_present += @intFromBool(unqualified != null);
    report.both_required_forms += @intFromBool(required != null and unqualified != null);
    report.case_extra_attributes += try countExtras(tag, scope, document_xml.paragraph_uri, "required-namespace");
    if (required) |value| {
        report.required_ns_present += 1;
        if (value.len == 0) report.required_ns_empty += 1 else if (std.mem.eql(u8, value, chart_namespace)) {
            report.required_chart_ns += 1;
        } else report.required_other_ns += 1;
    }
}

pub fn noteDefault(tag: xml.tags.Tag, scope: *const xml.namespaces.State, state: *State, report: *Report) !void {
    state.defaults += 1;
    report.defaults += 1;
    report.default_extra_attributes += try countExtras(tag, scope, "", "");
}

pub fn noteOtherChild(report: *Report) void {
    report.other_children += 1;
}

pub fn noteBranchChild(tag: xml.tags.Tag, scope: *const xml.namespaces.State, is_case: bool, report: *Report) !void {
    const expected = if (is_case) "chart" else "ole";
    if (try attrs.element(tag, scope, document_xml.paragraph_uri, expected)) {
        if (is_case) report.case_chart_children += 1 else report.default_ole_children += 1;
    } else if (is_case) report.case_other_children += 1 else report.default_other_children += 1;
}
