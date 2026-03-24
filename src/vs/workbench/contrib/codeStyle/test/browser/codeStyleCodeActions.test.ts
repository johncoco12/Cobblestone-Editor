/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IMarker, IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { URI } from '../../../../../base/common/uri.js';
import {
	buildTextEdit,
	CodeStyleCodeActionProvider,
	isFixable,
} from '../../browser/codeStyleCodeActions.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMarker(overrides: Partial<IMarker> = {}): IMarker {
	return {
		resource: URI.parse('file:///test.ts'),
		owner: 'code-style',
		severity: MarkerSeverity.Warning,
		message: 'Trailing whitespace.',
		startLineNumber: 1,
		startColumn: 6,
		endLineNumber: 1,
		endColumn: 9,
		code: 'trailing-whitespace',
		...overrides,
	};
}

/** Minimal ITextModel stub for buildTextEdit / provideCodeActions. */
function makeModel(lineCount = 5, lastLineMaxCol = 10): ITextModel {
	return {
		uri: URI.parse('file:///test.ts'),
		getVersionId: () => 1,
		getLineCount: () => lineCount,
		getLineMaxColumn: () => lastLineMaxCol,
	} as unknown as ITextModel;
}

/** Minimal IMarkerService stub that returns a fixed list. */
function makeMarkerService(markers: IMarker[]): IMarkerService {
	return {
		read: () => markers,
	} as unknown as IMarkerService;
}

// ---------------------------------------------------------------------------
// isFixable
// ---------------------------------------------------------------------------

suite('isFixable', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('trailing-whitespace → true', () => {
		assert.strictEqual(isFixable(makeMarker({ code: 'trailing-whitespace' })), true);
	});

	test('final-newline → true', () => {
		assert.strictEqual(isFixable(makeMarker({ code: 'final-newline' })), true);
	});

	test('line-ending:lf → true', () => {
		assert.strictEqual(isFixable(makeMarker({ code: 'line-ending:lf' })), true);
	});

	test('line-ending:crlf → true', () => {
		assert.strictEqual(isFixable(makeMarker({ code: 'line-ending:crlf' })), true);
	});

	test('line-ending:cr → true', () => {
		assert.strictEqual(isFixable(makeMarker({ code: 'line-ending:cr' })), true);
	});

	test('max-line-length → false', () => {
		assert.strictEqual(isFixable(makeMarker({ code: 'max-line-length' })), false);
	});

	test('naming-variable → false', () => {
		assert.strictEqual(isFixable(makeMarker({ code: 'naming-variable' })), false);
	});

	test('undefined code → false', () => {
		assert.strictEqual(isFixable(makeMarker({ code: undefined })), false);
	});

	test('non-string code object → false', () => {
		assert.strictEqual(isFixable(makeMarker({ code: { value: 'trailing-whitespace', target: URI.parse('file:///') } })), false);
	});
});

// ---------------------------------------------------------------------------
// buildTextEdit
// ---------------------------------------------------------------------------

suite('buildTextEdit', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('trailing-whitespace: removes the whitespace span', () => {
		const marker = makeMarker({ code: 'trailing-whitespace', startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 9 });
		const edit = buildTextEdit(makeModel(), marker);
		assert.ok(edit);
		assert.strictEqual(edit.textEdit.text, '');
		assert.deepStrictEqual(edit.textEdit.range, new Range(1, 6, 1, 9));
	});

	test('final-newline: inserts \\n at end of file', () => {
		const model = makeModel(3, 7);
		const marker = makeMarker({ code: 'final-newline' });
		const edit = buildTextEdit(model, marker);
		assert.ok(edit);
		assert.strictEqual(edit.textEdit.text, '\n');
		assert.deepStrictEqual(edit.textEdit.range, new Range(3, 7, 3, 7));
	});

	test('line-ending:lf: replaces with LF', () => {
		const marker = makeMarker({ code: 'line-ending:lf', startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 7 });
		const edit = buildTextEdit(makeModel(), marker);
		assert.ok(edit);
		assert.strictEqual(edit.textEdit.text, '\n');
	});

	test('line-ending:crlf: replaces with CRLF', () => {
		const marker = makeMarker({ code: 'line-ending:crlf', startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 6 });
		const edit = buildTextEdit(makeModel(), marker);
		assert.ok(edit);
		assert.strictEqual(edit.textEdit.text, '\r\n');
	});

	test('line-ending:cr: replaces with CR', () => {
		const marker = makeMarker({ code: 'line-ending:cr', startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 6 });
		const edit = buildTextEdit(makeModel(), marker);
		assert.ok(edit);
		assert.strictEqual(edit.textEdit.text, '\r');
	});

	test('unfixable code returns undefined', () => {
		const marker = makeMarker({ code: 'max-line-length' });
		assert.strictEqual(buildTextEdit(makeModel(), marker), undefined);
	});

	test('edit includes correct resource URI and versionId', () => {
		const model = makeModel();
		const marker = makeMarker({ code: 'trailing-whitespace' });
		const edit = buildTextEdit(model, marker);
		assert.ok(edit);
		assert.strictEqual(edit.resource.toString(), model.uri.toString());
		assert.strictEqual(edit.versionId, model.getVersionId());
	});
});

