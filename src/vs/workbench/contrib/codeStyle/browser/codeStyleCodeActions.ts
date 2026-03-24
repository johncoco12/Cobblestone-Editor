/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../../../editor/common/core/range.js';
import {
	CodeAction, CodeActionList, CodeActionProvider,
	IWorkspaceTextEdit, WorkspaceEdit,
} from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import * as nls from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarker, IMarkerService } from '../../../../platform/markers/common/markers.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';

const OWNER = 'code-style';

export function isFixable(marker: IMarker): boolean {
	const code = typeof marker.code === 'string' ? marker.code : undefined;
	return code === 'trailing-whitespace' || code === 'final-newline' || (code?.startsWith('line-ending:') ?? false);
}

export function buildTextEdit(model: ITextModel, marker: IMarker): IWorkspaceTextEdit | undefined {
	const code = typeof marker.code === 'string' ? marker.code : undefined;

	if (code === 'trailing-whitespace') {
		return {
			resource: model.uri,
			versionId: model.getVersionId(),
			textEdit: {
				range: new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn),
				text: '',
			},
		};
	}

	if (code === 'final-newline') {
		const lastLine = model.getLineCount();
		const lastCol = model.getLineMaxColumn(lastLine);
		return {
			resource: model.uri,
			versionId: model.getVersionId(),
			textEdit: {
				range: new Range(lastLine, lastCol, lastLine, lastCol),
				text: '\n',
			},
		};
	}

	if (code?.startsWith('line-ending:')) {
		// The expected ending is encoded in the marker code as 'line-ending:{lf|crlf|cr}'.
		const expected = code.slice('line-ending:'.length);
		const replacement = expected === 'lf' ? '\n' : expected === 'crlf' ? '\r\n' : '\r';
		return {
			resource: model.uri,
			versionId: model.getVersionId(),
			textEdit: {
				range: new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn),
				text: replacement,
			},
		};
	}

	return undefined;
}

export class CodeStyleCodeActionProvider implements CodeActionProvider {

	constructor(@IMarkerService private readonly _markerService: IMarkerService) { }

	provideCodeActions(model: ITextModel, range: Range, _context: unknown, _token: CancellationToken): CodeActionList {
		const allMarkers = this._markerService.read({ resource: model.uri, owner: OWNER });
		const fixableMarkers = allMarkers.filter(isFixable);

		if (fixableMarkers.length === 0) {
			return { actions: [], dispose: () => { /* nothing */ } };
		}

		// Markers overlapping the cursor range get individual quick-fix actions.
		const overlapping = fixableMarkers.filter(m =>
			Range.areIntersectingOrTouching(
				range,
				new Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn),
			)
		);

		const actions: CodeAction[] = [];

		for (const marker of overlapping) {
			const edit = buildTextEdit(model, marker);
			if (!edit) {
				continue;
			}
			const workspaceEdit: WorkspaceEdit = { edits: [edit] };
			actions.push({
				title: nls.localize('codeStyle.codeAction.fix', 'Fix: {0}', marker.message),
				kind: CodeActionKind.QuickFix.value,
				edit: workspaceEdit,
				isPreferred: true,
			});
		}

		// "Fix All" action — collects all fixable markers in the file.
		const allEdits: IWorkspaceTextEdit[] = [];
		// Process in reverse order to preserve offsets when applying.
		for (const marker of [...fixableMarkers].reverse()) {
			const edit = buildTextEdit(model, marker);
			if (edit) {
				allEdits.push(edit);
			}
		}
		if (allEdits.length > 0) {
			// Expose under both QuickFix (lightbulb / Ctrl+.) and SourceFixAll (Source Actions menu).
			actions.push({
				title: nls.localize('codeStyle.codeAction.fixAll', 'Fix All Code Style Issues'),
				kind: CodeActionKind.QuickFix.value,
				edit: { edits: allEdits },
			});
			actions.push({
				title: nls.localize('codeStyle.codeAction.fixAllSource', 'Fix All Code Style Issues (Source Action)'),
				kind: CodeActionKind.SourceFixAll.value,
				edit: { edits: allEdits },
			});
		}

		return { actions, dispose: () => { /* nothing */ } };
	}
}

/**
 * Workbench contribution that registers a {@link CodeActionProvider} for all
 * languages. The provider offers quick fixes for auto-correctable code-style
 * violations produced by {@link CodeStyleDiagnosticProvider}.
 */
export class CodeStyleCodeActionsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.codeStyleCodeActions';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super();
		const provider = instantiationService.createInstance(CodeStyleCodeActionProvider);
		this._register(languageFeaturesService.codeActionProvider.register('*', provider));
	}
}
