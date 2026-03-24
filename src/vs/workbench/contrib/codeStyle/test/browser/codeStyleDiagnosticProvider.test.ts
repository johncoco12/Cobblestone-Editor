/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import {
	validateFinalNewline,
	validateLineEndings,
	validateMaxLineLength,
	validateNamingRules,
	validateTrailingWhitespace,
} from '../../browser/codeStyleDiagnosticProvider.js';
import { INamingRule } from '../../common/codeStyleTypes.js';

const W = MarkerSeverity.Warning;

function makeRule(overrides: Partial<INamingRule> = {}): INamingRule {
	return {
		id: 'test-rule',
		kind: 'variable',
		style: 'camelCase',
		languages: [],
		enabled: true,
		prefix: '',
		suffix: '',
		severity: 'warning',
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// validateLineEndings
// ---------------------------------------------------------------------------

suite('validateLineEndings', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('auto returns no markers', () => {
		assert.deepStrictEqual(validateLineEndings('a\r\nb', 'auto', W), []);
	});

	// ---- lf ----

	test('lf: LF endings produce no markers', () => {
		assert.deepStrictEqual(validateLineEndings('a\nb\nc\n', 'lf', W), []);
	});

	test('lf: CRLF produces a marker', () => {
		const markers = validateLineEndings('a\r\nb', 'lf', W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].code, 'line-ending:lf');
		assert.strictEqual(markers[0].startLineNumber, 1);
	});

	test('lf: bare CR produces a marker', () => {
		const markers = validateLineEndings('a\rb', 'lf', W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].code, 'line-ending:lf');
	});

	test('lf: mixed endings produce one marker per wrong EOL', () => {
		// Line 1 ends CRLF, line 2 ends LF (ok), line 3 ends CR
		const markers = validateLineEndings('a\r\nb\nc\r', 'lf', W);
		assert.strictEqual(markers.length, 2);
	});

	// ---- crlf ----

	test('crlf: CRLF endings produce no markers', () => {
		assert.deepStrictEqual(validateLineEndings('a\r\nb\r\n', 'crlf', W), []);
	});

	test('crlf: bare LF produces a marker', () => {
		const markers = validateLineEndings('a\nb', 'crlf', W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].code, 'line-ending:crlf');
	});

	test('crlf: bare CR (not followed by LF) produces a marker', () => {
		const markers = validateLineEndings('a\rb', 'crlf', W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].code, 'line-ending:crlf');
	});

	// ---- cr ----

	test('cr: CR endings produce no markers', () => {
		assert.deepStrictEqual(validateLineEndings('a\rb\r', 'cr', W), []);
	});

	test('cr: LF produces a marker', () => {
		const markers = validateLineEndings('a\nb', 'cr', W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].code, 'line-ending:cr');
	});

	test('cr: CRLF produces a marker', () => {
		const markers = validateLineEndings('a\r\nb', 'cr', W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].code, 'line-ending:cr');
	});

	// ---- marker fields ----

	test('marker has correct severity', () => {
		const markers = validateLineEndings('a\r\nb', 'lf', MarkerSeverity.Error);
		assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
	});

	test('marker column span covers the wrong EOL characters', () => {
		// 'a\r\nb' with lf expected: EOL starts at col 2, CRLF is 2 chars
		const markers = validateLineEndings('a\r\nb', 'lf', W);
		assert.strictEqual(markers[0].startColumn, 2); // after 'a'
		assert.strictEqual(markers[0].endColumn, 4);   // 2 chars wide
	});

	test('empty text produces no markers', () => {
		assert.deepStrictEqual(validateLineEndings('', 'lf', W), []);
	});
});

// ---------------------------------------------------------------------------
// validateTrailingWhitespace
// ---------------------------------------------------------------------------

