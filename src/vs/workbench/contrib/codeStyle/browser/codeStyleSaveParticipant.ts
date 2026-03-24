/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IProgress, IProgressStep } from '../../../../platform/progress/common/progress.js';
import { ITextFileEditorModel, ITextFileSaveParticipant, ITextFileSaveParticipantContext } from '../../../services/textfile/common/textfiles.js';
import { ICodeStyleService } from '../common/codeStyle.js';
import { ICodeStyleProfile, LineEnding } from '../common/codeStyleTypes.js';

/** Participant ordinal — runs after built-in format/trim participants. */
const ORDINAL = 60;

/**
 * Converts `text` so that all line endings match `target`.
 * Returns the original string unchanged when `target` is `'auto'`.
 */
export function normaliseLineEndings(text: string, target: LineEnding): string {
	if (target === 'auto') {
		return text;
	}
	// Normalise to LF first, then convert to the desired sequence.
	const lf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	switch (target) {
		case 'lf': return lf;
		case 'crlf': return lf.replace(/\n/g, '\r\n');
		case 'cr': return lf.replace(/\n/g, '\r');
	}
}

/** Removes trailing whitespace from every line while preserving line endings. */
export function trimTrailingWhitespace(text: string): string {
	return text.replace(/[ \t]+(?=\r\n|\r|\n|$)/g, '');
}

/** Ensures the text ends with a single newline (LF). */
export function ensureFinalNewline(text: string): string {
	if (!text) {
		return text;
	}
	if (text.endsWith('\r\n')) {
		return text;
	}
	if (text.endsWith('\n') || text.endsWith('\r')) {
		return text;
	}
	return text + '\n';
}

/**
 * Applies all auto-fixable code-style transforms (line endings, trailing
 * whitespace, final newline) to `text` according to `profile`.
 * Returns the transformed string, or the original string if nothing changed.
 */
export function applyTextFixes(text: string, profile: ICodeStyleProfile): string {
	let result = text;
	if (profile.lineEnding !== 'auto') {
		result = normaliseLineEndings(result, profile.lineEnding);
	}
	if (profile.trimTrailingWhitespace) {
		result = trimTrailingWhitespace(result);
	}
	if (profile.insertFinalNewline) {
		result = ensureFinalNewline(result);
	}
	return result;
}

/**
 * A {@link ITextFileSaveParticipant} that applies code-style fixes just before
 * a file is written to disk.
 *
 * Only runs when the active profile has `enforceOnSave` set to `true`.
 */
export class CodeStyleSaveParticipant implements ITextFileSaveParticipant {

	readonly ordinal = ORDINAL;

	constructor(private readonly _styleService: ICodeStyleService) { }

	async participate(
		model: ITextFileEditorModel,
		_context: ITextFileSaveParticipantContext,
		_progress: IProgress<IProgressStep>,
		token: CancellationToken,
	): Promise<void> {
		const profile = this._styleService.getActiveProfile();
		if (!profile.enforceOnSave) {
			return;
		}

		const textModel = model.textEditorModel;
		if (!textModel || token.isCancellationRequested) {
			return;
		}

		const original = textModel.getValue();
		const text = applyTextFixes(original, profile);

		if (text === original || token.isCancellationRequested) {
			return;
		}

		// Apply all accumulated edits as a single undoable operation.
		textModel.pushStackElement();
		textModel.pushEditOperations(
			[],
			[{
				range: textModel.getFullModelRange(),
				text,
			}],
			() => null,
		);
		textModel.pushStackElement();
	}
}
