/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { ITextFileEditorModel, ITextFileSaveParticipantContext } from '../../../../services/textfile/common/textfiles.js';
import { ICodeStyleService } from '../../common/codeStyle.js';
import {
	applyTextFixes,
	CodeStyleSaveParticipant,
	ensureFinalNewline,
	normaliseLineEndings,
	trimTrailingWhitespace,
} from '../../browser/codeStyleSaveParticipant.js';
import { ICodeStyleProfile } from '../../common/codeStyleTypes.js';

/** Minimal profile stub — only the fields touched by applyTextFixes. */
function makeProfile(overrides: Partial<ICodeStyleProfile> = {}): ICodeStyleProfile {
	return {
		lineEnding: 'auto',
		insertFinalNewline: false,
		trimTrailingWhitespace: false,
		maxLineLength: 0,
		enforceOnSave: false,
		defaultSeverity: 'warning',
		indent: { style: 'tabs', size: 4 },
		quotes: { '*': 'any' },
		semicolons: { '*': 'any' },
		trailingCommas: { '*': 'any' },
		braceStyle: { '*': 'any' },
		namingRules: [],
		...overrides,
	};
}

suite('normaliseLineEndings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('auto returns text unchanged', () => {
		const text = 'hello\r\nworld\n';
		assert.strictEqual(normaliseLineEndings(text, 'auto'), text);
	});

	test('lf converts CRLF to LF', () => {
		assert.strictEqual(normaliseLineEndings('a\r\nb\r\nc', 'lf'), 'a\nb\nc');
	});

	test('lf converts bare CR to LF', () => {
		assert.strictEqual(normaliseLineEndings('a\rb\rc', 'lf'), 'a\nb\nc');
	});

	test('lf leaves LF-only text unchanged', () => {
		const text = 'a\nb\nc\n';
		assert.strictEqual(normaliseLineEndings(text, 'lf'), text);
	});

	test('crlf converts LF to CRLF', () => {
		assert.strictEqual(normaliseLineEndings('a\nb\nc', 'crlf'), 'a\r\nb\r\nc');
	});

	test('crlf converts bare CR to CRLF', () => {
		assert.strictEqual(normaliseLineEndings('a\rb\rc', 'crlf'), 'a\r\nb\r\nc');
	});

	test('crlf normalises mixed endings', () => {
		assert.strictEqual(normaliseLineEndings('a\r\nb\nc\rd', 'crlf'), 'a\r\nb\r\nc\r\nd');
	});

	test('cr converts LF to CR', () => {
		assert.strictEqual(normaliseLineEndings('a\nb\nc', 'cr'), 'a\rb\rc');
	});

	test('cr converts CRLF to CR', () => {
		assert.strictEqual(normaliseLineEndings('a\r\nb', 'cr'), 'a\rb');
	});

	test('empty string returns empty string', () => {
		assert.strictEqual(normaliseLineEndings('', 'lf'), '');
	});
});

suite('trimTrailingWhitespace', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('removes trailing spaces', () => {
		assert.strictEqual(trimTrailingWhitespace('hello   \nworld'), 'hello\nworld');
	});

	test('removes trailing tabs', () => {
		assert.strictEqual(trimTrailingWhitespace('hello\t\t\nworld'), 'hello\nworld');
	});

	test('preserves LF line endings', () => {
		assert.strictEqual(trimTrailingWhitespace('a  \nb  \nc'), 'a\nb\nc');
	});

	test('preserves CRLF line endings', () => {
		assert.strictEqual(trimTrailingWhitespace('a  \r\nb  \r\nc'), 'a\r\nb\r\nc');
	});

	test('preserves CR line endings', () => {
		assert.strictEqual(trimTrailingWhitespace('a  \rb  \rc'), 'a\rb\rc');
	});

	test('does not touch non-trailing whitespace', () => {
		assert.strictEqual(trimTrailingWhitespace('  hello  \n'), '  hello\n');
	});

	test('last line trailing whitespace removed', () => {
		assert.strictEqual(trimTrailingWhitespace('hello   '), 'hello');
	});

	test('empty string returns empty string', () => {
		assert.strictEqual(trimTrailingWhitespace(''), '');
	});
});