suite('validateTrailingWhitespace', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('no trailing whitespace → no markers', () => {
		assert.deepStrictEqual(validateTrailingWhitespace(['hello', 'world'], W), []);
	});

	test('trailing space produces a marker', () => {
		const markers = validateTrailingWhitespace(['hello   ', 'world'], W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].startLineNumber, 1);
		assert.strictEqual(markers[0].startColumn, 6); // after 'hello'
		assert.strictEqual(markers[0].endColumn, 9);   // inclusive of trailing spaces
		assert.strictEqual(markers[0].code, 'trailing-whitespace');
	});

	test('trailing tab produces a marker', () => {
		const markers = validateTrailingWhitespace(['hello\t\t', 'world'], W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].startLineNumber, 1);
	});

	test('multiple lines with trailing whitespace → multiple markers', () => {
		const markers = validateTrailingWhitespace(['a ', 'b\t', 'c'], W);
		assert.strictEqual(markers.length, 2);
		assert.strictEqual(markers[0].startLineNumber, 1);
		assert.strictEqual(markers[1].startLineNumber, 2);
	});

	test('last line trailing whitespace is flagged', () => {
		const markers = validateTrailingWhitespace(['a', 'b  '], W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].startLineNumber, 2);
	});

	test('interior whitespace is not flagged', () => {
		assert.deepStrictEqual(validateTrailingWhitespace(['hello world'], W), []);
	});

	test('empty lines produce no marker', () => {
		assert.deepStrictEqual(validateTrailingWhitespace(['a', '', 'b'], W), []);
	});
});

// ---------------------------------------------------------------------------
// validateMaxLineLength
// ---------------------------------------------------------------------------

suite('validateMaxLineLength', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('disabled (maxLength = 0) → no markers', () => {
		assert.deepStrictEqual(validateMaxLineLength(['a'.repeat(999)], 0, W), []);
	});

	test('line at exactly maxLength → no marker', () => {
		assert.deepStrictEqual(validateMaxLineLength(['a'.repeat(80)], 80, W), []);
	});

	test('line exceeding maxLength → marker', () => {
		const line = 'a'.repeat(81);
		const markers = validateMaxLineLength([line], 80, W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].startLineNumber, 1);
		assert.strictEqual(markers[0].startColumn, 81);
		assert.strictEqual(markers[0].endColumn, 82);
		assert.strictEqual(markers[0].code, 'max-line-length');
	});

	test('multiple long lines → multiple markers', () => {
		const markers = validateMaxLineLength(['a'.repeat(100), 'b'.repeat(5), 'c'.repeat(100)], 80, W);
		assert.strictEqual(markers.length, 2);
		assert.strictEqual(markers[0].startLineNumber, 1);
		assert.strictEqual(markers[1].startLineNumber, 3);
	});

	test('marker includes current length in message', () => {
		const markers = validateMaxLineLength(['a'.repeat(100)], 80, W);
		assert.ok(markers[0].message.includes('100'));
		assert.ok(markers[0].message.includes('80'));
	});
});

// ---------------------------------------------------------------------------
// validateFinalNewline
// ---------------------------------------------------------------------------

suite('validateFinalNewline', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('text ending with LF → no marker', () => {
		assert.deepStrictEqual(validateFinalNewline('hello\n', 2, W), []);
	});

	test('text ending with CRLF → no marker', () => {
		assert.deepStrictEqual(validateFinalNewline('hello\r\n', 2, W), []);
	});

	test('text ending with CR → no marker', () => {
		assert.deepStrictEqual(validateFinalNewline('hello\r', 2, W), []);
	});

	test('text without final newline → one marker', () => {
		const markers = validateFinalNewline('hello', 1, W);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].code, 'final-newline');
		assert.strictEqual(markers[0].startLineNumber, 1);
	});

	test('empty text → no marker', () => {
		assert.deepStrictEqual(validateFinalNewline('', 0, W), []);
	});

	test('marker is placed on the last line', () => {
		const markers = validateFinalNewline('a\nb\nc', 3, W);
		assert.strictEqual(markers[0].startLineNumber, 3);
	});
});

// ---------------------------------------------------------------------------
// validateNamingRules
// ---------------------------------------------------------------------------

