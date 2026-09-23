const xml = @import("../xml/root.zig");
const attrs = @import("xml_attributes.zig");
const namespace = @import("chart_namespace.zig");

pub const Options = struct {
    max_references: usize = 100_000,
};

pub const Report = struct {
    numeric_references: usize = 0,
    string_references: usize = 0,
    unsupported_multilevel_references: usize = 0,
    formulas: usize = 0,
    attached_caches: usize = 0,
    references_without_cache: usize = 0,
    missing_formula: usize = 0,
    duplicate_formula: usize = 0,
    duplicate_cache: usize = 0,
    wrong_cache_kind: usize = 0,
    nested_formula_element: usize = 0,
    formula_after_cache: usize = 0,
    unexpected_data_container: usize = 0,

    pub fn references(self: Report) usize {
        return self.numeric_references + self.string_references;
    }

    pub fn issues(self: Report) usize {
        return self.missing_formula + self.duplicate_formula + self.duplicate_cache +
            self.wrong_cache_kind + self.nested_formula_element + self.formula_after_cache +
            self.unexpected_data_container + self.unsupported_multilevel_references;
    }
};

const Reference = struct {
    depth: usize,
    numeric: bool,
    formulas: usize = 0,
    caches: usize = 0,
};

pub const Scanner = struct {
    options: Options,
    report: *Report,
    current: ?Reference = null,
    formula_depth: ?usize = null,
    unsupported_depth: ?usize = null,

    fn finishReference(self: *Scanner) void {
        const current = self.current.?;
        if (current.formulas == 0) self.report.missing_formula += 1;
        if (current.caches == 0) self.report.references_without_cache += 1;
        self.current = null;
    }

    pub fn onTag(self: *Scanner, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) !void {
        if (self.unsupported_depth) |unsupported_depth| {
            if (tag.kind == .end and depth == unsupported_depth) self.unsupported_depth = null;
            return;
        }
        if (tag.kind == .end) {
            if (self.formula_depth == depth) self.formula_depth = null;
            if (self.current) |reference| {
                if (reference.depth == depth) self.finishReference();
            }
            return;
        }
        if (self.formula_depth) |formula_depth| {
            if (depth > formula_depth) self.report.nested_formula_element += 1;
        }
        const numeric_ref = try attrs.element(tag, scope, namespace.uri, "numRef");
        const string_ref = try attrs.element(tag, scope, namespace.uri, "strRef");
        const multilevel_ref = try attrs.element(tag, scope, namespace.uri, "multiLvlStrRef");
        if (multilevel_ref) {
            if (self.current != null) return error.NestedChartReference;
            if (self.report.references() + self.report.unsupported_multilevel_references == self.options.max_references) return error.LimitExceeded;
            self.report.unsupported_multilevel_references += 1;
            if (tag.kind == .start) self.unsupported_depth = depth;
            return;
        }
        if (numeric_ref or string_ref) {
            if (self.current != null) return error.NestedChartReference;
            if (self.report.references() + self.report.unsupported_multilevel_references == self.options.max_references) return error.LimitExceeded;
            if (numeric_ref) self.report.numeric_references += 1 else self.report.string_references += 1;
            self.current = .{ .depth = depth, .numeric = numeric_ref };
            if (tag.kind == .empty) self.finishReference();
            return;
        }
        const reference = if (self.current) |*value| value else return;
        if (depth != reference.depth + 1) return;
        if (try attrs.element(tag, scope, namespace.uri, "f")) {
            if (reference.caches != 0) self.report.formula_after_cache += 1;
            reference.formulas += 1;
            self.report.formulas += 1;
            if (reference.formulas > 1) self.report.duplicate_formula += 1;
            if (tag.kind == .start) self.formula_depth = depth;
            return;
        }
        const numeric_cache = try attrs.element(tag, scope, namespace.uri, "numCache");
        const string_cache = try attrs.element(tag, scope, namespace.uri, "strCache");
        if (numeric_cache or string_cache) {
            reference.caches += 1;
            self.report.attached_caches += 1;
            if (reference.caches > 1) self.report.duplicate_cache += 1;
            if (numeric_cache != reference.numeric) self.report.wrong_cache_kind += 1;
            return;
        }
        if (try attrs.element(tag, scope, namespace.uri, "numLit") or
            try attrs.element(tag, scope, namespace.uri, "strLit") or
            try attrs.element(tag, scope, namespace.uri, "multiLvlStrCache")) self.report.unexpected_data_container += 1;
    }
};
