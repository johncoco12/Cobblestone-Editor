/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { asWebviewUri, webviewGenericCspSource, WebviewRemoteInfo } from '../../contrib/webview/common/webview.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtHostWorkspace } from './extHostWorkspace.js';
import { ExtHostModalShape, IWebviewContentOptions, MainContext, MainThreadModalShape } from './extHost.protocol.js';
import { deserializeWebviewMessage, serializeWebviewMessage } from './extHostWebviewMessaging.js';
import { serializeWebviewOptions } from './extHostWebview.js';

let handleCounter = 0;

class ModalWebview implements vscode.ModalWebview {

	private _html: string = '';
	private _options: vscode.ModalWebviewOptions;

	readonly #onMessageEmitter = new Emitter<unknown>();
	readonly onDidReceiveMessage = this.#onMessageEmitter.event;

	constructor(
		private readonly _handle: number,
		private readonly _proxy: MainThreadModalShape,
		private readonly _remoteInfo: WebviewRemoteInfo,
		private readonly _extension: IExtensionDescription,
		private readonly _workspace: IExtHostWorkspace | undefined,
		options: vscode.ModalWebviewOptions,
	) {
		this._options = options;
	}

	get html(): string {
		return this._html;
	}

	set html(value: string) {
		this._html = value;
		this._proxy.$setModalPanelHtml(this._handle, value);
	}

	get options(): vscode.ModalWebviewOptions {
		return this._options;
	}

	set options(value: vscode.ModalWebviewOptions) {
		this._options = value;
		this._proxy.$setModalOptions(this._handle, this._serializeOptions(value));
	}

	get cspSource(): string {
		return webviewGenericCspSource;
	}

	asWebviewUri(resource: vscode.Uri): vscode.Uri {
		return asWebviewUri(resource, this._remoteInfo);
	}

	async postMessage(message: unknown): Promise<boolean> {
		const serialized = serializeWebviewMessage(message, { serializeBuffersForPostMessage: true });
		return this._proxy.$postMessageToModal(this._handle, serialized.message, ...serialized.buffers);
	}

	/** Called from {@link ExtHostModal} when the main thread delivers a message from the webview content. */
	receiveMessage(jsonMessage: string, buffers: VSBuffer[]): void {
		const { message } = deserializeWebviewMessage(jsonMessage, buffers);
		this.#onMessageEmitter.fire(message);
	}

	dispose(): void {
		this.#onMessageEmitter.dispose();
	}

	private _serializeOptions(opts: vscode.ModalWebviewOptions): IWebviewContentOptions {
		// ModalWebviewOptions is structurally identical to WebviewOptions — delegate to the shared helper.
		return serializeWebviewOptions(this._extension, this._workspace, opts as vscode.WebviewOptions);
	}
}

class ModalPanel implements vscode.ModalPanel {

	private _title: string;
	private readonly _webview: ModalWebview;
	private readonly _onDidDispose = new Emitter<void>();
	readonly onDidDispose = this._onDidDispose.event;
	private _isDisposed = false;

	constructor(
		private readonly _handle: number,
		private readonly _proxy: MainThreadModalShape,
		title: string,
		remoteInfo: WebviewRemoteInfo,
		extension: IExtensionDescription,
		workspace: IExtHostWorkspace | undefined,
		options: vscode.ModalWebviewOptions,
	) {
		this._title = title;
		this._webview = new ModalWebview(_handle, _proxy, remoteInfo, extension, workspace, options);
	}

	get title(): string {
		return this._title;
	}

	set title(value: string) {
		if (this._isDisposed) {
			return;
		}
		this._title = value;
		this._proxy.$setModalTitle(this._handle, value);
	}

	get webview(): vscode.ModalWebview {
		return this._webview;
	}

	dispose(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._webview.dispose();
		this._proxy.$disposeModalPanel(this._handle);
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}

	/** Called from the main thread when the user closes the panel from the UI. */
	notifyDisposed(): void {
		if (this._isDisposed) {
			return;
		}
		this._isDisposed = true;
		this._webview.dispose();
		this._onDidDispose.fire();
		this._onDidDispose.dispose();
	}

	/** Route an incoming message from the webview content to the {@link ModalWebview}. */
	receiveMessage(jsonMessage: string, buffers: VSBuffer[]): void {
		(this._webview as ModalWebview).receiveMessage(jsonMessage, buffers);
	}
}

export class ExtHostModal implements ExtHostModalShape {

	private readonly _proxy: MainThreadModalShape;
	private readonly _panels = new Map<number, ModalPanel>();
	private readonly _toDispose = new DisposableStore();

	constructor(
		rpcProtocol: IExtHostRpcService,
		private readonly _remoteInfo: WebviewRemoteInfo,
		private readonly _workspace: IExtHostWorkspace | undefined,
	) {
		this._proxy = rpcProtocol.getProxy(MainContext.MainThreadModal);
	}

	createModalPanel(extension: IExtensionDescription, options: vscode.ModalPanelOptions): vscode.ModalPanel {
		const handle = handleCounter++;
		const width = options.width ?? 600;
		const height = options.height ?? 400;
		const contentOptions = options.options ?? {};

		const serializedOptions = serializeWebviewOptions(extension, this._workspace, contentOptions as vscode.WebviewOptions);
		this._proxy.$createModalPanel(handle, { title: options.title, width, height }, serializedOptions);

		const panel = new ModalPanel(handle, this._proxy, options.title, this._remoteInfo, extension, this._workspace, contentOptions);
		this._panels.set(handle, panel);

		const sub = panel.onDidDispose(() => {
			this._panels.delete(handle);
			sub.dispose();
		});

		return panel;
	}

	$onModalPanelDisposed(handle: number): void {
		const panel = this._panels.get(handle);
		if (panel) {
			panel.notifyDisposed();
			this._panels.delete(handle);
		}
	}

	$onModalMessage(handle: number, message: string, buffers: SerializableObjectWithBuffers<VSBuffer[]>): void {
		const panel = this._panels.get(handle);
		if (panel) {
			panel.receiveMessage(message, buffers.value);
		}
	}

	dispose(): void {
		this._toDispose.dispose();
	}
}