// ---------------------------------------------------------------------------
// CodeStyleCodeActionProvider.provideCodeActions
// ---------------------------------------------------------------------------

suite('CodeStyleCodeActionProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('no markers → empty actions list', () => {
		const provider = new CodeStyleCodeActionProvider(makeMarkerService([]));
		const result = provider.provideCodeActions(makeModel(), new Range(1, 1, 1, 1), undefined as never, undefined as never);
		assert.deepStrictEqual(result.actions, []);
	});

	test('only unfixable markers → no individual actions, no fix-all', () => {
		const markers = [makeMarker({ code: 'max-line-length' }), makeMarker({ code: 'naming-variable' })];
		const provider = new CodeStyleCodeActionProvider(makeMarkerService(markers));
		const result = provider.provideCodeActions(makeModel(), new Range(1, 1, 1, 1), undefined as never, undefined as never);
		assert.deepStrictEqual(result.actions, []);
	});

	test('overlapping fixable marker → individual QuickFix action', () => {
		const marker = makeMarker({ code: 'trailing-whitespace', startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
		const provider = new CodeStyleCodeActionProvider(makeMarkerService([marker]));
		const result = provider.provideCodeActions(makeModel(), new Range(1, 1, 1, 3), undefined as never, undefined as never);
		const titles = result.actions.map(a => a.title);
		assert.ok(titles.some(t => t.includes('Fix:')));
	});

	test('non-overlapping fixable marker → no individual action but Fix All is present', () => {
		const marker = makeMarker({ code: 'trailing-whitespace', startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 5 });
		const provider = new CodeStyleCodeActionProvider(makeMarkerService([marker]));
		const result = provider.provideCodeActions(makeModel(), new Range(1, 1, 1, 1), undefined as never, undefined as never);
		const titles = result.actions.map(a => a.title);
		assert.ok(!titles.some(t => t.startsWith('Fix:')));
		assert.ok(titles.some(t => t.includes('Fix All')));
	});

	test('Fix All is exposed as both QuickFix and SourceFixAll kinds', () => {
		const marker = makeMarker({ code: 'trailing-whitespace', startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: 5 });
		const provider = new CodeStyleCodeActionProvider(makeMarkerService([marker]));
		const result = provider.provideCodeActions(makeModel(), new Range(1, 1, 1, 1), undefined as never, undefined as never);
		const kinds = result.actions.map(a => a.kind);
		// Should have both 'quickfix' and 'source.fixAll' variants.
		assert.ok(kinds.some(k => k === 'quickfix'));
		assert.ok(kinds.some(k => k === 'source.fixAll'));
	});

	test('multiple fixable markers → Fix All edit contains all of them', () => {
		const markers = [
			makeMarker({ code: 'trailing-whitespace', startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 9 }),
			makeMarker({ code: 'trailing-whitespace', startLineNumber: 3, startColumn: 4, endLineNumber: 3, endColumn: 6 }),
		];
		const provider = new CodeStyleCodeActionProvider(makeMarkerService(markers));
		const result = provider.provideCodeActions(makeModel(), new Range(1, 1, 1, 1), undefined as never, undefined as never);
		const fixAll = result.actions.find(a => a.title.includes('Fix All') && a.kind === 'quickfix');
		assert.ok(fixAll);
		assert.ok(fixAll.edit);
		assert.strictEqual(fixAll.edit.edits.length, 2);
	});
});
