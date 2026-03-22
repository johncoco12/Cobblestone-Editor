/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadModalShape, ExtHostContext, ExtHostModalShape, IWebviewContentOptions } from '../common/extHost.protocol.js';
import { ILayoutService } from '../../../platform/layout/browser/layoutService.js';
import { IWebviewService, IWebviewElement, WebviewInitInfo } from '../../contrib/webview/browser/webview.js';
import * as dom from '../../../base/browser/dom.js';
import { serializeWebviewMessage, deserializeWebviewMessage } from '../common/extHostWebviewMessaging.js';
import { reviveWebviewContentOptions } from './mainThreadWebviews.js';

/** Milliseconds for the open/close CSS transition. Must match the CSS value below. */
const ANIMATION_DURATION_MS = 180;

/** Tracks which documents have already had the modal styles injected. */
const _styledDocuments = new WeakSet<Document>();

function ensureModalStyles(targetDocument: Document): void {
	if (_styledDocuments.has(targetDocument)) {
		return;
	}
	_styledDocuments.add(targetDocument);
	const style = dom.append(targetDocument.head, dom.$('style'));
	style.textContent = `
		@keyframes modal-backdrop-in  { from { opacity: 0; } to { opacity: 1; } }
		@keyframes modal-backdrop-out { from { opacity: 1; } to { opacity: 0; } }
		@keyframes modal-dialog-in  { from { opacity: 0; transform: scale(0.94) translateY(-8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
		@keyframes modal-dialog-out { from { opacity: 1; transform: scale(1) translateY(0); } to { opacity: 0; transform: scale(0.94) translateY(-8px); } }

		.modal-panel-backdrop {
			position: absolute;
			inset: 0;
			background: rgba(0, 0, 0, 0.5);
			z-index: 2500;
			display: flex;
			align-items: center;
			justify-content: center;
			animation: modal-backdrop-in ${ANIMATION_DURATION_MS}ms ease forwards;
		}
		.modal-panel-backdrop.closing {
			animation: modal-backdrop-out ${ANIMATION_DURATION_MS}ms ease forwards;
		}
		.modal-panel-dialog {
			position: relative;
			background: var(--vscode-editor-background);
			border: 1px solid var(--vscode-widget-border);
			border-radius: 6px;
			display: flex;
			flex-direction: column;
			overflow: hidden;
			animation: modal-dialog-in ${ANIMATION_DURATION_MS}ms ease forwards;
		}
		.modal-panel-backdrop.closing .modal-panel-dialog {
			animation: modal-dialog-out ${ANIMATION_DURATION_MS}ms ease forwards;
		}
		.modal-panel-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 8px 12px;
			border-bottom: 1px solid var(--vscode-widget-border);
			flex-shrink: 0;
		}
		.modal-panel-title {
			font-weight: 600;
			font-size: 13px;
			color: var(--vscode-foreground);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.modal-panel-close {
			background: none;
			border: none;
			cursor: pointer;
			color: var(--vscode-foreground);
			font-size: 16px;
			padding: 0 4px;
			line-height: 1;
			border-radius: 3px;
			flex-shrink: 0;
		}
		.modal-panel-close:hover {
			background: var(--vscode-toolbar-hoverBackground);
		}
		.modal-panel-webview-host {
			flex: 1;
			position: relative;
			overflow: hidden;
		}
	`;
}

interface IModalPanelEntry {
	backdrop: HTMLElement;
	dialog: HTMLElement;
	titleEl: HTMLElement;
	closeBtn: HTMLElement;
	webviewHost: HTMLElement;
	webviewElement: IWebviewElement;
	disposables: DisposableStore;
}

@extHostNamedCustomer(MainContext.MainThreadModal)
export class MainThreadModal implements MainThreadModalShape {

	private readonly _proxy: ExtHostModalShape;
	private readonly _panels = new Map<number, IModalPanelEntry>();
	private readonly _toDispose = new DisposableStore();

