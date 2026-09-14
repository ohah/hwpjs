const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const abi_check = b.addSystemCommand(&.{ "node", "tools/generate-abi.mjs", "--check" });
    const icc_registry_check = b.addSystemCommand(&.{ "node", "tools/icc-registry/generate.mjs", "--check" });
    const core = b.addModule("hwpjs", .{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    const tests = b.addTest(.{ .root_module = core });
    tests.step.dependOn(&icc_registry_check.step);
    const run_tests = b.addRunArtifact(tests);
    run_tests.step.dependOn(&abi_check.step);
    b.step("test", "Run core unit tests").dependOn(&run_tests.step);

    const wasm = b.addExecutable(.{
        .name = "hwpjs",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/wasm.zig"),
            .target = b.resolveTargetQuery(.{ .cpu_arch = .wasm32, .os_tag = .freestanding }),
            .optimize = optimize,
        }),
    });
    wasm.entry = .disabled;
    wasm.rdynamic = true;
    wasm.step.dependOn(&abi_check.step);
    wasm.step.dependOn(&icc_registry_check.step);
    b.installArtifact(wasm);

    const compare = b.addSystemCommand(&.{ "node", "tests/cfb/compare.mjs" });
    compare.step.dependOn(b.getInstallStep());
    const compare_step = b.step("compare", "Compare CFB reading against legacy JS and validate ABI contracts");
    compare_step.dependOn(&compare.step);
    const contracts = b.addSystemCommand(&.{ "node", "--test", "tests/cfb/contracts.test.mjs", "tests/cfb/adversarial.test.mjs", "tests/cfb/structured.test.mjs", "tests/cfb/exact.test.mjs", "tests/cfb/exceptions.test.mjs", "tests/cfb/writer.test.mjs" });
    contracts.step.dependOn(b.getInstallStep());
    compare_step.dependOn(&contracts.step);
    const mutations = b.addSystemCommand(&.{ "node", "tests/cfb/mutations.mjs" });
    mutations.step.dependOn(b.getInstallStep());
    const audit = b.step("audit", "Run regression contracts and deterministic malformed-input sweeps");
    audit.dependOn(&mutations.step);
    audit.dependOn(&run_tests.step);
    audit.dependOn(compare_step);
    const chart_fixture = b.addSystemCommand(&.{ "node", "tests/hwp5/chart-observed-fixture.mjs" });
    // Recheck the corpus and JS oracle on every invocation, not a stale
    // captured stdout result whose external read dependencies are invisible.
    chart_fixture.has_side_effects = true;
    chart_fixture.step.dependOn(b.getInstallStep());
    const chart_ownership_module = b.createModule(.{
        .root_source_file = b.path("tests/hwp5/chart-observed-ownership.zig"),
        .target = target,
        .optimize = optimize,
    });
    chart_ownership_module.addImport("hwpjs", core);
    chart_ownership_module.addImport("chart_fixture", b.createModule(.{
        .root_source_file = chart_fixture.captureStdOut(.{ .basename = "chart-fixture.zig" }),
        .target = target,
        .optimize = optimize,
    }));
    const chart_ownership = b.addRunArtifact(b.addTest(.{ .root_module = chart_ownership_module }));
    const chart_ownership_step = b.step("chart-ownership-audit", "Verify selected Contents ownership using a hash-pinned corpus fixture");
    chart_ownership_step.dependOn(&chart_ownership.step);
    const chart_fixture_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/chart-native-fixture-module.test.mjs" });
    chart_ownership_step.dependOn(&chart_fixture_tests.step);
    audit.dependOn(chart_ownership_step);
    const wmf_fixture = b.addSystemCommand(&.{ "node", "tests/hwp5/wmf-contents-fixture.mjs" });
    wmf_fixture.has_side_effects = true;
    wmf_fixture.step.dependOn(b.getInstallStep());
    const wmf_ownership_module = b.createModule(.{
        .root_source_file = b.path("tests/hwp5/wmf-contents-ownership.zig"),
        .target = target,
        .optimize = optimize,
    });
    wmf_ownership_module.addImport("hwpjs", core);
    wmf_ownership_module.addImport("wmf_fixture", b.createModule(.{
        .root_source_file = wmf_fixture.captureStdOut(.{ .basename = "wmf-fixture.zig" }),
        .target = target,
        .optimize = optimize,
    }));
    const wmf_ownership = b.addRunArtifact(b.addTest(.{ .root_module = wmf_ownership_module }));
    const wmf_ownership_step = b.step("wmf-contents-audit", "Verify the HWP OLE placeable WMF Contents header");
    wmf_ownership_step.dependOn(&wmf_ownership.step);
    audit.dependOn(wmf_ownership_step);
    const icc_registry_tests = b.addSystemCommand(&.{ "node", "--test", "tools/icc-registry/csv.test.mjs", "tools/icc-registry/download.test.mjs", "tools/icc-registry/snapshot.test.mjs", "tools/icc-registry/generate.test.mjs" });
    icc_registry_tests.step.dependOn(&icc_registry_check.step);
    const icc_registry_audit = b.step("icc-registry-audit", "Verify offline ICC registry snapshot and generation contracts");
    icc_registry_audit.dependOn(&icc_registry_tests.step);
    audit.dependOn(icc_registry_audit);

    const line_cache_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/line-cache-evidence.test.mjs", "tests/hwp5/line-cache-coordinate-evidence.test.mjs" });
    const line_cache_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/line-cache-survey.mjs" });
    line_cache_survey.step.dependOn(b.getInstallStep());
    const line_cache_audit = b.step("line-cache-audit", "Verify merged paragraph line-cache evidence and malformed-input tests");
    line_cache_audit.dependOn(&line_cache_tests.step);
    line_cache_audit.dependOn(&line_cache_survey.step);
    audit.dependOn(line_cache_audit);

    const preview_image_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/preview-image-evidence.test.mjs" });
    preview_image_tests.step.dependOn(b.getInstallStep());
    const preview_image_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/preview-image-survey.mjs" });
    preview_image_survey.step.dependOn(b.getInstallStep());
    const preview_image_audit = b.step("preview-image-audit", "Read-only PrvImage corpus evidence and adversarial survey tests");
    preview_image_audit.dependOn(&preview_image_tests.step);
    preview_image_audit.dependOn(&preview_image_survey.step);
    audit.dependOn(preview_image_audit);
    const doc_options_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/doc-options-evidence.test.mjs", "tests/hwp5/hwp-corpus-evidence.test.mjs" });
    doc_options_tests.step.dependOn(b.getInstallStep());
    const doc_options_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/doc-options-survey.mjs" });
    doc_options_survey.step.dependOn(b.getInstallStep());
    const doc_options_audit = b.step("doc-options-audit", "Read-only DocOptions corpus evidence and malformed snapshot tests");
    doc_options_audit.dependOn(&doc_options_tests.step);
    doc_options_audit.dependOn(&doc_options_survey.step);
    audit.dependOn(doc_options_audit);

    const history_xml_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/history-xml-query.test.mjs" });
    audit.dependOn(&history_xml_tests.step);
    const history_xml_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/history-xml-survey.mjs" });
    history_xml_survey.step.dependOn(b.getInstallStep());
    const history_xml_audit = b.step("history-xml-audit", "Read-only history XML evidence (requires xmllint; not a product XML parser)");
    history_xml_audit.dependOn(&history_xml_tests.step);
    history_xml_audit.dependOn(&history_xml_survey.step);

    const hwp_probe = b.addExecutable(.{
        .name = "hwp5-probe",
        .root_module = b.createModule(.{
            .root_source_file = b.path("tests/hwp5/probe.zig"),
            .target = wasm.root_module.resolved_target.?,
            .optimize = optimize,
        }),
    });
    hwp_probe.root_module.addImport("hwpjs", b.createModule(.{
        .root_source_file = b.path("src/root.zig"),
        .target = wasm.root_module.resolved_target.?,
        .optimize = optimize,
    }));
    hwp_probe.entry = .disabled;
    hwp_probe.step.dependOn(&icc_registry_check.step);
    hwp_probe.rdynamic = true;
    const install_hwp_probe = b.addInstallArtifact(hwp_probe, .{});
    const hwp_check = b.addSystemCommand(&.{ "node", "tests/hwp5/audit.mjs" });
    const drawing_evidence_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/drawing-section-evidence.test.mjs", "tests/hwp5/ole-paired-evidence.test.mjs" });
    hwp_check.step.dependOn(&drawing_evidence_tests.step);
    hwp_check.addArtifactArg(hwp_probe);
    hwp_check.step.dependOn(b.getInstallStep());
    b.step("hwp5-audit", "Verify HWP5 foundation in WASM against independent byte oracles").dependOn(&hwp_check.step);
    audit.dependOn(&hwp_check.step);

    const emf_corpus_tests = b.addSystemCommand(&.{ "node", "--test", "tests/hwp5/emf-corpus.test.mjs" });
    emf_corpus_tests.step.dependOn(b.getInstallStep());
    emf_corpus_tests.step.dependOn(&install_hwp_probe.step);
    const emf_corpus_survey = b.addSystemCommand(&.{ "node", "tests/hwp5/emf-corpus-survey.mjs" });
    emf_corpus_survey.addArtifactArg(wasm);
    emf_corpus_survey.addArtifactArg(hwp_probe);
    const emf_corpus_audit = b.step("emf-corpus-audit", "Extract HWP BinData and validate embedded EMF with record coverage evidence");
    emf_corpus_audit.dependOn(&emf_corpus_tests.step);
    emf_corpus_audit.dependOn(&emf_corpus_survey.step);
    audit.dependOn(emf_corpus_audit);
}