suite('validateNamingRules', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('no rules → no markers', () => {
		assert.deepStrictEqual(validateNamingRules('const myVar = 1;', 'typescript', []), []);
	});

	test('disabled rule → no markers', () => {
		const rule = makeRule({ enabled: false, style: 'PascalCase' });
		assert.deepStrictEqual(validateNamingRules('const myVar = 1;', 'typescript', [rule]), []);
	});

	test('camelCase rule: conforming variable → no marker', () => {
		const rule = makeRule({ kind: 'variable', style: 'camelCase' });
		assert.deepStrictEqual(validateNamingRules('const myVar = 1;', 'typescript', [rule]), []);
	});

	test('camelCase rule: PascalCase variable → marker', () => {
		const rule = makeRule({ kind: 'variable', style: 'camelCase' });
		const markers = validateNamingRules('const MyVar = 1;', 'typescript', [rule]);
		assert.strictEqual(markers.length, 1);
		assert.ok(markers[0].message.includes('MyVar'));
		assert.ok(markers[0].message.includes('camelCase'));
	});

	test('PascalCase class rule: conforming → no marker', () => {
		const rule = makeRule({ kind: 'class', style: 'PascalCase' });
		assert.deepStrictEqual(validateNamingRules('class MyService {}', 'typescript', [rule]), []);
	});

	test('PascalCase class rule: lowercase → marker', () => {
		const rule = makeRule({ kind: 'class', style: 'PascalCase' });
		const markers = validateNamingRules('class myService {}', 'typescript', [rule]);
		assert.strictEqual(markers.length, 1);
		assert.ok(markers[0].message.includes('myService'));
	});

	test('language filter: rule applies when language matches', () => {
		const rule = makeRule({ kind: 'variable', style: 'PascalCase', languages: ['typescript'] });
		const markers = validateNamingRules('const myVar = 1;', 'typescript', [rule]);
		assert.strictEqual(markers.length, 1);
	});

	test('language filter: rule skipped when language does not match', () => {
		const rule = makeRule({ kind: 'variable', style: 'PascalCase', languages: ['python'] });
		assert.deepStrictEqual(validateNamingRules('const myVar = 1;', 'typescript', [rule]), []);
	});

	test('language filter: empty languages list applies to all languages', () => {
		const rule = makeRule({ kind: 'variable', style: 'PascalCase', languages: [] });
		const markers = validateNamingRules('const myVar = 1;', 'go', [rule]);
		assert.strictEqual(markers.length, 1);
	});

	test('prefix requirement: missing prefix → marker', () => {
		const rule = makeRule({ kind: 'interface', style: 'PascalCase', prefix: 'I' });
		const markers = validateNamingRules('interface Foo {}', 'typescript', [rule]);
		assert.strictEqual(markers.length, 1);
		assert.ok(markers[0].message.includes("prefix 'I'"));
	});

	test('prefix requirement: correct prefix → no marker', () => {
		const rule = makeRule({ kind: 'interface', style: 'PascalCase', prefix: 'I' });
		assert.deepStrictEqual(validateNamingRules('interface IFoo {}', 'typescript', [rule]), []);
	});

	test('marker position is on the correct line', () => {
		const rule = makeRule({ kind: 'variable', style: 'camelCase' });
		const code = 'const a = 1;\nconst BadName = 2;\nconst c = 3;';
		const markers = validateNamingRules(code, 'typescript', [rule]);
		assert.strictEqual(markers.length, 1);
		assert.strictEqual(markers[0].startLineNumber, 2);
	});

	test('function naming rule: snake_case violation', () => {
		const rule = makeRule({ kind: 'function', style: 'camelCase' });
		const markers = validateNamingRules('function my_function() {}', 'typescript', [rule]);
		assert.strictEqual(markers.length, 1);
		assert.ok(markers[0].message.includes('my_function'));
	});

	test('any style rule never produces markers', () => {
		const rule = makeRule({ kind: 'variable', style: 'any' });
		assert.deepStrictEqual(validateNamingRules('const SCREAMING = 1;\nconst camel = 2;\nconst PascalVar = 3;', 'typescript', [rule]), []);
	});
});
