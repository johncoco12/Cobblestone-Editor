/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IMarkerData, IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ICodeStyleService } from '../common/codeStyle.js';
import {
	CodeStyleSeverity,
	INamingRule,
	LineEnding,
	NamingStyle,
} from '../common/codeStyleTypes.js';

const OWNER = 'code-style';
const DEBOUNCE_MS = 400;

// ---------------------------------------------------------------------------
// Naming-style validation patterns
// ---------------------------------------------------------------------------

const NAMING_PATTERNS: Record<NamingStyle, RegExp> = {
	camelCase: /^[a-z][a-zA-Z0-9]*$/,
	PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
	snake_case: /^[a-z][a-z0-9_]*$/,
	SCREAMING_SNAKE_CASE: /^[A-Z][A-Z0-9_]*$/,
	'kebab-case': /^[a-z][a-z0-9-]*$/,
	any: /.*/,
};

/**
 * Regex used to extract identifiers per {@link IdentifierKind} from source text.
 * Each pattern must contain exactly one capturing group — the identifier name.
 */
const IDENTIFIER_PATTERNS: Record<string, RegExp> = {
	variable: /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
	function: /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
	class: /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
	interface: /interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
	enum: /(?:^|\s)enum\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm,
	enumMember: /^\s{1,}([A-Z][a-zA-Z0-9_]*)\s*(?:=|,|\})/gm,
	type: /type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g,
	constant: /(?:^|[;\n])\s*const\s+([A-Z][A-Z0-9_]*)\s*=/gm,
	parameter: /\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:[:,)])/g,
	property: /(?:this\.|\.)\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g,
};

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

function mapSeverity(severity: CodeStyleSeverity): MarkerSeverity {
	switch (severity) {
		case 'error': return MarkerSeverity.Error;
		case 'warning': return MarkerSeverity.Warning;
		case 'information': return MarkerSeverity.Info;
		case 'hint': return MarkerSeverity.Hint;
	}
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Finds markers for line-ending violations. */
export function validateLineEndings(text: string, expected: LineEnding, severity: MarkerSeverity): IMarkerData[] {
	if (expected === 'auto') {
		return [];
	}
	const markers: IMarkerData[] = [];
	// Non-global regexp — tested only at position 0 of each EOL slice.
	const wrongPattern = expected === 'lf'
		? /\r\n|\r/
		: expected === 'crlf'
			? /\r(?!\n)|\n/
			: /\r\n|\n/; // cr

	const description =
		expected === 'lf' ? 'LF (\\n)' :
			expected === 'crlf' ? 'CRLF (\\r\\n)' : 'CR (\\r)';

	const lines = text.split(/\r\n|\r|\n/);
	let offset = 0;

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const lineText = lines[lineIdx];
		const eolStart = offset + lineText.length;
		const eolSlice = text.slice(eolStart);

		const endingMatch = wrongPattern.exec(eolSlice);
		// Only report a violation if the very first character(s) at this EOL position are wrong.
		if (endingMatch && endingMatch.index === 0) {
			markers.push({
				severity,
				message: `Wrong line ending — expected ${description}.`,
				startLineNumber: lineIdx + 1,
				startColumn: lineText.length + 1,
				endLineNumber: lineIdx + 1,
				endColumn: lineText.length + 1 + endingMatch[0].length,
				source: OWNER,
				code: `line-ending:${expected}`,
			});
		}

		// Advance by the line content plus the actual EOL length (1 for LF/CR, 2 for CRLF).
		const eolLen = eolStart < text.length
			? (text[eolStart] === '\r' && text[eolStart + 1] === '\n' ? 2 : 1)
			: 0;
		offset += lineText.length + eolLen;
	}

	return markers;
}

/** Finds markers for trailing-whitespace violations. */
export function validateTrailingWhitespace(lines: string[], severity: MarkerSeverity): IMarkerData[] {
	const markers: IMarkerData[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const match = /[ \t]+$/.exec(line);
		if (match) {
			markers.push({
				severity,
				message: 'Trailing whitespace.',
				startLineNumber: i + 1,
				startColumn: match.index + 1,
				endLineNumber: i + 1,
				endColumn: line.length + 1,
				source: OWNER,
				code: 'trailing-whitespace',
			});
		}
	}
	return markers;
}

