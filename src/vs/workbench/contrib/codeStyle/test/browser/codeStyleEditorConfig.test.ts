/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	generateEditorConfig,
	parseEditorConfig,
} from '../../browser/codeStyleEditorConfig.js';
import { ICodeStyleProfile } from '../../common/codeStyleTypes.js';

/** Full profile used as a baseline for generateEditorConfig tests. */
function makeProfile(overrides: Partial<ICodeStyleProfile> = {}): ICodeStyleProfile {
	return {
		lineEnding: 'lf',
		insertFinalNewline: true,
		trimTrailingWhitespace: true,
		maxLineLength: 120,
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

suite('parseEditorConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses indent_style = space', () => {
		const result = parseEditorConfig('[*]\nindent_style = space\n');
		assert.deepStrictEqual(result.indent, { style: 'spaces', size: 4 });
	});

	test('parses indent_style = tab', () => {
		const result = parseEditorConfig('[*]\nindent_style = tab\n');
		assert.deepStrictEqual(result.indent, { style: 'tabs', size: 4 });
	});

	test('parses indent_size', () => {
		const result = parseEditorConfig('[*]\nindent_style = space\nindent_size = 2\n');
		assert.deepStrictEqual(result.indent, { style: 'spaces', size: 2 });
	});

	test('tab_width is used as indent size', () => {
		const result = parseEditorConfig('[*]\nindent_style = tab\ntab_width = 8\n');
		assert.deepStrictEqual(result.indent, { style: 'tabs', size: 8 });
	});

	test('parses end_of_line = lf', () => {
		const result = parseEditorConfig('[*]\nend_of_line = lf\n');
		assert.strictEqual(result.lineEnding, 'lf');
	});

	test('parses end_of_line = crlf', () => {
		const result = parseEditorConfig('[*]\nend_of_line = crlf\n');
		assert.strictEqual(result.lineEnding, 'crlf');
	});

	test('parses end_of_line = cr', () => {
		const result = parseEditorConfig('[*]\nend_of_line = cr\n');
		assert.strictEqual(result.lineEnding, 'cr');
	});

	test('parses trim_trailing_whitespace = true', () => {
		const result = parseEditorConfig('[*]\ntrim_trailing_whitespace = true\n');
		assert.strictEqual(result.trimTrailingWhitespace, true);
	});

	test('parses trim_trailing_whitespace = false', () => {
		const result = parseEditorConfig('[*]\ntrim_trailing_whitespace = false\n');
		assert.strictEqual(result.trimTrailingWhitespace, false);
	});

	test('parses insert_final_newline = true', () => {
		const result = parseEditorConfig('[*]\ninsert_final_newline = true\n');
		assert.strictEqual(result.insertFinalNewline, true);
	});

	test('parses max_line_length as number', () => {
		const result = parseEditorConfig('[*]\nmax_line_length = 100\n');
		assert.strictEqual(result.maxLineLength, 100);
	});

	test('max_line_length = off maps to 0', () => {
		const result = parseEditorConfig('[*]\nmax_line_length = off\n');
		assert.strictEqual(result.maxLineLength, 0);
	});

	test('invalid max_line_length falls back to 0', () => {
		const result = parseEditorConfig('[*]\nmax_line_length = notanumber\n');
		assert.strictEqual(result.maxLineLength, 0);
	});

	test('ignores # comments', () => {
		const result = parseEditorConfig('[*]\n# this is a comment\nend_of_line = lf\n');
		assert.strictEqual(result.lineEnding, 'lf');
	});

	test('ignores ; comments', () => {
		const result = parseEditorConfig('[*]\n; this is a comment\nend_of_line = crlf\n');
		assert.strictEqual(result.lineEnding, 'crlf');
	});

	test('ignores settings outside [*] section', () => {
		const content = '[*.md]\nend_of_line = crlf\n[*]\nend_of_line = lf\n';
		const result = parseEditorConfig(content);
		assert.strictEqual(result.lineEnding, 'lf');
	});

	test('settings before any section header are ignored', () => {
		const result = parseEditorConfig('end_of_line = crlf\n[*]\nend_of_line = lf\n');
		assert.strictEqual(result.lineEnding, 'lf');
	});

	test('handles CRLF line endings in file content', () => {
		const result = parseEditorConfig('[*]\r\nend_of_line = lf\r\ninsert_final_newline = true\r\n');
		assert.strictEqual(result.lineEnding, 'lf');
		assert.strictEqual(result.insertFinalNewline, true);
	});

	test('keys and values are case-insensitive', () => {
		const result = parseEditorConfig('[*]\nINDENT_STYLE = Space\nEND_OF_LINE = LF\n');
		assert.deepStrictEqual(result.indent, { style: 'spaces', size: 4 });
		assert.strictEqual(result.lineEnding, 'lf');
	});

	test('returns empty object for empty input', () => {
		assert.deepStrictEqual(parseEditorConfig(''), {});
	});

	test('returns empty object when no [*] section present', () => {
		assert.deepStrictEqual(parseEditorConfig('[*.ts]\nend_of_line = lf\n'), {});
	});

	test('indent not set when only indent_size is present without indent_style', () => {
		// indent_size alone still produces an indent entry with default style 'tabs'
		const result = parseEditorConfig('[*]\nindent_size = 2\n');
		assert.deepStrictEqual(result.indent, { style: 'tabs', size: 2 });
	});
});