suite('ensureFinalNewline', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('appends LF when missing', () => {
		assert.strictEqual(ensureFinalNewline('hello'), 'hello\n');
	});

	test('does not double-append when LF already present', () => {
		assert.strictEqual(ensureFinalNewline('hello\n'), 'hello\n');
	});

	test('does not modify text ending with CRLF', () => {
		assert.strictEqual(ensureFinalNewline('hello\r\n'), 'hello\r\n');
	});

	test('does not modify text ending with CR', () => {
		assert.strictEqual(ensureFinalNewline('hello\r'), 'hello\r');
	});

	test('empty string returns empty string', () => {
		assert.strictEqual(ensureFinalNewline(''), '');
	});

	test('multi-line text ending without newline gets LF appended', () => {
		assert.strictEqual(ensureFinalNewline('a\nb\nc'), 'a\nb\nc\n');
	});
});

suite('applyTextFixes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('no-op when all flags off and lineEnding auto', () => {
		const text = 'hello\r\nworld  ';
		const result = applyTextFixes(text, makeProfile());
		assert.strictEqual(result, text);
	});

	test('normalises line endings when lineEnding is lf', () => {
		const result = applyTextFixes('a\r\nb\r\nc', makeProfile({ lineEnding: 'lf' }));
		assert.strictEqual(result, 'a\nb\nc');
	});

	test('normalises line endings when lineEnding is crlf', () => {
		const result = applyTextFixes('a\nb\nc', makeProfile({ lineEnding: 'crlf' }));
		assert.strictEqual(result, 'a\r\nb\r\nc');
	});

	test('trims trailing whitespace when flag set', () => {
		const result = applyTextFixes('hello   \nworld  ', makeProfile({ trimTrailingWhitespace: true }));
		assert.strictEqual(result, 'hello\nworld');
	});

	test('inserts final newline when flag set', () => {
		const result = applyTextFixes('hello', makeProfile({ insertFinalNewline: true }));
		assert.strictEqual(result, 'hello\n');
	});

	test('inserts final newline only once when already present', () => {
		const result = applyTextFixes('hello\n', makeProfile({ insertFinalNewline: true }));
		assert.strictEqual(result, 'hello\n');
	});

	test('all transforms applied in order: normalise → trim → final-newline', () => {
		// CRLF input with trailing spaces and no final newline
		const input = 'hello   \r\nworld   ';
		const result = applyTextFixes(input, makeProfile({
			lineEnding: 'lf',
			trimTrailingWhitespace: true,
			insertFinalNewline: true,
		}));
		assert.strictEqual(result, 'hello\nworld\n');
	});

	test('CRLF normalised first, ensureFinalNewline sees \\r\\n and does not append', () => {
		// After normalising to CRLF, the file ends with \r\n, so no newline is appended.
		const input = 'hello\n';
		const result = applyTextFixes(input, makeProfile({
			lineEnding: 'crlf',
			insertFinalNewline: true,
		}));
		assert.strictEqual(result, 'hello\r\n');
	});

	test('returns original reference when nothing changed', () => {
		const text = 'hello\n';
		const result = applyTextFixes(text, makeProfile({ insertFinalNewline: true }));
		// Text already ends with \n — should be identical.
		assert.strictEqual(result, text);
	});
});

// ---------------------------------------------------------------------------
// CodeStyleSaveParticipant (class behaviour)
// ---------------------------------------------------------------------------

function makeTextModel(text: string): { model: ITextModel; calls: { pushEditOperations: unknown[][] } } {
	const calls = { pushEditOperations: [] as unknown[][] };
	const model = {
		getValue: () => text,
		getFullModelRange: () => new Range(1, 1, 1, text.length + 1),
		pushStackElement: () => { /* no-op */ },
		pushEditOperations: (...args: unknown[]) => { calls.pushEditOperations.push(args); },
	} as unknown as ITextModel;
	return { model, calls };
}