/** Finds markers for lines that exceed `maxLength` characters. */
export function validateMaxLineLength(lines: string[], maxLength: number, severity: MarkerSeverity): IMarkerData[] {
	if (maxLength <= 0) {
		return [];
	}
	const markers: IMarkerData[] = [];
	for (let i = 0; i < lines.length; i++) {
		const len = lines[i].length;
		if (len > maxLength) {
			markers.push({
				severity,
				message: `Line exceeds maximum length of ${maxLength} characters (current: ${len}).`,
				startLineNumber: i + 1,
				startColumn: maxLength + 1,
				endLineNumber: i + 1,
				endColumn: len + 1,
				source: OWNER,
				code: 'max-line-length',
			});
		}
	}
	return markers;
}

/** Returns a single marker if the file is missing a final newline. */
export function validateFinalNewline(text: string, lineCount: number, severity: MarkerSeverity): IMarkerData[] {
	if (!text || text.endsWith('\n') || text.endsWith('\r')) {
		return [];
	}
	return [{
		severity,
		message: 'File must end with a newline.',
		startLineNumber: lineCount,
		startColumn: 1,
		endLineNumber: lineCount,
		endColumn: 1,
		source: OWNER,
		code: 'final-newline',
	}];
}

/** Validates identifier naming rules against document text. */
export function validateNamingRules(text: string, languageId: string, rules: INamingRule[]): IMarkerData[] {
	const markers: IMarkerData[] = [];
	const applicableRules = rules.filter(r =>
		r.enabled &&
		(r.languages.length === 0 || r.languages.includes(languageId))
	);

	if (applicableRules.length === 0) {
		return markers;
	}

	for (const rule of applicableRules) {
		const identifierPattern = IDENTIFIER_PATTERNS[rule.kind];
		if (!identifierPattern) {
			continue;
		}

		const stylePattern = NAMING_PATTERNS[rule.style];
		const pattern = new RegExp(identifierPattern.source, identifierPattern.flags);

		let match: RegExpExecArray | null;
		while ((match = pattern.exec(text)) !== null) {
			const name = match[1];
			if (!name) {
				continue;
			}

			// Validate prefix
			if (rule.prefix && !name.startsWith(rule.prefix)) {
				const pos = positionAt(text, match.index + match[0].indexOf(name));
				markers.push(buildNamingMarker(rule, name, pos, `must start with prefix '${rule.prefix}'`));
				continue;
			}

			// Validate suffix
			if (rule.suffix && !name.endsWith(rule.suffix)) {
				const pos = positionAt(text, match.index + match[0].indexOf(name));
				markers.push(buildNamingMarker(rule, name, pos, `must end with suffix '${rule.suffix}'`));
				continue;
			}

			// Validate style
			const nameToTest = rule.prefix ? name.slice(rule.prefix.length) : name;
			if (rule.style !== 'any' && !stylePattern.test(nameToTest)) {
				const pos = positionAt(text, match.index + match[0].indexOf(name));
				markers.push(buildNamingMarker(rule, name, pos, `must use ${rule.style} naming`));
			}
		}
	}

	return markers;
}

function buildNamingMarker(
	rule: INamingRule,
	name: string,
	pos: { line: number; column: number },
	reason: string,
): IMarkerData {
	return {
		severity: mapSeverity(rule.severity),
		message: `Identifier '${name}' ${reason}.`,
		startLineNumber: pos.line,
		startColumn: pos.column,
		endLineNumber: pos.line,
		endColumn: pos.column + name.length,
		source: OWNER,
		code: `naming-${rule.kind}`,
	};
}