suite('generateEditorConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('output starts with root = true and [*] section', () => {
		const output = generateEditorConfig(makeProfile());
		assert.ok(output.includes('root = true'));
		assert.ok(output.includes('[*]'));
	});

	test('tabs indent style written as "tab"', () => {
		const output = generateEditorConfig(makeProfile({ indent: { style: 'tabs', size: 4 } }));
		assert.ok(output.includes('indent_style = tab'));
	});

	test('spaces indent style written as "space"', () => {
		const output = generateEditorConfig(makeProfile({ indent: { style: 'spaces', size: 2 } }));
		assert.ok(output.includes('indent_style = space'));
		assert.ok(output.includes('indent_size = 2'));
	});

	test('explicit line ending is written', () => {
		const output = generateEditorConfig(makeProfile({ lineEnding: 'crlf' }));
		assert.ok(output.includes('end_of_line = crlf'));
	});

	test('auto line ending is omitted', () => {
		const output = generateEditorConfig(makeProfile({ lineEnding: 'auto' }));
		assert.ok(!output.includes('end_of_line'));
	});

	test('trim_trailing_whitespace written correctly', () => {
		const output = generateEditorConfig(makeProfile({ trimTrailingWhitespace: false }));
		assert.ok(output.includes('trim_trailing_whitespace = false'));
	});

	test('insert_final_newline written correctly', () => {
		const output = generateEditorConfig(makeProfile({ insertFinalNewline: false }));
		assert.ok(output.includes('insert_final_newline = false'));
	});

	test('max_line_length written when > 0', () => {
		const output = generateEditorConfig(makeProfile({ maxLineLength: 80 }));
		assert.ok(output.includes('max_line_length = 80'));
	});

	test('max_line_length omitted when 0', () => {
		const output = generateEditorConfig(makeProfile({ maxLineLength: 0 }));
		assert.ok(!output.includes('max_line_length'));
	});

	test('output ends with a newline', () => {
		const output = generateEditorConfig(makeProfile());
		assert.ok(output.endsWith('\n'));
	});

	test('round-trip: generate then parse recovers the same settings', () => {
		const profile = makeProfile({
			lineEnding: 'lf',
			indent: { style: 'spaces', size: 2 },
			trimTrailingWhitespace: true,
			insertFinalNewline: true,
			maxLineLength: 100,
		});
		const content = generateEditorConfig(profile);
		const parsed = parseEditorConfig(content);
		assert.strictEqual(parsed.lineEnding, profile.lineEnding);
		assert.deepStrictEqual(parsed.indent, profile.indent);
		assert.strictEqual(parsed.trimTrailingWhitespace, profile.trimTrailingWhitespace);
		assert.strictEqual(parsed.insertFinalNewline, profile.insertFinalNewline);
		assert.strictEqual(parsed.maxLineLength, profile.maxLineLength);
	});
});