function makeFileModel(textModel: ITextModel | null): ITextFileEditorModel {
	return { textEditorModel: textModel } as unknown as ITextFileEditorModel;
}

function makeStyleService(overrides: Partial<ICodeStyleProfile> = {}): ICodeStyleService {
	return {
		getActiveProfile: () => makeProfile(overrides),
	} as unknown as ICodeStyleService;
}

suite('CodeStyleSaveParticipant', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const noProgress = { report: () => { /* no-op */ } };
	const noContext = {} as ITextFileSaveParticipantContext;

	test('ordinal is 60', () => {
		const participant = new CodeStyleSaveParticipant(makeStyleService());
		assert.strictEqual(participant.ordinal, 60);
	});

	test('does nothing when enforceOnSave is false', async () => {
		const { model, calls } = makeTextModel('hello\r\n');
		const participant = new CodeStyleSaveParticipant(makeStyleService({ enforceOnSave: false }));
		await participant.participate(makeFileModel(model), noContext, noProgress, CancellationToken.None);
		assert.strictEqual(calls.pushEditOperations.length, 0);
	});

	test('does nothing when textEditorModel is null', async () => {
		const participant = new CodeStyleSaveParticipant(makeStyleService({ enforceOnSave: true, lineEnding: 'lf' }));
		await participant.participate(makeFileModel(null), noContext, noProgress, CancellationToken.None);
		// No error thrown — early exit on null model.
	});

	test('does nothing when cancellation is requested before reading text', async () => {
		const { model, calls } = makeTextModel('hello\r\n');
		const participant = new CodeStyleSaveParticipant(makeStyleService({ enforceOnSave: true, lineEnding: 'lf' }));
		await participant.participate(makeFileModel(model), noContext, noProgress, CancellationToken.Cancelled);
		assert.strictEqual(calls.pushEditOperations.length, 0);
	});

	test('does nothing when text does not change after applying fixes', async () => {
		const { model, calls } = makeTextModel('hello\n');
		const participant = new CodeStyleSaveParticipant(makeStyleService({
			enforceOnSave: true,
			lineEnding: 'lf',
			insertFinalNewline: true,
		}));
		await participant.participate(makeFileModel(model), noContext, noProgress, CancellationToken.None);
		assert.strictEqual(calls.pushEditOperations.length, 0);
	});

	test('applies fixes via pushEditOperations when text changes', async () => {
		const { model, calls } = makeTextModel('hello\r\n');
		const participant = new CodeStyleSaveParticipant(makeStyleService({
			enforceOnSave: true,
			lineEnding: 'lf',
		}));
		await participant.participate(makeFileModel(model), noContext, noProgress, CancellationToken.None);
		assert.strictEqual(calls.pushEditOperations.length, 1);
		// The edit should contain the normalised text.
		const [, edits] = calls.pushEditOperations[0] as [unknown, Array<{ text: string }>];
		assert.strictEqual(edits[0].text, 'hello\n');
	});

	test('wraps edit in pushStackElement calls for undo grouping', async () => {
		const stackCalls: string[] = [];
		const model = {
			getValue: () => 'hello\r\n',
			getFullModelRange: () => new Range(1, 1, 1, 8),
			pushStackElement: () => { stackCalls.push('stack'); },
			pushEditOperations: () => { stackCalls.push('edit'); },
		} as unknown as ITextModel;
		const participant = new CodeStyleSaveParticipant(makeStyleService({ enforceOnSave: true, lineEnding: 'lf' }));
		await participant.participate(makeFileModel(model), noContext, noProgress, CancellationToken.None);
		assert.deepStrictEqual(stackCalls, ['stack', 'edit', 'stack']);
	});
});
