/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ICodeStyleService } from '../common/codeStyle.js';

/**
 * Workbench contribution that shows the active code style profile name in the
 * status bar. Clicking the entry opens the Code Style Manager panel.
 */
export class CodeStyleStatusBarItem extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.codeStyleStatusBar';

	private readonly _entry: IStatusbarEntryAccessor;

	constructor(
		@ICodeStyleService private readonly _styleService: ICodeStyleService,
		@IStatusbarService statusbarService: IStatusbarService,
	) {
		super();

		this._entry = this._register(statusbarService.addEntry(
			this._makeEntry(),
			'code-style',
			StatusbarAlignment.RIGHT,
			100,
		));

		this._register(this._styleService.onDidChangeProfile(() => {
			this._entry.update(this._makeEntry());
		}));
	}

	private _makeEntry(): IStatusbarEntry {
		const profileName = this._styleService.getActiveProfileName();
		const text = profileName
			? nls.localize('codeStyle.statusbar.text', '$(code) {0}', profileName)
			: nls.localize('codeStyle.statusbar.textDefault', '$(code) Code Style');
		return {
			name: nls.localize('codeStyle.statusbar.name', 'Code Style'),
			text,
			ariaLabel: text,
			command: 'code-style.openPanel',
			tooltip: nls.localize('codeStyle.statusbar.tooltip', 'Open Code Style Manager'),
		};
	}
}
