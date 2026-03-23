/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import {
	addPackage,
	getInstalledPackages,
	getPackageVersions,
	getSources,
	removePackage,
	restorePackages,
	saveSources,
	searchPackages,
	type InstalledPackage,
	type NuGetSource
} from './nugetManager';
import { getModalHtml } from './modalContent';

interface ModalMessage {
	type: string;
	[key: string]: unknown;
}

async function pickCsProj(): Promise<vscode.Uri | undefined> {
	const files = await vscode.workspace.findFiles('**/*.csproj', '**/node_modules/**', 10);
	if (files.length === 0) {
		vscode.window.showWarningMessage('No .csproj files found in the workspace.');
		return undefined;
	}
	if (files.length === 1) {
		return files[0];
	}
	const picked = await vscode.window.showQuickPick(
		files.map(f => ({ label: path.basename(f.fsPath), description: vscode.workspace.asRelativePath(f), uri: f })),
		{ placeHolder: 'Select a project' }
	);
	return picked?.uri;
}

async function openNuGetManager(context: vscode.ExtensionContext, projectUri?: vscode.Uri): Promise<void> {
	const uriOrUndef = projectUri ?? await pickCsProj();
	if (!uriOrUndef) {
		return;
	}
	const uri: vscode.Uri = uriOrUndef;

	const projectName = path.basename(uri.fsPath);
	const sources = getSources();

	const panel = vscode.window.createModalPanel({
		title: `NuGet — ${projectName}`,
		width: 760,
		height: 580,
		options: {
			enableScripts: true,
			enableForms: false
		}
	});

	panel.webview.html = getModalHtml(projectName, sources);

	let currentPackages: InstalledPackage[] = [];

	async function refreshInstalled(): Promise<void> {
		currentPackages = await getInstalledPackages(uri.fsPath);
		panel.webview.postMessage({ type: 'installedPackages', packages: currentPackages });
	}

	panel.webview.onDidReceiveMessage(async (raw: unknown) => {
		const msg = raw as ModalMessage;
		try {
			switch (msg.type) {
				case 'getInstalled':
					await refreshInstalled();
					break;

				case 'search': {
					const query = msg['query'] as string;
					const results = await searchPackages(query);
					panel.webview.postMessage({ type: 'searchResults', packages: results });
					break;
				}

				case 'getVersions': {
					const packageId = msg['packageId'] as string;
					const versions = await getPackageVersions(packageId);
					panel.webview.postMessage({ type: 'versions', packageId, versions });
					break;
				}

				case 'addPackage': {
					const packageId = msg['packageId'] as string;
					const version = msg['version'] as string;
					await addPackage(uri.fsPath, packageId, version);
					await refreshInstalled();
					panel.webview.postMessage({ type: 'packageAdded', packageId, packages: currentPackages });
					break;
				}

				case 'removePackage': {
					const packageId = msg['packageId'] as string;
					await removePackage(uri.fsPath, packageId);
					await refreshInstalled();
					panel.webview.postMessage({ type: 'packageRemoved', packageId, packages: currentPackages });
					break;
				}

				case 'restore':
					await restorePackages(uri.fsPath);
					panel.webview.postMessage({ type: 'restored' });
					break;

				case 'saveSources': {
					const newSources = msg['sources'] as NuGetSource[];
					await saveSources(newSources);
					panel.webview.postMessage({ type: 'sourcesUpdated', sources: newSources });
					break;
				}

				case 'openSettings':
					vscode.commands.executeCommand('workbench.action.openSettings', 'csharpNugget');
					break;
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			panel.webview.postMessage({ type: 'error', message });
		}
	});

	context.subscriptions.push(panel);
}

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('csharpNugget.openManager', () =>
			openNuGetManager(context)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('csharpNugget.openManagerForProject', (uri?: vscode.Uri) =>
			openNuGetManager(context, uri)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('csharpNugget.addPackage', async () => {
			const uri = await pickCsProj();
			if (!uri) {
				return;
			}
			const packageId = await vscode.window.showInputBox({
				prompt: 'Enter NuGet package ID',
				placeHolder: 'e.g. Newtonsoft.Json'
			});
			if (!packageId) {
				return;
			}
			const versions = await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Fetching versions for ${packageId}…` },
				() => getPackageVersions(packageId)
			);
			let version: string | undefined;
			if (versions.length > 0) {
				version = await vscode.window.showQuickPick(versions, { placeHolder: 'Select a version' });
			} else {
				version = await vscode.window.showInputBox({ prompt: 'Enter version', placeHolder: 'e.g. 13.0.3' });
			}
			if (!version) {
				return;
			}
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Adding ${packageId}@${version}…` },
				() => addPackage(uri.fsPath, packageId, version as string)
			);
			vscode.window.showInformationMessage(vscode.l10n.t('Added {0} {1} to {2}', packageId, version, path.basename(uri.fsPath)));
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('csharpNugget.restorePackages', async (uri?: vscode.Uri) => {
			const target = uri ?? await pickCsProj();
			if (!target) {
				return;
			}
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: `Restoring packages for ${path.basename(target.fsPath)}…` },
				() => restorePackages(target.fsPath)
			);
			vscode.window.showInformationMessage(vscode.l10n.t('Packages restored for {0}', path.basename(target.fsPath)));
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('csharpNugget.manageSources', () =>
			vscode.commands.executeCommand('workbench.action.openSettings', 'csharpNugget.sources')
		)
	);

	// Auto-restore on activation if configured
	const config = vscode.workspace.getConfiguration('csharpNugget');
	if (config.get<boolean>('autoRestore', true)) {
		vscode.workspace.findFiles('**/*.csproj', '**/node_modules/**', 1).then(files => {
			if (files.length > 0) {
				restorePackages(files[0].fsPath).catch(() => undefined);
			}
		});
	}
}

export function deactivate(): void {
	// nothing to clean up — context.subscriptions handles disposal
}