/** Converts a character offset in `text` to a 1-based line/column pair. Handles CRLF correctly. */
function positionAt(text: string, offset: number): { line: number; column: number } {
	const clamped = Math.max(0, Math.min(offset, text.length));
	let line = 1;
	let column = 1;
	let i = 0;
	while (i < clamped) {
		const ch = text.charCodeAt(i);
		if (ch === 13 /* \r */) {
			// Treat \r\n as a single newline and consume both characters together.
			if (i + 1 < clamped && text.charCodeAt(i + 1) === 10 /* \n */) {
				i++;
			}
			line++;
			column = 1;
		} else if (ch === 10 /* \n */) {
			line++;
			column = 1;
		} else {
			column++;
		}
		i++;
	}
	return { line, column };
}

// ---------------------------------------------------------------------------
// Diagnostic provider
// ---------------------------------------------------------------------------

/**
 * Workbench contribution that watches all open text models and reports
 * code-style violations through the {@link IMarkerService}.
 */
export class CodeStyleDiagnosticProvider extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.codeStyleDiagnosticProvider';

	/** Tracks per-model disposables (content-change listeners + debounce timers). */
	private readonly _modelListeners = this._register(new DisposableMap<string>());
	private readonly _debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(
		@ICodeStyleService private readonly _styleService: ICodeStyleService,
		@IModelService private readonly _modelService: IModelService,
		@IMarkerService private readonly _markerService: IMarkerService,
	) {
		super();

		// Watch models that are already open.
		for (const model of _modelService.getModels()) {
			this._trackModel(model);
		}

		this._register(_modelService.onModelAdded(model => this._trackModel(model)));
		this._register(_modelService.onModelRemoved(model => this._untrackModel(model)));
		this._register(_styleService.onDidChangeProfile(() => this._revalidateAll()));
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	private _trackModel(model: ITextModel): void {
		const key = model.uri.toString();
		const disposable = model.onDidChangeContent(() => this._scheduleValidation(model));
		this._modelListeners.set(key, disposable);
		this._validateModel(model);
	}

	private _untrackModel(model: ITextModel): void {
		const key = model.uri.toString();
		this._cancelDebounce(key);
		this._modelListeners.deleteAndDispose(key);
		this._markerService.remove(OWNER, [model.uri]);
	}

	private _scheduleValidation(model: ITextModel): void {
		const key = model.uri.toString();
		this._cancelDebounce(key);
		const timer = setTimeout(() => {
			this._debounceTimers.delete(key);
			this._validateModel(model);
		}, DEBOUNCE_MS);
		this._debounceTimers.set(key, timer);
	}

	private _cancelDebounce(key: string): void {
		const existing = this._debounceTimers.get(key);
		if (existing !== undefined) {
			clearTimeout(existing);
			this._debounceTimers.delete(key);
		}
	}

	private _revalidateAll(): void {
		for (const model of this._modelService.getModels()) {
			this._validateModel(model);
		}
	}

	private _validateModel(model: ITextModel): void {
		if (model.isDisposed()) {
			return;
		}

		const profile = this._styleService.getActiveProfile();
		const text = model.getValue();
		const languageId = model.getLanguageId();
		const lines = text.split(/\r\n|\r|\n/);
		const defaultSeverity = mapSeverity(profile.defaultSeverity);
		const markers: IMarkerData[] = [];

		// Line endings
		if (profile.lineEnding !== 'auto') {
			markers.push(...validateLineEndings(text, profile.lineEnding, defaultSeverity));
		}

		// Trailing whitespace
		if (profile.trimTrailingWhitespace) {
			markers.push(...validateTrailingWhitespace(lines, defaultSeverity));
		}

		// Max line length
		if (profile.maxLineLength > 0) {
			markers.push(...validateMaxLineLength(lines, profile.maxLineLength, defaultSeverity));
		}

		// Final newline
		if (profile.insertFinalNewline) {
			markers.push(...validateFinalNewline(text, lines.length, defaultSeverity));
		}

		// Naming rules
		if (profile.namingRules.length > 0) {
			markers.push(...validateNamingRules(text, languageId, profile.namingRules));
		}

		this._markerService.changeOne(OWNER, model.uri, markers);
	}

	override dispose(): void {
		for (const timer of this._debounceTimers.values()) {
			clearTimeout(timer);
		}
		this._debounceTimers.clear();
		super.dispose();
	}
}

