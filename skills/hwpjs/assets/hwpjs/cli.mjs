#!/usr/bin/env node
import * as nodeFS from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, extname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
// \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __exportAll = (all, flags) => {
	let target = Object.setPrototypeOf({}, null);
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!(flags & 1)) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return flags & 2 ? target : Object.preventExtensions(target);
};
// src/batch-read.ts
const BATCH_READ_LIMITS = Object.freeze({
	maxInputs: 128,
	maxConcurrency: 2,
	defaultOutputBytes: 4194304,
	maxOutputBytes: 16777216,
	maxInputPathUnits: 4096,
	maxErrorDetailUnits: 256
});
const messages = Object.freeze({
	ReadFailed: "문서 읽기 작업에 실패했습니다.",
	InvalidReadResult: "읽기 콜백의 결과 형식이 올바르지 않습니다.",
	OutputBudgetExceeded: "문서 결과가 배치 출력 예산을 초과했습니다. 본문을 절단하지 않았습니다.",
	ResultHookFailed: "결과 전달 콜백에 실패했습니다. 이미 읽은 결과와 발생한 부작용은 취소되지 않습니다."
});
function argumentError(code, message) {
	return Object.assign(new TypeError(message), { code });
}
function detail(error) {
	try {
		const candidate = error !== null && (typeof error === "object" || typeof error === "function") ? Reflect.get(error, "message") : void 0;
		return (typeof candidate === "string" ? candidate : String(error)).slice(0, BATCH_READ_LIMITS.maxErrorDetailUnits).toWellFormed();
	} catch {
		return "오류의 상세 설명을 읽지 못했습니다.";
	}
}
function failure(phase, code, error) {
	return {
		phase,
		code,
		message: messages[code],
		...error === void 0 ? {} : { detail: detail(error) }
	};
}
function utf8Length(text, limit = Infinity) {
	let bytes = 0;
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		if (code < 128) bytes++;
		else if (code < 2048) bytes += 2;
		else if (code >= 55296 && code <= 56319) {
			bytes += 4;
			index++;
		} else bytes += 3;
		if (bytes > limit) return bytes;
	}
	return bytes;
}
const recordBytes = (record, limit = Infinity) => utf8Length(JSON.stringify(record), limit);
function errorRecord(index, inputPath, code, error, readStatus = "failure") {
	return {
		index,
		inputPath,
		status: "failure",
		readStatus,
		outputStatus: "failure",
		deliveryStatus: "not-requested",
		value: null,
		errors: [failure(code === "OutputBudgetExceeded" ? "output" : "read", code, error)]
	};
}
function copyRecord(record) {
	return {
		...record,
		value: record.value === null ? null : { ...record.value },
		errors: record.errors.map((error) => ({ ...error }))
	};
}
function validateReadResult(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const { format, sourceSha256, text } = value;
	if (format !== "hwp5" && format !== "hwpx" || typeof sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(sourceSha256) || typeof text !== "string" || !text.isWellFormed()) return null;
	return {
		format,
		sourceSha256,
		text
	};
}
function hasPathControl(text) {
	for (let index = 0; index < text.length; index++) {
		const code = text.charCodeAt(index);
		if (code < 32 || code === 127) return true;
	}
	return false;
}
function gate() {
	let release;
	return {
		promise: new Promise((resolve) => {
			release = resolve;
		}),
		release
	};
}
/**
* 명시된 경로를 기존 단일 읽기 콜백으로 처리하는 내부 결과 모델입니다.
* 문서 전체 JSON 변환 명령이나 Rust 변환기와의 출력 동치를 제공하지 않습니다.
* 경로 발견·정규화·입력 스냅샷·Native 원문 수명·무변경 읽기는 호스트의 readOne 책임입니다.
* 이 모듈은 파일시스템·Native·네트워크를 직접 호출하지 않습니다.
* 관리 비용은 입력과 결과 바이트에 비례하며 Native 파싱 비용은 포함하지 않습니다.
*/
async function readDocuments(options = {}) {
	if (options === null || typeof options !== "object" || Array.isArray(options)) throw argumentError("InvalidInputPaths", "입력 경로는 1개 이상 128개 이하의 배열이어야 합니다.");
	const { inputPaths, readOne, concurrency = 1, maxOutputBytes = BATCH_READ_LIMITS.defaultOutputBytes, onResult } = options ?? {};
	const inputCount = Array.isArray(inputPaths) ? inputPaths.length : 0;
	if (!Number.isInteger(inputCount) || inputCount < 1 || inputCount > BATCH_READ_LIMITS.maxInputs) throw argumentError("InvalidInputPaths", "입력 경로는 1개 이상 128개 이하의 배열이어야 합니다.");
	if (typeof readOne !== "function") throw argumentError("InvalidReadRunner", "단일 읽기 콜백이 필요합니다.");
	if (typeof concurrency !== "number" || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > BATCH_READ_LIMITS.maxConcurrency) throw argumentError("InvalidConcurrency", "동시 작업 수는 1 또는 2여야 합니다.");
	if (typeof maxOutputBytes !== "number" || !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > BATCH_READ_LIMITS.maxOutputBytes) throw argumentError("InvalidOutputBudget", "출력 예산은 1바이트 이상 16MiB 이하의 정수여야 합니다.");
	if (onResult !== void 0 && typeof onResult !== "function") throw argumentError("InvalidResultHook", "결과 전달 콜백은 함수여야 합니다.");
	const readRunner = readOne;
	const resultHook = onResult;
	const outputBudget = maxOutputBytes;
	const paths = [];
	const seen = /* @__PURE__ */ new Map();
	for (let index = 0; index < inputCount; index++) {
		const path = inputPaths[index];
		if (typeof path !== "string" || path.length < 1 || path.length > BATCH_READ_LIMITS.maxInputPathUnits || !path.isWellFormed() || hasPathControl(path)) throw argumentError("InvalidInputPath", "입력 경로는 제어 문자 없는 올바른 Unicode 문자열이어야 합니다.");
		if (seen.has(path)) throw argumentError("DuplicateInputPath", "중복된 입력 경로가 있습니다.");
		seen.set(path, index);
		paths.push(path);
	}
	const count = paths.length;
	const makeEnvelope = (results, summary) => ({
		schemaVersion: 1,
		status: "partial",
		results,
		summary,
		limits: {
			maxOutputBytes,
			concurrency
		},
		outputBytes: maxOutputBytes
	});
	const maximumSummary = {
		total: count,
		readSucceeded: count,
		readFailed: count,
		outputFailed: count,
		deliveryFailed: count,
		succeeded: count,
		failed: count
	};
	const worstDetail = "\0".repeat(BATCH_READ_LIMITS.maxErrorDetailUnits);
	const worstHook = {
		...failure("delivery", "ResultHookFailed"),
		detail: worstDetail
	};
	const reservations = paths.map((path, index) => {
		let maximum = 0;
		for (const code of [
			"ReadFailed",
			"InvalidReadResult",
			"OutputBudgetExceeded"
		]) {
			const row = errorRecord(index, path, code);
			row.errors[0].detail = worstDetail;
			if (onResult) row.errors.push(worstHook);
			maximum = Math.max(maximum, recordBytes(row));
		}
		return maximum;
	});
	let remaining = reservations.reduce((sum, size) => sum + size, 0);
	let used = recordBytes(makeEnvelope([], maximumSummary)) + count - 1;
	if (used + remaining > maxOutputBytes) throw argumentError("OutputBudgetTooSmall", "모든 입력의 실패 상태를 표시하기에도 출력 예산이 부족합니다.");
	const results = Array(count);
	const gates = Array.from({ length: count + 1 }, gate);
	gates[0].release();
	let nextIndex = 0;
	async function runOne(index) {
		let raw;
		try {
			raw = await readRunner({
				inputPath: paths[index],
				index
			});
		} catch (error) {
			return errorRecord(index, paths[index], "ReadFailed", error);
		}
		let value;
		try {
			value = validateReadResult(raw);
		} catch (error) {
			return errorRecord(index, paths[index], "InvalidReadResult", error);
		}
		if (!value) return errorRecord(index, paths[index], "InvalidReadResult");
		if (value.text.length > outputBudget) return errorRecord(index, paths[index], "OutputBudgetExceeded", void 0, "success");
		return {
			index,
			inputPath: paths[index],
			status: "success",
			readStatus: "success",
			outputStatus: "success",
			deliveryStatus: "not-requested",
			value,
			errors: []
		};
	}
	async function finish(index, record) {
		remaining -= reservations[index];
		const worst = copyRecord(record);
		if (resultHook) worst.errors.push(worstHook);
		if (used + remaining + recordBytes(worst, outputBudget) > outputBudget) record = errorRecord(index, paths[index], "OutputBudgetExceeded", void 0, record.readStatus);
		if (resultHook) {
			record.deliveryStatus = "pending";
			try {
				await resultHook(copyRecord(record));
				record.deliveryStatus = "success";
			} catch (error) {
				record.deliveryStatus = "failure";
				record.status = "failure";
				record.errors.push(failure("delivery", "ResultHookFailed", error));
			}
		}
		results[index] = record;
		used += recordBytes(record);
	}
	async function worker() {
		while (nextIndex < count) {
			const index = nextIndex++;
			const record = await runOne(index);
			await gates[index].promise;
			try {
				await finish(index, record);
			} finally {
				gates[index + 1].release();
			}
		}
	}
	const failures = (await Promise.allSettled(Array.from({ length: Math.min(concurrency, count) }, worker))).filter((row) => row.status === "rejected").map((row) => row.reason);
	if (failures.length) throw new AggregateError(failures, "배치 읽기 관리 중 오류가 발생했습니다. 시작한 작업은 모두 종료됐습니다.");
	const summary = {
		total: count,
		readSucceeded: 0,
		readFailed: 0,
		outputFailed: 0,
		deliveryFailed: 0,
		succeeded: 0,
		failed: 0
	};
	for (const row of results) {
		summary[row.readStatus === "success" ? "readSucceeded" : "readFailed"]++;
		if (row.outputStatus === "failure") summary.outputFailed++;
		if (row.deliveryStatus === "failure") summary.deliveryFailed++;
		summary[row.status === "success" ? "succeeded" : "failed"]++;
	}
	const result = makeEnvelope(results, summary);
	result.status = summary.failed === 0 ? "success" : summary.succeeded === 0 ? "failure" : "partial";
	result.outputBytes = 0;
	for (let pass = 0; pass < 4; pass++) {
		const size = recordBytes(result);
		if (size === result.outputBytes) break;
		result.outputBytes = size;
	}
	if (recordBytes(result) !== result.outputBytes || result.outputBytes > maxOutputBytes) throw new Error("배치 결과의 출력 예산 검증에 실패했습니다.");
	return result;
}
// src/object-reference.ts
function buildObjectReference(value) {
	if (!object$10(value)) throw new TypeError("InvalidObjectReferenceFields");
	const { sourceSha256, format: documentFormat, section, kind, node } = value;
	if (!identity({
		format: documentFormat,
		section,
		node
	}) || typeof sourceSha256 !== "string" || sourceSha256.length !== 64 || !SHA.test(sourceSha256) || typeof kind !== "string" || !KINDS.has(kind)) throw new TypeError("InvalidObjectReferenceFields");
	return `hwpjs-object:${sourceSha256}/${documentFormat}/s${section}/${kind}/${node}`;
}
function parseObjectReference(reference, expected = {}) {
	if (typeof reference !== "string" || reference.length > 128 || !object$10(expected)) throw new TypeError("InvalidObjectReference");
	const { sourceSha256: expectedSha256, format: expectedFormat } = expected;
	if (expectedSha256 !== void 0 && (typeof expectedSha256 !== "string" || expectedSha256.length !== 64 || !SHA.test(expectedSha256)) || expectedFormat !== void 0 && !format(expectedFormat)) throw new TypeError("InvalidObjectReferenceExpectation");
	const match = REFERENCE.exec(reference);
	if (!match || match[0] !== reference) throw new TypeError("InvalidObjectReference");
	const result = {
		sourceSha256: match[1],
		format: match[2],
		section: Number(match[3]),
		kind: match[4],
		node: Number(match[5])
	};
	if (!uint$27(result.section) || !uint$27(result.node)) throw new TypeError("InvalidObjectReference");
	if (expectedSha256 !== void 0 && expectedSha256 !== result.sourceSha256) throw new Error("StaleObjectReference");
	if (expectedFormat !== void 0 && expectedFormat !== result.format) throw new Error("ObjectReferenceFormatMismatch");
	return result;
}
function canonicalImageId(value) {
	if (!object$10(value)) throw new TypeError("InvalidImageIdentity");
	const { format: documentFormat, section, node } = value;
	if (!identity({
		format: documentFormat,
		section,
		node
	})) throw new TypeError("InvalidImageIdentity");
	return `${documentFormat}:s${section}:i${node}`;
}
var KINDS, SHA, REFERENCE, object$10, uint$27, format, identity;
var init_object_reference = __esmMin((() => {
	KINDS = /* @__PURE__ */ new Set([
		"image",
		"table",
		"chart",
		"equation",
		"drawing",
		"ole",
		"unknown"
	]);
	SHA = /^[a-f0-9]{64}$/u;
	REFERENCE = /^hwpjs-object:([a-f0-9]{64})\/(hwp5|hwpx)\/s(0|[1-9]\d*)\/(image|table|chart|equation|drawing|ole|unknown)\/(0|[1-9]\d*)$/u;
	object$10 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	uint$27 = (value) => typeof value === "number" && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 4294967295;
	format = (value) => value === "hwp5" || value === "hwpx";
	identity = (value) => object$10(value) && format(value.format) && uint$27(value.section) && uint$27(value.node);
}));
// src/native-target.ts
init_object_reference();
function parseNativeTarget(value) {
	if (typeof value !== "string" || value.length > 32) throw new TypeError("InvalidTarget");
	const match = /^s(0|[1-9]\d*):p(0|[1-9]\d*)$/u.exec(value);
	if (!match) throw new TypeError("InvalidTarget");
	const section = Number(match[1]), paragraph = Number(match[2]);
	if (![section, paragraph].every((n) => Number.isSafeInteger(n) && n <= 4294967295)) throw new RangeError("InvalidTarget");
	return Object.freeze({
		section,
		paragraph
	});
}
// src/extended-arguments.ts
const EXTENDED_OPTIONS = Object.freeze({
	apply: [
		"patch",
		"operations",
		"expect-sha256",
		"output",
		"wasm",
		"allow-stale-layout"
	],
	create: [
		"format",
		"output",
		"text-file",
		"wasm",
		"allow-stale-layout"
	],
	convert: [
		"to",
		"output",
		"expect-sha256",
		"loss-policy",
		"wasm",
		"allow-stale-layout"
	],
	ocr: [
		"ref",
		"provider",
		"languages",
		"executable",
		"format",
		"expect-sha256",
		"wasm"
	],
	paragraph: [
		"target",
		"format",
		"expect-sha256",
		"wasm"
	]
});
const EXTENDED_USAGE = `  hwpjs apply INPUT (--patch FILE | --operations JSON) --expect-sha256 SHA256 --output OUTPUT [--allow-stale-layout] [--wasm PATH]
  hwpjs create --format hwp5|hwpx --output OUTPUT [--text-file FILE] [--allow-stale-layout] [--wasm PATH]
  hwpjs convert INPUT --to hwp5|hwpx --output OUTPUT [--loss-policy reject|text-only] [--expect-sha256 SHA256] [--allow-stale-layout] [--wasm PATH]
  hwpjs ocr INPUT [--ref IMAGE_REFERENCE] [--provider tesseract|vision] [--languages kor+eng] [--executable PATH] [--format text|markdown] [--wasm PATH]
  hwpjs paragraph INPUT --target s0:p3 [--expect-sha256 SHA256] [--format text|markdown] [--wasm PATH]`;
function interpretExtendedArguments(command, options, positional, fail) {
	const wasm = options.get("wasm");
	const common = wasm === void 0 ? {} : { wasm };
	const required = (name, code) => {
		const value = options.get(name);
		if (!value || value === "-") return fail(code);
		return value;
	};
	const outputFormat = () => {
		const value = options.get("format") ?? "text";
		if (value !== "text" && value !== "markdown") return fail("InvalidReadFormat");
		return value;
	};
	const format = (name) => {
		const value = options.get(name);
		if (value !== "hwp5" && value !== "hwpx") return fail("InvalidDocumentFormat");
		return value;
	};
	const save = () => ({
		output: required("output", "ExpectedOutputFile"),
		allowStaleLayout: options.has("allow-stale-layout")
	});
	if (command === "create") {
		if (positional.length) return fail("UnexpectedInputFile");
		return Object.freeze({
			...common,
			...save(),
			command,
			format: format("format"),
			...options.has("text-file") ? { textFile: required("text-file", "InvalidTextFile") } : {}
		});
	}
	if (positional.length !== 1 || !positional[0] || positional[0] === "-") return fail("ExpectedInputFile");
	const input = positional[0];
	const expected = options.get("expect-sha256");
	if (expected !== void 0 && !/^[a-f0-9]{64}$/iu.test(expected)) return fail("InvalidExpectedSHA256");
	const source = {
		...common,
		input,
		...expected === void 0 ? {} : { expectSha256: expected.toLowerCase() }
	};
	if (command === "apply") {
		if (options.has("patch") === options.has("operations")) return fail("ExpectedOneOperationSource");
		if (expected === void 0) return fail("MissingRequiredOption:expect-sha256");
		return Object.freeze({
			...source,
			...save(),
			command,
			expectSha256: expected.toLowerCase(),
			...options.has("patch") ? { patch: required("patch", "ExpectedPatchFile") } : { inlineOperations: required("operations", "ExpectedOperations") }
		});
	}
	if (command === "convert") {
		const lossPolicy = options.get("loss-policy") ?? "reject";
		if (lossPolicy !== "reject" && lossPolicy !== "text-only") return fail("InvalidConversionLossPolicy");
		return Object.freeze({
			...source,
			...save(),
			command,
			to: format("to"),
			lossPolicy
		});
	}
	if (command === "paragraph") {
		let target;
		try {
			target = parseNativeTarget(options.get("target"));
		} catch {
			return fail("InvalidTarget");
		}
		return Object.freeze({
			...source,
			command,
			target,
			format: outputFormat()
		});
	}
	const provider = options.get("provider") ?? "tesseract";
	if (provider !== "tesseract" && provider !== "vision") return fail("InvalidOcrProvider");
	const languages = options.get("languages") ?? "kor+eng";
	const requested = languages.split("+");
	if (languages.length > 128 || !/^[a-zA-Z0-9_]+(?:\+[a-zA-Z0-9_]+)*$/u.test(languages) || requested.length > 8 || new Set(requested).size !== requested.length) return fail("InvalidOcrLanguages");
	const executable = options.has("executable") ? required("executable", "InvalidOcrExecutable") : void 0;
	if (provider === "vision" && executable !== void 0) return fail("VisionExecutableOverrideUnsupported");
	const reference = options.get("ref");
	let expectSha256 = source.expectSha256;
	if (reference !== void 0) {
		if (expected !== void 0) return fail("ConflictingImageReference");
		let parsed;
		try {
			parsed = parseObjectReference(reference);
		} catch {
			return fail("InvalidObjectReference");
		}
		if (parsed.kind !== "image") return fail("ExpectedImageReference");
		expectSha256 = parsed.sourceSha256;
	}
	return Object.freeze({
		...source,
		command,
		format: outputFormat(),
		provider,
		languages,
		...executable === void 0 ? {} : { executable },
		...reference === void 0 ? {} : { reference },
		...expectSha256 === void 0 ? {} : { expectSha256 }
	});
}
// src/arguments.ts
init_object_reference();
const USAGE = `Usage:
  hwpjs read INPUT [--format text|markdown] [--view content|structure] [--wasm PATH]
  hwpjs read-many INPUT... [--format text|markdown] [--view content|structure] [--concurrency 1|2] [--max-output-bytes N] [--wasm PATH]
  hwpjs edit INPUT --target s0:p3 --replace OLD --with NEW --expect-sha256 SHA256 --output OUTPUT [--allow-stale-layout] [--wasm PATH]
  hwpjs info INPUT [--expect-sha256 SHA256] [--wasm PATH]
  hwpjs images INPUT [--expect-sha256 SHA256] [--wasm PATH]
  hwpjs object INPUT --ref REFERENCE [--format text|markdown] [--wasm PATH]
  hwpjs extract-images INPUT --output NEWDIR [--ref REFERENCE | --id ID --expect-sha256 SHA256] [--wasm PATH]
${EXTENDED_USAGE}
  hwpjs --help

Read defaults to text. 기본 보기는 문서 내용(content)입니다.
편집용 Native ID와 SHA는 read --view structure로 확인합니다.
Use --with '' to delete. Use --option=VALUE when VALUE starts with --.
extract-images --output is a NEW DIRECTORY, never a single image file.
Selecting --id requires the SHA from images; all images use one opened snapshot.
본문의 개체 참조는 object --ref로 조회합니다. 이미지 참조는 extract-images --ref로 추출할 수 있습니다.
참조는 네트워크 주소가 아닙니다. --ref는 --id/--expect-sha256와 함께 사용할 수 없습니다.
Output must be new; existing files are never overwritten.
read-many는 명시 파일 1~128개만 읽습니다. 기본 동시성은 1, 최대 2이며 일부 실패도 보고합니다.
출력 예산은 기본 4MiB, 최대 16MiB입니다. 폴더 탐색·일괄 편집·HTML·문서 JSON 출력은 제공하지 않습니다.
`;
var ArgumentsError = class extends Error {
	code;
	constructor(code) {
		super(code);
		this.name = "CLIArgumentsError";
		this.code = code;
	}
};
const fail$2 = (code) => {
	throw new ArgumentsError(code);
};
const string$1 = (value) => typeof value === "string" && value.isWellFormed();
const reference = (value) => {
	try {
		return parseObjectReference(value);
	} catch {
		return fail$2("InvalidObjectReference");
	}
};
function parseArguments(argv) {
	if (!Array.isArray(argv)) return fail$2("InvalidArguments");
	const argc = Array.isArray(argv) ? argv.length : -1;
	if (!Number.isInteger(argc) || argc < 0 || argc > 256) fail$2("InvalidArguments");
	const captured = [];
	for (let index = 0; index < argc; index++) {
		const value = argv[index];
		if (!string$1(value)) fail$2("InvalidArguments");
		captured.push(value);
	}
	if (captured.length === 1 && captured[0] === "--help") return Object.freeze({ command: "help" });
	const command = captured[0];
	if (![
		"read",
		"read-many",
		"edit",
		"info",
		"images",
		"extract-images",
		"object"
	].includes(command) && !Object.hasOwn(EXTENDED_OPTIONS, command)) fail$2("UnknownCommand");
	if (captured.length === 2 && captured[1] === "--help") return Object.freeze({ command: "help" });
	const definitions = {
		read: [
			"format",
			"view",
			"wasm"
		],
		"read-many": [
			"format",
			"view",
			"wasm",
			"concurrency",
			"max-output-bytes"
		],
		edit: [
			"target",
			"replace",
			"with",
			"expect-sha256",
			"output",
			"wasm",
			"allow-stale-layout"
		],
		info: ["wasm", "expect-sha256"],
		images: ["wasm", "expect-sha256"],
		"extract-images": [
			"wasm",
			"expect-sha256",
			"output",
			"id",
			"ref"
		],
		object: [
			"wasm",
			"ref",
			"format"
		],
		...EXTENDED_OPTIONS
	};
	const allowed = new Set(definitions[command]);
	const options = /* @__PURE__ */ new Map(), positional = [];
	let literal = false;
	for (let i = 1; i < captured.length; i++) {
		const arg = captured[i];
		if (!literal && arg === "--") {
			literal = true;
			continue;
		}
		if (!literal && arg.startsWith("-")) {
			const match = /^--([a-z][a-z0-9-]*)(?:=(.*))?$/s.exec(arg);
			if (!match || !allowed.has(match[1])) return fail$2("UnknownOption");
			const name = match[1];
			if (options.has(name)) fail$2("DuplicateOption");
			if (name === "allow-stale-layout") {
				if (match[2] !== void 0) fail$2("UnexpectedOptionValue");
				options.set(name, "true");
				continue;
			}
			const value = match[2] ?? captured[++i];
			if (value === void 0 || match[2] === void 0 && value.startsWith("--")) fail$2("MissingOptionValue");
			options.set(name, value);
		} else positional.push(arg);
	}
	const wasm = options.get("wasm");
	if (wasm !== void 0 && !wasm) fail$2("InvalidWasmPath");
	if (Object.hasOwn(EXTENDED_OPTIONS, command)) return interpretExtendedArguments(command, options, positional, fail$2);
	if (command === "read-many") {
		if (positional.length < 1 || positional.length > BATCH_READ_LIMITS.maxInputs) fail$2("InvalidInputPaths");
		const paths = /* @__PURE__ */ new Map();
		for (const path of positional) {
			if (!path || path === "-" || path.length > BATCH_READ_LIMITS.maxInputPathUnits) fail$2("InvalidInputPath");
			for (let at = 0; at < path.length; at++) if (path.charCodeAt(at) < 32 || path.charCodeAt(at) === 127) fail$2("InvalidInputPath");
			if (paths.has(path)) fail$2("DuplicateInputPath");
			paths.set(path, true);
		}
		const view = options.get("view") ?? "content";
		if (view !== "content" && view !== "structure") return fail$2("InvalidReadView");
		const format = options.get("format") ?? "text";
		if (format !== "text" && format !== "markdown") return fail$2("InvalidReadFormat");
		const concurrency = options.get("concurrency") ?? "1";
		if (!/^[12]$/.test(concurrency)) fail$2("InvalidConcurrency");
		const budget = options.get("max-output-bytes") ?? String(BATCH_READ_LIMITS.defaultOutputBytes);
		if (!/^[1-9]\d*$/.test(budget) || !Number.isSafeInteger(Number(budget)) || Number(budget) > BATCH_READ_LIMITS.maxOutputBytes) fail$2("InvalidOutputBudget");
		return Object.freeze({
			command,
			inputPaths: Object.freeze([...positional]),
			format,
			view,
			concurrency: Number(concurrency),
			maxOutputBytes: Number(budget),
			...wasm === void 0 ? {} : { wasm }
		});
	}
	if (positional.length !== 1 || !positional[0] || positional[0] === "-") fail$2("ExpectedInputFile");
	const input = positional[0];
	if (command === "object") {
		const ref = options.get("ref");
		if (ref === void 0) return fail$2("InvalidObjectReference");
		const parsed = reference(ref);
		const format = options.get("format") ?? "text";
		if (format !== "text" && format !== "markdown") return fail$2("InvalidReadFormat");
		return Object.freeze({
			command,
			input,
			reference: ref,
			format,
			expectSha256: parsed.sourceSha256,
			...wasm === void 0 ? {} : { wasm }
		});
	}
	if (command === "info" || command === "images" || command === "extract-images") {
		let expected = options.get("expect-sha256");
		if (expected !== void 0 && !/^[0-9a-f]{64}$/i.test(expected)) fail$2("InvalidExpectedSHA256");
		let id = options.get("id");
		if (id !== void 0 && (!id || id.length > 128)) fail$2("InvalidImageID");
		if (id !== void 0 && expected === void 0) fail$2("ImageIDRequiresSHA256");
		const ref = options.get("ref");
		if (ref !== void 0) {
			if (options.has("id") || options.has("expect-sha256")) fail$2("ConflictingImageReference");
			const parsed = reference(ref);
			if (parsed.kind !== "image") fail$2("ExpectedImageReference");
			expected = parsed.sourceSha256;
			id = canonicalImageId(parsed);
		}
		const output = options.get("output");
		const base = {
			input,
			...expected === void 0 ? {} : { expectSha256: expected.toLowerCase() },
			...wasm === void 0 ? {} : { wasm },
			...id === void 0 ? {} : { id },
			...output === void 0 ? {} : { output },
			...ref === void 0 ? {} : { reference: ref }
		};
		if (command === "extract-images") {
			if (!output || output === "-") return fail$2("ExpectedOutputDirectory");
			return Object.freeze({
				...base,
				command,
				output
			});
		}
		return Object.freeze({
			...base,
			command
		});
	}
	if (command === "read") {
		const view = options.get("view") ?? "content";
		if (view !== "content" && view !== "structure") return fail$2("InvalidReadView");
		const format = options.get("format") ?? "text";
		if (format !== "text" && format !== "markdown") return fail$2("InvalidReadFormat");
		return Object.freeze({
			command,
			input,
			format,
			view,
			...wasm === void 0 ? {} : { wasm }
		});
	}
	if (command !== "edit") return fail$2("UnknownCommand");
	for (const key of [
		"target",
		"replace",
		"with",
		"expect-sha256",
		"output"
	]) if (!options.has(key)) fail$2("MissingRequiredOption:" + key);
	let target;
	try {
		target = parseNativeTarget(options.get("target"));
	} catch {
		return fail$2("InvalidTarget");
	}
	const replacement = options.get("replace");
	if (!replacement) return fail$2("EmptySearch");
	const withText = options.get("with");
	if (withText === void 0) return fail$2("MissingRequiredOption:with");
	const expected = options.get("expect-sha256");
	if (expected === void 0 || !/^[0-9a-f]{64}$/i.test(expected)) return fail$2("InvalidExpectedSHA256");
	const output = options.get("output");
	if (!output || output === "-") return fail$2("ExpectedOutputFile");
	return Object.freeze({
		command,
		input,
		target,
		replace: replacement,
		with: withText,
		output,
		expectSha256: expected.toLowerCase(),
		allowStaleLayout: options.has("allow-stale-layout"),
		...wasm === void 0 ? {} : { wasm }
	});
}
// src/files.ts
var files_exports = /* @__PURE__ */ __exportAll({
	MAX_DOCUMENT_BYTES: () => MAX_DOCUMENT_BYTES$1,
	MAX_WASM_BYTES: () => MAX_WASM_BYTES$1,
	assertImageFormat: () => assertImageFormat,
	assertNewDocumentOutput: () => assertNewDocumentOutput,
	assertNewOutput: () => assertNewOutput,
	assertOutputFormat: () => assertOutputFormat,
	createFiles: () => createFiles,
	createImageDirectory: () => createImageDirectory,
	publishNewOutput: () => publishNewOutput,
	readInputSnapshot: () => readInputSnapshot,
	resolveWasmPath: () => resolveWasmPath
});
/** Inject filesystem operations only for focused I/O failure tests. No engine code lives here. */
function createFiles({ fs = nodeFS, cwd = () => process.cwd(), random = () => randomBytes(12).toString("hex") } = {}) {
	const targets = /* @__PURE__ */ new WeakMap();
	const directories = /* @__PURE__ */ new WeakMap();
	async function readInputSnapshot(path, { maxBytes = MAX_DOCUMENT_BYTES$1 } = {}) {
		validPath(path);
		if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 67108864) throw error("InvalidFileByteLimit");
		const absolute = resolve(cwd(), path);
		const handle = await fs.open(absolute, constants.O_RDONLY | constants.O_NONBLOCK);
		try {
			const before = await handle.stat({ bigint: true });
			if (!before.isFile()) throw error("InputNotRegularFile");
			if (before.size > BigInt(maxBytes)) throw error("FileTooLarge");
			const size = Number(before.size), bytes = new Uint8Array(size);
			let at = 0;
			while (at < size) {
				const { bytesRead } = await handle.read(bytes, at, size - at, at);
				if (!bytesRead) throw error("InputChangedDuringRead");
				at += bytesRead;
			}
			const extra = await handle.read(/* @__PURE__ */ new Uint8Array(1), 0, 1, size);
			const after = await handle.stat({ bigint: true });
			if (extra.bytesRead !== 0 || [
				"dev",
				"ino",
				"size",
				"mtimeNs",
				"ctimeNs"
			].some((key) => before[key] !== after[key])) throw error("InputChangedDuringRead");
			return Object.freeze({
				path: absolute,
				bytes,
				sha256: sha(bytes),
				identity: Object.freeze({
					dev: String(before.dev),
					ino: String(before.ino)
				})
			});
		} finally {
			await handle.close();
		}
	}
	function resolveWasmPath(explicit, mainModuleURL) {
		if (explicit !== void 0) {
			validPath(explicit);
			return resolve(cwd(), explicit);
		}
		if (!mainModuleURL) throw error("ExplicitWasmRequired");
		let url;
		try {
			url = new URL("./hwpjs.wasm", mainModuleURL);
		} catch (cause) {
			throw error("InvalidEntryModuleURL", cause);
		}
		if (url.protocol !== "file:") throw error("InvalidEntryModuleURL");
		return fileURLToPath(url);
	}
	async function vacant(path, input) {
		if (input && path === input.path) throw error("SourceOutputCollision");
		let stat;
		try {
			stat = await fs.lstat(path);
		} catch (cause) {
			if (errorCode$2(cause) === "ENOENT") return;
			throw cause;
		}
		throw error(sameIdentity(stat, input?.identity) ? "SourceOutputCollision" : "OutputExists");
	}
	const imageExtensions = /* @__PURE__ */ new Set([
		".bin",
		".png",
		".jpg",
		".jpeg",
		".gif",
		".bmp",
		".webp",
		".tif",
		".tiff"
	]);
	async function imageParent(path) {
		const parent = dirname(path), root = parse(parent).root;
		let cursor = root;
		for (const part of parent.slice(root.length).split("/").filter(Boolean)) {
			cursor = join(cursor, part);
			const stat = await fs.lstat(cursor, { bigint: true });
			if (stat.isSymbolicLink()) throw error("OutputSymlink");
			if (!stat.isDirectory()) throw error("OutputParentNotDirectory");
		}
		const stat = await fs.lstat(parent, { bigint: true });
		return {
			parent,
			identity: {
				dev: String(stat.dev),
				ino: String(stat.ino)
			}
		};
	}
	async function verifyImageParent(record) {
		const current = await imageParent(record.path);
		if (!sameIdentity(await fs.lstat(current.parent, { bigint: true }), record.parentIdentity)) throw error("OutputParentChanged");
	}
	async function createImageDirectory({ input, outputPath }) {
		validPath(outputPath);
		const path = resolve(cwd(), outputPath);
		await imageParent(path);
		await vacant(path, input);
		await fs.mkdir(path, { mode: 448 });
		try {
			const stat = await fs.lstat(path, { bigint: true });
			if (!stat.isDirectory() || stat.isSymbolicLink()) throw error("OutputParentChanged");
			const directory = Object.freeze({ path });
			directories.set(directory, {
				dev: String(stat.dev),
				ino: String(stat.ino)
			});
			return directory;
		} catch (cause) {
			const failure = error(errorCode$2(cause), cause);
			failure.createdDirectory = path;
			throw failure;
		}
	}
	async function prepareOutput({ input, outputPath, kind = "document", directory }) {
		validPath(outputPath);
		if (!["document", "image"].includes(kind)) throw error("InvalidOutputKind");
		const absolute = resolve(cwd(), outputPath);
		const image = kind === "image" ? await imageParent(absolute) : null;
		if (directory !== void 0) {
			const identity = directories.get(directory);
			if (kind !== "image" || !identity || dirname(absolute) !== directory.path || !sameIdentity(await fs.lstat(directory.path, { bigint: true }), identity)) throw error("OutputParentChanged");
		}
		const parent = image?.parent ?? await fs.realpath(dirname(absolute));
		if (!(await fs.stat(parent)).isDirectory()) throw error("OutputParentNotDirectory");
		const path = join(parent, basename(absolute));
		if (!(kind === "image" ? imageExtensions : /* @__PURE__ */ new Set([".hwp", ".hwpx"])).has(extname(path).toLowerCase())) throw error("InvalidOutputExtension");
		await vacant(path, input);
		const target = Object.freeze({ path });
		targets.set(target, {
			path,
			parent,
			input,
			used: false,
			kind,
			parentIdentity: image?.identity
		});
		return target;
	}
	async function assertNewOutput(options) {
		if (!options?.input || typeof options.input.path !== "string") throw error("InvalidInputSnapshot");
		return prepareOutput(options);
	}
	async function assertNewDocumentOutput({ outputPath }) {
		return prepareOutput({
			outputPath,
			kind: "document"
		});
	}
	function assertImageFormat(target, extension) {
		const record = targets.get(target);
		if (!record || record.used || record.kind !== "image") throw error("InvalidOutputTarget");
		if (!imageExtensions.has(extension)) throw error("InvalidImageExtension");
		if (extname(record.path).toLowerCase() !== extension) throw error("OutputImageExtensionMismatch");
		record.format = "image";
	}
	function assertOutputFormat(target, format) {
		const record = targets.get(target);
		if (!record || record.used || record.kind !== "document") throw error("InvalidOutputTarget");
		if (!["hwp5", "hwpx"].includes(format)) throw error("InvalidEngineFormat");
		if (extname(record.path).toLowerCase() !== (format === "hwp5" ? ".hwp" : ".hwpx")) throw error("OutputFormatMismatch");
		record.format = format;
	}
	async function publishNewOutput({ target, bytes }) {
		const record = targets.get(target);
		if (!record || record.used || !record.format) throw error("InvalidOutputTarget");
		if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 67108864 || typeof SharedArrayBuffer !== "undefined" && bytes.buffer instanceof SharedArrayBuffer) throw error("InvalidOutputBytes");
		const owned = Uint8Array.from(bytes), digest = sha(owned);
		record.used = true;
		let temporary, handle, published = false, primary;
		const warnings = [];
		const warn = (phase, cause) => {
			warnings.push(Object.freeze({
				phase,
				code: errorCode$2(cause),
				...temporary ? { temporaryPath: temporary } : {}
			}));
		};
		try {
			if (record.kind === "image") await verifyImageParent(record);
			await vacant(record.path, record.input);
			for (let attempt = 0; attempt < 8; attempt++) {
				const nonce = random();
				if (typeof nonce !== "string" || !/^[a-f0-9]{24}$/.test(nonce)) throw error("InvalidTemporaryName");
				const candidate = join(record.parent, ".hwpjs-" + nonce + ".tmp");
				try {
					handle = await fs.open(candidate, "wx", 384);
					temporary = candidate;
					break;
				} catch (cause) {
					if (errorCode$2(cause) !== "EEXIST") throw cause;
				}
			}
			if (!handle || temporary === void 0) throw error("TemporaryFileCollision");
			await handle.writeFile(owned);
			await handle.sync();
			await handle.close();
			handle = void 0;
			if (record.kind === "image") await verifyImageParent(record);
			await fs.link(temporary, record.path);
			published = true;
		} catch (cause) {
			primary = cause;
		} finally {
			if (handle) try {
				await handle.close();
			} catch (cause) {
				warn("close-temporary", cause);
			}
			if (temporary) try {
				await fs.unlink(temporary);
			} catch (cause) {
				warn("unlink-temporary", cause);
			}
		}
		if (!published) {
			if (warnings.length) {
				const failure = error(errorCode$2(primary), primary);
				failure.cleanupWarnings = Object.freeze(warnings);
				throw failure;
			}
			throw primary;
		}
		let directory;
		try {
			directory = await fs.open(record.parent, "r");
			await directory.sync();
		} catch (cause) {
			warn("sync-directory", cause);
		} finally {
			if (directory) try {
				await directory.close();
			} catch (cause) {
				warn("close-directory", cause);
			}
		}
		return Object.freeze({
			published: true,
			path: record.path,
			sha256: digest,
			bytes: owned.length,
			warnings: Object.freeze(warnings)
		});
	}
	return Object.freeze({
		readInputSnapshot,
		resolveWasmPath,
		assertNewOutput,
		assertNewDocumentOutput,
		assertOutputFormat,
		assertImageFormat,
		createImageDirectory,
		publishNewOutput
	});
}
var errorCode$2, MAX_DOCUMENT_BYTES$1, MAX_WASM_BYTES$1, sha, error, validPath, sameIdentity, readInputSnapshot, resolveWasmPath, assertNewOutput, assertNewDocumentOutput, assertOutputFormat, assertImageFormat, createImageDirectory, publishNewOutput;
var init_files = __esmMin((() => {
	errorCode$2 = (cause) => {
		if (cause !== null && typeof cause === "object") {
			const fields = cause;
			return String(fields.code ?? fields.message ?? cause);
		}
		return String(cause);
	};
	MAX_DOCUMENT_BYTES$1 = 67108864;
	MAX_WASM_BYTES$1 = 33554432;
	sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
	error = (code, cause) => Object.assign(new Error(code, cause ? { cause } : {}), { code });
	validPath = (value) => {
		if (typeof value !== "string" || !value || value.includes("\0")) throw error("InvalidFilePath");
	};
	sameIdentity = (stat, identity) => identity !== void 0 && String(stat.dev) === identity.dev && String(stat.ino) === identity.ino;
	({readInputSnapshot, resolveWasmPath, assertNewOutput, assertNewDocumentOutput, assertOutputFormat, assertImageFormat, createImageDirectory, publishNewOutput} = createFiles());
}));
// src/host-output.ts
function observationLines(value, prefix = "") {
	const lines = [];
	let size = 0;
	function visit(item, key, depth) {
		if (depth > 12 || lines.length >= 5e4) throw Error("ObservationOutputLimit");
		if (item !== null && typeof item === "object") for (const [name, child] of Object.entries(item)) visit(child, key ? `${key}.${name}` : name, depth + 1);
		else {
			const text = line(key, item === null ? "unknown" : item);
			size += text.length;
			if (size > 4194304) throw Error("ObservationOutputLimit");
			lines.push(text);
		}
	}
	visit(value, prefix, 0);
	return lines.join("");
}
var scalar$1, line, warningLines;
var init_host_output = __esmMin((() => {
	scalar$1 = (value) => Array.from(String(value), (character) => {
		const code = character.charCodeAt(0);
		return code <= 31 || code === 127 ? "\\u" + code.toString(16).padStart(4, "0") : character;
	}).join("");
	line = (key, value) => `${key}: ${scalar$1(value)}\n`;
	warningLines = (warnings = []) => warnings.map((warning) => line("warning", typeof warning === "string" ? warning : Object.entries(warning).map(([key, value]) => `${key}=${scalar$1(value)}`).join(" "))).join("");
}));
// src/render-escape.ts
function createDisplayEscaper(options) {
	if (options === null || typeof options !== "object" || Array.isArray(options) || !("format" in options) || !FORMATS.includes(options.format)) throw new TypeError("InvalidRenderFormat");
	const record = options;
	const view = record.view === void 0 ? "content" : record.view;
	if (view !== "content" && view !== "structure") throw new TypeError("InvalidRenderView");
	const markdown = options.format === "markdown";
	return (text) => {
		if (typeof text !== "string") throw new TypeError("InvalidRenderString");
		const display = text.replace(CONTROL, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
		if (!markdown) return display;
		if (view === "structure") return display.replace(MARKDOWN, "\\$&");
		return display.replace(/&/gu, "&amp;").replace(CONTENT_MARKDOWN, "\\$&").replace(/^ {4}/u, "&#32;   ").replace(/^( {0,3})(#{1,6}(?=\s|$)|[-+](?=\s|$)|\d{1,9}[.)](?=\s|$)|-{3,}(?=\s|$))/u, (_, indent, token) => indent + token.replace(/[#+.\-)]/gu, "\\$&"));
	};
}
var CONTROL, MARKDOWN, FORMATS, CONTENT_MARKDOWN;
var init_render_escape = __esmMin((() => {
	CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ud800-\udfff]/gu;
	MARKDOWN = /[\\`*_{}[\]()#+.!|<>~-]/gu;
	FORMATS = ["text", "markdown"];
	CONTENT_MARKDOWN = /[\\`*_[\]<>|~]/gu;
}));
// src/read-operation.ts
init_files();
init_host_output();
init_render_escape();
const record$8 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const MAX_INPUT_BYTES$2 = 67108864;
/** 단일·배치 읽기가 공유하는 스냅샷 → 기존 엔진 → 기존 표시 경로입니다.
* 파일 호스트만 주입하며 새 파서·편집 모델·Native 수명 관리자를 만들지 않습니다.
*/
async function readDocumentOperation(options, { files, engine, renderDocument, loadWasm }) {
	if (!record$8(options)) throw Error("InvalidReadFormat");
	const { inputPath, inputSnapshot, wasm, format = "text", view = "content" } = options;
	if (format !== "text" && format !== "markdown") throw Error("InvalidReadFormat");
	if (view !== "content" && view !== "structure") throw Error("InvalidReadView");
	const loadSnapshot = async () => {
		if (typeof inputPath !== "string") throw Error("InvalidInputPath");
		return files.readInputSnapshot(inputPath, { maxBytes: MAX_INPUT_BYTES$2 });
	};
	const input = inputSnapshot ?? await loadSnapshot();
	if (!record$8(input) || !(input.bytes instanceof Uint8Array) || input.bytes.length < 1 || input.bytes.length > MAX_INPUT_BYTES$2 || typeof input.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.sha256 ?? "")) throw Error("InvalidInputSnapshot");
	const binary = wasm ?? await loadWasm();
	if (!(binary instanceof Uint8Array)) throw Error("InvalidWasmBytes");
	const result = await engine.read({
		bytes: input.bytes,
		wasm: binary
	});
	if (!record$8(result) || result.format !== "hwp5" && result.format !== "hwpx") throw Error("InvalidEngineFormat");
	if (!record$8(result.model) || result.model.version !== 1 || result.model.format !== result.format || result.model.sourceSha256 !== input.sha256) throw Error("InvalidEngineModel");
	const text = await renderDocument(result.model, {
		format,
		view
	});
	if (typeof text !== "string" || !text.isWellFormed()) throw Error("InvalidRenderedDocument");
	return {
		format: result.format,
		sourceSha256: input.sha256,
		text
	};
}
/** CLI와 웹 실습이 공유하는 단일 읽기 응답입니다. 원문으로 대체하지 않습니다. */
function renderReadResponse(result, options = {}) {
	if (!record$8(options)) throw Error("InvalidReadView");
	const { view = "content" } = options;
	if (!record$8(result)) throw Error("InvalidReadResult");
	const { format, sourceSha256, text } = result;
	if (format !== "hwp5" && format !== "hwpx") throw Error("InvalidEngineFormat");
	if (typeof sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(sourceSha256)) throw Error("InvalidReadSourceSHA256");
	if (view !== "content" && view !== "structure") throw Error("InvalidReadView");
	if (typeof text !== "string" || !text.isWellFormed()) throw Error("InvalidRenderedDocument");
	if (view === "content") return text;
	return `format: ${format}\ndocumentSHA256: ${sourceSha256}\n${text}${text.endsWith("\n") ? "" : "\n"}`;
}
const metadataEscape = createDisplayEscaper({
	format: "text",
	view: "structure"
});
const scalar = (value) => metadataEscape(String(value));
/** 내부 배치 모델은 문서 JSON으로 노출하지 않고 읽기용 텍스트/Markdown으로 보고합니다. */
function renderBatchReadReport(batch, { format = "text", view = "content", maxOutputBytes }) {
	if (format !== "text" && format !== "markdown") throw Error("InvalidReadFormat");
	if (view !== "content" && view !== "structure") throw Error("InvalidReadView");
	const indent = format === "markdown" ? "    " : "";
	const lines = [format === "markdown" ? "# 여러 문서 읽기\n" : "여러 문서 읽기\n"];
	const line = (key, value) => `${indent}${key}: ${scalar(value)}\n`;
	if (view === "content") {
		const escape = createDisplayEscaper({
			format,
			view
		});
		for (const row of batch.results) {
			const label = escape(row.inputPath);
			lines.push(format === "markdown" ? `\n## ${row.index + 1}. ${label}\n` : `\n[${row.index + 1}] ${label}\n`);
			if (row.value) lines.push(row.value.text, row.value.text.endsWith("\n") ? "" : "\n");
			for (const error of row.errors) {
				const detail = error.detail === void 0 ? "" : ` (${escape(error.detail)})`;
				lines.push(`읽기 실패: ${escape(error.message)}${detail}\n`);
			}
			if (row.status === "failure" && row.errors.length === 0) lines.push("읽기 실패: 문서 결과를 제공하지 못했습니다.\n");
		}
		lines.push(`\n읽기 결과: 성공 ${batch.summary.succeeded}개, 실패 ${batch.summary.failed}개\n`);
		return checkedReport(lines, maxOutputBytes);
	}
	lines.push(line("batchStatus", batch.status), line("requested", batch.summary.total), line("succeeded", batch.summary.succeeded), line("failed", batch.summary.failed));
	for (const row of batch.results) {
		lines.push(format === "markdown" ? `\n## 문서 ${row.index + 1}\n` : `\n[${row.index + 1}]\n`);
		lines.push(line("inputPath", row.inputPath), line("status", row.status), line("readStatus", row.readStatus), line("outputStatus", row.outputStatus), line("deliveryStatus", row.deliveryStatus));
		if (row.value) lines.push(line("format", row.value.format), line("documentSHA256", row.value.sourceSha256), "\n", row.value.text, row.value.text.endsWith("\n") ? "" : "\n");
		for (const error of row.errors) {
			lines.push(line("error", error.code), line("message", error.message));
			if (error.detail !== void 0) lines.push(line("detail", error.detail));
		}
	}
	return checkedReport(lines, maxOutputBytes);
}
function checkedReport(lines, maxOutputBytes) {
	const text = lines.join("");
	if (!text.isWellFormed() || new TextEncoder().encode(text).byteLength > maxOutputBytes) throw Error("ReadManyReportBudgetExceeded");
	return text;
}
// ../../js/document-format.mjs
function detectDocumentFormat(input) {
	const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : null;
	if (!bytes) throw new TypeError("ExpectedDocumentBytes");
	if (startsWith(bytes, cfbSignature)) return "hwp5";
	if (bytes.length >= 4 && bytes[0] === 80 && bytes[1] === 75 && (bytes[2] === 3 && bytes[3] === 4 || bytes[2] === 5 && bytes[3] === 6 || bytes[2] === 7 && bytes[3] === 8)) return "hwpx";
	if (startsWith(bytes, hwp3Signature)) throw new Error("UnsupportedHwp3Document");
	throw new Error("UnsupportedDocumentSignature");
}
var cfbSignature, hwp3Signature, startsWith;
var init_document_format = __esmMin((() => {
	cfbSignature = Uint8Array.of(208, 207, 17, 224, 161, 177, 26, 225);
	hwp3Signature = new TextEncoder().encode("HWP Document File V3");
	startsWith = (bytes, signature) => bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
})), BORDER_WIDTHS_HUNDREDTH_MM;
var init_border_fill_values = __esmMin((() => {
	Object.freeze([
		"NONE",
		"SOLID",
		"DASH",
		"DOT",
		"DASH_DOT",
		"DASH_DOT_DOT",
		"LONG_DASH",
		"DOUBLE_SLIM",
		"SLIM_THICK",
		"THICK_SLIM",
		"SLIM_THICK_SLIM",
		"WAVE",
		"DOUBLEWAVE",
		"THICK3D",
		"THICKREV3D",
		"3D",
		"REV3D"
	]);
	BORDER_WIDTHS_HUNDREDTH_MM = Object.freeze([
		10,
		12,
		15,
		20,
		25,
		30,
		40,
		50,
		60,
		70,
		100,
		150,
		200,
		300,
		400,
		500
	]);
}));
// ../../js/cell-border-command.mjs
function cellBorderStyleCode(style) {
	const code = styleCodes.get(style);
	if (code === void 0) throw new RangeError("UnsupportedCellBorderStyle");
	return code;
}
function validate$3(input, message) {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("InvalidCellBorder");
	const keys = Reflect.ownKeys(input);
	if (keys.length !== names$1.length + Number(message) || keys.some((key) => !allowed$3.has(key) && !(message && key === "kind")) || message && input.kind !== "cell-border") throw new TypeError("InvalidCellBorder");
	const values = names$1.map((name) => {
		if (!Object.hasOwn(input, name)) throw new TypeError("InvalidCellBorder");
		const value = input[name];
		if (name === "style") cellBorderStyleCode(value);
		else if (name === "width") {
			if (!widths.has(value)) throw new RangeError("UnsupportedBorderWidth");
		} else {
			const maximum = name === "color" ? 16777215 : name === "edges" ? 15 : 4294967295;
			const minimum = name === "edges" ? 1 : 0;
			if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError("InvalidCellBorder");
		}
		return value;
	});
	return Object.freeze(Object.fromEntries(names$1.map((name, index) => [name, values[index]])));
}
function validateCellBorder(input) {
	return validate$3(input, false);
}
var CELL_BORDER_STYLES, CELL_BORDER_WIDTHS, styleCodes, widths, names$1, allowed$3;
var init_cell_border_command = __esmMin((() => {
	init_border_fill_values();
	CELL_BORDER_STYLES = Object.freeze([
		"NONE",
		"SOLID",
		"DOUBLE_SLIM"
	]);
	CELL_BORDER_WIDTHS = BORDER_WIDTHS_HUNDREDTH_MM;
	styleCodes = new Map(CELL_BORDER_STYLES.map((style, code) => [style, code]));
	widths = new Set(CELL_BORDER_WIDTHS);
	names$1 = Object.freeze([
		"section",
		"tableNode",
		"listNode",
		"edges",
		"style",
		"width",
		"color"
	]);
	allowed$3 = new Set(names$1);
}));
// ../../js/cell-border-batch.mjs
function validateCellBorders(cells) {
	if (!Array.isArray(cells)) throw new TypeError("InvalidCellBorderBatch");
	const length = cells.length;
	if (length > 4096) throw new RangeError("LimitExceeded");
	if (Reflect.ownKeys(cells).length !== length + 1) throw new TypeError("InvalidCellBorderBatch");
	const result = [], owners = /* @__PURE__ */ new Set();
	for (let index = 0; index < length; index++) {
		if (!Object.hasOwn(cells, index)) throw new TypeError("InvalidCellBorderBatch");
		const value = validateCellBorder(cells[index]);
		const key = `${value.section}:${value.listNode}`;
		if (owners.has(key)) throw new TypeError("DuplicateCellBorderEdit");
		owners.add(key);
		result.push(value);
	}
	return Object.freeze(result);
}
function encodeCellBorders(cells) {
	const values = validateCellBorders(cells);
	const bytes = new Uint8Array(values.length * 28), view = new DataView(bytes.buffer);
	values.forEach((v, index) => {
		[
			v.section,
			v.tableNode,
			v.listNode,
			v.edges,
			cellBorderStyleCode(v.style),
			v.width,
			v.color
		].forEach((number, field) => view.setUint32(index * 28 + field * 4, number, true));
	});
	return bytes;
}
var init_cell_border_batch = __esmMin((() => {
	init_cell_border_command();
}));
// ../../js/table-diagonal-directions.mjs
var TABLE_DIAGONAL_DIRECTIONS;
var init_table_diagonal_directions = __esmMin((() => {
	TABLE_DIAGONAL_DIRECTIONS = Object.freeze([
		"none",
		"rising",
		"falling",
		"cross"
	]);
}));
// ../../js/cell-diagonal-command.mjs
function validateCellDiagonals(input) {
	if (!Array.isArray(input)) throw TypeError("InvalidCellDiagonalBatch");
	const length = input.length;
	if (length > 4096) throw RangeError("LimitExceeded");
	if (Reflect.ownKeys(input).length !== length + 1) throw TypeError("InvalidCellDiagonalBatch");
	const owners = /* @__PURE__ */ new Set(), rows = [];
	for (let index = 0; index < length; index++) {
		if (!Object.hasOwn(input, index)) throw TypeError("InvalidCellDiagonalBatch");
		const source = input[index];
		if (!source || typeof source !== "object" || Array.isArray(source)) throw TypeError("InvalidCellDiagonal");
		const fields = optional$2.filter((key) => Object.hasOwn(source, key));
		if (!fields.length || required$1.some((key) => !Object.hasOwn(source, key)) || Reflect.ownKeys(source).some((key) => !allowed$2.has(key))) throw TypeError("InvalidCellDiagonal");
		const directions = fields.includes("directions") ? source.directions : void 0;
		if (fields.includes("directions") && !TABLE_DIAGONAL_DIRECTIONS.includes(directions)) throw TypeError("InvalidCellDiagonal");
		const normalized = validateCellBorder({
			section: source.section,
			tableNode: source.tableNode,
			listNode: source.listNode,
			edges: 1,
			style: fields.includes("style") ? source.style : "NONE",
			width: fields.includes("width") ? source.width : BORDER_WIDTHS_HUNDREDTH_MM[0],
			color: fields.includes("color") ? source.color : 0
		});
		const key = `${normalized.section}:${normalized.listNode}`;
		if (owners.has(key)) throw TypeError("DuplicateCellDiagonalEdit");
		owners.add(key);
		const row = Object.fromEntries(required$1.map((key) => [key, normalized[key]]));
		for (const key of fields) row[key] = key === "directions" ? directions : normalized[key];
		rows.push(Object.freeze(row));
	}
	return Object.freeze(rows);
}
function encodeCellDiagonals(input) {
	const rows = validateCellDiagonals(input), bytes = new Uint8Array(rows.length * 48), view = new DataView(bytes.buffer);
	rows.forEach((row, index) => {
		const mask = Number(Object.hasOwn(row, "directions")) | Number(Object.hasOwn(row, "style")) << 1 | Number(Object.hasOwn(row, "width")) << 2 | Number(Object.hasOwn(row, "color")) << 3;
		[
			row.section,
			row.tableNode,
			row.listNode,
			mask,
			Object.hasOwn(row, "directions") ? TABLE_DIAGONAL_DIRECTIONS.indexOf(row.directions) : 0,
			Object.hasOwn(row, "style") ? cellBorderStyleCode(row.style) : 0,
			row.width ?? 0,
			row.color ?? 0,
			0,
			0,
			0,
			0
		].forEach((value, word) => view.setUint32(index * 48 + word * 4, value, true));
	});
	return bytes;
}
var required$1, optional$2, allowed$2;
var init_cell_diagonal_command = __esmMin((() => {
	init_cell_border_batch();
	init_cell_border_command();
	init_border_fill_values();
	init_table_diagonal_directions();
	required$1 = [
		"section",
		"tableNode",
		"listNode"
	];
	optional$2 = [
		"directions",
		"style",
		"width",
		"color"
	];
	allowed$2 = /* @__PURE__ */ new Set([...required$1, ...optional$2]);
}));
// ../../js/cell-border-patch-command.mjs
function validateCellBorderPatches(input) {
	if (!Array.isArray(input)) throw TypeError("InvalidCellBorderPatchBatch");
	const length = input.length;
	if (length > 4096) throw RangeError("LimitExceeded");
	if (Reflect.ownKeys(input).length !== length + 1) throw TypeError("InvalidCellBorderPatchBatch");
	const rows = [], owners = /* @__PURE__ */ new Set();
	for (let index = 0; index < length; index++) {
		if (!Object.hasOwn(input, index)) throw TypeError("InvalidCellBorderPatchBatch");
		const source = input[index];
		if (!source || typeof source !== "object" || Array.isArray(source)) throw TypeError("InvalidCellBorderPatch");
		const keys = Reflect.ownKeys(source), fields = optional$1.filter((key) => Object.hasOwn(source, key));
		if (keys.some((key) => !allowed$1.has(key)) || required.some((key) => !Object.hasOwn(source, key)) || !fields.length) throw TypeError("InvalidCellBorderPatch");
		const normalized = validateCellBorder({
			section: source.section,
			tableNode: source.tableNode,
			listNode: source.listNode,
			edges: source.edges,
			style: fields.includes("style") ? source.style : "NONE",
			width: fields.includes("width") ? source.width : BORDER_WIDTHS_HUNDREDTH_MM[0],
			color: fields.includes("color") ? source.color : 0
		});
		const key = `${normalized.section}:${normalized.listNode}`;
		if (owners.has(key)) throw TypeError("DuplicateCellBorderEdit");
		owners.add(key);
		const row = Object.fromEntries(required.map((key) => [key, normalized[key]]));
		for (const key of fields) row[key] = normalized[key];
		rows.push(Object.freeze(row));
	}
	return Object.freeze(rows);
}
function encodeCellBorderPatches(input) {
	const rows = validateCellBorderPatches(input), bytes = new Uint8Array(rows.length * 32), view = new DataView(bytes.buffer);
	rows.forEach((row, index) => {
		const mask = Number(Object.hasOwn(row, "style")) | Number(Object.hasOwn(row, "width")) << 1 | Number(Object.hasOwn(row, "color")) << 2;
		[
			row.section,
			row.tableNode,
			row.listNode,
			row.edges,
			mask,
			Object.hasOwn(row, "style") ? cellBorderStyleCode(row.style) : 0,
			row.width ?? 0,
			row.color ?? 0
		].forEach((number, field) => view.setUint32(index * 32 + field * 4, number, true));
	});
	return bytes;
}
var required, optional$1, allowed$1;
var init_cell_border_patch_command = __esmMin((() => {
	init_cell_border_command();
	init_cell_border_batch();
	init_border_fill_values();
	required = [
		"section",
		"tableNode",
		"listNode",
		"edges"
	];
	optional$1 = [
		"style",
		"width",
		"color"
	];
	allowed$1 = /* @__PURE__ */ new Set([...required, ...optional$1]);
}));
// ../../js/cell-fill-command.mjs
function exact$1(value, names) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw TypeError("InvalidCellFill");
	if (Reflect.ownKeys(value).length !== names.length || names.some((name) => !Object.hasOwn(value, name))) throw TypeError("InvalidCellFill");
}
function number$1(value, maximum) {
	if (!Number.isInteger(value) || value < 0 || value > maximum) throw RangeError("InvalidCellFill");
	return value;
}
function tuple(value) {
	if (!Array.isArray(value) || value.length !== 2 || Reflect.ownKeys(value).length !== 3 || !Object.hasOwn(value, 0) || !Object.hasOwn(value, 1)) throw TypeError("InvalidCellFill");
	return Object.freeze([number$1(value[0], 16777215), number$1(value[1], 16777215)]);
}
function validateCellFill(input) {
	if (!input || typeof input !== "object") throw TypeError("InvalidCellFill");
	const kind = input.kind;
	switch (kind) {
		case "none":
			exact$1(input, ["kind"]);
			return Object.freeze({ kind });
		case "solid":
			exact$1(input, ["kind", "color"]);
			return Object.freeze({
				kind,
				color: number$1(input.color, 16777215)
			});
		case "hatch": {
			exact$1(input, [
				"kind",
				"face",
				"hatch",
				"style"
			]);
			const style = input.style;
			if (!hatchCodes.has(style)) throw TypeError("InvalidCellFill");
			return Object.freeze({
				kind,
				face: number$1(input.face, 16777215),
				hatch: number$1(input.hatch, 16777215),
				style
			});
		}
		case "linear":
			exact$1(input, [
				"kind",
				"colors",
				"angle",
				"centerX",
				"centerY",
				"step",
				"stepCenter"
			]);
			return Object.freeze({
				kind,
				colors: tuple(input.colors),
				angle: number$1(input.angle, 359),
				centerX: number$1(input.centerX, 100),
				centerY: number$1(input.centerY, 100),
				step: number$1(input.step, 100),
				stepCenter: number$1(input.stepCenter, 100)
			});
		default: throw TypeError("InvalidCellFill");
	}
}
function validateCellFills(input) {
	if (!Array.isArray(input)) throw TypeError("InvalidCellFillBatch");
	const length = input.length;
	if (length > 4096) throw RangeError("LimitExceeded");
	if (Reflect.ownKeys(input).length !== length + 1) throw TypeError("InvalidCellFillBatch");
	const owners = /* @__PURE__ */ new Set(), values = [];
	for (let index = 0; index < length; index++) {
		if (!Object.hasOwn(input, index)) throw TypeError("InvalidCellFillBatch");
		const source = input[index];
		exact$1(source, [
			"section",
			"tableNode",
			"listNode",
			"fill"
		]);
		const section = number$1(source.section, 4294967295), tableNode = number$1(source.tableNode, 4294967295), listNode = number$1(source.listNode, 4294967295), fill = validateCellFill(source.fill), key = `${section}:${listNode}`;
		if (owners.has(key)) throw TypeError("DuplicateCellFillEdit");
		owners.add(key);
		values.push(Object.freeze({
			section,
			tableNode,
			listNode,
			fill
		}));
	}
	return Object.freeze(values);
}
function encodeCellFills(input) {
	const rows = validateCellFills(input), bytes = new Uint8Array(rows.length * 48), view = new DataView(bytes.buffer);
	rows.forEach((row, index) => {
		const fill = row.fill, fields = [
			row.section,
			row.tableNode,
			row.listNode,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0
		];
		if (fill.kind === "solid") {
			fields[3] = 1;
			fields[4] = fill.color;
		}
		if (fill.kind === "hatch") {
			fields[3] = 2;
			fields[4] = fill.face;
			fields[5] = fill.hatch;
			fields[6] = hatchCodes.get(fill.style);
		}
		if (fill.kind === "linear") {
			fields[3] = 3;
			fields.splice(4, 7, ...fill.colors, fill.angle, fill.centerX, fill.centerY, fill.step, fill.stepCenter);
		}
		fields.forEach((value, field) => view.setUint32(index * 48 + field * 4, value, true));
	});
	return bytes;
}
var CELL_HATCH_STYLES, hatchCodes;
var init_cell_fill_command = __esmMin((() => {
	init_cell_border_batch();
	CELL_HATCH_STYLES = Object.freeze([
		"HORIZONTAL",
		"VERTICAL",
		"BACK_SLASH",
		"SLASH",
		"CROSS",
		"CROSS_DIAGONAL"
	]);
	hatchCodes = new Map(CELL_HATCH_STYLES.map((value, index) => [value, index]));
}));
// ../../js/cell-style-command.mjs
function validateCellStyles(input) {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw TypeError("InvalidCellStyles");
	if (Reflect.ownKeys(input).length !== 2 + Number(Object.hasOwn(input, "diagonals")) || !Object.hasOwn(input, "borders") || !Object.hasOwn(input, "fills")) throw TypeError("InvalidCellStyles");
	const borders = validateCellBorderPatches(input.borders), fills = validateCellFills(input.fills), diagonals = Object.hasOwn(input, "diagonals") ? validateCellDiagonals(input.diagonals) : void 0, owners = /* @__PURE__ */ new Map();
	for (const rows of [
		borders,
		fills,
		diagonals ?? []
	]) for (const row of rows) {
		const key = `${row.section}:${row.listNode}`;
		if (owners.has(key) && owners.get(key) !== row.tableNode) throw TypeError("AmbiguousCellStyleOwner");
		owners.set(key, row.tableNode);
		if (owners.size > 4096) throw RangeError("LimitExceeded");
	}
	return Object.freeze({
		borders,
		fills,
		...diagonals ? { diagonals } : {}
	});
}
var init_cell_style_command = __esmMin((() => {
	init_cell_diagonal_command();
	init_cell_border_batch();
	init_cell_border_patch_command();
	init_cell_fill_command();
}));
// ../../js/atomic-formatting-api.mjs
function createAtomicFormattingApi({ wasm, memory, check, prefix }) {
	const suffixes = [
		"formatting_capabilities",
		"query_formatting",
		"apply_formatting_patch",
		"output_ptr",
		"output_len",
		"output_free",
		"history_revision",
		"history_stats"
	];
	const available = () => suffixes.every((s) => typeof wasm[`${prefix}_${s}`] === "function");
	const required = () => {
		check();
		if (!available()) throw Error("AtomicFormattingUnavailable");
	};
	const read = (action) => {
		try {
			if (action() !== 1) throw memory.error();
			return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]())));
		} finally {
			wasm[`${prefix}_output_free`]();
		}
	};
	const caps = () => {
		required();
		const value = read(() => wasm[`${prefix}_formatting_capabilities`]());
		if (value?.schemaVersion !== 1 || value.atomic !== true || value.format !== prefix.replace(/_edit$/, "") || value.coordinateSpace !== "native-source-utf16" || value.requiresHistoryProtocol !== 2 || typeof value.binding?.session !== "string" || !value.binding.session || !value.fields || typeof value.fields !== "object" || Array.isArray(value.fields) || !Object.values(value.fields).some((field) => field && field.readable === true) || !value.limits || ![
			"requestBytes",
			"replyBytes",
			"targets",
			"ranges",
			"commands",
			"fontNameBytes"
		].every((k) => Number.isSafeInteger(value.limits[k]) && value.limits[k] > 0)) throw Error("AtomicFormattingUnavailable");
		if (value.binding.revision !== null && (!Number.isSafeInteger(value.binding.revision) || value.binding.revision < 0 || value.binding.revision >= 4294967295)) throw Error("InvalidFormattingBinding");
		return value;
	};
	const encode = (value, limit) => {
		const bytes = new TextEncoder().encode(JSON.stringify(ownedJSON(value)));
		if (bytes.byteLength > limit) throw Error("LimitExceeded");
		return bytes;
	};
	return {
		supportsAtomicFormatting() {
			check();
			return available();
		},
		atomicFormattingCapabilities: caps,
		queryFormatting(request) {
			const policy = caps();
			const bytes = encode(request, policy.limits.requestBytes);
			const value = memory.withBytes(bytes, (ptr, size) => read(() => wasm[`${prefix}_query_formatting`](ptr, size)));
			if (value?.schemaVersion !== 1 || !Array.isArray(value.targets) || !value.observations || value.binding?.session !== request.binding?.session || value.binding?.revision !== request.binding?.revision) throw Error("MalformedFormattingQuery");
			return value;
		},
		applyFormattingPatch(request) {
			const policy = caps();
			const bytes = encode(request, policy.limits.requestBytes);
			let started = false, completed;
			try {
				return memory.withBytes(bytes, (ptr, size) => {
					started = true;
					const nativeCode = wasm[`${prefix}_apply_formatting_patch`](ptr, size);
					if (![
						0,
						1,
						2,
						3
					].includes(nativeCode)) return {
						application: "unknown",
						changed: null,
						error: "InvalidAtomicFormattingResult"
					};
					const error = nativeCode === 0 || nativeCode === 3 ? memory.error().message : void 0;
					return completed = {
						nativeCode,
						application: nativeCode === 1 ? "applied" : nativeCode === 3 ? "unknown" : "unapplied",
						changed: nativeCode === 3 ? null : nativeCode === 1,
						...error ? { error } : {}
					};
				});
			} catch (error) {
				if (!started) throw error;
				if (completed) return {
					...completed,
					cleanupError: error?.message || String(error),
					refreshRequired: true
				};
				return {
					application: "unknown",
					changed: null,
					error: error?.message || String(error)
				};
			}
		}
	};
}
function ownedJSON(value, seen = /* @__PURE__ */ new Set()) {
	if (value === null || typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw Error("InvalidNumber");
		return value;
	}
	if (typeof value !== "object" || seen.has(value)) throw Error("InvalidFormattingDTO");
	const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
	if (!array && proto !== Object.prototype && proto !== null) throw Error("InvalidFormattingDTO");
	seen.add(value);
	try {
		const result = array ? [] : Object.create(null);
		for (const key of Reflect.ownKeys(value)) {
			if (array && key === "length") continue;
			if (typeof key !== "string") throw Error("InvalidFormattingDTO");
			if (array && !/^(0|[1-9][0-9]*)$/.test(key)) throw Error("InvalidFormattingDTO");
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (!descriptor || !("value" in descriptor)) throw Error("AccessorPayloadUnsupported");
			if (descriptor.value === void 0) {
				if (array) throw Error("InvalidFormattingDTO");
				continue;
			}
			result[key] = ownedJSON(descriptor.value, seen);
		}
		if (array && result.length !== value.length) throw Error("InvalidFormattingDTO");
		for (let i = 0; array && i < value.length; i++) if (!Object.hasOwn(result, i)) throw Error("InvalidFormattingDTO");
		return result;
	} finally {
		seen.delete(value);
	}
}
var init_atomic_formatting_api = __esmMin((() => {})), EXPERIMENTAL_EDITOR_FUNCTIONS, REQUIRED_FUNCTIONS;
var init_abi_schema = __esmMin((() => {
	EXPERIMENTAL_EDITOR_FUNCTIONS = Object.freeze([
		"hwp5_edit_open",
		"hwp5_edit_close",
		"hwp5_edit_section_count",
		"hwp5_edit_paragraph_count",
		"hwp5_edit_char_shape_count",
		"hwp5_edit_copy_text",
		"hwp5_edit_splice",
		"hwp5_edit_format",
		"hwp5_edit_save",
		"hwp5_edit_output_ptr",
		"hwp5_edit_output_len",
		"hwp5_edit_output_free",
		"hwp5_edit_reflow"
	]);
	Object.freeze(["hwpx_edit_document_provenance"]);
	Object.freeze({
		header_bytes: 8,
		node_bytes: 56,
		parent: 0,
		kind: 4,
		name_len: 8,
		content_len: 12,
		state: 16,
		reserved: 20,
		created: 24,
		modified: 32,
		clsid: 40
	});
	Object.freeze({
		name: 0,
		path: 1,
		content: 2,
		clsid: 3
	});
	Object.freeze({
		kind: 0,
		color: 1,
		left: 2,
		right: 3,
		child: 4,
		state: 5,
		created: 6,
		modified: 7,
		start: 8,
		size: 9,
		uses_fat: 10,
		has_content: 11
	});
	REQUIRED_FUNCTIONS = Object.freeze([
		"hwpjs_abi_version",
		"cfb_alloc",
		"cfb_free",
		"cfb_open",
		"cfb_open_strict",
		"cfb_find_exact",
		"cfb_write",
		"cfb_document",
		"cfb_output_ptr",
		"cfb_output_len",
		"cfb_output_free",
		"cfb_close",
		"cfb_error_ptr",
		"cfb_error_len",
		"cfb_error_code_ptr",
		"cfb_error_code_len",
		"cfb_count",
		"cfb_find",
		"cfb_find_snapshot",
		"cfb_field_ptr",
		"cfb_field_len",
		"cfb_value",
		"cfb_sector_count",
		"cfb_raw_ptr",
		"cfb_raw_len",
		"hwp5_text_read",
		"hwp5_text_ptr",
		"hwp5_text_len",
		"hwp5_text_free"
	]);
}));
// ../../js/abi.mjs
function validateAbi(wasm) {
	if (typeof wasm.hwpjs_abi_version !== "function") throw new Error("Missing HWPJS ABI version");
	const actual = wasm.hwpjs_abi_version();
	if (actual !== 6) throw new Error(`Unsupported HWPJS ABI ${actual}; expected 6`);
	for (const name of REQUIRED_FUNCTIONS) if (typeof wasm[name] !== "function") throw new Error(`Missing HWPJS ABI export: ${name}`);
	if (!(wasm.memory instanceof WebAssembly.Memory)) throw new Error("Missing HWPJS ABI memory");
}
var init_abi = __esmMin((() => {
	init_abi_schema();
}));
// ../../js/cell-size-batch.mjs
function encodeCellSizes(cells) {
	if (!Array.isArray(cells)) throw new TypeError("InvalidCellSizeBatch");
	if (cells.length > 4096) throw new RangeError("LimitExceeded");
	const names = [
		"section",
		"listNode",
		"width",
		"height"
	], seen = /* @__PURE__ */ new Set();
	const bytes = new Uint8Array(cells.length * 16), view = new DataView(bytes.buffer);
	for (let i = 0; i < cells.length; i++) {
		const cell = cells[i];
		if (!cell || typeof cell !== "object" || Array.isArray(cell) || Object.keys(cell).some((key) => !names.includes(key))) throw new TypeError("InvalidCellSizeBatch");
		const values = names.map((name) => {
			const value = cell[name];
			if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError("InvalidCellSizeBatch");
			return value;
		});
		const key = `${values[0]}:${values[1]}`;
		if (seen.has(key)) throw new Error("DuplicateCellSizeEdit");
		seen.add(key);
		values.forEach((value, column) => view.setUint32(i * 16 + column * 4, value, true));
	}
	return bytes;
}
var init_cell_size_batch = __esmMin((() => {}));
// ../../js/cell-background-command.mjs
function validate$2(input, message) {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("InvalidCellBackground");
	const keys = Reflect.ownKeys(input);
	if (keys.length !== names.length + Number(message) || keys.some((key) => !allowed.has(key) && !(message && key === "kind")) || message && input.kind !== "cell-background") throw new TypeError("InvalidCellBackground");
	const values = names.map((name) => {
		if (!Object.hasOwn(input, name)) throw new TypeError("InvalidCellBackground");
		const value = input[name];
		const maximum = name === "color" ? 16777215 : 4294967295;
		if (!Number.isInteger(value) || value < 0 || value > maximum) throw new RangeError("InvalidCellBackground");
		return value;
	});
	return Object.freeze(Object.fromEntries(names.map((name, index) => [name, values[index]])));
}
function validateCellBackground(input) {
	return validate$2(input, false);
}
var names, allowed;
var init_cell_background_command = __esmMin((() => {
	names = Object.freeze([
		"section",
		"tableNode",
		"listNode",
		"color"
	]);
	allowed = new Set(names);
}));
// ../../js/cell-appearance-command.mjs
function validateCellAppearance(input) {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw TypeError("InvalidCellAppearance");
	if (Reflect.ownKeys(input).length !== 2 || !Object.hasOwn(input, "cells") || !Object.hasOwn(input, "background")) throw TypeError("InvalidCellAppearance");
	const cells = validateCellBorders(input.cells), source = input.background;
	const background = source === null ? null : validateCellBackground(source);
	return Object.freeze({
		cells,
		background
	});
}
var init_cell_appearance_command = __esmMin((() => {
	init_cell_border_batch();
	init_cell_background_command();
}));
// ../../js/font-face-identity.mjs
/** IDs are ordered within language partitions, never globally. */
function validFontFaceOrder(rows) {
	let previousLanguage = -1, previousId = -1;
	for (const row of rows) {
		const language = FONT_LANGUAGES.indexOf(row?.language);
		if (language < 0 || language < previousLanguage || !Number.isInteger(row.id) || row.id < 0 || row.id > 4294967295 || language === previousLanguage && row.id <= previousId) return false;
		previousLanguage = language;
		previousId = row.id;
	}
	return true;
}
var FONT_LANGUAGES;
var init_font_face_identity = __esmMin((() => {
	FONT_LANGUAGES = Object.freeze([
		"hangul",
		"latin",
		"hanja",
		"japanese",
		"other",
		"symbol",
		"user"
	]);
}));
// ../../js/font-metadata-wire.mjs
function decodeMetadataWire(bytes, errorName) {
	const fail = () => {
		throw new Error(errorName);
	};
	if (!(bytes instanceof Uint8Array)) return fail();
	let wire;
	try {
		wire = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!metadataKeys(wire, ["version", "fonts"]) || wire.version !== 1 || !Array.isArray(wire.fonts) || wire.fonts.length > 1e6 || !validFontFaceOrder(wire.fonts)) return fail();
	return wire.fonts;
}
var metadataKeys, metadataText;
var init_font_metadata_wire = __esmMin((() => {
	init_font_face_identity();
	metadataKeys = (row, names) => row !== null && typeof row === "object" && !Array.isArray(row) && Object.keys(row).length === names.length && names.every((name) => Object.hasOwn(row, name));
	metadataText = (value) => value === null || typeof value === "string" && value.isWellFormed() && new TextEncoder().encode(value).length <= 4096;
}));
// ../../js/character-font-metrics.mjs
/** Raw diagnostic values, not inferred defaults or a shaping instruction. */
function decodeCharacterFontMetrics(bytes, format) {
	const fail = () => {
		throw new Error("InvalidCharacterFontMetrics");
	};
	let wire;
	try {
		if (!(bytes instanceof Uint8Array)) return fail();
		wire = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!metadataKeys(wire, [
		"version",
		"format",
		"shapes"
	]) || wire.version !== 1 || wire.format !== format || !["hwp5", "hwpx"].includes(format) || !Array.isArray(wire.shapes) || wire.shapes.length > 1e5) return fail();
	let previous = -1;
	for (const row of wire.shapes) {
		if (!metadataKeys(row, ["id", "values"]) || !Number.isInteger(row.id) || row.id < 0 || row.id > 4294967295 || row.id <= previous || !metadataKeys(row.values, fields$3)) return fail();
		previous = row.id;
		for (const key of fields$3) {
			const values = row.values[key];
			if (values === null && format === "hwpx") continue;
			if (!Array.isArray(values) || values.length !== 7) return fail();
			const signed = key === "spacing" || key === "offset";
			const lower = format === "hwpx" ? -2147483648 : signed ? -128 : 0;
			const upper = format === "hwpx" ? 2147483647 : signed ? 127 : 255;
			if (values.some((value) => !(value === null && format === "hwpx") && (!Number.isInteger(value) || value < lower || value > upper))) return fail();
		}
	}
	return wire.shapes;
}
var fields$3;
var init_character_font_metrics = __esmMin((() => {
	init_font_metadata_wire();
	fields$3 = [
		"ratio",
		"spacing",
		"relativeSize",
		"offset"
	];
}));
// ../../js/character-snapshot-json.mjs
/** Strict JSON transport shared by separate, versioned resource projections. */
function decodeCharacterSnapshot(bytes, keys, errorName) {
	const fail = () => {
		throw new Error(errorName);
	};
	if (!(bytes instanceof Uint8Array)) return fail();
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!Array.isArray(rows) || rows.length > 1e6) return fail();
	let previous = -1;
	for (const row of rows) {
		if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key)) || !Number.isInteger(row.id) || row.id <= previous || row.id > 4294967295) return fail();
		previous = row.id;
	}
	return rows;
}
var init_character_snapshot_json = __esmMin((() => {}));
// ../../js/character-effect-args.mjs
function characterEffectMode(exclusive) {
	if (typeof exclusive !== "boolean") throw new TypeError("InvalidCharacterEffectMode");
	return exclusive;
}
function characterEffectArgs(effect, enabled) {
	const kind = CHARACTER_EFFECTS.indexOf(effect);
	if (kind < 0 || typeof enabled !== "boolean") throw new TypeError("InvalidCharacterEffect");
	return [kind, Number(enabled)];
}
var CHARACTER_EFFECTS;
var init_character_effect_args = __esmMin((() => {
	CHARACTER_EFFECTS = Object.freeze([
		"emboss",
		"engrave",
		"superscript",
		"subscript"
	]);
}));
// ../../js/character-effects.mjs
function decodeCharacterEffects(bytes) {
	const flags = CHARACTER_EFFECTS;
	const rows = decodeCharacterSnapshot(bytes, ["id", ...flags], "InvalidCharacterEffects");
	if (rows.some((row) => flags.some((flag) => typeof row[flag] !== "boolean"))) throw new Error("InvalidCharacterEffects");
	return rows;
}
var init_character_effects = __esmMin((() => {
	init_character_snapshot_json();
	init_character_effect_args();
}));
// ../../js/character-outline-args.mjs
function hwp5CharacterOutlineArg(kind) {
	const value = HWP5_CHARACTER_OUTLINE_KINDS.indexOf(kind);
	if (value < 0) throw new TypeError("InvalidCharacterOutline");
	return value;
}
function characterOutlineArg(kind) {
	const value = hwp5CharacterOutlineArg(kind);
	if (value > 1) throw new TypeError("InvalidCharacterOutline");
	return value;
}
var HWP5_CHARACTER_OUTLINE_KINDS;
var init_character_outline_args = __esmMin((() => {
	HWP5_CHARACTER_OUTLINE_KINDS = Object.freeze([
		"none",
		"solid",
		"dot",
		"thick",
		"dash",
		"dash-dot",
		"dash-dot-dot"
	]);
}));
// ../../js/character-outlines.mjs
function decodeCharacterOutlines(bytes) {
	const rows = decodeCharacterSnapshot(bytes, [
		"id",
		"state",
		"rawKind"
	], "InvalidCharacterOutlines");
	for (const row of rows) {
		if (![
			"absent",
			"none",
			"solid",
			"other",
			"unknown"
		].includes(row.state)) throw new Error("InvalidCharacterOutlines");
		if (row.rawKind !== null) {
			if (!Number.isInteger(row.rawKind) || row.rawKind < 0 || row.rawKind > 7 || row.state !== (row.rawKind === 0 ? "none" : row.rawKind === 1 ? "solid" : row.rawKind === 7 ? "unknown" : "other")) throw new Error("InvalidCharacterOutlines");
		} else if (row.state === "other") throw new Error("InvalidCharacterOutlines");
	}
	return rows;
}
var init_character_outlines = __esmMin((() => {
	init_character_snapshot_json();
}));
// ../../js/hwp5-structural-anchors.mjs
function decodeHwp5StructuralAnchors(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5StructuralAnchors");
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || !HWP5_STRUCTURAL_ANCHOR_KINDS.includes(row.kind) || ![
			"control_node",
			"paragraph",
			"source_unit",
			"current_unit"
		].every((key) => uint(row[key])) || row.source_unit > 4294967287 || row.current_unit > 4294967287 || seen.has(row.control_node)) throw new Error("InvalidHwp5StructuralAnchors");
		seen.add(row.control_node);
	}
	return rows;
}
var HWP5_STRUCTURAL_ANCHOR_KINDS;
var init_hwp5_structural_anchors = __esmMin((() => {
	HWP5_STRUCTURAL_ANCHOR_KINDS = Object.freeze([
		"section",
		"column",
		"header",
		"footer",
		"bookmark"
	]);
}));
// ../../js/hwp5-page-area-sources.mjs
function decodeHwp5PageAreaSources(bytes) {
	return validateHwp5PageAreaSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateHwp5PageAreaSources(rows) {
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5PageAreaSources");
	const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || !["header", "footer"].includes(row.kind) || ![
			"owner_node",
			"list_node",
			"paragraph_count",
			"control_attributes",
			"list_attributes",
			"width",
			"height",
			"control_extra_bytes",
			"list_extra_bytes"
		].every((key) => uint(row[key])) || row.owner_node >= row.list_node || row.list_unknown !== null && !uint(row.list_unknown, 65535) || !uint(row.text_references, 255) || !uint(row.number_references, 255) || typeof row.control_extra_nonzero !== "boolean" || typeof row.list_extra_nonzero !== "boolean" || row.control_extra_bytes === 0 && row.control_extra_nonzero || row.list_extra_bytes === 0 && row.list_extra_nonzero || seen.has(row.list_node)) throw new Error("InvalidHwp5PageAreaSources");
		seen.add(row.list_node);
		if (row.control_instance_id !== void 0 && row.control_instance_id !== null && (!uint(row.control_instance_id) || row.control_extra_bytes !== 4 || row.control_extra_nonzero !== (row.control_instance_id !== 0))) throw new Error("InvalidHwp5PageAreaSources");
	}
	return rows;
}
var init_hwp5_page_area_sources = __esmMin((() => {}));
// ../../js/hwp5-master-page-sources.mjs
function decodeHwp5MasterPageSources(bytes) {
	return validateHwp5MasterPageSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateHwp5MasterPageSources(rows) {
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5MasterPageSources");
	const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"owner_node",
			"list_node",
			"paragraph_count",
			"list_attributes",
			"width",
			"height",
			"extra_bytes"
		].every((key) => uint(row[key])) || row.owner_node >= row.list_node || row.list_unknown !== null && !uint(row.list_unknown, 65535) || !uint(row.text_reference, 255) || !uint(row.number_reference, 255) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || seen.has(row.list_node)) throw new Error("InvalidHwp5MasterPageSources");
		seen.add(row.list_node);
	}
	return rows;
}
var init_hwp5_master_page_sources = __esmMin((() => {}));
// ../../js/hwp5-document-properties.mjs
function validateHwp5DocumentProperties(value) {
	const uint = (number, max) => Number.isInteger(number) && number >= 0 && number <= max;
	if (!value || ![
		"source_record",
		"caret_list",
		"caret_paragraph",
		"caret_character",
		"extra_bytes"
	].every((key) => uint(value[key], 4294967295)) || ![
		"section_count",
		"page_start",
		"footnote_start",
		"endnote_start",
		"picture_start",
		"table_start",
		"equation_start"
	].every((key) => uint(value[key], 65535)) || typeof value.extra_nonzero !== "boolean" || value.extra_bytes === 0 && value.extra_nonzero) throw new Error("InvalidHwp5DocumentProperties");
	return value;
}
function decodeHwp5DocumentProperties(bytes) {
	return validateHwp5DocumentProperties(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_document_properties = __esmMin((() => {}));
// ../../js/hwp5-automatic-number-sources.mjs
function validateHwp5AutomaticNumberSources(rows) {
	const uint = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5AutomaticNumberSources");
	const seen = /* @__PURE__ */ new Set(), positions = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"control_node",
			"paragraph",
			"source_unit",
			"current_unit",
			"attributes",
			"extra_bytes"
		].every((key) => uint(row[key], 4294967295)) || row.source_unit > 4294967287 || row.current_unit > 4294967287 || ![
			"number",
			"symbol",
			"prefix",
			"suffix"
		].every((key) => uint(row[key], 65535)) || row.kind !== (row.attributes & 15) || row.shape !== (row.attributes >>> 4 & 255) || row.superscript !== Boolean(row.attributes & 4096) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || seen.has(row.control_node)) throw new Error("InvalidHwp5AutomaticNumberSources");
		const position = `${row.paragraph}:${row.current_unit}`;
		if (positions.has(position)) throw new Error("InvalidHwp5AutomaticNumberSources");
		seen.add(row.control_node);
		positions.add(position);
	}
	return rows;
}
function decodeHwp5AutomaticNumberSources(bytes) {
	return validateHwp5AutomaticNumberSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_automatic_number_sources = __esmMin((() => {}));
// ../../js/hwp5-page-control-sources.mjs
function validateHwp5PageControlSources(rows) {
	const fail = () => {
		throw new Error("InvalidHwp5PageControlSources");
	};
	const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
	if (!Array.isArray(rows)) fail();
	const ids = /* @__PURE__ */ new Set(), positions = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"position",
			"hide",
			"restart",
			"parity"
		].includes(row.kind) || ![
			"control_node",
			"paragraph",
			"source_unit",
			"current_unit",
			"attributes",
			"extra_bytes"
		].every((key) => uint(row[key])) || row.source_unit > 4294967287 || row.current_unit > 4294967287 || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || ids.has(row.control_node)) fail();
		for (const field of [
			"number",
			"symbol",
			"prefix",
			"suffix",
			"dash"
		]) if ((row.kind === "position" ? field !== "number" : row.kind === "restart" && field === "number") ? !uint(row[field], 65535) : row[field] !== null) fail();
		const position = `${row.paragraph}:${row.current_unit}`;
		if (positions.has(position)) fail();
		ids.add(row.control_node);
		positions.add(position);
	}
	return rows;
}
function decodeHwp5PageControlSources(bytes) {
	return validateHwp5PageControlSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_page_control_sources = __esmMin((() => {}));
// ../../js/hwp5-note-sources.mjs
function validateHwp5NoteSources(rows) {
	const uint = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5NoteSources");
	const seen = /* @__PURE__ */ new Set(), controls = /* @__PURE__ */ new Map();
	for (const row of rows) {
		if (!row || !["footnote", "endnote"].includes(row.kind) || ![
			"control_node",
			"list_node",
			"paragraph_count",
			"paragraph",
			"source_unit",
			"current_unit",
			"number",
			"number_shape",
			"control_extra_bytes",
			"list_attributes",
			"list_extra_bytes"
		].every((key) => uint(row[key], 4294967295)) || row.control_node >= row.list_node || row.source_unit > 4294967287 || row.current_unit > 4294967287 || !uint(row.prefix, 65535) || !uint(row.suffix, 65535) || row.instance_id !== null && !uint(row.instance_id, 4294967295) || row.list_unknown !== null && !uint(row.list_unknown, 65535) || typeof row.control_extra_nonzero !== "boolean" || typeof row.list_extra_nonzero !== "boolean" || row.control_extra_bytes === 0 && row.control_extra_nonzero || row.list_extra_bytes === 0 && row.list_extra_nonzero || seen.has(row.list_node)) throw new Error("InvalidHwp5NoteSources");
		const previous = controls.get(row.control_node);
		if (previous && [
			"kind",
			"paragraph",
			"source_unit",
			"current_unit",
			"number",
			"prefix",
			"suffix",
			"number_shape",
			"instance_id",
			"control_extra_bytes",
			"control_extra_nonzero"
		].some((key) => previous[key] !== row[key])) throw new Error("InvalidHwp5NoteSources");
		controls.set(row.control_node, row);
		seen.add(row.list_node);
	}
	return rows;
}
function decodeHwp5NoteSources(bytes) {
	return validateHwp5NoteSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_note_sources = __esmMin((() => {}));
// ../../js/hwp5-form-sources.mjs
function validateHwp5FormSources(rows) {
	return uniqueRows(rows, (row) => [
		"paragraph_node",
		"source_unit",
		"raw_length",
		"flags",
		"width",
		"height",
		"instance_id",
		"common_extra_bytes",
		"envelope_extra_bytes",
		"property_bytes",
		"property_nodes",
		"other_direct_children"
	].every((k) => uint$26(row[k])) && row.paragraph_node < row.control_node && row.source_unit <= 4294967287 && [
		"unknown",
		"push_button",
		"check_box",
		"combo_box",
		"radio_button",
		"edit"
	].includes(row.kind) && uint$26(row.type_id) && uint$26(row.secondary_type_id) && [
		"offset_x",
		"offset_y",
		"z_order",
		"prevent_page_break"
	].every((k) => signed(row[k], -2147483648, 2147483647)) && Array.isArray(row.margins) && row.margins.length === 4 && row.margins.every((v) => signed(v, -32768, 32767)) && (row.description_bytes === null || uint$26(row.description_bytes)));
}
function validateHwp5FormAnchors(rows) {
	return uniqueRows(rows, (row) => uint$26(row.paragraph) && uint$26(row.source_unit) && row.source_unit <= 4294967287 && uint$26(row.current_unit) && row.current_unit <= 4294967287);
}
var uint$26, signed, uniqueRows, decode$1, decodeHwp5FormSources, decodeHwp5FormAnchors;
var init_hwp5_form_sources = __esmMin((() => {
	uint$26 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	signed = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
	uniqueRows = (rows, inspect) => {
		const controls = /* @__PURE__ */ new Set(), objects = /* @__PURE__ */ new Set();
		if (!Array.isArray(rows)) throw Error("InvalidHwp5FormSources");
		for (const row of rows) {
			if (!row || !uint$26(row.control_node) || !uint$26(row.object_node) || row.control_node >= row.object_node || controls.has(row.control_node) || objects.has(row.object_node) || !inspect(row)) throw Error("InvalidHwp5FormSources");
			controls.add(row.control_node);
			objects.add(row.object_node);
		}
		return rows;
	};
	decode$1 = (bytes, validate) => validate(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
	decodeHwp5FormSources = (bytes) => decode$1(bytes, validateHwp5FormSources);
	decodeHwp5FormAnchors = (bytes) => decode$1(bytes, validateHwp5FormAnchors);
}));
// ../../js/hwp5-form-properties.mjs
function validateHwp5FormProperties(rows) {
	const fail = () => {
		throw Error("InvalidHwp5FormProperties");
	};
	if (!Array.isArray(rows) || rows.length > 1e5) fail();
	let totalUnits = 0, totalFields = 0;
	const controls = /* @__PURE__ */ new Set(), objects = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"control_node",
			"object_node",
			"known_nodes",
			"deferred_nodes"
		].every((k) => uint$25(row[k])) || row.control_node >= row.object_node || controls.has(row.control_node) || objects.has(row.object_node) || !Array.isArray(row.fields)) fail();
		const fields = /* @__PURE__ */ new Set();
		for (const property of row.fields) {
			if (!property || typeof property.field !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(property.field) || fields.has(property.field) || ![
				"wstring",
				"integer",
				"boolean"
			].includes(property.kind) || !Array.isArray(property.units) || property.units.length > 1e6 - totalUnits || property.units.some((unit) => !Number.isInteger(unit) || unit < 0 || unit > 65535)) fail();
			totalUnits += property.units.length;
			totalFields++;
			fields.add(property.field);
			if (totalFields > 1e5) fail();
		}
		if (row.fields.length > row.known_nodes) fail();
		controls.add(row.control_node);
		objects.add(row.object_node);
	}
	return rows;
}
function decodeHwp5FormProperties(bytes) {
	return validateHwp5FormProperties(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var uint$25;
var init_hwp5_form_properties = __esmMin((() => {
	uint$25 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
}));
// ../../js/hwp5-note-shape-sources.mjs
function validateHwp5NoteShapeSources(rows) {
	const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
	if (!Array.isArray(rows) || rows.length !== 2) throw new Error("InvalidHwp5NoteShapeSources");
	for (const [index, row] of rows.entries()) if (!row || row.kind !== ["footnote", "endnote"][index] || ![
		"source_node",
		"owner_node",
		"flags",
		"color",
		"extra_bytes"
	].every((key) => integer(row[key], 0, 4294967295)) || row.owner_node >= row.source_node || ![
		"user_char",
		"prefix",
		"suffix",
		"start_number"
	].every((key) => integer(row[key], 0, 65535)) || !integer(row.separator_length, -2147483648, 2147483647) || ![
		"above",
		"below",
		"between"
	].every((key) => integer(row[key], -32768, 32767)) || !["line_type", "line_width"].every((key) => integer(row[key], 0, 255)) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero) throw new Error("InvalidHwp5NoteShapeSources");
	if (rows[0].owner_node !== rows[1].owner_node || rows[0].source_node >= rows[1].source_node) throw new Error("InvalidHwp5NoteShapeSources");
	return rows;
}
function decodeHwp5NoteShapeSources(bytes) {
	return validateHwp5NoteShapeSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_note_shape_sources = __esmMin((() => {}));
// ../../js/hwp5-caption-sources.mjs
function validateHwp5CaptionSources(rows) {
	const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5CaptionSources");
	const lists = /* @__PURE__ */ new Set(), owners = /* @__PURE__ */ new Map();
	for (const row of rows) {
		if (!row || ![
			"control_node",
			"table_record_node",
			"list_node",
			"attributes",
			"flags",
			"width",
			"max_text_width",
			"extra_bytes"
		].every((key) => integer(row[key], 0, 4294967295)) || !(row.control_node < row.list_node && row.list_node < row.table_record_node) || !integer(row.paragraph_count, 0, 65535) || row.unknown !== null && !integer(row.unknown, 0, 65535) || !integer(row.gap, -32768, 32767) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || lists.has(row.list_node) || owners.has(row.control_node) && owners.get(row.control_node) !== row.table_record_node) throw new Error("InvalidHwp5CaptionSources");
		lists.add(row.list_node);
		owners.set(row.control_node, row.table_record_node);
	}
	return rows;
}
function decodeHwp5CaptionSources(bytes) {
	return validateHwp5CaptionSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_caption_sources = __esmMin((() => {}));
// ../../js/hwp5-drawing-sources.mjs
function validateHwp5DrawingSources(rows) {
	const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingSources");
	const controls = /* @__PURE__ */ new Set(), components = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"control_node",
			"component_node",
			"paragraph_node",
			"kind_id",
			"flags",
			"width",
			"height",
			"instance_id",
			"original_width",
			"original_height",
			"current_width",
			"current_height",
			"component_attributes",
			"matrix_pairs",
			"component_extra_bytes"
		].every((key) => integer(row[key], 0, 4294967295)) || ![
			"offset_x",
			"offset_y",
			"component_offset_x",
			"component_offset_y"
		].every((key) => integer(row[key], -2147483648, 2147483647)) || !integer(row.rotation_angle, -32768, 32767) || row.matrix_pairs > 65535 || !(row.paragraph_node < row.control_node && row.control_node < row.component_node) || controls.has(row.control_node) || components.has(row.component_node)) throw new Error("InvalidHwp5DrawingSources");
		controls.add(row.control_node);
		components.add(row.component_node);
		if ([
			"z_order",
			"outer_margins",
			"prevent_page_break",
			"description_bytes",
			"object_extra_bytes"
		].some((key) => Object.hasOwn(row, key))) {
			if (!integer(row.z_order, -2147483648, 2147483647) || !integer(row.prevent_page_break, -2147483648, 2147483647) || !Array.isArray(row.outer_margins) || row.outer_margins.length !== 4 || !Array.from(row.outer_margins).every((value) => integer(value, -32768, 32767)) || row.description_bytes !== null && (!integer(row.description_bytes, 0, 131070) || row.description_bytes % 2 !== 0) || !integer(row.object_extra_bytes, 0, 4294967295)) throw new Error("InvalidHwp5DrawingSources");
		}
	}
	return rows;
}
function decodeHwp5DrawingSources(bytes) {
	return validateHwp5DrawingSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_sources = __esmMin((() => {}));
// ../../js/hwp5-drawing-object-extras.mjs
function decodeHwp5DrawingObjectExtras(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!Array.isArray(rows) || rows.length > 1e6) throw new Error("InvalidHwp5DrawingObjectExtras");
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	let previous = -1;
	for (const row of rows) {
		if (!row || ![
			row.control_node,
			row.paragraph_node,
			row.extra_bytes
		].every(uint) || row.paragraph_node >= row.control_node || row.control_node <= previous || typeof row.extra_hex !== "string" || row.extra_hex.length !== row.extra_bytes * 2 || !/^[0-9a-f]*$/.test(row.extra_hex)) throw new Error("InvalidHwp5DrawingObjectExtras");
		previous = row.control_node;
	}
	return rows;
}
var init_hwp5_drawing_object_extras = __esmMin((() => {}));
// ../../js/hwp5-drawing-component-sources.mjs
function validateHwp5DrawingComponentSources(rows) {
	const fail = () => {
		throw new Error("InvalidHwp5DrawingComponentSources");
	};
	const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
	if (!Array.isArray(rows)) fail();
	const components = /* @__PURE__ */ new Map(), controls = /* @__PURE__ */ new Set();
	let previous = -1;
	for (const row of rows) {
		if (!row || ![
			"component_node",
			"owner_node",
			"kind_id",
			"original_width",
			"original_height",
			"current_width",
			"current_height",
			"attributes",
			"extra_bytes"
		].every((key) => integer(row[key], 0, 4294967295)) || ![
			"offset_x",
			"offset_y",
			"rotation_x",
			"rotation_y"
		].every((key) => integer(row[key], -2147483648, 2147483647)) || ![
			"group_count",
			"local_version",
			"matrix_pairs"
		].every((key) => integer(row[key], 0, 65535)) || !integer(row.rotation_angle, -32768, 32767) || row.second_id !== null && !integer(row.second_id, 0, 4294967295) || row.owner_node >= row.component_node || row.component_node <= previous) fail();
		if (row.second_id === null) {
			if (components.get(row.owner_node)?.kind_id !== 610496366) fail();
		} else {
			if (components.has(row.owner_node) || controls.has(row.owner_node)) fail();
			controls.add(row.owner_node);
		}
		components.set(row.component_node, row);
		previous = row.component_node;
	}
	return rows;
}
function decodeHwp5DrawingComponentSources(bytes) {
	return validateHwp5DrawingComponentSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_component_sources = __esmMin((() => {}));
// ../../js/hwp5-drawing-anchors.mjs
function validateHwp5DrawingAnchors(rows) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingAnchors");
	const controls = /* @__PURE__ */ new Set(), components = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"control_node",
			"component_node",
			"paragraph",
			"source_unit",
			"current_unit"
		].every((key) => uint(row[key])) || row.control_node >= row.component_node || row.source_unit > 4294967287 || row.current_unit > 4294967287 || controls.has(row.control_node) || components.has(row.component_node)) throw new Error("InvalidHwp5DrawingAnchors");
		controls.add(row.control_node);
		components.add(row.component_node);
	}
	return rows;
}
function decodeHwp5DrawingAnchors(bytes) {
	return validateHwp5DrawingAnchors(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_anchors = __esmMin((() => {}));
// ../../js/hwp5-drawing-list-sources.mjs
function validateHwp5DrawingListSources(rows) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingListSources");
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || !["caption", "body"].includes(row.kind) || ![
			"control_node",
			"owner_node",
			"list_node",
			"paragraph_count",
			"attributes",
			"extra_bytes"
		].every((key) => uint(row[key])) || row.paragraph_count > 65535 || row.owner_node >= row.list_node || (row.kind === "caption" ? row.owner_node !== row.control_node : row.owner_node <= row.control_node) || row.unknown !== null && (!uint(row.unknown) || row.unknown > 65535) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || seen.has(row.list_node)) throw new Error("InvalidHwp5DrawingListSources");
		seen.add(row.list_node);
		if (Object.hasOwn(row, "caption")) {
			const c = row.caption;
			if (row.kind === "body" ? c !== null : !c || ![
				c.flags,
				c.width,
				c.max_text_width,
				c.extra_bytes
			].every(uint) || !Number.isInteger(c.gap) || c.gap < -32768 || c.gap > 32767 || typeof c.extra_nonzero !== "boolean" || c.extra_bytes === 0 && c.extra_nonzero || row.extra_bytes !== c.extra_bytes + 14) throw new Error("InvalidHwp5DrawingListSources");
		}
		if (row.kind === "caption" ? row.margins !== null || row.last_width !== null || row.body_extra_bytes !== null : !Array.isArray(row.margins) || row.margins.length !== 4 || !Array.from(row.margins).every((value) => Number.isInteger(value) && value >= -32768 && value <= 32767) || !uint(row.last_width) || !uint(row.body_extra_bytes) || row.extra_bytes < 12 || row.body_extra_bytes !== row.extra_bytes - 12) throw new Error("InvalidHwp5DrawingListSources");
	}
	return rows;
}
function decodeHwp5DrawingListSources(bytes) {
	return validateHwp5DrawingListSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_list_sources = __esmMin((() => {}));
// ../../js/hwp5-drawing-matrix-sources.mjs
function validateHwp5DrawingMatrixSources(rows) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingMatrixSources");
	const seen = /* @__PURE__ */ new Set();
	let current;
	for (const row of rows) {
		if (!row || !uint(row.component_node) || !uint(row.owner_node) || row.owner_node >= row.component_node || ![
			"translation",
			"scale",
			"rotation"
		].includes(row.kind) || !Array.isArray(row.bits) || row.bits.length !== 6 || !Array.from(row.bits).every((pair) => Array.isArray(pair) && pair.length === 2 && Array.from(pair).every(uint))) throw new Error("InvalidHwp5DrawingMatrixSources");
		if (!current || current.node !== row.component_node) {
			if (current?.next === "rotation" || seen.has(row.component_node) || row.kind !== "translation" || row.pair !== null) throw new Error("InvalidHwp5DrawingMatrixSources");
			seen.add(row.component_node);
			current = {
				node: row.component_node,
				owner: row.owner_node,
				next: "scale",
				ordinal: 0
			};
		} else {
			if (row.owner_node !== current.owner || row.kind !== current.next || row.pair !== current.ordinal || !uint(row.pair) || row.pair >= 65535) throw new Error("InvalidHwp5DrawingMatrixSources");
			if (row.kind === "rotation") {
				current.next = "scale";
				current.ordinal++;
			} else current.next = "rotation";
		}
	}
	if (current?.next === "rotation") throw new Error("InvalidHwp5DrawingMatrixSources");
	return rows;
}
function decodeHwp5DrawingMatrixSources(bytes) {
	return validateHwp5DrawingMatrixSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_matrix_sources = __esmMin((() => {}));
// ../../js/hwp5-drawing-local-transforms.mjs
function validateHwp5DrawingLocalTransforms(rows) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingLocalTransforms");
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || !uint(row.component_node) || !uint(row.owner_node) || row.owner_node >= row.component_node || !Array.isArray(row.matrix) || row.matrix.length !== 6 || !Array.from(row.matrix).every(Number.isFinite) || seen.has(row.component_node)) throw new Error("InvalidHwp5DrawingLocalTransforms");
		seen.add(row.component_node);
	}
	return rows;
}
function decodeHwp5DrawingLocalTransforms(bytes) {
	return validateHwp5DrawingLocalTransforms(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_local_transforms = __esmMin((() => {}));
// ../../js/hwp5-drawing-rectangle-corners.mjs
function validateHwp5DrawingRectangleCorners(rows) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingRectangleCorners");
	const components = /* @__PURE__ */ new Set(), rectangles = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || !uint(row.component_node) || !uint(row.rectangle_node) || row.component_node >= row.rectangle_node || !uint(row.round_rate) || row.round_rate > 255 || !Array.isArray(row.points) || row.points.length !== 4 || !Array.from(row.points).every((point) => Array.isArray(point) && point.length === 2 && Array.from(point).every(Number.isFinite)) || components.has(row.component_node) || rectangles.has(row.rectangle_node)) throw new Error("InvalidHwp5DrawingRectangleCorners");
		components.add(row.component_node);
		rectangles.add(row.rectangle_node);
		if (Object.hasOwn(row, "raw_points") && (!Array.isArray(row.raw_points) || row.raw_points.length !== 4 || !Array.from(row.raw_points).every((point) => Array.isArray(point) && point.length === 2 && Array.from(point).every((value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647)))) throw new Error("InvalidHwp5DrawingRectangleCorners");
	}
	return rows;
}
function decodeHwp5DrawingRectangleCorners(bytes) {
	return validateHwp5DrawingRectangleCorners(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_rectangle_corners = __esmMin((() => {}));
// ../../js/hwp5-counted-point-layout.mjs
/** Shared explicit counted-coordinate wire layouts; no byte-shape guessing. */
function countedPointLayoutArg(layout, error) {
	if (layout === "specified_i16_axes") return 0;
	if (layout === "observed_i32_points") return 1;
	throw new Error(error);
}
var init_hwp5_counted_point_layout = __esmMin((() => {}));
// ../../js/hwp5-drawing-polygon-points.mjs
function polygonLayoutArg(layout) {
	return countedPointLayoutArg(layout, "InvalidPolygonLayout");
}
function validateHwp5DrawingPolygonPoints(rows) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const pair = (value, valid) => Array.isArray(value) && value.length === 2 && Array.from(value).every(valid);
	const components = /* @__PURE__ */ new Set(), polygons = /* @__PURE__ */ new Set();
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingPolygonPoints");
	for (const row of rows) {
		if (!row || !uint(row.component_node) || !uint(row.polygon_node) || row.component_node >= row.polygon_node || !uint(row.extra_bytes) || components.has(row.component_node) || polygons.has(row.polygon_node) || !Array.isArray(row.raw_points) || !Array.isArray(row.points) || row.raw_points.length !== row.points.length || !Array.from(row.raw_points).every((p) => pair(p, (n) => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647)) || !Array.from(row.points).every((p) => pair(p, Number.isFinite))) throw new Error("InvalidHwp5DrawingPolygonPoints");
		components.add(row.component_node);
		polygons.add(row.polygon_node);
	}
	return rows;
}
function decodeHwp5DrawingPolygonPoints(bytes) {
	return validateHwp5DrawingPolygonPoints(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_polygon_points = __esmMin((() => {
	init_hwp5_counted_point_layout();
}));
// ../../js/hwp5-drawing-curve-points.mjs
function validateHwp5DrawingCurvePoints(rows) {
	const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
	const signed = (v) => Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
	const fail = () => {
		throw new Error("InvalidHwp5DrawingCurvePoints");
	};
	if (!Array.isArray(rows) || rows.length > 1e6) fail();
	const owners = /* @__PURE__ */ new Set();
	for (const [i, r] of rows.entries()) {
		if (!r || !uint(r.component_node) || !uint(r.curve_node) || r.component_node >= r.curve_node || owners.has(r.component_node) || i > 0 && r.curve_node <= rows[i - 1].curve_node || !uint(r.extra_bytes) || !Array.isArray(r.raw_points) || r.raw_points.length > 1e6 || !Array.from(r.raw_points).every((p) => Array.isArray(p) && p.length === 2 && Array.from(p).every(signed)) || !Array.isArray(r.segments) || r.segments.length !== Math.max(0, r.raw_points.length - 1) || !Array.from(r.segments).every((v) => uint(v) && v <= 255)) fail();
		owners.add(r.component_node);
	}
	return rows;
}
function decodeHwp5DrawingCurvePoints(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length > 67108864) throw new Error("InvalidHwp5DrawingCurvePoints");
	return validateHwp5DrawingCurvePoints(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var curveLayoutArg;
var init_hwp5_drawing_curve_points = __esmMin((() => {
	init_hwp5_counted_point_layout();
	curveLayoutArg = (layout) => countedPointLayoutArg(layout, "InvalidCurvePointLayout");
}));
// ../../js/hwp5-drawing-line-endpoints.mjs
function validateHwp5DrawingLineEndpoints(rows) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const pair = (value, valid) => Array.isArray(value) && value.length === 2 && Array.from(value).every((point) => Array.isArray(point) && point.length === 2 && Array.from(point).every(valid));
	const components = /* @__PURE__ */ new Set(), lines = /* @__PURE__ */ new Set();
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5DrawingLineEndpoints");
	for (const row of rows) {
		if (!row || ![
			row.component_node,
			row.owner_node,
			row.line_node,
			row.attributes,
			row.extra_bytes
		].every(uint) || row.owner_node >= row.component_node || row.component_node >= row.line_node || row.attributes > 65535 || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero || !pair(row.points, Number.isFinite) || !pair(row.raw_points, (value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) || components.has(row.component_node) || lines.has(row.line_node)) throw new Error("InvalidHwp5DrawingLineEndpoints");
		components.add(row.component_node);
		lines.add(row.line_node);
	}
	return rows;
}
function decodeHwp5DrawingLineEndpoints(bytes) {
	return validateHwp5DrawingLineEndpoints(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_line_endpoints = __esmMin((() => {}));
// ../../js/hwp5-drawing-style-sources.mjs
function drawingStyleLayoutArgs(options) {
	if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => !["border", "tail"].includes(key))) throw new Error("InvalidDrawingStyleLayout");
	const border = ["spec11", "observed13"].indexOf(options.border);
	const tail = [
		"fill_only",
		"alpha_shadow",
		"alpha_shadow_metadata"
	].indexOf(options.tail);
	if (border < 0 || tail < 0) throw new Error("InvalidDrawingStyleLayout");
	return [border, tail];
}
function validateHwp5DrawingStyleSources(rows) {
	const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
	const uint = (value) => integer(value, 0, 4294967295);
	const byte = (value) => integer(value, 0, 255);
	const signed = (value) => integer(value, -2147483648, 2147483647);
	const optional = (value, check) => value === null || check(value);
	const fail = () => {
		throw new Error("InvalidHwp5DrawingStyleSources");
	};
	if (!Array.isArray(rows)) fail();
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		const b = row?.border;
		if (!row || !uint(row.component_node) || !uint(row.owner_node) || row.owner_node >= row.component_node || seen.has(row.component_node) || !b || !uint(b.color) || !signed(b.width) || !uint(b.attributes?.raw) || !byte(b.outline) || !uint(row.fill_flags) || typeof row.fill_known !== "boolean" || !uint(row.extra_bytes)) fail();
		seen.add(row.component_node);
		if (row.fill_known !== ((row.fill_flags & -8) === 0)) fail();
		const pattern = row.pattern, image = row.image;
		if (!optional(pattern, (p) => p && uint(p.background) && uint(p.foreground) && signed(p.kind)) || !optional(row.gradient_colors, uint) || !optional(row.additional_bytes, uint) || !optional(image, (p) => p && byte(p.mode) && p.picture && integer(p.picture.contrast, -128, 127) && integer(p.picture.brightness, -128, 127) && byte(p.picture.effect) && integer(p.picture.bin_data_id, 0, 65535))) fail();
		if (row.fill_known) {
			if (pattern !== null !== !!(row.fill_flags & 1) || image !== null !== !!(row.fill_flags & 2) || row.gradient_colors !== null !== !!(row.fill_flags & 4) || row.additional_bytes === null) fail();
		} else if ([
			pattern,
			image,
			row.gradient_colors,
			row.additional_bytes,
			row.alpha,
			row.shadow,
			row.metadata
		].some((v) => v !== null)) fail();
		if (row.alpha === null !== (row.shadow === null)) fail();
		if (Object.hasOwn(row, "gradient")) {
			const g = row.gradient;
			if (g === null ? row.gradient_colors !== null : !g || !row.fill_known || !(row.fill_flags & 4) || !byte(g.kind) || ![
				"angle",
				"center_x",
				"center_y",
				"blur"
			].every((key) => uint(g[key])) || !optional(g.blur_center, byte) || !Array.isArray(g.colors) || g.colors.length !== row.gradient_colors || !Array.from(g.colors).every(uint) || !Array.isArray(g.positions) || g.positions.length !== (g.colors.length > 2 ? g.colors.length : 0) || !Array.from(g.positions).every(signed)) fail();
		}
		if (row.alpha !== null) {
			const alpha = row.alpha;
			if (!alpha) fail();
			for (const [key, mask] of [
				["pattern", 1],
				["gradient", 4],
				["image", 2]
			]) if (!optional(alpha[key], byte) || alpha[key] !== null !== !!(row.fill_flags & mask)) fail();
			const s = row.shadow;
			if (!s || !uint(s.kind) || !uint(s.color) || !signed(s.offset_x) || !signed(s.offset_y)) fail();
		}
		if (!optional(row.metadata, (m) => m && uint(m.instance_id) && byte(m.reserved) && byte(m.shadow_alpha)) || row.metadata !== null && row.shadow === null) fail();
	}
	return rows;
}
function decodeHwp5DrawingStyleSources(bytes) {
	return validateHwp5DrawingStyleSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_drawing_style_sources = __esmMin((() => {}));
// ../../js/hwp5-picture-sources.mjs
function picturePrefixArg(prefix) {
	const value = [
		"base73",
		"with_opacity74",
		"with_instance78"
	].indexOf(prefix);
	if (value < 0) throw new Error("InvalidPicturePrefix");
	return value;
}
function validateHwp5PictureSources(rows) {
	const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
	const uint = (value) => integer(value, 0, 4294967295), signed = (value) => integer(value, -2147483648, 2147483647);
	const array = (value, length, valid) => Array.isArray(value) && value.length === length && Array.from(value).every(valid);
	const optional = (value, valid) => value === null || valid(value);
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5PictureSources");
	const components = /* @__PURE__ */ new Set(), pictures = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"component_node",
			"owner_node",
			"picture_node",
			"border_color",
			"border_attributes",
			"extra_bytes"
		].every((key) => uint(row[key])) || row.owner_node >= row.component_node || row.component_node >= row.picture_node || components.has(row.component_node) || pictures.has(row.picture_node) || !signed(row.border_width) || !array(row.points, 4, (point) => array(point, 2, signed)) || !array(row.crop, 4, signed) || !array(row.margins, 4, (value) => integer(value, -32768, 32767)) || !integer(row.contrast, -128, 127) || !integer(row.brightness, -128, 127) || !integer(row.effect, 0, 255) || !integer(row.bin_data_id, 0, 65535) || !optional(row.border_opacity, (value) => integer(value, 0, 255)) || !optional(row.instance_id, uint) || row.instance_id !== null && row.border_opacity === null) throw new Error("InvalidHwp5PictureSources");
		components.add(row.component_node);
		pictures.add(row.picture_node);
	}
	return rows;
}
function decodeHwp5PictureSources(bytes) {
	return validateHwp5PictureSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_picture_sources = __esmMin((() => {}));
// ../../js/hwp5-picture-shadow-source.mjs
function validateHwp5PictureShadowSource(shadow, flags) {
	if (shadow === void 0) return;
	if (shadow === null) {
		if (flags & 1) throw Error("InvalidHwp5PictureShadowSource");
		return;
	}
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const signed = (value) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
	const p = shadow.properties;
	if (!(flags & 1) || !p || ![
		"style",
		"alignment",
		"rotate_with_shape"
	].every((key) => signed(p[key])) || ![
		"transparency_bits",
		"blur_bits",
		"direction_bits",
		"distance_bits",
		"skew_x_bits",
		"skew_y_bits",
		"scale_x_bits",
		"scale_y_bits"
	].every((key) => uint(p[key])) || !signed(shadow.color_type) || !uint(shadow.color_value) || !uint(shadow.color_effect_count)) throw Error("InvalidHwp5PictureShadowSource");
}
var init_hwp5_picture_shadow_source = __esmMin((() => {}));
// ../../js/hwp5-picture-tail-sources.mjs
function pictureTailLayoutArg(layout) {
	const value = [
		"effects_only",
		"dimensions8",
		"with_alpha9"
	].indexOf(layout);
	if (value < 0) throw new Error("InvalidPictureTailLayout");
	return value;
}
function validateHwp5PictureTailSources(rows) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5PictureTailSources");
	const components = /* @__PURE__ */ new Set(), pictures = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"component_node",
			"owner_node",
			"picture_node",
			"instance_id",
			"effects_flags",
			"extra_bytes"
		].every((key) => uint(row[key])) || row.owner_node >= row.component_node || row.component_node >= row.picture_node || components.has(row.component_node) || pictures.has(row.picture_node) || !Number.isInteger(row.border_opacity) || row.border_opacity < 0 || row.border_opacity > 255 || row.effects_flags & -16 || row.image_width === null !== (row.image_height === null) || row.image_width !== null && (!uint(row.image_width) || !uint(row.image_height)) || row.image_alpha !== null && (!Number.isInteger(row.image_alpha) || row.image_alpha < -128 || row.image_alpha > 127 || row.image_width === null)) throw new Error("InvalidHwp5PictureTailSources");
		validateHwp5PictureShadowSource(row.shadow, row.effects_flags);
		components.add(row.component_node);
		pictures.add(row.picture_node);
	}
	return rows;
}
function decodeHwp5PictureTailSources(bytes) {
	return validateHwp5PictureTailSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_picture_tail_sources = __esmMin((() => {
	init_hwp5_picture_shadow_source();
}));
// ../../js/paragraph-margin-args.mjs
function paragraphMarginArgs(margins) {
	const names = [
		"left",
		"right",
		"indent",
		"before",
		"after"
	];
	if (!margins || typeof margins !== "object" || Array.isArray(margins) || Object.keys(margins).some((key) => !names.includes(key))) throw new TypeError("InvalidParagraphMargins");
	let mask = 0;
	const values = names.map((key, index) => {
		if (!Object.hasOwn(margins, key) || margins[key] === null) return 0;
		const value = margins[key];
		if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw new RangeError("InvalidParagraphMargins");
		mask |= 1 << index;
		return value;
	});
	return [mask, ...values];
}
var init_paragraph_margin_args = __esmMin((() => {}));
// ../../js/paragraph-spacing-args.mjs
function paragraphSpacingArgs(type, value) {
	const kind = paragraphSpacingTypes.indexOf(type);
	if (kind < 0 || !Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw new RangeError("InvalidParagraphSpacing");
	return [kind, value];
}
var paragraphSpacingTypes;
var init_paragraph_spacing_args = __esmMin((() => {
	paragraphSpacingTypes = Object.freeze([
		"PERCENT",
		"FIXED",
		"BETWEEN_LINES",
		"AT_LEAST"
	]);
}));
// ../../js/character-property-args.mjs
function characterPropertyArgs(properties) {
	const names = [
		"size",
		"bold",
		"italic"
	];
	if (!properties || typeof properties !== "object" || Array.isArray(properties) || Object.keys(properties).some((key) => !names.includes(key))) throw new TypeError("InvalidCharacterProperties");
	let mask = 0;
	const values = names.map((key, index) => {
		if (!Object.hasOwn(properties, key) || properties[key] === null) return 0;
		const value = properties[key];
		if (key === "size") {
			if (!Number.isInteger(value) || value < 0 || value > 409600) throw new RangeError("InvalidCharacterSize");
		} else if (typeof value !== "boolean") throw new TypeError("InvalidCharacterProperties");
		mask |= 1 << index;
		return key === "size" ? value : Number(value);
	});
	return [mask, ...values];
}
var init_character_property_args = __esmMin((() => {}));
// ../../js/character-range-batch.mjs
/** 선택 구간의 검증·wire 인코딩만 담당합니다. 문단 번호는 바꾸지 않습니다. */
function encodeCharacterRanges(ranges) {
	if (!Array.isArray(ranges)) throw new TypeError("InvalidCharacterRanges");
	if (ranges.length > 4096) throw new RangeError("LimitExceeded");
	const bytes = new Uint8Array(ranges.length * 16);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < ranges.length; i++) {
		const range = ranges[i];
		const names = [
			"section",
			"paragraph",
			"startUnit",
			"endUnit"
		];
		if (!range || typeof range !== "object" || Array.isArray(range) || Object.keys(range).some((key) => !names.includes(key))) throw new TypeError("InvalidCharacterRanges");
		const values = names.map((name) => {
			const value = range[name];
			if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError("InvalidTextPosition");
			return value;
		});
		if (values[3] < values[2]) throw new RangeError("InvalidTextPosition");
		values.forEach((value, j) => view.setUint32(i * 16 + j * 4, value, true));
	}
	return bytes;
}
var init_character_range_batch = __esmMin((() => {}));
// ../../js/paragraph-replacement.mjs
function normalizeParagraphReplacement(text) {
	return text.replace(/\r\n?/g, "\n");
}
function encodeParagraphReplacement(text) {
	if (typeof text !== "string" || !text.isWellFormed()) throw new TypeError("InvalidText");
	if (text.length > 4194304) throw new RangeError("LimitExceeded");
	const bytes = new TextEncoder().encode(normalizeParagraphReplacement(text));
	if (bytes.length > 4194304) throw new RangeError("LimitExceeded");
	return bytes;
}
var init_paragraph_replacement = __esmMin((() => {}));
// ../../js/character-underline-args.mjs
function characterUnderlineArg(kind) {
	const value = [
		"none",
		"bottom",
		"center",
		"top"
	].indexOf(kind);
	if (value < 0) throw new TypeError("InvalidCharacterUnderlineKind");
	return value;
}
var init_character_underline_args = __esmMin((() => {}));
// ../../js/character-color-args.mjs
function characterColorArg(color) {
	const value = parseCharacterColor(color);
	if (value === null) throw new TypeError("InvalidCharacterColor");
	return value;
}
function parseCharacterColor(color) {
	return typeof color === "string" && color.length === 7 && /^#[0-9a-f]{6}$/i.test(color) ? Number.parseInt(color.slice(1), 16) : null;
}
var init_character_color_args = __esmMin((() => {}));
// ../../js/character-shade-args.mjs
/** null explicitly removes shading; undefined is never an editing default. */
function characterShadeArgs(color) {
	return color === null ? [0, 0] : [1, characterColorArg(color)];
}
var init_character_shade_args = __esmMin((() => {
	init_character_color_args();
}));
// ../../js/character-shades.mjs
function decodeCharacterShades(bytes) {
	const rows = decodeCharacterSnapshot(bytes, [
		"id",
		"state",
		"color"
	], "InvalidCharacterShades");
	for (const row of rows) if (![
		"absent",
		"none",
		"color",
		"unknown"
	].includes(row.state) || (row.state === "color" ? !Number.isInteger(row.color) || row.color < 0 || row.color > 16777215 : row.color !== null)) throw new Error("InvalidCharacterShades");
	return rows;
}
var init_character_shades = __esmMin((() => {
	init_character_snapshot_json();
}));
// ../../js/font-faces.mjs
function decodeFontFaces(bytes) {
	const fail = () => {
		throw new Error("InvalidFontFaces");
	};
	if (!(bytes instanceof Uint8Array)) return fail();
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!Array.isArray(rows) || rows.length > 1e6) return fail();
	for (const row of rows) {
		if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== 3 || ![
			"language",
			"id",
			"name"
		].every((key) => Object.hasOwn(row, key))) return fail();
		if (row.name !== null && (typeof row.name !== "string" || !row.name.isWellFormed() || new TextEncoder().encode(row.name).length > 4096)) return fail();
	}
	if (!validFontFaceOrder(rows)) return fail();
	return rows;
}
var init_font_faces = __esmMin((() => {
	init_font_face_identity();
}));
// ../../js/character-font-args.mjs
function characterFontArgs(language, fontId) {
	const index = FONT_LANGUAGES.indexOf(language);
	if (index < 0) throw new RangeError("InvalidCharacterFontLanguage");
	if (!Number.isInteger(fontId) || fontId < 0 || fontId > 4294967295) throw new RangeError("InvalidFontId");
	return [index, fontId];
}
var init_character_font_args = __esmMin((() => {
	init_font_faces();
}));
// ../../js/character-font-name-args.mjs
function characterFontNameArgs(language, name) {
	const index = characterFontArgs(language, 0)[0];
	if (typeof name !== "string") throw new TypeError("InvalidFontName");
	for (let i = 0; i < name.length; i++) {
		const unit = name.charCodeAt(i);
		if (unit >= 55296 && unit <= 56319) {
			const next = name.charCodeAt(++i);
			if (!(next >= 56320 && next <= 57343)) throw new RangeError("InvalidFontName");
		} else if (unit >= 56320 && unit <= 57343) throw new RangeError("InvalidFontName");
	}
	const bytes = new TextEncoder().encode(name);
	if (bytes.length === 0) throw new RangeError("InvalidFontName");
	if (bytes.length > 4096) throw new RangeError("LimitExceeded");
	return {
		language: index,
		bytes
	};
}
var init_character_font_name_args = __esmMin((() => {
	init_character_font_args();
}));
// ../../js/text-transaction-args.mjs
function textTransactionArgs({ section, paragraph, startUnit, endUnit, text }) {
	const positions = [
		section,
		paragraph,
		startUnit,
		endUnit
	];
	if (positions.some((value) => !Number.isInteger(value) || value < 0 || value > 4294967295) || endUnit < startUnit) throw new RangeError("InvalidTextPosition");
	if (typeof text !== "string") throw new TypeError("Text must be a string");
	if (!text.isWellFormed()) throw new RangeError("InvalidUnicodeEncoding");
	if (text.length === 0 || startUnit + text.length > 4294967295) throw new RangeError("InvalidTextPosition");
	if (text.length > 4194304) throw new RangeError("LimitExceeded");
	const bytes = new TextEncoder().encode(text);
	if (bytes.length > 4194304) throw new RangeError("LimitExceeded");
	return {
		positions,
		bytes
	};
}
var init_text_transaction_args = __esmMin((() => {}));
// ../../js/named-font-text-args.mjs
function namedFontTextArgs({ section, paragraph, startUnit, endUnit, text, language, name }) {
	const { positions, bytes } = textTransactionArgs({
		section,
		paragraph,
		startUnit,
		endUnit,
		text
	});
	return {
		positions,
		bytes,
		font: characterFontNameArgs(language, name)
	};
}
var init_named_font_text_args = __esmMin((() => {
	init_character_font_name_args();
	init_text_transaction_args();
}));
// ../../js/character-underlines.mjs
function decodeCharacterUnderlines(bytes) {
	const rows = decodeCharacterSnapshot(bytes, ["id", "kind"], "InvalidCharacterUnderlines");
	for (const row of rows) if (![
		null,
		"none",
		"bottom",
		"center",
		"top"
	].includes(row.kind)) throw new Error("InvalidCharacterUnderlines");
	return rows;
}
var init_character_underlines = __esmMin((() => {
	init_character_snapshot_json();
}));
// ../../js/character-strikes.mjs
function decodeCharacterStrikes(bytes) {
	const rows = decodeCharacterSnapshot(bytes, ["id", "enabled"], "InvalidCharacterStrikes");
	for (const row of rows) if (row.enabled !== null && typeof row.enabled !== "boolean") throw new Error("InvalidCharacterStrikes");
	return rows;
}
var init_character_strikes = __esmMin((() => {
	init_character_snapshot_json();
}));
// ../../js/character-strike-styles.mjs
function decodeCharacterStrikeStyles(bytes) {
	const rows = decodeCharacterSnapshot(bytes, [
		"id",
		"raw_style",
		"raw_color",
		"shape",
		"color"
	], "InvalidCharacterStrikeStyles");
	const text = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
	const color = (value) => value === null || Number.isInteger(value) && value >= 0 && value <= 4294967295;
	for (const row of rows) if (row.raw_style !== null ? !Number.isInteger(row.raw_style) || row.raw_style < 0 || row.raw_style > 15 || !color(row.raw_color) || row.shape !== null || row.color !== null : row.raw_color !== null || !text(row.shape) || !text(row.color)) throw new Error("InvalidCharacterStrikeStyles");
	return rows;
}
var init_character_strike_styles = __esmMin((() => {
	init_character_snapshot_json();
}));
// ../../js/character-text-colors.mjs
function decodeCharacterTextColors(bytes) {
	const rows = decodeCharacterSnapshot(bytes, ["id", "color"], "InvalidCharacterTextColors");
	for (const row of rows) if (row.color !== null && (!Number.isInteger(row.color) || row.color < 0 || row.color > 16777215)) throw new Error("InvalidCharacterTextColors");
	return rows;
}
var init_character_text_colors = __esmMin((() => {
	init_character_snapshot_json();
}));
// ../../js/character-font-references.mjs
function decodeCharacterFontReferences(bytes) {
	const rows = decodeCharacterSnapshot(bytes, ["id", "fontIds"], "InvalidCharacterFontReferences");
	for (const row of rows) if (row.fontIds !== null && (!Array.isArray(row.fontIds) || row.fontIds.length !== FONT_LANGUAGES.length || row.fontIds.some((id) => id !== null && (!Number.isInteger(id) || id < 0 || id > 4294967295)))) throw new Error("InvalidCharacterFontReferences");
	return rows;
}
var init_character_font_references = __esmMin((() => {
	init_character_snapshot_json();
	init_font_faces();
}));
// ../../js/font-face-metadata.mjs
/** Optional v1 display metadata; the existing fontFaces wire stays unchanged. */
function decodeFontFaceMetadata(bytes) {
	const fail = () => {
		throw new Error("InvalidFontFaceMetadata");
	};
	const rows = decodeMetadataWire(bytes, "InvalidFontFaceMetadata");
	for (const row of rows) {
		if (!metadataKeys(row, [
			"language",
			"id",
			"attributes",
			"substitute",
			"typeInfo",
			"defaultName"
		])) return fail();
		if (!Number.isInteger(row.attributes) || row.attributes < 0 || row.attributes > 255) return fail();
		if (row.attributes & 128) {
			if (!metadataKeys(row.substitute, ["kind", "name"]) || !Number.isInteger(row.substitute.kind) || row.substitute.kind < 0 || row.substitute.kind > 255 || !metadataText(row.substitute.name)) return fail();
		} else if (row.substitute !== null) return fail();
		if (row.attributes & 64) {
			if (!Array.isArray(row.typeInfo) || row.typeInfo.length !== 10 || row.typeInfo.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return fail();
		} else if (row.typeInfo !== null) return fail();
		if (!metadataText(row.defaultName) || !(row.attributes & 32) && row.defaultName !== null) return fail();
	}
	return rows;
}
var init_font_face_metadata = __esmMin((() => {
	init_font_metadata_wire();
}));
// ../../js/character-underline-styles.mjs
function decodeCharacterUnderlineStyles(bytes) {
	const rows = decodeCharacterSnapshot(bytes, [
		"id",
		"raw_style",
		"raw_color",
		"shape",
		"color"
	], "InvalidCharacterUnderlineStyles");
	const text = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
	for (const row of rows) {
		const raw = row.raw_style !== null;
		if (raw && (!Number.isInteger(row.raw_style) || row.raw_style < 0 || row.raw_style > 15 || !Number.isInteger(row.raw_color) || row.raw_color < 0 || row.raw_color > 4294967295 || row.shape !== null || row.color !== null) || !raw && (row.raw_color !== null || !text(row.shape) || !text(row.color))) throw new Error("InvalidCharacterUnderlineStyles");
	}
	return rows;
}
var init_character_underline_styles = __esmMin((() => {
	init_character_snapshot_json();
}));
// ../../js/wasm-memory.mjs
/** All JS/WASM copies and temporary allocation ownership live here. */
function createMemory(wasm) {
	const decoder = new TextDecoder();
	const copy = (ptr, length) => length === 0 ? /* @__PURE__ */ new Uint8Array(0) : new Uint8Array(wasm.memory.buffer, ptr >>> 0, length).slice();
	const withBytes = (bytes, fn, secret = false) => {
		const ptr = wasm.cfb_alloc(bytes.length) >>> 0;
		if (!ptr) throw new Error("OutOfMemory");
		try {
			new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
			return fn(ptr, bytes.length);
		} finally {
			if (secret) new Uint8Array(wasm.memory.buffer, ptr, Math.max(bytes.length, 1)).fill(0);
			wasm.cfb_free(ptr, bytes.length);
		}
	};
	return {
		copy,
		error: () => new Error(decoder.decode(copy(wasm.cfb_error_ptr(), wasm.cfb_error_len()))),
		withBytes,
		withSecretBytes: (bytes, fn) => withBytes(bytes, fn, true)
	};
}
var init_wasm_memory = __esmMin((() => {}));
var init_output_bytes = __esmMin((() => {
	typeof Buffer !== "undefined" && typeof process !== "undefined" && process.versions?.node && Buffer;
}));
// ../../js/input.mjs
function inputBytes(data) {
	if (ArrayBuffer.isView(data) && typedArrayName.call(data) === "Uint8Array") return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	let isBuffer = false;
	try {
		bufferLength.call(data);
		isBuffer = true;
	} catch {}
	if (isBuffer) return new Uint8Array(data);
	if (!Array.isArray(data)) throw new TypeError("Expected Uint8Array, ArrayBuffer, or an array of bytes");
	const bytes = new Uint8Array(data.length);
	for (let i = 0; i < bytes.length; i++) {
		const value = data[i];
		if (!Number.isInteger(value) || value < 0 || value > 255) throw new TypeError(`Invalid byte at index ${i}`);
		bytes[i] = value;
	}
	return bytes;
}
var bufferLength, typedArrayName;
var init_input = __esmMin((() => {
	init_output_bytes();
	bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
	typedArrayName = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
}));
// ../../js/editor-history.mjs
/** Optional additive native history ABI shared by both format adapters. */
function createHistoryApi({ wasm, memory, check, uint, prefix, unavailable }) {
	const travel = (kind) => {
		check();
		const action = wasm[`${prefix}_${kind}`];
		if (typeof action !== "function") throw new Error(unavailable);
		const value = action();
		if (value !== 0 && value !== 1) throw memory.error();
		return value === 1;
	};
	let legacyPolicy;
	let negotiation;
	const api = {
		historyRevisions() {
			check();
			const count = wasm[`${prefix}_history_revision_count`], at = wasm[`${prefix}_history_revision_at`];
			if (typeof count !== "function" || typeof at !== "function") throw new Error(unavailable);
			const length = count();
			if (!Number.isInteger(length) || length < 1 || length > 65536) throw memory.error();
			const revisions = Array.from({ length }, (_, index) => at(index));
			if (revisions.some((value) => !Number.isInteger(value) || value < 0 || value >= 4294967295) || new Set(revisions).size !== length) throw memory.error();
			return revisions;
		},
		historyRevision() {
			check();
			const action = wasm[`${prefix}_history_revision`];
			if (typeof action !== "function") throw new Error(unavailable);
			const value = action();
			if (!Number.isInteger(value) || value < 0 || value >= 4294967295) throw memory.error();
			return value;
		},
		enableHistory({ maxEntries = 16, maxCheckpointBytes = 8388608 } = {}) {
			check();
			uint(maxEntries, "maxEntries");
			uint(maxCheckpointBytes, "maxCheckpointBytes");
			const action = wasm[`${prefix}_history_enable`];
			if (typeof action !== "function") throw new Error(unavailable);
			if (action(maxEntries, maxCheckpointBytes) !== 1) throw memory.error();
			legacyPolicy = Object.freeze({
				maxEntries,
				maxCheckpointBytes
			});
			negotiation = "explicit-v1";
		},
		historyV2Available() {
			check();
			return typeof wasm[`${prefix}_history_enable_options`] === "function" && typeof wasm[`${prefix}_history_stats`] === "function";
		},
		enableHistoryV2(options = {}) {
			check();
			if (!api.historyV2Available()) throw new Error("HistoryV2AbiUnavailable");
			if (options === null || typeof options !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw new TypeError("InvalidHistoryOptions");
			const allowed = /* @__PURE__ */ new Set([
				"maxEntries",
				"maxCheckpointBytes",
				"maxCheckpointOwnedBytes",
				"maxRetainedBytes"
			]);
			const clean = {};
			for (const key of Reflect.ownKeys(options)) {
				const d = Object.getOwnPropertyDescriptor(options, key);
				if (!allowed.has(key) || !d || !("value" in d)) throw new TypeError("InvalidHistoryOptions");
				uint(d.value, key);
				clean[key] = d.value;
			}
			const bytes = new TextEncoder().encode(JSON.stringify(clean));
			memory.withBytes(bytes, (ptr, length) => {
				if (wasm[`${prefix}_history_enable_options`](ptr, length) !== 1) throw memory.error();
			});
			negotiation = "explicit-v2";
		},
		enableHistoryDefault(options) {
			check();
			if (options !== void 0) {
				const mode = options && typeof options === "object" ? Object.getOwnPropertyDescriptor(options, "mode") : void 0;
				if (mode && "value" in mode && mode.value === "legacy-v1") {
					if (![Object.prototype, null].includes(Object.getPrototypeOf(options))) throw new TypeError("InvalidHistoryOptions");
					const clean = {};
					for (const key of Reflect.ownKeys(options)) {
						const d = Object.getOwnPropertyDescriptor(options, key);
						if (![
							"mode",
							"maxEntries",
							"maxCheckpointBytes"
						].includes(key) || !d || !("value" in d)) throw new TypeError("InvalidHistoryOptions");
						if (key !== "mode") {
							uint(d.value, key);
							clean[key] = d.value;
						}
					}
					api.enableHistory(clean);
					return;
				}
				api.enableHistoryV2(options);
				return;
			}
			if (api.historyV2Available()) {
				api.enableHistoryV2({});
				negotiation = "native-default-v2";
			} else {
				api.enableHistory();
				negotiation = "negotiated-legacy-v1";
			}
		},
		historyStats() {
			check();
			const action = wasm[`${prefix}_history_stats`];
			if (typeof action !== "function") {
				if (!legacyPolicy) throw new Error("HistoryNotEnabled");
				return Object.freeze({
					protocolVersion: 1,
					negotiation,
					requested: legacyPolicy,
					resolved: legacyPolicy,
					retainedBytes: null,
					metadataOwnedBytes: null,
					currentOwnedBytes: null,
					undoOwnedBytes: null,
					redoOwnedBytes: null,
					evictedCount: null,
					policySource: "legacy-abi-success"
				});
			}
			if (action() !== 1) throw memory.error();
			try {
				const bytes = memory.copy(wasm[`${prefix}_output_ptr`](), wasm[`${prefix}_output_len`]());
				return {
					...JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
					negotiation
				};
			} finally {
				wasm[`${prefix}_output_free`]();
			}
		},
		undo: () => travel("undo"),
		redo: () => travel("redo")
	};
	return api;
}
var init_editor_history = __esmMin((() => {}));
// ../../js/paragraph-break-api.mjs
function createParagraphBreakApi({ wasm, memory, check, uint, prefix, endAsCount, unavailable }) {
	const name = `${prefix}_split_with_break`;
	return {
		supportsParagraphBreaks() {
			check();
			return typeof wasm[name] === "function";
		},
		splitParagraphWithBreak({ section, paragraph, atUnit, endUnit = atUnit, kind }) {
			check();
			const values = [
				section,
				paragraph,
				atUnit,
				endUnit
			];
			for (const [index, label] of [
				"section",
				"paragraph",
				"atUnit",
				"endUnit"
			].entries()) uint(values[index], label);
			if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
			if (kind !== "page" && kind !== "column") throw new Error("InvalidParagraphBreakKind");
			if (typeof wasm[name] !== "function") throw new Error(unavailable);
			if (wasm[name](section, paragraph, atUnit, endAsCount ? endUnit - atUnit : endUnit, kind === "page" ? 1 : 2) !== 1) throw memory.error();
		}
	};
}
var init_paragraph_break_api = __esmMin((() => {}));
// ../../js/character-shapes-wire.mjs
/** HCS1 read-only resources; signed native height, not CSS pixels. */
function decodeCharacterShapes(bytes) {
	const fail = () => {
		throw new Error("InvalidCharacterShapes");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== 827540296) return fail();
	const count = view.getUint32(4, true);
	if (count > 1e6 || bytes.length !== 8 + count * 12) return fail();
	let previous = -1;
	return Array.from({ length: count }, (_, index) => {
		const offset = 8 + index * 12, id = view.getUint32(offset, true), rawHeight = view.getInt32(offset + 4, true), flags = view.getUint32(offset + 8, true);
		if (id <= previous || flags > 7 || !(flags & 1) && rawHeight !== 0) return fail();
		previous = id;
		return {
			id,
			height: flags & 1 ? rawHeight : null,
			bold: Boolean(flags & 2),
			italic: Boolean(flags & 4)
		};
	});
}
function decodeCharacterRanges(bytes) {
	const fail = () => {
		throw new Error("InvalidCharacterRanges");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== 827474760) return fail();
	const count = view.getUint32(4, true);
	if (count > 1e6 || bytes.length !== 8 + count * 16) return fail();
	let cursor = 0;
	return Array.from({ length: count }, (_, index) => {
		const offset = 8 + index * 16, start = view.getUint32(offset, true), end = view.getUint32(offset + 4, true), id = view.getUint32(offset + 8, true), flags = view.getUint32(offset + 12, true);
		if (start !== cursor || end < start || flags > 1 || flags === 0 && id !== 0) return fail();
		cursor = end;
		return {
			start,
			end,
			charShapeId: flags ? id : null
		};
	});
}
var init_character_shapes_wire = __esmMin((() => {}));
// ../../js/table-bindings-wire.mjs
/** HTB1 read-only cell source bindings. Sizes are raw HWP units, not pixels. */
function decodeTableBindings(bytes) {
	const fail = () => {
		throw new Error("InvalidTableBindings");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const magic = view.getUint32(0, true), optional = magic === 827872328;
	if (!optional && magic !== 826430536) return fail();
	const stride = optional ? 48 : 44;
	const count = view.getUint32(4, true);
	if (count > 1e5 || bytes.length !== 8 + count * stride) return fail();
	let previous = -1;
	return Array.from({ length: count }, (_, index) => {
		const row = {};
		for (const [column, field] of [
			"paragraph",
			"tableNode",
			"listNode",
			"rows",
			"columns",
			"row",
			"column",
			"rowSpan",
			"columnSpan",
			"width",
			"height"
		].entries()) row[field] = view.getUint32(8 + index * stride + column * 4, true);
		if (optional) {
			const flags = view.getUint32(8 + index * stride + 44, true);
			if (flags & -4 || !(flags & 1) && row.width !== 0 || !(flags & 2) && row.height !== 0 || row.paragraph === 0) return fail();
			if (!(flags & 1)) row.width = null;
			if (!(flags & 2)) row.height = null;
		}
		if (row.paragraph <= previous || !row.rows || !row.columns || !row.rowSpan || !row.columnSpan || row.row >= row.rows || row.column >= row.columns || row.rowSpan > row.rows - row.row || row.columnSpan > row.columns - row.column) return fail();
		previous = row.paragraph;
		return row;
	});
}
var init_table_bindings_wire = __esmMin((() => {}));
// ../../js/table-placements-wire.mjs
function decodeTablePlacements(bytes, format = "hwpx") {
	const fail = () => {
		throw new Error("InvalidTablePlacements");
	};
	if (!["hwp5", "hwpx"].includes(format) || !(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = view.getUint32(4, true);
	const magic = view.getUint32(0, true), hasAnchor = format === "hwpx" && magic === 844125256, stride = hasAnchor ? 28 : 20;
	if (!hasAnchor && magic !== (format === "hwp5" ? 894456904 : 827348040) || count > 1e5 || bytes.length !== 8 + count * stride) return fail();
	const seen = /* @__PURE__ */ new Set();
	const rows = Array.from({ length: count }, (_, index) => {
		const at = 8 + index * stride;
		const [tableNode, paragraph, parentTable, parentList, flags] = Array.from({ length: 5 }, (_, column) => view.getUint32(at + column * 4, true));
		if (format === "hwpx" && !paragraph || flags > 1 || seen.has(tableNode) || !flags && (parentTable || parentList) || flags && parentTable === tableNode) return fail();
		seen.add(tableNode);
		const anchorUnit = hasAnchor ? view.getUint32(at + 20, true) : 0, anchorPresent = hasAnchor ? view.getUint32(at + 24, true) : 0;
		if (anchorPresent > 1 || !anchorPresent && anchorUnit !== 0) return fail();
		return {
			tableNode,
			paragraph,
			parentTableNode: flags ? parentTable : null,
			parentListNode: flags ? parentList : null,
			...hasAnchor ? { anchorUnit: anchorPresent ? anchorUnit : null } : {}
		};
	});
	const byNode = new Map(rows.map((row) => [row.tableNode, row])), checked = /* @__PURE__ */ new Set();
	for (const row of rows) {
		let node = row;
		const path = /* @__PURE__ */ new Set();
		while (node && !checked.has(node.tableNode)) {
			if (path.has(node.tableNode)) return fail();
			path.add(node.tableNode);
			if (node.parentTableNode === null) break;
			node = byNode.get(node.parentTableNode);
			if (!node) return fail();
		}
		for (const node of path) checked.add(node);
	}
	return rows;
}
var init_table_placements_wire = __esmMin((() => {}));
// ../../js/paragraph-shapes-wire.mjs
/** HPS1/HPS2 resources; raw absence and effective heading levels stay distinct. */
function decodeParagraphShapes(bytes) {
	const fail = () => {
		throw new Error("InvalidParagraphShapes");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const count = view.getUint32(4, true);
	const magic = view.getUint32(0, true);
	const stride = magic === 827543624 ? 48 : magic === 844320840 ? 72 : 0;
	if (!stride || count > 1e5 || bytes.length !== 8 + count * stride) return fail();
	return Array.from({ length: count }, (_, index) => {
		const at = 8 + index * stride, uint = (offset) => view.getUint32(at + offset, true), int = (offset) => view.getInt32(at + offset, true);
		if (uint(0) !== index || uint(4) > 7 || uint(28) > 3 || uint(36) > 1 || !uint(36) && (uint(40) !== 0 || int(44) !== 0)) return fail();
		const shape = {
			id: index,
			alignment: uint(4),
			left: int(8),
			right: int(12),
			indent: int(16),
			before: int(20),
			after: int(24),
			legacySpacingKind: uint(28),
			legacySpacing: int(32),
			modernSpacing: uint(36) ? {
				attributes: uint(40),
				value: int(44)
			} : null
		};
		if (stride === 72) {
			if (uint(48) > 3 || uint(52) > 65535 || uint(56) > 7 || uint(60) > 1 || !uint(60) && uint(64) !== 0 || uint(68) !== (uint(60) ? uint(64) : uint(56))) return fail();
			Object.assign(shape, {
				headingKind: uint(48),
				headingId: uint(52),
				packedHeadingLevel: uint(56),
				extendedHeadingLevel: uint(60) ? uint(64) : null,
				headingLevel: uint(68)
			});
		}
		return shape;
	});
}
var init_paragraph_shapes_wire = __esmMin((() => {}));
// ../../js/hwp5-page-settings.mjs
/** Source declaration only; no physical page number or current paragraph flow. */
function decodeHwp5PageSettings(bytes) {
	return validateHwp5PageSettings(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateHwp5PageSettings(row) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!row || ![
		"source_node",
		"width",
		"height",
		"left",
		"right",
		"top",
		"bottom",
		"header",
		"footer",
		"gutter",
		"flags",
		"extra_bytes"
	].every((name) => uint(row[name])) || !["narrowly", "widely"].includes(row.orientation) || ![
		"one_side",
		"facing",
		"top"
	].includes(row.binding)) throw new Error("InvalidHwp5PageSettings");
	if (row.orientation !== (row.flags & 1 ? "widely" : "narrowly") || row.binding !== [
		"one_side",
		"facing",
		"top"
	][row.flags >>> 1 & 3]) throw new Error("InvalidHwp5PageSettings");
	return row;
}
var init_hwp5_page_settings = __esmMin((() => {}));
// ../../js/hwp5-section-settings.mjs
function decodeHwp5SectionSettings(bytes) {
	const row = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
	if (!row || ![
		"source_node",
		"flags",
		"tab_spacing",
		"extra_bytes"
	].every((key) => uint(row[key])) || ![
		"column_gap",
		"vertical_grid",
		"horizontal_grid"
	].every((key) => Number.isInteger(row[key]) && row[key] >= -32768 && row[key] <= 32767) || ![
		"numbering_id",
		"page_start",
		"picture_start",
		"table_start",
		"equation_start"
	].every((key) => uint(row[key], 65535)) || !(row.language === null || uint(row.language, 65535)) || typeof row.extra_nonzero !== "boolean" || row.extra_bytes === 0 && row.extra_nonzero) throw new Error("InvalidHwp5SectionSettings");
	if (Object.hasOwn(row, "extra_raw") && (!Array.isArray(row.extra_raw) || row.extra_raw.length !== row.extra_bytes || !Array.from(row.extra_raw).every((byte) => uint(byte, 255)) || row.extra_raw.some((byte) => byte !== 0) !== row.extra_nonzero)) throw new Error("InvalidHwp5SectionSettings");
	if (Object.hasOwn(row, "memo_shape_count") && row.memo_shape_count !== null && !uint(row.memo_shape_count)) throw new Error("InvalidHwp5SectionSettings");
	if (Object.hasOwn(row, "memo_list_count") && !uint(row.memo_list_count)) throw new Error("InvalidHwp5SectionSettings");
	if (Object.hasOwn(row, "observed_extension") && row.observed_extension !== null) {
		const extension = row.observed_extension;
		if (!extension || typeof extension !== "object" || Array.isArray(extension) || row.language === null || row.extra_bytes !== 17 || !Array.isArray(row.extra_raw)) throw new Error("InvalidHwp5SectionSettings");
		const view = new DataView(Uint8Array.from(row.extra_raw).buffer);
		for (const [key, offset, method] of [
			[
				"leading_count_raw",
				0,
				"getUint32"
			],
			[
				"memo_shape_id_ref",
				4,
				"getUint16"
			],
			[
				"flags_raw",
				6,
				"getUint16"
			],
			[
				"line_number_restart_raw",
				8,
				"getUint8"
			],
			[
				"line_number_count_by",
				9,
				"getUint16"
			],
			[
				"line_number_distance_raw",
				11,
				"getUint32"
			],
			[
				"line_number_start",
				15,
				"getUint16"
			]
		]) if (extension[key] !== view[method](offset, true)) throw new Error("InvalidHwp5SectionSettings");
		const direction = extension.flags_raw >>> 1 & 7;
		if ([
			"text_direction_raw",
			"text_direction",
			"text_vertical_width_head",
			"unknown_flags"
		].some((key) => Object.hasOwn(extension, key)) && (extension.text_direction_raw !== direction || extension.text_direction !== ([
			"HORIZONTAL",
			"VERTICAL",
			"VERTICALALL"
		][direction] ?? null) || extension.text_vertical_width_head !== Boolean(extension.flags_raw & 16) || extension.unknown_flags !== (extension.flags_raw & 65505))) throw new Error("InvalidHwp5SectionSettings");
		if (!Array.isArray(extension.trailing_raw) || extension.trailing_raw.length !== 11 || Array.from(extension.trailing_raw).some((byte, index) => byte !== row.extra_raw[index + 6])) throw new Error("InvalidHwp5SectionSettings");
	}
	return row;
}
var init_hwp5_section_settings = __esmMin((() => {}));
// ../../js/hwp5-table-layout-sources.mjs
function decodeHwp5TableLayoutSources(bytes) {
	return validateHwp5TableLayoutSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateHwp5TableLayoutSources(rows) {
	const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
	const signed = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5TableLayoutSources");
	for (const row of rows) {
		if (row && Object.hasOwn(row, "object_extra_u16") && row.object_extra_u16 !== null && (!uint(row.object_extra_u16, 65535) || row.object_extra_bytes !== 2)) throw new Error("InvalidHwp5TableLayoutSources");
		if (!row || ![
			"table_node",
			"table_record_node",
			"object_flags",
			"width",
			"height",
			"instance_id",
			"object_extra_bytes",
			"table_flags",
			"table_extra_bytes"
		].every((key) => uint(row[key])) || ![
			"offset_y",
			"offset_x",
			"z_order",
			"prevent_page_break"
		].every((key) => signed(row[key], -2147483648, 2147483647)) || ![
			"rows",
			"columns",
			"border_fill_id"
		].every((key) => uint(row[key], 65535)) || !signed(row.cell_spacing, -32768, 32767) || !["outer_margins", "inner_margins"].every((key) => Array.isArray(row[key]) && row[key].length === 4 && row[key].every((value) => signed(value, -32768, 32767))) || !["description_bytes", "zone_count"].every((key) => row[key] === null || uint(row[key])) || row.description_bytes !== null && row.description_bytes % 2 !== 0) throw new Error("InvalidHwp5TableLayoutSources");
	}
	return rows;
}
var init_hwp5_table_layout_sources = __esmMin((() => {}));
// ../../js/hwp5-cell-layout-sources.mjs
function decodeHwp5CellLayoutSources(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value, max = 4294967295) => Number.isInteger(value) && value >= 0 && value <= max;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5CellLayoutSources");
	const lists = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"table_record_node",
			"list_node",
			"attributes",
			"extra_bytes"
		].every((key) => uint(row[key])) || !uint(row.border_fill_id, 65535) || !(row.unknown === null || uint(row.unknown, 65535)) || !Array.isArray(row.margins) || row.margins.length !== 4 || !row.margins.every((value) => Number.isInteger(value) && value >= -32768 && value <= 32767) || row.text_direction !== (row.attributes & 7) || row.line_wrap !== (row.attributes >>> 3 & 3) || row.vertical_alignment !== (row.attributes >>> 5 & 3)) throw new Error("InvalidHwp5CellLayoutSources");
		for (const [field, bit] of [
			["has_margin", 16],
			["protected", 17],
			["header", 18],
			["editable", 19]
		]) if (row[field] !== Boolean(row.attributes & 1 << bit)) throw new Error("InvalidHwp5CellLayoutSources");
		if (lists.has(row.list_node)) throw new Error("InvalidHwp5CellLayoutSources");
		lists.add(row.list_node);
	}
	return rows;
}
var init_hwp5_cell_layout_sources = __esmMin((() => {}));
// ../../js/hwp5-border-fill-sources.mjs
/** Wire validation only; raw resource colors and absent alpha remain distinct. */
function decodeHwp5BorderFillSources(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length > 67108864) throw new Error("InvalidHwp5BorderFillSources");
	return validateHwp5BorderFillSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateHwp5BorderFillSources(rows) {
	const integer = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
	const uint = (v) => integer(v, 0, 4294967295), byte = (v) => integer(v, 0, 255), signed = (v) => integer(v, -2147483648, 2147483647);
	const optional = (v, check) => v === null || check(v), fail = () => {
		throw new Error("InvalidHwp5BorderFillSources");
	};
	if (!Array.isArray(rows) || rows.length > 1e6) fail();
	for (const [i, r] of rows.entries()) {
		if (!r || r.id !== i + 1 || !uint(r.record_index) || r.record_index < i || i > 0 && r.record_index <= rows[i - 1].record_index || !integer(r.attributes, 0, 65535) || !Array.isArray(r.borders) || r.borders.length !== 5 || !Array.from(r.borders).every((b) => b && byte(b.kind) && byte(b.width) && uint(b.color)) || !uint(r.fill_flags) || typeof r.fill_known !== "boolean" || r.fill_known !== ((r.fill_flags & -8) === 0)) fail();
		if (!r.fill_known) {
			if (!uint(r.unknown_fill_bytes) || [
				r.pattern,
				r.gradient,
				r.image,
				r.alpha,
				r.additional_present,
				r.additional_bytes,
				r.extra_bytes
			].some((v) => v !== null)) fail();
			continue;
		}
		if (r.unknown_fill_bytes !== null || typeof r.additional_present !== "boolean" || !uint(r.additional_bytes) || !uint(r.extra_bytes) || !r.additional_present && (r.additional_bytes !== 0 || r.fill_flags > 1) || r.pattern !== null !== !!(r.fill_flags & 1) || r.gradient !== null !== !!(r.fill_flags & 4) || r.image !== null !== !!(r.fill_flags & 2)) fail();
		const p = r.pattern, g = r.gradient, image = r.image;
		if (p !== null && (!p || !uint(p.background) || !uint(p.foreground) || !signed(p.kind))) fail();
		if (g !== null && (!g || !byte(g.kind) || ![
			"angle",
			"center_x",
			"center_y",
			"blur"
		].every((k) => uint(g[k])) || !optional(g.blur_center, byte) || !Array.isArray(g.colors) || g.colors.length > 1e6 || !Array.from(g.colors).every(uint) || !Array.isArray(g.positions) || g.positions.length !== (g.colors.length > 2 ? g.colors.length : 0) || !Array.from(g.positions).every(signed))) fail();
		if (g !== null && g.blur_center !== null !== (r.additional_bytes === 1)) fail();
		if (image !== null && (!image || !byte(image.mode) || !image.picture || !integer(image.picture.contrast, -128, 127) || !integer(image.picture.brightness, -128, 127) || !byte(image.picture.effect) || !integer(image.picture.bin_data_id, 0, 65535))) fail();
		if (r.alpha !== null && (!r.alpha || r.extra_bytes !== 0 || r.fill_flags === 0 || ![
			["pattern", 1],
			["gradient", 4],
			["image", 2]
		].every(([k, flag]) => r.fill_flags & flag ? byte(r.alpha[k]) : r.alpha[k] === null))) fail();
	}
	return rows;
}
var init_hwp5_border_fill_sources = __esmMin((() => {}));
// ../../js/hwp5-table-anchors.mjs
function decodeHwp5TableAnchors(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5TableAnchors");
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || ![
			"table_record_node",
			"control_node",
			"paragraph",
			"source_unit",
			"current_unit"
		].every((key) => uint(row[key])) || row.control_node >= row.table_record_node || row.source_unit > 4294967287 || row.current_unit > 4294967287 || seen.has(row.table_record_node)) throw new Error("InvalidHwp5TableAnchors");
		seen.add(row.table_record_node);
	}
	return rows;
}
var init_hwp5_table_anchors = __esmMin((() => {}));
// ../../js/hwp5-flow-sources.mjs
function decodeHwp5ParagraphFlow(bytes) {
	const rows = parse$3(bytes);
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5ParagraphFlow");
	for (const [index, row] of rows.entries()) {
		if (row?.empty_line_eligible !== void 0 && (typeof row.empty_line_eligible !== "boolean" || row.empty_line_eligible && row.top_level !== true)) throw new Error("InvalidHwp5ParagraphFlow");
		if (row && (Object.hasOwn(row, "memo_index") || Object.hasOwn(row, "memo_node"))) {
			if (!(row.memo_index === null && row.memo_node === null) && !(uint$24(row.memo_index) && uint$24(row.memo_node) && row.host === "other" && row.top_level === false && uint$24(row.list_node) && row.memo_node + 1 === row.list_node)) throw new Error("InvalidHwp5ParagraphFlow");
		}
		if (row?.host !== void 0) {
			if (![
				"body",
				"table_cell",
				"table_caption",
				"header",
				"footer",
				"footnote",
				"endnote",
				"master_page",
				"drawing",
				"other"
			].includes(row.host) || !(row.list_node === null || uint$24(row.list_node)) || row.top_level !== (row.host === "body") || row.host === "body" !== (row.list_node === null)) throw new Error("InvalidHwp5ParagraphFlow");
		}
		if (!row || row.paragraph !== index || !uint$24(row.template_node) || !(row.source_node === null || uint$24(row.source_node)) || !(row.parent_node === null || uint$24(row.parent_node)) || !Number.isInteger(row.break_flags) || row.break_flags < 0 || row.break_flags > 255 || typeof row.generated !== "boolean" || row.generated !== (row.source_node === null) || row.top_level !== (row.parent_node === null) || row.generated && (![
			0,
			4,
			8
		].includes(row.break_flags) || row.break_flags !== 0 && !row.top_level) || !row.generated && row.source_node !== row.template_node) throw new Error("InvalidHwp5ParagraphFlow");
		for (const [name, mask] of [
			["section_break", 1],
			["multicolumn_break", 2],
			["page_break", 4],
			["column_break", 8]
		]) if (row[name] !== Boolean(row.break_flags & mask)) throw new Error("InvalidHwp5ParagraphFlow");
	}
	return rows;
}
function decodeHwp5ColumnSources(bytes) {
	const rows = parse$3(bytes);
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5ColumnSources");
	for (const row of rows) {
		if (!row || !uint$24(row.current_paragraph) || !uint$24(row.current_unit)) throw new Error("InvalidHwp5ColumnSources");
		if (!row || ![
			"source_node",
			"paragraph_node",
			"flags",
			"color",
			"extra_bytes"
		].every((name) => uint$24(row[name])) || !Number.isInteger(row.count) || row.count < 1 || row.count > 255 || ![
			0,
			1,
			2,
			3
		].includes(row.kind) || ![
			0,
			1,
			2,
			3
		].includes(row.direction) || typeof row.same_width !== "boolean" || !(row.spacing === null || Number.isInteger(row.spacing) && row.spacing >= -32768 && row.spacing <= 32767) || ![row.line_type, row.line_width].every((value) => Number.isInteger(value) && value >= 0 && value <= 255) || !Array.isArray(row.columns)) throw new Error("InvalidHwp5ColumnSources");
		if ((row.flags >>> 2 & 255) !== row.count || (row.flags & 3) !== row.kind || (row.flags >>> 10 & 3) !== row.direction || Boolean(row.flags & 4096) !== row.same_width || row.columns.length !== (row.count < 2 || row.same_width ? 0 : row.count) || row.columns.length > 0 !== (row.spacing === null)) throw new Error("InvalidHwp5ColumnSources");
		for (const value of row.columns) if (!value || ![value.width, value.gap].every((number) => Number.isInteger(number) && number >= 0 && number <= 65535)) throw new Error("InvalidHwp5ColumnSources");
	}
	return rows;
}
var uint$24, parse$3;
var init_hwp5_flow_sources = __esmMin((() => {
	uint$24 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	parse$3 = (bytes) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}));
// ../../js/hwp5-formula-sources.mjs
function decodeHwp5FormulaSources(bytes) {
	const rows = JSON.parse(decoder$6.decode(bytes));
	if (!Array.isArray(rows) || rows.length > 1e6) throw new Error("InvalidHwp5FormulaSources");
	const seen = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || !uint$23(row.source_node) || row.source_node === 0 || !uint$23(row.paragraph) || seen.has(row.source_node) || typeof row.formula !== "string" || !row.formula.startsWith("=") || row.formula.length < 2 || typeof row.last_result !== "string" || typeof row.derived !== "boolean" || !row.formula.isWellFormed() || !row.last_result.isWellFormed()) throw new Error("InvalidHwp5FormulaSources");
		seen.add(row.source_node);
	}
	return rows;
}
var decoder$6, uint$23;
var init_hwp5_formula_sources = __esmMin((() => {
	decoder$6 = new TextDecoder("utf-8", { fatal: true });
	uint$23 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
}));
// ../../js/hwp5-field-spans.mjs
function validateHwp5FieldSpans(rows) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const sources = /* @__PURE__ */ new Set();
	if (!Array.isArray(rows)) throw new Error("InvalidHwp5FieldSpans");
	for (const row of rows) {
		if (!row || ![
			row.source_node,
			row.field_id,
			row.ordinal
		].every(uint) || ![row.begin, row.end].every((position) => position && uint(position.paragraph) && uint(position.unit)) || row.begin.paragraph > row.end.paragraph || row.begin.paragraph === row.end.paragraph && row.begin.unit > row.end.unit || sources.has(row.source_node)) throw new Error("InvalidHwp5FieldSpans");
		sources.add(row.source_node);
	}
	return rows;
}
function decodeHwp5FieldSpans(bytes) {
	return validateHwp5FieldSpans(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var init_hwp5_field_spans = __esmMin((() => {}));
// ../../js/hwp5-field-topology.mjs
function validateHwp5FieldTopology(value) {
	const fail = () => {
		throw new Error("InvalidHwp5FieldTopology");
	};
	if (!value || !Array.isArray(value.spans) || !Array.isArray(value.unresolved)) fail();
	const starts = /* @__PURE__ */ new Set();
	for (const row of value.spans) {
		if (!row || !uint$22(row.field_id) || !uint$22(row.ordinal) || !position$2(row.begin) || !position$2(row.end) || before(row.end, row.begin)) fail();
		const key = row.begin.paragraph + ":" + row.ordinal;
		if (starts.has(key)) fail();
		starts.add(key);
	}
	let previous = null;
	for (const row of value.unresolved) {
		if (!row || !position$2(row.position) || !uint$22(row.marker_id) || !(row.list_node === null || uint$22(row.list_node))) fail();
		if (previous && !before(previous, row.position)) fail();
		previous = row.position;
		if (row.kind === "unclosed_start") {
			if (!uint$22(row.ordinal)) fail();
			const key = row.position.paragraph + ":" + row.ordinal;
			if (starts.has(key)) fail();
			starts.add(key);
		} else if (row.kind === "orphan_end") {
			if (row.ordinal !== null) fail();
		} else fail();
	}
	return {
		spans: value.spans,
		unresolved: value.unresolved
	};
}
function decodeHwp5FieldTopology(bytes) {
	return validateHwp5FieldTopology(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var uint$22, position$2, before;
var init_hwp5_field_topology = __esmMin((() => {
	uint$22 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	position$2 = (value) => value && uint$22(value.paragraph) && uint$22(value.unit);
	before = (lhs, rhs) => lhs.paragraph < rhs.paragraph || lhs.paragraph === rhs.paragraph && lhs.unit < rhs.unit;
}));
// ../../js/hwp5-text-source-protection.mjs
function validateHwp5TextSourceProtection(value, count) {
	const fail = () => {
		throw new Error("InvalidHwp5TextSourceProtection");
	};
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!uint(count) || !value || !Array.isArray(value.protected_paragraphs) || value.protected_paragraphs.length !== count) fail();
	let any = false;
	for (const bit of value.protected_paragraphs) {
		if (typeof bit !== "boolean") fail();
		any ||= bit;
	}
	if (value.mode === "strict") {
		if (value.retained_headers !== null || any) fail();
	} else if (value.mode === "retained_click" || value.mode === "retained_memo") {
		if (!uint(value.retained_headers) || value.retained_headers === 0 || !any) fail();
	} else fail();
	return {
		mode: value.mode,
		protected_paragraphs: value.protected_paragraphs,
		retained_headers: value.retained_headers
	};
}
function decodeHwp5TextSourceProtection(bytes, count) {
	return validateHwp5TextSourceProtection(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), count);
}
var init_hwp5_text_source_protection = __esmMin((() => {}));
// ../../js/hwp5-normalization-info.mjs
function decodeHwp5NormalizationInfo(bytes) {
	const value = JSON.parse(decoder$5.decode(bytes));
	if (value === null) return {
		normalized: false,
		historyBaseline: "original",
		deviations: null
	};
	const invalid = () => {
		throw new Error("InvalidHwp5NormalizationInfo");
	};
	if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
	for (const key of counts) if (!Number.isSafeInteger(value[key]) || value[key] < 0) invalid();
	const root = value.original_root_created;
	if (!(typeof root === "string" && /^(0|[1-9][0-9]*)$/.test(root)) && !(Number.isSafeInteger(root) && root >= 0)) invalid();
	if (BigInt(root) > 18446744073709551615n) invalid();
	return {
		normalized: true,
		historyBaseline: "normalized",
		deviations: {
			...value,
			original_root_created: String(root)
		}
	};
}
var decoder$5, counts;
var init_hwp5_normalization_info = __esmMin((() => {
	decoder$5 = new TextDecoder("utf-8", { fatal: true });
	counts = [
		"zero_fat_tail_slots",
		"off_by_one_fat_markers",
		"zero_unclaimed_fat_slots",
		"orphan_end_fat_slots",
		"zero_mini_tail_slots",
		"zero_unclaimed_mini_slots",
		"zero_unused_entries",
		"stale_unused_entries"
	];
}));
// ../../js/hwp5-observed-docinfo.mjs
function validateObservedDocInfoOption(value, distribution, availableSectionCopy) {
	if (typeof value !== "boolean") throw new TypeError("Invalid observed DocInfo option");
	if (value && (distribution || availableSectionCopy)) throw new TypeError("Unsupported observed DocInfo option combination");
}
function decodeObservedDocInfoDiagnostics(bytes) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (value === null) return null;
	if (!value || typeof value !== "object" || [
		"absent_carets",
		"unresolved_font_types",
		"unresolved_style_characters",
		"unresolved_character_tails",
		"absent_fill_additionals"
	].some((key) => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 4294967295) || typeof value.resource_count_mismatch !== "boolean") throw new Error("InvalidObservedDocInfoDiagnostics");
	return value;
}
var init_hwp5_observed_docinfo = __esmMin((() => {}));
// ../../js/hwp5-section-inventory.mjs
function sectionInventory(declared, available) {
	if (![declared, available].every((value) => Number.isInteger(value) && value >= 1 && value <= 1024)) throw new Error("InvalidSectionInventory");
	return {
		declared,
		available,
		mismatch: declared !== available
	};
}
var init_hwp5_section_inventory = __esmMin((() => {
	Object.freeze([
		"hwp5_text_read_available",
		"hwp5_text_declared_sections",
		"hwp5_text_distribution"
	]);
}));
// ../../js/hwp5-available-section-copy.mjs
function validateAvailableSectionCopyOption(value, distribution, normalizeObservedCfb) {
	if (typeof value !== "boolean") throw new TypeError("Invalid available section copy option");
	if (value && (distribution || normalizeObservedCfb)) throw new Error("ConflictingAvailableSectionCopyOptions");
}
function decodeAvailableSectionCopyInfo(bytes) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (value === null) return null;
	const inventory = sectionInventory(value?.declared, value?.available);
	if (!inventory.mismatch) throw new Error("InvalidAvailableSectionCopyInfo");
	return {
		normalized: true,
		historyBaseline: "available-sections-copy",
		deviations: null,
		sectionInventory: inventory,
		missingContentRecovered: false
	};
}
var init_hwp5_available_section_copy = __esmMin((() => {
	init_hwp5_section_inventory();
	Object.freeze(["hwp5_edit_open_available_section_copy", "hwp5_edit_available_section_copy_info"]);
}));
// ../../js/hwp5-exclusive-text-delta.mjs
function decodeHwp5TextWindow(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length < 48) bad();
	const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const n = (i) => v.getUint32(4 + i * 4, true);
	const e = (BigInt(n(2)) << 32n | BigInt(n(1))).toString();
	if (String.fromCharCode(...bytes.slice(0, 4)) !== "H5W1" || n(0) !== 1 || !epoch(e) || !uint$21(n(3)) || !uint$21(n(4)) || n(7) > n(8) || n(8) > n(6) || n(8) - n(7) > 4096 || n(9) !== 1 || n(10) !== (n(8) - n(7)) * 2 || bytes.length !== 48 + n(10)) bad();
	const text = new TextDecoder("utf-16le", {
		fatal: true,
		ignoreBOM: true
	}).decode(bytes.slice(48));
	return {
		epoch: e,
		section: n(3),
		sourceNode: n(4),
		parentNode: n(5) === 4294967295 ? null : n(5),
		totalUnits: n(6),
		startUnit: n(7),
		endUnit: n(8),
		text
	};
}
function decodeHwp5TextDelta(bytes) {
	const r = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!r || Object.keys(r).sort().join() !== [
		"version",
		"exclusive",
		"beforeEpoch",
		"epoch",
		"beforeRevision",
		"revision",
		"section",
		"paragraph",
		"sourceNode",
		"parentNode",
		"startUnit",
		"removed",
		"inserted",
		"totalUnits",
		"runs"
	].sort().join() || r.version !== 1 || r.exclusive !== true || !epoch(r.beforeEpoch) || !epoch(r.epoch) || BigInt(r.epoch) <= BigInt(r.beforeEpoch)) bad();
	for (const k of [
		"beforeRevision",
		"revision",
		"section",
		"paragraph",
		"sourceNode",
		"startUnit",
		"totalUnits"
	]) if (!uint$21(r[k])) bad();
	if (r.parentNode !== null && !uint$21(r.parentNode)) bad();
	for (const k of ["removed", "inserted"]) if (!Array.isArray(r[k]) || r[k].length > 4096 || r[k].some((x) => !Number.isInteger(x) || x < 0 || x > 65535)) bad();
	if (!Array.isArray(r.runs) || !r.runs.length || r.runs.length > 4096) bad();
	let prev = -1;
	for (const run of r.runs) {
		if (Object.keys(run).sort().join() !== "char_shape_id,start_unit" || !uint$21(run.start_unit) || !uint$21(run.char_shape_id) || run.start_unit <= prev || run.start_unit > r.totalUnits) bad();
		prev = run.start_unit;
	}
	if (r.runs[0].start_unit !== 0 || r.totalUnits < 1 || r.totalUnits > 4096) bad();
	return r;
}
function createHwp5ExclusiveTextApi({ wasm, output, check, encode, currentSourceReferences }) {
	const window = (reference, start, end) => output((ptr, size) => wasm.hwp5_edit_copy_current_text_window(ptr, size, start, end), encode(reference));
	return {
		captureExclusiveTextOwner(section, paragraph) {
			check();
			if (typeof wasm.hwp5_edit_last_text_delta_receipt !== "function" || typeof wasm.hwp5_edit_copy_current_text_window !== "function") return null;
			const reference = currentSourceReferences(section, {
				first: paragraph,
				count: 1
			}).references[0];
			if (reference?.kind !== "original") return null;
			return {
				section,
				paragraph,
				reference,
				window: decodeHwp5TextWindow(window(reference, 0, 0))
			};
		},
		readCurrentOwnerWindow(section, paragraph) {
			check();
			if (typeof wasm.hwp5_edit_copy_current_text_window !== "function" || typeof wasm.hwp5_edit_character_ranges !== "function") return null;
			const captured = this.captureExclusiveTextOwner(section, paragraph);
			if (!captured || captured.window.totalUnits < 2 || captured.window.totalUnits > 4096) return null;
			const reference = captured.reference;
			const w = decodeHwp5TextWindow(window(reference, 0, captured.window.totalUnits));
			if (w.epoch !== captured.window.epoch || w.sourceNode !== captured.window.sourceNode || w.parentNode !== captured.window.parentNode || w.section !== section || w.totalUnits !== captured.window.totalUnits || w.startUnit !== 0 || w.endUnit !== w.totalUnits || w.text.length !== w.totalUnits || w.text.at(-1) !== "\r" || !w.text.isWellFormed() || Array.from(w.text.slice(0, -1)).some((c) => c.charCodeAt(0) < 32 || c === "￼")) bad();
			const raw = decodeCharacterRanges(output(() => wasm.hwp5_edit_character_ranges(section, paragraph)));
			if (!raw.length || raw.length > 4096) bad();
			const characterRanges = [];
			const length = w.text.length - 1;
			let cursor = 0;
			for (const range of raw) {
				if (range.start !== cursor || range.end < range.start || range.end > w.totalUnits || !uint$21(range.charShapeId)) bad();
				cursor = range.end;
				const start = Math.min(length, range.start), end = Math.min(length, range.end), charShapeId = range.charShapeId;
				if (start === end) {
					if (start === length) characterRanges.push({
						start,
						end,
						charShapeId
					});
					continue;
				}
				const last = characterRanges.at(-1);
				if (last?.charShapeId === charShapeId) last.end = end;
				else characterRanges.push({
					start,
					end,
					charShapeId
				});
			}
			if (cursor !== w.totalUnits) bad();
			const final = currentSourceReferences(section, {
				first: paragraph,
				count: 1
			}).references[0];
			if (!final || Object.keys(reference).some((k) => final[k] !== reference[k]) || Object.keys(final).length !== Object.keys(reference).length) bad();
			return {
				reference,
				window: w,
				characterRanges
			};
		},
		readExclusiveTextDelta(before) {
			check();
			if (!before) return null;
			const r = decodeHwp5TextDelta(output(() => wasm.hwp5_edit_last_text_delta_receipt()));
			const reference = currentSourceReferences(r.section, {
				first: r.paragraph,
				count: 1
			}).references[0];
			if (r.section !== before.section || r.paragraph !== before.paragraph || r.beforeEpoch !== before.window.epoch || r.sourceNode !== before.window.sourceNode || r.parentNode !== before.window.parentNode || reference?.kind !== "original" || reference.epoch !== r.epoch || reference.id !== String(r.sourceNode) || r.startUnit + r.removed.length > before.window.totalUnits - 1 || r.totalUnits !== before.window.totalUnits - r.removed.length + r.inserted.length) bad();
			const after = decodeHwp5TextWindow(window(reference, 0, r.totalUnits));
			if (after.epoch !== r.epoch || after.sourceNode !== r.sourceNode || after.parentNode !== r.parentNode || after.section !== r.section || after.totalUnits !== r.totalUnits || after.text.at(-1) !== "\r" || Array.from(after.text.slice(0, -1)).some((c) => c.charCodeAt(0) < 32)) bad();
			return {
				receipt: r,
				before: before.window,
				window: after,
				reference
			};
		}
	};
}
var uint$21, epoch, bad;
var init_hwp5_exclusive_text_delta = __esmMin((() => {
	init_character_shapes_wire();
	uint$21 = (x) => Number.isSafeInteger(x) && x >= 0 && x < 4294967295;
	epoch = (x) => typeof x === "string" && /^[1-9][0-9]{0,19}$/.test(x) && BigInt(x) <= 18446744073709551615n;
	bad = () => {
		throw Error("InvalidExclusiveTextDelta");
	};
}));
// ../../js/hwp5-current-references.mjs
function validate$1(reference) {
	if (!reference || typeof reference !== "object" || Array.isArray(reference)) invalid();
	if (Object.keys(reference).length !== fields$2.length || fields$2.some((key) => !Object.hasOwn(reference, key))) invalid();
	const { epoch, kind, section, id, row, column } = reference;
	if (!decimal(epoch) || epoch === "0" || !decimal(id) || !uint$20(section) || !uint$20(row) || !uint$20(column)) invalid();
	if (![
		"original",
		"generated",
		"cell"
	].includes(kind)) invalid();
	if (kind !== "cell" && (row !== 0 || column !== 0 || BigInt(id) > 4294967295n)) invalid();
	if (kind !== "original" && id === "0") invalid();
	return reference;
}
function decodeHwp5CurrentReferences(bytes) {
	const value = JSON.parse(utf8.decode(bytes));
	if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "first,references,total,version") invalid();
	if (value.version !== 1 || !uint$20(value.total) || !uint$20(value.first) || value.first > value.total || !Array.isArray(value.references) || value.references.length > 1024 || value.first + value.references.length > value.total) invalid();
	for (const reference of value.references) validate$1(reference);
	if (value.references.some((reference) => reference.epoch !== value.references[0].epoch)) invalid();
	return value;
}
function createHwp5CurrentReferenceApi({ wasm, memory, check, output, success, u32, referenceScope }) {
	const scope = referenceScope === void 0 ? String(++scopeSequence) : `${referenceScope}:${++scopeSequence}`;
	const available = () => [
		"hwp5_edit_current_references",
		"hwp5_edit_copy_current_text",
		"hwp5_edit_splice_current"
	].every((name) => typeof wasm[name] === "function");
	const ready = () => {
		check();
		if (!available()) throw new Error("Hwp5CurrentReferenceAbiUnavailable");
	};
	const encode = (reference) => {
		if (!reference || reference.scope !== scope || Object.keys(reference).length !== fields$2.length + 1) throw new Error("InvalidCurrentReferenceScope");
		const wire = Object.fromEntries(fields$2.map((key) => [key, reference[key]]));
		validate$1(wire);
		return encoder$7.encode(JSON.stringify(wire));
	};
	const copyCurrentText = (reference) => {
		ready();
		return memory.withBytes(encode(reference), (ptr, size) => output(() => wasm.hwp5_edit_copy_current_text(ptr, size)).bytes);
	};
	const windowQuery = (name, section, options = {}) => {
		ready();
		if (typeof wasm[name] !== "function") throw new Error("Hwp5CurrentSourceReferenceAbiUnavailable");
		if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("InvalidCurrentWindow");
		const { first = 0, count = 256 } = options;
		const args = [
			u32(section, "section"),
			u32(first, "first"),
			u32(count, "count")
		];
		if (count > 1024) throw new RangeError("LimitExceeded");
		const window = decodeHwp5CurrentReferences(output(() => wasm[name](...args)).bytes);
		if (window.first !== args[1] || window.references.length !== Math.min(args[2], window.total - args[1]) || window.references.some((ref) => ref.section !== args[0])) invalid();
		return {
			...window,
			references: window.references.map((reference) => Object.freeze({
				...reference,
				scope
			}))
		};
	};
	return {
		...createHwp5ExclusiveTextApi({
			wasm,
			check,
			encode,
			currentSourceReferences: (section, options) => windowQuery("hwp5_edit_current_source_references", section, options),
			output: (action, bytes) => bytes === void 0 ? output(action).bytes : memory.withBytes(bytes, (ptr, size) => output(() => action(ptr, size)).bytes)
		}),
		supportsCurrentReferences() {
			check();
			return available();
		},
		supportsCurrentSourceReferences() {
			check();
			return available() && typeof wasm.hwp5_edit_current_source_references === "function";
		},
		currentSourceReferences(section, options) {
			const window = windowQuery("hwp5_edit_current_source_references", section, options);
			if (window.references.some((ref) => ref.kind === "cell")) invalid();
			return window;
		},
		currentReferences(section, options = {}) {
			return windowQuery("hwp5_edit_current_references", section, options);
		},
		copyCurrentText,
		currentText(reference) {
			return utf16.decode(copyCurrentText(reference));
		},
		spliceCurrent(options) {
			ready();
			if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("InvalidCurrentEdit");
			const { reference, startUnit, endUnit, text } = options;
			const range = [u32(startUnit, "startUnit"), u32(endUnit, "endUnit")];
			if (startUnit > endUnit) throw new RangeError("InvalidTextPosition");
			if (typeof text !== "string") throw new TypeError("Text must be a string");
			if (!text.isWellFormed()) throw new Error("InvalidUnicodeEncoding");
			if (text.length > 4194304) throw new RangeError("LimitExceeded");
			const bytes = encoder$7.encode(text);
			if (bytes.length > 4194304) throw new RangeError("LimitExceeded");
			memory.withBytes(encode(reference), (ptr, size) => memory.withBytes(bytes, (textPtr, textSize) => success(wasm.hwp5_edit_splice_current(ptr, size, ...range, textPtr, textSize))));
		}
	};
}
var utf8, utf16, encoder$7, fields$2, scopeSequence, invalid, uint$20, decimal;
var init_hwp5_current_references = __esmMin((() => {
	init_hwp5_exclusive_text_delta();
	utf8 = new TextDecoder("utf-8", {
		fatal: true,
		ignoreBOM: true
	});
	utf16 = new TextDecoder("utf-16le", {
		fatal: true,
		ignoreBOM: true
	});
	encoder$7 = new TextEncoder();
	fields$2 = [
		"epoch",
		"kind",
		"section",
		"id",
		"row",
		"column"
	];
	scopeSequence = 0n;
	invalid = () => {
		throw new Error("InvalidHwp5CurrentReference");
	};
	uint$20 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	decimal = (value) => typeof value === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value) && BigInt(value) <= 18446744073709551615n;
}));
// ../../js/created-table-identity.mjs
function createdTableIdentity(value) {
	if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/.test(value)) throw new RangeError("InvalidCreatedTableIdentity");
	const id = BigInt(value);
	if (id > 18446744073709551615n) throw new RangeError("InvalidCreatedTableIdentity");
	return id;
}
var init_created_table_identity = __esmMin((() => {}));
// ../../js/hwpx-created-tables.mjs
function decodeCreatedTables(bytes) {
	const fail = () => {
		throw new Error("InvalidCreatedTables");
	};
	if (!(bytes instanceof Uint8Array)) return fail();
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	return validateCreatedTables(rows);
}
function validateCreatedTables(rows, { hostBase = 1 } = {}) {
	const fail = () => {
		throw new Error("InvalidCreatedTables");
	};
	if (hostBase !== 0 && hostBase !== 1) return fail();
	if (!Array.isArray(rows) || rows.length > 1e5) return fail();
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const keys = (value, names) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
	const identities = /* @__PURE__ */ new Set(), instances = /* @__PURE__ */ new Set(), paragraphs = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!keys(row, [
			"identity",
			"instance_id",
			"host_paragraph",
			"anchor_unit",
			"rows",
			"columns",
			"width",
			"height",
			"resources",
			"cells"
		])) return fail();
		try {
			createdTableIdentity(row.identity);
		} catch {
			return fail();
		}
		if (identities.has(row.identity)) return fail();
		identities.add(row.identity);
		if (![
			row.instance_id,
			row.host_paragraph,
			row.anchor_unit,
			row.rows,
			row.columns,
			row.width,
			row.height
		].every(uint) || !row.instance_id || row.host_paragraph < hostBase || !row.rows || !row.columns || row.width < row.columns || row.height < row.rows || row.height % row.rows || instances.has(row.instance_id)) return fail();
		instances.add(row.instance_id);
		if (!keys(row.resources, [
			"paragraph",
			"character",
			"style",
			"border_fill"
		]) || !Object.values(row.resources).every(uint)) return fail();
		const count = row.rows * row.columns;
		if (count > 1e5 || !Array.isArray(row.cells) || row.cells.length !== count) return fail();
		const height = row.height / row.rows;
		let x = 0;
		for (let index = 0; index < count; index++) {
			const cell = row.cells[index];
			if (!keys(cell, [
				"paragraph_id",
				"row",
				"column",
				"x",
				"y",
				"width",
				"height",
				"text"
			]) || ![
				cell.paragraph_id,
				cell.row,
				cell.column,
				cell.x,
				cell.y,
				cell.width,
				cell.height
			].every(uint)) return fail();
			if (!cell.paragraph_id || paragraphs.has(cell.paragraph_id) || cell.row !== Math.floor(index / row.columns) || cell.column !== index % row.columns || cell.x !== x || !cell.width || cell.height !== height || cell.y !== cell.row * height || typeof cell.text !== "string" || !cell.text.isWellFormed()) return fail();
			paragraphs.add(cell.paragraph_id);
			x += cell.width;
			if (x > row.width) return fail();
			if (cell.column === row.columns - 1) {
				if (x !== row.width) return fail();
				x = 0;
			}
		}
	}
	return rows;
}
var init_hwpx_created_tables = __esmMin((() => {
	init_created_table_identity();
}));
// ../../js/hwp5-created-tables.mjs
function decodeHwp5CreatedTables(bytes) {
	const fail = () => {
		throw new Error("InvalidHwp5CreatedTables");
	};
	const rows = JSON.parse(decoder$4.decode(bytes));
	if (!Array.isArray(rows) || rows.length > 1e5 || rows.some((r) => !keys(r, ["table", "options"]))) fail();
	validateCreatedTables(rows.map((row) => row.table), { hostBase: 0 });
	for (const row of rows) {
		const o = row.options;
		if (!keys(o, [
			"common",
			"table",
			"cell"
		])) fail();
		const c = o.common, t = o.table, l = o.cell;
		if (!keys(c, [
			"flags",
			"offset_y",
			"offset_x",
			"z_order",
			"margins",
			"prevent_page_break",
			"description"
		]) || !integer(c.flags, 0, 4294967295) || ![
			c.offset_y,
			c.offset_x,
			c.z_order
		].every((n) => integer(n, -2147483648, 2147483647)) || !margins(c.margins) || typeof c.prevent_page_break !== "boolean" || typeof c.description !== "string" || !c.description.isWellFormed()) fail();
		if (!keys(t, [
			"page_break",
			"repeat_header",
			"cell_spacing",
			"margins"
		]) || !integer(t.page_break, 0, 2) || typeof t.repeat_header !== "boolean" || !integer(t.cell_spacing, -32768, 32767) || !margins(t.margins)) fail();
		if (!keys(l, [
			"layout",
			"unknown",
			"attributes",
			"margins"
		]) || !integer(l.attributes, 0, 4294967295) || !margins(l.margins) || !(l.layout === "spec6" && l.unknown === null || l.layout === "observed8" && integer(l.unknown, 0, 65535))) fail();
	}
	return rows;
}
var decoder$4, keys, integer, margins;
var init_hwp5_created_tables = __esmMin((() => {
	init_hwpx_created_tables();
	decoder$4 = new TextDecoder("utf-8", {
		fatal: true,
		ignoreBOM: true
	});
	keys = (v, names) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === names.length && names.every((k) => Object.hasOwn(v, k));
	integer = (v, low, high) => Number.isInteger(v) && v >= low && v <= high;
	margins = (v) => Array.isArray(v) && v.length === 4 && v.every((n) => integer(n, -32768, 32767));
}));
// ../../js/table-creation-resources.mjs
function decodeTableCreationResources(bytes) {
	const value = JSON.parse(decoder$3.decode(bytes));
	const keys = [
		"paragraph",
		"character",
		"style",
		"border_fill"
	];
	if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key) && Array.isArray(value[key]) && value[key].every((id, i, ids) => Number.isInteger(id) && id >= 0 && id <= 4294967295 && (!i || ids[i - 1] < id)))) throw new Error("InvalidTableCreationResources");
	return value;
}
var decoder$3;
var init_table_creation_resources = __esmMin((() => {
	decoder$3 = new TextDecoder("utf-8", { fatal: true });
}));
// ../../js/table-initial-texts.mjs
function captureTableTextRequest(input) {
	const active = /* @__PURE__ */ new Set();
	let nodes = 0, units = 0;
	const capture = (value, depth = 0) => {
		if (++nodes > 1e5 || depth > 32) throw new RangeError("LimitExceeded");
		if (typeof value === "string") {
			units += value.length;
			if (units > 4194304) throw new RangeError("LimitExceeded");
			return value;
		}
		if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
		if (!value || typeof value !== "object" || active.has(value)) throw new TypeError("InvalidTableCreationRequest");
		active.add(value);
		try {
			const array = Array.isArray(value);
			if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("InvalidTableCreationRequest");
			const result = array ? [] : Object.create(null);
			const keys = array ? Array.from({ length: Math.min(value.length, 100001) }, (_, i) => String(i)) : Reflect.ownKeys(value);
			if (keys.length > 1e5) throw new RangeError("LimitExceeded");
			for (const key of keys) {
				const field = Object.getOwnPropertyDescriptor(value, key);
				if (typeof key !== "string" || !field || !Object.hasOwn(field, "value")) throw new TypeError("InvalidTableCreationRequest");
				if (!array && !field.enumerable) continue;
				if (key === "toJSON") throw new TypeError("InvalidTableCreationRequest");
				units += key.length;
				if (units > 4194304) throw new RangeError("LimitExceeded");
				result[key] = capture(field.value, depth + 1);
			}
			return result;
		} finally {
			active.delete(value);
		}
	};
	return capture(input);
}
function captureTableInitialTexts(rows, columns, input) {
	if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1 || rows * columns > 4096 || !Array.isArray(input) || input.length !== rows) throw new TypeError("InvalidTableCellTexts");
	let bytes = 0;
	return Array.from({ length: rows }, (_, row) => {
		const entry = Object.getOwnPropertyDescriptor(input, String(row));
		if (!entry || !Object.hasOwn(entry, "value")) throw new TypeError("InvalidTableCellTexts");
		const cells = entry.value;
		if (!Array.isArray(cells) || cells.length !== columns) throw new TypeError("InvalidTableCellTexts");
		return Array.from({ length: columns }, (_, column) => {
			const entry = Object.getOwnPropertyDescriptor(cells, String(column));
			if (!entry || !Object.hasOwn(entry, "value")) throw new TypeError("InvalidTableCellTexts");
			const text = entry.value;
			if (typeof text !== "string" || !text.isWellFormed()) throw new TypeError("InvalidTableCellText");
			if (text.length > 4194304) throw new RangeError("LimitExceeded");
			for (let index = 0; index < text.length; index++) {
				const unit = text.charCodeAt(index);
				if (unit < 32 || unit === 127) throw new TypeError("InvalidTableCellText");
			}
			bytes += encoder$6.encode(text).length;
			if (bytes > 4194304) throw new RangeError("LimitExceeded");
			return text;
		});
	});
}
function encodeTableTextRequest(request) {
	const json = JSON.stringify(request);
	if (json.length > 4194304) throw new RangeError("LimitExceeded");
	const bytes = encoder$6.encode(json);
	if (bytes.length > 4194304) throw new RangeError("LimitExceeded");
	return bytes;
}
var encoder$6;
var init_table_initial_texts = __esmMin((() => {
	encoder$6 = new TextEncoder();
}));
// ../../js/hwp5-table-creation.mjs
function createHwp5TableCreationApi({ wasm, memory, check, output, u32 }) {
	return {
		supportsTableInitialTexts() {
			check();
			return typeof wasm.hwp5_edit_insert_table_with_texts === "function";
		},
		supportsTableCreation() {
			check();
			return typeof wasm.hwp5_edit_insert_table === "function";
		},
		tableCreationResources() {
			check();
			if (typeof wasm.hwp5_edit_table_creation_resources !== "function") throw new Error("Hwp5TableCreationResourcesAbiUnavailable");
			return decodeTableCreationResources(output(() => wasm.hwp5_edit_table_creation_resources()).bytes);
		},
		createdTables(section) {
			check();
			if (typeof wasm.hwp5_edit_created_tables !== "function") throw new Error("Hwp5CreatedTablesAbiUnavailable");
			return decodeHwp5CreatedTables(output(() => wasm.hwp5_edit_created_tables(u32(section, "section"))).bytes);
		},
		insertTable(request) {
			check();
			if (typeof wasm.hwp5_edit_insert_table !== "function") throw new Error("Hwp5TableCreationAbiUnavailable");
			if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("InvalidTableCreationRequest");
			const withTexts = Object.hasOwn(request, "cell_texts");
			let bytes;
			if (withTexts) {
				if (typeof wasm.hwp5_edit_insert_table_with_texts !== "function") throw new Error("Hwp5TableInitialTextsAbiUnavailable");
				const captured = captureTableTextRequest(request);
				captured.cell_texts = captureTableInitialTexts(captured.rows, captured.columns, captured.cell_texts);
				bytes = encodeTableTextRequest(captured);
			} else {
				const json = JSON.stringify(request);
				if (json.length > 1048576) throw new RangeError("LimitExceeded");
				bytes = encoder$5.encode(json);
				if (bytes.length > 1048576) throw new RangeError("LimitExceeded");
			}
			const response = memory.withBytes(bytes, (ptr, size) => output(() => withTexts ? wasm.hwp5_edit_insert_table_with_texts(ptr, size) : wasm.hwp5_edit_insert_table(ptr, size)).bytes);
			const value = JSON.parse(decoder$2.decode(response));
			if (!value || Object.keys(value).join() !== "identity" || typeof value.identity !== "string" || !/^[1-9][0-9]{0,19}$/.test(value.identity) || BigInt(value.identity) > 18446744073709551615n) throw new Error("InvalidCreatedTableIdentity");
			return value.identity;
		}
	};
}
var encoder$5, decoder$2;
var init_hwp5_table_creation = __esmMin((() => {
	init_hwp5_created_tables();
	init_table_creation_resources();
	init_table_initial_texts();
	encoder$5 = new TextEncoder();
	decoder$2 = new TextDecoder("utf-8", {
		fatal: true,
		ignoreBOM: true
	});
}));
// ../../js/hwp5-text-wire.mjs
/** Decode the private H5T1 preview wire. Every returned raw array owns its bytes. */
function decodeHwp5Text(bytes, { allowGenerated = false } = {}) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 0;
	function word() {
		if (offset + 4 > bytes.length) throw new Error("InvalidHwp5TextWire");
		const value = view.getUint32(offset, true);
		offset += 4;
		return value;
	}
	function raw(length) {
		if (length > bytes.length - offset) throw new Error("InvalidHwp5TextWire");
		const result = bytes.slice(offset, offset + length);
		offset += length;
		return result;
	}
	if (new TextDecoder().decode(raw(4)) !== "H5T1") throw new Error("InvalidHwp5TextWire");
	const versionRaw = word();
	const sectionCount = word();
	if (sectionCount > 1024) throw new Error("InvalidHwp5TextWire");
	const sections = [];
	for (let s = 0; s < sectionCount; s++) {
		const index = word();
		const paragraphCount = word();
		if (index !== s || paragraphCount > bytes.length / 20) throw new Error("InvalidHwp5TextWire");
		const paragraphs = [];
		for (let p = 0; p < paragraphCount; p++) {
			const nodeRaw = word();
			const nodeIndex = allowGenerated && nodeRaw === 4294967295 ? null : nodeRaw;
			const parentRaw = word();
			const declaredUnits = word();
			const present = word();
			if (present > 1) throw new Error("InvalidHwp5TextWire");
			const tokenCount = word();
			if (tokenCount > bytes.length / 12) throw new Error("InvalidHwp5TextWire");
			const tokens = [];
			const textParts = [];
			for (let t = 0; t < tokenCount; t++) {
				const kind = word();
				const startUnit = word();
				const data = raw(word());
				if (kind === 0) {
					if (data.length % 2) throw new Error("InvalidHwp5TextWire");
					const value = decoder$1.decode(data);
					textParts.push(value);
					tokens.push({
						type: "text",
						startUnit,
						text: value,
						raw: data
					});
				} else if (kind === 1 && (data.length === 2 || data.length === 16)) {
					const code = data[0] | data[1] << 8;
					tokens.push({
						type: "control",
						startUnit,
						code,
						raw: data
					});
				} else throw new Error("InvalidHwp5TextWire");
			}
			if (!present && tokenCount) throw new Error("InvalidHwp5TextWire");
			paragraphs.push({
				nodeIndex,
				parentNodeIndex: parentRaw === 4294967295 ? null : parentRaw,
				declaredUnits,
				textPresent: Boolean(present),
				text: textParts.join(""),
				tokens
			});
		}
		sections.push({
			index,
			paragraphs
		});
	}
	if (offset !== bytes.length) throw new Error("InvalidHwp5TextWire");
	return {
		version: [
			versionRaw >>> 24,
			versionRaw >>> 16 & 255,
			versionRaw >>> 8 & 255,
			versionRaw & 255
		],
		sections
	};
}
var decoder$1;
var init_hwp5_text_wire = __esmMin((() => {
	decoder$1 = new TextDecoder("utf-16le", {
		fatal: true,
		ignoreBOM: true
	});
}));
// ../../js/hwp5-editor.mjs
/** Experimental HWP5 editing; no page layout engine. */
async function createExperimentalHwp5Editor(source, input, { distribution = false, normalizeObservedCfb = false, availableSectionCopy = false, retainObservedDocInfo = false, referenceScope } = {}) {
	validateObservedDocInfoOption(retainObservedDocInfo, distribution, availableSectionCopy);
	if (typeof distribution !== "boolean") throw new TypeError("Invalid distribution option");
	if (referenceScope !== void 0 && (typeof referenceScope !== "string" || !referenceScope.length)) throw new TypeError("InvalidCurrentReferenceScope");
	if (typeof normalizeObservedCfb !== "boolean") throw new TypeError("Invalid normalization option");
	validateAvailableSectionCopyOption(availableSectionCopy, distribution, normalizeObservedCfb);
	const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
	const { exports: wasm } = await WebAssembly.instantiate(module, {});
	validateAbi(wasm);
	for (const name of EXPERIMENTAL_EDITOR_FUNCTIONS) if (typeof wasm[name] !== "function") throw new Error(`Missing experimental editor export: ${name}`);
	const memory = createMemory(wasm);
	let closed = false;
	const check = () => {
		if (closed) throw new Error("EditorClosed");
	};
	const success = (value) => {
		if (!value) throw memory.error();
	};
	const count = (value) => {
		if (value >>> 0 === 4294967295) throw memory.error();
		return value >>> 0;
	};
	const output = (action) => {
		try {
			success(action());
			return {
				bytes: memory.copy(wasm.hwp5_edit_output_ptr(), wasm.hwp5_edit_output_len()),
				layoutRequiresReflow: Boolean(wasm.hwp5_edit_reflow())
			};
		} finally {
			wasm.hwp5_edit_output_free();
		}
	};
	const bytes = inputBytes(input);
	if (bytes.length > 67108864) throw new RangeError("LimitExceeded");
	const open = retainObservedDocInfo ? wasm.hwp5_edit_open_observed_docinfo : availableSectionCopy ? wasm.hwp5_edit_open_available_section_copy : normalizeObservedCfb ? distribution ? wasm.hwp5_edit_open_normalized_distribution : wasm.hwp5_edit_open_normalized : distribution ? wasm.hwp5_edit_open_distribution : wasm.hwp5_edit_open;
	if (normalizeObservedCfb && distribution && typeof open !== "function") throw new Error("Hwp5NormalizedDistributionAbiUnavailable");
	if (retainObservedDocInfo && (typeof open !== "function" || typeof wasm.hwp5_edit_observed_docinfo_diagnostics !== "function")) throw new Error("Hwp5ObservedDocInfoAbiUnavailable");
	if (normalizeObservedCfb && typeof open !== "function") throw new Error("Hwp5NormalizationAbiUnavailable");
	if (availableSectionCopy && (typeof open !== "function" || typeof wasm.hwp5_edit_available_section_copy_info !== "function")) throw new Error("Hwp5AvailableSectionCopyAbiUnavailable");
	if (typeof open !== "function") throw new Error("Hwp5DistributionEditorAbiUnavailable");
	memory.withBytes(bytes, (ptr, size) => success(retainObservedDocInfo ? open(ptr, size, normalizeObservedCfb ? 1 : 0) : open(ptr, size)));
	const copyText = (section, paragraph) => {
		check();
		return output(() => wasm.hwp5_edit_copy_text(u32(section, "section"), u32(paragraph, "paragraph"))).bytes;
	};
	return {
		...createAtomicFormattingApi({
			wasm,
			memory,
			check,
			prefix: "hwp5_edit"
		}),
		observedDocInfoDiagnostics() {
			check();
			if (typeof wasm.hwp5_edit_observed_docinfo_diagnostics !== "function") throw new Error("Hwp5ObservedDocInfoAbiUnavailable");
			return decodeObservedDocInfoDiagnostics(output(() => wasm.hwp5_edit_observed_docinfo_diagnostics()).bytes);
		},
		...createParagraphBreakApi({
			wasm,
			memory,
			check,
			uint: u32,
			prefix: "hwp5_edit",
			endAsCount: false,
			unavailable: "Hwp5ParagraphBreakAbiUnavailable"
		}),
		supportsNormalizationInfo() {
			check();
			return typeof wasm[availableSectionCopy ? "hwp5_edit_available_section_copy_info" : "hwp5_edit_normalization_info"] === "function";
		},
		normalizationInfo() {
			check();
			if (availableSectionCopy) {
				const info = decodeAvailableSectionCopyInfo(output(() => wasm.hwp5_edit_available_section_copy_info()).bytes);
				if (!info) throw new Error("InvalidAvailableSectionCopyInfo");
				return info;
			}
			if (typeof wasm.hwp5_edit_normalization_info !== "function") throw new Error("Hwp5NormalizationAbiUnavailable");
			return decodeHwp5NormalizationInfo(output(() => wasm.hwp5_edit_normalization_info()).bytes);
		},
		supportsTextSourcePolicy() {
			check();
			return typeof wasm.hwp5_edit_validate_text_source_policy === "function";
		},
		supportsTextSourceProtection() {
			check();
			return typeof wasm.hwp5_edit_text_source_protection === "function";
		},
		textSourceProtection(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_text_source_protection !== "function") throw new Error("Hwp5TextSourceProtectionAbiUnavailable");
			const bytes = output(() => wasm.hwp5_edit_text_source_protection(index)).bytes;
			return decodeHwp5TextSourceProtection(bytes, wasm.hwp5_edit_paragraph_count(index));
		},
		validateTextSourcePolicy(section) {
			check();
			u32(section, "section");
			if (typeof wasm.hwp5_edit_validate_text_source_policy !== "function") throw new Error("Hwp5TextSourcePolicyAbiUnavailable");
			success(wasm.hwp5_edit_validate_text_source_policy(section));
		},
		...createHistoryApi({
			wasm,
			memory,
			check,
			uint: u32,
			prefix: "hwp5_edit",
			unavailable: "Hwp5HistoryAbiUnavailable"
		}),
		...createHwp5CurrentReferenceApi({
			wasm,
			memory,
			check,
			output,
			success,
			u32,
			referenceScope
		}),
		...createHwp5TableCreationApi({
			wasm,
			memory,
			check,
			output,
			u32
		}),
		supportsCurrentTextPreview() {
			check();
			return typeof wasm.hwp5_edit_current_text_preview === "function";
		},
		currentTextPreview() {
			check();
			if (typeof wasm.hwp5_edit_current_text_preview !== "function") throw new Error("Hwp5CurrentTextPreviewAbiUnavailable");
			return decodeHwp5Text(output(() => wasm.hwp5_edit_current_text_preview()).bytes, { allowGenerated: true });
		},
		sectionCount() {
			check();
			return count(wasm.hwp5_edit_section_count());
		},
		paragraphCount(section) {
			check();
			return count(wasm.hwp5_edit_paragraph_count(u32(section, "section")));
		},
		characterShapeCount() {
			check();
			return count(wasm.hwp5_edit_char_shape_count());
		},
		paragraphShapeCount() {
			check();
			if (typeof wasm.hwp5_edit_para_shape_count !== "function") throw new Error("Hwp5ParagraphFormatAbiUnavailable");
			return count(wasm.hwp5_edit_para_shape_count());
		},
		paragraphShapeId(section, paragraph) {
			check();
			if (typeof wasm.hwp5_edit_para_shape_id !== "function") throw new Error("Hwp5ParagraphFormatAbiUnavailable");
			return count(wasm.hwp5_edit_para_shape_id(u32(section, "section"), u32(paragraph, "paragraph")));
		},
		setParagraphFormat({ section, paragraph, paraShapeId }) {
			check();
			const values = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(paraShapeId, "paraShapeId")
			];
			if (typeof wasm.hwp5_edit_set_paragraph_format !== "function") throw new Error("Hwp5ParagraphFormatAbiUnavailable");
			success(wasm.hwp5_edit_set_paragraph_format(...values));
		},
		setParagraphAlignment({ section, paragraph, alignment }) {
			check();
			const value = [
				"JUSTIFY",
				"LEFT",
				"RIGHT",
				"CENTER",
				"DISTRIBUTE",
				"DISTRIBUTE_SPACE"
			].indexOf(alignment);
			if (value < 0) throw new RangeError("InvalidParagraphAlignment");
			const values = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				value
			];
			if (typeof wasm.hwp5_edit_set_paragraph_alignment !== "function") throw new Error("Hwp5ParagraphAlignmentAbiUnavailable");
			success(wasm.hwp5_edit_set_paragraph_alignment(...values));
		},
		setParagraphMargins({ section, paragraph, margins }) {
			check();
			const args = [u32(section, "section"), u32(paragraph, "paragraph")];
			const [mask, ...values] = paragraphMarginArgs(margins);
			if (typeof wasm.hwp5_edit_set_paragraph_margins !== "function") throw new Error("Hwp5ParagraphMarginsAbiUnavailable");
			success(wasm.hwp5_edit_set_paragraph_margins(...args, mask, ...values));
		},
		setParagraphSpacing({ section, paragraph, type, value }) {
			check();
			const args = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				...paragraphSpacingArgs(type, value)
			];
			if (typeof wasm.hwp5_edit_set_paragraph_spacing !== "function") throw new Error("Hwp5ParagraphSpacingAbiUnavailable");
			success(wasm.hwp5_edit_set_paragraph_spacing(...args));
		},
		paragraphShapes() {
			check();
			if (typeof wasm.hwp5_edit_paragraph_shapes !== "function") throw new Error("Hwp5ParagraphShapesAbiUnavailable");
			return decodeParagraphShapes(output(() => wasm.hwp5_edit_paragraph_shapes()).bytes);
		},
		characterShapes() {
			check();
			if (typeof wasm.hwp5_edit_character_shapes !== "function") throw new Error("Hwp5CharacterShapesAbiUnavailable");
			return decodeCharacterShapes(output(() => wasm.hwp5_edit_character_shapes()).bytes);
		},
		fontFaces() {
			check();
			if (typeof wasm.hwp5_edit_font_faces !== "function") throw new Error("Hwp5FontFacesAbiUnavailable");
			return decodeFontFaces(output(() => wasm.hwp5_edit_font_faces()).bytes);
		},
		fontFaceMetadata() {
			check();
			if (typeof wasm.hwp5_edit_font_face_metadata !== "function") throw new Error("Hwp5FontFaceMetadataAbiUnavailable");
			return decodeFontFaceMetadata(output(() => wasm.hwp5_edit_font_face_metadata()).bytes);
		},
		characterFontReferences() {
			check();
			if (typeof wasm.hwp5_edit_character_font_references !== "function") throw new Error("Hwp5CharacterFontReferencesAbiUnavailable");
			return decodeCharacterFontReferences(output(() => wasm.hwp5_edit_character_font_references()).bytes);
		},
		characterFontMetrics() {
			check();
			if (typeof wasm.hwp5_edit_character_font_metrics !== "function") throw new Error("Hwp5CharacterFontMetricsAbiUnavailable");
			return decodeCharacterFontMetrics(output(() => wasm.hwp5_edit_character_font_metrics()).bytes, "hwp5");
		},
		characterTextColors() {
			check();
			if (typeof wasm.hwp5_edit_character_text_colors !== "function") throw new Error("Hwp5CharacterTextColorsAbiUnavailable");
			return decodeCharacterTextColors(output(() => wasm.hwp5_edit_character_text_colors()).bytes);
		},
		characterShades() {
			check();
			if (typeof wasm.hwp5_edit_character_shades !== "function") throw new Error("Hwp5CharacterShadesAbiUnavailable");
			return decodeCharacterShades(output(() => wasm.hwp5_edit_character_shades()).bytes);
		},
		characterEffects() {
			check();
			if (typeof wasm.hwp5_edit_character_effects !== "function") throw new Error("Hwp5CharacterEffectsAbiUnavailable");
			return decodeCharacterEffects(output(() => wasm.hwp5_edit_character_effects()).bytes);
		},
		characterOutlines() {
			check();
			if (typeof wasm.hwp5_edit_character_outlines !== "function") throw new Error("Hwp5CharacterOutlinesAbiUnavailable");
			return decodeCharacterOutlines(output(() => wasm.hwp5_edit_character_outlines()).bytes);
		},
		characterStrikeStyles() {
			check();
			if (typeof wasm.hwp5_edit_character_strike_styles !== "function") throw new Error("Hwp5CharacterStrikeStylesAbiUnavailable");
			return decodeCharacterStrikeStyles(output(() => wasm.hwp5_edit_character_strike_styles()).bytes);
		},
		characterStrikes() {
			check();
			if (typeof wasm.hwp5_edit_character_strikes !== "function") throw new Error("Hwp5CharacterStrikesAbiUnavailable");
			return decodeCharacterStrikes(output(() => wasm.hwp5_edit_character_strikes()).bytes);
		},
		characterUnderlines() {
			check();
			if (typeof wasm.hwp5_edit_character_underlines !== "function") throw new Error("Hwp5CharacterUnderlinesAbiUnavailable");
			return decodeCharacterUnderlines(output(() => wasm.hwp5_edit_character_underlines()).bytes);
		},
		characterUnderlineStyles() {
			check();
			if (typeof wasm.hwp5_edit_character_underline_styles !== "function") throw new Error("Hwp5CharacterUnderlineStylesAbiUnavailable");
			return decodeCharacterUnderlineStyles(output(() => wasm.hwp5_edit_character_underline_styles()).bytes);
		},
		characterRanges(section, paragraph) {
			check();
			if (typeof wasm.hwp5_edit_character_ranges !== "function") throw new Error("Hwp5CharacterRangesAbiUnavailable");
			return decodeCharacterRanges(output(() => wasm.hwp5_edit_character_ranges(u32(section, "section"), u32(paragraph, "paragraph"))).bytes);
		},
		tableBindings(section) {
			check();
			if (typeof wasm.hwp5_edit_table_bindings !== "function") throw new Error("Hwp5TableBindingsAbiUnavailable");
			return decodeTableBindings(output(() => wasm.hwp5_edit_table_bindings(u32(section, "section"))).bytes);
		},
		setCellStyles(input) {
			check();
			const value = validateCellStyles(input), borders = encodeCellBorderPatches(value.borders), fills = encodeCellFills(value.fills);
			if (Object.hasOwn(value, "diagonals")) {
				if (typeof wasm.hwp5_edit_set_cell_styles_v2 !== "function") throw Error("CellDiagonalAbiUnavailable");
				const diagonals = encodeCellDiagonals(value.diagonals);
				memory.withBytes(borders, (borderPtr, borderLength) => memory.withBytes(fills, (fillPtr, fillLength) => memory.withBytes(diagonals, (diagonalPtr, diagonalLength) => {
					success(wasm.hwp5_edit_set_cell_styles_v2(borderPtr, borderLength, fillPtr, fillLength, diagonalPtr, diagonalLength));
				})));
				return;
			}
			if (typeof wasm.hwp5_edit_set_cell_styles !== "function") throw Error("CellStylesAbiUnavailable");
			memory.withBytes(borders, (borderPtr, borderLength) => memory.withBytes(fills, (fillPtr, fillLength) => {
				success(wasm.hwp5_edit_set_cell_styles(borderPtr, borderLength, fillPtr, fillLength));
			}));
		},
		setCellFills(input) {
			check();
			const bytes = encodeCellFills(validateCellFills(input));
			if (typeof wasm.hwp5_edit_set_cell_fills !== "function") throw Error("CellFillBatchAbiUnavailable");
			memory.withBytes(bytes, (ptr, length) => success(wasm.hwp5_edit_set_cell_fills(ptr, length)));
		},
		setCellAppearance(input) {
			check();
			const value = validateCellAppearance(input), bytes = encodeCellBorders(value.cells), bg = value.background;
			if (typeof wasm.hwp5_edit_set_cell_appearance !== "function") throw Error("Hwp5CellAppearanceAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				success(wasm.hwp5_edit_set_cell_appearance(ptr, size, bg ? 1 : 0, bg?.section ?? 0, bg?.tableNode ?? 0, bg?.listNode ?? 0, bg?.color ?? 0));
			});
		},
		setCellBorders(cells) {
			check();
			const bytes = encodeCellBorders(cells);
			if (typeof wasm.hwp5_edit_set_cell_borders !== "function") throw Error("Hwp5CellBorderBatchAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_cell_borders(ptr, size)));
		},
		setCellBorder(input) {
			check();
			const value = validateCellBorder(input);
			if (typeof wasm.hwp5_edit_set_cell_border !== "function") throw new Error("Hwp5CellBorderAbiUnavailable");
			success(wasm.hwp5_edit_set_cell_border(value.section, value.tableNode, value.listNode, value.edges, cellBorderStyleCode(value.style), value.width, value.color));
		},
		setCellBackground(input) {
			check();
			const value = validateCellBackground(input);
			if (typeof wasm.hwp5_edit_set_cell_background !== "function") throw new Error("Hwp5CellBackgroundAbiUnavailable");
			success(wasm.hwp5_edit_set_cell_background(value.section, value.tableNode, value.listNode, value.color));
		},
		setCellSize({ section, listNode, width, height }) {
			check();
			const values = [
				u32(section, "section"),
				u32(listNode, "listNode"),
				u32(width, "width"),
				u32(height, "height")
			];
			if (typeof wasm.hwp5_edit_set_cell_size !== "function") throw new Error("Hwp5CellSizeAbiUnavailable");
			success(wasm.hwp5_edit_set_cell_size(...values));
		},
		setCellSizes(cells) {
			check();
			const bytes = encodeCellSizes(cells);
			if (typeof wasm.hwp5_edit_set_cell_sizes !== "function") throw new Error("Hwp5CellSizeBatchAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_cell_sizes(ptr, size)));
		},
		setPictureCurrentSize({ section, pictureNode, width, height }) {
			check();
			const values = [
				u32(section, "section"),
				u32(pictureNode, "pictureNode"),
				u32(width, "width"),
				u32(height, "height")
			];
			if (typeof wasm.hwp5_edit_set_picture_current_size !== "function") throw new Error("Hwp5PictureCurrentSizeAbiUnavailable");
			success(wasm.hwp5_edit_set_picture_current_size(...values));
		},
		resizePicture({ section, pictureNode, width, height }) {
			check();
			const values = [
				u32(section, "section"),
				u32(pictureNode, "pictureNode"),
				u32(width, "width"),
				u32(height, "height")
			];
			if (typeof wasm.hwp5_edit_resize_picture !== "function") throw new Error("Hwp5PictureResizeAbiUnavailable");
			success(wasm.hwp5_edit_resize_picture(...values));
		},
		tablePlacements(section) {
			check();
			if (typeof wasm.hwp5_edit_table_placements !== "function") throw new Error("Hwp5TablePlacementsAbiUnavailable");
			return decodeTablePlacements(output(() => wasm.hwp5_edit_table_placements(u32(section, "section"))).bytes, "hwp5");
		},
		tableLayoutSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_table_layout_sources !== "function") throw new Error("Hwp5TableLayoutSourcesAbiUnavailable");
			return decodeHwp5TableLayoutSources(output(() => wasm.hwp5_edit_table_layout_sources(index)).bytes);
		},
		cellLayoutSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_cell_layout_sources !== "function") throw new Error("Hwp5CellLayoutSourcesAbiUnavailable");
			return decodeHwp5CellLayoutSources(output(() => wasm.hwp5_edit_cell_layout_sources(index)).bytes);
		},
		borderFillSources() {
			check();
			if (typeof wasm.hwp5_edit_border_fill_sources !== "function") throw new Error("Hwp5BorderFillSourcesAbiUnavailable");
			return decodeHwp5BorderFillSources(output(() => wasm.hwp5_edit_border_fill_sources()).bytes);
		},
		tableAnchors(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_table_anchors !== "function") throw new Error("Hwp5TableAnchorsAbiUnavailable");
			return decodeHwp5TableAnchors(output(() => wasm.hwp5_edit_table_anchors(index)).bytes);
		},
		structuralAnchors(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_structural_anchors !== "function") throw new Error("Hwp5StructuralAnchorsAbiUnavailable");
			return decodeHwp5StructuralAnchors(output(() => wasm.hwp5_edit_structural_anchors(index)).bytes);
		},
		noteShapeSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_note_shape_sources !== "function") throw new Error("Hwp5NoteShapeSourcesAbiUnavailable");
			return decodeHwp5NoteShapeSources(output(() => wasm.hwp5_edit_note_shape_sources(index)).bytes);
		},
		captionSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_caption_sources !== "function") throw new Error("Hwp5CaptionSourcesAbiUnavailable");
			return decodeHwp5CaptionSources(output(() => wasm.hwp5_edit_caption_sources(index)).bytes);
		},
		supportsFormSources() {
			check();
			return ["hwp5_edit_form_sources", "hwp5_edit_form_anchors"].every((name) => typeof wasm[name] === "function");
		},
		supportsFormProperties() {
			check();
			return typeof wasm.hwp5_edit_form_properties === "function";
		},
		supportsFormTextEdit() {
			check();
			return typeof wasm.hwp5_edit_set_form_text === "function";
		},
		supportsFormTextLayoutRetention() {
			check();
			return typeof wasm.hwp5_edit_set_form_text === "function" && typeof wasm.hwp5_edit_form_text_retains_layout_flags === "function" && wasm.hwp5_edit_form_text_retains_layout_flags() === 1;
		},
		supportsRadioButtonSelect() {
			check();
			return typeof wasm.hwp5_edit_select_form_radio === "function";
		},
		supportsUnnamedRadioSelect() {
			check();
			return typeof wasm.hwp5_edit_select_form_radio === "function" && typeof wasm.hwp5_edit_radio_unnamed_singleton === "function" && wasm.hwp5_edit_radio_unnamed_singleton() === 1;
		},
		selectRadioButton(section, formNode) {
			check();
			const positions = [u32(section, "section"), u32(formNode, "formNode")];
			if (typeof wasm.hwp5_edit_select_form_radio !== "function") throw new Error("Hwp5RadioSelectAbiUnavailable");
			success(wasm.hwp5_edit_select_form_radio(...positions));
		},
		supportsCheckBoxStateEdit() {
			check();
			return typeof wasm.hwp5_edit_set_form_choice === "function";
		},
		setCheckBoxState(section, formNode, state) {
			check();
			const positions = [u32(section, "section"), u32(formNode, "formNode")];
			if (typeof wasm.hwp5_edit_set_form_choice !== "function") throw new Error("Hwp5FormChoiceEditAbiUnavailable");
			const value = [
				"UNCHECKED",
				"CHECKED",
				"INDETERMINATE"
			].indexOf(state);
			if (value < 0) throw new TypeError("InvalidFormChoiceState");
			success(wasm.hwp5_edit_set_form_choice(...positions, value));
		},
		setFormText({ section, formNode, text }) {
			check();
			const positions = [u32(section, "section"), u32(formNode, "formNode")];
			if (typeof wasm.hwp5_edit_set_form_text !== "function") throw new Error("Hwp5FormTextEditAbiUnavailable");
			if (typeof text !== "string") throw new TypeError("Form text must be a string");
			if (!text.isWellFormed()) throw new Error("InvalidUnicodeEncoding");
			if (text.length > 65535) throw new RangeError("LimitExceeded");
			const bytes = encoder$4.encode(text);
			if (bytes.length > 196605) throw new RangeError("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_form_text(...positions, ptr, size)));
		},
		formProperties(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_form_properties !== "function") throw new Error("Hwp5FormPropertiesAbiUnavailable");
			return decodeHwp5FormProperties(output(() => wasm.hwp5_edit_form_properties(index)).bytes);
		},
		formSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_form_sources !== "function") throw new Error("Hwp5FormSourcesAbiUnavailable");
			return decodeHwp5FormSources(output(() => wasm.hwp5_edit_form_sources(index)).bytes);
		},
		formAnchors(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_form_anchors !== "function") throw new Error("Hwp5FormSourcesAbiUnavailable");
			return decodeHwp5FormAnchors(output(() => wasm.hwp5_edit_form_anchors(index)).bytes);
		},
		drawingSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_drawing_sources !== "function") throw new Error("Hwp5DrawingSourcesAbiUnavailable");
			return decodeHwp5DrawingSources(output(() => wasm.hwp5_edit_drawing_sources(index)).bytes);
		},
		drawingObjectExtras(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_drawing_object_extras !== "function") throw new Error("Hwp5DrawingObjectExtrasAbiUnavailable");
			return decodeHwp5DrawingObjectExtras(output(() => wasm.hwp5_edit_drawing_object_extras(index)).bytes);
		},
		drawingComponentSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_drawing_component_sources !== "function") throw new Error("Hwp5DrawingComponentSourcesAbiUnavailable");
			return decodeHwp5DrawingComponentSources(output(() => wasm.hwp5_edit_drawing_component_sources(index)).bytes);
		},
		drawingAnchors(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_drawing_anchors !== "function") throw new Error("Hwp5DrawingAnchorsAbiUnavailable");
			return decodeHwp5DrawingAnchors(output(() => wasm.hwp5_edit_drawing_anchors(index)).bytes);
		},
		drawingListSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_drawing_list_sources !== "function") throw new Error("Hwp5DrawingListSourcesAbiUnavailable");
			return decodeHwp5DrawingListSources(output(() => wasm.hwp5_edit_drawing_list_sources(index)).bytes);
		},
		drawingMatrixSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_drawing_matrix_sources !== "function") throw new Error("Hwp5DrawingMatrixSourcesAbiUnavailable");
			return decodeHwp5DrawingMatrixSources(output(() => wasm.hwp5_edit_drawing_matrix_sources(index)).bytes);
		},
		drawingLocalTransforms(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_drawing_local_transforms !== "function") throw new Error("Hwp5DrawingLocalTransformsAbiUnavailable");
			return decodeHwp5DrawingLocalTransforms(output(() => wasm.hwp5_edit_drawing_local_transforms(index)).bytes);
		},
		drawingRectangleCorners(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_drawing_rectangle_corners !== "function") throw new Error("Hwp5DrawingRectangleCornersAbiUnavailable");
			return decodeHwp5DrawingRectangleCorners(output(() => wasm.hwp5_edit_drawing_rectangle_corners(index)).bytes);
		},
		drawingCurvePoints(section, layout) {
			check();
			const index = u32(section, "section"), selected = curveLayoutArg(layout);
			if (typeof wasm.hwp5_edit_drawing_curve_points !== "function") throw new Error("Hwp5DrawingCurvePointsAbiUnavailable");
			return decodeHwp5DrawingCurvePoints(output(() => wasm.hwp5_edit_drawing_curve_points(index, selected)).bytes);
		},
		drawingPolygonPoints(section, layout) {
			check();
			const index = u32(section, "section"), layoutId = polygonLayoutArg(layout);
			if (typeof wasm.hwp5_edit_drawing_polygon_points !== "function") throw new Error("Hwp5DrawingPolygonPointsAbiUnavailable");
			return decodeHwp5DrawingPolygonPoints(output(() => wasm.hwp5_edit_drawing_polygon_points(index, layoutId)).bytes);
		},
		drawingLineEndpoints(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_drawing_line_endpoints !== "function") throw new Error("Hwp5DrawingLineEndpointsAbiUnavailable");
			return decodeHwp5DrawingLineEndpoints(output(() => wasm.hwp5_edit_drawing_line_endpoints(index)).bytes);
		},
		noteSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_note_sources !== "function") throw new Error("Hwp5NoteSourcesAbiUnavailable");
			return decodeHwp5NoteSources(output(() => wasm.hwp5_edit_note_sources(index)).bytes);
		},
		drawingStyleSources(section, options) {
			check();
			const index = u32(section, "section"), [border, tail] = drawingStyleLayoutArgs(options);
			if (typeof wasm.hwp5_edit_drawing_style_sources !== "function") throw new Error("Hwp5DrawingStyleSourcesAbiUnavailable");
			return decodeHwp5DrawingStyleSources(output(() => wasm.hwp5_edit_drawing_style_sources(index, border, tail)).bytes);
		},
		fileVersion() {
			check();
			if (typeof wasm.hwp5_edit_file_version !== "function") throw new Error("Hwp5FileVersionAbiUnavailable");
			const version = wasm.hwp5_edit_file_version();
			if (version === 0) throw memory.error();
			return version;
		},
		pictureSources(section, prefix) {
			check();
			const index = u32(section, "section"), selection = picturePrefixArg(prefix);
			if (typeof wasm.hwp5_edit_picture_sources !== "function") throw new Error("Hwp5PictureSourcesAbiUnavailable");
			return decodeHwp5PictureSources(output(() => wasm.hwp5_edit_picture_sources(index, selection)).bytes);
		},
		pictureTailSources(section, layout) {
			check();
			const index = u32(section, "section"), selection = pictureTailLayoutArg(layout);
			if (typeof wasm.hwp5_edit_picture_tail_sources !== "function") throw new Error("Hwp5PictureTailSourcesAbiUnavailable");
			return decodeHwp5PictureTailSources(output(() => wasm.hwp5_edit_picture_tail_sources(index, selection)).bytes);
		},
		binaryResource(ordinal, options = {}) {
			check();
			if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => key !== "maxBytes")) throw new Error("Invalid binary options");
			const { maxBytes = 33554432 } = options;
			const id = u32(ordinal, "binary ordinal"), limit = u32(maxBytes, "binary limit");
			if (id > 65535) throw new RangeError("Invalid binary ordinal");
			if (limit > 33554432) throw new RangeError("Invalid binary limit");
			if (typeof wasm.hwp5_edit_binary_resource !== "function") throw new Error("Hwp5BinaryResourceAbiUnavailable");
			return output(() => wasm.hwp5_edit_binary_resource(id, limit)).bytes;
		},
		automaticNumberSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_automatic_number_sources !== "function") throw new Error("Hwp5AutomaticNumberSourcesAbiUnavailable");
			return decodeHwp5AutomaticNumberSources(output(() => wasm.hwp5_edit_automatic_number_sources(index)).bytes);
		},
		pageControlSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_page_control_sources !== "function") throw new Error("Hwp5PageControlSourcesAbiUnavailable");
			return decodeHwp5PageControlSources(output(() => wasm.hwp5_edit_page_control_sources(index)).bytes);
		},
		documentProperties() {
			check();
			if (typeof wasm.hwp5_edit_document_properties !== "function") throw new Error("Hwp5DocumentPropertiesAbiUnavailable");
			return decodeHwp5DocumentProperties(output(() => wasm.hwp5_edit_document_properties()).bytes);
		},
		masterPageSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_master_page_sources !== "function") throw new Error("Hwp5MasterPageSourcesAbiUnavailable");
			return decodeHwp5MasterPageSources(output(() => wasm.hwp5_edit_master_page_sources(index)).bytes);
		},
		pageAreaSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_page_area_sources !== "function") throw new Error("Hwp5PageAreaSourcesAbiUnavailable");
			return decodeHwp5PageAreaSources(output(() => wasm.hwp5_edit_page_area_sources(index)).bytes);
		},
		pageSettings(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_page_settings !== "function") throw new Error("Hwp5PageSettingsAbiUnavailable");
			return decodeHwp5PageSettings(output(() => wasm.hwp5_edit_page_settings(index)).bytes);
		},
		sectionSettings(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_section_settings !== "function") throw new Error("Hwp5SectionSettingsAbiUnavailable");
			return decodeHwp5SectionSettings(output(() => wasm.hwp5_edit_section_settings(index)).bytes);
		},
		paragraphFlow(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_paragraph_flow !== "function") throw new Error("Hwp5ParagraphFlowAbiUnavailable");
			return decodeHwp5ParagraphFlow(output(() => wasm.hwp5_edit_paragraph_flow(index)).bytes);
		},
		columnSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_column_sources !== "function") throw new Error("Hwp5ColumnSourcesAbiUnavailable");
			return decodeHwp5ColumnSources(output(() => wasm.hwp5_edit_column_sources(index)).bytes);
		},
		copyText,
		fieldSpans(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_field_spans !== "function") throw new Error("Hwp5FieldSpansAbiUnavailable");
			return decodeHwp5FieldSpans(output(() => wasm.hwp5_edit_field_spans(index)).bytes);
		},
		supportsFieldTopology() {
			check();
			return typeof wasm.hwp5_edit_field_topology === "function";
		},
		fieldTopology(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_field_topology !== "function") throw new Error("Hwp5FieldTopologyAbiUnavailable");
			return decodeHwp5FieldTopology(output(() => wasm.hwp5_edit_field_topology(index)).bytes);
		},
		formulaSources(section) {
			check();
			const index = u32(section, "section");
			if (typeof wasm.hwp5_edit_formula_sources !== "function") throw new Error("Hwp5FormulaSourcesAbiUnavailable");
			return decodeHwp5FormulaSources(output(() => wasm.hwp5_edit_formula_sources(index)).bytes);
		},
		setFormulaDefinition({ section, sourceNode, formula }) {
			check();
			const positions = [u32(section, "section"), u32(sourceNode, "sourceNode")];
			if (typeof wasm.hwp5_edit_set_formula_definition !== "function") throw new Error("Hwp5FormulaDefinitionAbiUnavailable");
			if (typeof formula !== "string") throw new TypeError("Formula must be a string");
			if (!formula.isWellFormed()) throw new Error("InvalidUnicodeEncoding");
			if (formula.length > 4096) throw new RangeError("LimitExceeded");
			const bytes = encoder$4.encode(formula);
			if (bytes.length > 4096) throw new RangeError("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_formula_definition(...positions, ptr, size)));
		},
		text(section, paragraph) {
			check();
			return decoder.decode(copyText(section, paragraph));
		},
		splice({ section, paragraph, startUnit, endUnit, text, rangePolicy = "reject" }) {
			check();
			const values = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (typeof text !== "string") throw new TypeError("Text must be a string");
			if (!text.isWellFormed()) throw new Error("InvalidUnicodeEncoding");
			if (rangePolicy !== "reject" && rangePolicy !== "half-open") throw new Error("InvalidRangePolicy");
			if (text.length > 4194304) throw new RangeError("LimitExceeded");
			const bytes = encoder$4.encode(text);
			if (bytes.length > 4194304) throw new RangeError("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_splice(...values, ptr, size, rangePolicy === "half-open" ? 1 : 0)));
		},
		splitParagraph({ section, paragraph, atUnit, endUnit = atUnit }) {
			check();
			const values = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(atUnit, "atUnit")
			];
			u32(endUnit, "endUnit");
			if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
			if (endUnit !== atUnit) {
				if (typeof wasm.hwp5_edit_split_range !== "function") throw new Error("Hwp5StructureAbiUnavailable");
				success(wasm.hwp5_edit_split_range(...values, endUnit));
				return;
			}
			if (typeof wasm.hwp5_edit_split !== "function") throw new Error("Hwp5StructureAbiUnavailable");
			success(wasm.hwp5_edit_split(...values));
		},
		mergeParagraph({ section, paragraph }) {
			check();
			const values = [u32(section, "section"), u32(paragraph, "paragraph")];
			if (typeof wasm.hwp5_edit_merge !== "function") throw new Error("Hwp5StructureAbiUnavailable");
			success(wasm.hwp5_edit_merge(...values));
		},
		setCharacterFormat({ section, paragraph, startUnit, endUnit, charShapeId }) {
			check();
			success(wasm.hwp5_edit_format(u32(section, "section"), u32(paragraph, "paragraph"), u32(startUnit, "startUnit"), u32(endUnit, "endUnit"), u32(charShapeId, "charShapeId")));
		},
		setCharacterProperties({ section, paragraph, startUnit, endUnit, properties }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterPropertyArgs(properties);
			if (typeof wasm.hwp5_edit_set_character_properties !== "function") throw new Error("Hwp5CharacterPropertiesAbiUnavailable");
			success(wasm.hwp5_edit_set_character_properties(...positions, ...args));
		},
		replaceParagraphRangesWithFontName({ ranges, text, language, name, properties }) {
			check();
			const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text), font = characterFontNameArgs(language, name);
			const args = properties === void 0 ? null : characterPropertyArgs(properties);
			const action = args ? wasm.hwp5_edit_replace_paragraph_ranges_font_name_properties : wasm.hwp5_edit_replace_paragraph_ranges_font_name;
			if (typeof action !== "function") throw new Error(args ? "Hwp5NamedFontPropertyReplacementAbiUnavailable" : "Hwp5NamedFontReplacementAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => memory.withBytes(font.bytes, (np, ns) => success(action(ptr, size, tp, ts, font.language, np, ns, ...args ?? [])))));
		},
		replaceParagraphRanges({ ranges, text, properties }) {
			check();
			const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text);
			const args = properties === void 0 ? null : characterPropertyArgs(properties);
			const action = args ? wasm.hwp5_edit_replace_paragraph_ranges_properties : wasm.hwp5_edit_replace_paragraph_ranges;
			if (typeof action !== "function") throw new Error(args ? "Hwp5PropertyReplacementAbiUnavailable" : "Hwp5ParagraphReplacementAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => success(action(ptr, size, tp, ts, ...args ?? []))));
		},
		setCharacterStrikeRanges({ ranges, enabled }) {
			check();
			const bytes = encodeCharacterRanges(ranges);
			if (typeof enabled !== "boolean") throw new TypeError("InvalidCharacterProperties");
			if (typeof wasm.hwp5_edit_set_character_strike_ranges !== "function") throw new Error("Hwp5CharacterStrikeRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_strike_ranges(ptr, size, Number(enabled))));
		},
		setCharacterUnderlineRanges({ ranges, kind }) {
			check();
			const bytes = encodeCharacterRanges(ranges), value = characterUnderlineArg(kind);
			if (typeof wasm.hwp5_edit_set_character_underline_ranges !== "function") throw new Error("Hwp5CharacterUnderlineRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwp5_edit_set_character_underline_ranges(ptr, size, value)) throw memory.error();
			});
		},
		setCharacterPropertiesRanges({ ranges, properties }) {
			check();
			const bytes = encodeCharacterRanges(ranges);
			const args = characterPropertyArgs(properties);
			if (typeof wasm.hwp5_edit_set_character_properties_ranges !== "function") throw new Error("Hwp5CharacterPropertiesRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_properties_ranges(ptr, size, ...args)));
		},
		setCharacterFontNameRanges({ ranges, language, name }) {
			check();
			const bytes = encodeCharacterRanges(ranges), args = characterFontNameArgs(language, name);
			if (typeof wasm.hwp5_edit_set_character_font_name_ranges !== "function") throw new Error("Hwp5CharacterFontNameRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => memory.withBytes(args.bytes, (namePtr, nameSize) => {
				if (!wasm.hwp5_edit_set_character_font_name_ranges(ptr, size, args.language, namePtr, nameSize)) throw memory.error();
			}));
		},
		setCharacterFontRanges({ ranges, language, fontId }) {
			check();
			const bytes = encodeCharacterRanges(ranges), args = characterFontArgs(language, fontId);
			if (fontId > 65535) throw new RangeError("InvalidFontId");
			if (typeof wasm.hwp5_edit_set_character_font_ranges !== "function") throw new Error("Hwp5CharacterFontRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_font_ranges(ptr, size, ...args)));
		},
		setCharacterTextColorRanges({ ranges, color }) {
			check();
			const bytes = encodeCharacterRanges(ranges), value = characterColorArg(color);
			if (typeof wasm.hwp5_edit_set_character_text_color_ranges !== "function") throw new Error("Hwp5CharacterTextColorRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_text_color_ranges(ptr, size, value)));
		},
		setCharacterShadeRanges({ ranges, color }) {
			check();
			const bytes = encodeCharacterRanges(ranges), args = characterShadeArgs(color);
			if (typeof wasm.hwp5_edit_set_character_shade_ranges !== "function") throw new Error("Hwp5CharacterShadeRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_shade_ranges(ptr, size, ...args)));
		},
		setCharacterEffectRanges({ ranges, effect, enabled, exclusive = false }) {
			check();
			const bytes = encodeCharacterRanges(ranges), args = characterEffectArgs(effect, enabled);
			const method = characterEffectMode(exclusive) ? wasm.hwp5_edit_set_character_effect_ranges_exclusive : wasm.hwp5_edit_set_character_effect_ranges;
			if (typeof method !== "function") throw new Error(exclusive ? "Hwp5CharacterEffectRangesExclusiveAbiUnavailable" : "Hwp5CharacterEffectRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(method(ptr, size, ...args)));
		},
		setCharacterOutlineRanges({ ranges, kind }) {
			check();
			const bytes = encodeCharacterRanges(ranges), value = hwp5CharacterOutlineArg(kind);
			const action = value > 1 ? wasm.hwp5_edit_set_character_outline_ranges_extended : wasm.hwp5_edit_set_character_outline_ranges;
			if (typeof action !== "function") throw new Error(value > 1 ? "Hwp5CharacterOutlineRangesExtendedAbiUnavailable" : "Hwp5CharacterOutlineRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(action(ptr, size, value)));
		},
		setCharacterStrike({ section, paragraph, startUnit, endUnit, enabled }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			if (typeof enabled !== "boolean") throw new TypeError("InvalidCharacterProperties");
			if (typeof wasm.hwp5_edit_set_character_strike !== "function") throw new Error("Hwp5CharacterStrikeAbiUnavailable");
			success(wasm.hwp5_edit_set_character_strike(...positions, Number(enabled)));
		},
		setCharacterUnderline({ section, paragraph, startUnit, endUnit, kind }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = characterUnderlineArg(kind);
			if (typeof wasm.hwp5_edit_set_character_underline !== "function") throw new Error("Hwp5CharacterUnderlineAbiUnavailable");
			success(wasm.hwp5_edit_set_character_underline(...positions, value));
		},
		setCharacterStrikeColor({ section, paragraph, startUnit, endUnit, color }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = characterColorArg(color);
			if (typeof wasm.hwp5_edit_set_character_strike_color !== "function") throw new Error("Hwp5CharacterStrikeColorAbiUnavailable");
			success(wasm.hwp5_edit_set_character_strike_color(...positions, value));
		},
		setCharacterUnderlineColor({ section, paragraph, startUnit, endUnit, color }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = characterColorArg(color);
			if (typeof wasm.hwp5_edit_set_character_underline_color !== "function") throw new Error("Hwp5CharacterUnderlineColorAbiUnavailable");
			success(wasm.hwp5_edit_set_character_underline_color(...positions, value));
		},
		setCharacterFont({ section, paragraph, startUnit, endUnit, language, fontId }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterFontArgs(language, fontId);
			if (fontId > 65535) throw new RangeError("InvalidFontId");
			if (typeof wasm.hwp5_edit_set_character_font !== "function") throw new Error("Hwp5CharacterFontAbiUnavailable");
			success(wasm.hwp5_edit_set_character_font(...positions, ...args));
		},
		setCharacterFontName({ section, paragraph, startUnit, endUnit, language, name }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterFontNameArgs(language, name);
			if (typeof wasm.hwp5_edit_set_character_font_name !== "function") throw new Error("Hwp5CharacterFontNameAbiUnavailable");
			memory.withBytes(args.bytes, (ptr, size) => success(wasm.hwp5_edit_set_character_font_name(...positions, args.language, ptr, size)));
		},
		spliceWithCharacterProperties(input) {
			check();
			const { positions, bytes } = textTransactionArgs(input);
			const properties = characterPropertyArgs(input.properties);
			const action = wasm.hwp5_edit_splice_character_properties;
			if (typeof action !== "function") throw new Error("Hwp5CharacterPropertyTextAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => success(action(...positions, ptr, size, ...properties)));
		},
		spliceWithFontName(input) {
			check();
			const { positions, bytes, font } = namedFontTextArgs(input);
			const properties = input.properties === void 0 ? null : characterPropertyArgs(input.properties);
			const action = properties ? wasm.hwp5_edit_splice_font_name_properties : wasm.hwp5_edit_splice_font_name;
			if (typeof action !== "function") throw new Error(properties ? "Hwp5NamedFontPropertyTextAbiUnavailable" : "Hwp5NamedFontTextAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => memory.withBytes(font.bytes, (namePtr, nameSize) => success(action(...positions, ptr, size, font.language, namePtr, nameSize, ...properties ?? []))));
		},
		setCharacterTextColor({ section, paragraph, startUnit, endUnit, color }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = characterColorArg(color);
			if (typeof wasm.hwp5_edit_set_character_text_color !== "function") throw new Error("Hwp5CharacterTextColorAbiUnavailable");
			success(wasm.hwp5_edit_set_character_text_color(...positions, value));
		},
		setCharacterShade({ section, paragraph, startUnit, endUnit, color }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterShadeArgs(color);
			if (typeof wasm.hwp5_edit_set_character_shade !== "function") throw new Error("Hwp5CharacterShadeAbiUnavailable");
			success(wasm.hwp5_edit_set_character_shade(...positions, ...args));
		},
		setCharacterEffect({ section, paragraph, startUnit, endUnit, effect, enabled, exclusive = false }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterEffectArgs(effect, enabled);
			const method = characterEffectMode(exclusive) ? wasm.hwp5_edit_set_character_effect_exclusive : wasm.hwp5_edit_set_character_effect;
			if (typeof method !== "function") throw new Error(exclusive ? "Hwp5CharacterEffectExclusiveAbiUnavailable" : "Hwp5CharacterEffectAbiUnavailable");
			success(method(...positions, ...args));
		},
		setCharacterOutline({ section, paragraph, startUnit, endUnit, kind }) {
			check();
			const positions = [
				u32(section, "section"),
				u32(paragraph, "paragraph"),
				u32(startUnit, "startUnit"),
				u32(endUnit, "endUnit")
			];
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = hwp5CharacterOutlineArg(kind);
			const action = value > 1 ? wasm.hwp5_edit_set_character_outline_extended : wasm.hwp5_edit_set_character_outline;
			if (typeof action !== "function") throw new Error(value > 1 ? "Hwp5CharacterOutlineExtendedAbiUnavailable" : "Hwp5CharacterOutlineAbiUnavailable");
			success(action(...positions, value));
		},
		save({ allowStaleLayout = false } = {}) {
			check();
			if (typeof allowStaleLayout !== "boolean") throw new TypeError("allowStaleLayout must be boolean");
			return output(() => wasm.hwp5_edit_save(allowStaleLayout ? 1 : 0));
		},
		close() {
			if (!closed) wasm.hwp5_edit_close();
			closed = true;
		}
	};
}
var encoder$4, decoder, u32;
var init_hwp5_editor = __esmMin((() => {
	init_cell_diagonal_command();
	init_cell_border_patch_command();
	init_cell_style_command();
	init_cell_fill_command();
	init_atomic_formatting_api();
	init_abi();
	init_cell_size_batch();
	init_cell_border_batch();
	init_cell_appearance_command();
	init_cell_background_command();
	init_cell_border_command();
	init_character_font_metrics();
	init_character_effects();
	init_character_effect_args();
	init_character_outline_args();
	init_character_outlines();
	init_hwp5_structural_anchors();
	init_hwp5_page_area_sources();
	init_hwp5_master_page_sources();
	init_hwp5_document_properties();
	init_hwp5_automatic_number_sources();
	init_hwp5_page_control_sources();
	init_hwp5_note_sources();
	init_hwp5_form_sources();
	init_hwp5_form_properties();
	init_hwp5_note_shape_sources();
	init_hwp5_caption_sources();
	init_hwp5_drawing_sources();
	init_hwp5_drawing_object_extras();
	init_hwp5_drawing_component_sources();
	init_hwp5_drawing_anchors();
	init_hwp5_drawing_list_sources();
	init_hwp5_drawing_matrix_sources();
	init_hwp5_drawing_local_transforms();
	init_hwp5_drawing_rectangle_corners();
	init_hwp5_drawing_polygon_points();
	init_hwp5_drawing_curve_points();
	init_hwp5_drawing_line_endpoints();
	init_hwp5_drawing_style_sources();
	init_hwp5_picture_sources();
	init_hwp5_picture_tail_sources();
	init_paragraph_margin_args();
	init_paragraph_spacing_args();
	init_character_property_args();
	init_character_range_batch();
	init_paragraph_replacement();
	init_character_underline_args();
	init_character_color_args();
	init_character_shade_args();
	init_character_shades();
	init_character_font_args();
	init_character_font_name_args();
	init_named_font_text_args();
	init_text_transaction_args();
	init_character_underlines();
	init_character_strikes();
	init_character_strike_styles();
	init_character_text_colors();
	init_character_font_references();
	init_font_faces();
	init_font_face_metadata();
	init_character_underline_styles();
	init_wasm_memory();
	init_input();
	init_abi_schema();
	init_editor_history();
	init_paragraph_break_api();
	init_character_shapes_wire();
	init_table_bindings_wire();
	init_table_placements_wire();
	init_paragraph_shapes_wire();
	init_hwp5_page_settings();
	init_hwp5_section_settings();
	init_hwp5_table_layout_sources();
	init_hwp5_cell_layout_sources();
	init_hwp5_border_fill_sources();
	init_hwp5_table_anchors();
	init_hwp5_flow_sources();
	init_hwp5_formula_sources();
	init_hwp5_field_spans();
	init_hwp5_field_topology();
	init_hwp5_text_source_protection();
	init_hwp5_normalization_info();
	init_hwp5_observed_docinfo();
	init_hwp5_available_section_copy();
	init_hwp5_current_references();
	init_hwp5_table_creation();
	init_hwp5_text_wire();
	encoder$4 = new TextEncoder();
	decoder = new TextDecoder("utf-16le", {
		fatal: true,
		ignoreBOM: true
	});
	u32 = (value, name) => {
		if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError(`Invalid ${name}`);
		return value;
	};
}));
// ../../js/hwpx-table-caption.mjs
/** Source caption scalar values; node numbers belong to the current XML tree. */
function decodeTableCaption(bytes) {
	return validateTableCaption(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateTableCaption(value) {
	if (value === null) return null;
	const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
	const signed = (v) => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
	const optional = (v, check) => v === null || check(v);
	for (const field of [
		"text_direction",
		"line_wrap",
		"vertical_alignment"
	]) if (!optional(value?.[field], (v) => uint(v) && v <= 2)) throw new Error("InvalidTableCaption");
	if (!value || typeof value !== "object" || Array.isArray(value) || !uint(value.caption_node) || !optional(value.list_node, uint) || !optional(value.side, (v) => uint(v) && v <= 3) || ![
		null,
		false,
		true
	].includes(value.full_size) || !optional(value.width, signed) || !optional(value.gap, signed) || !optional(value.last_width, uint)) throw new Error("InvalidTableCaption");
	return value;
}
var init_hwpx_table_caption = __esmMin((() => {}));
// ../../js/hwpx-shape-source-values.mjs
/** Shared nullable scalar contract for JSON shape geometry, position and flow. */
function validateShapeSourceValues(value) {
	const fail = () => {
		throw new Error("InvalidShapeSourceValues");
	};
	const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
	const signed = (v) => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
	const optional = (v, check) => v === null || check(v);
	const geometry = value?.geometry;
	if (!geometry || ![geometry.width, geometry.height].every((v) => optional(v, uint)) || !optional(geometry.width_relative, (v) => uint(v) && v <= 4) || !optional(geometry.height_relative, (v) => uint(v) && v <= 2) || ![
		null,
		false,
		true
	].includes(geometry.treat_as_character) || ![geometry.horizontal_offset, geometry.vertical_offset].every((v) => optional(v, signed))) fail();
	if (Object.hasOwn(value, "position")) {
		const p = value.position;
		if (!p || !Array.isArray(p.flags) || p.flags.length !== 4 || !p.flags.every((v) => [
			null,
			false,
			true
		].includes(v)) || !Array.isArray(p.relations) || p.relations.length !== 4 || !p.relations.every((v, i) => optional(v, (n) => uint(n) && n <= [
			2,
			3,
			4,
			4
		][i]))) fail();
	}
	if (Object.hasOwn(value, "flow")) {
		const f = value.flow;
		if (!f || !optional(f.text_wrap, (n) => uint(n) && n <= 5) || !optional(f.text_flow, (n) => uint(n) && n <= 3) || !optional(f.z_order, signed) || !Array.isArray(f.outside_margins) || f.outside_margins.length !== 4 || !f.outside_margins.every((v) => optional(v, signed))) fail();
	}
	return value;
}
var init_hwpx_shape_source_values = __esmMin((() => {}));
// ../../js/hwpx-drawing-text-values.mjs
function validDrawingTextValues(text, drawingNode) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const signed = (value) => Number.isSafeInteger(value) && value >= -2147483648 && value <= 4294967295;
	const optional = (value, check) => value === null || check(value);
	return Boolean(text && typeof text === "object" && !Array.isArray(text) && uint(drawingNode) && uint(text.node) && text.node > drawingNode && optional(text.list_node, uint) && (text.list_node === null || text.list_node > text.node) && typeof text.margin_present === "boolean" && Array.isArray(text.margins) && text.margins.length === 4 && Array.from(text.margins).every((value) => optional(value, signed)) && [
		null,
		false,
		true
	].includes(text.editable) && optional(text.last_width, uint) && (text.margin_present || text.margins.every((value) => value === null)) && [
		text.text_direction,
		text.line_wrap,
		text.vertical_alignment
	].every((value) => optional(value, (n) => uint(n) && n <= 2)));
}
var init_hwpx_drawing_text_values = __esmMin((() => {}));
// ../../js/hwpx-drawing-text-snapshot.mjs
function decodeDrawingTextSnapshot(bytes) {
	const fail = () => {
		throw new Error("InvalidDrawingTextSnapshot");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length > 65536) return fail();
	let value;
	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
	const signed = (v) => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
	const optional = (v, check) => v === null || check(v);
	if (!value || ![
		value.drawing_node,
		value.paragraph,
		value.anchor_unit
	].every(uint) || value.paragraph === 0) return fail();
	if (value.group_context !== void 0 && value.group_context !== null) {
		const group = value.group_context;
		if (!group || ![
			group.parent_container,
			group.root_anchor,
			group.depth
		].every(uint) || group.depth < 1 || group.root_anchor > group.parent_container || group.parent_container >= value.drawing_node) return fail();
	}
	const geometry = value.geometry, text = value.text;
	if (!geometry || !validDrawingTextValues(text, value.drawing_node)) return fail();
	try {
		validateShapeSourceValues(value);
	} catch {
		return fail();
	}
	if (Object.hasOwn(value, "caption")) {
		try {
			validateTableCaption(value.caption);
		} catch {
			return fail();
		}
		if (value.caption !== null && value.caption.caption_node <= value.drawing_node) return fail();
	}
	if (Object.hasOwn(value, "transform_identity") && ![
		null,
		false,
		true
	].includes(value.transform_identity)) return fail();
	if (Object.hasOwn(value, "rendering")) {
		const r = value.rendering;
		if (!r || !Array.isArray(r.flip) || r.flip.length !== 2 || !r.flip.every((v) => [
			null,
			false,
			true
		].includes(v)) || ![
			null,
			false,
			true
		].includes(r.reverse) || !optional(r.angle, uint)) return fail();
		if (Object.hasOwn(r, "center") && (!Array.isArray(r.center) || r.center.length !== 2 || !r.center.every((v) => optional(v, signed)))) return fail();
		if (Object.hasOwn(r, "rotate_image") && ![
			null,
			false,
			true
		].includes(r.rotate_image)) return fail();
		if (r.matrix === null) {
			if (![
				"UnsupportedPictureMatrixSequence",
				"IncompletePictureMatrix",
				"NonFinitePictureMatrix"
			].includes(r.matrix_error)) return fail();
		} else if (!Array.isArray(r.matrix) || r.matrix.length !== 6 || !r.matrix.every(Number.isFinite) || r.matrix_error !== null) return fail();
	}
	if (Object.hasOwn(value, "rectangle")) {
		const r = value.rectangle;
		if (!r || typeof r.present !== "boolean" || !uint(r.unknown_children) || !Array.isArray(r.points) || r.points.length !== 4 || !r.points.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => optional(v, signed))) || !Array.isArray(r.point_present) || r.point_present.length !== 4 || !r.point_present.every((v) => typeof v === "boolean")) return fail();
		if (r.points.some((point, i) => !r.point_present[i] && point.some((v) => v !== null)) || !r.present && r.point_present.some(Boolean)) return fail();
	}
	if (Object.hasOwn(value, "stroke")) {
		if (value.stroke === null) {
			if (![
				"UnsupportedLineStrokeDecoration",
				"UnsupportedLineStrokeColor",
				"UnsupportedLineStrokeStyle"
			].includes(value.stroke_error)) return fail();
		} else {
			const s = value.stroke;
			if (!s || value.stroke_error !== null || !optional(s.color, (n) => uint(n) && n <= 16777215) || !optional(s.width, uint) || !optional(s.style, (n) => uint(n) && n <= 6)) return fail();
		}
	}
	if (Object.hasOwn(value, "rendering_corners") && value.rendering_corners !== null && (!Array.isArray(value.rendering_corners) || value.rendering_corners.length !== 4 || !value.rendering_corners.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) return fail();
	if (Object.hasOwn(value, "paint")) {
		const p = value.paint;
		if (!p || ![p.fill_node, p.shadow_node].every((v) => optional(v, uint)) || !optional(p.shadow_type, (n) => uint(n) && n <= 14) || p.shadow_node === null && p.shadow_type !== null) return fail();
	}
	return value;
}
var init_hwpx_drawing_text_snapshot = __esmMin((() => {
	init_hwpx_table_caption();
	init_hwpx_shape_source_values();
	init_hwpx_drawing_text_values();
}));
// ../../js/hwpx-drawing-text-requested.mjs
function drawingTextRequest(nodes, limit) {
	if (!uint$19(limit) || limit < 1 || limit > 1024) throw Error("InvalidDrawingTextRequestLimit");
	if (!Array.isArray(nodes)) throw Error("InvalidDrawingTextRequest");
	const count = nodes.length;
	if (!uint$19(count) || count > limit) throw Error("InvalidDrawingTextRequest");
	const requested = [];
	for (let index = 0; index < count; index++) {
		if (!Object.hasOwn(nodes, index)) throw Error("InvalidDrawingTextRequest");
		const node = nodes[index];
		if (!uint$19(node)) throw Error("InvalidDrawingTextRequest");
		requested.push(node);
	}
	if (nodes.length !== count) throw Error("InvalidDrawingTextRequest");
	return {
		requested,
		bytes: new TextEncoder().encode(JSON.stringify(requested))
	};
}
function decodeDrawingTextRequested(bytes, requested) {
	const fail = () => {
		throw Error("InvalidDrawingTextRequested");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length > 67371010) fail();
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!Array.isArray(rows) || rows.length !== requested.length || rows.length > 1024) fail();
	const encoder = new TextEncoder();
	return rows.map((row, index) => {
		if (!row || typeof row !== "object" || Array.isArray(row) || row.node !== requested[index] || Object.keys(row).length !== 2) fail();
		if (Object.hasOwn(row, "unavailable")) {
			if (typeof row.unavailable !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(row.unavailable) || row.unavailable === "OutOfMemory") fail();
			return {
				node: row.node,
				unavailable: row.unavailable
			};
		}
		if (!Object.hasOwn(row, "source")) fail();
		const source = decodeDrawingTextSnapshot(encoder.encode(JSON.stringify(row.source)));
		if (source.drawing_node !== row.node) fail();
		return {
			node: row.node,
			source
		};
	});
}
var uint$19;
var init_hwpx_drawing_text_requested = __esmMin((() => {
	init_hwpx_drawing_text_snapshot();
	uint$19 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
}));
// ../../js/u32-index-request.mjs
/** Shared bounded count+u32 request envelope; callers own semantic errors. */
function encodeU32IndexRequest(indices, limit, limitError, requestError) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!uint(limit) || limit === 0) throw Error(limitError);
	if (!Array.isArray(indices) || indices.length > limit) throw RangeError(requestError);
	for (let at = 0; at < indices.length; at++) if (!Object.hasOwn(indices, at) || !uint(indices[at])) throw RangeError(requestError);
	const bytes = new Uint8Array(4 + indices.length * 4), view = new DataView(bytes.buffer);
	view.setUint32(0, indices.length, true);
	indices.forEach((index, at) => view.setUint32(4 + at * 4, index, true));
	return bytes;
}
var init_u32_index_request = __esmMin((() => {}));
// ../../js/hwpx-line-geometry.mjs
function decodeLineGeometry(bytes, expectedNode) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
	if (!value || value.current !== true || value.coordinateSpace !== "renderingInfo" || value.paintable !== false || value.geometry?.node !== expectedNode || ![
		"node",
		"paragraph",
		"anchor_node",
		"anchor_unit"
	].every((name) => uint(value.geometry[name])) || value.geometry.paragraph < 1 || !Array.isArray(value.geometry.endpoints) || value.geometry.endpoints.length !== 2 || !value.geometry.endpoints.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) throw new Error("InvalidLineGeometry");
	return value;
}
var init_hwpx_line_geometry = __esmMin((() => {}));
// ../../js/hwpx-picture-geometry-wire.mjs
function decodePictureGeometry(bytes) {
	const fail = () => {
		throw new Error("InvalidPictureGeometry");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length !== 48) fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const flags = view.getUint32(4, true);
	if (view.getUint32(0, true) !== 826757192 || flags & -128 || view.getUint32(28, true)) fail();
	const values = Array.from({ length: 5 }, (_, i) => view.getUint32(8 + i * 4, true));
	if (values[2] > 4 || values[3] > 2 || values[4] > 1) fail();
	const result = {};
	for (const [index, name] of [
		"width",
		"height",
		"widthRelative",
		"heightRelative",
		"treatAsCharacter"
	].entries()) {
		if (!(flags & 1 << index) && values[index] !== 0) fail();
		result[name] = flags & 1 << index ? index === 4 ? Boolean(values[index]) : values[index] : null;
	}
	for (const [index, name] of ["horizontalOffset", "verticalOffset"].entries()) {
		const value = view.getBigInt64(32 + index * 8, true), present = flags & 1 << index + 5;
		if (value < -2147483648n || value > 4294967295n || !present && value !== 0n) fail();
		result[name] = present ? Number(value) : null;
	}
	return result;
}
var init_hwpx_picture_geometry_wire = __esmMin((() => {}));
// ../../js/hwpx-picture-position-wire.mjs
function decodePicturePosition(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length !== 40) throw new Error("InvalidPicturePosition");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), presence = view.getUint32(4, true);
	if (view.getUint32(0, true) !== 827347016 || presence & -256) throw new Error("InvalidPicturePosition");
	const fields = [
		1,
		1,
		1,
		1,
		2,
		3,
		4,
		4
	].map((maximum, index) => {
		const value = view.getUint32(8 + index * 4, true), present = Boolean(presence & 1 << index);
		if (value > maximum || !present && value !== 0) throw new Error("InvalidPicturePosition");
		return present ? index < 4 ? Boolean(value) : value : null;
	});
	return {
		flags: fields.slice(0, 4),
		relations: fields.slice(4)
	};
}
var init_hwpx_picture_position_wire = __esmMin((() => {}));
// ../../js/hwpx-picture-flow-wire.mjs
function decodePictureFlow(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length !== 56) throw new Error("InvalidPictureFlow");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), presence = view.getUint32(4, true);
	if (view.getUint32(0, true) !== 826691656 || presence & -128) throw new Error("InvalidPictureFlow");
	const fields = Array.from({ length: 7 }, (_, index) => {
		const value = index < 2 ? view.getUint32(8 + index * 4, true) : Number(view.getBigInt64(16 + (index - 2) * 8, true));
		const present = Boolean(presence & 1 << index);
		if (index < 2 ? value > [5, 3][index] : value < -2147483648 || value > 4294967295) throw new Error("InvalidPictureFlow");
		if (!present && value !== 0) throw new Error("InvalidPictureFlow");
		return present ? value : null;
	});
	return {
		textWrap: fields[0],
		textFlow: fields[1],
		zOrder: fields[2],
		outsideMargins: fields.slice(3)
	};
}
var init_hwpx_picture_flow_wire = __esmMin((() => {}));
// ../../js/hwpx-drawing-placement-wire.mjs
function decodeDrawingPlacement(bytes, errorName = "InvalidDrawingPlacement") {
	if (!(bytes instanceof Uint8Array) || bytes.length !== 144) throw new Error(errorName);
	return {
		geometry: decodePictureGeometry(bytes.subarray(0, 48)),
		position: decodePicturePosition(bytes.subarray(48, 88)),
		flow: decodePictureFlow(bytes.subarray(88, 144))
	};
}
var init_hwpx_drawing_placement_wire = __esmMin((() => {
	init_hwpx_picture_geometry_wire();
	init_hwpx_picture_position_wire();
	init_hwpx_picture_flow_wire();
}));
// ../../js/hwpx-line-display-wire.mjs
function decodeLinePlacement(bytes) {
	return decodeDrawingPlacement(bytes, "InvalidLinePlacement");
}
function decodeLineNodes(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length < 8) throw new Error("InvalidLineNodes");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const count = view.getUint32(4, true);
	if (view.getUint32(0, true) !== 827214920 || bytes.length !== 8 + count * 4) throw new Error("InvalidLineNodes");
	const nodes = Array.from({ length: count }, (_, i) => view.getUint32(8 + i * 4, true));
	if (nodes.some((node, i) => i > 0 && node <= nodes[i - 1])) throw new Error("InvalidLineNodes");
	return nodes;
}
function decodeLineDisplay(bytes) {
	if (!(bytes instanceof Uint8Array) || ![56, 72].includes(bytes.length)) throw new Error("InvalidLineDisplay");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== (bytes.length === 56 ? 826559560 : 843336776) || view.getUint32(4, true) !== 0 || view.getUint32(12, true) === 0) throw new Error("InvalidLineDisplay");
	const endpoints = [0, 1].map((i) => [0, 1].map((axis) => view.getFloat64(24 + (i * 2 + axis) * 8, true)));
	if (endpoints.flat().some((number) => !Number.isFinite(number))) throw new Error("InvalidLineDisplay");
	let stroke = {
		color: null,
		width: null,
		style: null
	};
	if (bytes.length === 72) {
		const flags = view.getUint32(56, true);
		if (flags > 7) throw new Error("InvalidLineDisplay");
		stroke = Object.fromEntries([
			"color",
			"width",
			"style"
		].map((name, i) => {
			const value = view.getUint32(60 + i * 4, true), present = flags & 1 << i;
			if (!present && value !== 0) throw new Error("InvalidLineDisplay");
			return [name, present ? value : null];
		}));
		if (stroke.color > 16777215 || stroke.style > 5) throw new Error("InvalidLineDisplay");
	}
	return {
		lineNode: view.getUint32(8, true),
		paragraph: view.getUint32(12, true),
		anchorNode: view.getUint32(16, true),
		anchorUnit: view.getUint32(20, true),
		endpoints,
		stroke
	};
}
var init_hwpx_line_display_wire = __esmMin((() => {
	init_hwpx_drawing_placement_wire();
}));
// ../../js/hwpx-line-display-batch.mjs
function encodeLineDisplayNodes(nodes, limit) {
	return encodeU32IndexRequest(nodes, limit, "InvalidLineDisplayBatchLimit", "InvalidLineDisplayBatchNodes");
}
function decodeLineDisplayBatch(bytes, nodes) {
	const fail = () => {
		throw Error("InvalidLineDisplayBatch");
	};
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!Array.isArray(rows) || rows.length !== nodes.length) fail();
	return rows.map((row, index) => {
		if (!row || typeof row !== "object" || Array.isArray(row) || row.node !== nodes[index]) fail();
		if (Object.hasOwn(row, "error")) {
			if (Object.keys(row).length !== 2 || !errorName(row.error)) fail();
			return row;
		}
		if (Object.keys(row).length !== 3 || !Object.hasOwn(row, "geometry")) fail();
		const geometry = decodeLineGeometry(new TextEncoder().encode(JSON.stringify(row.geometry)), nodes[index]);
		if (Object.hasOwn(row, "displayError")) {
			if (!errorName(row.displayError)) fail();
			return {
				node: row.node,
				geometry,
				displayError: row.displayError
			};
		}
		if (!Array.isArray(row.display) || row.display.length !== 72 || !row.display.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) fail();
		const display = decodeLineDisplay(Uint8Array.from(row.display)), g = geometry.geometry;
		if (display.lineNode !== row.node || display.paragraph !== g.paragraph || display.anchorNode !== g.anchor_node || display.anchorUnit !== g.anchor_unit || display.endpoints.some((p, i) => p.some((n, j) => n !== g.endpoints[i][j]))) fail();
		return {
			node: row.node,
			geometry,
			display
		};
	});
}
var errorName;
var init_hwpx_line_display_batch = __esmMin((() => {
	init_u32_index_request();
	init_hwpx_line_geometry();
	init_hwpx_line_display_wire();
	errorName = (value) => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value) && value !== "OutOfMemory";
}));
// ../../js/hwpx-fill-brushes.mjs
function decodeFillBrushes(bytes) {
	const fail = () => {
		throw new Error("InvalidFillBrushes");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length > 134217728) return fail();
	let v;
	try {
		v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
	const optionalUint = (n) => n === null || uint(n);
	const kinds = [
		"win_brush",
		"gradation",
		"img_brush",
		"color",
		"image"
	];
	if (!v || !Array.isArray(v.brushes) || !Array.isArray(v.nodes) || !Array.isArray(v.kind_counts) || v.kind_counts.length !== kinds.length || !v.kind_counts.every(uint)) return fail();
	for (const key of [
		"header_and_sections",
		"master_pages",
		"other_attributes",
		"unknown_enums",
		"non_six_hex_colors",
		"attribute_bytes",
		"direct_children",
		"color_count_mismatch"
	]) if (!uint(v[key])) return fail();
	for (const b of v.brushes) if (!b || ![
		"header",
		"section",
		"master_page"
	].includes(b.part_kind) || ![
		b.part_item_index,
		b.element_index,
		b.other_attributes,
		b.direct_children
	].every(uint) || !optionalUint(b.section_ordinal) || !optionalUint(b.parent_element_index) || !Array.isArray(b.child_counts) || b.child_counts.length !== 3 || !b.child_counts.every(uint)) return fail();
	const counts = kinds.map(() => 0);
	for (const [index, n] of v.nodes.entries()) {
		if (!n || !kinds.includes(n.kind) || !uint(n.brush_index) || n.brush_index >= v.brushes.length || !optionalUint(n.parent_node_index) || n.parent_node_index !== null && n.parent_node_index >= index || ![
			n.element_index,
			n.attribute_bytes,
			n.other_attributes,
			n.unknown_enums,
			n.non_six_hex_colors,
			n.direct_children,
			n.recognized_children
		].every(uint) || !Array.isArray(n.raw) || n.raw.length !== 19 || !n.raw.every((s) => s === null || typeof s === "string")) return fail();
		if (n.parent_node_index !== null && v.nodes[n.parent_node_index].brush_index !== n.brush_index) return fail();
		counts[kinds.indexOf(n.kind)]++;
	}
	if (!counts.every((count, i) => count === v.kind_counts[i])) return fail();
	return v;
}
var init_hwpx_fill_brushes = __esmMin((() => {}));
// ../../js/hwpx-table-border-sources.mjs
function decodeTableBorderSources(bytes) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const fail = () => {
		throw new Error("InvalidTableBorderSources");
	};
	const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
	const optionalUint = (v) => v === null || uint(v);
	const text = (v) => v === null || typeof v === "string" && v.length <= 4096;
	const edge = (v) => v === null || v && !Array.isArray(v) && [
		"style",
		"width",
		"color"
	].every((k) => text(v[k]));
	if (!value || value.sourceOnly !== true || !Array.isArray(value.cells) || !Array.isArray(value.styles) || value.cells.length > 1e5 || value.styles.length > 4096) fail();
	const ids = /* @__PURE__ */ new Set(), nodes = /* @__PURE__ */ new Set();
	for (const style of value.styles) {
		if (!style || !uint(style.id) || !uint(style.node) || ids.has(style.id) || nodes.has(style.node) || !Array.isArray(style.edges) || style.edges.length !== 4 || !style.edges.every(edge) || !edge(style.diagonal) || ![
			"slash",
			"back_slash",
			"three_d",
			"shadow",
			"center_line"
		].every((k) => text(style[k])) || ![
			"slash_crooked",
			"slash_is_counter",
			"back_slash_crooked",
			"back_slash_is_counter",
			"break_cell_separate_line"
		].every((k) => !Object.hasOwn(style, k) || text(style[k])) || ![
			"slash_node",
			"back_slash_node",
			"fill_node"
		].every((k) => optionalUint(style[k])) || !uint(style.unknown_children) || style.unknown_attributes !== void 0 && !uint(style.unknown_attributes)) fail();
		ids.add(style.id);
		nodes.add(style.node);
		if (style.fill_report !== void 0 && style.fill_report !== null) {
			const report = decodeFillBrushes(new TextEncoder().encode(JSON.stringify(style.fill_report)));
			if (report.brushes.length !== 1 || report.brushes[0].part_kind !== "header" || report.brushes[0].section_ordinal !== null || report.brushes[0].element_index !== style.fill_node || report.brushes[0].parent_element_index !== style.node) fail();
		}
	}
	let previous = -1;
	const lists = /* @__PURE__ */ new Set();
	for (const cell of value.cells) {
		if (!cell || !uint(cell.table_node) || !uint(cell.cell_node) || cell.cell_node <= previous || cell.table_node >= cell.cell_node || !uint(cell.list_node) || cell.list_node <= cell.cell_node || lists.has(cell.list_node) || !optionalUint(cell.border_fill_id) || !optionalUint(cell.style_index) || cell.border_fill_id === null !== (cell.style_index === null) || cell.style_index !== null && value.styles[cell.style_index]?.id !== cell.border_fill_id) fail();
		previous = cell.cell_node;
		lists.add(cell.list_node);
	}
	return value;
}
var init_hwpx_table_border_sources = __esmMin((() => {
	init_hwpx_fill_brushes();
}));
// ../../js/hwpx-table-border-batch.mjs
function encodeTableBorderSections(sections, limit) {
	return encodeU32IndexRequest(sections, limit, "InvalidTableBorderBatchLimit", "InvalidTableBorderSections");
}
function decodeTableBorderBatch(bytes, sections) {
	const fail = () => {
		throw Error("InvalidTableBorderBatch");
	};
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!Array.isArray(value) || value.length !== sections.length) fail();
	for (const [index, entry] of value.entries()) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry) || entry.section !== sections[index] || !uint$18(entry.section)) fail();
		if (Object.hasOwn(entry, "error")) {
			if (Object.hasOwn(entry, "value") || Object.keys(entry).length !== 2 || typeof entry.error !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(entry.error) || entry.error === "OutOfMemory") fail();
		} else {
			if (Object.keys(entry).length !== 2 || !Object.hasOwn(entry, "value")) fail();
			entry.value = decodeTableBorderSources(new TextEncoder().encode(JSON.stringify(entry.value)));
		}
	}
	return value;
}
var uint$18;
var init_hwpx_table_border_batch = __esmMin((() => {
	init_u32_index_request();
	init_hwpx_table_border_sources();
	uint$18 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
}));
// ../../js/hwpx-shape-layout-values.mjs
function validShapeLayoutValues(value) {
	const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
	const optional = (n, check) => n === null || check(n);
	const signed = (n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295;
	const bool = (n) => n === null || typeof n === "boolean";
	const array = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
	const g = value?.geometry, p = value?.position, f = value?.flow;
	return Boolean(g && p && f && [g.width, g.height].every((n) => optional(n, uint)) && optional(g.width_relative, (n) => uint(n) && n <= 4) && optional(g.height_relative, (n) => uint(n) && n <= 2) && bool(g.treat_as_character) && [g.horizontal_offset, g.vertical_offset].every((n) => optional(n, signed)) && array(p.flags, 4, bool) && Array.isArray(p.relations) && p.relations.length === 4 && p.relations.every((n, i) => optional(n, (n) => uint(n) && n <= [
		2,
		3,
		4,
		4
	][i])) && optional(f.text_wrap, (n) => uint(n) && n <= 5) && optional(f.text_flow, (n) => uint(n) && n <= 3) && optional(f.z_order, signed) && array(f.outside_margins, 4, (n) => optional(n, signed)));
}
var init_hwpx_shape_layout_values = __esmMin((() => {}));
// ../../js/hwpx-shape-paint-values.mjs
function validShapePaintValues(source) {
	const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
	const optional = (n, check) => n === null || check(n);
	if (source?.stroke === null) {
		if (![
			"UnsupportedLineStrokeDecoration",
			"UnsupportedLineStrokeColor",
			"UnsupportedLineStrokeStyle"
		].includes(source.stroke_error)) return false;
	} else if (!source?.stroke || source.stroke_error !== null || !optional(source.stroke.color, (n) => uint(n) && n <= 16777215) || !optional(source.stroke.width, uint) || !optional(source.stroke.style, (n) => uint(n) && n <= 6)) return false;
	const paint = source.paint;
	return Boolean(paint && [paint.fill_node, paint.shadow_node].every((n) => optional(n, uint)) && optional(paint.shadow_type, (n) => uint(n) && n <= 14) && !(paint.shadow_node === null && paint.shadow_type !== null));
}
var init_hwpx_shape_paint_values = __esmMin((() => {}));
// ../../js/hwpx-shape-common-source.mjs
function validShapeCommonSource(value) {
	if (!validShapeLayoutValues(value)) return false;
	if (Object.hasOwn(value, "component_sizes")) {
		const sizes = value.component_sizes;
		if (!object$9(sizes) || !["original", "current"].every((key) => sizes[key] === null || object$9(sizes[key]) && [sizes[key].width, sizes[key].height].every((n) => n === null || uint$17(n)))) return false;
	}
	if (Object.hasOwn(value, "stroke_style") && !(value.stroke_style === null || uint$17(value.stroke_style) && value.stroke_style <= 17)) return false;
	if (value.stroke && value.stroke_style !== void 0 && value.stroke_style !== value.stroke.style) return false;
	if ([
		"stroke",
		"stroke_error",
		"paint"
	].some((key) => Object.hasOwn(value, key)) && !validShapePaintValues(value)) return false;
	const r = value.rendering;
	if (!object$9(r) || !Array.isArray(r.flip) || r.flip.length !== 2 || !Array.from(r.flip).every(optionalBoolean) || !(r.angle === null || uint$17(r.angle)) || !optionalBoolean(r.reverse) || !optionalBoolean(r.rotate_image) || !Array.isArray(r.center) || r.center.length !== 2 || !Array.from(r.center).every(coordinate$2)) return false;
	return r.matrix === null ? [
		"UnsupportedPictureMatrixSequence",
		"IncompletePictureMatrix",
		"NonFinitePictureMatrix"
	].includes(r.matrix_error) : Array.isArray(r.matrix) && r.matrix.length === 6 && Array.from(r.matrix).every(Number.isFinite) && r.matrix_error === null;
}
var object$9, uint$17, coordinate$2, optionalBoolean;
var init_hwpx_shape_common_source = __esmMin((() => {
	init_hwpx_shape_layout_values();
	init_hwpx_shape_paint_values();
	object$9 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	uint$17 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	coordinate$2 = (value) => value === null || Number.isInteger(value) && value >= -2147483648 && value <= 4294967295;
	optionalBoolean = (value) => value === null || typeof value === "boolean";
}));
// ../../js/hwpx-group-context.mjs
function validGroupContext(value, node) {
	const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
	if (!uint(node)) return false;
	if (value === null) return true;
	return Boolean(value && typeof value === "object" && !Array.isArray(value) && [
		value.parent_container,
		value.root_anchor,
		value.depth
	].every(uint) && value.depth >= 1 && value.root_anchor <= value.parent_container && value.parent_container < node && value.depth <= value.parent_container - value.root_anchor + 1 && value.depth === 1 === (value.parent_container === value.root_anchor));
}
var init_hwpx_group_context = __esmMin((() => {}));
// ../../js/hwpx-curve-geometry.mjs
function decodeCurveGeometry(bytes) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!object$8(value) || value.sourceOnly !== true || !uint$16(value.node) || Object.hasOwn(value, "common") && (!validShapeCommonSource(value.common) || !validGroupContext(value.common.group_context, value.node)) || Object.hasOwn(value, "text") && value.text !== null && !validDrawingTextValues(value.text, value.node) || !Array.isArray(value.segments) || value.segments.length > 65536 || !Array.from(value.segments).every((segment) => object$8(segment) && (segment.kind === null || typeof segment.kind === "string" && new TextEncoder().encode(segment.kind).length <= 4096) && [
		"x1",
		"y1",
		"x2",
		"y2"
	].every((key) => coordinate$1(segment[key])))) throw new Error("InvalidCurveGeometry");
	return value;
}
var object$8, uint$16, coordinate$1;
var init_hwpx_curve_geometry = __esmMin((() => {
	init_hwpx_shape_common_source();
	init_hwpx_group_context();
	init_hwpx_drawing_text_values();
	object$8 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	uint$16 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	coordinate$1 = (value) => value === null || Number.isInteger(value) && value >= -2147483648 && value <= 4294967295;
}));
// ../../js/hwpx-curve-owner.mjs
function decodeCurveOwner(bytes) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const owner = value?.owner;
	if (!object$7(value) || value.sourceOnly !== true || !uint$15(value.node) || owner !== null && (!object$7(owner) || ![
		owner.paragraph,
		owner.anchor_node,
		owner.anchor_unit
	].every(uint$15) || owner.paragraph === 0 || owner.anchor_node >= value.node)) throw new Error("InvalidCurveOwner");
	return value;
}
var uint$15, object$7;
var init_hwpx_curve_owner = __esmMin((() => {
	uint$15 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	object$7 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
}));
// ../../js/hwpx-tab-sources.mjs
function decodeTabSources(bytes) {
	return validateTabSources(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateTabSources(value) {
	if (!object$6(value) || !uint$14(value.section) || !uint$14(value.paragraph) || value.paragraph === 0 || !Array.isArray(value.rows)) throw new Error("InvalidTabSources");
	let previous = -1;
	const nodes = /* @__PURE__ */ new Set();
	for (const row of value.rows) {
		if (!object$6(row) || !uint$14(row.unit) || !uint$14(row.node) || row.unit <= previous || nodes.has(row.node) || ![
			row.width,
			row.tab_type,
			row.leader
		].every((raw) => raw === null || typeof raw === "string" && new TextEncoder().encode(raw).length <= 4096)) throw new Error("InvalidTabSources");
		previous = row.unit;
		nodes.add(row.node);
	}
	return value;
}
var uint$14, object$6;
var init_hwpx_tab_sources = __esmMin((() => {
	uint$14 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	object$6 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
}));
// ../../js/hwpx-tab-definitions.mjs
function validateTabDefinitions(rows) {
	if (!Array.isArray(rows)) throw new Error("InvalidTabDefinitions");
	let previous = -1, count = 0;
	for (const row of rows) {
		if (!object$5(row) || !uint$13(row.id) || row.id <= previous || !raw$1(row.auto_left) || !raw$1(row.auto_right) || !Array.isArray(row.items)) throw new Error("InvalidTabDefinitions");
		previous = row.id;
		count += row.items.length;
		if (count > 1e6) throw new Error("InvalidTabDefinitions");
		for (const item of row.items) if (!object$5(item) || !raw$1(item.pos) || !raw$1(item.kind) || !raw$1(item.leader) || Object.hasOwn(item, "unit") && !raw$1(item.unit)) throw new Error("InvalidTabDefinitions");
	}
	return rows;
}
function decodeTabDefinitions(bytes) {
	return validateTabDefinitions(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var uint$13, object$5, raw$1;
var init_hwpx_tab_definitions = __esmMin((() => {
	uint$13 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	object$5 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	raw$1 = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
}));
// ../../js/hwpx-section-tabs.mjs
function validateSectionTabs(rows) {
	if (!Array.isArray(rows)) throw new Error("InvalidSectionTabSources");
	let previous = null;
	for (const row of rows) {
		if (!row || typeof row !== "object" || Array.isArray(row) || !uint$12(row.section) || !uint$12(row.node) || ![
			row.tab_stop,
			row.tab_stop_val,
			row.tab_stop_unit
		].every(raw) || Object.hasOwn(row, "body_owner") && row.body_owner !== null && (!uint$12(row.body_owner) || row.body_owner >= row.node) || previous && (row.section < previous.section || row.section === previous.section && row.node <= previous.node)) throw new Error("InvalidSectionTabSources");
		previous = row;
	}
	return rows;
}
function decodeSectionTabs(bytes) {
	return validateSectionTabs(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
var uint$12, raw;
var init_hwpx_section_tabs = __esmMin((() => {
	uint$12 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	raw = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
}));
// ../../js/equation-engine.mjs
/** Stateless optional engine. Caller binds source/revision to its editor lease. */
function createEquationEngine(wasm) {
	for (const name of [
		"equation_process",
		"equation_output_ptr",
		"equation_output_len",
		"equation_output_free",
		"equation_error_ptr",
		"equation_error_len"
	]) if (typeof wasm?.[name] !== "function") throw new Error("EquationEngineAbiUnavailable");
	const memory = createMemory(wasm);
	const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", { fatal: true });
	function run(operation, source, settings, extra = {}) {
		if (typeof source !== "string" || !source.isWellFormed()) throw new Error("InvalidEquationSource");
		if (source.length > 1048576) throw new Error("EquationProtocolLimitExceeded");
		for (const key of [
			"size",
			"script_scale",
			"fraction_scale"
		]) if (!Number.isFinite(settings?.[key]) || settings[key] <= 0) throw new Error("InvalidEquationMeasurementSize");
		if (settings.allow_unclosed_groups !== void 0 && typeof settings.allow_unclosed_groups !== "boolean") throw new Error("InvalidEquationRecoveryPolicy");
		const json = JSON.stringify({
			operation,
			source,
			size: settings.size,
			script_scale: settings.script_scale,
			fraction_scale: settings.fraction_scale,
			...settings.allow_unclosed_groups === true ? { allow_unclosed_groups: true } : {},
			...extra
		});
		if (json.length > 16777216) throw new Error("EquationProtocolLimitExceeded");
		const input = encoder.encode(json);
		if (input.length > 16777216) throw new Error("EquationProtocolLimitExceeded");
		try {
			return memory.withBytes(input, (ptr, size) => {
				if (!wasm.equation_process(ptr, size)) throw new Error(decoder.decode(memory.copy(wasm.equation_error_ptr(), wasm.equation_error_len())));
				const length = wasm.equation_output_len();
				if (!Number.isInteger(length) || length < 0 || length > 33554432) throw new Error("InvalidEquationOutputLength");
				return JSON.parse(decoder.decode(memory.copy(wasm.equation_output_ptr(), length)));
			});
		} finally {
			wasm.equation_output_free();
		}
	}
	return {
		measure: (source, settings) => run("measure", source, settings),
		layout: (source, settings, measurements, layout) => run("layout", source, settings, {
			measurements,
			layout
		})
	};
}
var init_equation_engine = __esmMin((() => {
	init_wasm_memory();
}));
// ../../js/hwpx-equation-styles.mjs
function decodeEquationStyles(bytes) {
	const fail = () => {
		throw new Error("InvalidHwpxEquationStyles");
	};
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!Array.isArray(rows) || rows.length > 1e5) return fail();
	const seen = /* @__PURE__ */ new Set();
	const sizes = /* @__PURE__ */ new Set(), uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
	for (const row of rows) {
		if (!Number.isInteger(row?.node) || row.node < 0 || row.node > 4294967295 || seen.has(row.node)) return fail();
		seen.add(row.node);
		for (const key of [
			"font",
			"base_unit",
			"base_line",
			"text_color",
			"line_mode",
			"error_name"
		]) if (row[key] !== null && (typeof row[key] !== "string" || !row[key].isWellFormed() || row[key].length > 4096)) return fail();
		if (row.error_name !== null && !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row.error_name)) return fail();
		if (row.error_name !== null && [
			"font",
			"base_unit",
			"base_line",
			"text_color",
			"line_mode"
		].some((key) => row[key] !== null)) return fail();
		if (row.size_error !== void 0 && row.size_error !== null && (typeof row.size_error !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row.size_error) || row.source_size !== null)) return fail();
		const size = row.source_size;
		if (size !== void 0 && size !== null) {
			if (!size || typeof size !== "object" || Array.isArray(size) || !uint(size.node) || size.node <= row.node || sizes.has(size.node) || !uint(size.other_attributes) || !uint(size.direct_children) || row.error_name !== null || [
				"width",
				"height",
				"width_relative_to",
				"height_relative_to",
				"protect"
			].some((key) => size[key] !== null && (typeof size[key] !== "string" || !size[key].isWellFormed() || size[key].length > 4096))) return fail();
			sizes.add(size.node);
		}
	}
	return rows;
}
var init_hwpx_equation_styles = __esmMin((() => {}));
// ../../js/chart-point-batch.mjs
function readChartPointBatchLimits(wasm) {
	if (![
		"hwpx_edit_set_chart_points",
		"hwpx_edit_chart_point_batch_max_edits",
		"hwpx_edit_chart_point_batch_max_bytes",
		"hwpx_edit_chart_point_max_bytes"
	].every((name) => typeof wasm[name] === "function")) throw new Error("HwpxChartBatchEditAbiUnavailable");
	const limits = {
		maxEdits: wasm.hwpx_edit_chart_point_batch_max_edits(),
		maxBytes: wasm.hwpx_edit_chart_point_batch_max_bytes(),
		maxValueBytes: wasm.hwpx_edit_chart_point_max_bytes()
	};
	validateLimits(limits);
	if (!Number.isInteger(limits.maxValueBytes) || limits.maxValueBytes <= 0 || limits.maxValueBytes > 4294967295) throw new Error("InvalidChartBatchLimit");
	return limits;
}
function validateLimits({ maxEdits, maxBytes }) {
	if (!Number.isInteger(maxEdits) || maxEdits <= 0 || maxEdits > 4294967295 || !Number.isInteger(maxBytes) || maxBytes < 4 || maxBytes > 4294967295) throw new Error("InvalidChartBatchLimit");
}
function encodeChartPointBatch(edits, { maxEdits, maxBytes }, encodeValue) {
	validateLimits({
		maxEdits,
		maxBytes
	});
	if (!Array.isArray(edits)) throw new TypeError("InvalidChartPointBatch");
	if (edits.length > maxEdits) throw new RangeError("LimitExceeded");
	const seen = /* @__PURE__ */ new Set(), rows = [];
	let size = 4;
	for (const edit of edits) {
		if (!edit || typeof edit !== "object" || Array.isArray(edit)) throw new TypeError("InvalidChartPointBatch");
		const point = edit.point, value = edit.value;
		if (!Number.isInteger(point) || point < 0 || point > 4294967295) throw new RangeError("InvalidInteger");
		if (seen.has(point)) throw new Error("DuplicateChartPointEdit");
		seen.add(point);
		const bytes = encodeValue(value);
		if (!(bytes instanceof Uint8Array)) throw new TypeError("InvalidChartPointBytes");
		size += 8 + bytes.length;
		if (!Number.isSafeInteger(size) || size > maxBytes) throw new RangeError("LimitExceeded");
		rows.push({
			point,
			bytes
		});
	}
	const output = new Uint8Array(size), view = new DataView(output.buffer);
	view.setUint32(0, rows.length, true);
	let offset = 4;
	for (const row of rows) {
		view.setUint32(offset, row.point, true);
		view.setUint32(offset + 4, row.bytes.length, true);
		output.set(row.bytes, offset + 8);
		offset += 8 + row.bytes.length;
	}
	return output;
}
var init_chart_point_batch = __esmMin((() => {}));
// ../../js/hwpx-chart-series-text.mjs
function decodeChartSeriesText(bytes) {
	return validateChartSeriesText(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateChartSeriesText(value) {
	if (value?.kind !== "direct_series" || !Array.isArray(value.values)) throw new Error("InvalidChartSeriesText");
	const seen = /* @__PURE__ */ new Set();
	for (const row of value.values) {
		if (!row || ![
			row.series_node,
			row.text_node,
			row.value_node
		].every((n) => Number.isInteger(n) && n >= 0 && n <= 4294967295) || !(row.series_node < row.text_node && row.text_node < row.value_node) || typeof row.text !== "string" || !row.text.isWellFormed() || seen.has(row.value_node)) throw new Error("InvalidChartSeriesText");
		seen.add(row.value_node);
	}
	return value;
}
var init_hwpx_chart_series_text = __esmMin((() => {}));
// ../../js/hwpx-chart-rich-text.mjs
function decodeChartRichText(bytes) {
	return validateChartRichText(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
function validateChartRichText(value) {
	if (value?.kind !== "rich_text" || !Array.isArray(value.values)) throw new Error("InvalidChartRichText");
	let previousLeaf = -1;
	const runs = /* @__PURE__ */ new Set();
	for (const row of value.values) {
		if (row?.owner_role !== void 0 && ![
			"chart_title",
			"axis_title",
			"data_label",
			"unclassified"
		].includes(row.owner_role)) throw new Error("InvalidChartRichText");
		if (row?.plain_text_complete !== void 0 && (typeof row.plain_text_complete !== "boolean" || row.owner_role === void 0)) throw new Error("InvalidChartRichText");
		const nodes = row && [
			row.owner_node,
			row.text_node,
			row.rich_node,
			row.paragraph_node,
			row.run_node,
			row.value_node
		];
		if (!nodes || !nodes.every((n) => Number.isInteger(n) && n >= 0 && n <= 4294967295) || !nodes.every((n, i) => i === 0 || nodes[i - 1] < n) || row.value_node <= previousLeaf || runs.has(row.run_node) || typeof row.text !== "string" || !row.text.isWellFormed()) throw new Error("InvalidChartRichText");
		previousLeaf = row.value_node;
		runs.add(row.run_node);
	}
	return value;
}
var init_hwpx_chart_rich_text = __esmMin((() => {}));
// ../../js/chart-display-fields.mjs
function field(value, accepts, owner) {
	return value === null || object$4(value) && uint$11(value.node) && value.node > owner && (value.value === null || accepts(value.value));
}
function number(value) {
	return object$4(value) && (value.kind === "finite" ? typeof value.value === "number" && Number.isFinite(value.value) : [
		"positive_infinity",
		"negative_infinity",
		"not_a_number"
	].includes(value.kind) && value.value === null);
}
function scaling(value, owner) {
	return value === null || object$4(value) && uint$11(value.node) && value.node > owner && field(value.orientation, oneOf(["minMax", "maxMin"]), value.node) && [
		value.minimum,
		value.maximum,
		value.log_base
	].every((item) => field(item, number, value.node));
}
var object$4, uint$11, text$1, nullableUint, oneOf;
var init_chart_display_fields = __esmMin((() => {
	object$4 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	uint$11 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	text$1 = (value) => typeof value === "string" && value.isWellFormed();
	nullableUint = (value) => value === null || uint$11(value);
	oneOf = (values) => (value) => values.includes(value);
}));
// ../../js/chart-display-host.mjs
function chartDisplayHost(value, wrapper) {
	if (!object$4(value) || value.wrapper_node !== wrapper || !uint$11(value.chart_node) || value.chart_node <= wrapper) return false;
	const g = value.geometry, p = value.position;
	return object$4(g) && object$4(p) && [g.width, g.height].every(optional(uint$11)) && optional(bounded(4))(g.width_relative) && optional(bounded(2))(g.height_relative) && optional(boolean)(g.treat_as_character) && [g.horizontal_offset, g.vertical_offset].every(optional(offset)) && Array.isArray(p.flags) && p.flags.length === 4 && p.flags.every(optional(boolean)) && Array.isArray(p.relations) && p.relations.length === 4 && p.relations.every((v, i) => optional(bounded([
		2,
		3,
		4,
		4
	][i]))(v));
}
var optional, bounded, boolean, offset;
var init_chart_display_host = __esmMin((() => {
	init_chart_display_fields();
	optional = (accepts) => (value) => value === null || accepts(value);
	bounded = (max) => (value) => uint$11(value) && value <= max;
	boolean = (value) => typeof value === "boolean";
	offset = (value) => Number.isInteger(value) && value >= -2147483648 && value <= 4294967295;
}));
// ../../js/chart-series-settings.mjs
/** Wire ownership validation only; native code owns XML and absent defaults. */
function validChartSeriesSettings(values, plots, series, occupied = null) {
	if (!Array.isArray(values) || values.length !== series.size) return false;
	let index = 0;
	for (const [node, plotNode] of series) {
		const row = values[index++], kind = plots.get(plotNode)?.kind;
		if (!object$4(row) || row.series_node !== node || row.plot_node !== plotNode || !field(row.smooth, (v) => typeof v === "boolean", node)) return false;
		if (!field(row.index, uint$11, node) || !field(row.order, uint$11, node)) return false;
		const line = [
			"lineChart",
			"line3DChart",
			"stockChart",
			"scatterChart"
		].includes(kind);
		if (row.smooth !== null && !line) return false;
		if (!field(row.explosion, uint$11, node)) return false;
		if (row.explosion !== null && ![
			"pieChart",
			"pie3DChart",
			"ofPieChart",
			"doughnutChart"
		].includes(kind)) return false;
		const marker = row.marker;
		if (marker !== null && (!line && kind !== "radarChart" || !object$4(marker) || !uint$11(marker.node) || marker.node <= node || !field(marker.symbol, oneOf(symbols), marker.node) || !field(marker.size, (v) => uint$11(v) && v >= 2 && v <= 72, marker.node))) return false;
		const leaves = [
			row.index,
			row.order,
			row.smooth,
			row.explosion,
			...marker ? [
				marker,
				marker.symbol,
				marker.size
			] : []
		].filter((value) => value !== null);
		const stroke = row.stroke, strokeNodes = [];
		if (stroke !== void 0 && stroke !== null) {
			if (!object$4(stroke) || !uint$11(stroke.node) || stroke.node <= node || !(stroke.no_fill_node === null || uint$11(stroke.no_fill_node) && stroke.no_fill_node > stroke.node)) return false;
			strokeNodes.push(stroke.node);
			if (stroke.no_fill_node !== null) strokeNodes.push(stroke.no_fill_node);
		}
		const identities = [...leaves.map((value) => value.node), ...strokeNodes];
		if (new Set(identities).size !== identities.length) return false;
		for (const leaf of leaves) occupied?.add(leaf.node);
	}
	return true;
}
var symbols;
var init_chart_series_settings = __esmMin((() => {
	init_chart_display_fields();
	symbols = [
		"auto",
		"circle",
		"dash",
		"diamond",
		"dot",
		"none",
		"picture",
		"plus",
		"square",
		"star",
		"triangle",
		"x"
	];
}));
// ../../js/chart-point-settings.mjs
/** Typed dPt ownership only; explicit idx is not an array offset. */
function validChartPointSettings(values, series, occupied = null) {
	if (!Array.isArray(values)) return false;
	let previous = -1;
	for (const row of values) {
		if (!object$4(row) || !uint$11(row.node) || row.node <= previous || !series.has(row.series_node) || series.get(row.series_node) !== row.plot_node || row.node <= row.series_node || typeof row.unparsed_children !== "boolean" || !field(row.index, uint$11, row.node) || !field(row.explosion, uint$11, row.node)) return false;
		if (row.index !== null && row.explosion !== null && row.index.node === row.explosion.node) return false;
		occupied?.add(row.node);
		if (row.index !== null) occupied?.add(row.index.node);
		if (row.explosion !== null) occupied?.add(row.explosion.node);
		previous = row.node;
	}
	return true;
}
var init_chart_point_settings = __esmMin((() => {
	init_chart_display_fields();
}));
// ../../js/chart-stock-settings.mjs
function validChartStockSettings(stock, kind, plotNode, usedNodes) {
	if (kind !== "stockChart") return stock === null;
	if (!object$4(stock)) return false;
	for (const key of [
		"high_low_node",
		"up_down_node",
		"up_node",
		"down_node"
	]) if (!nullableUint(stock[key])) return false;
	if (stock.up_down_node === null && (stock.up_node !== null || stock.down_node !== null || stock.gap_width !== null)) return false;
	const parent = stock.up_down_node ?? plotNode;
	if (!field(stock.gap_width, (value) => uint$11(value) && value <= 500, parent)) return false;
	for (const key of ["up_node", "down_node"]) if (stock[key] !== null && stock[key] <= parent) return false;
	for (const node of [
		stock.high_low_node,
		stock.up_down_node,
		stock.up_node,
		stock.down_node,
		stock.gap_width?.node ?? null
	]) {
		if (node === null) continue;
		if (node <= plotNode || usedNodes.has(node)) return false;
		usedNodes.add(node);
	}
	return true;
}
var init_chart_stock_settings = __esmMin((() => {
	init_chart_display_fields();
}));
// ../../js/chart-view-3d.mjs
function validChartView3D(value, occupied = null) {
	if (value === void 0 || value === null) return true;
	if (!object$4(value) || !uint$11(value.node) || value.node === 0 || occupied?.has(value.node) || typeof value.unparsed_children !== "boolean") return false;
	const ranges = {
		rotation_x: [-90, 90],
		rotation_y: [0, 360],
		height_percent: [5, 500],
		depth_percent: [20, 2e3],
		perspective: [0, 240]
	};
	const nodes = /* @__PURE__ */ new Set([value.node]);
	for (const key of [...Object.keys(ranges), "right_angle_axes"]) {
		const accepts = key === "right_angle_axes" ? (v) => typeof v === "boolean" : (v) => Number.isInteger(v) && v >= ranges[key][0] && v <= ranges[key][1];
		const leaf = value[key];
		if (!field(leaf, accepts, value.node)) return false;
		if (leaf !== null) {
			if (nodes.has(leaf.node) || occupied?.has(leaf.node)) return false;
			nodes.add(leaf.node);
		}
	}
	return true;
}
var init_chart_view_3d = __esmMin((() => {
	init_chart_display_fields();
}));
// ../../js/chart-spatial-settings.mjs
function validChartSpatialSettings(value, kind, owner, leaves) {
	if (value === void 0) return true;
	if (![
		"bar3DChart",
		"line3DChart",
		"area3DChart"
	].includes(kind)) return value === null;
	if (!object$4(value) || !field(value.gap_depth, (v) => uint$11(v) && v <= 500, owner) || !field(value.shape, oneOf([
		"box",
		"cone",
		"coneToMax",
		"cylinder",
		"pyramid",
		"pyramidToMax"
	]), owner)) return false;
	if (kind !== "bar3DChart" && value.shape !== null) return false;
	for (const leaf of [value.gap_depth, value.shape]) if (leaf !== null) {
		if (leaves.has(leaf.node)) return false;
		leaves.add(leaf.node);
	}
	return true;
}
var init_chart_spatial_settings = __esmMin((() => {
	init_chart_display_fields();
}));
// ../../js/hwpx-chart-display.mjs
function decodeChartDisplay(bytes) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	require(object$4(value) && value.kind === "chart_display");
	for (const name of [
		"plots",
		"plot_settings",
		"axes",
		"axis_links",
		"points",
		"bindings",
		"series_text",
		"rich_text"
	]) require(Array.isArray(value[name]));
	const pair = value.pair;
	require(object$4(pair) && text$1(pair.chart_path) && pair.chart_path.length > 0 && text$1(pair.ole_path) && pair.ole_path.length > 0 && uint$11(pair.wrapper_node) && uint$11(pair.section_ordinal) && typeof pair.declared_external === "boolean" && Array.isArray(pair.section_sha256) && pair.section_sha256.length === 32 && pair.section_sha256.every((n) => uint$11(n) && n <= 255));
	require(chartDisplayHost(value.host, pair.wrapper_node));
	require(value.plots.length === value.plot_settings.length);
	const plots = /* @__PURE__ */ new Map(), series = /* @__PURE__ */ new Map(), references = /* @__PURE__ */ new Map();
	const hasStrokes = Array.isArray(value.series_settings) && value.series_settings.some((row) => row?.stroke != null);
	const hasMajorTicks = value.axes.some((axis) => axis?.major_tick_mark != null);
	const occupied = value.view_3d == null && value.blank_policy == null && !hasStrokes && !hasMajorTicks ? null : /* @__PURE__ */ new Set();
	let previousPlot = -1;
	for (const [index, plot] of value.plots.entries()) {
		require(object$4(plot) && uint$11(plot.node) && plot.node > previousPlot && uint$11(plot.area_node) && plot.area_node < plot.node && plotKinds.has(plot.kind) && Array.isArray(plot.series_nodes));
		plots.set(plot.node, plot);
		previousPlot = plot.node;
		occupied?.add(plot.node);
		occupied?.add(plot.area_node);
		let previousSeries = plot.node;
		for (const node of plot.series_nodes) {
			require(uint$11(node) && node > previousSeries && !series.has(node));
			series.set(node, plot.node);
			previousSeries = node;
			occupied?.add(node);
		}
		const settings = value.plot_settings[index];
		require(object$4(settings) && field(settings.direction, oneOf(["bar", "col"]), plot.node) && field(settings.grouping, oneOf([
			"standard",
			"clustered",
			"stacked",
			"percentStacked"
		]), plot.node) && field(settings.vary_colors, (v) => typeof v === "boolean", plot.node) && Array.isArray(settings.axis_references));
		require(field(settings.gap_width, (v) => uint$11(v) && v <= 500, plot.node) && field(settings.overlap, (v) => Number.isInteger(v) && v >= -100 && v <= 100, plot.node));
		require(field(settings.scatter_style, oneOf([
			"line",
			"lineMarker",
			"marker",
			"smooth",
			"smoothMarker"
		]), plot.node));
		if (settings.scatter_style !== null) require(plot.kind === "scatterChart");
		require(field(settings.first_slice_angle, (v) => uint$11(v) && v <= 360, plot.node));
		if (settings.first_slice_angle !== null) require(["pieChart", "doughnutChart"].includes(plot.kind));
		require(field(settings.of_pie_type, oneOf(["pie", "bar"]), plot.node) && field(settings.second_pie_size, (v) => uint$11(v) && v >= 5 && v <= 200, plot.node) && field(settings.split_type, oneOf([
			"auto",
			"cust",
			"percent",
			"pos",
			"val"
		]), plot.node) && field(settings.split_position, number, plot.node) && nullableUint(settings.custom_split_node) && (settings.custom_split_node === null || settings.custom_split_node > plot.node));
		if ([
			settings.of_pie_type,
			settings.second_pie_size,
			settings.split_type,
			settings.split_position,
			settings.custom_split_node
		].some((value) => value !== null)) require(plot.kind === "ofPieChart");
		const bar = ["barChart", "bar3DChart"].includes(plot.kind);
		if (settings.direction !== null) require(bar);
		if (settings.grouping !== null) require(bar || [
			"lineChart",
			"line3DChart",
			"areaChart",
			"area3DChart"
		].includes(plot.kind));
		if (!bar && settings.grouping?.value === "clustered") fail$1();
		if (settings.gap_width !== null) require([
			"barChart",
			"bar3DChart",
			"ofPieChart"
		].includes(plot.kind));
		if (settings.overlap !== null) require(plot.kind === "barChart");
		const leaves = /* @__PURE__ */ new Set();
		for (const leaf of [
			settings.direction,
			settings.grouping,
			settings.vary_colors,
			settings.gap_width,
			settings.overlap,
			settings.scatter_style,
			settings.first_slice_angle,
			settings.of_pie_type,
			settings.second_pie_size,
			settings.split_type,
			settings.split_position,
			...settings.custom_split_node === null ? [] : [{ node: settings.custom_split_node }],
			...settings.axis_references
		]) if (leaf !== null) {
			require(object$4(leaf) && uint$11(leaf.node) && !leaves.has(leaf.node));
			leaves.add(leaf.node);
		}
		require(validChartStockSettings(settings.stock, plot.kind, plot.node, leaves));
		require(validChartSpatialSettings(settings.spatial, plot.kind, plot.node, leaves));
		for (const node of leaves) occupied?.add(node);
		for (const reference of settings.axis_references) {
			require(reference !== null && field(reference, uint$11, plot.node));
			const key = plot.node + ":" + reference.node;
			require(!references.has(key));
			references.set(key, reference.value);
		}
	}
	const axes = /* @__PURE__ */ new Map(), definitions = /* @__PURE__ */ new Map();
	require(validChartSeriesSettings(value.series_settings, plots, series, occupied));
	require(validChartPointSettings(value.point_settings, series, occupied));
	for (const axis of value.axes) {
		require(object$4(axis) && uint$11(axis.node) && !axes.has(axis.node) && uint$11(axis.area_node) && axis.area_node < axis.node && [
			"catAx",
			"valAx",
			"dateAx",
			"serAx"
		].includes(axis.kind) && field(axis.id, uint$11, axis.node) && field(axis.cross_axis, uint$11, axis.node) && field(axis.position, oneOf([
			"b",
			"l",
			"r",
			"t"
		]), axis.node) && field(axis.deleted, (v) => typeof v === "boolean", axis.node) && scaling(axis.scaling, axis.node) && (axis.major_tick_mark === void 0 || field(axis.major_tick_mark, oneOf([
			"cross",
			"in",
			"none",
			"out"
		]), axis.node)));
		axes.set(axis.node, axis);
		occupied?.add(axis.node);
		occupied?.add(axis.area_node);
		for (const leaf of [
			axis.id,
			axis.cross_axis,
			axis.position,
			axis.deleted,
			axis.scaling,
			...axis.scaling ? [
				axis.scaling.orientation,
				axis.scaling.minimum,
				axis.scaling.maximum,
				axis.scaling.log_base
			] : []
		]) if (leaf !== null) occupied?.add(leaf.node);
		if (axis.id?.value !== null && axis.id?.value !== void 0) {
			const key = axis.area_node + ":" + axis.id.value;
			const rows = definitions.get(key) ?? [];
			rows.push(axis.node);
			definitions.set(key, rows);
		}
	}
	require(value.axis_links.length === references.size);
	const seenLinks = /* @__PURE__ */ new Set();
	for (const link of value.axis_links) {
		require(object$4(link) && uint$11(link.plot_node) && plots.has(link.plot_node) && uint$11(link.reference_node) && nullableUint(link.id) && object$4(link.target));
		const key = link.plot_node + ":" + link.reference_node;
		require(references.has(key) && !seenLinks.has(key) && references.get(key) === link.id);
		seenLinks.add(key);
		const matches = link.id === null ? [] : definitions.get(plots.get(link.plot_node).area_node + ":" + link.id) ?? [];
		const status = link.id === null ? "missing_value" : matches.length === 0 ? "missing_definition" : matches.length > 1 ? "ambiguous" : "resolved";
		require(link.target.status === status && link.target.node === (status === "resolved" ? matches[0] : null));
	}
	require(value.bindings.length === value.points.length);
	let previousLeaf = -1;
	const pointNodes = /* @__PURE__ */ new Set();
	for (const [index, point] of value.points.entries()) {
		require(object$4(point) && [
			point.cache_node,
			point.point_node,
			point.value_node,
			point.index
		].every(uint$11) && point.cache_node < point.point_node && point.point_node < point.value_node && point.value_node > previousLeaf && !pointNodes.has(point.point_node) && pointKinds.has(point.kind) && text$1(point.value) && nullableUint(point.level_node) && (point.level_node === null || point.cache_node < point.level_node && point.level_node < point.point_node) && point.kind === "multilevel_cache" === (point.level_node !== null));
		previousLeaf = point.value_node;
		pointNodes.add(point.point_node);
		for (const node of [
			point.cache_node,
			point.point_node,
			point.value_node,
			point.level_node
		]) if (node !== null) occupied?.add(node);
		const binding = value.bindings[index];
		require(object$4(binding) && binding.point === index && [
			binding.series_node,
			binding.plot_node,
			binding.role_node
		].every(nullableUint) && roles.has(binding.role));
		for (const node of [
			binding.series_node,
			binding.plot_node,
			binding.role_node
		]) if (node !== null) occupied?.add(node);
		if (binding.series_node === null) require(binding.plot_node === null && binding.role_node === null && binding.role === "unclassified");
		else {
			require(binding.plot_node !== null);
			if (series.has(binding.series_node)) require(series.get(binding.series_node) === binding.plot_node);
			if (binding.role_node === null) require(binding.role === "unclassified");
			else require(binding.role_node > binding.series_node && binding.role_node < point.cache_node);
		}
	}
	try {
		validateChartSeriesText({
			kind: "direct_series",
			values: value.series_text
		});
		validateChartRichText({
			kind: "rich_text",
			values: value.rich_text
		});
	} catch {
		fail$1();
	}
	for (const row of value.series_text) for (const node of [
		row.series_node,
		row.text_node,
		row.value_node
	]) occupied?.add(node);
	for (const row of value.rich_text) for (const node of [
		row.owner_node,
		row.text_node,
		row.rich_node,
		row.paragraph_node,
		row.run_node,
		row.value_node
	]) occupied?.add(node);
	for (const row of value.series_settings) if (row.stroke != null) for (const node of [row.stroke.node, row.stroke.no_fill_node].filter((node) => node !== null)) {
		require(!occupied.has(node));
		occupied.add(node);
	}
	for (const axis of value.axes) if (axis.major_tick_mark != null) {
		require(!occupied.has(axis.major_tick_mark.node));
		occupied.add(axis.major_tick_mark.node);
	}
	if (value.blank_policy !== void 0 && value.blank_policy !== null) {
		require(field(value.blank_policy, oneOf([
			"gap",
			"zero",
			"span"
		]), 0) && !occupied.has(value.blank_policy.node));
		occupied.add(value.blank_policy.node);
	}
	require(validChartView3D(value.view_3d, occupied));
	return value;
}
var plotKinds, pointKinds, roles, fail$1, require;
var init_hwpx_chart_display = __esmMin((() => {
	init_chart_display_fields();
	init_hwpx_chart_series_text();
	init_hwpx_chart_rich_text();
	init_chart_display_host();
	init_chart_series_settings();
	init_chart_point_settings();
	init_chart_stock_settings();
	init_chart_view_3d();
	init_chart_spatial_settings();
	plotKinds = /* @__PURE__ */ new Set([
		"areaChart",
		"area3DChart",
		"lineChart",
		"line3DChart",
		"stockChart",
		"radarChart",
		"scatterChart",
		"pieChart",
		"pie3DChart",
		"doughnutChart",
		"barChart",
		"bar3DChart",
		"ofPieChart",
		"surfaceChart",
		"surface3DChart",
		"bubbleChart"
	]);
	pointKinds = /* @__PURE__ */ new Set([
		"numeric_cache",
		"numeric_literal",
		"string_cache",
		"string_literal",
		"multilevel_cache"
	]);
	roles = /* @__PURE__ */ new Set([
		"name",
		"category",
		"value",
		"x",
		"y",
		"bubble_size",
		"unclassified"
	]);
	fail$1 = () => {
		throw new Error("InvalidChartDisplay");
	};
	require = (condition) => {
		if (!condition) fail$1();
	};
}));
// ../../js/hwpx-chart-api.mjs
/** Optional chart ABI only; shared editor lifetime, validation and memory are injected. */
function createHwpxChartApi({ wasm, memory, ready, uint, encodedText }) {
	function chartPointBytes(text, legacyNumeric = false) {
		const nativeLimit = typeof wasm.hwpx_edit_chart_point_max_bytes === "function";
		if (!nativeLimit && !legacyNumeric) throw new Error("HwpxChartEditAbiUnavailable");
		const maxBytes = nativeLimit ? wasm.hwpx_edit_chart_point_max_bytes() : 1048576;
		if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295) throw new Error("InvalidChartPointLimit");
		const bytes = encodedText(text);
		if (bytes.length > maxBytes) throw new Error("LimitExceeded");
		return bytes;
	}
	return {
		chartPoints(section, wrapper) {
			ready();
			[section, wrapper].forEach(uint);
			if (typeof wasm.hwpx_edit_chart_points !== "function") throw new Error("HwpxChartEditAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_chart_points(section, wrapper)) throw memory.error();
				return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		chartSeriesText(section, wrapper) {
			ready();
			[section, wrapper].forEach(uint);
			if (typeof wasm.hwpx_edit_chart_series_text !== "function") throw new Error("HwpxChartSeriesTextAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_chart_series_text(section, wrapper)) throw memory.error();
				return decodeChartSeriesText(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		chartRichText(section, wrapper) {
			ready();
			[section, wrapper].forEach(uint);
			if (typeof wasm.hwpx_edit_chart_rich_text !== "function") throw new Error("HwpxChartRichTextAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_chart_rich_text(section, wrapper)) throw memory.error();
				return decodeChartRichText(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		chartDisplay(section, wrapper) {
			ready();
			[section, wrapper].forEach(uint);
			if (typeof wasm.hwpx_edit_chart_display !== "function") throw new Error("HwpxChartDisplayAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_chart_display(section, wrapper)) throw memory.error();
				return decodeChartDisplay(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		setChartRichText(section, wrapper, ordinal, text) {
			ready();
			[
				section,
				wrapper,
				ordinal
			].forEach(uint);
			if (typeof wasm.hwpx_edit_set_chart_rich_text !== "function" || typeof wasm.hwpx_edit_chart_rich_text_max_bytes !== "function") throw new Error("HwpxChartRichTextAbiUnavailable");
			const maxBytes = wasm.hwpx_edit_chart_rich_text_max_bytes();
			if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295) throw new Error("InvalidChartRichTextLimit");
			const bytes = encodedText(text);
			if (bytes.length > maxBytes) throw new Error("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_chart_rich_text(section, wrapper, ordinal, ptr, size)) throw memory.error();
			});
		},
		setChartSeriesText(section, wrapper, ordinal, text) {
			ready();
			[
				section,
				wrapper,
				ordinal
			].forEach(uint);
			if (typeof wasm.hwpx_edit_set_chart_series_text !== "function" || typeof wasm.hwpx_edit_chart_series_text_max_bytes !== "function") throw new Error("HwpxChartSeriesTextAbiUnavailable");
			const maxBytes = wasm.hwpx_edit_chart_series_text_max_bytes();
			if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295) throw new Error("InvalidChartSeriesTextLimit");
			const bytes = encodedText(text);
			if (bytes.length > maxBytes) throw new Error("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_chart_series_text(section, wrapper, ordinal, ptr, size)) throw memory.error();
			});
		},
		chartNodes(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_chart_nodes !== "function") throw new Error("HwpxChartEditAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_chart_nodes(section)) throw memory.error();
				return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		chartSites(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_chart_sites !== "function") throw new Error("HwpxChartEditAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_chart_sites(section)) throw memory.error();
				return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		setChartNumericPoint(section, wrapper, point, value) {
			ready();
			[
				section,
				wrapper,
				point
			].forEach(uint);
			if (typeof wasm.hwpx_edit_set_chart_numeric_point !== "function") throw new Error("HwpxChartEditAbiUnavailable");
			const bytes = chartPointBytes(value, true);
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_chart_numeric_point(section, wrapper, point, ptr, size)) throw memory.error();
			});
		},
		setChartPoint(section, wrapper, point, value) {
			ready();
			[
				section,
				wrapper,
				point
			].forEach(uint);
			if (typeof wasm.hwpx_edit_set_chart_point !== "function" || typeof wasm.hwpx_edit_chart_point_max_bytes !== "function") throw new Error("HwpxChartEditAbiUnavailable");
			const bytes = chartPointBytes(value);
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_chart_point(section, wrapper, point, ptr, size)) throw memory.error();
			});
		},
		setChartPoints(section, wrapper, edits) {
			ready();
			[section, wrapper].forEach(uint);
			const bytes = encodeChartPointBatch(edits, readChartPointBatchLimits(wasm), chartPointBytes);
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_chart_points(section, wrapper, ptr, size)) throw memory.error();
			});
		},
		chartPointBatchLimits() {
			ready();
			return readChartPointBatchLimits(wasm);
		}
	};
}
var init_hwpx_chart_api = __esmMin((() => {
	init_chart_point_batch();
	init_hwpx_chart_series_text();
	init_hwpx_chart_rich_text();
	init_hwpx_chart_display();
}));
// ../../js/hwpx-picture-owners.mjs
function decodePictureOwners(bytes) {
	const fail = () => {
		throw new Error("InvalidPictureOwners");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length > 33554432) fail();
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		fail();
	}
	if (!Array.isArray(rows) || rows.length > 1e5) fail();
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const seen = /* @__PURE__ */ new Set();
	return rows.map((row) => {
		if (!row || !uint(row.picture_node) || seen.has(row.picture_node)) fail();
		seen.add(row.picture_node);
		if (row.owner === null) {
			if (typeof row.failure !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,127}$/.test(row.failure)) fail();
			return {
				pictureNode: row.picture_node,
				owner: null,
				error: row.failure
			};
		}
		if (row.failure !== null || !row.owner || !uint(row.owner.paragraph) || row.owner.paragraph === 0 || !uint(row.owner.anchor_node) || !uint(row.owner.anchor_unit)) fail();
		return {
			pictureNode: row.picture_node,
			owner: {
				paragraph: row.owner.paragraph,
				anchorNode: row.owner.anchor_node,
				anchorUnit: row.owner.anchor_unit
			},
			error: null
		};
	});
}
var init_hwpx_picture_owners = __esmMin((() => {}));
// ../../js/hwpx-inline-string-sources.mjs
/** Source-only diagnostic packet; no current layout or editing authorization. */
function decodeInlineStringSources(bytes) {
	const fail = () => {
		throw new Error("InvalidHwpxInlineStringSources");
	};
	let value;
	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
	const string = (s) => typeof s === "string";
	if (!value || value.sourceOnly !== true || !Array.isArray(value.controls) || !Array.isArray(value.texts)) return fail();
	if (value.controls.length > 1e5 || value.texts.length > 2e5) return fail();
	let cursor = 0;
	const seen = /* @__PURE__ */ new Set();
	for (const [index, control] of value.controls.entries()) {
		if (!control || !["indexmark", "dutmal"].includes(control.kind)) return fail();
		for (const key of [
			"section_ordinal",
			"element_index",
			"parent_element_index",
			"first_text",
			"text_count",
			"direct_children",
			"unknown_children",
			"other_attributes"
		]) if (!uint(control[key])) return fail();
		for (const key of [
			"parent_uri",
			"parent_local_name",
			"raw_xml",
			"direct_text"
		]) if (!string(control[key])) return fail();
		if (control.parent_element_index >= control.element_index || control.first_text !== cursor || control.text_count > value.texts.length - cursor || control.direct_children !== control.text_count + control.unknown_children) return fail();
		const identity = `${control.section_ordinal}:${control.element_index}`;
		if (seen.has(identity)) return fail();
		seen.add(identity);
		if (!control.attributes || typeof control.attributes !== "object" || Array.isArray(control.attributes)) return fail();
		for (const key of [
			"pos_type",
			"sz_ratio",
			"option",
			"style_id_ref",
			"alignment"
		]) if (control.attributes[key] !== null && !string(control.attributes[key])) return fail();
		const kinds = control.kind === "dutmal" ? ["main_text", "sub_text"] : ["first_key", "second_key"];
		for (const text of value.texts.slice(cursor, cursor + control.text_count)) {
			if (!text || text.control_index !== index || !kinds.includes(text.kind)) return fail();
			for (const key of [
				"element_index",
				"direct_children",
				"other_attributes"
			]) if (!uint(text[key])) return fail();
			if (!string(text.raw_xml) || !string(text.value) || text.element_index <= control.element_index) return fail();
			const textIdentity = `${control.section_ordinal}:${text.element_index}`;
			if (seen.has(textIdentity)) return fail();
			seen.add(textIdentity);
		}
		cursor += control.text_count;
	}
	if (cursor !== value.texts.length) return fail();
	return value;
}
var init_hwpx_inline_string_sources = __esmMin((() => {}));
// ../../js/hwpx-dutmal-kind.mjs
function dutmalKind(value) {
	if (value === "mainText") return 0;
	if (value === "subText") return 1;
	throw new RangeError("InvalidDutmalTextKind");
}
var init_hwpx_dutmal_kind = __esmMin((() => {}));
// ../../js/hwpx-dutmal-sites.mjs
function decodeDutmalSites(bytes) {
	const fail = () => {
		throw new Error("InvalidHwpxDutmalSites");
	};
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!Array.isArray(rows) || rows.length > 1e5) return fail();
	const nodes = /* @__PURE__ */ new Set();
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	for (const row of rows) {
		if (!row || !uint(row.node) || !uint(row.paragraph) || row.paragraph === 0 || !uint(row.anchor_unit) || nodes.has(row.node)) return fail();
		nodes.add(row.node);
	}
	return rows;
}
var init_hwpx_dutmal_sites = __esmMin((() => {}));
// ../../js/hwpx-equation-sources.mjs
function decodeEquationSources(bytes) {
	const fail = () => {
		throw new Error("InvalidHwpxEquationSources");
	};
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	return validateEquationSources(rows);
}
function validateEquationSources(rows) {
	const fail = () => {
		throw new Error("InvalidHwpxEquationSources");
	};
	if (!Array.isArray(rows) || rows.length > 1e5) return fail();
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const seen = /* @__PURE__ */ new Set();
	const issues = /* @__PURE__ */ new Set([
		null,
		"inactive",
		"inline_text_descendant",
		"unsupported_encoding",
		"missing_script",
		"multiple_scripts",
		"nested_script"
	]);
	let previous = -1;
	for (const row of rows) {
		if (!row || !uint(row.node) || row.node <= previous || typeof row.active !== "boolean" || !uint(row.script_count) || !issues.has(row.issue)) return fail();
		if (row.script_count === 0 ? row.script_node !== null : !uint(row.script_node) || row.script_node <= row.node) return fail();
		if (row.issue === null && (!row.active || row.script_count !== 1)) return fail();
		if (!row.active && !["inactive", "inline_text_descendant"].includes(row.issue)) return fail();
		if (row.issue === "inactive" && row.active || row.issue === "missing_script" && row.script_count !== 0 || row.issue === "multiple_scripts" && row.script_count < 2 || row.issue === "nested_script" && row.script_count !== 1) return fail();
		for (const node of [row.node, row.script_node]) if (node !== null) {
			if (seen.has(node)) return fail();
			seen.add(node);
		}
		previous = row.node;
	}
	return rows;
}
var init_hwpx_equation_sources = __esmMin((() => {}));
// ../../js/hwpx-equation-scripts.mjs
function decodeEquationScripts(bytes) {
	const fail = () => {
		throw new Error("InvalidHwpxEquationScripts");
	};
	let value;
	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!value || !Array.isArray(value.rows) || !Number.isInteger(value.script_bytes) || value.script_bytes < 0 || value.script_bytes > 4294967295) return fail();
	try {
		validateEquationSources(value.rows.map((row) => row?.source));
	} catch {
		return fail();
	}
	let total = 0;
	const encode = new TextEncoder();
	for (const row of value.rows) {
		if (row.source.issue !== null) {
			if (row.value !== null) return fail();
			continue;
		}
		if (typeof row.value !== "string" || !row.value.isWellFormed()) return fail();
		const count = encode.encode(row.value).length;
		if (count > 4294967295 - total) return fail();
		total += count;
	}
	if (total !== value.script_bytes) return fail();
	return value;
}
var init_hwpx_equation_scripts = __esmMin((() => {
	init_hwpx_equation_sources();
}));
// ../../js/hwpx-equation-sites.mjs
function decodeEquationSites(bytes) {
	const fail = () => {
		throw new Error("InvalidHwpxEquationSites");
	};
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
		if (!Array.isArray(rows)) return fail();
		validateEquationSources(rows.map((row) => row?.source));
	} catch {
		return fail();
	}
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const paragraph = (value) => uint(value) && value > 0;
	for (const row of rows) if (row.source.issue !== null) {
		if (row.paragraph !== null || row.anchor_unit !== null || row.error_name !== null) return fail();
	} else if (row.error_name === null) {
		if (!paragraph(row.paragraph) || !uint(row.anchor_unit)) return fail();
	} else if (typeof row.error_name !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(row.error_name) || row.anchor_unit !== null || row.paragraph !== null && !paragraph(row.paragraph)) return fail();
	return rows;
}
var init_hwpx_equation_sites = __esmMin((() => {
	init_hwpx_equation_sources();
}));
// ../../js/hwpx-field-target-wire.mjs
function validateFieldTargets(targets) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(targets) || targets.length > 4096 || Array.from(targets).some((target) => !target || ![
		target.beginElement,
		target.start,
		target.end
	].every(uint) || target.end < target.start)) throw new Error("InvalidFieldTargets");
	return targets;
}
function decodeFieldTargets(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length < 4) throw new Error("InvalidFieldTargets");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const count = view.getUint32(0, true);
	if (count > 4096 || bytes.length !== 4 + count * 12) throw new Error("InvalidFieldTargets");
	return validateFieldTargets(Array.from({ length: count }, (_, index) => {
		const offset = 4 + index * 12;
		const target = {
			beginElement: view.getUint32(offset, true),
			start: view.getUint32(offset + 4, true),
			end: view.getUint32(offset + 8, true)
		};
		if (target.end < target.start) throw new Error("InvalidFieldTargets");
		return target;
	}));
}
var init_hwpx_field_target_wire = __esmMin((() => {}));
// ../../js/formula-result-paragraphs.mjs
function decodeFormulaResultParagraphs(bytes) {
	const values = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!Array.isArray(values)) throw new Error("InvalidFormulaResultParagraphs");
	let previous = 0;
	for (const value of values) {
		if (!Number.isInteger(value) || value <= previous || value > 4294967295) throw new Error("InvalidFormulaResultParagraphs");
		previous = value;
	}
	return values;
}
var init_formula_result_paragraphs = __esmMin((() => {}));
// ../../js/formula-result-display-snapshot.mjs
function decodeFormulaResultDisplaySnapshot(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const invalid = () => {
		throw new Error("InvalidFormulaResultDisplaySnapshot");
	};
	if (!Array.isArray(rows) || rows.length > 1e5) invalid();
	let previous = 0;
	return rows.map((row) => {
		if (!row || !Number.isInteger(row.paragraph) || row.paragraph <= previous || row.paragraph > 4294967295 || typeof row.text !== "string" || !Array.isArray(row.targets) || !row.targets.length) invalid();
		previous = row.paragraph;
		const targets = validateFieldTargets(row.targets.map((target) => ({
			beginElement: target?.begin_element,
			start: target?.start,
			end: target?.end
		})));
		if (targets.some((target) => target.end > row.text.length)) invalid();
		return {
			paragraph: row.paragraph,
			text: row.text,
			targets
		};
	});
}
var init_formula_result_display_snapshot = __esmMin((() => {
	init_hwpx_field_target_wire();
}));
// ../../js/hwpx-page-area-declarations.mjs
function decodePageAreaDeclarations(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const invalid = () => {
		throw Error("InvalidPageAreaDeclarations");
	};
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows) || rows.length > 1e5) invalid();
	const owners = /* @__PURE__ */ new Set();
	let previousParagraph = 0;
	return rows.map((row) => {
		if (!row || ![
			row.paragraph,
			row.source_element,
			row.source_control,
			row.unit
		].every(uint) || row.paragraph < 1 || row.paragraph < previousParagraph || row.source_control >= row.source_element || !["left", "right"].includes(row.affinity) || owners.has(row.source_element)) invalid();
		owners.add(row.source_element);
		previousParagraph = row.paragraph;
		return {
			paragraph: row.paragraph,
			sourceElement: row.source_element,
			sourceControl: row.source_control,
			unit: row.unit,
			affinity: row.affinity
		};
	});
}
var init_hwpx_page_area_declarations = __esmMin((() => {}));
// ../../js/hwpx-form-source.mjs
function decode(bytes, maximum) {
	if (!(bytes instanceof Uint8Array) || bytes.length > maximum) throw new Error("InvalidFormSource");
	try {
		return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		throw new Error("InvalidFormSource");
	}
}
function decodeFormSourceNodes(bytes) {
	const value = decode(bytes, 8388608);
	if (!object$3(value) || value.sourceOnly !== true || !Array.isArray(value.nodes) || value.nodes.length > 1e5 || !value.nodes.every((row, i) => object$3(row) && uint$10(row.formNode) && kinds.has(row.kind) && (i === 0 || row.formNode > value.nodes[i - 1].formNode))) throw new Error("InvalidFormSource");
	return value;
}
function decodeFormSourceAttributes(bytes) {
	const value = decode(bytes, 1048576);
	const group = (data, check) => object$3(data) && Object.keys(data).length <= 128 && Object.entries(data).every(([key, item]) => /^[A-Za-z][A-Za-z0-9]*$/.test(key) && key.length <= 128 && (item === null || check(item)));
	if (!object$3(value) || value.sourceOnly !== true || !kinds.has(value.kind) || !group(value.strings, (item) => typeof item === "string" && item.isWellFormed() && new TextEncoder().encode(item).length <= 65536) || !group(value.booleans, (item) => typeof item === "boolean") || !group(value.integers, uint$10)) throw new Error("InvalidFormSource");
	return value;
}
function decodeFormSites(bytes) {
	const sites = decode(bytes, 16777216);
	if (!Array.isArray(sites) || sites.length > 1e5 || !sites.every((site, i) => {
		if (!object$3(site) || !uint$10(site.formNode) || !kinds.has(site.kind) || i > 0 && site.formNode <= sites[i - 1].formNode) return false;
		if (site.state === "located") return uint$10(site.paragraph) && site.paragraph > 0 && uint$10(site.anchorUnit);
		if (site.state === "unsupported_anchor") return uint$10(site.paragraph) && site.paragraph > 0 && site.anchorUnit === null;
		return [
			"conditional",
			"missing_host",
			"ambiguous_host"
		].includes(site.state) && site.paragraph === null && site.anchorUnit === null;
	})) throw new Error("InvalidFormSource");
	return sites;
}
function decodeFormSourceLayout(bytes) {
	const value = decode(bytes, 65536);
	const bool = (value) => value === null || typeof value === "boolean";
	if (!object$3(value) || value.sourceOnly !== true || !uint$10(value.formNode) || !kinds.has(value.kind) || !validShapeLayoutValues(value) || !object$3(value.character) || !(value.character.id === null || uint$10(value.character.id)) || ![
		value.character.follow_context,
		value.character.auto_size,
		value.character.word_wrap,
		value.sizeProtected
	].every(bool)) throw new Error("InvalidFormSource");
	return value;
}
var kinds, uint$10, object$3;
var init_hwpx_form_source = __esmMin((() => {
	init_hwpx_shape_layout_values();
	kinds = /* @__PURE__ */ new Set([
		"button",
		"check_button",
		"combo_box",
		"radio_button",
		"edit_box"
	]);
	uint$10 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	object$3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
}));
// ../../js/hwpx-document-provenance.mjs
/** Validate Native's profile DTO; never classify a producer or reinterpret its encoding in JS. */
function isSourceColorProfile(value) {
	return exact(value, [
		"id",
		"encoding",
		"verified"
	]) && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 256 && ["rgb24", "colorref24"].includes(value.encoding) && typeof value.verified === "boolean";
}
function decodeDocumentProvenance(bytes) {
	const fail = () => {
		throw Error("InvalidDocumentProvenance");
	};
	if (!(bytes instanceof Uint8Array) || bytes.byteLength > 1048576) return fail();
	let value;
	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!exact(value, [
		"sourceOnly",
		"sourceVersion",
		"sourceVersionError",
		"sourceColorProfile"
	]) || value.sourceOnly !== true || !isSourceColorProfile(value.sourceColorProfile)) return fail();
	const version = value.sourceVersion;
	if (version !== null) {
		if (!exact(version, [
			"major",
			"minor",
			"micro",
			"build_number",
			"patch",
			"revision",
			"os",
			"xml_version",
			"target_application",
			"application",
			"app_version",
			"xml_bytes"
		]) || ![
			version.major,
			version.minor,
			version.xml_bytes
		].every(uint$9) || ![
			"micro",
			"build_number",
			"patch",
			"revision",
			"os"
		].every((key) => version[key] === null || uint$9(version[key])) || ![
			"xml_version",
			"target_application",
			"application",
			"app_version"
		].every((key) => version[key] === null || text(version[key]))) return fail();
	}
	if (value.sourceVersionError !== null && (version !== null || typeof value.sourceVersionError !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value.sourceVersionError))) return fail();
	return value;
}
var object$2, exact, uint$9, text;
var init_hwpx_document_provenance = __esmMin((() => {
	object$2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	exact = (value, keys) => object$2(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
	uint$9 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	text = (value) => typeof value === "string" && value.length <= 4096;
}));
// ../../js/hwpx-font-face-metadata.mjs
function decodeHwpxFontFaceMetadata(bytes) {
	const fail = () => {
		throw new Error("InvalidHwpxFontFaceMetadata");
	};
	const font = (row) => metadataKeys(row, [
		"face",
		"type",
		"isEmbedded",
		"binaryItemIDRef"
	]) && Object.values(row).every(metadataText);
	const rows = decodeMetadataWire(bytes, "InvalidHwpxFontFaceMetadata");
	for (const row of rows) {
		if (!metadataKeys(row, [
			"format",
			"language",
			"id",
			"font",
			"substitute",
			"typeInfo"
		]) || row.format !== "hwpx" || !font(row.font) || row.substitute !== null && !font(row.substitute)) return fail();
		if (row.typeInfo !== null && (!metadataKeys(row.typeInfo, [
			"familyType",
			"weight",
			"proportion",
			"contrast",
			"strokeVariation",
			"armStyle",
			"letterform",
			"midline",
			"xHeight"
		]) || !Object.values(row.typeInfo).every(metadataText))) return fail();
	}
	return rows;
}
var init_hwpx_font_face_metadata = __esmMin((() => {
	init_font_metadata_wire();
}));
// ../../js/hwpx-paragraph-shapes.mjs
function decodeHwpxParagraphShapes(bytes) {
	const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const invalid = () => {
		throw new Error("InvalidParagraphShapes");
	};
	const text = (value) => value === null || typeof value === "string";
	const measure = (value) => value === null || value && typeof value === "object" && !Array.isArray(value) && (value.value === null || Number.isInteger(value.value) && value.value >= -2147483648 && value.value <= 4294967295) && text(value.unit);
	const breaks = (value) => value === null || value && typeof value === "object" && !Array.isArray(value) && [
		"widow_orphan",
		"keep_with_next",
		"keep_lines",
		"page_break_before"
	].every((key) => value[key] === null || typeof value[key] === "boolean");
	if (!Array.isArray(result)) invalid();
	const ids = /* @__PURE__ */ new Set();
	for (const row of result) {
		if (!row || typeof row !== "object" || !Number.isInteger(row.id) || row.id < 0 || row.id > 4294967295 || ids.has(row.id) || Object.hasOwn(row, "tab_pr_id") && row.tab_pr_id !== null && (!Number.isInteger(row.tab_pr_id) || row.tab_pr_id < 0 || row.tab_pr_id > 4294967295) || Object.hasOwn(row, "break_settings") && !breaks(row.break_settings) || !text(row.horizontal) || !text(row.spacing_type) || !measure(row.spacing) || !Array.isArray(row.margins) || row.margins.length !== 5 || !row.margins.every(measure)) invalid();
		ids.add(row.id);
	}
	return result;
}
var init_hwpx_paragraph_shapes = __esmMin((() => {}));
// ../../js/hwpx-drawing-text-bindings.mjs
function decodeDrawingTextBindings(bytes) {
	const fail = () => {
		throw new Error("InvalidDrawingTextBindings");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length > 16e6) return fail();
	let rows;
	try {
		rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	if (!Array.isArray(rows) || rows.length > 1e5) return fail();
	const seen = /* @__PURE__ */ new Set(), owners = /* @__PURE__ */ new Map(), integer = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 4294967295;
	return rows.map((row) => {
		if (!row || !integer(row.paragraph) || row.paragraph === 0 || seen.has(row.paragraph) || !row.owner) return fail();
		const owner = row.owner;
		if (Object.hasOwn(owner, "kind") && !["text", "caption"].includes(owner.kind)) return fail();
		if (![
			owner.drawing_node,
			owner.text_node,
			owner.list_node
		].every(integer) || !(owner.drawing_node < owner.text_node && owner.text_node < owner.list_node)) return fail();
		const key = `${owner.drawing_node}:${owner.text_node}:${owner.kind ?? "text"}`;
		if (owners.has(owner.list_node) && owners.get(owner.list_node) !== key) return fail();
		owners.set(owner.list_node, key);
		seen.add(row.paragraph);
		return {
			paragraph: row.paragraph,
			drawingNode: owner.drawing_node,
			textNode: owner.text_node,
			listNode: owner.list_node,
			...Object.hasOwn(owner, "kind") ? { kind: owner.kind } : {}
		};
	});
}
var init_hwpx_drawing_text_bindings = __esmMin((() => {}));
// ../../js/hwpx-drawing-text-snapshots.mjs
function decodeDrawingTextSnapshots(bytes) {
	if (!(bytes instanceof Uint8Array)) throw new Error("InvalidDrawingTextSnapshots");
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!Array.isArray(rows) || rows.length > 1e5) throw new Error("InvalidDrawingTextSnapshots");
	const encoder = new TextEncoder();
	return rows.map((row, index) => {
		const value = decodeDrawingTextSnapshot(encoder.encode(JSON.stringify(row)));
		if (index && value.drawing_node <= rows[index - 1].drawing_node) throw new Error("InvalidDrawingTextSnapshots");
		return value;
	});
}
var init_hwpx_drawing_text_snapshots = __esmMin((() => {
	init_hwpx_drawing_text_snapshot();
}));
// ../../js/hwpx-container-source.mjs
function decodeContainerSource(bytes) {
	const fail = () => {
		throw new Error("InvalidContainerSource");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length > 1048576) return fail();
	let v;
	try {
		v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
	const optional = (n, check) => n === null || check(n);
	const signed = (n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295;
	const bool = (n) => n === null || typeof n === "boolean";
	const array = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
	if (!v || !uint(v.container_node)) return fail();
	if (Object.hasOwn(v, "has_caption") || Object.hasOwn(v, "caption")) {
		if (typeof v.has_caption !== "boolean" || v.has_caption !== (v.caption !== null)) return fail();
		try {
			validateTableCaption(v.caption);
		} catch {
			return fail();
		}
	}
	if (!Array.isArray(v.children) || !v.children.every((c, i) => c && uint(c.node) && c.node > v.container_node && (i === 0 || c.node > v.children[i - 1].node) && typeof c.namespace_uri === "string" && typeof c.local_name === "string" && c.local_name.length > 0)) return fail();
	if (v.has_caption === true && !v.children.some((c) => c.node === v.caption.caption_node && c.namespace_uri === "http://www.hancom.co.kr/hwpml/2011/paragraph" && c.local_name === "caption")) return fail();
	if (!validGroupContext(v.group_context, v.container_node)) return fail();
	const g = v.geometry, p = v.position, f = v.flow, t = v.transform;
	if (!g || !p || !f || !t) return fail();
	if (!validShapeLayoutValues(v)) return fail();
	if (!array(t.flip, 2, bool) || !optional(t.angle, uint) || !array(t.center, 2, (n) => optional(n, signed)) || !bool(t.rotate_image) || !bool(t.reverse) || !uint(t.unknown_matrix_nodes) || !Array.isArray(t.matrices) || t.matrices.length > 1024) return fail();
	if (!t.matrices.every((m) => m && [
		"translation",
		"scale",
		"rotation"
	].includes(m.kind) && array(m.values, 6, (n) => optional(n, (n) => typeof n === "number" && Number.isFinite(n))))) return fail();
	return v;
}
var init_hwpx_container_source = __esmMin((() => {
	init_hwpx_shape_layout_values();
	init_hwpx_group_context();
	init_hwpx_table_caption();
}));
// ../../js/hwpx-rectangle-rendering-source.mjs
function decodeRectangleRenderingSource(bytes) {
	const fail = () => {
		throw new Error("InvalidRectangleRenderingSource");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length > 65536) return fail();
	let value;
	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return fail();
	}
	const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 4294967295;
	const signed = (n) => Number.isSafeInteger(n) && n >= -2147483648 && n <= 4294967295;
	const optional = (n, check) => n === null || check(n);
	const bool = (n) => n === null || typeof n === "boolean";
	const array = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
	if (!value || !uint(value.rectangle_node) || !value.source) return fail();
	if (!value.owner || ![
		value.owner.paragraph,
		value.owner.anchor_unit,
		value.owner.anchor_node
	].every(uint) || value.owner.paragraph === 0 || value.owner.anchor_node > value.rectangle_node) return fail();
	const s = value.source, r = s.rendering, p = s.rectangle;
	if (!validShapeLayoutValues(s)) return fail();
	if (!validShapePaintValues(s)) return fail();
	if (!bool(s.transform_identity) || !r || !p || !array(r.flip, 2, bool) || !optional(r.angle, uint) || !bool(r.reverse) || !array(r.center, 2, (n) => optional(n, signed)) || !bool(r.rotate_image)) return fail();
	if (r.matrix === null) {
		if (![
			"UnsupportedPictureMatrixSequence",
			"IncompletePictureMatrix",
			"NonFinitePictureMatrix"
		].includes(r.matrix_error)) return fail();
	} else if (!array(r.matrix, 6, Number.isFinite) || r.matrix_error !== null) return fail();
	if (typeof p.present !== "boolean" || !uint(p.unknown_children) || !array(p.point_present, 4, (n) => typeof n === "boolean") || !array(p.points, 4, (point) => array(point, 2, (n) => optional(n, signed)))) return fail();
	if (p.points.some((point, i) => !p.point_present[i] && point.some((n) => n !== null)) || !p.present && p.point_present.some(Boolean)) return fail();
	if (s.rendering_corners !== null && (!array(s.rendering_corners, 4, (point) => array(point, 2, Number.isFinite)) || r.matrix === null)) return fail();
	return value;
}
var init_hwpx_rectangle_rendering_source = __esmMin((() => {
	init_hwpx_shape_layout_values();
	init_hwpx_shape_paint_values();
}));
// ../../js/hwpx-rectangle-rendering-sources.mjs
function decodeRectangleRenderingSources(bytes) {
	if (!(bytes instanceof Uint8Array)) throw new Error("InvalidRectangleRenderingSources");
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!Array.isArray(rows) || rows.length > 1e5) throw new Error("InvalidRectangleRenderingSources");
	const encoder = new TextEncoder();
	return rows.map((row, index) => {
		const value = decodeRectangleRenderingSource(encoder.encode(JSON.stringify(row)));
		if (index && value.rectangle_node <= rows[index - 1].rectangle_node) throw new Error("InvalidRectangleRenderingSources");
		return value;
	});
}
var init_hwpx_rectangle_rendering_sources = __esmMin((() => {
	init_hwpx_rectangle_rendering_source();
}));
// ../../js/hwpx-ellipse-sources.mjs
function decodeEllipseSources(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const text = (value) => value === null || typeof value === "string" && new TextEncoder().encode(value).length <= 4096;
	if (!Array.isArray(rows) || rows.length > 1e5 || rows.some((row, index) => {
		const owner = row?.owner, geometry = row?.geometry;
		return !object$1(row) || row.sourceOnly !== true || !uint$8(row.node) || index > 0 && row.node <= rows[index - 1].node || Object.hasOwn(row, "common") && !validShapeCommonSource(row.common) || row.common && Object.hasOwn(row.common, "group_context") && !validGroupContext(row.common.group_context, row.node) || row.common?.group_context && row.common.group_context.root_anchor !== owner?.anchor_node || !object$1(owner) || ![
			"paragraph",
			"anchor_node",
			"anchor_unit"
		].every((key) => uint$8(owner[key])) || owner.paragraph < 1 || !object$1(geometry) || ![
			"interval_dirty",
			"has_arc_properties",
			"arc_type"
		].every((key) => text(geometry[key])) || !Array.isArray(geometry.points) || geometry.points.length !== 7 || !Array.from(geometry.points).every((point) => point === null || object$1(point) && coordinate(point.x) && coordinate(point.y));
	})) throw new Error("InvalidEllipseSources");
	return rows;
}
var object$1, uint$8, coordinate;
var init_hwpx_ellipse_sources = __esmMin((() => {
	init_hwpx_shape_common_source();
	init_hwpx_group_context();
	object$1 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	uint$8 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	coordinate = (value) => value === null || Number.isInteger(value) && value >= -2147483648 && value <= 4294967295;
}));
// ../../js/hwpx-picture-sites-wire.mjs
function decodePictureSites(bytes) {
	const fail = () => {
		throw new Error("InvalidPictureSites");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length < 8) fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== 827871304) fail();
	const count = view.getUint32(4, true);
	if (count > 1e5 || bytes.length !== 8 + count * 16) fail();
	const result = [], seen = /* @__PURE__ */ new Set();
	for (let index = 0; index < count; index++) {
		const at = 8 + index * 16;
		const pictureNode = view.getUint32(at, true), paragraphValue = view.getUint32(at + 4, true);
		const unitValue = view.getUint32(at + 8, true), flags = view.getUint32(at + 12, true);
		const stateIndex = flags & 255, hasParagraph = Boolean(flags & 256), hasUnit = Boolean(flags & 512);
		if (flags & -776 || stateIndex > 4 || seen.has(pictureNode)) fail();
		if (hasParagraph && paragraphValue === 0) fail();
		if (!hasParagraph && paragraphValue !== 0 || !hasUnit && unitValue !== 0) fail();
		if (stateIndex === 0 !== hasUnit || hasUnit && !hasParagraph) fail();
		if (stateIndex === 2 !== (hasParagraph && !hasUnit)) fail();
		seen.add(pictureNode);
		result.push({
			pictureNode,
			paragraph: hasParagraph ? paragraphValue : null,
			anchorUnit: hasUnit ? unitValue : null,
			state: states[stateIndex]
		});
	}
	return result;
}
var states;
var init_hwpx_picture_sites_wire = __esmMin((() => {
	states = [
		"located",
		"conditional",
		"unsupported_anchor",
		"missing_host",
		"ambiguous_host"
	];
}));
// ../../js/hwpx-ole-source.mjs
function parse$2(bytes, maxBytes, message) {
	if (!(bytes instanceof Uint8Array) || bytes.length > maxBytes) throw new Error(message);
	try {
		return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		throw new Error(message);
	}
}
function decodeOleSites(bytes) {
	const fail = () => {
		throw new Error("InvalidOleSites");
	};
	const value = parse$2(bytes, 16777216, "InvalidOleSites"), seen = /* @__PURE__ */ new Set();
	if (!Array.isArray(value) || value.length > 1e5) fail();
	for (const row of value) {
		if (!row || !uint$7(row.ole_node) || seen.has(row.ole_node) || !(row.paragraph === null || uint$7(row.paragraph) && row.paragraph > 0) || !(row.anchor_unit === null || uint$7(row.anchor_unit))) fail();
		if (Object.hasOwn(row, "chart_wrapper") && row.chart_wrapper !== null && !uint$7(row.chart_wrapper)) fail();
		if (row.error_name === null ? row.paragraph === null || row.anchor_unit === null : !errors.has(row.error_name) || row.anchor_unit !== null) fail();
		seen.add(row.ole_node);
	}
	return value;
}
function decodeOleSource(bytes) {
	const fail = () => {
		throw new Error("InvalidOleSource");
	};
	const value = parse$2(bytes, 65536, "InvalidOleSource");
	if (!value || !Object.hasOwn(value, "position") || !Object.hasOwn(value, "flow")) fail();
	try {
		validateShapeSourceValues(value);
	} catch {
		fail();
	}
	for (const name of [
		"binary_item_id",
		"object_type",
		"draw_aspect"
	]) {
		const text = value[name];
		if (text !== null && (typeof text !== "string" || !text.isWellFormed() || new TextEncoder().encode(text).length > 4096)) fail();
	}
	if (![
		null,
		false,
		true
	].includes(value.has_moniker)) fail();
	if (Object.hasOwn(value, "transform_identity") && ![
		null,
		false,
		true
	].includes(value.transform_identity)) fail();
	return value;
}
function decodeOleBytes(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > 67108865 || bytes[0] > 1) throw new Error("InvalidOleBytes");
	return {
		declaredExternal: bytes[0] === 1,
		bytes: bytes.slice(1)
	};
}
var uint$7, errors;
var init_hwpx_ole_source = __esmMin((() => {
	init_hwpx_shape_source_values();
	uint$7 = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
	errors = /* @__PURE__ */ new Set([
		"UnsupportedOleDisplayHost",
		"MissingCurrentParagraphDisplayHost",
		"AmbiguousParagraphDisplayHost",
		"MissingProtectedDisplayAnchor",
		"UnsupportedJoinedParagraphLocations",
		"UnsupportedInlineControl",
		"UnsupportedTextPositionProjection",
		"MissingTextSite"
	]);
}));
// ../../js/hwpx-picture-owner-wire.mjs
function decodePictureOwner(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length !== 16) throw new Error("InvalidPictureOwner");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== 827281480 || view.getUint32(4, true) === 0) throw new Error("InvalidPictureOwner");
	return {
		paragraph: view.getUint32(4, true),
		anchorNode: view.getUint32(8, true),
		anchorUnit: view.getUint32(12, true)
	};
}
var init_hwpx_picture_owner_wire = __esmMin((() => {}));
// ../../js/hwpx-picture-corners-wire.mjs
function decodePictureRenderingCorners(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.length !== 72) throw new Error("InvalidPictureRenderingCorners");
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== 827019336 || view.getUint32(4, true) !== 0) throw new Error("InvalidPictureRenderingCorners");
	return Array.from({ length: 4 }, (_, index) => Array.from({ length: 2 }, (_, coordinate) => {
		const number = view.getFloat64(8 + (index * 2 + coordinate) * 8, true);
		if (!Number.isFinite(number)) throw new Error("InvalidPictureRenderingCorners");
		return number;
	}));
}
var init_hwpx_picture_corners_wire = __esmMin((() => {}));
// ../../js/hwpx-connector-source.mjs
function decodeConnectorNodes(bytes) {
	const nodes = parse$1(bytes);
	if (!Array.isArray(nodes) || !nodes.every((value, index) => uint$6(value) && (index === 0 || value > nodes[index - 1]))) throw new Error("InvalidConnectorNodes");
	return nodes;
}
function decodeConnectorSource(bytes) {
	const value = parse$1(bytes), geometry = value?.geometry;
	const point = (item) => item === null || object(item) && [
		"x",
		"y",
		"subject_id_ref",
		"subject_index",
		"control_type"
	].every((name) => item[name] === null || typeof item[name] === "string");
	if (!object(value) || value.sourceOnly !== true || !uint$6(value.node) || !object(geometry) || !(geometry.raw_type === null || typeof geometry.raw_type === "string") || typeof geometry.known_type !== "boolean" || !point(geometry.start) || !point(geometry.end) || typeof geometry.controls_present !== "boolean" || !Array.isArray(geometry.controls) || geometry.controls.length > 4096 || !geometry.controls.every((item) => item !== null && point(item)) || !geometry.controls_present && geometry.controls.length !== 0 || !uint$6(geometry.unexpected_children)) throw new Error("InvalidConnectorSource");
	return value;
}
function decodeConnectorOwner(bytes, expectedNode) {
	const value = parse$1(bytes);
	if (!object(value) || value.current !== true || value.sourceOnly === true || ![
		"node",
		"paragraph",
		"anchor_node",
		"anchor_unit"
	].every((name) => uint$6(value[name])) || value.paragraph < 1 || expectedNode !== void 0 && value.node !== expectedNode) throw new Error("InvalidConnectorOwner");
	return value;
}
function decodeConnectorRenderingSource(bytes, expectedNode) {
	const value = parse$1(bytes);
	const point = (row) => Array.isArray(row) && row.length === 2 && row.every(Number.isFinite);
	if (!object(value) || value.sourceOnly !== true || value.coordinateSpace !== "renderingInfo" || !uint$6(value.node) || expectedNode !== void 0 && value.node !== expectedNode || !Array.isArray(value.endpoints) || value.endpoints.length !== 2 || !value.endpoints.every(point) || !Array.isArray(value.controls) || value.controls.length > 4096 || !value.controls.every(point)) throw new Error("InvalidConnectorRenderingSource");
	return value;
}
var uint$6, object, parse$1;
var init_hwpx_connector_source = __esmMin((() => {
	uint$6 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	parse$1 = (bytes) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}));
// ../../js/hwpx-drawing-stroke-source.mjs
function decodeDrawingStrokeSource(bytes, expectedNode) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const attr = value?.attributes;
	if (!value || value.sourceOnly !== true || !uint$5(value.node) || value.node !== expectedNode || !(value.lineShapeNode === null || uint$5(value.lineShapeNode)) || !(value.knownColor === null || typeof value.knownColor === "boolean") || !uint$5(value.unknownEnums) || value.unknownEnums > 8 || !attr || typeof attr !== "object" || Array.isArray(attr) || !fields$1.every((name) => attr[name] === null || typeof attr[name] === "string" && new TextEncoder().encode(attr[name]).length <= 4096)) throw new Error("InvalidDrawingStrokeSource");
	return value;
}
var fields$1, uint$5;
var init_hwpx_drawing_stroke_source = __esmMin((() => {
	fields$1 = [
		"color",
		"width",
		"style",
		"endCap",
		"headStyle",
		"tailStyle",
		"headfill",
		"tailfill",
		"headSz",
		"tailSz",
		"outlineStyle",
		"alpha"
	];
	uint$5 = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
}));
// ../../js/hwpx-page-settings.mjs
/** Source observations, not a page layout or default-value resolver. */
function validateColumn(column) {
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!column || !uint(column.declaration_node) || !uint(column.owner_node) || ![column.count, column.gap].every((value) => value === null || uint(value)) || ![
		null,
		true,
		false
	].includes(column.same_size) || ![
		null,
		"left",
		"right",
		"mirror"
	].includes(column.direction) || ![
		null,
		"newspaper",
		"balanced_newspaper",
		"parallel"
	].includes(column.kind) || typeof column.ambiguous !== "boolean") throw new Error("InvalidParagraphFlow");
	if (column.sizes !== void 0 && (!Array.isArray(column.sizes) || column.sizes.some((size) => !size || ![size.width, size.gap].every((value) => value === null || uint(value))))) throw new Error("InvalidParagraphFlow");
}
function decodeParagraphFlow(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!Array.isArray(rows)) throw new Error("InvalidParagraphFlow");
	for (const row of rows) {
		if (!row) throw new Error("InvalidParagraphFlow");
		if (row.empty_line_eligible !== void 0 && typeof row.empty_line_eligible !== "boolean") throw new Error("InvalidParagraphFlow");
		if (row.note_context !== void 0 && row.note_context !== null) {
			const note = row.note_context;
			if (![note.note_node, note.list_node].every((value) => Number.isInteger(value) && value >= 0 && value <= 4294967295) || !["footnote", "endnote"].includes(note.kind) || row.host !== note.kind || row.top_level !== false) throw new Error("InvalidParagraphFlow");
		}
		if (row.single_column !== void 0 && typeof row.single_column !== "boolean") throw new Error("InvalidParagraphFlow");
		if (row.host !== void 0 && ![
			"body",
			"header",
			"footer",
			"footnote",
			"endnote",
			"drawing",
			"other"
		].includes(row.host)) throw new Error("InvalidParagraphFlow");
		if (row.column_declaration !== void 0 && row.column_declaration !== null) validateColumn(row.column_declaration);
		if (row.column_start_declaration !== void 0 && row.column_start_declaration !== null) validateColumn(row.column_start_declaration);
		if (row.column_changes !== void 0) {
			if (!Array.isArray(row.column_changes)) throw new Error("InvalidParagraphFlow");
			let previous = 0;
			for (const change of row.column_changes) {
				if (!change || !Number.isInteger(change.unit) || change.unit < previous || change.unit > 4294967295) throw new Error("InvalidParagraphFlow");
				validateColumn(change.declaration);
				previous = change.unit;
			}
		}
		if (row.page_number_source !== void 0 && row.page_number_source !== null) {
			const source = row.page_number_source;
			if (typeof source.supported !== "boolean" || source.start_page !== null && (!Number.isInteger(source.start_page) || source.start_page < 1 || source.start_page > 4294967295) || ![
				null,
				true,
				false
			].includes(source.hide_first_header) || ![
				null,
				true,
				false
			].includes(source.hide_first_footer)) throw new Error("InvalidParagraphFlow");
		}
		if (row.page_area !== void 0 && row.page_area !== null) {
			const area = row.page_area;
			const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
			if (!area || !uint(area.owner_node) || !uint(area.list_node) || ![area.width, area.height].every((value) => value === null || uint(value)) || ![
				null,
				"both",
				"odd",
				"even"
			].includes(area.apply) || ![
				null,
				"top",
				"center",
				"bottom"
			].includes(area.vertical_alignment)) throw new Error("InvalidParagraphFlow");
		}
		if (!row || !Number.isInteger(row.paragraph) || row.paragraph <= 0 || row.paragraph > 4294967295 || !Number.isInteger(row.source_node) || row.source_node < 0 || row.source_node > 4294967295 || typeof row.top_level !== "boolean" || ![
			null,
			true,
			false
		].includes(row.page_break) || ![
			null,
			true,
			false
		].includes(row.column_break)) throw new Error("InvalidParagraphFlow");
	}
	if (rows.some((row, i) => i > 0 && row.paragraph !== rows[i - 1].paragraph + 1)) throw new Error("InvalidParagraphFlow");
	return rows;
}
function decodePageSettings(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const optional = (value) => value === null || uint(value);
	if (!Array.isArray(rows)) throw new Error("InvalidPageSettings");
	for (const row of rows) {
		if (!row || !uint(row.section_ordinal) || !uint(row.element_index) || !uint(row.duplicate_margins) || !optional(row.width) || !optional(row.height) || ![
			null,
			"widely",
			"narrowly"
		].includes(row.orientation) || ![
			null,
			"left_only",
			"left_right",
			"top_bottom"
		].includes(row.gutter_type)) throw new Error("InvalidPageSettings");
		if (row.hide_first_empty_line !== void 0 && ![
			null,
			true,
			false
		].includes(row.hide_first_empty_line)) throw new Error("InvalidPageSettings");
		if (Object.hasOwn(row, "hide_first_empty_line") !== Object.hasOwn(row, "visibility_count")) throw new Error("InvalidPageSettings");
		if (row.visibility_count !== void 0 && (!uint(row.visibility_count) || row.visibility_count !== 1 && row.hide_first_empty_line != null)) throw new Error("InvalidPageSettings");
		if (row.margin !== null && (!row.margin || ![
			"header",
			"footer",
			"gutter",
			"left",
			"right",
			"top",
			"bottom"
		].every((name) => optional(row.margin[name])))) throw new Error("InvalidPageSettings");
	}
	return rows;
}
var init_hwpx_page_settings = __esmMin((() => {}));
// ../../js/hwpx-note-shapes.mjs
function decodeNoteShapes(bytes) {
	const report = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const invalid = () => {
		throw new Error("InvalidNoteShapes");
	};
	if (!report || ![
		"sections",
		"foot_notes",
		"end_notes",
		"other_attributes",
		"unknown_enums",
		"noncanonical_colors",
		"direct_children"
	].every((name) => uint(report[name])) || !Array.isArray(report.notes) || !Array.isArray(report.children)) invalid();
	for (const note of report.notes) if (!note || !["foot", "end"].includes(note.kind) || ![
		"section_ordinal",
		"element_index",
		"parent_element_index",
		"other_attributes",
		"direct_children"
	].every((name) => uint(note[name])) || note.section_ordinal >= report.sections || !Array.isArray(note.child_counts) || note.child_counts.length !== 5 || !note.child_counts.every(uint)) invalid();
	for (const child of report.children) if (!child || ![
		"auto_num_format",
		"note_line",
		"note_spacing",
		"numbering",
		"placement"
	].includes(child.kind) || ![
		"note_index",
		"element_index",
		"other_attributes",
		"unknown_enums",
		"noncanonical_colors",
		"direct_children"
	].every((name) => uint(child[name])) || child.note_index >= report.notes.length || !Array.isArray(child.raw) || child.raw.length !== 16 || !child.raw.every((value) => value === null || typeof value === "string")) invalid();
	return report;
}
var init_hwpx_note_shapes = __esmMin((() => {}));
// ../../js/hwpx-table-pagination.mjs
/** Source table policy, not measured splitting or default-value inference. */
function decodeTablePagination(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const optional = (value) => value === null || uint(value);
	if (!Array.isArray(rows)) throw new Error("InvalidTablePagination");
	let previous = -1;
	for (const row of rows) {
		const value = row?.values;
		if (!row || !uint(row.table_node) || row.table_node <= previous || !value || ![
			null,
			"none",
			"table",
			"cell",
			"unknown"
		].includes(value.page_break) || ![
			null,
			false,
			true
		].includes(value.repeat_header) || ![
			null,
			false,
			true
		].includes(value.no_adjust) || !optional(value.cell_spacing) || !optional(value.border_fill_id)) throw new Error("InvalidTablePagination");
		previous = row.table_node;
	}
	return rows;
}
var init_hwpx_table_pagination = __esmMin((() => {}));
// ../../js/hwpx-table-geometry.mjs
/** Validate source geometry only; source enum indices are not layout defaults. */
function decodeTableGeometry(bytes) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!value || typeof value !== "object") throw new Error("InvalidTableGeometry");
	const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
	const signed = (v) => Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
	const optional = (v, check) => v === null || check(v);
	const bool = (v) => [
		null,
		false,
		true
	].includes(v);
	const bounded = (max) => (v) => uint(v) && v <= max;
	if (Object.hasOwn(value, "z_order") && !optional(value.z_order, signed)) throw new Error("InvalidTableGeometry");
	const g = value?.geometry;
	const margin = (v) => v === null || Array.isArray(v) && v.length === 4 && v.every((n) => optional(n, signed));
	for (const [name, maximum] of [["text_wrap", 5], ["text_flow", 3]]) if (name in value && !optional(value[name], bounded(maximum))) throw new Error("InvalidTableGeometry");
	if (!g || !optional(g.width, uint) || !optional(g.height, uint) || !optional(g.width_relative, bounded(4)) || !optional(g.height_relative, bounded(2)) || !bool(g.treat_as_character) || !optional(g.horizontal_offset, signed) || !optional(g.vertical_offset, signed) || ![
		value.affect_line_spacing,
		value.flow_with_text,
		value.allow_overlap,
		value.hold_anchor
	].every(bool) || !optional(value.vertical_relative, bounded(2)) || !optional(value.horizontal_relative, bounded(3)) || !optional(value.vertical_alignment, bounded(4)) || !optional(value.horizontal_alignment, bounded(4)) || !margin(value.out_margin) || !margin(value.in_margin)) throw new Error("InvalidTableGeometry");
	return value;
}
var init_hwpx_table_geometry = __esmMin((() => {}));
// ../../js/caption-bindings-wire.mjs
/** Shared current paragraph/owner envelope; component IDs stay format-specific. */
function decodeCaptionBindings(bytes, ownerField, errorName) {
	if (![
		"table_node",
		"picture_node",
		"container_node"
	].includes(ownerField)) throw new Error("InvalidCaptionBindingOwnerField");
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
	const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
	if (!Array.isArray(rows) || rows.length > 1e5) throw new Error(errorName);
	let previous = 0;
	for (const row of rows) {
		if (!object(row) || !uint(row.paragraph) || row.paragraph <= previous || !object(row.owner) || !uint(row.owner[ownerField]) || !uint(row.owner.caption_node) || !uint(row.owner.list_node)) throw new Error(errorName);
		previous = row.paragraph;
	}
	return rows;
}
var init_caption_bindings_wire = __esmMin((() => {}));
// ../../js/hwpx-table-caption-bindings.mjs
function decodeTableCaptionBindings(bytes) {
	return decodeCaptionBindings(bytes, "table_node", "InvalidTableCaptionBindings");
}
var init_hwpx_table_caption_bindings = __esmMin((() => {
	init_caption_bindings_wire();
}));
// ../../js/hwpx-automatic-number-sites.mjs
function decodeAutomaticNumberSites(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const optional = (value) => value === null || uint(value);
	if (!Array.isArray(rows) || rows.length > 1e5) throw new Error("InvalidAutomaticNumberSites");
	const nodes = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || typeof row !== "object" || Array.isArray(row) || !uint(row.number_node) || nodes.has(row.number_node) || !optional(row.anchor_node) || !optional(row.paragraph) || !optional(row.anchor_unit) || row.paragraph === null !== (row.anchor_unit === null) || row.paragraph === 0 || row.anchor_node === null && row.paragraph !== null) throw new Error("InvalidAutomaticNumberSites");
		nodes.add(row.number_node);
	}
	return rows;
}
var init_hwpx_automatic_number_sites = __esmMin((() => {}));
// ../../js/hwpx-automatic-number-sources.mjs
function decodeAutomaticNumberSources(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (v) => Number.isInteger(v) && v >= 0 && v <= 4294967295;
	const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
	const flag = (v) => v === null || typeof v === "boolean";
	const raw = (v, n) => Array.isArray(v) && v.length === n && v.every((s) => s === null || typeof s === "string");
	const nodes = /* @__PURE__ */ new Set();
	if (!Array.isArray(rows) || rows.length > 1e5) throw new Error("InvalidAutomaticNumberSources");
	for (const row of rows) {
		const value = row?.values, format = row?.format;
		if (!object(row) || !uint(row.number_node) || nodes.has(row.number_node) || !(row.anchor_node === null || uint(row.anchor_node)) || !object(value) || !raw(value.raw, 2) || !uint(value.other_attributes) || !flag(value.type_known) || !(value.num === null || Number.isInteger(value.num) && value.num >= -2147483648 && value.num <= 2147483647) || !(format === null || object(format) && raw(format.raw, 5) && uint(format.other_attributes) && flag(format.type_known) && flag(format.supscript))) throw new Error("InvalidAutomaticNumberSources");
		nodes.add(row.number_node);
	}
	return rows;
}
var init_hwpx_automatic_number_sources = __esmMin((() => {}));
// ../../js/hwpx-note-reference-sites.mjs
function decodeNoteReferenceSites(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	if (!Array.isArray(rows) || rows.length > 1e5) throw new Error("InvalidNoteReferenceSites");
	const notes = /* @__PURE__ */ new Set(), anchors = /* @__PURE__ */ new Set(), numbers = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || Array.isArray(row) || ![
			"note_node",
			"number_node",
			"anchor_node",
			"paragraph",
			"anchor_unit"
		].every((key) => uint(row[key])) || row.paragraph === 0 || notes.has(row.note_node) || anchors.has(row.anchor_node) || numbers.has(row.number_node)) throw new Error("InvalidNoteReferenceSites");
		notes.add(row.note_node);
		anchors.add(row.anchor_node);
		numbers.add(row.number_node);
	}
	return rows;
}
var init_hwpx_note_reference_sites = __esmMin((() => {}));
// ../../js/hwpx-paragraph-text-snapshot.mjs
function decodeParagraphTextSnapshot(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!Array.isArray(rows) || rows.length > 1e5) throw new Error("InvalidParagraphTextSnapshot");
	let previous = null;
	for (const row of rows) {
		if (!row || !Number.isInteger(row.paragraph) || row.paragraph < 1 || row.paragraph > 4294967295 || previous !== null && row.paragraph !== previous + 1 || typeof row.text !== "string" || !row.text.isWellFormed() || typeof row.nested !== "boolean") throw new Error("InvalidParagraphTextSnapshot");
		previous = row.paragraph;
	}
	return rows;
}
var init_hwpx_paragraph_text_snapshot = __esmMin((() => {}));
// ../../js/hwpx-formula-field-sources.mjs
function decodeFormulaFieldSources(bytes) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
	const optionalBoolean = (value) => value === null || typeof value === "boolean";
	if (!Array.isArray(rows) || rows.length > 1e5) throw new Error("InvalidFormulaFieldSources");
	const begins = /* @__PURE__ */ new Set(), ends = /* @__PURE__ */ new Set();
	for (const row of rows) {
		if (!row || !uint(row.begin_node) || !uint(row.end_node) || row.end_node <= row.begin_node || begins.has(row.begin_node) || ends.has(row.end_node) || !optionalBoolean(row.editable) || !optionalBoolean(row.dirty) || !Array.isArray(row.raw) || row.raw.length !== 5 || row.raw.some((value) => value !== null && (typeof value !== "string" || !value.isWellFormed()))) throw new Error("InvalidFormulaFieldSources");
		begins.add(row.begin_node);
		ends.add(row.end_node);
	}
	return rows;
}
var init_hwpx_formula_field_sources = __esmMin((() => {}));
// ../../js/hwpx-table-cell-margin.mjs
/** Detached source margin values, not resolved display insets. */
function decodeTableCellMargin(bytes) {
	const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	const bool = (v) => [
		null,
		false,
		true
	].includes(v);
	const number = (v) => v === null || Number.isSafeInteger(v) && v >= -2147483648 && v <= 4294967295;
	if (!value || !bool(value.has_margin) || !bool(value.header) || !(value.margin === null || Array.isArray(value.margin) && value.margin.length === 4 && value.margin.every(number))) throw new Error("InvalidTableCellMargin");
	for (const field of [
		"text_direction",
		"line_wrap",
		"vertical_alignment"
	]) if (value[field] !== void 0 && value[field] !== null && !(Number.isInteger(value[field]) && value[field] >= 0 && value[field] <= 2)) throw new Error("InvalidTableCellMargin");
	return value;
}
var init_hwpx_table_cell_margin = __esmMin((() => {}));
// ../../js/hwpx-formula-sources.mjs
/** Source commands/caches, not current evaluation or mutable model handles. */
function decodeFormulaSources(bytes, { current = false } = {}) {
	const rows = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	if (!Array.isArray(rows) || rows.length > 4096) throw new Error("InvalidFormulaSources");
	let previous = -1;
	for (const row of rows) {
		if (!row || !Number.isInteger(row.begin_element) || row.begin_element <= previous || row.begin_element > 4294967295 || !row.values || ![
			"command",
			"formula",
			"result_format",
			"last_result"
		].every((key) => row.values[key] === null || typeof row.values[key] === "string")) throw new Error("InvalidFormulaSources");
		previous = row.begin_element;
		if (current) {
			const owner = row.owner;
			const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 4294967295;
			if (!owner || ![
				owner.table,
				owner.cell,
				owner.columns,
				owner.rows,
				owner.origin?.column,
				owner.origin?.row
			].every(uint) || owner.columns === 0 || owner.rows === 0 || owner.origin.column >= owner.columns || owner.origin.row >= owner.rows) throw new Error("InvalidFormulaSources");
		}
	}
	return rows;
}
var init_hwpx_formula_sources = __esmMin((() => {}));
// ../../js/hwpx-picture-crop-wire.mjs
function decodePictureCrop(bytes) {
	const fail = () => {
		throw new Error("InvalidPictureCrop");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length !== 48) fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), flags = view.getUint32(4, true);
	if (view.getUint32(0, true) !== 826495048 || flags & -64) fail();
	const clip = [];
	for (let index = 0; index < 4; index++) {
		const value = view.getBigInt64(8 + index * 8, true), present = flags & 1 << index;
		if (value < -2147483648n || value > 4294967295n || !present && value !== 0n) fail();
		clip.push(present ? Number(value) : null);
	}
	const imageDimensions = [];
	for (let index = 0; index < 2; index++) {
		const value = view.getUint32(40 + index * 4, true), present = flags & 1 << index + 4;
		if (!present && value !== 0) fail();
		imageDimensions.push(present ? value : null);
	}
	return {
		clip,
		imageDimensions
	};
}
var init_hwpx_picture_crop_wire = __esmMin((() => {}));
// ../../js/hwpx-picture-transform-wire.mjs
function decodePictureTransform(bytes) {
	const fail = () => {
		throw new Error("InvalidPictureTransform");
	};
	if (!(bytes instanceof Uint8Array) || bytes.length < 24) fail();
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const count = view.getUint32(4, true), flags = view.getUint32(12, true), angle = view.getUint32(16, true), identity = view.getUint32(20, true);
	if (view.getUint32(0, true) !== 827609160 || count > 1024 || bytes.length !== 24 + count * 56 || flags & -1808 || identity > 2 || !(flags & 8) && angle !== 0) fail();
	const booleans = [
		0,
		1,
		2
	].map((index) => {
		const present = flags & 1 << index, value = Boolean(flags & 1 << index + 8);
		if (!present && value) fail();
		return present ? value : null;
	});
	const matrices = [];
	for (let index = 0; index < count; index++) {
		const at = 24 + index * 56, kind = view.getUint32(at, true), presence = view.getUint32(at + 4, true);
		if (kind > 2 || presence & -64) fail();
		const values = Array.from({ length: 6 }, (_, field) => {
			const value = view.getFloat64(at + 8 + field * 8, true), present = presence & 1 << field;
			if (!present && value !== 0) fail();
			return present ? value : null;
		});
		matrices.push({
			kind: [
				"translation",
				"scale",
				"rotation"
			][kind],
			values
		});
	}
	return {
		flip: booleans.slice(0, 2),
		reverse: booleans[2],
		angle: flags & 8 ? angle : null,
		identity: identity === 0 ? null : identity === 1,
		unknownMatrixNodes: view.getUint32(8, true),
		matrices
	};
}
var init_hwpx_picture_transform_wire = __esmMin((() => {}));
// ../../js/hwpx-character-shapes-wire.mjs
var init_hwpx_character_shapes_wire = __esmMin((() => {
	init_character_shapes_wire();
}));
// ../../js/hwpx-editor.mjs
/** Experimental plain-paragraph editing; paragraph numbers are document-wide, 1-based. */
async function createHwpxEditor(source) {
	const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
	const { exports: wasm } = await WebAssembly.instantiate(module, {});
	validateAbi(wasm);
	for (const suffix of [
		"open",
		"close",
		"section_count",
		"can_edit",
		"splice",
		"save",
		"output_ptr",
		"output_len",
		"output_free"
	]) if (typeof wasm[`hwpx_edit_${suffix}`] !== "function") throw new Error("HwpxEditAbiUnavailable");
	const memory = createMemory(wasm);
	let closed = false;
	function ready() {
		if (closed) throw new Error("EditorClosed");
	}
	function uint(value) {
		if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError("InvalidInteger");
		return value;
	}
	function encodedText(text) {
		if (typeof text !== "string" || !text.isWellFormed()) throw new TypeError("InvalidText");
		const bytes = new TextEncoder().encode(text);
		if (bytes.length > 4194304) throw new RangeError("LimitExceeded");
		return bytes;
	}
	function manualFormulaResultBytes(text, action, unavailable) {
		if (typeof wasm[action] !== "function" || typeof wasm.hwpx_edit_manual_formula_result_max_bytes !== "function") throw new Error(unavailable);
		const maxBytes = wasm.hwpx_edit_manual_formula_result_max_bytes();
		if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295) throw new Error("InvalidManualFormulaResultLimit");
		const bytes = encodedText(text);
		if (bytes.length > maxBytes) throw new Error("LimitExceeded");
		return bytes;
	}
	function fieldLabels(section, paragraph) {
		ready();
		uint(section);
		uint(paragraph);
		if (typeof wasm.hwpx_edit_field_labels !== "function") throw new Error("HwpxFieldEditAbiUnavailable");
		try {
			if (!wasm.hwpx_edit_field_labels(section, paragraph)) throw memory.error();
			return decodeFieldTargets(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
		} finally {
			wasm.hwpx_edit_output_free();
		}
	}
	function paragraphIds(suffix, args = []) {
		ready();
		args.forEach(uint);
		const action = wasm[`hwpx_edit_${suffix}`];
		if (typeof action !== "function") throw new Error("HwpxParagraphFormatAbiUnavailable");
		try {
			if (!action(...args)) throw memory.error();
			const bytes = memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
			if (bytes.length % 4 || suffix === "paragraph_shape_id" && bytes.length !== 4) throw new Error("InvalidParagraphShapeIds");
			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			return Array.from({ length: bytes.length / 4 }, (_, index) => view.getUint32(index * 4, true));
		} finally {
			wasm.hwpx_edit_output_free();
		}
	}
	return {
		...createAtomicFormattingApi({
			wasm,
			memory,
			check: ready,
			prefix: "hwpx_edit"
		}),
		...createParagraphBreakApi({
			wasm,
			memory,
			check: ready,
			uint,
			prefix: "hwpx_edit",
			endAsCount: true,
			unavailable: "HwpxParagraphBreakAbiUnavailable"
		}),
		paragraphShapeIds() {
			return paragraphIds("paragraph_shape_ids");
		},
		paragraphNeighbors(section) {
			const values = paragraphIds("paragraph_neighbors", [section]);
			if (values.length < 2 || values[0] < 1 || values[1] !== values.length - 2) throw new Error("InvalidParagraphNeighbors");
			const firstParagraph = values[0], next = values.slice(2);
			for (const [index, value] of next.entries()) if (value !== 0 && (value <= firstParagraph + index || value >= firstParagraph + next.length)) throw new Error("InvalidParagraphNeighbors");
			return {
				firstParagraph,
				next: next.map((value) => value === 0 ? null : value)
			};
		},
		paragraphShapeRefs(section) {
			const values = paragraphIds("paragraph_shape_refs", [section]);
			if (values.length < 2 || values[0] < 1 || values[1] !== values.length - 2) throw new Error("InvalidParagraphShapeIds");
			return {
				firstParagraph: values[0],
				ids: values.slice(2)
			};
		},
		paragraphShapeId(section, paragraph) {
			return paragraphIds("paragraph_shape_id", [section, paragraph])[0];
		},
		setParagraphFormat({ section, paragraph, paraShapeId }) {
			ready();
			[
				section,
				paragraph,
				paraShapeId
			].forEach(uint);
			if (typeof wasm.hwpx_edit_set_paragraph_format !== "function") throw new Error("HwpxParagraphFormatAbiUnavailable");
			if (!wasm.hwpx_edit_set_paragraph_format(section, paragraph, paraShapeId)) throw memory.error();
		},
		setParagraphAlignment({ section, paragraph, alignment }) {
			ready();
			[section, paragraph].forEach(uint);
			const value = [
				"LEFT",
				"RIGHT",
				"CENTER",
				"JUSTIFY",
				"DISTRIBUTE",
				"DISTRIBUTE_SPACE"
			].indexOf(alignment);
			if (value < 0) throw new RangeError("InvalidParagraphAlignment");
			if (typeof wasm.hwpx_edit_set_paragraph_alignment !== "function") throw new Error("HwpxParagraphAlignmentAbiUnavailable");
			if (!wasm.hwpx_edit_set_paragraph_alignment(section, paragraph, value)) throw memory.error();
		},
		setParagraphMargins({ section, paragraph, margins }) {
			ready();
			[section, paragraph].forEach(uint);
			const args = paragraphMarginArgs(margins);
			if (typeof wasm.hwpx_edit_set_paragraph_margins !== "function") throw new Error("HwpxParagraphMarginsAbiUnavailable");
			if (!wasm.hwpx_edit_set_paragraph_margins(section, paragraph, ...args)) throw memory.error();
		},
		setParagraphSpacing({ section, paragraph, type, value }) {
			ready();
			[section, paragraph].forEach(uint);
			const args = paragraphSpacingArgs(type, value);
			if (typeof wasm.hwpx_edit_set_paragraph_spacing !== "function") throw new Error("HwpxParagraphSpacingAbiUnavailable");
			if (!wasm.hwpx_edit_set_paragraph_spacing(section, paragraph, ...args)) throw memory.error();
		},
		...createHistoryApi({
			wasm,
			memory,
			check: ready,
			uint,
			prefix: "hwpx_edit",
			unavailable: "HwpxHistoryAbiUnavailable"
		}),
		canEditOutsideField(section, paragraph, startUnit, endUnit) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (typeof wasm.hwpx_edit_can_edit_outside_field !== "function") throw new Error("HwpxOutsideFieldQueryAbiUnavailable");
			const result = wasm.hwpx_edit_can_edit_outside_field(section, paragraph, startUnit, endUnit);
			if (result > 1) throw memory.error();
			return result === 1;
		},
		createdTableHostMode(section, anchored = false) {
			ready();
			uint(section);
			if (typeof anchored !== "boolean") throw new TypeError("InvalidCreatedTableHostMode");
			if (typeof wasm.hwpx_edit_created_table_host_mode !== "function") return false;
			const result = wasm.hwpx_edit_created_table_host_mode(section, Number(anchored));
			if (result > 1) throw memory.error();
			return result === 1;
		},
		createdTableFieldLabelMode(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_created_table_field_label_mode !== "function") return false;
			const result = wasm.hwpx_edit_created_table_field_label_mode(section);
			if (result > 1) throw memory.error();
			return result === 1;
		},
		canEdit(section, paragraph) {
			ready();
			uint(section);
			uint(paragraph);
			const result = wasm.hwpx_edit_can_edit(section, paragraph);
			if (result > 1) throw memory.error();
			return result === 1;
		},
		canSplitParagraph({ section, paragraph, atUnit, endUnit = atUnit }) {
			ready();
			[
				section,
				paragraph,
				atUnit,
				endUnit
			].forEach(uint);
			if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
			if (typeof wasm.hwpx_edit_can_split !== "function") throw new Error("HwpxSplitQueryAbiUnavailable");
			const result = wasm.hwpx_edit_can_split(section, paragraph, atUnit, endUnit - atUnit);
			if (result > 1) throw memory.error();
			return result === 1;
		},
		supportsAnchoredSplitQuery() {
			return typeof wasm.hwpx_edit_can_split_anchored === "function";
		},
		canSplitParagraphAnchored({ section, paragraph, atUnit, endUnit = atUnit }) {
			ready();
			[
				section,
				paragraph,
				atUnit,
				endUnit
			].forEach(uint);
			if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
			if (typeof wasm.hwpx_edit_can_split_anchored !== "function") throw new Error("HwpxAnchoredSplitQueryAbiUnavailable");
			const result = wasm.hwpx_edit_can_split_anchored(section, paragraph, atUnit, endUnit - atUnit);
			if (result > 1) throw memory.error();
			return result === 1;
		},
		open(data, options = {}) {
			ready();
			if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("InvalidEditorOptions");
			const allow = options.allowObservedChartOleDeviations === void 0 ? false : options.allowObservedChartOleDeviations;
			if (typeof allow !== "boolean") throw new TypeError("InvalidChartOlePolicy");
			if (allow && typeof wasm.hwpx_edit_open_with_chart_ole_policy !== "function") throw new Error("HwpxChartOlePolicyAbiUnavailable");
			const bytes = inputBytes(data);
			if (bytes.length > 67108864) throw new RangeError("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => {
				if (!(allow ? wasm.hwpx_edit_open_with_chart_ole_policy(ptr, size, 1) : wasm.hwpx_edit_open(ptr, size))) throw memory.error();
			});
			return { sectionCount: wasm.hwpx_edit_section_count() };
		},
		splice(section, paragraph, start, deleted, text) {
			ready();
			[
				section,
				paragraph,
				start,
				deleted
			].forEach(uint);
			const bytes = encodedText(text);
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_splice(section, paragraph, start, deleted, ptr, size)) throw memory.error();
			});
		},
		splitParagraph({ section, paragraph, atUnit, endUnit = atUnit }) {
			ready();
			[
				section,
				paragraph,
				atUnit,
				endUnit
			].forEach(uint);
			if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
			if (typeof wasm.hwpx_edit_split !== "function") throw new Error("HwpxStructureAbiUnavailable");
			if (!wasm.hwpx_edit_split(section, paragraph, atUnit, endUnit - atUnit)) throw memory.error();
		},
		splitParagraphAnchored({ section, paragraph, atUnit, endUnit = atUnit }) {
			ready();
			[
				section,
				paragraph,
				atUnit,
				endUnit
			].forEach(uint);
			if (endUnit < atUnit) throw new RangeError("InvalidTextPosition");
			if (typeof wasm.hwpx_edit_split_anchored !== "function") throw new Error("HwpxStructureAbiUnavailable");
			if (!wasm.hwpx_edit_split_anchored(section, paragraph, atUnit, endUnit - atUnit)) throw memory.error();
		},
		mergeParagraph({ section, paragraph }) {
			ready();
			[section, paragraph].forEach(uint);
			if (typeof wasm.hwpx_edit_merge !== "function") throw new Error("HwpxStructureAbiUnavailable");
			if (!wasm.hwpx_edit_merge(section, paragraph)) throw memory.error();
		},
		mergeParagraphPair({ section, paragraph, rightParagraph }) {
			ready();
			[
				section,
				paragraph,
				rightParagraph
			].forEach(uint);
			if (typeof wasm.hwpx_edit_merge_pair !== "function") throw new Error("HwpxStructureAbiUnavailable");
			if (!wasm.hwpx_edit_merge_pair(section, paragraph, rightParagraph)) throw memory.error();
		},
		setCharacterFormat({ section, paragraph, startUnit, endUnit, charShapeId }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit,
				charShapeId
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			if (typeof wasm.hwpx_edit_set_character_format !== "function") throw new Error("HwpxCharacterFormatAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_format(section, paragraph, startUnit, endUnit, charShapeId)) throw memory.error();
		},
		setCharacterProperties({ section, paragraph, startUnit, endUnit, properties }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterPropertyArgs(properties);
			if (typeof wasm.hwpx_edit_set_character_properties !== "function") throw new Error("HwpxCharacterPropertiesAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_properties(section, paragraph, startUnit, endUnit, ...args)) throw memory.error();
		},
		replaceParagraphRangesWithFontName({ ranges, text, language, name, properties }) {
			ready();
			const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text), font = characterFontNameArgs(language, name);
			const args = properties === void 0 ? null : characterPropertyArgs(properties);
			const action = args ? wasm.hwpx_edit_replace_paragraph_ranges_font_name_properties : wasm.hwpx_edit_replace_paragraph_ranges_font_name;
			if (typeof action !== "function") throw new Error(args ? "HwpxNamedFontPropertyReplacementAbiUnavailable" : "HwpxNamedFontReplacementAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => memory.withBytes(font.bytes, (np, ns) => {
				if (!action(ptr, size, tp, ts, font.language, np, ns, ...args ?? [])) throw memory.error();
			})));
		},
		replaceParagraphRanges({ ranges, text, properties }) {
			ready();
			const bytes = encodeCharacterRanges(ranges), inserted = encodeParagraphReplacement(text);
			const args = properties === void 0 ? null : characterPropertyArgs(properties);
			const action = args ? wasm.hwpx_edit_replace_paragraph_ranges_properties : wasm.hwpx_edit_replace_paragraph_ranges;
			if (typeof action !== "function") throw new Error(args ? "HwpxPropertyReplacementAbiUnavailable" : "HwpxParagraphReplacementAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => memory.withBytes(inserted, (tp, ts) => {
				if (!action(ptr, size, tp, ts, ...args ?? [])) throw memory.error();
			}));
		},
		setCharacterStrikeRanges({ ranges, enabled }) {
			ready();
			const bytes = encodeCharacterRanges(ranges);
			if (typeof enabled !== "boolean") throw new TypeError("InvalidCharacterProperties");
			if (typeof wasm.hwpx_edit_set_character_strike_ranges !== "function") throw new Error("HwpxCharacterStrikeRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_character_strike_ranges(ptr, size, Number(enabled))) throw memory.error();
			});
		},
		setCharacterUnderlineRanges({ ranges, kind }) {
			ready();
			const bytes = encodeCharacterRanges(ranges), value = characterUnderlineArg(kind);
			if (typeof wasm.hwpx_edit_set_character_underline_ranges !== "function") throw new Error("HwpxCharacterUnderlineRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_character_underline_ranges(ptr, size, value)) throw memory.error();
			});
		},
		setCharacterPropertiesRanges({ ranges, properties }) {
			ready();
			const bytes = encodeCharacterRanges(ranges);
			const args = characterPropertyArgs(properties);
			if (typeof wasm.hwpx_edit_set_character_properties_ranges !== "function") throw new Error("HwpxCharacterPropertiesRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_character_properties_ranges(ptr, size, ...args)) throw memory.error();
			});
		},
		setCharacterFontNameRanges({ ranges, language, name }) {
			ready();
			const bytes = encodeCharacterRanges(ranges), args = characterFontNameArgs(language, name);
			if (typeof wasm.hwpx_edit_set_character_font_name_ranges !== "function") throw new Error("HwpxCharacterFontNameRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => memory.withBytes(args.bytes, (namePtr, nameSize) => {
				if (!wasm.hwpx_edit_set_character_font_name_ranges(ptr, size, args.language, namePtr, nameSize)) throw memory.error();
			}));
		},
		setCharacterFontRanges({ ranges, language, fontId }) {
			ready();
			const bytes = encodeCharacterRanges(ranges), args = characterFontArgs(language, fontId);
			if (typeof wasm.hwpx_edit_set_character_font_ranges !== "function") throw new Error("HwpxCharacterFontRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_character_font_ranges(ptr, size, ...args)) throw memory.error();
			});
		},
		setCharacterTextColorRanges({ ranges, color }) {
			ready();
			const bytes = encodeCharacterRanges(ranges), value = characterColorArg(color);
			if (typeof wasm.hwpx_edit_set_character_text_color_ranges !== "function") throw new Error("HwpxCharacterTextColorRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_character_text_color_ranges(ptr, size, value)) throw memory.error();
			});
		},
		setCharacterShadeRanges({ ranges, color }) {
			ready();
			const bytes = encodeCharacterRanges(ranges), args = characterShadeArgs(color);
			if (typeof wasm.hwpx_edit_set_character_shade_ranges !== "function") throw new Error("HwpxCharacterShadeRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_character_shade_ranges(ptr, size, ...args)) throw memory.error();
			});
		},
		setCharacterEffectRanges({ ranges, effect, enabled, exclusive = false }) {
			ready();
			const bytes = encodeCharacterRanges(ranges), args = characterEffectArgs(effect, enabled);
			const method = characterEffectMode(exclusive) ? wasm.hwpx_edit_set_character_effect_ranges_exclusive : wasm.hwpx_edit_set_character_effect_ranges;
			if (typeof method !== "function") throw new Error(exclusive ? "HwpxCharacterEffectRangesExclusiveAbiUnavailable" : "HwpxCharacterEffectRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!method(ptr, size, ...args)) throw memory.error();
			});
		},
		setCharacterOutlineRanges({ ranges, kind }) {
			ready();
			const bytes = encodeCharacterRanges(ranges), value = characterOutlineArg(kind);
			if (typeof wasm.hwpx_edit_set_character_outline_ranges !== "function") throw new Error("HwpxCharacterOutlineRangesAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_character_outline_ranges(ptr, size, value)) throw memory.error();
			});
		},
		setCharacterStrike({ section, paragraph, startUnit, endUnit, enabled }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			if (typeof enabled !== "boolean") throw new TypeError("InvalidCharacterProperties");
			if (typeof wasm.hwpx_edit_set_character_strike !== "function") throw new Error("HwpxCharacterStrikeAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_strike(section, paragraph, startUnit, endUnit, Number(enabled))) throw memory.error();
		},
		setCharacterUnderline({ section, paragraph, startUnit, endUnit, kind }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = characterUnderlineArg(kind);
			if (typeof wasm.hwpx_edit_set_character_underline !== "function") throw new Error("HwpxCharacterUnderlineAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_underline(section, paragraph, startUnit, endUnit, value)) throw memory.error();
		},
		setCharacterStrikeColor({ section, paragraph, startUnit, endUnit, color }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = characterColorArg(color);
			if (typeof wasm.hwpx_edit_set_character_strike_color !== "function") throw new Error("HwpxCharacterStrikeColorAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_strike_color(section, paragraph, startUnit, endUnit, value)) throw memory.error();
		},
		setCharacterUnderlineColor({ section, paragraph, startUnit, endUnit, color }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = characterColorArg(color);
			if (typeof wasm.hwpx_edit_set_character_underline_color !== "function") throw new Error("HwpxCharacterUnderlineColorAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_underline_color(section, paragraph, startUnit, endUnit, value)) throw memory.error();
		},
		setCharacterFont({ section, paragraph, startUnit, endUnit, language, fontId }) {
			ready();
			for (const [name, value] of Object.entries({
				section,
				paragraph,
				startUnit,
				endUnit
			})) if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError(`Invalid ${name}`);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterFontArgs(language, fontId);
			if (typeof wasm.hwpx_edit_set_character_font !== "function") throw new Error("HwpxCharacterFontAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_font(section, paragraph, startUnit, endUnit, ...args)) throw memory.error();
		},
		setCharacterFontName({ section, paragraph, startUnit, endUnit, language, name }) {
			ready();
			for (const [key, value] of Object.entries({
				section,
				paragraph,
				startUnit,
				endUnit
			})) if (!Number.isInteger(value) || value < 0 || value > 4294967295) throw new RangeError(`Invalid ${key}`);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterFontNameArgs(language, name);
			if (typeof wasm.hwpx_edit_set_character_font_name !== "function") throw new Error("HwpxCharacterFontNameAbiUnavailable");
			memory.withBytes(args.bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_character_font_name(section, paragraph, startUnit, endUnit, args.language, ptr, size)) throw memory.error();
			});
		},
		spliceWithCharacterProperties(input) {
			ready();
			const { positions, bytes } = textTransactionArgs(input);
			const properties = characterPropertyArgs(input.properties);
			const mode = input.textMode ?? "plain";
			if (![
				"plain",
				"anchored",
				"field"
			].includes(mode)) throw new RangeError("InvalidTextKind");
			const begin = input.beginElement ?? 0;
			uint(begin);
			const action = mode === "plain" ? wasm.hwpx_edit_splice_character_properties : wasm.hwpx_edit_splice_character_properties_protected;
			if (typeof action !== "function") throw new Error("HwpxCharacterPropertyTextAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				const extra = mode === "plain" ? [] : [mode === "anchored" ? 1 : 2, begin];
				if (!action(...positions, ptr, size, ...properties, ...extra)) throw memory.error();
			});
		},
		spliceWithFontName(input) {
			ready();
			const { positions, bytes, font } = namedFontTextArgs(input);
			const mode = input.textMode ?? "plain", begin = input.beginElement ?? 0;
			if (![
				"plain",
				"anchored",
				"field"
			].includes(mode)) throw new RangeError("InvalidTextKind");
			uint(begin);
			const properties = input.properties === void 0 ? null : characterPropertyArgs(input.properties);
			const action = properties ? wasm.hwpx_edit_splice_font_name_properties : mode === "plain" ? wasm.hwpx_edit_splice_font_name : wasm.hwpx_edit_splice_font_name_protected;
			if (typeof action !== "function") throw new Error(properties ? "HwpxNamedFontPropertyTextAbiUnavailable" : "HwpxNamedFontTextAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => memory.withBytes(font.bytes, (namePtr, nameSize) => {
				const extra = properties ? [
					...properties,
					mode === "plain" ? 0 : mode === "anchored" ? 1 : 2,
					begin
				] : mode === "plain" ? [] : [mode === "anchored" ? 1 : 2, begin];
				if (!action(...positions, ptr, size, font.language, namePtr, nameSize, ...extra)) throw memory.error();
			}));
		},
		setCharacterTextColor({ section, paragraph, startUnit, endUnit, color }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = characterColorArg(color);
			if (typeof wasm.hwpx_edit_set_character_text_color !== "function") throw new Error("HwpxCharacterTextColorAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_text_color(section, paragraph, startUnit, endUnit, value)) throw memory.error();
		},
		setCharacterShade({ section, paragraph, startUnit, endUnit, color }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterShadeArgs(color);
			if (typeof wasm.hwpx_edit_set_character_shade !== "function") throw new Error("HwpxCharacterShadeAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_shade(section, paragraph, startUnit, endUnit, ...args)) throw memory.error();
		},
		setCharacterEffect({ section, paragraph, startUnit, endUnit, effect, enabled, exclusive = false }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const args = characterEffectArgs(effect, enabled);
			const method = characterEffectMode(exclusive) ? wasm.hwpx_edit_set_character_effect_exclusive : wasm.hwpx_edit_set_character_effect;
			if (typeof method !== "function") throw new Error(exclusive ? "HwpxCharacterEffectExclusiveAbiUnavailable" : "HwpxCharacterEffectAbiUnavailable");
			if (!method(section, paragraph, startUnit, endUnit, ...args)) throw memory.error();
		},
		setCharacterOutline({ section, paragraph, startUnit, endUnit, kind }) {
			ready();
			[
				section,
				paragraph,
				startUnit,
				endUnit
			].forEach(uint);
			if (endUnit < startUnit) throw new RangeError("InvalidTextPosition");
			const value = characterOutlineArg(kind);
			if (typeof wasm.hwpx_edit_set_character_outline !== "function") throw new Error("HwpxCharacterOutlineAbiUnavailable");
			if (!wasm.hwpx_edit_set_character_outline(section, paragraph, startUnit, endUnit, value)) throw memory.error();
		},
		setCellStyles(input) {
			ready();
			const value = validateCellStyles(input), borders = encodeCellBorderPatches(value.borders), fills = encodeCellFills(value.fills);
			if (Object.hasOwn(value, "diagonals")) {
				if (typeof wasm.hwpx_edit_set_cell_styles_v2 !== "function") throw Error("CellDiagonalAbiUnavailable");
				const diagonals = encodeCellDiagonals(value.diagonals);
				memory.withBytes(borders, (borderPtr, borderLength) => memory.withBytes(fills, (fillPtr, fillLength) => memory.withBytes(diagonals, (diagonalPtr, diagonalLength) => {
					if (!wasm.hwpx_edit_set_cell_styles_v2(borderPtr, borderLength, fillPtr, fillLength, diagonalPtr, diagonalLength)) throw memory.error();
				})));
				return;
			}
			if (typeof wasm.hwpx_edit_set_cell_styles !== "function") throw Error("CellStylesAbiUnavailable");
			memory.withBytes(borders, (borderPtr, borderLength) => memory.withBytes(fills, (fillPtr, fillLength) => {
				if (!wasm.hwpx_edit_set_cell_styles(borderPtr, borderLength, fillPtr, fillLength)) throw memory.error();
			}));
		},
		setCellFills(input) {
			ready();
			const bytes = encodeCellFills(validateCellFills(input));
			if (typeof wasm.hwpx_edit_set_cell_fills !== "function") throw Error("CellFillBatchAbiUnavailable");
			memory.withBytes(bytes, (ptr, length) => {
				if (!wasm.hwpx_edit_set_cell_fills(ptr, length)) throw memory.error();
			});
		},
		setCellAppearance(input) {
			ready();
			const value = validateCellAppearance(input), bytes = encodeCellBorders(value.cells), bg = value.background;
			if (typeof wasm.hwpx_edit_set_cell_appearance !== "function") throw Error("HwpxCellAppearanceAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_cell_appearance(ptr, size, bg ? 1 : 0, bg?.section ?? 0, bg?.tableNode ?? 0, bg?.listNode ?? 0, bg?.color ?? 0)) throw memory.error();
			});
		},
		setCellBorders(cells) {
			ready();
			const bytes = encodeCellBorders(cells);
			if (typeof wasm.hwpx_edit_set_cell_borders !== "function") throw Error("HwpxCellBorderBatchAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_cell_borders(ptr, size)) throw memory.error();
			});
		},
		setCellBorder(input) {
			ready();
			const value = validateCellBorder(input);
			if (typeof wasm.hwpx_edit_set_cell_border !== "function") throw new Error("HwpxCellBorderAbiUnavailable");
			if (!wasm.hwpx_edit_set_cell_border(value.section, value.tableNode, value.listNode, value.edges, cellBorderStyleCode(value.style), value.width, value.color)) throw memory.error();
		},
		setCellBackground(input) {
			ready();
			const value = validateCellBackground(input);
			if (typeof wasm.hwpx_edit_set_cell_background !== "function") throw new Error("HwpxCellBackgroundAbiUnavailable");
			if (!wasm.hwpx_edit_set_cell_background(value.section, value.tableNode, value.listNode, value.color)) throw memory.error();
		},
		setCellSize({ section, listNode, width, height }) {
			ready();
			[
				section,
				listNode,
				width,
				height
			].forEach(uint);
			if (typeof wasm.hwpx_edit_set_cell_size !== "function") throw new Error("HwpxCellSizeAbiUnavailable");
			if (!wasm.hwpx_edit_set_cell_size(section, listNode, width, height)) throw memory.error();
		},
		setCellSizes(cells) {
			ready();
			const bytes = encodeCellSizes(cells);
			if (typeof wasm.hwpx_edit_set_cell_sizes !== "function") throw new Error("HwpxCellSizeBatchAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_cell_sizes(ptr, size)) throw memory.error();
			});
		},
		setPictureDimensions({ section, pictureNode, display, original, current }) {
			ready();
			[section, pictureNode].forEach(uint);
			let mask = 0;
			const values = [];
			for (const [index, pair] of [
				display,
				original,
				current
			].entries()) {
				if (pair === void 0 || pair === null) {
					values.push(0, 0);
					continue;
				}
				if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError("InvalidPictureDimensionPair");
				const width = pair[0], height = pair[1];
				uint(width);
				uint(height);
				mask |= 1 << index;
				values.push(width, height);
			}
			if (typeof wasm.hwpx_edit_set_picture_dimensions !== "function") throw new Error("HwpxPictureDimensionsAbiUnavailable");
			if (!wasm.hwpx_edit_set_picture_dimensions(section, pictureNode, mask, ...values)) throw memory.error();
		},
		resizePicture({ section, pictureNode, width, height }) {
			ready();
			[
				section,
				pictureNode,
				width,
				height
			].forEach(uint);
			if (width === 0 || height === 0) throw new RangeError("InvalidResizeAxisSize");
			if (typeof wasm.hwpx_edit_resize_picture !== "function") throw new Error("HwpxPictureResizeAbiUnavailable");
			if (!wasm.hwpx_edit_resize_picture(section, pictureNode, width, height)) throw memory.error();
		},
		groupedPictureResizeAvailable(section, pictureNode) {
			ready();
			[section, pictureNode].forEach(uint);
			if (typeof wasm.hwpx_edit_group_picture_resize_available !== "function") throw new Error("HwpxGroupedPictureResizeAbiUnavailable");
			if (!wasm.hwpx_edit_group_picture_resize_available(section, pictureNode)) throw memory.error();
			return true;
		},
		characterShapeIds() {
			ready();
			if (typeof wasm.hwpx_edit_character_shape_ids !== "function") throw new Error("HwpxCharacterFormatAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_shape_ids()) throw memory.error();
				const bytes = memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
				if (bytes.length % 4 !== 0) throw new Error("InvalidCharacterShapeIds");
				const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
				return Array.from({ length: bytes.length / 4 }, (_, index) => view.getUint32(index * 4, true));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		paragraphShapes() {
			ready();
			if (typeof wasm.hwpx_edit_paragraph_shapes !== "function") throw new Error("HwpxParagraphShapesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_paragraph_shapes()) throw memory.error();
				return decodeHwpxParagraphShapes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterShapes() {
			ready();
			if (typeof wasm.hwpx_edit_character_shapes !== "function") throw new Error("HwpxCharacterShapesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_shapes()) throw memory.error();
				return decodeCharacterShapes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterFontReferences() {
			ready();
			if (typeof wasm.hwpx_edit_character_font_references !== "function") throw new Error("HwpxCharacterFontReferencesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_font_references()) throw memory.error();
				return decodeCharacterFontReferences(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		fontFaces() {
			ready();
			if (typeof wasm.hwpx_edit_font_faces !== "function") throw new Error("HwpxFontFacesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_font_faces()) throw memory.error();
				return decodeFontFaces(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		fontFaceMetadata() {
			ready();
			if (typeof wasm.hwpx_edit_font_face_metadata !== "function") throw new Error("HwpxFontFaceMetadataAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_font_face_metadata()) throw memory.error();
				return decodeHwpxFontFaceMetadata(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterFontMetrics() {
			ready();
			if (typeof wasm.hwpx_edit_character_font_metrics !== "function") throw new Error("HwpxCharacterFontMetricsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_font_metrics()) throw memory.error();
				return decodeCharacterFontMetrics(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), "hwpx");
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		supportsDocumentProvenance() {
			return typeof wasm.hwpx_edit_document_provenance === "function";
		},
		documentProvenance() {
			ready();
			if (typeof wasm.hwpx_edit_document_provenance !== "function") throw new Error("HwpxDocumentProvenanceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_document_provenance()) throw memory.error();
				return decodeDocumentProvenance(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterTextColors() {
			ready();
			if (typeof wasm.hwpx_edit_character_text_colors !== "function") throw new Error("HwpxCharacterTextColorsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_text_colors()) throw memory.error();
				return decodeCharacterTextColors(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterShades() {
			ready();
			if (typeof wasm.hwpx_edit_character_shades !== "function") throw new Error("HwpxCharacterShadesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_shades()) throw memory.error();
				return decodeCharacterShades(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterEffects() {
			ready();
			if (typeof wasm.hwpx_edit_character_effects !== "function") throw new Error("HwpxCharacterEffectsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_effects()) throw memory.error();
				return decodeCharacterEffects(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterOutlines() {
			ready();
			if (typeof wasm.hwpx_edit_character_outlines !== "function") throw new Error("HwpxCharacterOutlinesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_outlines()) throw memory.error();
				return decodeCharacterOutlines(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterStrikeStyles() {
			ready();
			if (typeof wasm.hwpx_edit_character_strike_styles !== "function") throw new Error("HwpxCharacterStrikeStylesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_strike_styles()) throw memory.error();
				return decodeCharacterStrikeStyles(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterStrikes() {
			ready();
			if (typeof wasm.hwpx_edit_character_strikes !== "function") throw new Error("HwpxCharacterStrikesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_strikes()) throw memory.error();
				return decodeCharacterStrikes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterUnderlines() {
			ready();
			if (typeof wasm.hwpx_edit_character_underlines !== "function") throw new Error("HwpxCharacterUnderlinesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_underlines()) throw memory.error();
				return decodeCharacterUnderlines(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterUnderlineStyles() {
			ready();
			if (typeof wasm.hwpx_edit_character_underline_styles !== "function") throw new Error("HwpxCharacterUnderlineStylesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_underline_styles()) throw memory.error();
				return decodeCharacterUnderlineStyles(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tableBindings(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_table_bindings !== "function") throw new Error("HwpxTableBindingsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_bindings(section)) throw memory.error();
				return decodeTableBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tablePlacements(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_table_placements !== "function") throw new Error("HwpxTablePlacementsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_placements(section)) throw memory.error();
				return decodeTablePlacements(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		drawingTextBindings(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_drawing_text_bindings !== "function") throw new Error("HwpxDrawingTextBindingsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_drawing_text_bindings(section)) throw memory.error();
				return decodeDrawingTextBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		drawingTextSnapshot(section, drawingNode) {
			ready();
			uint(section);
			uint(drawingNode);
			if (typeof wasm.hwpx_edit_drawing_text_snapshot !== "function") throw new Error("HwpxDrawingTextSnapshotAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_drawing_text_snapshot(section, drawingNode)) throw memory.error();
				return decodeDrawingTextSnapshot(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		...typeof wasm.hwpx_edit_drawing_text_requested === "function" && typeof wasm.hwpx_edit_drawing_text_requested_max_nodes === "function" ? {
			drawingTextRequestedMaxNodes: wasm.hwpx_edit_drawing_text_requested_max_nodes(),
			drawingTextRequested(section, nodes) {
				ready();
				uint(section);
				const { requested, bytes } = drawingTextRequest(nodes, wasm.hwpx_edit_drawing_text_requested_max_nodes());
				return memory.withBytes(bytes, (ptr, size) => {
					try {
						if (!wasm.hwpx_edit_drawing_text_requested(section, ptr, size)) throw memory.error();
						return decodeDrawingTextRequested(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), requested);
					} finally {
						wasm.hwpx_edit_output_free();
					}
				});
			}
		} : {},
		drawingTextSnapshots(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_drawing_text_snapshots !== "function") throw new Error("HwpxDrawingTextSnapshotsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_drawing_text_snapshots(section)) throw memory.error();
				return decodeDrawingTextSnapshots(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		sectionFillBrushes(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_section_fill_brushes !== "function") throw new Error("HwpxFillBrushesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_section_fill_brushes(section)) throw memory.error();
				return decodeFillBrushes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		rectangleNodes(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_rectangle_nodes !== "function") throw new Error("HwpxRectangleNodesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_rectangle_nodes(section)) throw memory.error();
				const nodes = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
				if (!Array.isArray(nodes) || !nodes.every((n, i) => Number.isInteger(n) && n >= 0 && n <= 4294967295 && (i === 0 || n > nodes[i - 1]))) throw new Error("InvalidRectangleNodes");
				return nodes;
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		rectangleRenderingSource(section, rectangleNode) {
			ready();
			uint(section);
			uint(rectangleNode);
			if (typeof wasm.hwpx_edit_rectangle_rendering_source !== "function") throw new Error("HwpxRectangleRenderingSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_rectangle_rendering_source(section, rectangleNode)) throw memory.error();
				return decodeRectangleRenderingSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		rectangleRenderingSources(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_rectangle_rendering_sources !== "function") throw new Error("HwpxRectangleRenderingSourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_rectangle_rendering_sources(section)) throw memory.error();
				return decodeRectangleRenderingSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		ellipseSources(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_ellipse_sources !== "function") throw new Error("HwpxEllipseSourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_ellipse_sources(section)) throw memory.error();
				return decodeEllipseSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		curveGeometry(section, node) {
			ready();
			uint(section);
			uint(node);
			if (typeof wasm.hwpx_edit_curve_geometry !== "function") throw new Error("HwpxCurveGeometryAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_curve_geometry(section, node)) throw memory.error();
				const value = decodeCurveGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
				if (value.node !== node) throw new Error("CurveGeometryNodeMismatch");
				return value;
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		curveOwner(section, node) {
			ready();
			uint(section);
			uint(node);
			if (typeof wasm.hwpx_edit_curve_owner !== "function") throw new Error("HwpxCurveOwnerAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_curve_owner(section, node)) throw memory.error();
				const value = decodeCurveOwner(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
				if (value.node !== node) throw new Error("CurveOwnerNodeMismatch");
				return value;
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tabSources(section, paragraph) {
			ready();
			uint(section);
			uint(paragraph);
			if (typeof wasm.hwpx_edit_tab_sources !== "function") throw new Error("HwpxTabSourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_tab_sources(section, paragraph)) throw memory.error();
				const value = decodeTabSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
				if (value.section !== section || value.paragraph !== paragraph) throw new Error("TabSourcesParagraphMismatch");
				return value;
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tabDefinitions() {
			ready();
			if (typeof wasm.hwpx_edit_tab_definitions !== "function") throw new Error("HwpxTabDefinitionsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_tab_definitions()) throw memory.error();
				return decodeTabDefinitions(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		sectionTabSources() {
			ready();
			if (typeof wasm.hwpx_edit_section_tabs !== "function") throw new Error("HwpxSectionTabsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_section_tabs()) throw memory.error();
				return decodeSectionTabs(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		supportsCreatedCellSoftLineBreaks() {
			return typeof wasm.hwpx_edit_created_cell_soft_line_breaks === "function" && wasm.hwpx_edit_created_cell_soft_line_breaks() === 1;
		},
		tableCreationResources() {
			ready();
			if (typeof wasm.hwpx_edit_table_creation_resources !== "function") throw new Error("HwpxTableCreationResourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_creation_resources()) throw memory.error();
				return decodeTableCreationResources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		saveForDisplay() {
			ready();
			try {
				if (!(typeof wasm.hwpx_edit_save_for_display === "function" ? wasm.hwpx_edit_save_for_display : wasm.hwpx_edit_save)()) throw memory.error();
				return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		supportsTableInitialTexts() {
			ready();
			return typeof wasm.hwpx_edit_insert_table_with_texts === "function";
		},
		insertTable(section, paragraph, unit, options) {
			ready();
			[
				section,
				paragraph,
				unit
			].forEach(uint);
			if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("InvalidTableCreationOptions");
			const { rows, columns, width, rowHeight, resources } = options;
			if (!resources || typeof resources !== "object" || Array.isArray(resources)) throw new TypeError("InvalidTableCreationResources");
			const args = [
				rows,
				columns,
				width,
				rowHeight,
				resources.paragraph,
				resources.character,
				resources.style,
				resources.border_fill
			];
			args.forEach(uint);
			if (typeof wasm.hwpx_edit_insert_table !== "function") throw new Error("HwpxTableCreationAbiUnavailable");
			const withTexts = Object.hasOwn(options, "cellTexts");
			let request;
			if (withTexts) {
				if (typeof wasm.hwpx_edit_insert_table_with_texts !== "function") throw new Error("HwpxTableInitialTextsAbiUnavailable");
				request = encodeTableTextRequest({
					version: 1,
					section,
					paragraph,
					unit,
					rows,
					columns,
					width,
					row_height: rowHeight,
					resources: {
						paragraph: args[4],
						character: args[5],
						style: args[6],
						border_fill: args[7]
					},
					cell_texts: captureTableInitialTexts(rows, columns, options.cellTexts)
				});
			}
			try {
				if (!(withTexts ? memory.withBytes(request, (ptr, size) => wasm.hwpx_edit_insert_table_with_texts(ptr, size)) : wasm.hwpx_edit_insert_table(section, paragraph, unit, ...args))) throw memory.error();
				const identity = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len())));
				createdTableIdentity(identity);
				return identity;
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		createdTables(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_created_tables !== "function") throw new Error("HwpxCreatedTablesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_created_tables(section)) throw memory.error();
				return decodeCreatedTables(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		setCreatedCellText(section, identity, row, column, text) {
			ready();
			[
				section,
				row,
				column
			].forEach(uint);
			const id = createdTableIdentity(identity);
			const bytes = encodedText(text);
			if (typeof wasm.hwpx_edit_set_created_cell_text !== "function") throw new Error("HwpxCreatedCellTextAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_created_cell_text(section, Number(id & 4294967295n), Number(id >> 32n), row, column, ptr, size)) throw memory.error();
			});
		},
		containerSourceSnapshot(section, containerNode) {
			ready();
			uint(section);
			uint(containerNode);
			if (typeof wasm.hwpx_edit_container_source_snapshot !== "function") throw new Error("HwpxContainerSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_container_source_snapshot(section, containerNode)) throw memory.error();
				return decodeContainerSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		containerCaptionBindings(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_container_caption_bindings !== "function") throw new Error("HwpxContainerCaptionBindingsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_container_caption_bindings(section)) throw memory.error();
				return decodeCaptionBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), "container_node", "InvalidContainerCaptionBindings");
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		oleBytes(section, oleNode, { allowExternalPackagedCopy = false } = {}) {
			ready();
			uint(section);
			uint(oleNode);
			if (typeof allowExternalPackagedCopy !== "boolean") throw new Error("InvalidOleSourceOptions");
			if (typeof wasm.hwpx_edit_ole_bytes !== "function") throw new Error("HwpxOleBytesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_ole_bytes(section, oleNode, Number(allowExternalPackagedCopy))) throw memory.error();
				return decodeOleBytes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		oleSites(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_ole_sites !== "function") throw new Error("HwpxOleSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_ole_sites(section)) throw memory.error();
				return decodeOleSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		oleSource(section, oleNode) {
			ready();
			uint(section);
			uint(oleNode);
			if (typeof wasm.hwpx_edit_ole_source !== "function") throw new Error("HwpxOleSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_ole_source(section, oleNode)) throw memory.error();
				return decodeOleSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureSites(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_picture_sites !== "function") throw new Error("HwpxPictureSitesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_sites(section)) throw memory.error();
				return decodePictureSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureFlow(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_flow !== "function") throw new Error("HwpxPictureFlowAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_flow(section, pictureNode)) throw memory.error();
				return decodePictureFlow(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		picturePosition(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_position !== "function") throw new Error("HwpxPicturePositionAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_position(section, pictureNode)) throw memory.error();
				return decodePicturePosition(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureRenderingCorners(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_rendering_corners !== "function") throw new Error("HwpxPictureCornersAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_rendering_corners(section, pictureNode)) throw memory.error();
				return decodePictureRenderingCorners(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureOwner(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_owner !== "function") throw new Error("HwpxPictureOwnerAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_owner(section, pictureNode)) throw memory.error();
				return decodePictureOwner(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureOwners(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_picture_owners !== "function") throw new Error("HwpxPictureOwnersAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_owners(section)) throw memory.error();
				return decodePictureOwners(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		lineNodes(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_line_nodes !== "function") throw new Error("HwpxLineDisplayAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_line_nodes(section)) throw memory.error();
				return decodeLineNodes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		lineGeometry(section, node) {
			ready();
			uint(section);
			uint(node);
			if (typeof wasm.hwpx_edit_line_geometry !== "function") throw new Error("HwpxLineGeometryAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_line_geometry(section, node)) throw memory.error();
				return decodeLineGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		connectorNodes(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_connector_nodes !== "function") throw new Error("HwpxConnectorSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_connector_nodes(section)) throw memory.error();
				return decodeConnectorNodes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		connectorGeometrySource(section, node) {
			ready();
			uint(section);
			uint(node);
			if (typeof wasm.hwpx_edit_connector_geometry_source !== "function") throw new Error("HwpxConnectorSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_connector_geometry_source(section, node)) throw memory.error();
				return decodeConnectorSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		drawingStrokeSource(section, node) {
			ready();
			uint(section);
			uint(node);
			if (typeof wasm.hwpx_edit_drawing_stroke_source !== "function") throw new Error("HwpxDrawingStrokeSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_drawing_stroke_source(section, node)) throw memory.error();
				return decodeDrawingStrokeSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		connectorOwner(section, node) {
			ready();
			uint(section);
			uint(node);
			if (typeof wasm.hwpx_edit_connector_owner !== "function") throw new Error("HwpxConnectorOwnerAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_connector_owner(section, node)) throw memory.error();
				return decodeConnectorOwner(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		connectorRenderingSource(section, node) {
			ready();
			uint(section);
			uint(node);
			if (typeof wasm.hwpx_edit_connector_rendering_source !== "function") throw new Error("HwpxConnectorRenderingSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_connector_rendering_source(section, node)) throw memory.error();
				return decodeConnectorRenderingSource(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), node);
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		connectorPlacementSource(section, node) {
			ready();
			uint(section);
			uint(node);
			if (typeof wasm.hwpx_edit_connector_placement_source !== "function") throw new Error("HwpxConnectorPlacementSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_connector_placement_source(section, node)) throw memory.error();
				return {
					sourceOnly: true,
					...decodeDrawingPlacement(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), "InvalidConnectorPlacementSource")
				};
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pageSettings() {
			ready();
			if (typeof wasm.hwpx_edit_page_settings !== "function") throw new Error("HwpxPageSettingsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_page_settings()) throw memory.error();
				return decodePageSettings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		noteShapes() {
			ready();
			if (typeof wasm.hwpx_edit_note_shapes !== "function") throw new Error("HwpxNoteShapesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_note_shapes()) throw memory.error();
				return decodeNoteShapes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		paragraphFlow(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_paragraph_flow !== "function") throw new Error("HwpxParagraphFlowAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_paragraph_flow(section)) throw memory.error();
				return decodeParagraphFlow(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tablePagination(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_table_pagination !== "function") throw new Error("HwpxTablePaginationAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_pagination(section)) throw memory.error();
				return decodeTablePagination(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		...typeof wasm.hwpx_edit_line_display_batch === "function" && typeof wasm.hwpx_edit_line_display_batch_max_nodes === "function" ? {
			lineDisplayBatchMaxNodes: wasm.hwpx_edit_line_display_batch_max_nodes(),
			lineDisplayBatch(section, nodes) {
				ready();
				uint(section);
				const bytes = encodeLineDisplayNodes(nodes, wasm.hwpx_edit_line_display_batch_max_nodes());
				return memory.withBytes(bytes, (ptr, size) => {
					try {
						if (!wasm.hwpx_edit_line_display_batch(section, ptr, size)) throw memory.error();
						return decodeLineDisplayBatch(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), nodes);
					} finally {
						wasm.hwpx_edit_output_free();
					}
				});
			}
		} : {},
		...typeof wasm.hwpx_edit_table_border_sources_batch === "function" && typeof wasm.hwpx_edit_table_border_sources_batch_max_sections === "function" ? {
			tableBorderSourcesBatchMaxSections: wasm.hwpx_edit_table_border_sources_batch_max_sections(),
			tableBorderSourcesBatch(sections) {
				ready();
				const bytes = encodeTableBorderSections(sections, wasm.hwpx_edit_table_border_sources_batch_max_sections());
				return memory.withBytes(bytes, (ptr, size) => {
					try {
						if (!wasm.hwpx_edit_table_border_sources_batch(ptr, size)) throw memory.error();
						return decodeTableBorderBatch(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), sections);
					} finally {
						wasm.hwpx_edit_output_free();
					}
				});
			}
		} : {},
		tableBorderSources(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_table_border_sources !== "function") throw new Error("HwpxTableBorderSourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_border_sources(section)) throw memory.error();
				return decodeTableBorderSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tableGeometry(section, tableNode) {
			ready();
			uint(section);
			uint(tableNode);
			if (typeof wasm.hwpx_edit_table_geometry !== "function") throw new Error("HwpxTableGeometryAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_geometry(section, tableNode)) throw memory.error();
				return decodeTableGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		automaticNumberSources(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_automatic_number_sources !== "function") throw new Error("HwpxAutomaticNumberSourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_automatic_number_sources(section)) throw memory.error();
				return decodeAutomaticNumberSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		automaticNumberSites(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_automatic_number_sites !== "function") throw new Error("HwpxAutomaticNumberSitesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_automatic_number_sites(section)) throw memory.error();
				return decodeAutomaticNumberSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		noteReferenceSites(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_note_reference_sites !== "function") throw new Error("HwpxNoteReferenceSitesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_note_reference_sites(section)) throw memory.error();
				return decodeNoteReferenceSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		paragraphTextSnapshot(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_paragraph_text_snapshot !== "function") throw new Error("HwpxParagraphTextSnapshotAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_paragraph_text_snapshot(section)) throw memory.error();
				return decodeParagraphTextSnapshot(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		formulaFieldSources(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_formula_field_sources !== "function") throw new Error("HwpxFormulaFieldSourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_formula_field_sources(section)) throw memory.error();
				return decodeFormulaFieldSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tableCaptionBindings(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_table_caption_bindings !== "function") throw new Error("HwpxTableCaptionBindingsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_caption_bindings(section)) throw memory.error();
				return decodeTableCaptionBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tableCaption(section, tableNode) {
			ready();
			uint(section);
			uint(tableNode);
			if (typeof wasm.hwpx_edit_table_caption !== "function") throw new Error("HwpxTableCaptionAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_caption(section, tableNode)) throw memory.error();
				return decodeTableCaption(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureCaptionBindings(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_picture_caption_bindings !== "function") throw new Error("HwpxPictureCaptionBindingsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_caption_bindings(section)) throw memory.error();
				return decodeCaptionBindings(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), "picture_node", "InvalidPictureCaptionBindings");
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureCaption(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_caption !== "function") throw new Error("HwpxPictureCaptionAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_caption(section, pictureNode)) throw memory.error();
				return decodeTableCaption(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tableCellMargin(section, listNode) {
			ready();
			uint(section);
			uint(listNode);
			if (typeof wasm.hwpx_edit_table_cell_margin !== "function") throw new Error("HwpxTableCellMarginAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_cell_margin(section, listNode)) throw memory.error();
				return decodeTableCellMargin(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		formulaSources(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_formula_sources !== "function") throw new Error("HwpxFormulaSourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_formula_sources(section)) throw memory.error();
				return decodeFormulaSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		formulaCurrent(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_formula_current !== "function") throw new Error("HwpxFormulaCurrentAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_formula_current(section)) throw memory.error();
				return decodeFormulaSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()), { current: true });
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		linePlacement(section, lineNode) {
			ready();
			uint(section);
			uint(lineNode);
			if (typeof wasm.hwpx_edit_line_placement !== "function") throw new Error("HwpxLinePlacementAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_line_placement(section, lineNode)) throw memory.error();
				return decodeLinePlacement(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		lineDisplay(section, lineNode) {
			ready();
			uint(section);
			uint(lineNode);
			if (typeof wasm.hwpx_edit_line_display !== "function") throw new Error("HwpxLineDisplayAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_line_display(section, lineNode)) throw memory.error();
				return decodeLineDisplay(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		tableBackgroundBytes(section, listNode) {
			ready();
			uint(section);
			uint(listNode);
			if (typeof wasm.hwpx_edit_table_background_bytes !== "function") throw new Error("HwpxTableBackgroundBytesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_table_background_bytes(section, listNode)) throw memory.error();
				return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureBytes(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_bytes !== "function") throw new Error("HwpxPictureBytesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_bytes(section, pictureNode)) throw memory.error();
				return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureGeometry(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_geometry !== "function") throw new Error("HwpxPictureGeometryAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_geometry(section, pictureNode)) throw memory.error();
				return decodePictureGeometry(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureSizeProtection(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_size_protection !== "function") throw new Error("HwpxPictureSizeProtectionAbiUnavailable");
			const value = wasm.hwpx_edit_picture_size_protection(section, pictureNode);
			if (value === 3) throw memory.error();
			if (![
				0,
				1,
				2
			].includes(value)) throw new Error("InvalidPictureSizeProtection");
			return value === 0 ? null : value === 2;
		},
		pictureCrop(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_crop !== "function") throw new Error("HwpxPictureCropAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_crop(section, pictureNode)) throw memory.error();
				return decodePictureCrop(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pictureTransform(section, pictureNode) {
			ready();
			uint(section);
			uint(pictureNode);
			if (typeof wasm.hwpx_edit_picture_transform !== "function") throw new Error("HwpxPictureTransformAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_picture_transform(section, pictureNode)) throw memory.error();
				return decodePictureTransform(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		characterRanges(section, paragraph) {
			ready();
			uint(section);
			uint(paragraph);
			if (typeof wasm.hwpx_edit_character_ranges !== "function") throw new Error("HwpxCharacterRangesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_character_ranges(section, paragraph)) throw memory.error();
				return decodeCharacterRanges(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		anchorText(section, paragraph) {
			ready();
			uint(section);
			uint(paragraph);
			if (typeof wasm.hwpx_edit_anchor_text !== "function") throw new Error("HwpxAnchorEditAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_anchor_text(section, paragraph)) throw memory.error();
				return new TextDecoder("utf-8", {
					fatal: true,
					ignoreBOM: true
				}).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		spliceAnchored(section, paragraph, start, deleted, text) {
			ready();
			[
				section,
				paragraph,
				start,
				deleted
			].forEach(uint);
			if (typeof wasm.hwpx_edit_splice_anchored !== "function") throw new Error("HwpxAnchorEditAbiUnavailable");
			const bytes = encodedText(text);
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_splice_anchored(section, paragraph, start, deleted, ptr, size)) throw memory.error();
			});
		},
		spliceFieldLabel(section, paragraph, beginElement, start, deleted, text) {
			ready();
			[
				section,
				paragraph,
				beginElement,
				start,
				deleted
			].forEach(uint);
			if (typeof wasm.hwpx_edit_splice_field_label !== "function") throw new Error("HwpxFieldEditAbiUnavailable");
			const bytes = encodedText(text);
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_splice_field_label(section, paragraph, beginElement, start, deleted, ptr, size)) throw memory.error();
			});
		},
		setFormulaDefinition(section, beginElement, formula) {
			ready();
			[section, beginElement].forEach(uint);
			if (typeof wasm.hwpx_edit_set_formula_definition !== "function") throw new Error("HwpxFormulaEditAbiUnavailable");
			const bytes = encodedText(formula);
			if (bytes.length > 4096) throw new Error("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_formula_definition(section, beginElement, ptr, size)) throw memory.error();
			});
		},
		setManualFormulaResult(section, beginElement, display) {
			ready();
			[section, beginElement].forEach(uint);
			const bytes = manualFormulaResultBytes(display, "hwpx_edit_set_manual_formula_result", "HwpxManualFormulaResultAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_manual_formula_result(section, beginElement, ptr, size)) throw memory.error();
			});
		},
		spliceManualFormulaResult(section, beginElement, start, deleted, text) {
			ready();
			[
				section,
				beginElement,
				start,
				deleted
			].forEach(uint);
			const bytes = manualFormulaResultBytes(text, "hwpx_edit_splice_manual_formula_result", "HwpxManualFormulaResultSpliceAbiUnavailable");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_splice_manual_formula_result(section, beginElement, start, deleted, ptr, size)) throw memory.error();
			});
		},
		...createHwpxChartApi({
			wasm,
			memory,
			ready,
			uint,
			encodedText
		}),
		formSourceNodes(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_form_source_nodes !== "function") throw new Error("HwpxFormSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_form_source_nodes(section)) throw memory.error();
				return decodeFormSourceNodes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		inlineStringSources() {
			ready();
			if (typeof wasm.hwpx_edit_inline_string_sources !== "function") throw new Error("HwpxInlineStringSourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_inline_string_sources()) throw memory.error();
				return decodeInlineStringSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		dutmalText(section, node, kind) {
			ready();
			[section, node].forEach(uint);
			const selected = dutmalKind(kind);
			if (typeof wasm.hwpx_edit_dutmal_text !== "function") throw new Error("HwpxDutmalTextAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_dutmal_text(section, node, selected)) throw memory.error();
				return new TextDecoder("utf-8", {
					fatal: true,
					ignoreBOM: true
				}).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		equationScript(section, node) {
			ready();
			[section, node].forEach(uint);
			if (typeof wasm.hwpx_edit_equation_script !== "function") throw new Error("HwpxEquationScriptAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_equation_script(section, node)) throw memory.error();
				return new TextDecoder("utf-8", {
					fatal: true,
					ignoreBOM: true
				}).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		measureEquation(source, settings) {
			ready();
			return createEquationEngine(wasm).measure(source, settings);
		},
		equationStyles(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_equation_styles !== "function") throw new Error("HwpxEquationStylesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_equation_styles(section)) throw memory.error();
				return decodeEquationStyles(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		layoutEquation(source, settings, measurements, options) {
			ready();
			return createEquationEngine(wasm).layout(source, settings, measurements, options);
		},
		equationSources(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_equation_sources !== "function") throw new Error("HwpxEquationSourcesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_equation_sources(section)) throw memory.error();
				return decodeEquationSources(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		equationScripts(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_equation_scripts !== "function") throw new Error("HwpxEquationSnapshotAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_equation_scripts(section)) throw memory.error();
				return decodeEquationScripts(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		setEquationScript(section, node, value) {
			ready();
			[section, node].forEach(uint);
			if (typeof wasm.hwpx_edit_set_equation_script !== "function" || typeof wasm.hwpx_edit_equation_script_max_bytes !== "function") throw new Error("HwpxEquationScriptAbiUnavailable");
			const maxBytes = wasm.hwpx_edit_equation_script_max_bytes();
			if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295) throw new Error("InvalidEquationScriptLimit");
			const bytes = encodedText(value);
			if (bytes.length > maxBytes) throw new Error("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_equation_script(section, node, ptr, size)) throw memory.error();
			});
		},
		equationSites(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_equation_sites !== "function") throw new Error("HwpxEquationSitesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_equation_sites(section)) throw memory.error();
				return decodeEquationSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		dutmalSites(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_dutmal_sites !== "function") throw new Error("HwpxDutmalSitesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_dutmal_sites(section)) throw memory.error();
				return decodeDutmalSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		dutmalDisplayText(section, node) {
			ready();
			[section, node].forEach(uint);
			if (typeof wasm.hwpx_edit_dutmal_display_text !== "function") throw new Error("HwpxDutmalDisplayTextAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_dutmal_display_text(section, node)) throw memory.error();
				return new TextDecoder("utf-8", {
					fatal: true,
					ignoreBOM: true
				}).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		fieldLabelDisplayText(section, paragraph) {
			ready();
			[section, paragraph].forEach(uint);
			if (typeof wasm.hwpx_edit_field_label_display_text !== "function") throw new Error("HwpxFieldLabelDisplayTextAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_field_label_display_text(section, paragraph)) throw memory.error();
				return new TextDecoder("utf-8", {
					fatal: true,
					ignoreBOM: true
				}).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		setDutmalText(section, node, kind, value) {
			ready();
			[section, node].forEach(uint);
			const selected = dutmalKind(kind);
			if (typeof wasm.hwpx_edit_set_dutmal_text !== "function" || typeof wasm.hwpx_edit_dutmal_text_max_bytes !== "function") throw new Error("HwpxDutmalTextAbiUnavailable");
			const maxBytes = wasm.hwpx_edit_dutmal_text_max_bytes();
			if (!Number.isInteger(maxBytes) || maxBytes <= 0 || maxBytes > 4294967295) throw new Error("InvalidDutmalTextLimit");
			const bytes = encodedText(value);
			if (bytes.length > maxBytes) throw new Error("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_dutmal_text(section, node, selected, ptr, size)) throw memory.error();
			});
		},
		formSites(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_form_sites !== "function") throw new Error("HwpxFormSitesAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_form_sites(section)) throw memory.error();
				return decodeFormSites(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		formSourceAttributes(section, formNode) {
			ready();
			[section, formNode].forEach(uint);
			if (typeof wasm.hwpx_edit_form_source_attributes !== "function") throw new Error("HwpxFormSourceAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_form_source_attributes(section, formNode)) throw memory.error();
				return decodeFormSourceAttributes(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		checkBoxState(section, formNode) {
			ready();
			[section, formNode].forEach(uint);
			if (typeof wasm.hwpx_edit_checkbox_state !== "function") throw new Error("HwpxCheckBoxStateAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_checkbox_state(section, formNode)) throw memory.error();
				return new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		formSourceLayout(section, formNode) {
			ready();
			[section, formNode].forEach(uint);
			if (typeof wasm.hwpx_edit_form_source_layout !== "function") throw new Error("HwpxFormLayoutAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_form_source_layout(section, formNode)) throw memory.error();
				return decodeFormSourceLayout(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		setCheckBoxState(section, formNode, state) {
			ready();
			[section, formNode].forEach(uint);
			if (typeof wasm.hwpx_edit_set_checkbox_state !== "function") throw new Error("HwpxCheckBoxStateAbiUnavailable");
			const bytes = encodedText(state);
			if (bytes.length > 32) throw new RangeError("LimitExceeded");
			memory.withBytes(bytes, (ptr, size) => {
				if (!wasm.hwpx_edit_set_checkbox_state(section, formNode, ptr, size)) throw memory.error();
			});
		},
		fieldLabels,
		manualFormulaResultDisplaySnapshot(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_manual_formula_result_display_snapshot !== "function") throw new Error("HwpxFormulaResultSnapshotAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_manual_formula_result_display_snapshot(section)) throw memory.error();
				return decodeFormulaResultDisplaySnapshot(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		pageAreaDeclarations(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_page_area_declarations !== "function") throw new Error("HwpxPageAreaDeclarationsAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_page_area_declarations(section)) throw memory.error();
				return decodePageAreaDeclarations(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		manualFormulaResultParagraphs(section) {
			ready();
			uint(section);
			if (typeof wasm.hwpx_edit_manual_formula_result_paragraphs !== "function") throw new Error("HwpxManualFormulaResultParagraphAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_manual_formula_result_paragraphs(section)) throw memory.error();
				return decodeFormulaResultParagraphs(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		manualFormulaResultTargets(section, paragraph) {
			ready();
			[section, paragraph].forEach(uint);
			if (typeof wasm.hwpx_edit_manual_formula_result_targets !== "function") throw new Error("HwpxManualFormulaResultTargetAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_manual_formula_result_targets(section, paragraph)) throw memory.error();
				return decodeFieldTargets(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		manualFormulaResultDisplayText(section, paragraph) {
			ready();
			[section, paragraph].forEach(uint);
			if (typeof wasm.hwpx_edit_manual_formula_result_display_text !== "function") throw new Error("HwpxManualFormulaResultTargetAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_manual_formula_result_display_text(section, paragraph)) throw memory.error();
				return new TextDecoder("utf-8", { fatal: true }).decode(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		manualFormulaResultRangeTarget(section, paragraph, start, end) {
			ready();
			[
				section,
				paragraph,
				start,
				end
			].forEach(uint);
			if (end < start) throw new Error("InvalidTextPosition");
			if (typeof wasm.hwpx_edit_manual_formula_result_range_target !== "function") throw new Error("HwpxManualFormulaResultTargetAbiUnavailable");
			try {
				if (!wasm.hwpx_edit_manual_formula_result_range_target(section, paragraph, start, end)) throw memory.error();
				const targets = decodeFieldTargets(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
				if (targets.length > 1) throw new Error("InvalidFieldTargets");
				return targets[0] ?? null;
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		fieldRangeTarget(section, paragraph, start, end) {
			ready();
			[
				section,
				paragraph,
				start,
				end
			].forEach(uint);
			if (end < start) throw new Error("InvalidTextPosition");
			if (typeof wasm.hwpx_edit_field_range_target !== "function") {
				const targets = fieldLabels(section, paragraph).filter((t) => start >= t.start && end <= t.end);
				if (targets.length > 1) throw new Error("UnsupportedFieldLabelRange");
				return targets[0] ?? null;
			}
			try {
				if (!wasm.hwpx_edit_field_range_target(section, paragraph, start, end)) throw memory.error();
				const targets = decodeFieldTargets(memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len()));
				if (targets.length > 1) throw new Error("InvalidFieldTargets");
				return targets[0] ?? null;
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		save() {
			ready();
			try {
				if (!wasm.hwpx_edit_save()) throw memory.error();
				return memory.copy(wasm.hwpx_edit_output_ptr(), wasm.hwpx_edit_output_len());
			} finally {
				wasm.hwpx_edit_output_free();
			}
		},
		close() {
			if (!closed) wasm.hwpx_edit_close();
			closed = true;
		}
	};
}
var init_hwpx_editor = __esmMin((() => {
	init_cell_diagonal_command();
	init_cell_border_patch_command();
	init_cell_style_command();
	init_cell_fill_command();
	init_atomic_formatting_api();
	init_hwpx_drawing_text_requested();
	init_hwpx_line_display_batch();
	init_hwpx_table_border_batch();
	init_wasm_memory();
	init_table_initial_texts();
	init_hwpx_table_border_sources();
	init_hwpx_curve_geometry();
	init_hwpx_curve_owner();
	init_hwpx_tab_sources();
	init_hwpx_tab_definitions();
	init_hwpx_section_tabs();
	init_cell_size_batch();
	init_cell_border_batch();
	init_cell_appearance_command();
	init_cell_background_command();
	init_cell_border_command();
	init_character_font_metrics();
	init_equation_engine();
	init_hwpx_equation_styles();
	init_hwpx_chart_api();
	init_hwpx_picture_owners();
	init_hwpx_inline_string_sources();
	init_hwpx_dutmal_kind();
	init_hwpx_dutmal_sites();
	init_hwpx_equation_sources();
	init_hwpx_equation_scripts();
	init_hwpx_equation_sites();
	init_hwpx_field_target_wire();
	init_formula_result_paragraphs();
	init_formula_result_display_snapshot();
	init_hwpx_page_area_declarations();
	init_hwpx_created_tables();
	init_table_creation_resources();
	init_created_table_identity();
	init_hwpx_form_source();
	init_character_effects();
	init_character_effect_args();
	init_character_outline_args();
	init_character_outlines();
	init_paragraph_spacing_args();
	init_character_property_args();
	init_character_range_batch();
	init_paragraph_replacement();
	init_character_underline_args();
	init_character_color_args();
	init_character_shade_args();
	init_character_shades();
	init_character_font_args();
	init_character_font_name_args();
	init_named_font_text_args();
	init_text_transaction_args();
	init_character_underlines();
	init_character_strikes();
	init_character_strike_styles();
	init_hwpx_document_provenance();
	init_character_text_colors();
	init_font_faces();
	init_hwpx_font_face_metadata();
	init_character_font_references();
	init_character_underline_styles();
	init_hwpx_paragraph_shapes();
	init_table_bindings_wire();
	init_table_placements_wire();
	init_hwpx_drawing_text_bindings();
	init_hwpx_drawing_text_snapshot();
	init_hwpx_drawing_text_snapshots();
	init_hwpx_container_source();
	init_hwpx_rectangle_rendering_source();
	init_hwpx_rectangle_rendering_sources();
	init_hwpx_ellipse_sources();
	init_hwpx_fill_brushes();
	init_hwpx_picture_sites_wire();
	init_hwpx_ole_source();
	init_hwpx_picture_owner_wire();
	init_hwpx_picture_corners_wire();
	init_hwpx_picture_position_wire();
	init_hwpx_picture_flow_wire();
	init_hwpx_picture_geometry_wire();
	init_hwpx_line_display_wire();
	init_hwpx_connector_source();
	init_hwpx_drawing_stroke_source();
	init_hwpx_line_geometry();
	init_hwpx_drawing_placement_wire();
	init_hwpx_page_settings();
	init_hwpx_note_shapes();
	init_hwpx_table_pagination();
	init_hwpx_table_geometry();
	init_hwpx_table_caption();
	init_hwpx_table_caption_bindings();
	init_caption_bindings_wire();
	init_hwpx_automatic_number_sites();
	init_hwpx_automatic_number_sources();
	init_hwpx_note_reference_sites();
	init_hwpx_paragraph_text_snapshot();
	init_hwpx_formula_field_sources();
	init_hwpx_table_cell_margin();
	init_hwpx_formula_sources();
	init_hwpx_picture_crop_wire();
	init_hwpx_picture_transform_wire();
	init_hwpx_character_shapes_wire();
	init_abi();
	init_paragraph_break_api();
	init_input();
	init_editor_history();
	init_paragraph_margin_args();
}));
// src/literal-match.ts
function validateLiteral(value, { empty = false } = {}) {
	if (typeof value !== "string" || !value.isWellFormed()) throw new TypeError("InvalidLiteralText");
	if (!empty && value.length === 0) throw new Error("EmptySearchText");
	if (value.length > MAX_LITERAL_BYTES || encoder$3.encode(value).byteLength > MAX_LITERAL_BYTES) throw new RangeError("LiteralLimitExceeded");
	if (/[\u0000-\u001f\u0085\u2028\u2029]/u.test(value)) throw new Error("SingleParagraphTextRequired");
	return value;
}
function findUniqueLiteral(text, inputLiteral) {
	const literal = validateLiteral(inputLiteral);
	if (typeof text !== "string" || !text.isWellFormed()) throw new TypeError("InvalidNativeText");
	if (text.length > 33554432) throw new RangeError("DecodedTextLimitExceeded");
	const prefix = new Uint32Array(literal.length);
	for (let i = 1, j = 0; i < literal.length; i++) {
		while (j && literal[i] !== literal[j]) j = prefix[j - 1];
		if (literal[i] === literal[j]) j++;
		prefix[i] = j;
	}
	let found = -1;
	for (let i = 0, j = 0; i < text.length; i++) {
		while (j && text[i] !== literal[j]) j = prefix[j - 1];
		if (text[i] === literal[j]) j++;
		if (j === literal.length) {
			if (found !== -1) throw new Error("AmbiguousLiteralText");
			found = i + 1 - j;
			j = prefix[j - 1];
		}
	}
	if (found === -1) throw new Error("LiteralTextNotFound");
	return found;
}
var MAX_LITERAL_BYTES, encoder$3;
var init_literal_match = __esmMin((() => {
	MAX_LITERAL_BYTES = 4194304;
	encoder$3 = new TextEncoder();
}));
// src/model/common.ts
function call(sdk, method, args, warnings, source) {
	try {
		const getter = Reflect.get(sdk, method);
		if (typeof getter !== "function") throw new Error(`${method}Unavailable`);
		return {
			ok: true,
			value: Reflect.apply(getter, sdk, args)
		};
	} catch (error) {
		const message = error !== null && (typeof error === "object" || typeof error === "function") ? Reflect.get(error, "message") ?? "UnknownError" : "UnknownError";
		warnings.push(diagnostic("ObservationUnavailable", `${method}: ${message}`, source));
		return {
			ok: false,
			value: null
		};
	}
}
function array(result, warnings, name, source) {
	if (result.ok && Array.isArray(result.value) && result.value.length <= LIMITS$1.maxBlocks) return result.value;
	if (result.ok) warnings.push(diagnostic("InvalidObservation", name, source));
	result.ok = false;
	return [];
}
function unique(rows, key, warnings, name) {
	const map = /* @__PURE__ */ new Map();
	for (const row of rows) {
		const id = key(row);
		if (map.has(id)) {
			map.set(id, null);
			warnings.push(diagnostic("AmbiguousSourceIdentity", name));
		} else map.set(id, row);
	}
	return map;
}
var LIMITS$1, uint$4, diagnostic;
var init_common$1 = __esmMin((() => {
	LIMITS$1 = Object.freeze({
		maxDepth: 32,
		maxBlocks: 2e5,
		maxTextUnits: 4194304
	});
	uint$4 = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4294967295;
	diagnostic = (code, message, source) => ({
		code,
		message: String(message).slice(0, 512),
		...source ? { source: { ...source } } : {}
	});
}));
// src/model/hwp5.ts
function collectHwp5({ sdk, sectionCount }) {
	const warnings = [], sections = [];
	const preview = call(sdk, "currentTextPreview", [], warnings);
	const previewSections = unique(array({
		ok: preview.ok,
		value: preview.value?.sections
	}, warnings, "currentTextPreview.sections"), (row) => row.index, warnings, "preview section");
	for (let section = 0; section < sectionCount; section++) {
		const source = { section };
		const get = (name) => call(sdk, name, [section], warnings, source);
		const flowResult = get("paragraphFlow"), flows = array(flowResult, warnings, "paragraphFlow", source);
		const flowMap = unique(flows, (r) => r.paragraph, warnings, "paragraphFlow");
		const countResult = get("paragraphCount");
		const count = countResult.ok && uint$4(countResult.value) && countResult.value <= 1e5 ? countResult.value : null;
		const previewRows = previewSections.get(section)?.paragraphs;
		const paragraphs = [], objectTokens = [];
		let objectTokensKnown = count !== null && preview.ok && Array.isArray(previewRows) && previewRows.length === count;
		const ordinals = count !== null ? Array.from({ length: count }, (_, ordinal) => ordinal) : [...new Set(flows.map((row) => row.paragraph))];
		for (const paragraph of ordinals) {
			const p = previewRows?.[paragraph], flow = flowMap.get(paragraph);
			const node = uint$4(flow?.source_node) ? flow.source_node : uint$4(p?.nodeIndex) ? p.nodeIndex : null;
			const emptyParagraph = p?.textPresent === false && p.text === "" && uint$4(p.nodeIndex) && uint$4(p.declaredUnits) && p.declaredUnits <= 1 && Array.isArray(p.tokens) && p.tokens.length === 0;
			let displayText = typeof p?.text === "string" && (p.textPresent === true || emptyParagraph) ? p.text : null;
			let identityKnown = uint$4(node) && flow?.generated !== true;
			if (uint$4(p?.nodeIndex) && uint$4(flow?.source_node) && p.nodeIndex !== flow.source_node) {
				identityKnown = false;
				displayText = null;
				warnings.push(diagnostic("ParagraphSourceMismatch", "Native source identities disagree", {
					section,
					paragraph
				}));
			}
			paragraphs.push({
				paragraph,
				node,
				identityKnown,
				displayText,
				flow: flow ?? null
			});
			if (!Array.isArray(p?.tokens)) objectTokensKnown = false;
			else for (const token of p.tokens) {
				if (token?.type !== "control" || token.code !== 11) continue;
				if (!uint$4(token.startUnit)) {
					objectTokensKnown = false;
					continue;
				}
				objectTokens.push({
					paragraph,
					anchorUnit: token.startUnit,
					identityKnown
				});
			}
		}
		const bindings = get("tableBindings"), placements = get("tablePlacements"), tableInventory = get("tableLayoutSources"), cellInventory = get("cellLayoutSources"), areas = get("pageAreaSources");
		for (const [name, result] of Object.entries({
			bindings,
			placements,
			tableInventory,
			cellInventory,
			areas
		})) array(result, warnings, name, source);
		const anchors = get("tableAnchors"), drawingSources = get("drawingSources"), drawingAnchors = get("drawingAnchors");
		const pictureResult = call(sdk, "pictureSources", [section, "base73"], warnings, source);
		const drawByComponent = unique(array(drawingSources, warnings, "drawingSources", source), (r) => r.component_node, warnings, "drawing component");
		const anchorByComponent = unique(array(drawingAnchors, warnings, "drawingAnchors", source), (r) => r.component_node, warnings, "drawing anchor");
		const pictures = array(pictureResult, warnings, "pictureSources", source).map((row) => {
			const draw = drawByComponent.get(row.component_node), anchor = anchorByComponent.get(row.component_node);
			const owner = draw?.control_node === row.owner_node && anchor?.control_node === row.owner_node;
			return {
				inventorySiteKnown: uint$4(row.component_node) && uint$4(row.picture_node) && uint$4(row.owner_node) && uint$4(row.bin_data_id) && row.bin_data_id > 0,
				pictureNode: row.component_node,
				parentParagraph: owner && uint$4(anchor?.paragraph) ? anchor.paragraph : null,
				sourceInfo: {
					section,
					pictureNode: row.component_node,
					recordNode: row.picture_node,
					componentNode: row.component_node,
					ownerNode: row.owner_node,
					resourceId: row.bin_data_id
				},
				width: owner && uint$4(draw?.width) ? draw.width : null,
				height: owner && uint$4(draw?.height) ? draw.height : null,
				reason: owner ? null : "PictureOwnerUnverified"
			};
		});
		const representedPictures = new Set(pictures.map((row) => row.pictureNode));
		let fallbackPictures = 0;
		for (const draw of drawByComponent.values()) {
			if (draw?.kind_id !== 611346787 || representedPictures.has(draw.component_node)) continue;
			const anchor = anchorByComponent.get(draw.component_node);
			const ownerKnown = anchor?.control_node === draw.control_node && uint$4(anchor?.paragraph);
			pictures.push({
				inventorySiteKnown: false,
				pictureNode: draw.component_node,
				parentParagraph: ownerKnown ? anchor.paragraph : null,
				sourceInfo: {
					section,
					pictureNode: draw.component_node,
					componentNode: draw.component_node,
					ownerNode: draw.control_node
				},
				width: uint$4(draw?.width) ? draw.width : null,
				height: uint$4(draw?.height) ? draw.height : null,
				reason: "PictureSourceUnobserved"
			});
			representedPictures.add(draw.component_node);
			fallbackPictures++;
			warnings.push(diagnostic("PictureSourceUnobserved", "Native drawing proves an image exists, but its picture profile metadata is unavailable", { section }));
		}
		const objects = [];
		const componentsResult = get("drawingComponentSources");
		const components = unique(array(componentsResult, warnings, "drawingComponentSources", source), (r) => r.component_node, warnings, "drawing component inventory");
		let componentsKnown = componentsResult.ok;
		for (const row of components.values()) {
			if (!row || !uint$4(row.component_node) || !uint$4(row.kind_id) || !uint$4(row.owner_node)) {
				componentsKnown = false;
				continue;
			}
			if (row.kind_id === 611346787) {
				if (!representedPictures.has(row.component_node)) {
					representedPictures.add(row.component_node);
					pictures.push({
						pictureNode: row.component_node,
						inventorySiteKnown: false,
						parentParagraph: null,
						sourceInfo: {
							section,
							pictureNode: row.component_node,
							componentNode: row.component_node,
							ownerNode: row.owner_node
						},
						reason: "PictureSourceUnobserved"
					});
					fallbackPictures++;
				}
				continue;
			}
			const drawing = drawByComponent.get(row.component_node), anchor = anchorByComponent.get(row.component_node);
			const ownerKnown = drawing && anchor && drawing.control_node === anchor.control_node && drawing.control_node === row.owner_node;
			objects.push({
				kind: "drawing",
				node: row.component_node,
				siteKnown: true,
				parentParagraph: ownerKnown && uint$4(anchor?.paragraph) ? anchor.paragraph : null,
				parentObjectNode: components.get(row.owner_node)?.kind_id === 610496366 ? row.owner_node : null,
				nativeKind: row.kind_id,
				reason: ownerKnown ? "ObjectDetailsDeferred" : "ObjectOwnerUnverified"
			});
		}
		const knownAnchors = /* @__PURE__ */ new Set();
		let anchorsKnown = anchors.ok && drawingAnchors.ok;
		for (const row of [...array(anchors, warnings, "tableAnchors", source), ...array(drawingAnchors, warnings, "drawingAnchors", source)]) {
			if (!uint$4(row?.paragraph) || !uint$4(row?.current_unit)) {
				anchorsKnown = false;
				continue;
			}
			knownAnchors.add(`${row.paragraph}:${row.current_unit}`);
		}
		const tokenCounts = /* @__PURE__ */ new Map();
		for (const token of objectTokens) {
			const key = `${token.paragraph}:${token.anchorUnit}`;
			tokenCounts.set(key, (tokenCounts.get(key) ?? 0) + 1);
		}
		const seenTokens = /* @__PURE__ */ new Set();
		for (const token of objectTokens) {
			const key = `${token.paragraph}:${token.anchorUnit}`;
			if (seenTokens.has(key)) {
				objectTokensKnown = false;
				continue;
			}
			seenTokens.add(key);
			const located = anchorsKnown && token.identityKnown && tokenCounts.get(key) === 1;
			if (located && knownAnchors.has(key)) continue;
			objects.push({
				kind: "unknown",
				node: null,
				siteKnown: false,
				parentParagraph: located ? token.paragraph : null,
				paragraph: token.paragraph,
				anchorUnit: token.anchorUnit,
				reason: located ? "UnclassifiedExtendedObject" : "ObjectAnchorInventoryUnavailable"
			});
		}
		sections.push({
			section,
			paragraphs,
			paragraphTotal: count,
			flowsKnown: flowResult.ok,
			bindings,
			placements,
			tableInventory,
			cellInventory,
			areas,
			anchors,
			pictures,
			picturesKnown: pictureResult.ok && fallbackPictures === 0,
			objects,
			objectsKnown: componentsKnown && objectTokensKnown && anchorsKnown,
			objectInventoryScope: "hwp5-drawing-components-and-typed-code11-signals",
			format: "hwp5"
		});
	}
	return {
		sections,
		warnings
	};
}
var init_hwp5 = __esmMin((() => {
	init_common$1();
}));
// src/model/hwpx.ts
function collectHwpx({ sdk, sectionCount }) {
	const warnings = [], sections = [];
	for (let section = 0; section < sectionCount; section++) {
		const source = { section }, get = (name) => call(sdk, name, [section], warnings, source);
		const flowResult = get("paragraphFlow"), flows = array(flowResult, warnings, "paragraphFlow", source), flowMap = unique(flows, (r) => r.paragraph, warnings, "paragraphFlow");
		const snapshot = get("paragraphTextSnapshot"), rows = array(snapshot, warnings, "paragraphTextSnapshot", source);
		const observedRows = rows.slice();
		const observedIds = new Set(rows.map((row) => row.paragraph));
		for (const flow of flows) if (!observedIds.has(flow.paragraph)) {
			observedRows.push({ paragraph: flow.paragraph });
			observedIds.add(flow.paragraph);
		}
		const paragraphs = observedRows.map((row) => {
			const flow = flowMap.get(row.paragraph);
			return {
				paragraph: row.paragraph,
				node: uint$4(flow?.source_node) ? flow.source_node : null,
				identityKnown: uint$4(flow?.source_node),
				displayText: typeof row.text === "string" ? row.text : null,
				flow: flow ?? null
			};
		});
		const bindings = get("tableBindings"), placements = get("tablePlacements"), tableInventory = get("tableBorderSources"), areas = get("pageAreaDeclarations");
		for (const [name, result] of Object.entries({
			bindings,
			placements,
			areas
		})) array(result, warnings, name, source);
		if (tableInventory.ok && (!tableInventory.value || !Array.isArray(tableInventory.value.cells))) {
			warnings.push({
				code: "InvalidObservation",
				message: "tableBorderSources",
				source
			});
			tableInventory.ok = false;
		}
		const sitesResult = get("pictureSites"), ownersResult = get("pictureOwners");
		const owners = unique(array(ownersResult, warnings, "pictureOwners", source), (row) => row.pictureNode, warnings, "picture owner");
		const sites = array(sitesResult, warnings, "pictureSites", source).slice();
		const inventoryPictures = new Set(sites.filter((row) => uint$4(row?.pictureNode)).map((row) => row.pictureNode));
		const seenPictures = new Set(sites.map((row) => row.pictureNode));
		for (const owner of owners.values()) if (owner && !seenPictures.has(owner.pictureNode)) {
			sites.push({
				pictureNode: owner.pictureNode,
				paragraph: owner.owner?.paragraph ?? null
			});
			seenPictures.add(owner.pictureNode);
		}
		const pictures = sites.map((row) => {
			const owner = owners.get(row.pictureNode), proof = owner?.owner;
			const parentParagraph = proof && row.paragraph === proof.paragraph ? proof.paragraph : null;
			return {
				inventorySiteKnown: inventoryPictures.has(row.pictureNode),
				pictureNode: row.pictureNode,
				parentParagraph,
				sourceInfo: {
					section,
					pictureNode: row.pictureNode
				},
				width: null,
				height: null,
				reason: uint$4(parentParagraph) ? null : owner?.error ?? "PictureOwnerUnverified"
			};
		});
		const objects = /* @__PURE__ */ new Map();
		let objectsKnown = true;
		const addObject = (row) => {
			if (!uint$4(row.node)) {
				objectsKnown = false;
				return;
			}
			const previous = objects.get(row.node);
			if (previous && previous.kind !== row.kind) throw new Error("ConflictingObjectKind");
			if (!previous) objects.set(row.node, {
				...row,
				node: row.node,
				siteKnown: true
			});
		};
		const inventory = (method) => {
			const result = get(method);
			const rows = array(result, warnings, method, source);
			objectsKnown &&= result.ok;
			return rows;
		};
		for (const row of inventory("chartSites")) addObject({
			kind: "chart",
			node: row?.wrapper,
			parentParagraph: row?.error_name === null && uint$4(row?.paragraph) && uint$4(row?.anchorUnit) ? row.paragraph : null,
			detailUnavailable: row?.error_name !== null,
			reason: row?.error_name ?? "ObjectDetailsDeferred"
		});
		for (const row of inventory("equationSites")) addObject({
			kind: "equation",
			node: row?.source?.node,
			parentParagraph: row?.source?.issue === null && row?.error_name === null && uint$4(row?.paragraph) ? row.paragraph : null,
			detailUnavailable: row?.source?.issue !== null || row?.error_name !== null,
			reason: row?.source?.issue ?? row?.error_name ?? "ObjectDetailsDeferred"
		});
		for (const row of inventory("oleSites")) addObject({
			kind: "ole",
			node: row?.ole_node,
			parentParagraph: row?.error_name === null && uint$4(row?.paragraph) ? row.paragraph : null,
			detailUnavailable: row?.error_name !== null,
			reason: row?.error_name ?? "ObjectDetailsDeferred"
		});
		for (const method of [
			"rectangleNodes",
			"lineNodes",
			"connectorNodes"
		]) for (const node of inventory(method)) addObject({
			kind: "drawing",
			node,
			parentParagraph: null,
			subtype: method,
			reason: "ObjectOwnerUnverified"
		});
		for (const row of inventory("ellipseSources")) addObject({
			kind: "drawing",
			node: row?.node,
			parentParagraph: uint$4(row?.owner?.paragraph) ? row.owner.paragraph : null,
			subtype: "ellipse",
			reason: "ObjectDetailsDeferred"
		});
		for (const row of inventory("drawingTextBindings")) addObject({
			kind: "drawing",
			node: row?.drawingNode,
			parentParagraph: null,
			subtype: "text-bearing",
			reason: "ObjectOwnerUnverified"
		});
		sections.push({
			section,
			paragraphs,
			paragraphTotal: snapshot.ok && observedRows.length === rows.length ? rows.length : null,
			flowsKnown: flowResult.ok,
			bindings,
			placements,
			tableInventory,
			cellInventory: null,
			areas,
			pictures,
			picturesKnown: sitesResult.ok && ownersResult.ok,
			objects: [...objects.values()],
			objectsKnown,
			objectInventoryScope: "hwpx-chart-equation-ole-and-supported-drawing-sites",
			format: "hwpx"
		});
	}
	return {
		sections,
		warnings
	};
}
var init_hwpx = __esmMin((() => {
	init_common$1();
}));
// src/model/project.ts
/** 소유자가 분리된 읽기 투영이며 부모 식별자는 실제 관측에서만 가져옵니다. */
function project({ format, sourceSha256, observations }, limits = LIMITS$1) {
	const warnings = observations.warnings.map((w) => ({
		...w,
		...w.source ? { source: { ...w.source } } : {}
	}));
	const model = {
		version: 1,
		format,
		sourceSha256,
		coordinates: {
			sectionBase: 0,
			paragraphBase: format === "hwp5" ? 0 : 1,
			paragraphScope: format === "hwp5" ? "section" : "document",
			textUnit: "native-utf16"
		},
		sections: [],
		unplaced: [],
		warnings,
		coverage: {
			paragraphTotal: 0,
			observedParagraphs: 0,
			placed: 0,
			unplaced: 0,
			unknownBlocks: 0,
			unreadableSections: 0,
			pageAreasKnown: true,
			imagesKnown: true,
			pageAreaInheritanceKnown: false,
			tablesWithCompleteCellInventory: 0,
			inventoryComplete: true,
			objectsKnown: true,
			objectInventoryComplete: false,
			objectInventoryScope: "supported-native-inventories-only",
			objectTotal: 0,
			objectsPlaced: 0,
			objectsUnplaced: 0
		}
	};
	const nodes = /* @__PURE__ */ new Map(), children = /* @__PURE__ */ new Map(), paragraphs = /* @__PURE__ */ new Map();
	let blockCount = 0, textUnits = 0;
	const warn = (code, message, source) => warnings.push(diagnostic(code, message, source));
	const add = (node) => {
		if (nodes.has(node.id)) throw new Error("DuplicateModelIdentity");
		if (++blockCount > limits.maxBlocks) throw new RangeError("ModelBlockLimitExceeded");
		nodes.set(node.id, node);
		return node;
	};
	const unknown = (id, kind, code, source) => ({
		id,
		type: "unknown",
		kind,
		diagnostic: diagnostic(code, code, source),
		...source ? { source: { ...source } } : {},
		editability: "unknown"
	});
	const collection = () => ({
		declarations: "known",
		definitions: [],
		inheritance: { state: "unresolved" }
	});
	for (const observation of observations.sections) {
		const s = observation.section, source = { section: s }, section = {
			id: `s${s}`,
			source,
			header: collection(),
			body: [],
			footer: collection()
		};
		model.sections.push(section);
		const body = add({
			id: `@s${s}:body`,
			root: true,
			target: section.body,
			kind: "root"
		});
		const byOrdinal = /* @__PURE__ */ new Map(), defs = /* @__PURE__ */ new Map(), byTable = /* @__PURE__ */ new Map(), cells = /* @__PURE__ */ new Map(), cellOwners = /* @__PURE__ */ new Map(), paragraphSources = /* @__PURE__ */ new Set();
		const placementMap = unique(list(observation.placements), (r) => r.tableNode, warnings, "table placement");
		const bindings = list(observation.bindings), paragraphBindings = unique(bindings, (r) => r.paragraph, warnings, "paragraph cell binding");
		if (!observation.flowsKnown) warn("ParagraphOwnershipUnavailable", "Native paragraph ownership unavailable", source);
		if (observation.paragraphTotal === null) {
			model.coverage.paragraphTotal = null;
			model.coverage.inventoryComplete = false;
			model.coverage.unreadableSections++;
			section.body.push(unknown(`s${s}:unreadable`, "section", "SectionTextUnavailable", source));
			model.coverage.unknownBlocks++;
		} else if (model.coverage.paragraphTotal !== null) model.coverage.paragraphTotal += observation.paragraphTotal;
		if ([
			observation.bindings,
			observation.placements,
			observation.tableInventory,
			...format === "hwp5" ? [observation.cellInventory] : []
		].some((result) => !result?.ok)) {
			model.coverage.inventoryComplete = false;
			section.body.push(unknown(`s${s}:inventory`, "table-inventory", "TableInventoryUnavailable", source));
			model.coverage.unknownBlocks++;
			warn("TableInventoryUnavailable", "Table ownership or cell inventory unavailable", source);
		}
		if (!observation.flowsKnown || !observation.areas?.ok || !observation.picturesKnown) model.coverage.inventoryComplete = false;
		function definition(kind, owner, listNode, apply, declaredParagraphs, declaration) {
			if (!uint$4(owner) || !uint$4(listNode)) throw new Error("InvalidPageAreaIdentity");
			const key = `${owner}:${listNode}`;
			const existing = defs.get(key);
			if (existing) {
				if (existing.block.kind !== kind || existing.block.apply !== apply) throw new Error("AmbiguousPageAreaDefinition");
				return existing;
			}
			const block = {
				id: `s${s}:${kind}:n${owner}:l${listNode}`,
				kind,
				source: {
					section: s,
					ownerNode: owner,
					listNode,
					...declaration ? declaration : {}
				},
				apply,
				range: { state: "unresolved" },
				blocks: [],
				observedParagraphs: 0,
				...uint$4(declaredParagraphs) ? { declaredParagraphs } : {}
			};
			section[kind].definitions.push(block);
			const node = add({
				id: block.id,
				root: true,
				target: block.blocks,
				block,
				kind: "area"
			});
			defs.set(key, node);
			return node;
		}
		if (!known(observation.areas)) {
			section.header.declarations = section.footer.declarations = "unavailable";
			model.coverage.pageAreasKnown = false;
		} else if (format === "hwp5") for (const area of list(observation.areas)) {
			if (!isPageArea(area.kind) || !uint$4(area.owner_node) || !uint$4(area.list_node)) throw new Error("InvalidPageAreaObservation");
			const apply = uint$4(area.control_attributes) ? [
				"both",
				"even",
				"odd"
			][area.control_attributes & 3] ?? null : null;
			definition(area.kind, area.owner_node, area.list_node, apply, area.paragraph_count);
		}
		else {
			const declarations = unique(list(observation.areas), (d) => d.sourceElement, warnings, "page area declaration");
			const represented = /* @__PURE__ */ new Set();
			for (const p of observation.paragraphs) {
				const flow = p.flow, area = flow?.page_area;
				if (!isPageArea(flow?.host) || !area) continue;
				const declaration = declarations.get(area.owner_node);
				if (!declaration) {
					section.header.declarations = section.footer.declarations = "unavailable";
					model.coverage.pageAreasKnown = false;
					warn("PageAreaDeclarationUnverified", "Owner has no unique declaration", source);
					continue;
				}
				represented.add(area.owner_node);
				definition(flow.host, area.owner_node, area.list_node, isApply(area.apply) ? area.apply : null, null, {
					declarationParagraph: declaration.paragraph,
					declarationUnit: declaration.unit
				});
			}
			if (represented.size !== declarations.size) {
				section.header.declarations = section.footer.declarations = "unavailable";
				model.coverage.pageAreasKnown = false;
				warn("UnclassifiedPageAreaDeclaration", "A declaration has no verified header/footer paragraph owner", source);
			}
		}
		function table(tableNode, rows = null, columns = null) {
			if (!uint$4(tableNode)) throw new Error("InvalidTableIdentity");
			const previous = byTable.get(tableNode);
			if (previous) return previous;
			const block = {
				id: `s${s}:t${tableNode}`,
				type: "table",
				reference: buildObjectReference({
					sourceSha256,
					format,
					section: s,
					kind: "table",
					node: tableNode
				}),
				source: {
					section: s,
					tableNode
				},
				rows: uint$4(rows) ? rows : null,
				columns: uint$4(columns) ? columns : null,
				cells: []
			};
			const node = add({
				id: block.id,
				kind: "table",
				block,
				parent: null,
				reason: "TableOwnerUnverified",
				native: tableNode
			});
			byTable.set(tableNode, node);
			model.coverage.objectTotal++;
			return node;
		}
		function cell(tableNode, listNode, cellNode) {
			if (!uint$4(listNode)) throw new Error("InvalidCellIdentity");
			const t = table(tableNode), id = cellKey(s, tableNode, listNode);
			const previousOwner = cellOwners.get(listNode);
			if (previousOwner !== void 0 && previousOwner !== tableNode) throw new Error("ConflictingCellSourceIdentity");
			cellOwners.set(listNode, tableNode);
			if (cells.has(id)) {
				const existing = cells.get(id);
				if (uint$4(cellNode)) {
					if (uint$4(existing.block.source.cellNode) && existing.block.source.cellNode !== cellNode) throw new Error("ConflictingCellSourceIdentity");
					existing.block.source.cellNode = cellNode;
				}
				return existing;
			}
			const block = {
				id,
				source: {
					section: s,
					tableNode,
					listNode,
					...uint$4(cellNode) ? { cellNode } : {}
				},
				row: null,
				column: null,
				rowSpan: null,
				columnSpan: null,
				blocks: [],
				geometryKnown: false,
				contentState: "not-observed"
			};
			t.block.cells.push(block);
			const node = add({
				id,
				kind: "cell",
				block,
				target: block.blocks,
				parent: t.id
			});
			cells.set(id, node);
			return node;
		}
		if (format === "hwp5") {
			for (const row of list(observation.tableInventory)) table(row.table_record_node, row.rows, row.columns);
			for (const row of list(observation.cellInventory)) cell(row.table_record_node, row.list_node);
		} else {
			const inventoryValue = observation.tableInventory.ok ? observation.tableInventory.value : null;
			const inventory = inventoryValue && !Array.isArray(inventoryValue) ? inventoryValue.cells : null;
			if (Array.isArray(inventory)) for (const row of inventory) cell(row.table_node, row.list_node, row.cell_node);
			else warn("CellInventoryUnavailable", "Native original-cell inventory unavailable", source);
		}
		for (const binding of bindings) {
			if (!uint$4(binding.rows) || !binding.rows || !uint$4(binding.columns) || !binding.columns) throw new Error("InvalidTableGeometry");
			const t = table(binding.tableNode, binding.rows, binding.columns), c = cell(binding.tableNode, binding.listNode);
			if (t.block.rows === null) t.block.rows = binding.rows;
			if (t.block.columns === null) t.block.columns = binding.columns;
			if (t.block.rows !== binding.rows || t.block.columns !== binding.columns) throw new Error("ConflictingTableGeometry");
			const names = [
				"row",
				"column",
				"rowSpan",
				"columnSpan"
			];
			if (!names.every((n) => uint$4(binding[n])) || !binding.rowSpan || !binding.columnSpan || binding.row + binding.rowSpan > binding.rows || binding.column + binding.columnSpan > binding.columns) throw new Error("InvalidCellGeometry");
			if (c.block.geometryKnown && names.some((n) => c.block[n] !== binding[n])) throw new Error("ConflictingCellGeometry");
			for (const n of names) c.block[n] = binding[n];
			c.block.geometryKnown = true;
		}
		for (const p of observation.paragraphs) {
			if (!uint$4(p.paragraph) || format === "hwpx" && !p.paragraph) throw new Error("InvalidNativeParagraphOrdinal");
			const id = paragraphId(s, p.paragraph), pSource = {
				section: s,
				paragraph: p.paragraph,
				...uint$4(p.node) ? { node: p.node } : {}
			};
			if (paragraphs.has(id)) throw new Error("DuplicateParagraphIdentity");
			if (p.identityKnown && uint$4(p.node)) {
				if (paragraphSources.has(p.node)) throw new Error("DuplicateParagraphSourceIdentity");
				paragraphSources.add(p.node);
			}
			const displayText = typeof p.displayText === "string" ? p.displayText : null;
			if (displayText !== null && !displayText.isWellFormed()) throw new Error("InvalidDocumentText");
			textUnits += displayText?.length ?? 0;
			if (textUnits > limits.maxTextUnits) throw new RangeError("ModelTextLimitExceeded");
			const block = {
				id,
				type: "paragraph",
				displayText,
				source: pSource,
				editability: p.identityKnown ? "range-check-required" : "unknown",
				...p.identityKnown ? {} : { reason: "SourceIdentityUnverified" }
			};
			if (displayText === null) {
				warn("DisplayTextUnavailable", "Known display text unavailable", pSource);
				model.coverage.unknownBlocks++;
			}
			const node = add({
				id,
				kind: "paragraph",
				block,
				parent: null,
				reason: "ParagraphOwnerUnverified",
				native: p.node
			});
			paragraphs.set(id, node);
			byOrdinal.set(p.paragraph, node);
			model.coverage.observedParagraphs++;
			if (!p.identityKnown) continue;
			const binding = paragraphBindings.get(p.paragraph);
			if (binding) {
				const c = cells.get(cellKey(s, binding.tableNode, binding.listNode));
				if (c) {
					node.parent = c.id;
					c.block.contentState = "observed";
				}
			} else if (paragraphBindings.has(p.paragraph)) node.reason = "AmbiguousCellOwner";
			else if (p.flow?.host === "body" && p.flow.top_level === true) node.parent = body.id;
			else if (isPageArea(p.flow?.host)) {
				const area = format === "hwp5" ? {
					owner_node: p.flow.parent_node,
					list_node: p.flow.list_node
				} : p.flow.page_area;
				const def = area && defs.get(`${area.owner_node}:${area.list_node}`);
				if (def && def.block.kind === p.flow.host) {
					node.parent = def.id;
					def.block.observedParagraphs++;
				} else {
					section[p.flow.host].declarations = "unavailable";
					model.coverage.pageAreasKnown = false;
					node.reason = "PageAreaOwnerUnverified";
				}
			}
		}
		for (const [tableNode, t] of byTable) {
			const placement = placementMap.get(tableNode), host = placement && byOrdinal.get(placement.paragraph);
			if (!host) continue;
			if (placement.parentTableNode !== null && placement.parentTableNode !== void 0) {
				if (host.parent !== cellKey(s, placement.parentTableNode, placement.parentListNode)) {
					t.reason = "NestedTableOwnerMismatch";
					continue;
				}
			}
			t.parent = host.id;
			delete t.reason;
		}
		const geometryCount = /* @__PURE__ */ new Map();
		for (const c of cells.values()) if (!c.block.geometryKnown || c.block.contentState !== "observed") {
			const code = !c.block.geometryKnown ? "CellGeometryUnavailable" : "CellContentNotObserved";
			c.block.blocks.push(unknown(`${c.id}:unknown`, "cell", code, c.block.source));
			model.coverage.unknownBlocks++;
			warn(code, code, c.block.source);
		} else geometryCount.set(c.block.source.tableNode, (geometryCount.get(c.block.source.tableNode) ?? 0) + 1);
		for (const [n, t] of byTable) if (t.block.cells.length > 0 && geometryCount.get(n) === t.block.cells.length && known(observation.tableInventory) && (format !== "hwp5" || known(observation.cellInventory))) model.coverage.tablesWithCompleteCellInventory++;
		for (const def of defs.values()) if (uint$4(def.block.declaredParagraphs) && def.block.observedParagraphs !== def.block.declaredParagraphs) warn("PageAreaParagraphCountMismatch", "Native definition count differs from observed direct paragraph owners", def.block.source);
		if (!observation.picturesKnown) model.coverage.imagesKnown = false;
		for (const image of observation.pictures) {
			if (!uint$4(image.pictureNode)) throw new Error("InvalidPictureIdentity");
			const id = `s${s}:i${image.pictureNode}`;
			const sourceInfo = {};
			for (const name of [
				"section",
				"pictureNode",
				"recordNode",
				"componentNode",
				"ownerNode",
				"resourceId"
			]) if (uint$4(image.sourceInfo?.[name])) sourceInfo[name] = image.sourceInfo[name];
			add({
				id,
				kind: "image",
				block: {
					id,
					type: "image",
					reference: image.inventorySiteKnown === true ? buildObjectReference({
						sourceSha256,
						format,
						section: s,
						kind: "image",
						node: image.pictureNode
					}) : null,
					imageId: image.inventorySiteKnown === true ? canonicalImageId({
						format,
						section: s,
						node: image.pictureNode
					}) : null,
					label: "image",
					alt: null,
					altState: "not-exposed",
					sourceInfo,
					...uint$4(image.width) ? { width: image.width } : {},
					...uint$4(image.height) ? { height: image.height } : {},
					sizeUnit: "hwp-unit"
				},
				parent: uint$4(image.parentParagraph) && byOrdinal.has(image.parentParagraph) ? paragraphId(s, image.parentParagraph) : null,
				reason: image.reason ?? "PictureOwnerUnverified",
				native: image.pictureNode
			});
			model.coverage.objectTotal++;
		}
		if (observation.objectsKnown !== true) {
			model.coverage.objectsKnown = false;
			model.coverage.inventoryComplete = false;
			warn("ObjectInventoryIncomplete", observation.objectInventoryScope ?? "Native object inventory unavailable", source);
		}
		const objectNodes = /* @__PURE__ */ new Map();
		for (const object of observation.objects ?? []) {
			const nodeKnown = object.siteKnown === true && uint$4(object.node);
			const id = nodeKnown ? `s${s}:o${object.node}` : `s${s}:object:p${object.paragraph}:u${object.anchorUnit}`;
			const objectSource = {
				section: s,
				...uint$4(object.node) ? { node: object.node } : {},
				...uint$4(object.paragraph) ? { paragraph: object.paragraph } : {},
				...uint$4(object.anchorUnit) ? { anchorUnit: object.anchorUnit } : {}
			};
			const node = add({
				id,
				kind: "object",
				block: {
					...unknown(id, object.kind, object.reason ?? "ObjectDetailsDeferred", objectSource),
					reference: nodeKnown ? buildObjectReference({
						sourceSha256,
						format,
						section: s,
						kind: object.kind,
						node: object.node
					}) : null,
					detailUnavailable: object.detailUnavailable === true,
					...uint$4(object.nativeKind) ? { nativeKind: object.nativeKind } : {},
					...typeof object.subtype === "string" ? { subtype: object.subtype } : {}
				},
				parent: uint$4(object.parentParagraph) && byOrdinal.has(object.parentParagraph) ? paragraphId(s, object.parentParagraph) : null,
				reason: object.reason ?? "ObjectOwnerUnverified"
			});
			if (nodeKnown) objectNodes.set(object.node, node);
			model.coverage.unknownBlocks++;
			model.coverage.objectTotal++;
		}
		for (const object of observation.objects ?? []) {
			if (!uint$4(object.node) || !uint$4(object.parentObjectNode)) continue;
			const node = objectNodes.get(object.node), parent = objectNodes.get(object.parentObjectNode);
			if (node && parent && node.parent === null) node.parent = parent.id;
		}
	}
	const resolved = /* @__PURE__ */ new Map();
	for (const node of nodes.values()) {
		if (resolved.has(node.id)) continue;
		const path = [], active = /* @__PURE__ */ new Set();
		let cursor = node;
		let result;
		while (cursor && !resolved.has(cursor.id) && !active.has(cursor.id)) {
			if (cursor.root) {
				result = {
					placed: true,
					depth: 0
				};
				break;
			}
			active.add(cursor.id);
			path.push(cursor);
			cursor = cursor.parent ? nodes.get(cursor.parent) : null;
		}
		result ??= cursor && resolved.get(cursor.id) || {
			placed: false,
			depth: 0,
			reason: cursor ? "CyclicOwner" : "MissingOwner"
		};
		for (let i = path.length - 1; i >= 0; i--) {
			result = {
				placed: result.placed,
				depth: result.depth + 1,
				reason: result.reason
			};
			if (result.depth > limits.maxDepth) result = {
				...result,
				placed: false,
				reason: "ModelDepthLimitExceeded"
			};
			resolved.set(path[i].id, result);
		}
		if (node.root) resolved.set(node.id, {
			placed: true,
			depth: 0
		});
	}
	for (const node of nodes.values()) if (!node.root && node.parent && nodes.has(node.parent)) {
		const bucket = children.get(node.parent) ?? [];
		bucket.push(node);
		children.set(node.parent, bucket);
	}
	const emitted = /* @__PURE__ */ new Set();
	function emit(first, target, placed) {
		const stack = [{
			node: first,
			target,
			depth: 0
		}];
		while (stack.length) {
			const { node, target: output, depth } = stack.pop();
			if (emitted.has(node.id) || depth > limits.maxDepth) continue;
			emitted.add(node.id);
			let next = output;
			if (node.kind === "cell" || node.root) next = node.target;
			else output.push(node.block);
			if (node.kind === "paragraph") model.coverage[placed ? "placed" : "unplaced"]++;
			if ([
				"image",
				"table",
				"object"
			].includes(node.kind)) model.coverage[placed ? "objectsPlaced" : "objectsUnplaced"]++;
			const descendants = children.get(node.id) ?? [];
			for (let i = descendants.length - 1; i >= 0; i--) stack.push({
				node: descendants[i],
				target: next,
				depth: depth + 1
			});
		}
	}
	for (const node of nodes.values()) if (node.root) emit(node, node.target, true);
	for (const node of nodes.values()) if (!emitted.has(node.id) && node.kind !== "cell") {
		const blocks = [];
		emit(node, blocks, false);
		const code = node.reason ?? resolved.get(node.id)?.reason ?? "UnplacedSource";
		for (const block of blocks) model.unplaced.push({
			block,
			diagnostic: diagnostic(code, "Source owner could not be placed safely", block.type === "image" ? block.sourceInfo : block.source)
		});
	}
	if (model.coverage.observedParagraphs !== model.coverage.placed + model.coverage.unplaced) throw new Error("ParagraphAccountingMismatch");
	return model;
}
var isPageArea, isApply, cellKey, paragraphId, list, known;
var init_project = __esmMin((() => {
	init_common$1();
	init_object_reference();
	isPageArea = (value) => value === "header" || value === "footer";
	isApply = (value) => value === "both" || value === "odd" || value === "even";
	cellKey = (s, t, l) => `s${s}:t${t}:c${l}`;
	paragraphId = (s, p) => `s${s}:p${p}`;
	list = (result) => result?.ok && Array.isArray(result.value) ? result.value : [];
	known = (result) => result?.ok === true;
}));
// src/document-model.ts
var document_model_exports = /* @__PURE__ */ __exportAll({ readDocumentModel: () => readDocumentModel });
async function readDocumentModel(input = {}) {
	if (input === null || typeof input !== "object") throw new TypeError("InvalidDocumentFormat");
	const { format, sourceSha256, sectionCount, sdk } = input;
	if (format !== "hwp5" && format !== "hwpx") throw new TypeError("InvalidDocumentFormat");
	if (typeof sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(sourceSha256)) throw new TypeError("InvalidSourceSha256");
	if (typeof sectionCount !== "number" || !Number.isInteger(sectionCount) || sectionCount < 1 || sectionCount > 4096) throw new RangeError("SectionLimitExceeded");
	if (!sdk || typeof sdk !== "object") throw new TypeError("MissingSdk");
	const context = {
		sdk,
		sectionCount
	};
	return project({
		format,
		sourceSha256,
		observations: format === "hwp5" ? collectHwp5(context) : collectHwpx(context)
	}, LIMITS$1);
}
var init_document_model = __esmMin((() => {
	init_common$1();
	init_hwp5();
	init_hwpx();
	init_project();
}));
// src/engine.ts
var engine_exports = /* @__PURE__ */ __exportAll({
	edit: () => edit,
	openDocument: () => openDocument,
	read: () => read
});
function byteInput(value, name) {
	if (!(value instanceof Uint8Array)) throw new TypeError(`Expected${name}Uint8Array`);
	if (!value.byteLength || value.byteLength > MAX_INPUT_BYTES$1) throw new RangeError(`${name}LimitExceeded`);
	return Uint8Array.from(value);
}
function captureTarget(target) {
	if (!record$7(target)) throw new TypeError("InvalidTarget");
	const { section, paragraph } = target;
	if (typeof section !== "number" || !Number.isInteger(section) || section < 0 || section > 4294967295 || typeof paragraph !== "number" || !Number.isInteger(paragraph) || paragraph < 0 || paragraph > 4294967295) throw new RangeError("InvalidTarget");
	return {
		section,
		paragraph
	};
}
function position$1(target, sectionCount, format) {
	const captured = captureTarget(target);
	if (captured.section >= sectionCount || format === "hwpx" && captured.paragraph === 0) throw new RangeError("InvalidTarget");
	return captured;
}
function outputBytes(value) {
	if (!(value instanceof Uint8Array) || !value.byteLength || value.byteLength > MAX_OUTPUT_BYTES$1) throw new RangeError("OutputLimitExceeded");
	return value;
}
async function openDocument(options = {}) {
	if (!record$7(options)) throw new TypeError("InvalidDocumentOpenOptions");
	const { bytes, wasm, expectedSha256 } = options;
	const input = byteInput(bytes, "Document");
	if (expectedSha256 !== void 0 && (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256))) throw new TypeError("InvalidExpectedSha256");
	const binary = byteInput(wasm, "Wasm");
	if (!globalThis.crypto?.subtle) throw new Error("WebCryptoUnavailable");
	const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
	const sourceSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
	if (expectedSha256 !== void 0 && sourceSha256 !== expectedSha256) throw new Error("SourceSha256Mismatch");
	const detected = detectDocumentFormat(input);
	if (detected !== "hwp5" && detected !== "hwpx") throw new TypeError("InvalidDocumentFormat");
	let native;
	try {
		let sectionCount;
		if (detected === "hwp5") {
			const sdk = await createExperimentalHwp5Editor(binary, input);
			native = {
				format: "hwp5",
				sdk
			};
			sectionCount = sdk.sectionCount();
		} else {
			const sdk = await createHwpxEditor(binary);
			native = {
				format: "hwpx",
				sdk
			};
			sectionCount = sdk.open(input).sectionCount;
		}
		if (!Number.isInteger(sectionCount) || sectionCount < 1 || sectionCount > 4096) throw new RangeError("SectionLimitExceeded");
		const state = native;
		let closed = false;
		const ready = () => {
			if (closed) throw new Error("DocumentClosed");
		};
		const replaceText = ({ target, oldText, newText }) => {
			ready();
			const search = validateLiteral(oldText), replacement = validateLiteral(newText, { empty: true });
			const { section, paragraph } = position$1(target, sectionCount, state.format);
			let text;
			if (state.format === "hwp5") {
				if (paragraph >= state.sdk.paragraphCount(section)) throw new RangeError("InvalidTarget");
				state.sdk.validateTextSourcePolicy(section);
				text = state.sdk.text(section, paragraph);
			} else {
				const rows = state.sdk.paragraphTextSnapshot(section);
				let units = 0, present = false;
				for (const row of rows) {
					units += row.text.length;
					if (units > 33554432) throw new RangeError("DecodedTextLimitExceeded");
					if (row.paragraph === paragraph) present = true;
				}
				if (!present) throw new RangeError("InvalidTarget");
				if (!state.sdk.canEdit(section, paragraph)) throw new Error("UnsupportedParagraphEdit");
				text = state.sdk.anchorText(section, paragraph);
			}
			const startUnit = findUniqueLiteral(text, search), endUnit = startUnit + search.length;
			if (state.format === "hwp5") state.sdk.splice({
				section,
				paragraph,
				startUnit,
				endUnit,
				text: replacement
			});
			else state.sdk.splice(section, paragraph, startUnit, search.length, replacement);
			return {
				changed: search !== replacement,
				section,
				paragraph,
				startUnit,
				endUnit
			};
		};
		const close = () => {
			if (!closed) {
				closed = true;
				state.sdk.close();
			}
		};
		const common = {
			sourceSha256,
			sectionCount,
			replaceText,
			close
		};
		if (state.format === "hwp5") {
			const sdk = state.sdk;
			return {
				...common,
				format: "hwp5",
				sdk,
				save({ allowStaleLayout = false } = {}) {
					ready();
					if (typeof allowStaleLayout !== "boolean") throw new TypeError("InvalidAllowStaleLayout");
					const saved = sdk.save({ allowStaleLayout });
					return {
						...saved,
						bytes: outputBytes(saved.bytes)
					};
				}
			};
		}
		const sdk = state.sdk;
		return {
			...common,
			format: "hwpx",
			sdk,
			save({ allowStaleLayout = false } = {}) {
				ready();
				if (typeof allowStaleLayout !== "boolean") throw new TypeError("InvalidAllowStaleLayout");
				return outputBytes(sdk.save());
			}
		};
	} catch (error) {
		native?.sdk.close();
		throw error;
	}
}
async function read(options) {
	const document = await openDocument(options);
	try {
		const { readDocumentModel } = await Promise.resolve().then(() => (init_document_model(), document_model_exports));
		const model = await readDocumentModel({
			format: document.format,
			sourceSha256: document.sourceSha256,
			sectionCount: document.sectionCount,
			sdk: document.sdk
		});
		return {
			format: document.format,
			model
		};
	} finally {
		document.close();
	}
}
async function edit(options) {
	if (!record$7(options)) throw new TypeError("InvalidEditOptions");
	const { bytes, wasm, target, replace, with: replacement, allowStaleLayout = false } = options;
	const capturedTarget = captureTarget(target);
	const document = await openDocument({
		bytes,
		wasm
	});
	try {
		const { changed } = document.replaceText({
			target: capturedTarget,
			oldText: replace,
			newText: replacement
		});
		if (typeof allowStaleLayout !== "boolean") throw new TypeError("InvalidAllowStaleLayout");
		if (document.format === "hwp5") {
			const saved = document.save({ allowStaleLayout });
			return {
				format: document.format,
				bytes: saved.bytes,
				changed,
				layoutRequiresReflow: saved.layoutRequiresReflow
			};
		}
		return {
			format: document.format,
			bytes: document.save({ allowStaleLayout }),
			changed,
			layoutRequiresReflow: false
		};
	} finally {
		document.close();
	}
}
var MAX_INPUT_BYTES$1, MAX_OUTPUT_BYTES$1, record$7;
var init_engine = __esmMin((() => {
	init_document_format();
	init_hwp5_editor();
	init_hwpx_editor();
	init_literal_match();
	MAX_INPUT_BYTES$1 = 67108864;
	MAX_OUTPUT_BYTES$1 = 134217728;
	record$7 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
}));
// src/render-content.ts
function simpleCells(table) {
	const { rows, columns, cells } = table;
	if (!rows || !columns) return null;
	const slots = rows * columns;
	if (!Number.isSafeInteger(slots) || slots > 8 * cells.length) return null;
	const grid = /* @__PURE__ */ new Map();
	for (const cell of cells) {
		if (!cell.geometryKnown || cell.contentState !== "observed" || cell.row === null || cell.column === null || cell.row >= rows || cell.column >= columns || cell.rowSpan === null || cell.columnSpan === null || cell.row + cell.rowSpan > rows || cell.column + cell.columnSpan > columns || (cell.rowSpan !== 1 || cell.columnSpan !== 1) && slots > 4096 || cell.blocks.some((block) => block.type !== "paragraph" && block.type !== "image")) return null;
		for (let row = cell.row; row < cell.row + cell.rowSpan; row++) for (let column = cell.column; column < cell.column + cell.columnSpan; column++) {
			const key = row * columns + column;
			if (grid.has(key)) return null;
			grid.set(key, row === cell.row && column === cell.column ? cell : null);
		}
	}
	return grid.size === slots ? {
		grid,
		rows,
		columns
	} : null;
}
function renderContent(model, { markdown, escape, line, references, maxOutputUnits }) {
	const names = /* @__PURE__ */ new Map([
		["image", "이미지"],
		["table", "표"],
		["chart", "차트"],
		["equation", "수식"],
		["drawing", "도형"],
		["ole", "임베디드 개체"],
		["unknown", "알 수 없는 개체"]
	]);
	const captions = /* @__PURE__ */ new Map();
	let ordinal = 0;
	const caption = (block) => {
		const reference = references.get(block);
		if (!reference) return null;
		if (!captions.has(block)) captions.set(block, names.get(reference.kind) + " " + ++ordinal);
		const label = captions.get(block);
		return markdown ? (reference.kind === "image" ? "!" : "") + "[" + label + "](" + reference.text + ")" : "[" + label + ": " + reference.text + "]";
	};
	const join = (parts, separator) => {
		let units = 0;
		for (let i = 0; i < parts.length; i++) {
			units += parts[i].length + (i ? separator.length : 0);
			if (units > maxOutputUnits) throw new RangeError("RenderOutputLimitExceeded");
		}
		return parts.join(separator);
	};
	const inline = (block) => {
		if (block.type === "paragraph") return block.displayText === null ? "[문단 내용 확인 불가]" : escape(block.displayText);
		if (block.type !== "image") throw new TypeError("UnsupportedInlineBlockType");
		const label = caption(block);
		const alt = block.altState === "provided" && block.alt !== "" ? escape(block.alt) : null;
		return (label ?? "[이미지: 추출 참조 확인 불가]") + (alt ? " " + alt : "");
	};
	let previous = null;
	const emit = (text, kind, context) => {
		if (text !== "" && context?.label) {
			if (markdown && previous) line("");
			line(context.label);
			if (markdown) line("");
			context.label = null;
			previous = "label";
		}
		if (markdown && previous && previous !== "label" && kind !== "table-row") line("");
		if (markdown && kind === "table-row" && previous && previous !== "table-row" && previous !== "table-start") line("");
		line(text);
		previous = kind;
	};
	const blocks = (values, context) => {
		for (const block of values) if (block.type === "paragraph" || block.type === "image") emit(inline(block), "paragraph", context);
		else if (block.type === "unknown") {
			const label = caption(block);
			const name = names.get(block.kind);
			emit(label ? label + " [내용 확인 불가]" : name ? "[" + name + ": 내용·참조 확인 불가]" : "[알 수 없는 내용]", "paragraph", context);
		} else {
			const label = caption(block);
			if (label) emit(label, "paragraph", context);
			const simple = simpleCells(block);
			if (simple) {
				const { grid, rows, columns } = simple;
				if (markdown) {
					emit("| " + Array(columns).fill("").join(" | ") + " |", "table-start", context);
					emit("| " + Array(columns).fill("---").join(" | ") + " |", "table-row", context);
				} else if (previous === "table-row") emit("", "paragraph", context);
				for (let row = 0; row < rows; row++) {
					const parts = [];
					for (let column = 0; column < columns; column++) {
						const cell = grid.get(row * columns + column);
						parts.push(cell === null ? "" : join(cell.blocks.map(inline), markdown ? "<br><br>" : " / "));
					}
					const text = join(parts, markdown ? " | " : "	");
					emit(markdown ? "| " + text + " |" : text, "table-row", context);
				}
			} else {
				emit("[표 배치를 단순화했습니다: 관측된 내용 순서]", "paragraph", context);
				if (!block.cells.length) emit("[관측된 셀 없음]", "paragraph", context);
				for (const cell of block.cells) {
					if (cell.contentState !== "observed") emit("[셀 내용 확인 불가]", "paragraph", context);
					blocks(cell.blocks, context);
				}
			}
		}
	};
	const area = (value, label) => {
		const context = { label };
		if (value.declarations === "unavailable") emit("[" + label + " 확인 불가]", "paragraph", null);
		for (const definition of value.definitions) blocks(definition.blocks, context);
	};
	for (const section of model.sections) {
		area(section.header, "머리말");
		blocks(section.body, null);
		area(section.footer, "꼬리말");
	}
	for (const entry of model.unplaced) {
		emit("[위치를 확인할 수 없는 내용]", "paragraph", null);
		blocks([entry.block], null);
	}
	if (!model.coverage.inventoryComplete || model.warnings.length) emit("[일부 내용의 관측이 불완전합니다]", "paragraph", null);
}
var init_render_content = __esmMin((() => {}));
// src/render.ts
var render_exports = /* @__PURE__ */ __exportAll({ renderDocument: () => renderDocument });
function optionsFor(options) {
	if (!own(options) || !member(["text", "markdown"], options.format)) throw new TypeError("InvalidRenderFormat");
	if (options.view !== void 0 && !member(["content", "structure"], options.view)) throw new TypeError("InvalidRenderView");
	const limits = { ...LIMITS };
	for (const key of Object.keys(LIMITS)) {
		const value = options[key] ?? LIMITS[key];
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > LIMITS[key]) throw new RangeError("InvalidRenderLimit:" + key);
		limits[key] = value;
	}
	return limits;
}
function validate(model, limits) {
	const references = /* @__PURE__ */ new Map();
	const referenceIds = /* @__PURE__ */ new Set();
	let nodes = 0, units = 0;
	const seen = /* @__PURE__ */ new Set();
	const ids = /* @__PURE__ */ new Set();
	const stack = [];
	function string(value) {
		if (typeof value !== "string") throw new TypeError("InvalidRenderString");
		units += value.length;
		if (units > limits.maxTextUnits) throw new RangeError("RenderTextLimitExceeded");
	}
	const integer = (value, nullable = false, min = 0) => {
		if (nullable && value === null) return;
		if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > 4294967295) throw new TypeError("InvalidRenderCoordinate");
	};
	function object(value) {
		if (!own(value)) throw new TypeError("InvalidRenderObject");
	}
	const id = (value) => {
		string(value);
		if (!value || ids.has(value)) throw new TypeError("DuplicateOrEmptyRenderId");
		ids.add(value);
	};
	const enqueue = (type, value, depth) => {
		if (++nodes > limits.maxNodes) throw new RangeError("RenderNodeLimitExceeded");
		if (depth > limits.maxDepth) throw new RangeError("RenderDepthLimitExceeded");
		object(value);
		if (seen.has(value)) throw new TypeError("RepeatedRenderNodeOrCycle");
		seen.add(value);
		stack.push({
			type,
			value,
			depth
		});
	};
	const array = (value, type, depth) => {
		if (!Array.isArray(value)) throw new TypeError("InvalidRenderArray");
		if (value.length > limits.maxNodes - nodes) throw new RangeError("RenderNodeLimitExceeded");
		for (let i = value.length - 1; i >= 0; i--) enqueue(type, value[i], depth);
	};
	const diagnostic = (value) => {
		object(value);
		string(value.code);
		string(value.message);
	};
	object(model);
	if (model.version !== 1 || !member(["hwp5", "hwpx"], model.format)) throw new TypeError("InvalidDocumentViewVersionOrFormat");
	array(model.sections, "section", 0);
	array(model.unplaced, "unplaced", 0);
	if (!Array.isArray(model.warnings)) throw new TypeError("InvalidRenderWarnings");
	if (model.warnings.length > limits.maxNodes - nodes) throw new RangeError("RenderNodeLimitExceeded");
	nodes += model.warnings.length;
	for (const warning of model.warnings) diagnostic(warning);
	object(model.coverage);
	if (typeof model.coverage.inventoryComplete !== "boolean") throw new TypeError("InvalidRenderCoverage");
	while (stack.length) {
		const { type, value: v, depth } = stack.pop();
		if (type === "section") {
			id(v.id);
			object(v.source);
			integer(v.source.section);
			enqueue("area", v.header, depth);
			array(v.body, "block", depth);
			enqueue("area", v.footer, depth);
		} else if (type === "area") {
			if (!member(["known", "unavailable"], v.declarations)) throw new TypeError("InvalidPageAreaDeclarations");
			object(v.inheritance);
			if (!member([
				"observed",
				"unresolved",
				"not-applicable"
			], v.inheritance.state)) throw new TypeError("InvalidPageAreaInheritance");
			if (v.inheritance.fromSection !== void 0) integer(v.inheritance.fromSection);
			if (v.inheritance.definitionId !== void 0) string(v.inheritance.definitionId);
			array(v.definitions, "definition", depth);
		} else if (type === "definition") {
			id(v.id);
			if (!member(["header", "footer"], v.kind) || !member([
				null,
				"both",
				"odd",
				"even"
			], v.apply)) throw new TypeError("InvalidPageAreaDefinition");
			object(v.range);
			if (!member(["observed", "unresolved"], v.range.state)) throw new TypeError("InvalidPageAreaRange");
			for (const key of ["from", "to"]) if (v.range[key] !== void 0) integer(v.range[key]);
			array(v.blocks, "block", depth);
		} else if (type === "unplaced") {
			diagnostic(v.diagnostic);
			enqueue("block", v.block, depth);
		} else if (type === "cell") {
			id(v.id);
			for (const key of ["row", "column"]) integer(v[key], true);
			for (const key of ["rowSpan", "columnSpan"]) integer(v[key], true, 1);
			if (typeof v.geometryKnown !== "boolean") throw new TypeError("InvalidCellGeometryState");
			string(v.contentState);
			array(v.blocks, "block", depth + 1);
		} else if (type === "block") {
			id(v.id);
			const referenceText = v.reference;
			if (referenceText !== void 0 && referenceText !== null) {
				string(referenceText);
				if (typeof model.sourceSha256 !== "string") throw new TypeError("InvalidDocumentReferenceSource");
				const reference = parseObjectReference(referenceText, {
					sourceSha256: model.sourceSha256,
					format: model.format
				});
				const kind = v.type === "unknown" ? member([
					"chart",
					"equation",
					"drawing",
					"ole"
				], v.kind) ? v.kind : "unknown" : v.type;
				if (reference.kind !== kind || v.type === "paragraph") throw new TypeError("ObjectReferenceKindMismatch");
				if (referenceIds.has(referenceText)) throw new TypeError("DuplicateObjectReference");
				const source = v.type === "image" ? v.sourceInfo : v.source;
				if (!own(source) || source.section !== reference.section) throw new TypeError("ObjectReferenceSourceMismatch");
				if ((v.type === "image" ? source?.pictureNode : v.type === "table" ? source?.tableNode : source?.node) !== reference.node) throw new TypeError("ObjectReferenceSourceMismatch");
				referenceIds.add(referenceText);
				references.set(v, {
					...reference,
					text: referenceText
				});
			}
			if (v.type === "paragraph") {
				if (!Object.hasOwn(v, "displayText") || v.displayText !== null && typeof v.displayText !== "string") throw new TypeError("InvalidDocumentViewDisplayText");
				if (v.displayText !== null) string(v.displayText);
				if (v.reason !== void 0) string(v.reason);
				object(v.source);
				integer(v.source.section);
				integer(v.source.paragraph, false, model.format === "hwpx" ? 1 : 0);
				if (!member([
					"range-check-required",
					"read-only",
					"unknown"
				], v.editability)) throw new TypeError("InvalidParagraphEditability");
			} else if (v.type === "table") {
				integer(v.rows, true);
				integer(v.columns, true);
				array(v.cells, "cell", depth + 1);
			} else if (v.type === "image") {
				if (!member([
					"provided",
					"not-provided",
					"not-exposed"
				], v.altState)) throw new TypeError("InvalidImageAltState");
				if (v.alt !== null) string(v.alt);
				if (v.altState === "provided" && v.alt === null) throw new TypeError("MissingProvidedImageAlt");
				object(v.sourceInfo);
				for (const key of [
					"section",
					"pictureNode",
					"recordNode",
					"componentNode",
					"ownerNode",
					"resourceId"
				]) if (v.sourceInfo[key] !== void 0 && v.sourceInfo[key] !== null) integer(v.sourceInfo[key]);
				for (const key of ["width", "height"]) if (v[key] !== void 0 && v[key] !== null && (typeof v[key] !== "number" || !Number.isFinite(v[key]) || v[key] < 0)) throw new TypeError("InvalidImageSize");
				if (v.sizeUnit !== void 0) string(v.sizeUnit);
			} else if (v.type === "unknown") {
				string(v.kind);
				diagnostic(v.diagnostic);
			} else throw new TypeError("UnsupportedRenderBlockType");
		}
	}
	return references;
}
/** 관측한 논리 내용의 text/Markdown 보기입니다.
* 입출력·모델 변경 없이 표시 문자열을 만들며 원문 바이트를 대체하지 않습니다.
* 한도는 낮출 수만 있고 희소 셀은 무제한 밀집 격자로 확장하지 않습니다.
*/
function renderDocument(input, rawOptions) {
	const options = rawOptions;
	const model = input;
	const limits = optionsFor(rawOptions);
	const references = validate(input, limits);
	const markdown = options.format === "markdown";
	const content = (options.view ?? "content") === "content";
	const chunks = [];
	let outputUnits = 0;
	const escape = createDisplayEscaper({
		format: options.format,
		view: options.view
	});
	const line = (text) => {
		outputUnits += text.length + 1;
		if (outputUnits > limits.maxOutputUnits) throw new RangeError("RenderOutputLimitExceeded");
		chunks.push(text, "\n");
	};
	if (content) {
		renderContent(model, {
			markdown,
			escape,
			line,
			references,
			maxOutputUnits: limits.maxOutputUnits
		});
		return chunks.join("");
	}
	const item = (depth, text) => line("  ".repeat(depth) + (markdown ? "- " : "") + text);
	const heading = (level, text) => line((markdown ? "#".repeat(level) + " " : "") + text);
	const value = (x) => x === null || x === void 0 ? "unknown" : String(x);
	const diagnostic = (v) => escape(v.code) + ": " + escape(v.message);
	line(markdown ? "> AI logical view; display escapes are not original text bytes." : "AI logical view; display escapes are not original text bytes.");
	const stack = [];
	const pushBlocks = (blocks, depth) => {
		for (let i = blocks.length - 1; i >= 0; i--) stack.push({
			type: "block",
			value: blocks[i],
			depth
		});
	};
	const drain = () => {
		while (stack.length) {
			const { type, value: v, depth } = stack.pop();
			const reference = references.get(v);
			if (reference) item(depth, "Reference " + escape(reference.text));
			if (type === "cell") {
				item(depth, "Cell " + escape(v.id) + " row=" + value(v.row) + " column=" + value(v.column) + " rowSpan=" + value(v.rowSpan) + " columnSpan=" + value(v.columnSpan) + (v.geometryKnown ? "" : " [geometry unknown]") + " content=" + escape(v.contentState));
				pushBlocks(v.blocks, depth + 1);
			} else if (v.type === "paragraph") item(depth, "Paragraph " + escape(v.id) + " (native paragraph=" + v.source.paragraph + "): " + (v.displayText === null ? "[Unknown display text" + (v.reason ? ": " + escape(v.reason) : ": not observed") + "]" : escape(v.displayText)));
			else if (v.type === "table") {
				item(depth, "Table " + escape(v.id) + " rows=" + value(v.rows) + " columns=" + value(v.columns) + " [cell coordinates are zero-based]");
				for (let i = v.cells.length - 1; i >= 0; i--) stack.push({
					type: "cell",
					value: v.cells[i],
					depth: depth + 1
				});
			} else if (v.type === "image") {
				const alt = v.altState === "provided" ? "alt=" + escape(v.alt) : v.altState === "not-exposed" ? "alt not observed" : "alt not provided";
				let metadata = "";
				for (const key of [
					"section",
					"pictureNode",
					"recordNode",
					"componentNode",
					"ownerNode",
					"resourceId"
				]) if (v.sourceInfo[key] !== void 0 && v.sourceInfo[key] !== null) metadata += " " + key + "=" + v.sourceInfo[key];
				if (v.width !== void 0 || v.height !== void 0) metadata += " width=" + value(v.width) + " height=" + value(v.height) + " unit=" + (v.sizeUnit ? escape(v.sizeUnit) : "unknown");
				item(depth, "[Image " + escape(v.id) + "; " + alt + metadata + "]");
			} else item(depth, "[Unknown " + escape(v.id) + "; " + escape(v.kind) + "; " + diagnostic(v.diagnostic) + "]");
		}
	};
	const area = (label, v) => {
		heading(2, label + " (own definitions; declarations=" + v.declarations + ", inheritance=" + v.inheritance.state + ")");
		if (v.inheritance.state === "observed") item(0, "Inherited source section=" + value(v.inheritance.fromSection) + (v.inheritance.definitionId ? " definition=" + escape(v.inheritance.definitionId) : ""));
		if (v.declarations === "unavailable") item(0, "[Warning: page-area declarations unavailable]");
		for (const def of v.definitions) {
			item(0, "Definition " + escape(def.id) + " apply=" + value(def.apply) + " range=" + def.range.state + (def.range.state === "observed" ? " from=" + value(def.range.from) + " to=" + value(def.range.to) : ""));
			pushBlocks(def.blocks, 1);
			drain();
		}
	};
	for (const section of model.sections) {
		heading(1, "Section " + escape(section.id));
		area("Headers", section.header);
		heading(2, "Body");
		pushBlocks(section.body, 0);
		drain();
		area("Footers", section.footer);
	}
	if (model.unplaced.length) {
		heading(1, "Unplaced");
		for (const entry of model.unplaced) {
			item(0, "[Warning: " + diagnostic(entry.diagnostic) + "]");
			pushBlocks([entry.block], 1);
			drain();
		}
	}
	if (model.warnings.length || !model.coverage.inventoryComplete) {
		heading(1, "Warnings");
		if (!model.coverage.inventoryComplete) item(0, "Inventory incomplete; this view is partial.");
		for (const warning of model.warnings) item(0, diagnostic(warning));
	}
	return chunks.join("");
}
var member, LIMITS, own;
var init_render = __esmMin((() => {
	init_render_content();
	init_render_escape();
	init_object_reference();
	member = (values, value) => values.includes(value);
	LIMITS = Object.freeze({
		maxDepth: 32,
		maxNodes: 2e5,
		maxTextUnits: 4194304,
		maxOutputUnits: 33554432
	});
	own = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
}));
// src/mutations/validate.ts
function capture(value, budget, active = /* @__PURE__ */ new Set(), depth = 0) {
	if (++budget.nodes > MAX_NODES || depth > 16) throw new RangeError("OperationInputLimitExceeded");
	if (typeof value === "string") {
		if (!value.isWellFormed()) throw new TypeError("InvalidOperationUnicode");
		budget.units += value.length;
		if (value.length > MAX_UNITS || budget.units > MAX_UNITS) throw new RangeError("OperationInputLimitExceeded");
		budget.bytes += encoder$2.encode(value).byteLength;
		if (budget.bytes > MAX_UNITS) throw new RangeError("OperationInputLimitExceeded");
		return value;
	}
	if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "object" || value === null || active.has(value)) throw new TypeError("InvalidOperationData");
	const isArray = Array.isArray(value);
	if (!isArray && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("InvalidOperationData");
	active.add(value);
	const outputArray = [];
	const output = isArray ? outputArray : Object.create(null);
	const names = Reflect.ownKeys(value);
	if (names.length > MAX_NODES || isArray && value.length > MAX_NODES) throw new RangeError("OperationInputLimitExceeded");
	for (const name of names) {
		if (isArray && name === "length") continue;
		const descriptor = Object.getOwnPropertyDescriptor(value, name);
		if (typeof name !== "string" || !descriptor?.enumerable || !("value" in descriptor) || isArray && !/^(0|[1-9]\d*)$/u.test(name)) throw new TypeError("InvalidOperationData");
		if (isArray && Number(name) >= value.length) throw new TypeError("InvalidOperationData");
		Object.defineProperty(output, name, {
			value: capture(descriptor.value, budget, active, depth + 1),
			enumerable: true
		});
	}
	if (isArray && outputArray.length !== value.length) throw new TypeError("InvalidOperationData");
	if (isArray) {
		for (let i = 0; i < value.length; i++) if (!Object.hasOwn(output, i)) throw new TypeError("InvalidOperationData");
	}
	active.delete(value);
	return Object.freeze(output);
}
function fields(value, required, optional = []) {
	if (!record$6(value) || required.some((key) => !Object.hasOwn(value, key)) || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) throw new TypeError("InvalidOperationFields");
}
function uint$3(value) {
	if (typeof value !== "number" || !Number.isInteger(value) || Object.is(value, -0) || value < 0 || value > 4294967295) throw new RangeError("InvalidOperationInteger");
}
function string(value) {
	if (typeof value !== "string") throw new TypeError("InvalidOperationText");
}
function position(operation) {
	uint$3(operation.section);
	uint$3(operation.paragraph);
}
function range(operation) {
	position(operation);
	uint$3(operation.startUnit);
	uint$3(operation.endUnit);
	string(operation.expectedRangeText);
	if (operation.endUnit < operation.startUnit || operation.expectedRangeText.length !== operation.endUnit - operation.startUnit) throw new RangeError("InvalidOperationRange");
}
function validateDocumentOperations(input) {
	if (!Array.isArray(input) || input.length > MAX_OPERATIONS) throw new RangeError("OperationCountLimitExceeded");
	const captured = capture(input, {
		nodes: 0,
		units: 0,
		bytes: 0
	});
	if (!Array.isArray(captured)) throw new TypeError("InvalidOperationData");
	const operations = captured;
	for (const operation of operations) {
		if (!record$6(operation) || typeof operation.kind !== "string") throw new TypeError("InvalidOperationKind");
		if (operation.coordinates !== "current-transaction") throw new TypeError("OperationCoordinatesRequired");
		if (!Object.hasOwn(DOCUMENT_OPERATION_SPECS, operation.kind)) throw new Error(`UnsupportedDocumentOperation:${operation.kind}`);
		const shape = DOCUMENT_OPERATION_SPECS[operation.kind];
		fields(operation, shape.required, shape.optional);
		switch (operation.kind) {
			case "splice":
				range(operation);
				string(operation.text);
				if (/[\r\n]/u.test(operation.text)) throw new Error("UseParagraphRangeReplacementForNewlines");
				break;
			case "replace-paragraph-ranges":
				if (!Array.isArray(operation.ranges) || operation.ranges.length < 1 || operation.ranges.length > 4096) throw new RangeError("InvalidOperationRanges");
				for (const row of operation.ranges) {
					fields(row, [
						"section",
						"paragraph",
						"startUnit",
						"endUnit",
						"expectedRangeText"
					]);
					range(row);
				}
				encodeCharacterRanges(operation.ranges.map(({ section, paragraph, startUnit, endUnit }) => ({
					section,
					paragraph,
					startUnit,
					endUnit
				})));
				encodeParagraphReplacement(operation.text);
				if (Object.hasOwn(operation, "properties")) characterPropertyArgs(operation.properties);
				break;
			case "split-paragraph":
				position(operation);
				uint$3(operation.atUnit);
				string(operation.expectedText);
				if (Object.hasOwn(operation, "endUnit")) {
					uint$3(operation.endUnit);
					if (operation.endUnit < operation.atUnit) throw new RangeError("InvalidOperationRange");
				}
				break;
			case "merge-paragraph":
				position(operation);
				string(operation.expectedText);
				break;
			case "character-properties":
				range(operation);
				characterPropertyArgs(operation.properties);
				break;
			case "character-format":
				range(operation);
				uint$3(operation.charShapeId);
				break;
			case "paragraph-format":
				position(operation);
				uint$3(operation.paraShapeId);
				break;
			case "paragraph-alignment":
				position(operation);
				if (typeof operation.alignment !== "string" || ![
					"LEFT",
					"RIGHT",
					"CENTER",
					"JUSTIFY",
					"DISTRIBUTE",
					"DISTRIBUTE_SPACE"
				].includes(operation.alignment)) throw new TypeError("InvalidParagraphAlignment");
				break;
			case "paragraph-margins":
				position(operation);
				paragraphMarginArgs(operation.margins);
				break;
			case "paragraph-spacing":
				position(operation);
				paragraphSpacingArgs(operation.type, operation.value);
				break;
			case "cell-sizes":
				encodeCellSizes(operation.cells);
				break;
			case "cell-styles":
				validateCellStyles(operation.styles);
				break;
			case "picture-resize":
				for (const key of [
					"section",
					"pictureNode",
					"width",
					"height"
				]) uint$3(operation[key]);
				if (!operation.width || !operation.height) throw new RangeError("InvalidResizeAxisSize");
				break;
			case "table-insert":
				position(operation);
				uint$3(operation.unit);
				uint$3(operation.rows);
				uint$3(operation.columns);
				uint$3(operation.width);
				uint$3(operation.rowHeight);
				if (!operation.rows || !operation.columns || !operation.width || !operation.rowHeight || operation.rows * operation.columns > 4096) throw new RangeError("InvalidOperationTableSize");
				fields(operation.resources, [
					"paragraph",
					"character",
					"style",
					"border_fill"
				]);
				for (const value of Object.values(operation.resources)) uint$3(value);
				if (Object.hasOwn(operation, "cellTexts")) {
					if (!Array.isArray(operation.cellTexts) || operation.cellTexts.length !== operation.rows) throw new TypeError("InvalidOperationCellTexts");
					for (const row of operation.cellTexts) {
						if (!Array.isArray(row) || row.length !== operation.columns) throw new TypeError("InvalidOperationCellTexts");
						for (const text of row) {
							string(text);
							for (let index = 0; index < text.length; index++) {
								const unit = text.charCodeAt(index);
								if (unit < 32 || unit === 127) throw new TypeError("InvalidOperationCellTextControl");
							}
						}
					}
				}
				break;
			default: throw new Error(`UnsupportedDocumentOperation:${operation.kind}`);
		}
		if (Object.hasOwn(operation, "expectedText")) string(operation.expectedText);
	}
	return operations;
}
var MAX_OPERATIONS, MAX_NODES, MAX_UNITS, record$6, encoder$2, common, paragraph, textRange, spec, DOCUMENT_OPERATION_SPECS;
var init_validate = __esmMin((() => {
	init_character_property_args();
	init_paragraph_margin_args();
	init_paragraph_spacing_args();
	init_cell_size_batch();
	init_cell_style_command();
	init_character_range_batch();
	init_paragraph_replacement();
	MAX_OPERATIONS = 256;
	MAX_NODES = 1e5;
	MAX_UNITS = 4194304;
	record$6 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	encoder$2 = new TextEncoder();
	common = ["kind", "coordinates"];
	paragraph = [
		...common,
		"section",
		"paragraph"
	];
	textRange = [
		...paragraph,
		"startUnit",
		"endUnit",
		"expectedRangeText"
	];
	spec = (required, optional = []) => Object.freeze({
		required: Object.freeze(required),
		optional: Object.freeze(optional)
	});
	DOCUMENT_OPERATION_SPECS = Object.freeze({
		splice: spec([...textRange, "text"], ["expectedText"]),
		"replace-paragraph-ranges": spec([
			...common,
			"ranges",
			"text"
		], ["properties"]),
		"split-paragraph": spec([
			...paragraph,
			"atUnit",
			"expectedText"
		], ["endUnit"]),
		"merge-paragraph": spec([...paragraph, "expectedText"]),
		"character-properties": spec([...textRange, "properties"], ["expectedText"]),
		"character-format": spec([...textRange, "charShapeId"], ["expectedText"]),
		"paragraph-format": spec([...paragraph, "paraShapeId"], ["expectedText"]),
		"paragraph-alignment": spec([...paragraph, "alignment"], ["expectedText"]),
		"paragraph-margins": spec([...paragraph, "margins"], ["expectedText"]),
		"paragraph-spacing": spec([
			...paragraph,
			"type",
			"value"
		], ["expectedText"]),
		"cell-sizes": spec([...common, "cells"]),
		"cell-styles": spec([...common, "styles"]),
		"picture-resize": spec([
			...common,
			"section",
			"pictureNode",
			"width",
			"height"
		]),
		"table-insert": spec([
			...paragraph,
			"unit",
			"rows",
			"columns",
			"width",
			"rowHeight",
			"resources"
		], ["expectedText", "cellTexts"])
	});
}));
// ../../web/preview/hwp5-table-creation-command.mjs
function hwp5TableCreationRequest(message) {
	const o = message.options;
	if (!o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).some((key) => ![
		"rows",
		"columns",
		"width",
		"rowHeight",
		"resources"
	].includes(key))) throw new Error("InvalidTableCreationOptions");
	return {
		version: 1,
		section: message.section,
		paragraph: message.paragraph,
		unit: message.unit,
		rows: o.rows,
		columns: o.columns,
		width: o.width,
		row_height: o.rowHeight,
		resources: o.resources,
		options: {
			common: {
				flags: 6955537,
				offset_x: 0,
				offset_y: 0,
				z_order: 0,
				margins: [
					0,
					0,
					0,
					0
				],
				prevent_page_break: false,
				description: "표"
			},
			table: {
				page_break: 1,
				repeat_header: false,
				cell_spacing: 0,
				margins: [
					0,
					0,
					0,
					0
				]
			},
			cell: {
				layout: "observed8",
				unknown: 0,
				attributes: 0,
				margins: [
					0,
					0,
					0,
					0
				]
			}
		}
	};
}
var init_hwp5_table_creation_command = __esmMin((() => {}));
// src/mutations/dispatch.ts
function replaceParagraphRanges(sdk, request) {
	sdk.replaceParagraphRanges({
		...request,
		properties: request.properties
	});
}
function requireInitialCellTexts(document) {
	const supports = Reflect.get(document.sdk, "supportsTableInitialTexts");
	if (typeof supports !== "function" || Reflect.apply(supports, document.sdk, []) !== true) throw new Error("CreatedCellTextUnavailable");
}
function targets(operation) {
	if (operation.kind === "cell-sizes") return operation.cells;
	if (operation.kind === "cell-styles") return [
		...operation.styles.borders,
		...operation.styles.fills,
		...operation.styles.diagonals ?? []
	].map((row) => {
		const section = row.section;
		if (typeof section !== "number") throw new RangeError("InvalidOperationTarget");
		return { section };
	});
	if (operation.kind === "replace-paragraph-ranges") return operation.ranges;
	return [operation];
}
function prepareOperationSession(document, operations) {
	if (!["hwp5", "hwpx"].includes(document?.format) || !Number.isInteger(document.sectionCount) || document.sectionCount < 1 || document.sectionCount > 4096 || !document.sdk || typeof document.close !== "function" || typeof document.save !== "function") throw new Error("InvalidOperationSession");
	const protectedSections = /* @__PURE__ */ new Set();
	for (const operation of operations) {
		if (typeof document.sdk[METHODS[operation.kind]] !== "function") throw new Error(`DocumentOperationUnavailable:${operation.kind}`);
		if (operation.kind === "table-insert" && operation.cellTexts) requireInitialCellTexts(document);
		for (const target of targets(operation)) {
			if (target.section >= document.sectionCount || "paragraph" in target && document.format === "hwpx" && target.paragraph === 0) throw new RangeError("InvalidOperationTarget");
			if (document.format === "hwp5" && [
				"splice",
				"replace-paragraph-ranges",
				"split-paragraph",
				"merge-paragraph"
			].includes(operation.kind)) protectedSections.add(target.section);
		}
		if ((Object.hasOwn(operation, "expectedText") || Object.hasOwn(operation, "expectedRangeText") || operation.kind === "replace-paragraph-ranges") && typeof (document.format === "hwp5" ? document.sdk.text : document.sdk.anchorText) !== "function") throw new Error("OperationTextObservationUnavailable");
	}
	if (document.format === "hwp5") {
		if (protectedSections.size && typeof document.sdk.validateTextSourcePolicy !== "function") throw new Error("OperationTextSourcePolicyUnavailable");
		for (const section of protectedSections) document.sdk.validateTextSourcePolicy(section);
	}
}
function applyOperation(document, operation) {
	const textCache = /* @__PURE__ */ new Map();
	let observedUnits = 0;
	const currentText = (row) => {
		const key = `${row.section}:${row.paragraph}`;
		const prior = textCache.get(key);
		if (prior !== void 0) return prior;
		const text = document.format === "hwp5" ? document.sdk.text(row.section, row.paragraph) : document.sdk.anchorText(row.section, row.paragraph);
		if (typeof text !== "string" || text.length > 4194304 || !text.isWellFormed()) throw new Error("InvalidOperationTextObservation");
		observedUnits += text.length;
		if (observedUnits > 4194304) throw new RangeError("OperationObservationLimitExceeded");
		textCache.set(key, text);
		return text;
	};
	const checkExpected = (row) => {
		if ("expectedText" in row && currentText(row) !== row.expectedText) throw new Error("OperationTextPreconditionFailed");
		if ("expectedRangeText" in row) {
			const text = currentText(row);
			if (row.endUnit > text.length || text.slice(row.startUnit, row.endUnit) !== row.expectedRangeText) throw new Error("OperationRangePreconditionFailed");
		}
	};
	if (operation.kind === "replace-paragraph-ranges") for (const row of operation.ranges) checkExpected(row);
	else if ("expectedText" in operation || "expectedRangeText" in operation) checkExpected(operation);
	switch (operation.kind) {
		case "splice":
			if (document.format === "hwp5") document.sdk.splice({
				section: operation.section,
				paragraph: operation.paragraph,
				startUnit: operation.startUnit,
				endUnit: operation.endUnit,
				text: operation.text
			});
			else document.sdk.splice(operation.section, operation.paragraph, operation.startUnit, operation.endUnit - operation.startUnit, operation.text);
			break;
		case "replace-paragraph-ranges":
			replaceParagraphRanges(document.sdk, {
				ranges: operation.ranges.map(({ section, paragraph, startUnit, endUnit }) => ({
					section,
					paragraph,
					startUnit,
					endUnit
				})),
				text: operation.text,
				...Object.hasOwn(operation, "properties") ? { properties: operation.properties } : {}
			});
			break;
		case "split-paragraph":
			document.sdk.splitParagraph({
				section: operation.section,
				paragraph: operation.paragraph,
				atUnit: operation.atUnit,
				...Object.hasOwn(operation, "endUnit") ? { endUnit: operation.endUnit } : {}
			});
			break;
		case "merge-paragraph":
			document.sdk.mergeParagraph({
				section: operation.section,
				paragraph: operation.paragraph
			});
			break;
		case "character-properties":
			document.sdk.setCharacterProperties({
				section: operation.section,
				paragraph: operation.paragraph,
				startUnit: operation.startUnit,
				endUnit: operation.endUnit,
				properties: operation.properties
			});
			break;
		case "character-format":
			document.sdk.setCharacterFormat({
				section: operation.section,
				paragraph: operation.paragraph,
				startUnit: operation.startUnit,
				endUnit: operation.endUnit,
				charShapeId: operation.charShapeId
			});
			break;
		case "paragraph-format":
			document.sdk.setParagraphFormat({
				section: operation.section,
				paragraph: operation.paragraph,
				paraShapeId: operation.paraShapeId
			});
			break;
		case "paragraph-alignment":
			document.sdk.setParagraphAlignment({
				section: operation.section,
				paragraph: operation.paragraph,
				alignment: operation.alignment
			});
			break;
		case "paragraph-margins":
			document.sdk.setParagraphMargins({
				section: operation.section,
				paragraph: operation.paragraph,
				margins: operation.margins
			});
			break;
		case "paragraph-spacing":
			document.sdk.setParagraphSpacing({
				section: operation.section,
				paragraph: operation.paragraph,
				type: operation.type,
				value: operation.value
			});
			break;
		case "cell-sizes":
			document.sdk.setCellSizes(operation.cells);
			break;
		case "cell-styles":
			document.sdk.setCellStyles(operation.styles);
			break;
		case "picture-resize":
			document.sdk.resizePicture({
				section: operation.section,
				pictureNode: operation.pictureNode,
				width: operation.width,
				height: operation.height
			});
			break;
		case "table-insert": {
			const { section, paragraph, unit, rows, columns, width, rowHeight, resources } = operation;
			const options = {
				rows,
				columns,
				width,
				rowHeight,
				resources
			};
			if (document.format === "hwp5") {
				const request = {
					...hwp5TableCreationRequest({
						section,
						paragraph,
						unit,
						options
					}),
					...operation.cellTexts ? { cell_texts: operation.cellTexts } : {}
				};
				return document.sdk.insertTable(request);
			}
			const initialOptions = {
				...options,
				...operation.cellTexts ? { cellTexts: operation.cellTexts } : {}
			};
			return document.sdk.insertTable(section, paragraph, unit, initialOptions);
		}
	}
	return null;
}
var METHODS;
var init_dispatch = __esmMin((() => {
	init_hwp5_table_creation_command();
	METHODS = Object.freeze({
		splice: "splice",
		"replace-paragraph-ranges": "replaceParagraphRanges",
		"split-paragraph": "splitParagraph",
		"merge-paragraph": "mergeParagraph",
		"character-properties": "setCharacterProperties",
		"character-format": "setCharacterFormat",
		"paragraph-format": "setParagraphFormat",
		"paragraph-alignment": "setParagraphAlignment",
		"paragraph-margins": "setParagraphMargins",
		"paragraph-spacing": "setParagraphSpacing",
		"cell-sizes": "setCellSizes",
		"cell-styles": "setCellStyles",
		"picture-resize": "resizePicture",
		"table-insert": "insertTable"
	});
}));
// src/document-operations.ts
var document_operations_exports = /* @__PURE__ */ __exportAll({
	DOCUMENT_OPERATION_SPECS: () => DOCUMENT_OPERATION_SPECS,
	applyDocumentOperations: () => applyDocumentOperations,
	validateDocumentOperations: () => validateDocumentOperations
});
async function applyDocumentOperations(input = {}, dependencies = {}) {
	if (!record$5(input)) throw new TypeError("InvalidDocumentOperationsInput");
	const { bytes, wasm, expectedSha256, operations, allowStaleLayout = false } = input;
	if (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(expectedSha256)) throw new TypeError("InvalidExpectedSha256");
	if (typeof allowStaleLayout !== "boolean") throw new TypeError("InvalidAllowStaleLayout");
	const captured = validateDocumentOperations(operations);
	if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 67108864) throw new RangeError("OperationInputLimitExceeded");
	if (!(wasm instanceof Uint8Array) || wasm.byteLength === 0 || wasm.byteLength > 67108864) throw new RangeError("OperationWasmLimitExceeded");
	const original = Uint8Array.from(bytes), binary = Uint8Array.from(wasm);
	const document = await (dependencies.openDocument ?? (await Promise.resolve().then(() => (init_engine(), engine_exports))).openDocument)({
		bytes: original,
		wasm: binary,
		expectedSha256
	});
	let failed = false, failure, result;
	try {
		if (document.sourceSha256 !== expectedSha256) throw new Error("SourceSha256Mismatch");
		prepareOperationSession(document, captured);
		const identities = [];
		for (const [index, operation] of captured.entries()) {
			const identity = applyOperation(document, operation);
			if (identity !== null) {
				if (typeof identity !== "string" || !/^[1-9][0-9]{0,19}$/u.test(identity) || BigInt(identity) > 18446744073709551615n) throw new Error("InvalidCreatedTableIdentity");
				identities.push({
					operation: index,
					kind: "table-insert",
					identity
				});
			}
		}
		const saved = captured.length ? await document.save({ allowStaleLayout }) : original;
		const hwp5Saved = document.format === "hwp5" && captured.length !== 0;
		const output = hwp5Saved && record$5(saved) ? saved.bytes : saved;
		if (!(output instanceof Uint8Array) || output.byteLength === 0 || output.byteLength > 134217728) throw new RangeError("OperationOutputLimitExceeded");
		const reflow = hwp5Saved && record$5(saved) ? saved.layoutRequiresReflow : false;
		if (typeof reflow !== "boolean") throw new Error("InvalidOperationLayoutState");
		const owned = Uint8Array.from(output);
		const changed = original.length !== owned.length || original.some((byte, index) => byte !== owned[index]);
		result = {
			format: document.format,
			sourceSha256: document.sourceSha256,
			bytes: owned,
			changed,
			layoutRequiresReflow: reflow,
			appliedOperations: captured.length,
			operationResults: identities
		};
	} catch (error) {
		failed = true;
		failure = error;
	}
	try {
		await document.close();
	} catch (error) {
		if (failed) throw new AggregateError([failure, error], "DocumentOperationsAndCloseFailed", { cause: failure });
		throw new Error("DocumentOperationsCloseFailed", { cause: error });
	}
	if (failed) throw failure;
	if (result === void 0) throw new Error("MissingOperationResult");
	return result;
}
var record$5;
var init_document_operations = __esmMin((() => {
	init_validate();
	init_dispatch();
	record$5 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
}));
// src/document-paragraph.ts
var document_paragraph_exports = /* @__PURE__ */ __exportAll({ inspectDocumentParagraph: () => inspectDocumentParagraph });
function method(sdk, name) {
	const getter = Reflect.get(sdk, name);
	return typeof getter === "function" ? (...args) => Reflect.apply(getter, sdk, args) : null;
}
function ownBytes(value, limit, name) {
	if (!(value instanceof Uint8Array)) throw new TypeError(`Expected${name}Uint8Array`);
	if (!value.byteLength || value.byteLength > limit) throw new RangeError(`${name}LimitExceeded`);
	return Uint8Array.from(value);
}
function checkText(value) {
	if (typeof value !== "string") throw new TypeError("InvalidParagraphText");
	if (value.length > MAX_TEXT_BYTES$2 || encoder$1.encode(value).byteLength > MAX_TEXT_BYTES$2) throw new RangeError("ParagraphTextLimitExceeded");
	return value;
}
function asciiJson(value) {
	const chunks = ["\""];
	let length = 2;
	for (let index = 0; index < value.length; index++) {
		const unit = value.charCodeAt(index);
		const chunk = unit < 32 || unit >= 127 || unit === 34 || unit === 92 ? "\\u" + unit.toString(16).padStart(4, "0") : value[index];
		length += chunk.length;
		if (length > MAX_OUTPUT_BYTES) throw new RangeError("ParagraphDetailLimitExceeded");
		chunks.push(chunk);
	}
	chunks.push("\"");
	return chunks.join("");
}
function paragraphSnapshot(sdk, section, paragraph) {
	const snapshot = method(sdk, "paragraphTextSnapshot");
	if (!snapshot) throw new Error("ParagraphInventoryUnavailable");
	const rows = snapshot(section);
	if (!Array.isArray(rows) || rows.length > MAX_ROWS$1) throw new Error("InvalidParagraphInventory");
	const seen = /* @__PURE__ */ new Set();
	let found, size = 0;
	for (const row of rows) {
		if (!record$4(row)) throw new Error("InvalidParagraphInventory");
		const { paragraph: id, text, section: observedSection } = row;
		if (!uint$2(id) || id === 0 || seen.has(id) || observedSection !== void 0 && observedSection !== section) throw new Error("InvalidParagraphInventory");
		seen.add(id);
		const display = checkText(text);
		size += encoder$1.encode(display).byteLength;
		if (size > MAX_TEXT_BYTES$2) throw new RangeError("ParagraphTextLimitExceeded");
		if (id === paragraph) found = display;
	}
	if (!seen.has(paragraph) || found === void 0) throw new RangeError("ParagraphNotFound");
	return found;
}
function shapeId(sdk, section, paragraph) {
	const getter = method(sdk, "paragraphShapeId");
	if (!getter) return null;
	try {
		const value = getter(section, paragraph);
		return uint$2(value) ? value : null;
	} catch {
		return null;
	}
}
function characterRanges(sdk, section, paragraph, units) {
	const getter = method(sdk, "characterRanges");
	if (!getter) return null;
	try {
		const rows = getter(section, paragraph);
		if (!Array.isArray(rows) || rows.length > MAX_ROWS$1) return null;
		const result = [];
		let cursor = 0;
		for (const row of rows) {
			if (!record$4(row)) return null;
			const { start, end, charShapeId } = row;
			if (!uint$2(start) || !uint$2(end) || start !== cursor || end < start || end > units || charShapeId !== null && !uint$2(charShapeId)) return null;
			cursor = end;
			result.push({
				start,
				end,
				charShapeId
			});
			if (result.length > MAX_OUTPUT_BYTES / 32) return null;
		}
		return result;
	} catch {
		return null;
	}
}
/** 원문은 이번 요청에서만 읽으며 문서 모델이나 전역 캐시에 보관하지 않습니다. */
async function inspectDocumentParagraph(options = {}, dependencies = {}) {
	if (!record$4(options)) throw new TypeError("InvalidParagraphTarget");
	const { bytes, wasm, target, expectedSha256, format = "text" } = options;
	if (format !== "text" && format !== "markdown") throw new TypeError("InvalidRenderFormat");
	if (!record$4(target)) throw new TypeError("InvalidParagraphTarget");
	const { section, paragraph } = target;
	if (!uint$2(section) || !uint$2(paragraph)) throw new RangeError("InvalidParagraphTarget");
	const suppliedOpen = dependencies.openDocument;
	if (suppliedOpen !== void 0 && typeof suppliedOpen !== "function") throw new TypeError("InvalidDocumentOpener");
	if (expectedSha256 !== void 0 && (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256))) throw new TypeError("InvalidExpectedSha256");
	const input = ownBytes(bytes, MAX_DOCUMENT_BYTES, "Document");
	const binary = ownBytes(wasm, MAX_WASM_BYTES, "Wasm");
	const actualFormat = detectDocumentFormat(input);
	if (!globalThis.crypto?.subtle) throw new Error("WebCryptoUnavailable");
	const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
	const sourceSha256 = Array.from(new Uint8Array(digest), (unit) => unit.toString(16).padStart(2, "0")).join("");
	if (expectedSha256 !== void 0 && expectedSha256 !== sourceSha256) throw new Error("SourceSha256Mismatch");
	const open = suppliedOpen ?? (await Promise.resolve().then(() => (init_engine(), engine_exports))).openDocument;
	if (typeof open !== "function") throw new TypeError("InvalidDocumentOpener");
	const document = await open({
		bytes: input,
		wasm: binary,
		expectedSha256
	});
	let failed = false;
	let failure;
	let output;
	let close;
	try {
		close = document?.close;
		const sdk = document?.sdk;
		if (!document || typeof close !== "function" || !record$4(sdk)) throw new Error("InvalidOpenedDocument");
		if (document.format !== actualFormat) throw new Error("DocumentFormatMismatch");
		if (document.sourceSha256 !== sourceSha256) throw new Error("DocumentSnapshotSha256Mismatch");
		if (!uint$2(document.sectionCount) || document.sectionCount === 0 || document.sectionCount > 4096 || section >= document.sectionCount) throw new RangeError("InvalidParagraphSection");
		let displayText = null;
		let nativeText;
		if (actualFormat === "hwp5") {
			const countGetter = method(sdk, "paragraphCount"), textGetter = method(sdk, "text");
			if (!countGetter || !textGetter) throw new Error("ParagraphTextUnavailable");
			const count = countGetter(section);
			if (!uint$2(count)) throw new Error("InvalidParagraphInventory");
			if (paragraph >= count) throw new RangeError("ParagraphNotFound");
			nativeText = checkText(textGetter(section, paragraph));
		} else {
			displayText = paragraphSnapshot(sdk, section, paragraph);
			const textGetter = method(sdk, "anchorText");
			if (!textGetter) throw new Error("ParagraphTextUnavailable");
			nativeText = checkText(textGetter(section, paragraph));
		}
		const escape = createDisplayEscaper({
			format,
			view: "content"
		});
		const lines = [];
		let size = 0;
		const line = (value) => {
			size += encoder$1.encode(value).byteLength + 1;
			if (size > MAX_OUTPUT_BYTES) throw new RangeError("ParagraphDetailLimitExceeded");
			lines.push(value);
		};
		line(`문단: s${section}:p${paragraph}`);
		line(`nativeTextUnits: ${nativeText.length}`);
		line(displayText === null ? "displayText: 미관측 (단일 문단 표시 getter 없음)" : `displayText: ${escape(displayText)}`);
		line("expectedText (JSON ASCII):");
		if (format === "markdown") line("```json");
		line(asciiJson(nativeText));
		if (format === "markdown") line("```");
		const shape = shapeId(sdk, section, paragraph);
		const ranges = characterRanges(sdk, section, paragraph, nativeText.length);
		line(`paragraphShapeId: ${shape === null ? "미관측" : shape}`);
		line(`characterRanges: ${ranges === null ? "미관측" : JSON.stringify(ranges)}`);
		output = {
			schemaVersion: 1,
			format: actualFormat,
			sourceSha256,
			target: {
				section,
				paragraph
			},
			text: lines.join("\n") + "\n"
		};
	} catch (error) {
		failed = true;
		failure = error;
	}
	try {
		if (typeof close === "function") await close.call(document);
	} catch (error) {
		if (failed) throw new AggregateError([failure, error], "DocumentParagraphInspectionAndCloseFailed", { cause: failure });
		throw new Error("DocumentParagraphInspectionCloseFailed", { cause: error });
	}
	if (failed) throw failure;
	return output;
}
var MAX_DOCUMENT_BYTES, MAX_WASM_BYTES, MAX_TEXT_BYTES$2, MAX_OUTPUT_BYTES, MAX_ROWS$1, encoder$1, uint$2, record$4;
var init_document_paragraph = __esmMin((() => {
	init_document_format();
	init_render_escape();
	MAX_DOCUMENT_BYTES = 67108864;
	MAX_WASM_BYTES = 33554432;
	MAX_TEXT_BYTES$2 = 4194304;
	MAX_OUTPUT_BYTES = 65536;
	MAX_ROWS$1 = 1e5;
	encoder$1 = new TextEncoder();
	uint$2 = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4294967295;
	record$4 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
}));
// src/ocr/common.ts
function ownedBytes(value, maxBytes, name = "Ocr", allowEmpty = false) {
	if (!(value instanceof Uint8Array)) throw new TypeError("Expected" + name + "Uint8Array");
	if (!byteLength) throw new Error("TypedArrayLengthUnavailable");
	const length = byteLength.call(value);
	if (typeof length !== "number") throw new TypeError("InvalidOcrByteLength");
	if (!allowEmpty && length === 0 || length > maxBytes) throw new OcrError(name === "Ocr" ? "OcrInputLimitExceeded" : name + "LimitExceeded");
	const bytes = new Uint8Array(length);
	bytes.set(value);
	return bytes;
}
function ocrLimits(value = {}) {
	if (!isRecord(value)) throw new TypeError("InvalidOcrLimits");
	const result = { ...OCR_LIMITS };
	for (const [key, ceiling] of Object.entries(OCR_LIMITS)) {
		const limit = value[key] ?? ceiling;
		if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > ceiling) throw new RangeError("InvalidOcrLimit:" + key);
		result[key] = limit;
	}
	return result;
}
function ocrLanguages(value = "kor+eng") {
	const list = typeof value === "string" ? value.split("+") : value;
	const length = Array.isArray(list) ? list.length : 0;
	if (!Number.isSafeInteger(length) || length < 1 || length > 8) throw new TypeError("InvalidOcrLanguages");
	const result = [], seen = /* @__PURE__ */ new Set();
	for (let i = 0; i < length; i++) {
		const language = Array.isArray(list) ? list[i] : void 0;
		if (typeof language !== "string" || !/^[a-z]{3}(?:_[a-z0-9]{1,12})?$/u.test(language) || seen.has(language)) throw new TypeError("InvalidOcrLanguages");
		seen.add(language);
		result.push(language);
	}
	return result;
}
function imageInput(value, maxBytes) {
	const bytes = ownedBytes(value, maxBytes);
	const prefix = (...values) => values.every((byte, index) => bytes[index] === byte);
	if (!(prefix(137, 80, 78, 71, 13, 10, 26, 10) || prefix(255, 216, 255) || prefix(66, 77) || prefix(71, 73, 70, 56, 55, 97) || prefix(71, 73, 70, 56, 57, 97) || prefix(73, 73, 42, 0) || prefix(77, 77, 0, 42) || prefix(82, 73, 70, 70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80)) throw new OcrError("OcrInputUnsupported");
	return bytes;
}
async function recognizeImage(options = {}) {
	if (!isRecord(options)) throw new TypeError("InvalidOcrOptions");
	const { bytes, provider, languages = "kor+eng", limits } = options;
	const signal = ocrSignal(options.signal);
	const budget = ocrLimits(limits);
	const input = imageInput(bytes, budget.maxInputBytes);
	const requested = ocrLanguages(languages);
	if (signal?.aborted) throw new OcrError("OcrAborted");
	if (!isProvider(provider)) throw new OcrError("ProviderUnavailable");
	const result = await provider.recognize({
		bytes: input,
		languages: [...requested],
		limits: budget,
		signal
	});
	if (signal?.aborted) throw new OcrError("OcrAborted");
	const text = isRecord(result) ? result.text : void 0;
	if (typeof text !== "string") throw new OcrError("ProviderInvalidResponse");
	if (text.length > budget.maxOutputBytes) throw new OcrError("OcrOutputLimitExceeded");
	if (!text.isWellFormed()) throw new OcrError("ProviderInvalidResponse");
	if (new TextEncoder().encode(text).length > budget.maxOutputBytes) throw new OcrError("OcrOutputLimitExceeded");
	return {
		status: text.trim().length ? "recognized" : "no-text",
		text,
		languages: requested
	};
}
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function ocrSignal(value) {
	if (value === void 0) return void 0;
	if (!(value instanceof AbortSignal)) throw new TypeError("InvalidOcrSignal");
	return value;
}
function errorCode$1(value) {
	const code = isRecord(value) ? value.code : void 0;
	return typeof code === "string" ? code : void 0;
}
function isProvider(value) {
	return isRecord(value) && typeof value.recognize === "function" && (value.prepare === void 0 || typeof value.prepare === "function") && (value.id === void 0 || value.id === "tesseract" || value.id === "vision");
}
var OCR_LIMITS, OcrError, byteLength;
var init_common = __esmMin((() => {
	OCR_LIMITS = Object.freeze({
		maxInputBytes: 8388608,
		maxOutputBytes: 262144,
		maxStdoutBytes: 2097152,
		maxStderrBytes: 16384,
		timeoutMs: 3e4
	});
	OcrError = class extends Error {
		constructor(code, options = {}) {
			super(code, options.cause === void 0 ? void 0 : { cause: options.cause });
			this.name = "OcrError";
			this.code = code;
			this.reason = options.reason ?? code;
		}
	};
	byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), "byteLength")?.get;
}));
// src/ocr/process.ts
function runOcrProcess(options = {}) {
	if (!isRecord(options)) throw new TypeError("InvalidOcrExecutable");
	const { executable, args = [], input = /* @__PURE__ */ new Uint8Array(), limits } = options;
	const signal = ocrSignal(options.signal);
	const budget = ocrLimits(limits);
	const length = Array.isArray(args) ? args.length : -1;
	if (typeof executable !== "string" || !executable || !executable.isWellFormed() || executable.includes("\0") || !Number.isSafeInteger(length) || length < 0 || length > 32) throw new TypeError("InvalidOcrExecutable");
	const argv = [];
	for (let index = 0; index < length; index++) {
		const value = Array.isArray(args) ? args[index] : void 0;
		if (typeof value !== "string" || !value.isWellFormed() || value.includes("\0")) throw new TypeError("InvalidOcrExecutable");
		argv.push(value);
	}
	const owned = ownedBytes(input, budget.maxInputBytes, "Ocr", true);
	if (signal?.aborted) return Promise.reject(new OcrError("OcrAborted"));
	return new Promise((resolve, reject) => {
		const grouped = process.platform !== "win32";
		let child;
		let failure;
		let timer;
		let killer;
		const stdout = [], stderr = [];
		let outputBytes = 0, errorBytes = 0;
		const stop = (reason) => {
			failure ??= reason;
			if (!child) return;
			const ownedChild = child;
			const kill = (sig) => {
				try {
					if (grouped && ownedChild.pid) process.kill(-ownedChild.pid, sig);
					else ownedChild.kill(sig);
				} catch (error) {
					if (errorCode$1(error) !== "ESRCH") failure ??= new OcrError("OcrCleanupFailed", { cause: error });
				}
			};
			child.stdin?.destroy();
			kill("SIGTERM");
			killer ??= setTimeout(() => kill("SIGKILL"), 200);
		};
		const abort = () => stop(new OcrError("OcrAborted"));
		try {
			child = spawn(executable, argv, {
				shell: false,
				detached: grouped,
				windowsHide: true,
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				env: {
					...process.env,
					OMP_THREAD_LIMIT: "1"
				}
			});
		} catch (cause) {
			reject(new OcrError("ProviderUnavailable", { cause }));
			return;
		}
		signal?.addEventListener("abort", abort, { once: true });
		child.once("error", (cause) => stop(new OcrError(["ENOENT", "EACCES"].includes(errorCode$1(cause) ?? "") ? "ProviderUnavailable" : "OcrProcessFailed", { cause })));
		child.stdout.on("data", (chunk) => {
			outputBytes += chunk.length;
			if (outputBytes > budget.maxStdoutBytes) stop(new OcrError("OcrOutputLimitExceeded"));
			else stdout.push(Buffer.from(chunk));
		});
		child.stderr.on("data", (chunk) => {
			errorBytes += chunk.length;
			if (errorBytes > budget.maxStderrBytes) stop(new OcrError("OcrStderrLimitExceeded"));
			else stderr.push(Buffer.from(chunk));
		});
		child.stdin.on("error", (cause) => {
			if (errorCode$1(cause) !== "EPIPE") stop(new OcrError("OcrInputWriteFailed", { cause }));
		});
		const ownedChild = child;
		child.once("close", (code, terminationSignal) => {
			clearTimeout(timer);
			clearTimeout(killer);
			signal?.removeEventListener("abort", abort);
			if (grouped && ownedChild.pid) try {
				process.kill(-ownedChild.pid, "SIGKILL");
			} catch (error) {
				if (errorCode$1(error) !== "ESRCH") failure ??= new OcrError("OcrCleanupFailed", { cause: error });
			}
			if (failure) {
				reject(failure);
				return;
			}
			if (code !== 0 || terminationSignal) {
				const error = new OcrError("ProviderFailed", { reason: "NonzeroExit" });
				error.exitCode = code;
				error.stderr = Buffer.concat(stderr).toString("utf8");
				reject(error);
				return;
			}
			try {
				const decoder = new TextDecoder("utf-8", { fatal: true });
				resolve({
					stdout: decoder.decode(Buffer.concat(stdout)),
					stderr: decoder.decode(Buffer.concat(stderr)),
					exitCode: code
				});
			} catch (cause) {
				reject(new OcrError("ProviderInvalidResponse", { cause }));
			}
		});
		timer = setTimeout(() => stop(new OcrError("OcrTimeout")), budget.timeoutMs);
		if (signal?.aborted) abort();
		else child.stdin.end(owned);
	});
}
var init_process = __esmMin((() => {
	init_common();
}));
// src/ocr/vision.ts
var vision_exports = /* @__PURE__ */ __exportAll({ createVisionProvider: () => createVisionProvider });
function createVisionProvider(options = {}) {
	if (!isRecord(options)) throw new TypeError("InvalidOcrProviderOptions");
	const { run = runOcrProcess, platform = process.platform, executable } = options;
	if (typeof run !== "function" || typeof platform !== "string") throw new TypeError("InvalidOcrProviderOptions");
	const runner = run;
	if (executable !== void 0) throw new TypeError("VisionExecutableOverrideNotAllowed");
	const invoke = async (mode, input = {}) => {
		if (!isRecord(input)) throw new TypeError("InvalidOcrProviderOptions");
		const { bytes, languages = "kor+eng", limits } = input;
		const signal = ocrSignal(input.signal);
		if (platform !== "darwin") throw new OcrError("ProviderUnavailable", { reason: "MacOSRequired" });
		const requested = ocrLanguages(languages);
		const budget = ocrLimits(limits);
		if (requested.some((language) => !["kor", "eng"].includes(language))) throw new OcrError("ProviderUnavailable", { reason: "LanguageUnavailable" });
		const output = await runner({
			executable: "/usr/bin/osascript",
			args: [
				"-l",
				"JavaScript",
				"-e",
				script,
				mode,
				requested.join("+")
			],
			input: mode === "recognize" ? imageInput(bytes, budget.maxInputBytes) : /* @__PURE__ */ new Uint8Array(),
			limits: budget,
			signal
		});
		if (!isRecord(output) || typeof output.stdout !== "string") throw new OcrError("ProviderInvalidResponse");
		let result;
		try {
			result = JSON.parse(output.stdout);
		} catch (cause) {
			throw new OcrError("ProviderInvalidResponse", { cause });
		}
		if (!isRecord(result) || result.ok !== true) throw new OcrError(isRecord(result) && result.code === "ProviderUnavailable" ? "ProviderUnavailable" : "ProviderFailed", { reason: isRecord(result) && typeof result.reason === "string" ? result.reason : void 0 });
		return result;
	};
	return {
		id: "vision",
		prepare: (input) => invoke("prepare", input),
		recognize: (input) => invoke("recognize", input)
	};
}
var script;
var init_vision = __esmMin((() => {
	init_common();
	init_process();
	script = `function run(args) {
  ObjC.import('Vision');
  var requested = args[1].split('+');
  var mapping = {kor:'ko-KR', eng:'en-US'};
  var request = $.VNRecognizeTextRequest.alloc.init;
  request.recognitionLevel = $.VNRequestTextRecognitionLevelAccurate;
  request.usesLanguageCorrection = false;
  var error = Ref();
  var supported = ObjC.deepUnwrap(request.supportedRecognitionLanguagesAndReturnError(error));
  for (var i=0; i<requested.length; i++) {
    if (!mapping[requested[i]] || supported.indexOf(mapping[requested[i]]) < 0)
      return JSON.stringify({ok:false, code:'ProviderUnavailable', reason:'LanguageUnavailable'});
  }
  if (args[0] === 'prepare') return JSON.stringify({ok:true, languages:requested});
  request.recognitionLanguages = requested.map(function(x){return mapping[x];});
  var data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;
  var handler = $.VNImageRequestHandler.alloc.initWithDataOptions(data, $({}));
  if (!handler.performRequestsError($.NSArray.arrayWithObject(request), error))
    return JSON.stringify({ok:false, code:'ProviderFailed', reason:'VisionRequestFailed'});
  var observations = request.results;
  var lines = [];
  for (var j=0; observations && j<observations.count; j++) {
    var candidates = observations.objectAtIndex(j).topCandidates(1);
    if (candidates.count) lines.push(ObjC.unwrap(candidates.objectAtIndex(0).string));
  }
  return JSON.stringify({ok:true, text:lines.join('\\n'), languages:requested});
}`;
}));
// src/ocr/tesseract.ts
var tesseract_exports = /* @__PURE__ */ __exportAll({ createTesseractProvider: () => createTesseractProvider });
function createTesseractProvider(options = {}) {
	if (!isRecord(options)) throw new TypeError("InvalidOcrProviderOptions");
	const { executable = "tesseract", run = runOcrProcess } = options;
	if (typeof executable !== "string" || typeof run !== "function") throw new TypeError("InvalidOcrProviderOptions");
	const runner = run;
	const languageFailure = (value) => typeof value === "string" && /Failed loading language|Error opening data file|couldn't load any languages/iu.test(value);
	const checked = async (options) => {
		let output;
		try {
			output = await runner(options);
		} catch (error) {
			if (languageFailure(isRecord(error) ? error.stderr : void 0)) throw new OcrError("ProviderUnavailable", {
				reason: "LanguageModelUnavailable",
				cause: error
			});
			throw error;
		}
		if (!isRecord(output) || typeof output.stdout !== "string" || output.stderr !== void 0 && typeof output.stderr !== "string") throw new OcrError("ProviderInvalidResponse");
		if (languageFailure(output.stderr)) throw new OcrError("ProviderUnavailable", { reason: "LanguageModelUnavailable" });
		return {
			stdout: output.stdout,
			...output.stderr === void 0 ? {} : { stderr: output.stderr }
		};
	};
	return {
		id: "tesseract",
		async prepare(input = {}) {
			if (!isRecord(input)) throw new TypeError("InvalidOcrProviderOptions");
			const { languages = "kor+eng", limits } = input;
			const signal = ocrSignal(input.signal);
			const requested = ocrLanguages(languages);
			const output = await checked({
				executable,
				args: ["--list-langs"],
				limits: ocrLimits(limits),
				signal
			});
			const available = new Set(output.stdout.split(/\r?\n/u).map((line) => line.trim()));
			if (requested.some((language) => !available.has(language))) throw new OcrError("ProviderUnavailable", { reason: "LanguageUnavailable:" + requested.filter((language) => !available.has(language)).join("+") });
			return { languages: requested };
		},
		async recognize({ bytes, languages, limits, signal }) {
			const requested = ocrLanguages(languages);
			const budget = ocrLimits(limits);
			return { text: (await checked({
				executable,
				args: [
					"stdin",
					"stdout",
					"-l",
					requested.join("+"),
					"--psm",
					"3"
				],
				input: imageInput(bytes, budget.maxInputBytes),
				limits: budget,
				signal
			})).stdout };
		}
	};
}
var init_tesseract = __esmMin((() => {
	init_common();
	init_process();
}));
// src/document-images.ts
var document_images_exports = /* @__PURE__ */ __exportAll({
	DOCUMENT_IMAGE_LIMITS: () => DOCUMENT_IMAGE_LIMITS,
	DocumentImageError: () => DocumentImageError,
	createDocumentImages: () => createDocumentImages
});
function fail(code) {
	throw new DocumentImageError(code);
}
/** Encoded header identification only, never pixel decoding/image validity.
* Unknown or malformed headers remain extractable raw data; names/MIME declarations
* from a document are deliberately not consulted. */
function identify(bytes) {
	const at = (offset, text) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let type;
	if (bytes.length >= 33 && bytes[0] === 137 && at(1, "PNG\r\n\n") && view.getUint32(8) === 13 && at(12, "IHDR") && view.getUint32(16) > 0 && view.getUint32(20) > 0 && bytes[26] === 0 && bytes[27] === 0 && bytes[28] <= 1 && pngDepths[bytes[25]]?.includes(bytes[24])) type = ["image/png", ".png"];
	else if (bytes.length >= 13 && (at(0, "GIF87a") || at(0, "GIF89a")) && view.getUint16(6, true) > 0 && view.getUint16(8, true) > 0) type = ["image/gif", ".gif"];
	else if (bytes.length >= 54 && at(0, "BM") && view.getUint32(2, true) === bytes.length && view.getUint32(10, true) >= 54 && view.getUint32(10, true) <= bytes.length && view.getUint32(14, true) >= 40 && view.getUint32(14, true) <= bytes.length - 14 && view.getInt32(18, true) > 0 && view.getInt32(22, true) !== 0 && view.getUint16(26, true) === 1) type = ["image/bmp", ".bmp"];
	else if (bytes.length >= 20 && at(0, "RIFF") && at(8, "WEBP") && view.getUint32(4, true) === bytes.length - 8 && [
		"VP8 ",
		"VP8L",
		"VP8X"
	].some((tag) => at(12, tag)) && view.getUint32(16, true) <= bytes.length - 20) type = ["image/webp", ".webp"];
	else if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
		let offset = 2, markers = 0;
		while (offset + 4 <= bytes.length && markers++ < 4096) {
			if (bytes[offset] !== 255) break;
			const marker = bytes[offset + 1], length = view.getUint16(offset + 2);
			if (length < 2 || length > bytes.length - offset - 2) break;
			if ([
				192,
				193,
				194,
				195,
				197,
				198,
				199,
				201,
				202,
				203,
				205,
				206,
				207
			].includes(marker)) {
				if (length >= 8 && view.getUint16(offset + 5) > 0 && view.getUint16(offset + 7) > 0) type = ["image/jpeg", ".jpg"];
				break;
			}
			if (marker === 218 || marker === 217) break;
			offset += 2 + length;
		}
	}
	return type ? {
		mime: type[0],
		extension: type[1],
		recognized: true,
		validation: "signature-and-header-only"
	} : {
		mime: "application/octet-stream",
		extension: ".bin",
		recognized: false,
		validation: "unrecognized-or-unsupported-header"
	};
}
function createDocumentImages({ sdk, format, sourceSha256, sectionCount, limits = {} } = {}) {
	if (format !== "hwp5" && format !== "hwpx") fail("InvalidDocumentFormat");
	if (!digest(sourceSha256)) fail("InvalidSourceSha256");
	if (!sdk || typeof sdk !== "object") fail("MissingSdk");
	if (typeof sectionCount !== "number" || !Number.isInteger(sectionCount) || sectionCount < 1 || sectionCount > 4096) fail("SectionLimitExceeded");
	if (!limits || typeof limits !== "object" || Array.isArray(limits) || Object.keys(limits).some((key) => !Object.hasOwn(DOCUMENT_IMAGE_LIMITS, key))) fail("InvalidImageLimits");
	const budget = {
		...DOCUMENT_IMAGE_LIMITS,
		...limits
	};
	for (const [key, value] of Object.entries(budget)) if (!Number.isSafeInteger(value) || value < 1 || value > {
		maxImages: 4096,
		maxBytes: 33554432,
		maxTotalBytes: 67108864
	}[key]) fail("InvalidImageLimits");
	const rows = /* @__PURE__ */ new Map(), resources = /* @__PURE__ */ new Map();
	let totalBytes = 0, closed = false, borrowed = sdk;
	const ready = () => {
		if (closed) fail("DocumentImagesClosed");
	};
	for (let section = 0; section < sectionCount; section++) {
		let sites;
		const inventoryMethod = format === "hwp5" ? "pictureSources" : "pictureSites";
		if (typeof Reflect.get(sdk, inventoryMethod) !== "function") throw new DocumentImageError("ImageInventoryUnavailable", "unsupported", "PictureInventoryApiUnavailable");
		try {
			sites = invoke$1(sdk, inventoryMethod, format === "hwp5" ? [section, "base73"] : [section]);
		} catch (error) {
			throw new DocumentImageError("ImageInventoryUnavailable", /AbiUnavailable|Unsupported/.test(errorMessage(error) ?? "") ? "unsupported" : "failed");
		}
		if (!isRows(sites)) fail("InvalidImageInventory");
		if (sites.length > budget.maxImages - rows.size) fail("ImageCountLimitExceeded");
		if (format === "hwp5") validateHwp5PictureSources(sites);
		for (const row of sites) {
			if (!record$3(row)) fail("InvalidImageIdentity");
			const node = format === "hwp5" ? row.component_node : row.pictureNode;
			if (!uint$1(node)) fail("InvalidImageIdentity");
			if (format === "hwpx" && (typeof row.state !== "string" || !siteStates.has(row.state) || !(row.paragraph === null || uint$1(row.paragraph) && row.paragraph > 0) || !(row.anchorUnit === null || uint$1(row.anchorUnit)))) fail("InvalidImageInventory");
			if (format === "hwp5" && (!uint$1(row.picture_node) || !uint$1(row.owner_node) || !uint$1(row.bin_data_id))) fail("InvalidImageInventory");
			const id = canonicalImageId({
				format,
				section,
				node
			});
			if (rows.has(id)) fail("DuplicateImageIdentity");
			const source = format === "hwp5" ? {
				section,
				pictureNode: node,
				recordNode: row.picture_node,
				ownerNode: row.owner_node,
				resourceOrdinal: row.bin_data_id
			} : {
				section,
				pictureNode: node,
				paragraph: row.paragraph,
				anchorUnit: row.anchorUnit
			};
			const resourceKey = format === "hwp5" ? `docinfo:${row.bin_data_id}` : `source:${section}:${node}`;
			const entry = {
				id,
				source,
				resourceKey,
				status: "unread",
				reason: "PayloadNotRead",
				mime: null,
				extension: null,
				recognized: null,
				validation: "not-read",
				byteLength: null
			};
			rows.set(id, entry);
			if (!resources.has(resourceKey)) resources.set(resourceKey, {
				refs: [],
				bytes: null,
				error: null
			});
			resources.get(resourceKey).refs.push(entry);
		}
	}
	sdk = null;
	const copy = (entry) => ({
		...entry,
		source: { ...entry.source }
	});
	return {
		list() {
			ready();
			return {
				version: 1,
				format,
				sourceSha256,
				images: [...rows.values()].map(copy),
				limits: { ...budget },
				budget: {
					retainedUniqueBytes: totalBytes,
					resourceKeys: resources.size
				},
				coverage: {
					scope: "section-picture-sites",
					sectionCount,
					references: rows.size,
					inventoryComplete: true,
					payloadsRead: [...rows.values()].filter((row) => row.status === "ready").length,
					payloadsFailed: [...rows.values()].filter((row) => row.status === "failed" || row.status === "unsupported").length,
					resourceIdentity: format === "hwp5" ? "docinfo-ordinal" : "picture-source-node",
					masterPagesIncluded: false,
					imageBrushesIncluded: false
				},
				nativePayloadLimitBytes: format === "hwp5" ? budget.maxBytes : 67108864,
				jsByteLimitTiming: format === "hwp5" ? "native-decoded-payload-limit" : "after-native-payload-copy"
			};
		},
		read(id, options) {
			ready();
			if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((k) => k !== "sourceSha256") || !("sourceSha256" in options) || !digest(options.sourceSha256)) fail("InvalidSourceSha256");
			if (!options || typeof options !== "object" || !("sourceSha256" in options) || options.sourceSha256 !== sourceSha256) fail("SourceSha256Mismatch");
			if (typeof id !== "string" || id.length > 80 || !/^(hwp5|hwpx):s(0|[1-9][0-9]*):i(0|[1-9][0-9]*)$/.test(id)) fail("InvalidImageId");
			const entry = rows.get(id);
			if (!entry) fail("UnknownImageId");
			const resource = resources.get(entry.resourceKey);
			if (!resource) fail("UnknownImageResource");
			if (!borrowed) fail("DocumentImagesClosed");
			if (!resource.bytes && !resource.error) try {
				if (typeof Reflect.get(borrowed, format === "hwp5" ? "binaryResource" : "pictureBytes") !== "function") throw new Error(format === "hwp5" ? "Hwp5BinaryResourceAbiUnavailable" : "HwpxPictureBytesAbiUnavailable");
				const result = format === "hwp5" ? invoke$1(borrowed, "binaryResource", [entry.source.resourceOrdinal, { maxBytes: budget.maxBytes }]) : invoke$1(borrowed, "pictureBytes", [entry.source.section, entry.source.pictureNode]);
				if (!(result instanceof Uint8Array)) fail("InvalidImageBytes");
				if (!result.length) fail("EmptyImageBytes");
				if (result.length > budget.maxBytes) fail("ImageBytesLimitExceeded");
				if (result.length > budget.maxTotalBytes - totalBytes) fail("ImageTotalBytesLimitExceeded");
				const bytes = Uint8Array.from(result), metadata = identify(bytes);
				resource.bytes = bytes;
				totalBytes += bytes.length;
				for (const ref of resource.refs) Object.assign(ref, metadata, {
					status: "ready",
					reason: metadata.recognized ? null : "UnrecognizedOrUnsupportedImageHeader",
					byteLength: bytes.length
				});
			} catch (error) {
				const code = error instanceof DocumentImageError ? error.code : unsupported$1.has(errorMessage(error) ?? "") ? errorMessage(error) : errorMessage(error) === "LimitExceeded" ? "ImageBytesLimitExceeded" : "NativeImageReadFailed";
				const status = unsupported$1.has(code) ? "unsupported" : "failed";
				resource.error = {
					code,
					status
				};
				for (const ref of resource.refs) Object.assign(ref, {
					status,
					reason: code
				});
			}
			if (resource.error) throw new DocumentImageError(resource.error.code, resource.error.status);
			if (!resource.bytes) fail("InvalidImageBytes");
			return {
				...copy(entry),
				sourceSha256,
				bytes: Uint8Array.from(resource.bytes)
			};
		},
		close() {
			closed = true;
			borrowed = null;
			resources.clear();
			rows.clear();
			totalBytes = 0;
		}
	};
}
var DOCUMENT_IMAGE_LIMITS, uint$1, digest, siteStates, unsupported$1, DocumentImageError, pngDepths, isRows, record$3, errorMessage, invoke$1;
var init_document_images = __esmMin((() => {
	init_hwp5_picture_sources();
	init_object_reference();
	DOCUMENT_IMAGE_LIMITS = Object.freeze({
		maxImages: 4096,
		maxBytes: 8388608,
		maxTotalBytes: 33554432
	});
	uint$1 = (n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 4294967295;
	digest = (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
	siteStates = /* @__PURE__ */ new Set([
		"located",
		"conditional",
		"unsupported_anchor",
		"missing_host",
		"ambiguous_host"
	]);
	unsupported$1 = /* @__PURE__ */ new Set([
		"ExternalLink",
		"ExternalPictureImage",
		"UnsupportedBinDataType",
		"AbsentBinaryResource",
		"MissingPictureImage",
		"UnsupportedPictureDisplayHost",
		"UnsupportedPictureDisplayNode",
		"UnsupportedPictureSwitchHost",
		"UnsupportedPictureAnchor",
		"Hwp5BinaryResourceAbiUnavailable",
		"HwpxPictureBytesAbiUnavailable"
	]);
	DocumentImageError = class extends Error {
		code;
		status;
		reason;
		constructor(code, status = "failed", reason = code) {
			super(code);
			this.name = "DocumentImageError";
			this.code = code;
			this.status = status;
			this.reason = reason;
		}
	};
	pngDepths = {
		0: [
			1,
			2,
			4,
			8,
			16
		],
		2: [8, 16],
		3: [
			1,
			2,
			4,
			8
		],
		4: [8, 16],
		6: [8, 16]
	};
	isRows = (value) => Array.isArray(value);
	record$3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	errorMessage = (error) => error !== null && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : void 0;
	invoke$1 = (sdk, method, args) => {
		const fn = Reflect.get(sdk, method);
		if (typeof fn !== "function") throw Error("MissingSdkMethod");
		return Reflect.apply(fn, sdk, args);
	};
}));
// src/document-ocr.ts
var document_ocr_exports = /* @__PURE__ */ __exportAll({
	OcrError: () => OcrError,
	ocrDocument: () => ocrDocument
});
async function providerFactory({ provider, executable }) {
	if (provider === "vision") return (await Promise.resolve().then(() => (init_vision(), vision_exports))).createVisionProvider({ executable });
	return (await Promise.resolve().then(() => (init_tesseract(), tesseract_exports))).createTesseractProvider({ executable });
}
function snapshot(bytes, name) {
	return ownedBytes(bytes, 67108864, name);
}
function documentHandle(value) {
	return isRecord(value) && typeof value.close === "function";
}
function imageCollector(value) {
	return isRecord(value) && typeof value.list === "function" && typeof value.read === "function" && typeof value.close === "function";
}
async function ocrDocument(options = {}, dependencies = {}) {
	if (!isRecord(options)) throw new TypeError("InvalidOcrOptions");
	const { bytes, wasm, reference, provider = "tesseract", languages = "kor+eng", executable, format = "text", limits } = options;
	const signal = ocrSignal(options.signal);
	const input = snapshot(bytes, "Document"), binary = snapshot(wasm, "Wasm");
	if (provider !== "tesseract" && provider !== "vision") throw new TypeError("InvalidOcrProvider");
	if (executable !== void 0 && typeof executable !== "string") throw new TypeError("InvalidOcrExecutable");
	if (provider === "vision" && executable !== void 0) throw new TypeError("VisionExecutableOverrideNotAllowed");
	if (format !== "text" && format !== "markdown") throw new TypeError("InvalidRenderFormat");
	if (reference !== void 0 && typeof reference !== "string") throw new TypeError("InvalidObjectReference");
	const requested = ocrLanguages(languages), budget = ocrLimits(limits);
	const target = reference === void 0 ? null : parseObjectReference(reference);
	if (target && target.kind !== "image") throw new TypeError("ExpectedImageReference");
	const digest = await crypto.subtle.digest("SHA-256", input);
	const sourceSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
	if (target) parseObjectReference(reference, { sourceSha256 });
	if (signal?.aborted) throw new OcrError("OcrAborted");
	const selectedProvider = await (dependencies.createProvider ?? providerFactory)({
		provider,
		executable
	});
	if (!isProvider(selectedProvider) || typeof selectedProvider.prepare !== "function") throw new OcrError("ProviderUnavailable");
	await selectedProvider.prepare({
		languages: [...requested],
		limits: budget,
		signal
	});
	const document = await (dependencies.openDocument ?? (await Promise.resolve().then(() => (init_engine(), engine_exports))).openDocument)({
		bytes: input,
		wasm: binary,
		expectedSha256: sourceSha256
	});
	if (!documentHandle(document)) throw new Error("InvalidOcrDocumentSnapshot");
	let images;
	let result;
	let failed = false;
	let primary;
	try {
		if (document.format !== "hwp5" && document.format !== "hwpx" || document.sourceSha256 !== sourceSha256 || typeof document.sectionCount !== "number" || !Number.isInteger(document.sectionCount) || document.sectionCount < 1 || document.sectionCount > 4096) throw new Error("InvalidOcrDocumentSnapshot");
		if (target) parseObjectReference(reference, {
			sourceSha256,
			format: document.format
		});
		const candidate = await (dependencies.createDocumentImages ?? (await Promise.resolve().then(() => (init_document_images(), document_images_exports))).createDocumentImages)({
			sdk: document.sdk,
			format: document.format,
			sourceSha256,
			sectionCount: document.sectionCount
		});
		if (!imageCollector(candidate)) throw new Error("InvalidOcrImageInventory");
		images = candidate;
		const inventory = await images.list();
		if (!isRecord(inventory) || inventory.version !== 1 || inventory.format !== document.format || inventory.sourceSha256 !== sourceSha256 || !Array.isArray(inventory.images)) throw new Error("InvalidOcrImageInventory");
		const rows = inventory.images;
		const count = rows.length;
		if (count > 4096) throw new OcrError("OcrImageCountLimitExceeded");
		const selected = [], ids = /* @__PURE__ */ new Set();
		for (let index = 0; index < count; index++) {
			const row = rows[index];
			if (!isRecord(row) || !isRecord(row.source)) throw new Error("InvalidOcrImageInventory");
			const section = row.source.section, node = row.source.pictureNode;
			if (typeof section !== "number" || typeof node !== "number") throw new Error("InvalidOcrImageInventory");
			const id = canonicalImageId({
				format: document.format,
				section,
				node
			});
			if (row.id !== id || ids.has(id) || section >= document.sectionCount) throw new Error("InvalidOcrImageInventory");
			ids.add(id);
			const ref = buildObjectReference({
				sourceSha256,
				format: document.format,
				section,
				kind: "image",
				node
			});
			if (!target || ref === reference) selected.push({
				id,
				reference: ref
			});
		}
		if (target && selected.length !== 1) throw new Error("ObjectReferenceNotFound");
		const escape = createDisplayEscaper({
			format,
			view: "content"
		});
		const lines = [], results = [];
		let outputBytes = 0, totalInputBytes = 0, inputExhausted = false;
		const line = (text) => {
			outputBytes += new TextEncoder().encode(text).length + 1;
			if (outputBytes > 4194304) throw new OcrError("OcrOutputLimitExceeded");
			lines.push(text);
		};
		line(`OCR 공급자: ${provider}; 언어: ${requested.join("+")}`);
		line("구역 이미지의 명시 OCR 결과입니다. 바탕쪽·브러시·페이지 렌더링은 포함하지 않습니다.");
		for (const entry of selected) {
			if (signal?.aborted) throw new OcrError("OcrAborted");
			let observed;
			try {
				if (inputExhausted) throw new OcrError("OcrTotalInputLimitExceeded");
				const payload = await images.read(entry.id, { sourceSha256 });
				if (!isRecord(payload) || payload.id !== entry.id || payload.sourceSha256 !== sourceSha256 || payload.status !== "ready" || !(payload.bytes instanceof Uint8Array)) throw new Error("InvalidOcrImagePayload");
				totalInputBytes += payload.bytes.length;
				if (totalInputBytes > 33554432) {
					inputExhausted = true;
					throw new OcrError("OcrTotalInputLimitExceeded");
				}
				observed = await recognizeImage({
					bytes: payload.bytes,
					provider: selectedProvider,
					languages: requested,
					limits: budget,
					signal
				});
			} catch (error) {
				const code = errorCode$1(error);
				if (code === "ProviderUnavailable" || code === "OcrAborted") throw error;
				observed = {
					status: "failed",
					text: "",
					error: code ?? "OcrImageFailed"
				};
			}
			const row = {
				...entry,
				...observed
			};
			results.push(row);
			line(`[이미지 ${results.length}: ${entry.reference}] OCR ${row.status}`);
			if (row.status === "failed") line(escape("OCR 실패: " + row.error));
			else if (row.status === "no-text") line("[OCR 공급자가 인식한 텍스트 없음]");
			else for (const logicalLine of row.text.split(/\r?\n/u)) line(escape(logicalLine));
		}
		if (!selected.length) line("[OCR 대상 구역 이미지 없음]");
		const failures = results.filter((row) => row.status === "failed").length;
		const status = failures ? failures === results.length ? "failed" : "partial" : "complete";
		result = {
			schemaVersion: 1,
			format: document.format,
			sourceSha256,
			provider,
			languages: requested,
			status,
			images: results,
			text: lines.join("\n") + "\n"
		};
	} catch (error) {
		failed = true;
		primary = error;
	}
	const errors = failed ? [primary] : [];
	if (images) try {
		await images.close();
	} catch (error) {
		errors.push(error);
	}
	try {
		await document.close();
	} catch (error) {
		errors.push(error);
	}
	if (errors.length > 1) throw new AggregateError(errors, "DocumentOcrAndCloseFailed", { cause: errors[0] });
	if (errors.length) throw errors[0];
	if (!result) throw new Error("InvalidOcrResult");
	return result;
}
var init_document_ocr = __esmMin((() => {
	init_object_reference();
	init_render_escape();
	init_common();
}));
// ../../js/new-document.mjs
/** A constructor gets a fresh instance; it cannot mutate a live editor session. */
async function createNewDocumentBytes(source, format = "hwpx") {
	if (!["hwp5", "hwpx"].includes(format)) throw Error("InvalidDocumentFormat");
	const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
	const { exports: wasm } = await WebAssembly.instantiate(module, {});
	return copyNewDocumentOutput(wasm, format);
}
/** ABI boundary kept independently testable without a Native build. */
function copyNewDocumentOutput(wasm, format = "hwpx") {
	if (!["hwp5", "hwpx"].includes(format)) throw Error("InvalidDocumentFormat");
	for (const name of [
		"new_document_create",
		"new_document_output_ptr",
		"new_document_output_len",
		"new_document_output_free",
		"cfb_error_ptr",
		"cfb_error_len"
	]) if (typeof wasm[name] !== "function") throw Error("NewDocumentUnsupported");
	if (!(wasm.memory instanceof WebAssembly.Memory)) throw Error("MissingNewDocumentMemory");
	const memory = createMemory(wasm);
	try {
		if (wasm.new_document_create(format === "hwp5" ? 1 : 2) !== 1) throw memory.error();
		const ptr = wasm.new_document_output_ptr();
		const len = wasm.new_document_output_len();
		if (!Number.isSafeInteger(ptr) || !Number.isSafeInteger(len) || ptr < 0 || len <= 0 || ptr > wasm.memory.buffer.byteLength - len) throw Error("InvalidNewDocumentOutput");
		return memory.copy(ptr, len);
	} finally {
		wasm.new_document_output_free();
	}
}
var init_new_document = __esmMin((() => {
	init_wasm_memory();
}));
// src/document-create.ts
var document_create_exports = /* @__PURE__ */ __exportAll({
	DOCUMENT_CREATE_LIMITS: () => DOCUMENT_CREATE_LIMITS,
	createDocument: () => createDocument
});
async function createDocument(input = {}, dependencies = {}) {
	if (!input || typeof input !== "object") throw new TypeError("InvalidCreationInput");
	const { format, text = "", wasm, allowStaleLayout = false } = input;
	if (format !== "hwp5" && format !== "hwpx") throw new TypeError("InvalidDocumentFormat");
	if (typeof allowStaleLayout !== "boolean") throw new TypeError("InvalidAllowStaleLayout");
	if (typeof text !== "string" || !text.isWellFormed()) throw new TypeError("InvalidCreationText");
	if (text.length > DOCUMENT_CREATE_LIMITS.maxTextBytes || new TextEncoder().encode(text).length > DOCUMENT_CREATE_LIMITS.maxTextBytes) throw new RangeError("CreationTextLimitExceeded");
	const normalized = normalizeParagraphReplacement(text);
	if (/[\u0000-\u0009\u000b-\u001f\u0085\u2028\u2029]/u.test(normalized)) throw new Error("UnsupportedCreationControl");
	const lines = normalized.split("\n");
	if (lines.length > DOCUMENT_CREATE_LIMITS.maxParagraphs) throw new RangeError("CreationParagraphLimitExceeded");
	if (!(wasm instanceof Uint8Array)) throw new TypeError("ExpectedWasmUint8Array");
	if (!wasm.byteLength || wasm.byteLength > DOCUMENT_CREATE_LIMITS.maxBinaryBytes) throw new RangeError("WasmLimitExceeded");
	const binary = Uint8Array.from(wasm);
	const make = dependencies.createNewDocumentBytes ?? createNewDocumentBytes;
	const document = await (dependencies.openDocument ?? openDocument)({
		bytes: await make(binary, format),
		wasm: binary
	});
	let failed = false, failure;
	let result;
	try {
		if (document.format !== format || document.sectionCount !== 1) throw new Error("InvalidBlankDocument");
		if (document.format === "hwpx") {
			const sdk = document.sdk;
			const rows = sdk.paragraphTextSnapshot(0);
			if (!Array.isArray(rows) || rows.length !== 1 || !Number.isInteger(rows[0].paragraph) || rows[0].paragraph < 1 || rows[0].text !== "" || rows[0].nested !== false) throw new Error("InvalidBlankDocument");
			if (normalized !== "") sdk.replaceParagraphRanges({
				properties: void 0,
				ranges: [{
					section: 0,
					paragraph: rows[0].paragraph,
					startUnit: 0,
					endUnit: 0
				}],
				text: normalized
			});
			if (sdk.paragraphTextSnapshot(0).length !== lines.length) throw new Error("CreatedParagraphCountMismatch");
		} else {
			const sdk = document.sdk;
			const flow = sdk.paragraphFlow(0);
			if (!Array.isArray(flow) || flow.length !== 1 || sdk.paragraphCount(0) !== 1 || !Number.isInteger(flow[0].paragraph) || flow[0].paragraph < 0 || flow[0].host !== "body" || flow[0].top_level !== true) throw new Error("InvalidBlankDocument");
			const paragraph = flow[0].paragraph;
			const current = sdk.text(0, paragraph);
			if (typeof current !== "string" || !current.endsWith("\r")) throw new Error("InvalidBlankDocument");
			const end = current.length - 1;
			if (lines[0] !== "") sdk.splice({
				section: 0,
				paragraph,
				startUnit: end,
				endUnit: end,
				text: lines[0]
			});
			if (lines.length > 1) {
				sdk.splitParagraph({
					section: 0,
					paragraph,
					atUnit: end + lines[0].length
				});
				const after = sdk.paragraphFlow(0);
				const continuations = after.filter((row) => row.paragraph !== paragraph);
				if (after.length !== 2 || continuations.length !== 1 || continuations[0].generated !== true || continuations[0].host !== "body" || !Number.isInteger(continuations[0].paragraph) || continuations[0].paragraph < 0) throw new Error("InvalidCreatedContinuation");
				const remaining = normalized.slice(normalized.indexOf("\n") + 1);
				if (remaining !== "") sdk.replaceParagraphRanges({
					properties: void 0,
					ranges: [{
						section: 0,
						paragraph: continuations[0].paragraph,
						startUnit: 0,
						endUnit: 0
					}],
					text: remaining
				});
			}
			if (sdk.paragraphCount(0) !== lines.length) throw new Error("CreatedParagraphCountMismatch");
		}
		const saved = document.save({ allowStaleLayout });
		const metadata = saved && typeof saved === "object" ? saved : void 0;
		const bytes = format === "hwp5" ? metadata?.bytes : saved;
		const layoutRequiresReflow = format === "hwp5" ? metadata?.layoutRequiresReflow : false;
		if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > DOCUMENT_CREATE_LIMITS.maxBinaryBytes || typeof layoutRequiresReflow !== "boolean" || detectDocumentFormat(bytes) !== format) throw new Error("InvalidCreatedDocumentOutput");
		if (layoutRequiresReflow && !allowStaleLayout) throw new Error("LayoutReflowRequired");
		result = {
			schemaVersion: 1,
			format,
			bytes: Uint8Array.from(bytes),
			paragraphCount: lines.length,
			layoutRequiresReflow
		};
	} catch (error) {
		failed = true;
		failure = error;
	}
	try {
		await document.close();
	} catch (error) {
		if (failed) throw new AggregateError([failure, error], "DocumentCreationAndCloseFailed", { cause: failure });
		throw new Error("DocumentCreationCloseFailed", { cause: error });
	}
	if (failed) throw failure;
	if (!result) throw new Error("MissingCreatedDocumentOutput");
	return result;
}
var DOCUMENT_CREATE_LIMITS;
var init_document_create = __esmMin((() => {
	init_new_document();
	init_paragraph_replacement();
	init_document_format();
	init_engine();
	DOCUMENT_CREATE_LIMITS = Object.freeze({
		maxTextBytes: 4194304,
		maxParagraphs: 4096,
		maxBinaryBytes: 67108864
	});
}));
// src/document-convert.ts
var document_convert_exports = /* @__PURE__ */ __exportAll({
	DocumentConversionError: () => DocumentConversionError,
	convertDocument: () => convertDocument
});
function bodyText(model, report) {
	if (model?.version !== 1 || !Array.isArray(model.sections) || !Array.isArray(model.unplaced)) throw new DocumentConversionError("InvalidConversionModel", report);
	if (model.coverage?.unreadableSections !== 0 || model.coverage?.paragraphTotal !== model.coverage?.observedParagraphs || model.unplaced.length !== 0) throw new DocumentConversionError("TextOnlySourceIncomplete", report);
	const lines = [];
	const seen = /* @__PURE__ */ new Set();
	const stack = [];
	let units = 0;
	for (let i = model.sections.length - 1; i >= 0; i--) {
		const body = model.sections[i]?.body;
		if (!Array.isArray(body)) throw new DocumentConversionError("InvalidConversionModel", report);
		for (let j = body.length - 1; j >= 0; j--) stack.push({
			block: body[j],
			depth: 0
		});
	}
	while (stack.length) {
		const next = stack.pop();
		if (!next) throw new DocumentConversionError("InvalidConversionModel", report);
		const { block, depth } = next;
		if (!block || typeof block !== "object" || seen.has(block) || depth > LIMITS$1.maxDepth) throw new DocumentConversionError("InvalidConversionModel", report);
		seen.add(block);
		if (seen.size > LIMITS$1.maxBlocks) throw new DocumentConversionError("ConversionBlockLimitExceeded", report);
		if (block.type === "paragraph") {
			if (typeof block.displayText !== "string" || !block.displayText.isWellFormed()) throw new DocumentConversionError("TextOnlySourceIncomplete", report);
			units += block.displayText.length + (lines.length ? 1 : 0);
			if (units > DOCUMENT_CREATE_LIMITS.maxTextBytes) throw new DocumentConversionError("ConversionTextLimitExceeded", report);
			lines.push(block.displayText);
			if (lines.length > DOCUMENT_CREATE_LIMITS.maxParagraphs) throw new DocumentConversionError("ConversionParagraphLimitExceeded", report);
			if (block.displayText === "") report.emptyParagraphs++;
		} else if (block.type === "table") {
			report.flattenedTables++;
			if (!Array.isArray(block.cells)) throw new DocumentConversionError("InvalidConversionModel", report);
			for (let i = block.cells.length - 1; i >= 0; i--) {
				const cell = block.cells[i];
				if (cell?.contentState !== "observed" || !Array.isArray(cell.blocks)) throw new DocumentConversionError("TextOnlySourceIncomplete", report);
				for (let j = cell.blocks.length - 1; j >= 0; j--) stack.push({
					block: cell.blocks[j],
					depth: depth + 1
				});
			}
		} else {
			if (typeof (block.type === "unknown" ? block.kind : block.type) !== "string") throw new DocumentConversionError("InvalidConversionModel", report);
			report.droppedObjectCount++;
		}
	}
	report.bodyParagraphs = lines.length;
	return lines.join("\n");
}
async function convertDocument(input = {}, dependencies = {}) {
	if (!input || typeof input !== "object") throw new TypeError("InvalidConversionInput");
	const { bytes, wasm, to, lossPolicy = "reject", allowStaleLayout = false, expectedSha256 } = input;
	if (to !== "hwp5" && to !== "hwpx") throw new TypeError("InvalidDocumentFormat");
	if (lossPolicy !== "reject" && lossPolicy !== "text-only") throw new TypeError("InvalidLossPolicy");
	if (typeof allowStaleLayout !== "boolean") throw new TypeError("InvalidAllowStaleLayout");
	if (!(wasm instanceof Uint8Array)) throw new TypeError("ExpectedWasmUint8Array");
	if (!wasm.byteLength || wasm.byteLength > DOCUMENT_CREATE_LIMITS.maxBinaryBytes) throw new RangeError("WasmLimitExceeded");
	if (!(bytes instanceof Uint8Array)) throw new TypeError("ExpectedUint8Array");
	if (expectedSha256 !== void 0 && typeof expectedSha256 !== "string") throw new TypeError("InvalidExpectedSha256");
	const binary = Uint8Array.from(wasm);
	const open = dependencies.openDocument ?? openDocument;
	const collect = dependencies.readDocumentModel ?? readDocumentModel;
	const create = dependencies.createDocument ?? createDocument;
	const document = await open({
		bytes,
		wasm: binary,
		expectedSha256
	});
	let source;
	const report = {
		lossPolicy,
		lossless: false,
		sourceFormat: null,
		targetFormat: to,
		preserved: "관측된 본문 문단 문자열·순서·빈 문단·Unicode만 보존",
		notPreserved: [...OMITTED],
		tableTraversal: "관측된 셀 순서로 본문을 평탄화하며 표 구조는 보존하지 않음",
		bodyParagraphs: 0,
		emptyParagraphs: 0,
		flattenedTables: 0,
		droppedObjectCount: 0,
		lineBreakPolicy: "CRLF와 CR은 공통 생성 정책에 따라 LF 문단 경계로 정규화"
	};
	let failed = false, failure;
	let text;
	try {
		const { format: sourceFormat, sourceSha256, sectionCount, sdk } = document;
		source = {
			format: sourceFormat,
			sourceSha256
		};
		report.sourceFormat = sourceFormat;
		if (!["hwp5", "hwpx"].includes(sourceFormat)) throw new DocumentConversionError("InvalidConversionSourceFormat", report);
		if (sourceFormat === to) throw new DocumentConversionError("SameDocumentFormat", report);
		if (lossPolicy === "reject") throw new DocumentConversionError("UnsupportedDocumentConversion", report);
		const model = await collect({
			format: sourceFormat,
			sourceSha256,
			sectionCount,
			sdk
		});
		if (model?.format !== sourceFormat || model.sourceSha256 !== sourceSha256) throw new DocumentConversionError("InvalidConversionModel", report);
		report.sourceInventoryComplete = model.coverage?.inventoryComplete ?? null;
		report.sourceObjectsKnown = model.coverage?.objectsKnown ?? null;
		report.warningCount = Array.isArray(model.warnings) ? model.warnings.length : null;
		report.warningCodes = Array.isArray(model.warnings) ? model.warnings.slice(0, 64).map((row) => row.code) : [];
		report.warningDetailsOmitted = Math.max(0, (report.warningCount ?? 0) - 64);
		text = bodyText(model, report);
	} catch (error) {
		failed = true;
		failure = error;
	}
	try {
		await document.close();
	} catch (error) {
		if (failed) throw new AggregateError([failure, error], "DocumentConversionAndCloseFailed", { cause: failure });
		throw new Error("DocumentConversionCloseFailed", { cause: error });
	}
	if (failed) throw failure;
	if (!source || text === void 0 || lossPolicy !== "text-only") throw new DocumentConversionError("MissingConversionText", report);
	let output;
	try {
		output = await create({
			format: to,
			text,
			wasm: binary,
			allowStaleLayout
		});
		if (output?.format !== to || !(output.bytes instanceof Uint8Array) || !output.bytes.byteLength || output.bytes.byteLength > DOCUMENT_CREATE_LIMITS.maxBinaryBytes || typeof output.layoutRequiresReflow !== "boolean" || detectDocumentFormat(output.bytes) !== to) throw new Error("InvalidConvertedDocumentOutput");
	} catch (error) {
		throw new DocumentConversionError(error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : error instanceof Error ? error.message : "ConversionCreationFailed", report, { cause: error });
	}
	return {
		...output,
		sourceFormat: source.format,
		sourceSha256: source.sourceSha256,
		lossPolicy,
		lossless: false,
		report
	};
}
var OMITTED, DocumentConversionError;
var init_document_convert = __esmMin((() => {
	init_engine();
	init_document_model();
	init_common$1();
	init_document_create();
	init_document_format();
	OMITTED = Object.freeze([
		"글자·문단 서식, 글꼴과 스타일",
		"표의 행·열·병합·셀 기하와 테두리·채우기",
		"이미지·도형·차트·수식·OLE 등의 개체",
		"머리말·꼬리말·각주·미주 등 본문 밖 영역",
		"용지·구역·단·페이지 배치 및 문서 메타데이터"
	]);
	DocumentConversionError = class extends Error {
		code;
		report;
		constructor(code, report, options) {
			super(code, options);
			this.name = "DocumentConversionError";
			this.code = code;
			this.report = report;
		}
	};
}));
// src/extended-host.ts
var extended_host_exports = /* @__PURE__ */ __exportAll({ runExtendedCommand: () => runExtendedCommand });
function jsonInput(text) {
	if (typeof text !== "string" || !text.isWellFormed() || text.length > MAX_PATCH_BYTES || encoder.encode(text).length > MAX_PATCH_BYTES) throw new RangeError("OperationInputLimitExceeded");
	try {
		return JSON.parse(text);
	} catch (cause) {
		throw new Error("InvalidOperationJSON", { cause });
	}
}
function savedResult(value, expectedFormat) {
	if (!record$2(value)) throw new Error("InvalidDocumentOperationResult");
	const { format, bytes, layoutRequiresReflow } = value;
	if (!documentFormat(format) || expectedFormat !== void 0 && format !== expectedFormat || !(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > 67108864 || typeof layoutRequiresReflow !== "boolean") throw new Error("InvalidDocumentOperationResult");
	return {
		format,
		bytes: Uint8Array.from(bytes),
		layoutRequiresReflow
	};
}
function textResult(value, input) {
	if (!record$2(value)) throw new Error("InvalidDocumentQueryResult");
	const { schemaVersion, format, sourceSha256, text } = value;
	if (schemaVersion !== 1 || !documentFormat(format) || sourceSha256 !== input.sha256 || typeof text !== "string" || !text.isWellFormed() || text.length > MAX_TEXT_BYTES$1 || encoder.encode(text).length > MAX_TEXT_BYTES$1) throw new Error("InvalidDocumentQueryResult");
	return {
		format,
		sourceSha256,
		text
	};
}
async function runExtendedCommand(options, { files, io, loadWasm, dependencies = {}, onPublished }) {
	const input = options.command === "create" ? void 0 : await files.readInputSnapshot(options.input, { maxBytes: MAX_DOCUMENT_BYTES$1 });
	if (options.command !== "create" && options.expectSha256 !== void 0 && input?.sha256 !== options.expectSha256) throw new Error("SourceSHA256Mismatch");
	const requireInput = () => {
		if (!input) throw new Error("MissingDocumentInput");
		return input;
	};
	let text = "";
	if (options.command === "create" && options.textFile !== void 0) {
		const snapshot = await files.readInputSnapshot(options.textFile, { maxBytes: MAX_TEXT_BYTES$1 });
		text = new TextDecoder("utf-8", { fatal: true }).decode(snapshot.bytes);
	}
	if (options.command === "create" && dependencies.creationText !== void 0) {
		if (options.textFile !== void 0) throw new Error("ConflictingCreationText");
		text = dependencies.creationText;
		if (typeof text !== "string" || !text.isWellFormed() || encoder.encode(text).length > MAX_TEXT_BYTES$1) throw new Error("InvalidCreationText");
	}
	let operationService;
	let operations;
	if (options.command === "apply") {
		operationService = dependencies.operationService ?? await Promise.resolve().then(() => (init_document_operations(), document_operations_exports));
		let raw;
		if (options.inlineOperations !== void 0) raw = jsonInput(options.inlineOperations);
		else {
			if (options.patch === void 0) throw new Error("MissingOperationPatch");
			const patch = await files.readInputSnapshot(options.patch, { maxBytes: MAX_PATCH_BYTES });
			const document = jsonInput(new TextDecoder("utf-8", { fatal: true }).decode(patch.bytes));
			if (!record$2(document) || document.version !== 1 || Object.keys(document).length !== 2 || !Object.hasOwn(document, "operations")) throw new Error("InvalidOperationPatch");
			raw = document.operations;
		}
		operations = operationService.validateDocumentOperations(raw);
	}
	let target;
	if (options.command === "create" || options.command === "apply" || options.command === "convert") {
		target = options.command === "create" ? await files.assertNewDocumentOutput({ outputPath: options.output }) : await files.assertNewOutput({
			input: requireInput(),
			outputPath: options.output
		});
		if (options.command !== "apply") files.assertOutputFormat(target, options.command === "create" ? options.format : options.to);
	}
	const wasm = await loadWasm();
	if (options.command === "paragraph") {
		const source = requireInput();
		const result = await (dependencies.inspectDocumentParagraph ?? (await Promise.resolve().then(() => (init_document_paragraph(), document_paragraph_exports))).inspectDocumentParagraph)({
			bytes: source.bytes,
			wasm,
			target: options.target,
			expectedSha256: source.sha256,
			format: options.format
		});
		const output = textResult(result, source);
		const observedTarget = result.target;
		if (!record$2(observedTarget) || observedTarget.section !== options.target.section || observedTarget.paragraph !== options.target.paragraph) throw new Error("InvalidDocumentQueryTarget");
		await io.stdout.write(output.text);
		return 0;
	}
	if (options.command === "ocr") {
		const source = requireInput();
		const result = await (dependencies.ocrDocument ?? (await Promise.resolve().then(() => (init_document_ocr(), document_ocr_exports))).ocrDocument)({
			bytes: source.bytes,
			wasm,
			reference: options.reference,
			provider: options.provider,
			languages: options.languages,
			executable: options.executable,
			format: options.format
		});
		const output = textResult(result, source);
		const status = result.status;
		if (status !== "complete" && status !== "partial" && status !== "failed") throw new Error("InvalidOcrResult");
		if (options.reference !== void 0) parseObjectReference(options.reference, {
			sourceSha256: source.sha256,
			format: output.format
		});
		await io.stdout.write(output.text);
		if (status !== "complete") {
			await io.stderr.write(line("error", "IncompleteDocumentOCR") + line("published", false));
			return 1;
		}
		return 0;
	}
	let result;
	let extra;
	if (options.command === "apply") {
		const source = requireInput();
		if (!operationService || !operations) throw new Error("MissingOperationService");
		result = await operationService.applyDocumentOperations({
			bytes: source.bytes,
			wasm,
			expectedSha256: source.sha256,
			operations,
			allowStaleLayout: options.allowStaleLayout
		});
		if (!record$2(result)) throw new Error("InvalidDocumentOperationResult");
		const { sourceSha256, appliedOperations, changed, operationResults } = result;
		if (sourceSha256 !== source.sha256 || appliedOperations !== operations.length || typeof changed !== "boolean" || !Array.isArray(operationResults)) throw new Error("InvalidDocumentOperationResult");
		extra = line("appliedOperations", appliedOperations) + line("changed", changed) + observationLines(operationResults, "operationResults");
	} else if (options.command === "create") {
		result = await (dependencies.createDocument ?? (await Promise.resolve().then(() => (init_document_create(), document_create_exports))).createDocument)({
			format: options.format,
			text,
			wasm,
			allowStaleLayout: options.allowStaleLayout
		});
		if (!record$2(result)) throw new Error("InvalidDocumentCreationResult");
		const { schemaVersion, paragraphCount } = result;
		if (schemaVersion !== 1 || typeof paragraphCount !== "number" || !Number.isSafeInteger(paragraphCount) || paragraphCount < 1) throw new Error("InvalidDocumentCreationResult");
		extra = line("paragraphCount", paragraphCount);
	} else if (options.command === "convert") {
		const source = requireInput();
		const convert = dependencies.convertDocument ?? (await Promise.resolve().then(() => (init_document_convert(), document_convert_exports))).convertDocument;
		try {
			result = await convert({
				bytes: source.bytes,
				wasm,
				expectedSha256: source.sha256,
				to: options.to,
				lossPolicy: options.lossPolicy,
				allowStaleLayout: options.allowStaleLayout
			});
		} catch (cause) {
			if (record$2(cause) && record$2(cause.report)) {
				const { report, message, code } = cause;
				throw Object.assign(new Error(String(message), { cause }), {
					code,
					operationReport: observationLines(report, "conversion")
				});
			}
			throw cause;
		}
		if (!record$2(result)) throw new Error("InvalidDocumentConversionResult");
		const { sourceSha256, lossPolicy, lossless, report } = result;
		if (sourceSha256 !== source.sha256 || lossPolicy !== options.lossPolicy || lossless !== false || !record$2(report)) throw new Error("InvalidDocumentConversionResult");
		extra = line("lossPolicy", lossPolicy) + line("lossless", lossless) + observationLines(report, "conversion");
	} else throw new Error("UnknownExtendedCommand");
	const saved = savedResult(result, options.command === "apply" ? void 0 : options.command === "create" ? options.format : options.to);
	if (!target) throw new Error("MissingDocumentOutputTarget");
	files.assertOutputFormat(target, saved.format);
	if (extra.length > MAX_TEXT_BYTES$1) throw new Error("OperationReportLimitExceeded");
	const receipt = await files.publishNewOutput({
		target,
		bytes: saved.bytes
	});
	onPublished(receipt);
	await io.stdout.write(line("output", receipt.path) + line("format", saved.format) + line("sha256", receipt.sha256) + line("layoutRequiresReflow", saved.layoutRequiresReflow) + extra + warningLines(receipt.warnings));
	return 0;
}
var MAX_PATCH_BYTES, MAX_TEXT_BYTES$1, encoder, record$2, documentFormat;
var init_extended_host = __esmMin((() => {
	init_object_reference();
	MAX_PATCH_BYTES = 1048576;
	MAX_TEXT_BYTES$1 = 4194304;
	encoder = new TextEncoder();
	record$2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
	documentFormat = (value) => value === "hwp5" || value === "hwpx";
}));
// src/document-objects.ts
var document_objects_exports = /* @__PURE__ */ __exportAll({ inspectDocumentObject: () => inspectDocumentObject });
function findObject(model, reference, expected) {
	if (model?.version !== 1 || model.format !== expected.format || model.sourceSha256 !== expected.sourceSha256 || !Array.isArray(model.sections) || !Array.isArray(model.unplaced)) throw new Error("InvalidObjectModel");
	const stack = [];
	for (const section of model.sections) {
		if (!Array.isArray(section.body)) throw new Error("InvalidObjectModel");
		for (const block of section.body) stack.push(block);
		for (const name of ["header", "footer"]) {
			if (!Array.isArray(section[name]?.definitions)) throw new Error("InvalidObjectModel");
			for (const definition of section[name].definitions) {
				if (!Array.isArray(definition.blocks)) throw new Error("InvalidObjectModel");
				for (const block of definition.blocks) stack.push(block);
			}
		}
	}
	for (const row of model.unplaced) stack.push(row.block);
	const visited = /* @__PURE__ */ new Set(), references = /* @__PURE__ */ new Set(), identities = /* @__PURE__ */ new Set();
	let found;
	while (stack.length) {
		const block = stack.pop();
		if (!record$1(block) || visited.has(block) || typeof block.id !== "string" || block.id.length === 0 || identities.has(block.id)) throw new Error("InvalidObjectModel");
		identities.add(block.id);
		visited.add(block);
		if (visited.size > MAX_ROWS) throw new RangeError("ObjectInventoryLimitExceeded");
		if (block.reference !== null && block.reference !== void 0) {
			const parsed = parseObjectReference(block.reference, expected);
			const kind = block.type === "unknown" ? block.kind : block.type;
			const source = block.type === "image" ? block.sourceInfo : block.source;
			const node = block.type === "image" ? block.sourceInfo?.pictureNode : block.type === "table" ? block.source?.tableNode : block.source?.node;
			if (kind !== parsed.kind || source?.section !== parsed.section || node !== parsed.node || references.has(block.reference)) throw new Error("InvalidObjectModel");
			references.add(block.reference);
			if (block.reference === reference) found = block;
		}
		if (block.type === "table") {
			if (!Array.isArray(block.cells) || block.cells.length > MAX_ROWS) throw new Error("InvalidObjectModel");
			for (const cell of block.cells) {
				if (!Array.isArray(cell.blocks)) throw new Error("InvalidObjectModel");
				for (const child of cell.blocks) stack.push(child);
			}
		}
	}
	if (!found) throw new Error("ObjectReferenceNotFound");
	return found;
}
async function inspectDocumentObject({ bytes, wasm, reference, format = "text" } = {}, dependencies = {}) {
	if (!["text", "markdown"].includes(format)) throw new TypeError("InvalidRenderFormat");
	const target = parseObjectReference(reference);
	if (typeof reference !== "string") throw new TypeError("InvalidObjectReference");
	const open = dependencies.openDocument ?? (await Promise.resolve().then(() => (init_engine(), engine_exports))).openDocument;
	const collect = dependencies.readDocumentModel ?? readDocumentModel;
	const document = await open({
		bytes,
		wasm,
		expectedSha256: target.sourceSha256
	});
	let failed = false, failure, output;
	try {
		parseObjectReference(reference, {
			sourceSha256: document.sourceSha256,
			format: document.format
		});
		if (!uint(document.sectionCount) || document.sectionCount < 1 || document.sectionCount > 4096 || target.section >= document.sectionCount) throw new Error("InvalidObjectSection");
		const block = findObject(await collect({
			sdk: document.sdk,
			format: document.format,
			sourceSha256: document.sourceSha256,
			sectionCount: document.sectionCount
		}), reference, {
			sourceSha256: document.sourceSha256,
			format: document.format
		});
		const escape = createDisplayEscaper({
			format,
			view: "content"
		});
		const lines = [];
		let size = 0, status = "available";
		const line = (value) => {
			if (typeof value !== "string" || value.length > MAX_TEXT_BYTES) throw new RangeError("ObjectDetailLimitExceeded");
			const output = escape(value);
			size += new TextEncoder().encode(output).length + 1;
			if (size > MAX_TEXT_BYTES) throw new RangeError("ObjectDetailLimitExceeded");
			lines.push(output);
		};
		const unavailable = (reason) => {
			status = "unavailable";
			line(`상세 조회 불가: ${reason}`);
		};
		const scalarFields = (source, keys) => {
			if (!record$1(source)) throw new Error("InvalidObjectDetail");
			for (const key of keys) {
				const value = source[key];
				if (value === null || value === void 0) continue;
				if (![
					"string",
					"boolean",
					"number"
				].includes(typeof value) || typeof value === "number" && !Number.isFinite(value)) throw new Error("InvalidObjectDetail");
				line(`${key}: ${value}`);
			}
		};
		const rows = (value) => {
			if (!Array.isArray(value) || value.length > MAX_ROWS) throw new Error("InvalidObjectDetail");
			if (!value.every(record$1)) throw new Error("InvalidObjectDetail");
			return value;
		};
		const query = (method, ...args) => {
			const getter = Reflect.get(document.sdk, method);
			if (typeof getter !== "function") {
				unavailable(`${method} 미지원`);
				return { ok: false };
			}
			try {
				return {
					ok: true,
					value: Reflect.apply(getter, document.sdk, args)
				};
			} catch (error) {
				unavailable(`${method}: ${record$1(error) && typeof error.message === "string" ? error.message : "원인 미확인"}`);
				return { ok: false };
			}
		};
		line(`개체 종류: ${target.kind}`);
		line(`참조: ${reference}`);
		line(`원본 위치: 구역 ${target.section}, 노드 ${target.node}`);
		if (block.type === "unknown" && block.detailUnavailable === true) unavailable(block.diagnostic?.code ?? "원본 재고에 상세 조회 오류가 관측됨");
		else if (target.kind === "image") {
			if (block.type !== "image") throw new Error("InvalidObjectDetail");
			scalarFields(block.sourceInfo, [
				"recordNode",
				"componentNode",
				"ownerNode",
				"resourceId"
			]);
			scalarFields(block, [
				"width",
				"height",
				"sizeUnit",
				"alt"
			]);
			line(`이미지 ID: ${canonicalImageId(target)}`);
			line(`이미지 추출: hwpjs extract-images 입력파일 --ref ${reference} --output 새출력폴더`);
			line("이미지 바이트는 읽지 않았습니다. 렌더링 지원 여부와 추출 가능 여부는 별도입니다.");
		} else if (target.kind === "table") {
			if (block.type !== "table") throw new Error("InvalidObjectDetail");
			scalarFields(block, ["rows", "columns"]);
			for (const cell of rows(block.cells)) {
				line(`셀 원본: ${record$1(cell.source) ? cell.source.listNode ?? "미확인" : "미확인"}`);
				scalarFields(cell, [
					"row",
					"column",
					"rowSpan",
					"columnSpan",
					"geometryKnown",
					"contentState"
				]);
				for (const child of rows(cell.blocks)) if (child.type === "paragraph") {
					if (child.displayText === null) {
						status = "unavailable";
						line("문단 내용 미관측");
					} else if (typeof child.displayText !== "string") throw new Error("InvalidObjectDetail");
					else line(child.displayText);
				} else line(`포함 개체: ${child.type === "unknown" ? child.kind : child.type}${child.reference ? `, 참조: ${child.reference}` : ", 상세 참조 없음"}`);
			}
		} else if (target.kind === "chart" && document.format === "hwpx") {
			const result = query("chartDisplay", target.section, target.node);
			if (result.ok) {
				const detail = result.value;
				if (!record$1(detail) || detail.kind !== "chart_display" || !record$1(detail.pair) || detail.pair.wrapper_node !== target.node || detail.pair.section_ordinal !== target.section) throw new Error("InvalidObjectDetail");
				scalarFields(detail.pair, [
					"chart_path",
					"ole_path",
					"declared_external"
				]);
				for (const row of rows(detail.rich_text)) scalarFields(row, [
					"owner_role",
					"owner_node",
					"text",
					"plain_text_complete"
				]);
				for (const row of rows(detail.series_text)) scalarFields(row, ["series_node", "text"]);
				const bindings = /* @__PURE__ */ new Map();
				if (detail.bindings !== void 0) for (const binding of rows(detail.bindings)) {
					if (!record$1(binding) || !uint(binding.point) || bindings.has(binding.point)) throw new Error("InvalidObjectDetail");
					bindings.set(binding.point, binding);
				}
				let pointOrdinal = 0;
				for (const row of rows(detail.points)) {
					line(`값 순번: ${pointOrdinal}`);
					scalarFields(row, [
						"kind",
						"index",
						"value"
					]);
					const binding = bindings.get(pointOrdinal++);
					if (binding) scalarFields(binding, [
						"series_node",
						"plot_node",
						"role_node",
						"role"
					]);
					else line("계열과 역할 관계 미관측");
				}
				for (const ordinal of bindings.keys()) if (ordinal >= pointOrdinal) throw new Error("InvalidObjectDetail");
				line("차트 메타데이터 조회이며 외부 자원 다운로드나 바이너리 추출은 하지 않았습니다.");
			}
		} else if (target.kind === "equation" && document.format === "hwpx") {
			const result = query("equationScript", target.section, target.node);
			if (result.ok) {
				if (typeof result.value !== "string") throw new Error("InvalidObjectDetail");
				line(`수식 원문: ${result.value}`);
			}
		} else if (target.kind === "ole" && document.format === "hwpx") {
			const result = query("oleSource", target.section, target.node);
			if (result.ok) {
				const keys = [
					"binary_item_id",
					"object_type",
					"draw_aspect",
					"has_moniker",
					"transform_identity"
				];
				scalarFields(result.value, keys);
				const detail = result.value;
				if (!record$1(detail)) throw new Error("InvalidObjectDetail");
				if (!keys.some((key) => detail[key] !== null && detail[key] !== void 0)) unavailable("OLE 원본 상세 필드가 관측되지 않았습니다.");
			}
			line("OLE 바이너리는 읽지 않았습니다.");
		} else {
			scalarFields(block, ["nativeKind", "subtype"]);
			unavailable("종류와 원본 위치는 관측했으나 현재 공통 상세 조회가 지원되지 않습니다.");
		}
		line(`상태: ${status}`);
		output = {
			schemaVersion: 1,
			format: document.format,
			sourceSha256: document.sourceSha256,
			reference,
			kind: target.kind,
			status,
			text: lines.join("\n") + "\n"
		};
	} catch (error) {
		failed = true;
		failure = error;
	}
	try {
		await document.close();
	} catch (error) {
		if (failed) throw new AggregateError([failure, error], "DocumentObjectInspectionAndCloseFailed", { cause: failure });
		throw new Error("DocumentObjectInspectionCloseFailed", { cause: error });
	}
	if (failed) throw failure;
	if (!output) throw new Error("InvalidObjectDetail");
	return output;
}
var MAX_ROWS, MAX_TEXT_BYTES, uint, record$1;
var init_document_objects = __esmMin((() => {
	init_object_reference();
	init_render_escape();
	init_document_model();
	MAX_ROWS = 2e5;
	MAX_TEXT_BYTES = 65536;
	uint = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4294967295;
	record$1 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
}));
// src/inspect-document.ts
var inspect_document_exports = /* @__PURE__ */ __exportAll({ inspectDocument: () => inspectDocument });
function failedObservation(diagnostics, method, error, source) {
	diagnostics.push(diagnostic("ObservationUnavailable", `${method}: ${message(error)}`, source));
	return unknown("NativeObservationFailed");
}
function fileVersion(document, diagnostics) {
	if (document.format !== "hwp5" || !has(document.sdk, "fileVersion")) return unsupported("FileVersionNotExposedBySdk");
	try {
		const value = invoke(document.sdk, "fileVersion");
		if (!uint$4(value) || value === 0) throw Error("InvalidFileVersionObservation");
		return observed(value, "sdk.fileVersion");
	} catch (error) {
		return failedObservation(diagnostics, "fileVersion", error);
	}
}
function textSourceProtection(document, diagnostics) {
	const sdk = document.sdk;
	if (document.format !== "hwp5" || !has(sdk, "textSourceProtection")) return unsupported("TextSourceProtectionNotExposedBySdk");
	try {
		if (has(sdk, "supportsTextSourceProtection")) {
			const supported = invoke(sdk, "supportsTextSourceProtection");
			if (supported === false) return unsupported("TextSourceProtectionAbiUnavailable");
			if (supported !== true) throw Error("InvalidProtectionCapabilityObservation");
		}
	} catch (error) {
		return failedObservation(diagnostics, "supportsTextSourceProtection", error);
	}
	if (!has(sdk, "paragraphCount")) return unsupported("ProtectionParagraphCountNotExposedBySdk");
	const sections = [];
	let paragraphs = 0;
	for (let section = 0; section < document.sectionCount; section++) try {
		const count = invoke(sdk, "paragraphCount", [section]);
		if (!uint$4(count) || count > 1e5) throw Error("InvalidParagraphCountObservation");
		paragraphs += count;
		if (paragraphs > LIMITS$1.maxBlocks) {
			diagnostics.push(diagnostic("ObservationLimitExceeded", "textSourceProtection", { section }));
			return unknown("ProtectionObservationLimitExceeded");
		}
		const value = validateHwp5TextSourceProtection(invoke(sdk, "textSourceProtection", [section]), count);
		sections.push({
			section,
			paragraphCount: count,
			protectedParagraphCount: value.protected_paragraphs.reduce((total, bit) => total + Number(bit), 0),
			mode: value.mode,
			retainedHeaders: value.retained_headers
		});
	} catch (error) {
		return failedObservation(diagnostics, "textSourceProtection", error, { section });
	}
	return observed(sections, "sdk.paragraphCount + sdk.textSourceProtection");
}
/** Byte-only Native metadata inspection, shared by Node and browser hosts.
* It opens through the existing engine, which may decode document content.
* No fast-path, total-count, signature or whole-document editability claim is made.
* The optional opener is an injection seam for contract tests, not another engine.
*/
async function inspectDocument({ bytes, wasm, expectedSha256 } = {}, { openDocument: openDocument$1 = openDocument } = {}) {
	if (!(bytes instanceof Uint8Array)) throw new TypeError("ExpectedDocumentUint8Array");
	if (!bytes.byteLength || bytes.byteLength > MAX_INPUT_BYTES) throw new RangeError("DocumentLimitExceeded");
	if (expectedSha256 !== void 0 && (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256))) throw new TypeError("InvalidExpectedSha256");
	if (typeof openDocument$1 !== "function") throw new TypeError("InvalidDocumentOpener");
	if (!globalThis.crypto?.subtle) throw Error("WebCryptoUnavailable");
	const sourceByteLength = bytes.byteLength;
	const snapshot = Uint8Array.from(bytes);
	const format = detectDocumentFormat(snapshot);
	const digest = globalThis.crypto.subtle.digest("SHA-256", snapshot).then((value) => ({ value }), (error) => ({ error }));
	const document = await openDocument$1({
		bytes: snapshot,
		wasm,
		expectedSha256
	});
	let result;
	let failure;
	let failed = false;
	try {
		const hash = await digest;
		if ("error" in hash) throw hash.error;
		const sourceSha256 = Array.from(new Uint8Array(hash.value), (byte) => byte.toString(16).padStart(2, "0")).join("");
		if (!document || typeof document.close !== "function" || !document.sdk || typeof document.sdk !== "object") throw Error("InvalidOpenedDocument");
		if (document.format !== format) throw Error("DocumentFormatMismatch");
		if (document.sourceSha256 !== sourceSha256) throw Error("DocumentSnapshotSha256Mismatch");
		if (expectedSha256 !== void 0 && sourceSha256 !== expectedSha256) throw Error("SourceSha256Mismatch");
		if (!Number.isInteger(document.sectionCount) || document.sectionCount < 1 || document.sectionCount > 4096) throw new RangeError("SectionLimitExceeded");
		const diagnostics = [];
		result = {
			schemaVersion: 1,
			format,
			sourceSha256,
			sourceByteLength,
			sectionCount: document.sectionCount,
			fileVersion: fileVersion(document, diagnostics),
			security: {
				encryption: unknown("EncryptionNotExposedBySdk"),
				passwordProtection: unknown("PasswordProtectionNotExposedBySdk"),
				digitalSignature: unknown("DigitalSignatureNotExposedBySdk")
			},
			editing: {
				documentEditable: unknown("RequiresNativeValidationForEachTargetAndOperation"),
				textSourceProtection: textSourceProtection(document, diagnostics)
			},
			inspection: {
				scope: "native-open-and-metadata",
				performance: "not-measured",
				documentModelCollected: false,
				contentTotals: unknown("ParagraphTableImageAndPageTotalsNotCollected")
			},
			diagnostics
		};
	} catch (error) {
		failed = true;
		failure = error;
	}
	try {
		if (typeof document?.close === "function") await document.close();
	} catch (error) {
		if (failed) throw new AggregateError([failure, error], "DocumentInspectionAndCloseFailed", { cause: failure });
		throw new Error("DocumentInspectionCloseFailed", { cause: error });
	}
	if (failed) throw failure;
	return result;
}
var record, message, invoke, has, MAX_INPUT_BYTES, observed, unknown, unsupported;
var init_inspect_document = __esmMin((() => {
	init_engine();
	init_document_format();
	init_hwp5_text_source_protection();
	init_common$1();
	record = (value) => value !== null && typeof value === "object";
	message = (error) => record(error) && typeof error.message === "string" ? error.message : "UnknownError";
	invoke = (sdk, method, args = []) => {
		const fn = Reflect.get(sdk, method);
		if (typeof fn !== "function") throw Error("MissingSdkMethod");
		return Reflect.apply(fn, sdk, args);
	};
	has = (sdk, method) => typeof Reflect.get(sdk, method) === "function";
	MAX_INPUT_BYTES = 67108864;
	observed = (value, source) => ({
		status: "observed",
		value,
		source
	});
	unknown = (reason) => ({
		status: "unknown",
		value: null,
		reason
	});
	unsupported = (reason) => ({
		status: "unsupported",
		value: null,
		reason
	});
}));
// src/main.ts
init_files();
init_object_reference();
init_host_output();
const errorFields = (value) => value !== null && typeof value === "object" ? value : {};
const errorCode = (value) => String(errorFields(value).code ?? errorFields(value).message ?? value);
const engineFormat = (value) => {
	if (value !== "hwp5" && value !== "hwpx") throw Error("InvalidEngineFormat");
};
const imageScopeDiagnostic = line("scopeDiagnostic", "Section picture sites only; excludes master-page images, image brushes and unreferenced resources. Not a legacy Rust full-image extraction compatibility claim.");
function preflightImageReceipts(selected, directory, singleTarget) {
	if (!singleTarget && !directory) throw Error("MissingImageOutputDirectory");
	const planned = selected.map((image, index) => ({
		id: image.id,
		published: true,
		path: singleTarget?.path ?? join(directory.path, `image-${String(index + 1).padStart(4, "0")}.jpeg`),
		sha256: "0".repeat(64),
		bytes: 33554432,
		warnings: []
	}));
	try {
		if (observationLines(planned, "publishedImages").length > 3932160) throw Error("ObservationOutputLimit");
	} catch (cause) {
		throw Error("ImageReceiptBudgetExceeded", { cause });
	}
}
function fallbackLine(key, value) {
	const text = String(value);
	const bounded = text.length > 4096 ? text.slice(0, 4096) + `[omitted ${text.length - 4096} UTF16 units]` : text;
	return line(key, bounded);
}
function imageSnapshot(list, document, sha) {
	if (list?.version !== 1 || list.format !== document.format || list.sourceSha256 !== sha || !Array.isArray(list.images) || list.images.length > 4096) throw Error("InvalidImageListing");
	const ids = /* @__PURE__ */ new Set();
	for (const image of list.images) {
		if (typeof image.id !== "string" || ids.has(image.id)) throw Error("InvalidImageListing");
		ids.add(image.id);
	}
	return list;
}
const writeStream = (stream, text) => new Promise((accept, reject) => {
	const onError = (cause) => reject(cause);
	stream.once("error", onError);
	try {
		stream.write(text, (cause) => {
			if (cause) reject(cause);
			else {
				stream.off("error", onError);
				accept();
			}
		});
	} catch (cause) {
		stream.off("error", onError);
		reject(cause);
	}
});
/** Pure host module: importing it never reads argv, files or Native artifacts. */
async function runCLI(argv, dependencies = {}) {
	const io = dependencies.io ?? {
		stdout: { write: (text) => writeStream(process.stdout, text) },
		stderr: { write: (text) => writeStream(process.stderr, text) }
	};
	const files = dependencies.files ?? files_exports;
	let published;
	const imagePublished = [];
	let outputDirectory;
	try {
		const options = parseArguments(argv);
		if (options.command === "help") {
			await io.stdout.write(USAGE);
			return 0;
		}
		const loadWasm = async () => {
			const wasmPath = files.resolveWasmPath(options.wasm, dependencies.mainModuleURL);
			try {
				return (await files.readInputSnapshot(wasmPath, { maxBytes: MAX_WASM_BYTES$1 })).bytes;
			} catch (cause) {
				if (options.wasm === void 0 && errorFields(cause).code === "ENOENT") throw Error("ExplicitWasmRequired: pass --wasm PATH", { cause });
				throw cause;
			}
		};
		if (options.command === "read-many") {
			const reportOverhead = 1024 + 512 * options.inputPaths.length;
			if (options.maxOutputBytes <= reportOverhead) throw Object.assign(/* @__PURE__ */ new Error("파일별 결과를 보고하기에 출력 예산이 부족합니다."), { code: "OutputBudgetTooSmall" });
			const engine = dependencies.engine ?? await Promise.resolve().then(() => (init_engine(), engine_exports));
			const renderDocument = dependencies.renderDocument ?? (await Promise.resolve().then(() => (init_render(), render_exports))).renderDocument;
			let wasmPromise;
			const loadOnce = () => wasmPromise ??= loadWasm();
			const batch = await readDocuments({
				inputPaths: options.inputPaths,
				concurrency: options.concurrency,
				maxOutputBytes: options.maxOutputBytes - reportOverhead,
				readOne: ({ inputPath }) => readDocumentOperation({
					inputPath,
					format: options.format,
					view: options.view
				}, {
					files,
					engine,
					renderDocument,
					loadWasm: loadOnce
				})
			});
			try {
				const text = renderBatchReadReport(batch, options);
				await io.stdout.write(text);
			} catch (cause) {
				throw Object.assign(new Error(String(errorFields(cause).message ?? "ReadManyOutputFailed"), { cause }), { batchSummary: batch.summary });
			}
			return batch.summary.failed ? 1 : 0;
		}
		if (Object.hasOwn(EXTENDED_OPTIONS, options.command)) {
			const { runExtendedCommand } = await Promise.resolve().then(() => (init_extended_host(), extended_host_exports));
			return await runExtendedCommand(options, {
				files,
				io,
				loadWasm,
				dependencies,
				onPublished: (receipt) => {
					published = receipt;
				}
			});
		}
		if (options.command === "create" || options.command === "apply" || options.command === "convert" || options.command === "ocr" || options.command === "paragraph") throw Error("UnknownExtendedCommand");
		const input = await files.readInputSnapshot(options.input, { maxBytes: MAX_DOCUMENT_BYTES$1 });
		if ("expectSha256" in options && options.expectSha256 !== void 0 && input.sha256 !== options.expectSha256) throw Error("SourceSHA256Mismatch");
		const target = options.command === "edit" ? await files.assertNewOutput({
			input,
			outputPath: options.output
		}) : void 0;
		const wasm = { bytes: await loadWasm() };
		if (options.command === "object") {
			const result = await (dependencies.inspectDocumentObject ?? (await Promise.resolve().then(() => (init_document_objects(), document_objects_exports))).inspectDocumentObject)({
				bytes: input.bytes,
				wasm: wasm.bytes,
				reference: options.reference,
				format: options.format
			});
			const expected = parseObjectReference(options.reference);
			if (!result || typeof result !== "object" || Array.isArray(result)) throw Error("InvalidObjectInspection");
			const { schemaVersion, sourceSha256, format, reference, kind, status, text } = result;
			if (schemaVersion !== 1 || sourceSha256 !== input.sha256 || format !== expected.format || reference !== options.reference || kind !== expected.kind || !["available", "unavailable"].includes(status) || typeof text !== "string" || !text.isWellFormed() || text.length > 4194304) throw Error("InvalidObjectInspection");
			await io.stdout.write(text);
			return 0;
		}
		if (options.command === "info") {
			const result = await (dependencies.inspectDocument ?? (await Promise.resolve().then(() => (init_inspect_document(), inspect_document_exports))).inspectDocument)({
				bytes: input.bytes,
				wasm: wasm.bytes,
				expectedSha256: options.expectSha256
			});
			if (!result) throw Error("InvalidDocumentInspection");
			engineFormat(result.format);
			if (result.schemaVersion !== 1 || result.sourceSha256 !== input.sha256 || result.sourceByteLength !== input.bytes.length) throw Error("InvalidDocumentInspection");
			await io.stdout.write(line("documentSHA256", input.sha256) + observationLines(result));
			return 0;
		}
		const engine = dependencies.engine ?? await Promise.resolve().then(() => (init_engine(), engine_exports));
		if (options.command === "images" || options.command === "extract-images") {
			const document = await engine.openDocument({
				bytes: input.bytes,
				wasm: wasm.bytes,
				expectedSha256: input.sha256
			});
			let images;
			try {
				engineFormat(document.format);
				if (document.sourceSha256 !== input.sha256) throw Error("SourceSHA256Mismatch");
				if ("reference" in options && options.reference !== void 0) parseObjectReference(options.reference, {
					sourceSha256: input.sha256,
					format: document.format
				});
				images = await (dependencies.createDocumentImages ?? (await Promise.resolve().then(() => (init_document_images(), document_images_exports))).createDocumentImages)({
					sdk: document.sdk,
					format: document.format,
					sourceSha256: input.sha256,
					sectionCount: document.sectionCount
				});
				const snapshot = imageSnapshot(await images.list(), document, input.sha256);
				const selected = !("id" in options) || options.id === void 0 ? snapshot.images : snapshot.images.filter((image) => image.id === options.id);
				if ("id" in options && options.id !== void 0 && selected.length !== 1) throw Error("UnknownImageId");
				if (options.command === "images") {
					for (const image of selected) try {
						await images.read(image.id, { sourceSha256: input.sha256 });
					} catch {}
					await io.stdout.write(line("documentSHA256", input.sha256) + imageScopeDiagnostic + observationLines(imageSnapshot(await images.list(), document, input.sha256)));
					return 0;
				}
				const singleFile = dependencies.imageOutputMode === "file";
				if (singleFile && options.id === void 0) throw Error("ImageFileRequiresID");
				const singleTarget = singleFile ? await files.assertNewOutput({
					input,
					outputPath: options.output,
					kind: "image"
				}) : void 0;
				if (!singleFile) outputDirectory = await files.createImageDirectory({
					input,
					outputPath: options.output
				});
				preflightImageReceipts(selected, outputDirectory, singleTarget);
				let totalBytes = 0;
				const failures = [];
				for (const [index, image] of selected.entries()) try {
					const result = await images.read(image.id, { sourceSha256: input.sha256 });
					if (result.id !== image.id || result.sourceSha256 !== input.sha256 || result.status !== "ready" || !(result.bytes instanceof Uint8Array)) throw Error("InvalidImageResult");
					totalBytes += result.bytes.length;
					if (totalBytes > 33554432) throw Error("ExtractedBytesLimitExceeded");
					const extensions = [
						".png",
						".jpg",
						".jpeg",
						".gif",
						".bmp",
						".webp",
						".tif",
						".tiff",
						".bin"
					];
					const extension = result.extension;
					if (typeof extension !== "string" || !extensions.includes(extension)) throw Error("InvalidImageExtension");
					const path = singleFile ? options.output : join(outputDirectory.path, `image-${String(index + 1).padStart(4, "0")}${extension}`);
					const target = singleTarget ?? await files.assertNewOutput({
						input,
						outputPath: path,
						kind: "image",
						directory: outputDirectory
					});
					files.assertImageFormat(target, extension);
					const receipt = await files.publishNewOutput({
						target,
						bytes: result.bytes
					});
					imagePublished.push({
						id: image.id,
						...receipt
					});
				} catch (cause) {
					failures.push({
						id: image.id,
						error: errorCode(cause)
					});
				}
				const finalList = imageSnapshot(await images.list(), document, input.sha256);
				await io.stdout.write(line("documentSHA256", input.sha256) + line("format", document.format) + imageScopeDiagnostic + (outputDirectory ? line("outputDirectory", outputDirectory.path) : "") + observationLines(finalList.coverage, "coverage") + observationLines(imagePublished, "publishedImages") + observationLines(failures, "failures") + line("completeWithinListedScope", failures.length === 0));
				if (failures.length) throw Error("IncompleteImageExtraction");
				return 0;
			} finally {
				try {
					await images?.close();
				} finally {
					await document.close();
				}
			}
		}
		if (options.command === "read") {
			const renderDocument = dependencies.renderDocument ?? (await Promise.resolve().then(() => (init_render(), render_exports))).renderDocument;
			const result = await readDocumentOperation({
				inputSnapshot: input,
				wasm: wasm.bytes,
				format: options.format,
				view: options.view
			}, {
				files,
				engine,
				renderDocument,
				loadWasm
			});
			await io.stdout.write(renderReadResponse(result, { view: options.view }));
			return 0;
		}
		const result = await engine.edit({
			bytes: input.bytes,
			wasm: wasm.bytes,
			target: options.target,
			replace: options.replace,
			with: options.with,
			allowStaleLayout: options.allowStaleLayout
		});
		engineFormat(result.format);
		if (typeof result.changed !== "boolean" || typeof result.layoutRequiresReflow !== "boolean") throw Error("InvalidEngineResult");
		if (!target) throw Error("MissingDocumentOutputTarget");
		files.assertOutputFormat(target, result.format);
		published = await files.publishNewOutput({
			target,
			bytes: result.bytes
		});
		await io.stdout.write(line("output", published.path) + line("format", result.format) + line("sha256", published.sha256) + line("changed", result.changed) + line("layoutRequiresReflow", result.layoutRequiresReflow) + warningLines(published.warnings));
		return 0;
	} catch (cause) {
		const details = errorFields(cause);
		const primary = String(details.code ?? (cause instanceof Error ? cause.message : cause));
		const directory = outputDirectory?.path ?? (typeof details.createdDirectory === "string" ? details.createdDirectory : void 0);
		const summary = errorFields(details.batchSummary);
		try {
			const diagnostic = line("error", primary) + (typeof details.operationReport === "string" && details.operationReport.length <= 4194304 ? details.operationReport : "") + (details.batchSummary ? line("batchReadSucceeded", summary.readSucceeded) + line("batchReadFailed", summary.readFailed) + line("batchDelivery", "failed-or-partial") : "") + line("published", Boolean(published) || imagePublished.length > 0) + (directory || imagePublished.length ? line("publishedImageCount", imagePublished.length) : "") + (directory ? line("outputDirectory", directory) : "") + observationLines(imagePublished, "publishedImages") + (published ? line("output", published.path) + line("sha256", published.sha256) : "") + warningLines(Array.isArray(details.cleanupWarnings) ? details.cleanupWarnings : void 0);
			await io.stderr.write(diagnostic);
		} catch (diagnosticFailure) {
			try {
				await io.stderr.write(fallbackLine("error", primary) + line("published", Boolean(published) || imagePublished.length > 0) + (directory || imagePublished.length ? line("publishedImageCount", imagePublished.length) : "") + (directory ? fallbackLine("outputDirectory", directory) : "") + (published ? fallbackLine("output", published.path) + fallbackLine("sha256", published.sha256) : "") + (!directory && imagePublished.length ? fallbackLine("output", imagePublished[0].path) : "") + line("receiptDetailsOmitted", imagePublished.length) + fallbackLine("diagnosticFailure", errorCode(diagnosticFailure)));
			} catch {}
		}
		return cause instanceof ArgumentsError ? 2 : 1;
	}
}
// src/bin.ts
process.exitCode = await runCLI(process.argv.slice(2), { mainModuleURL: import.meta.url });
export {};
