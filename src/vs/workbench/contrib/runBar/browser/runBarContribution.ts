/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/runBar.css';
import { Disposable } from '../../../../base/common/lifecycle.js';
import * as dom from '../../../../base/browser/dom.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IDebugService, ILaunch, State } from '../../debug/common/debug.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { localize } from '../../../../nls.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';

export class RunBarContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.runBar';

	private readonly _domNode: HTMLElement;
	private readonly _profileSelect: HTMLSelectElement;
	private readonly _buildBtn: HTMLButtonElement;
	private readonly _runBtn: HTMLButtonElement;
	private readonly _debugBtn: HTMLButtonElement;
	private readonly _stopBtn: HTMLButtonElement;
	private readonly _debugControlsGroup: HTMLElement;
	private readonly _continueBtn: HTMLButtonElement;
	private readonly _pauseBtn: HTMLButtonElement;
	private readonly _stepOverBtn: HTMLButtonElement;
	private readonly _stepIntoBtn: HTMLButtonElement;
	private readonly _stepOutBtn: HTMLButtonElement;
	private readonly _restartBtn: HTMLButtonElement;

	constructor(
		@IDebugService private readonly debugService: IDebugService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();

		this._domNode = dom.$('.run-bar');
		this._domNode.setAttribute('aria-label', localize('runBar.ariaLabel', 'Run and Debug Bar'));

		// Profile select dropdown
		this._profileSelect = dom.append(this._domNode, dom.$('select.run-bar-profile')) as HTMLSelectElement;
		this._profileSelect.title = localize('runBar.selectProfile', 'Select Launch Profile');

		// Divider
		dom.append(this._domNode, dom.$('.run-bar-divider'));

		// Build button
		this._buildBtn = dom.append(this._domNode, dom.$('button.run-bar-btn.run-bar-build-btn')) as HTMLButtonElement;
		this._buildBtn.title = localize('runBar.build', 'Run Build Task');
		dom.append(this._buildBtn, dom.$('span.codicon.codicon-tools'));
		dom.append(this._buildBtn, dom.$('span.run-bar-btn-label')).textContent = localize('runBar.buildLabel', 'Build');

		// Run button (no debug)
		this._runBtn = dom.append(this._domNode, dom.$('button.run-bar-btn.run-bar-run-btn')) as HTMLButtonElement;
		this._runBtn.title = localize('runBar.run', 'Run Without Debugging');
		dom.append(this._runBtn, dom.$('span.codicon.codicon-play'));
		dom.append(this._runBtn, dom.$('span.run-bar-btn-label')).textContent = localize('runBar.runLabel', 'Run');

		// Debug button
		this._debugBtn = dom.append(this._domNode, dom.$('button.run-bar-btn.run-bar-debug-btn')) as HTMLButtonElement;
		this._debugBtn.title = localize('runBar.debug', 'Start Debugging');
		dom.append(this._debugBtn, dom.$('span.codicon.codicon-debug-alt'));
		dom.append(this._debugBtn, dom.$('span.run-bar-btn-label')).textContent = localize('runBar.debugLabel', 'Debug');

		// Stop button (hidden when not running)
		this._stopBtn = dom.append(this._domNode, dom.$('button.run-bar-btn.run-bar-stop-btn')) as HTMLButtonElement;
		this._stopBtn.title = localize('runBar.stop', 'Stop');
		dom.append(this._stopBtn, dom.$('span.codicon.codicon-debug-stop'));
		dom.append(this._stopBtn, dom.$('span.run-bar-btn-label')).textContent = localize('runBar.stopLabel', 'Stop');

		// Debug controls group (shown when a session is active)
		this._debugControlsGroup = dom.append(this._domNode, dom.$('.run-bar-debug-controls'));
		dom.append(this._debugControlsGroup, dom.$('.run-bar-divider'));

		// Continue button (shown when paused at a breakpoint)
		this._continueBtn = dom.append(this._debugControlsGroup, dom.$('button.run-bar-btn.run-bar-icon-btn.run-bar-continue-btn')) as HTMLButtonElement;
		this._continueBtn.title = localize('runBar.continue', 'Continue');
		dom.append(this._continueBtn, dom.$('span.codicon.codicon-debug-continue'));

		// Pause button (shown when session is actively running)
		this._pauseBtn = dom.append(this._debugControlsGroup, dom.$('button.run-bar-btn.run-bar-icon-btn.run-bar-pause-btn')) as HTMLButtonElement;
		this._pauseBtn.title = localize('runBar.pause', 'Pause');
		dom.append(this._pauseBtn, dom.$('span.codicon.codicon-debug-pause'));

		// Step Over
		this._stepOverBtn = dom.append(this._debugControlsGroup, dom.$('button.run-bar-btn.run-bar-icon-btn.run-bar-step-btn')) as HTMLButtonElement;
		this._stepOverBtn.title = localize('runBar.stepOver', 'Step Over');
		dom.append(this._stepOverBtn, dom.$('span.codicon.codicon-debug-step-over'));

		// Step Into
		this._stepIntoBtn = dom.append(this._debugControlsGroup, dom.$('button.run-bar-btn.run-bar-icon-btn.run-bar-step-btn')) as HTMLButtonElement;
		this._stepIntoBtn.title = localize('runBar.stepInto', 'Step Into');
		dom.append(this._stepIntoBtn, dom.$('span.codicon.codicon-debug-step-into'));

		// Step Out
		this._stepOutBtn = dom.append(this._debugControlsGroup, dom.$('button.run-bar-btn.run-bar-icon-btn.run-bar-step-btn')) as HTMLButtonElement;
		this._stepOutBtn.title = localize('runBar.stepOut', 'Step Out');
		dom.append(this._stepOutBtn, dom.$('span.codicon.codicon-debug-step-out'));

		// Restart
		this._restartBtn = dom.append(this._debugControlsGroup, dom.$('button.run-bar-btn.run-bar-icon-btn.run-bar-restart-btn')) as HTMLButtonElement;
		this._restartBtn.title = localize('runBar.restart', 'Restart');
		dom.append(this._restartBtn, dom.$('span.codicon.codicon-debug-restart'));

		// Insert into the title bar's right region
		const titlebarEl = this.layoutService.getContainer(mainWindow, Parts.TITLEBAR_PART);
		const titlebarRight = titlebarEl?.querySelector('.titlebar-right');
		if (titlebarRight) {
			titlebarRight.insertBefore(this._domNode, titlebarRight.firstChild);
		} else {
			// Fallback if title bar not available
			this.layoutService.activeContainer.appendChild(this._domNode);
		}

		// Wire up events
		this._register(dom.addDisposableListener(this._buildBtn, dom.EventType.CLICK, () => this.runBuild()));
		this._register(dom.addDisposableListener(this._runBtn, dom.EventType.CLICK, () => this.startRun(true)));
		this._register(dom.addDisposableListener(this._debugBtn, dom.EventType.CLICK, () => this.startRun(false)));
		this._register(dom.addDisposableListener(this._stopBtn, dom.EventType.CLICK, () => this.stopAll()));
		this._register(dom.addDisposableListener(this._continueBtn, dom.EventType.CLICK, () => this.commandService.executeCommand('workbench.action.debug.continue')));
		this._register(dom.addDisposableListener(this._pauseBtn, dom.EventType.CLICK, () => this.commandService.executeCommand('workbench.action.debug.pause')));
		this._register(dom.addDisposableListener(this._stepOverBtn, dom.EventType.CLICK, () => this.commandService.executeCommand('workbench.action.debug.stepOver')));
		this._register(dom.addDisposableListener(this._stepIntoBtn, dom.EventType.CLICK, () => this.commandService.executeCommand('workbench.action.debug.stepInto')));
		this._register(dom.addDisposableListener(this._stepOutBtn, dom.EventType.CLICK, () => this.commandService.executeCommand('workbench.action.debug.stepOut')));
		this._register(dom.addDisposableListener(this._restartBtn, dom.EventType.CLICK, () => this.commandService.executeCommand('workbench.action.debug.restart')));
		this._register(dom.addDisposableListener(this._profileSelect, dom.EventType.CHANGE, () => this.onProfileSelected()));

		const configMgr = this.debugService.getConfigurationManager();
		this._register(configMgr.onDidSelectConfiguration(() => this.update()));
		this._register(configMgr.onDidChangeConfigurationProviders(() => this.update()));
		this._register(this.debugService.onDidChangeState(() => this.updateButtonStates()));
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => this.update()));

		this.update();
	}

	private getSelectedConfig(): { launch: ILaunch; name: string } | undefined {
		const configMgr = this.debugService.getConfigurationManager();
		const allConfigs = configMgr.getAllConfigurations();
		const idx = this._profileSelect.selectedIndex;
		return allConfigs[idx];
	}

	private async runBuild(): Promise<void> {
		await this.commandService.executeCommand('workbench.action.tasks.build');
	}

	private async startRun(noDebug: boolean): Promise<void> {
		const selected = this.getSelectedConfig();
		if (!selected) {
			return;
		}
		await this.debugService.startDebugging(selected.launch, selected.name, { noDebug });
	}

	private async stopAll(): Promise<void> {
		await this.debugService.stopSession(undefined);
	}

	private onProfileSelected(): void {
		const configMgr = this.debugService.getConfigurationManager();
		const allConfigs = configMgr.getAllConfigurations();
		const selected = allConfigs[this._profileSelect.selectedIndex];
		if (selected) {
			configMgr.selectConfiguration(selected.launch, selected.name);
		}
	}

	private update(): void {
		const configMgr = this.debugService.getConfigurationManager();
		const allConfigs = configMgr.getAllConfigurations();

		const hasConfigs = allConfigs.length > 0;
		this._domNode.classList.toggle('hidden', !hasConfigs);

		if (!hasConfigs) {
			return;
		}

		// Rebuild profile dropdown
		dom.clearNode(this._profileSelect);
		const selectedName = configMgr.selectedConfiguration.name;
		let selectedIndex = 0;

		allConfigs.forEach((cfg, idx) => {
			const option = dom.append(this._profileSelect, dom.$('option')) as HTMLOptionElement;
			option.textContent = cfg.name;
			option.value = cfg.name;
			if (cfg.name === selectedName) {
				selectedIndex = idx;
			}
		});

		this._profileSelect.selectedIndex = selectedIndex;

		this.updateButtonStates();
	}

	private updateButtonStates(): void {
		const state = this.debugService.state;
		const isSessionActive = state !== State.Inactive;
		const isInitializing = state === State.Initializing;
		const isStopped = state === State.Stopped;
		const isRunning = state === State.Running;

		// Launch controls
		this._buildBtn.disabled = isInitializing;
		this._runBtn.disabled = isSessionActive;
		this._debugBtn.disabled = isSessionActive;
		this._stopBtn.classList.toggle('hidden', !isSessionActive);
		this._stopBtn.disabled = isInitializing;

		// Debug step controls: visible only when a real session is active (not just initializing)
		const isDebugging = isStopped || isRunning;
		this._debugControlsGroup.classList.toggle('hidden', !isDebugging);

		// Continue/Pause swap based on state
		this._continueBtn.classList.toggle('hidden', !isStopped);
		this._pauseBtn.classList.toggle('hidden', !isRunning);

		// Step controls enabled only when paused
		this._stepOverBtn.disabled = !isStopped;
		this._stepIntoBtn.disabled = !isStopped;
		this._stepOutBtn.disabled = !isStopped;

		// Show spinner on run/debug btn while initializing
		this._domNode.classList.toggle('run-bar-initializing', isInitializing);
	}

	override dispose(): void {
		this._domNode.remove();
		super.dispose();
	}
}

registerWorkbenchContribution2(RunBarContribution.ID, RunBarContribution, WorkbenchPhase.AfterRestored);
