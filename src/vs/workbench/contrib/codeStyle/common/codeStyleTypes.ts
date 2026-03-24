/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ---------------------------------------------------------------------------
// Primitive value types
// ---------------------------------------------------------------------------

/** Desired line-ending sequence for a file. `'auto'` means detect from content. */
export type LineEnding = 'lf' | 'crlf' | 'cr' | 'auto';

/** Whether to use hard tabs or soft spaces for indentation. */
export type IndentStyle = 'tabs' | 'spaces';

/** Preferred quote character for string literals. `'any'` means no preference. */
export type QuoteStyle = 'single' | 'double' | 'backtick' | 'any';

/** Whether statement-terminating semicolons are required or forbidden. */
export type SemicolonStyle = 'always' | 'never' | 'any';

/** Trailing-comma policy for multi-line lists. */
export type TrailingCommaStyle = 'always' | 'never' | 'es5' | 'any';

/** Whether opening braces appear on the same line as their statement or on the next. */
export type BraceStyle = 'same-line' | 'next-line' | 'any';

/**
 * Per-language syntax override stored in `code-style.languageSyntaxOverrides`.
 * Any field absent means the global `*` value applies for that language.
 */
export interface ISyntaxOverride {
	/** VS Code language ID this override applies to. */
	readonly language: string;
	quotes?: QuoteStyle;
	semicolons?: SemicolonStyle;
	trailingCommas?: TrailingCommaStyle;
	braceStyle?: BraceStyle;
}

/** Naming convention style for identifiers. */
export type NamingStyle = 'camelCase' | 'PascalCase' | 'snake_case' | 'SCREAMING_SNAKE_CASE' | 'kebab-case' | 'any';

/** The syntactic role of an identifier in source code. */
export type IdentifierKind = 'variable' | 'function' | 'class' | 'interface' | 'enum' | 'enumMember' | 'type' | 'constant' | 'parameter' | 'property';

/** Diagnostic severity level emitted for a code-style violation. */
export type CodeStyleSeverity = 'error' | 'warning' | 'information' | 'hint';

// ---------------------------------------------------------------------------
// Sub-configuration types
// ---------------------------------------------------------------------------

/** Indentation settings. */
export interface IIndentConfig {
	style: IndentStyle;
	/** Number of spaces per indent level (used when `style` is `'spaces'`). */
	size: number;
}

/**
 * A naming rule that governs how identifiers of a specific kind should be
 * cased and optionally prefixed or suffixed.
 */
export interface INamingRule {
	/** Stable, generated identifier for this rule. */
	readonly id: string;
	kind: IdentifierKind;
	style: NamingStyle;
	/**
	 * VS Code language IDs this rule applies to.
	 * An empty array means the rule applies to all languages.
	 */
	languages: string[];
	enabled: boolean;
	/** Required prefix, e.g. `'I'` for TypeScript interfaces. */
	prefix: string;
	/** Required suffix. */
	suffix: string;
	severity: CodeStyleSeverity;
}

// ---------------------------------------------------------------------------
// Code style profile
// ---------------------------------------------------------------------------

/**
 * A complete set of code style settings.
 *
 * Language-keyed maps use `'*'` as the wildcard fallback for all languages.
 * A specific language entry takes precedence over `'*'`.
 */
export interface ICodeStyleProfile {
	// --- General ---
	lineEnding: LineEnding;
	insertFinalNewline: boolean;
	trimTrailingWhitespace: boolean;
	/** Maximum allowed line length in characters. `0` disables the check. */
	maxLineLength: number;
	/** Whether to automatically apply fixes when a file is saved. */
	enforceOnSave: boolean;
	defaultSeverity: CodeStyleSeverity;

	// --- Indentation ---
	indent: IIndentConfig;

	// --- Syntax (per-language, '*' = all languages) ---
	quotes: Record<string, QuoteStyle>;
	semicolons: Record<string, SemicolonStyle>;
	trailingCommas: Record<string, TrailingCommaStyle>;
	braceStyle: Record<string, BraceStyle>;

	// --- Naming ---
	namingRules: INamingRule[];
}

// ---------------------------------------------------------------------------
// Named profile
// ---------------------------------------------------------------------------

/** A code style profile with a human-readable name, as stored in configuration. */
export interface INamedProfile {
	readonly name: string;
	readonly profile: ICodeStyleProfile;
	/** Whether this is a built-in, read-only profile. */
	readonly builtIn?: boolean;
}

/** Generates a stable unique identifier for a new {@link INamingRule}. */
export function generateNamingRuleId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2);
}