	constructor(
		extHostContext: IExtHostContext,
		@ILayoutService private readonly _layoutService: ILayoutService,
		@IWebviewService private readonly _webviewService: IWebviewService,
	) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostModal);
	}

	$createModalPanel(handle: number, options: { title: string; width: number; height: number }, contentOptions: IWebviewContentOptions): void {
		const container = this._layoutService.activeContainer;
		const targetWindow = dom.getWindow(container);

		ensureModalStyles(targetWindow.document);

		// Backdrop
		const backdrop = dom.append(container, dom.$('.modal-panel-backdrop'));
		backdrop.setAttribute('role', 'dialog');
		backdrop.setAttribute('aria-modal', 'true');
		backdrop.setAttribute('aria-labelledby', `modal-title-${handle}`);

		// Dialog box
		const dialog = dom.append(backdrop, dom.$('.modal-panel-dialog'));
		dialog.style.width = `${options.width}px`;
		dialog.style.height = `${options.height}px`;

		// Header
		const header = dom.append(dialog, dom.$('.modal-panel-header'));
		const titleEl = dom.append(header, dom.$('span.modal-panel-title'));
		titleEl.id = `modal-title-${handle}`;
		titleEl.textContent = options.title;

		const closeBtn = dom.append(header, dom.$('button.modal-panel-close'));
		closeBtn.setAttribute('aria-label', 'Close');
		closeBtn.textContent = '×';

		// Webview host
		const webviewHost = dom.append(dialog, dom.$('.modal-panel-webview-host'));

		// Managed webview element — gives acquireVsCodeApi, CSP, local resource loading
		const initInfo: WebviewInitInfo = {
			title: options.title,
			options: {},
			contentOptions: reviveWebviewContentOptions(contentOptions),
			extension: undefined,
		};
		const webviewElement = this._webviewService.createWebviewElement(initInfo);
		webviewElement.mountTo(webviewHost, targetWindow);

		const disposables = new DisposableStore();

		// Forward webview → extension host messages
		disposables.add(webviewElement.onMessage(e => {
			const serialized = serializeWebviewMessage(e.message, { serializeBuffersForPostMessage: true });
			this._proxy.$onModalMessage(handle, serialized.message, new SerializableObjectWithBuffers(serialized.buffers));
		}));

		// Close on × button
		disposables.add(dom.addDisposableListener(closeBtn, dom.EventType.CLICK, () => {
			this._closeWithAnimation(handle);
		}));

		// Close on backdrop click (outside the dialog)
		disposables.add(dom.addDisposableListener(backdrop, dom.EventType.CLICK, e => {
			if (e.target === backdrop) {
				this._closeWithAnimation(handle);
			}
		}));

		// Close on Escape key — trap focus inside dialog
		disposables.add(dom.addDisposableListener(backdrop, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this._closeWithAnimation(handle);
			} else if (e.key === 'Tab') {
				this._trapFocus(e, [closeBtn]);
			}
		}));

		// Dispose the webview element when the entry is cleaned up
		disposables.add(webviewElement);

		this._panels.set(handle, { backdrop, dialog, titleEl, closeBtn, webviewHost, webviewElement, disposables });

		// Focus the close button on open so keyboard users can immediately interact
		closeBtn.focus();
	}

	$setModalPanelHtml(handle: number, html: string): void {
		this._panels.get(handle)?.webviewElement.setHtml(html);
	}

	$setModalOptions(handle: number, options: IWebviewContentOptions): void {
		const entry = this._panels.get(handle);
		if (entry) {
			entry.webviewElement.contentOptions = reviveWebviewContentOptions(options);
		}
	}

	$setModalTitle(handle: number, title: string): void {
		const entry = this._panels.get(handle);
		if (entry) {
			entry.titleEl.textContent = title;
			entry.webviewElement.setTitle(title);
		}
	}

	async $postMessageToModal(handle: number, jsonMessage: string, ...buffers: VSBuffer[]): Promise<boolean> {
		const entry = this._panels.get(handle);
		if (!entry) {
			return false;
		}
		const { message, arrayBuffers } = deserializeWebviewMessage(jsonMessage, buffers);
		return entry.webviewElement.postMessage(message, arrayBuffers);
	}

	$disposeModalPanel(handle: number): void {
		this._closeWithAnimation(handle);
	}

	/**
	 * Play the close animation, wait for it to finish, then tear down the DOM and notify
	 * the extension host. Handles double-dispose gracefully.
	 */
	private _closeWithAnimation(handle: number): void {
		const entry = this._panels.get(handle);
		if (!entry) {
			return;
		}
		// Remove from map immediately so subsequent calls are no-ops
		this._panels.delete(handle);

		entry.backdrop.classList.add('closing');

		const finish = () => {
			entry.disposables.dispose();
			entry.backdrop.remove();
			this._proxy.$onModalPanelDisposed(handle);
		};

		// Clean up after animation; fall back to a timer in case transitionend never fires
		let done = false;
		const guard = () => {
			if (done) {
				return;
			}
			done = true;
			finish();
		};

		entry.backdrop.addEventListener('animationend', guard, { once: true });
		setTimeout(guard, ANIMATION_DURATION_MS + 50);
	}

	/**
	 * Trap Tab / Shift+Tab focus cycling inside the modal dialog.
	 * Only native elements we explicitly created are tracked; the webview
	 * iframe manages focus for its own content internally.
	 */
	private _trapFocus(e: KeyboardEvent, focusableEls: HTMLElement[]): void {
		if (focusableEls.length === 0) {
			e.preventDefault();
			return;
		}
		const first = focusableEls[0];
		const last = focusableEls[focusableEls.length - 1];
		const active = dom.getActiveElement();

		if (e.shiftKey) {
			if (active === first) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (active === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	dispose(): void {
		for (const handle of [...this._panels.keys()]) {
			const entry = this._panels.get(handle);
			if (entry) {
				this._panels.delete(handle);
				entry.disposables.dispose();
				entry.backdrop.remove();
			}
		}
		this._toDispose.dispose();
	}
}
