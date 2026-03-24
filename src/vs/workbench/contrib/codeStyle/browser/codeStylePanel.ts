/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/codeStyleModal.css';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import * as dom from '../../../../base/browser/dom.js';
import { FastDomNode, createFastDomNode } from '../../../../base/browser/fastDomNode.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ICodeStyleService } from '../common/codeStyle.js';
import {
	ICodeStyleProfile, INamingRule, ISyntaxOverride,
	IdentifierKind, NamingStyle, CodeStyleSeverity, LineEnding, IndentStyle,
	QuoteStyle, SemicolonStyle, TrailingCommaStyle, BraceStyle,
	generateNamingRuleId,
} from '../common/codeStyleTypes.js';

type PanelTab = 'format' | 'syntax' | 'naming' | 'presets' | 'profiles';

const NAMING_KINDS: IdentifierKind[] = [
	'variable', 'function', 'class', 'interface', 'enum', 'enumMember',
	'type', 'constant', 'parameter', 'property',
];

const NAMING_STYLES: NamingStyle[] = [
	'camelCase', 'PascalCase', 'snake_case', 'SCREAMING_SNAKE_CASE', 'kebab-case', 'any',
];

const SEVERITIES: CodeStyleSeverity[] = ['error', 'warning', 'information', 'hint'];

export class CodeStylePanel extends Disposable {

	private static readonly WIDTH = 760;
	private static readonly HEIGHT = 580;

	private static _instance: CodeStylePanel | undefined;

	static createOrShow(instantiationService: IInstantiationService, layoutService: ILayoutService): void {
		if (CodeStylePanel._instance) {
			CodeStylePanel._instance.show();
			return;
		}
		CodeStylePanel._instance = instantiationService.createInstance(CodeStylePanel, layoutService.activeContainer);
		CodeStylePanel._instance.show();
	}

	private readonly _backdropNode: HTMLElement;
	private readonly _domNode: FastDomNode<HTMLElement>;
	private readonly _contentArea: HTMLElement;
	private readonly _tabPanels = new Map<PanelTab, HTMLElement>();
	private readonly _tabButtons = new Map<PanelTab, HTMLElement>();

	/** Disposables for listeners on dynamically-rebuilt card lists. */
	private readonly _dynamicDisposables = this._register(new DisposableStore());

	// ---- Refresh targets for dynamic content ----
	private _namingRulesContainer!: HTMLElement;
	private _presetsContainer!: HTMLElement;
	private _profilesContainer!: HTMLElement;

	// ---- Format tab controls ----
	private _enforceOnSaveChk!: HTMLInputElement;
	private _insertFinalNewlineChk!: HTMLInputElement;
	private _trimWsChk!: HTMLInputElement;
	private _maxLineLengthInput!: HTMLInputElement;
	private _severitySelect!: HTMLSelectElement;
	private _lineEndingSelect!: HTMLSelectElement;
	private _indentStyleSelect!: HTMLSelectElement;
	private _indentSizeInput!: HTMLInputElement;

	// ---- Syntax tab controls ----
	private _quotesSelect!: HTMLSelectElement;
	private _semicolonsSelect!: HTMLSelectElement;
	private _trailingCommasSelect!: HTMLSelectElement;
	private _braceStyleSelect!: HTMLSelectElement;
	private _syntaxOverridesContainer!: HTMLElement;

	// ---- Open "add" form elements (must be tracked to close on refresh) ----
	private _addNamingFormEl: HTMLElement | undefined;
	private _addOverrideFormEl: HTMLElement | undefined;

	// ---- Scope control ----
	private _scopeSelect!: HTMLSelectElement;

	constructor(
		private readonly _parent: HTMLElement,
		@ICodeStyleService private readonly _styleService: ICodeStyleService,
		@ICommandService private readonly _commandService: ICommandService,
	) {
		super();

		// ---- Backdrop ----
		this._backdropNode = dom.$('.code-style-modal-backdrop');
		this._backdropNode.style.display = 'none';
		this._register(dom.addDisposableListener(this._backdropNode, dom.EventType.CLICK, () => this.hide()));

		// ---- Widget ----
		this._domNode = createFastDomNode(dom.$('.code-style-modal-widget'));
		this._domNode.setDisplay('none');
		this._domNode.setPosition('absolute');
		this._domNode.setWidth(CodeStylePanel.WIDTH);
		this._domNode.setHeight(CodeStylePanel.HEIGHT);

		// ---- Header ----
		const header = dom.append(this._domNode.domNode, dom.$('.code-style-modal-header'));
		const title = dom.append(header, dom.$('span.code-style-modal-title'));
		title.textContent = nls.localize('codeStyle.panelTitle', 'Code Style Manager');
		const closeBtn = dom.append(header, dom.$('button.code-style-modal-close')) as HTMLButtonElement;
		closeBtn.setAttribute('aria-label', nls.localize('codeStyle.close', 'Close'));
		closeBtn.textContent = '×';
		this._register(dom.addDisposableListener(closeBtn, dom.EventType.CLICK, () => this.hide()));

		// ---- Scope toolbar ----
		const toolbar = dom.append(this._domNode.domNode, dom.$('.code-style-scope-toolbar'));
		const scopeLabel = dom.append(toolbar, dom.$('span'));
		scopeLabel.textContent = nls.localize('codeStyle.scope.label', 'Scope:');
		this._scopeSelect = dom.append(toolbar, dom.$('select')) as HTMLSelectElement;
		this._addOption(this._scopeSelect, 'workspace', nls.localize('codeStyle.scope.workspace', 'Workspace'));
		this._addOption(this._scopeSelect, 'global', nls.localize('codeStyle.scope.global', 'Global (User)'));
		this._register(dom.addDisposableListener(this._scopeSelect, dom.EventType.CHANGE, () => {
			this._styleService.setScope(this._scopeSelect.value as 'workspace' | 'global').catch(() => { /* ignore */ });
		}));

		// ---- Tabs strip ----
		const tabsBar = dom.append(this._domNode.domNode, dom.$('.code-style-modal-tabs'));
		this._buildTabsBar(tabsBar);

		// ---- Content ----
		this._contentArea = dom.append(this._domNode.domNode, dom.$('.code-style-modal-content'));
		this._buildFormatTab();
		this._buildSyntaxTab();
		this._buildNamingTab();
		this._buildPresetsTab();
		this._buildProfilesTab();
		this._activateTab('format');

		// ---- Mount ----
		dom.append(_parent, this._backdropNode);
		dom.append(_parent, this._domNode.domNode);

		// ---- React to external config changes ----
		this._register(this._styleService.onDidChangeProfile(profile => {
			this._updateFormFromProfile(profile);
			this._refreshDynamicPanels();
		}));
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------

	show(): void {
		this._backdropNode.style.display = '';
		this._domNode.setDisplay('flex');
		this._layout();
		this._updateFormFromProfile(this._styleService.getActiveProfile());
		this._refreshDynamicPanels();
		this._scopeSelect.value = this._styleService.getScope();
	}

	hide(): void {
		this._backdropNode.style.display = 'none';
		this._domNode.setDisplay('none');
	}

	override dispose(): void {
		CodeStylePanel._instance = undefined;
		super.dispose();
	}

	// ---------------------------------------------------------------------------
	// Layout
	// ---------------------------------------------------------------------------

	private _layout(): void {
		const rect = this._parent.getBoundingClientRect();
		const left = Math.max(0, (rect.width - CodeStylePanel.WIDTH) / 2);
		const top = Math.max(0, (rect.height - CodeStylePanel.HEIGHT) / 2);
		this._domNode.setLeft(left);
		this._domNode.setTop(top);
	}

	// ---------------------------------------------------------------------------
	// Tab strip
	// ---------------------------------------------------------------------------

	private _buildTabsBar(container: HTMLElement): void {
		const tabs: { id: PanelTab; label: string }[] = [
			{ id: 'format',   label: nls.localize('codeStyle.tab.format',   'Format') },
			{ id: 'syntax',   label: nls.localize('codeStyle.tab.syntax',   'Syntax') },
			{ id: 'naming',   label: nls.localize('codeStyle.tab.naming',   'Naming Rules') },
			{ id: 'presets',  label: nls.localize('codeStyle.tab.presets',  'Presets') },
			{ id: 'profiles', label: nls.localize('codeStyle.tab.profiles', 'Profiles') },
		];
		for (const { id, label } of tabs) {
			const btn = dom.append(container, dom.$('button.code-style-tab-btn')) as HTMLButtonElement;
			btn.textContent = label;
			this._tabButtons.set(id, btn);
			this._register(dom.addDisposableListener(btn, dom.EventType.CLICK, () => this._activateTab(id)));
		}
	}

	private _activateTab(id: PanelTab): void {
		for (const [tab, btn] of this._tabButtons) {
			btn.classList.toggle('active', tab === id);
		}
		for (const [tab, panel] of this._tabPanels) {
			panel.style.display = tab === id ? '' : 'none';
		}
	}

	// ---------------------------------------------------------------------------
	// DOM helpers
	// ---------------------------------------------------------------------------

	private _addPanel(id: PanelTab): HTMLElement {
		const panel = dom.append(this._contentArea, dom.$('.code-style-tab-panel'));
		panel.style.display = 'none';
		this._tabPanels.set(id, panel);
		return panel;
	}

	private _sectionTitle(container: HTMLElement, text: string): void {
		const p = dom.append(container, dom.$('p.code-style-section-title'));
		p.textContent = text;
	}

	private _formGrid(container: HTMLElement): HTMLElement {
		return dom.append(container, dom.$('.code-style-form-grid'));
	}

	private _addFormRow(grid: HTMLElement, labelText: string, control: HTMLElement, desc?: string): void {
		const lbl = dom.append(grid, dom.$('label'));
		lbl.textContent = labelText;
		const ctrl = dom.append(grid, dom.$('.code-style-form-ctrl'));
		dom.append(ctrl, control);
		if (desc) {
			const d = dom.append(ctrl, dom.$('.code-style-form-desc'));
			d.textContent = desc;
		}
	}

	private _makeSelect(options: { value: string; label: string }[]): HTMLSelectElement {
		const sel = dom.$('select') as HTMLSelectElement;
		for (const { value, label } of options) {
			this._addOption(sel, value, label);
		}
		return sel;
	}

	private _addOption(sel: HTMLSelectElement, value: string, label: string): void {
		const opt = dom.$('option') as HTMLOptionElement;
		opt.value = value;
		opt.textContent = label;
		dom.append(sel, opt);
	}

	private _makeCheckbox(): HTMLInputElement {
		const chk = dom.$('input') as HTMLInputElement;
		chk.type = 'checkbox';
		return chk;
	}

	private _makeNumberInput(min: number, max: number): HTMLInputElement {
		const inp = dom.$('input') as HTMLInputElement;
		inp.type = 'number';
		inp.min = String(min);
		inp.max = String(max);
		return inp;
	}

	private _makeTextInput(placeholder?: string): HTMLInputElement {
		const inp = dom.$('input') as HTMLInputElement;
		inp.type = 'text';
		if (placeholder) {
			inp.placeholder = placeholder;
		}
		return inp;
	}

	private _makeButton(label: string, cssClass: string): HTMLButtonElement {
		const btn = dom.$('button') as HTMLButtonElement;
		btn.textContent = label;
		btn.className = cssClass;
		return btn;
	}

	/**
	 * Creates a danger button requiring double-click to confirm.
	 * First click shows "Confirm?" — second click within 3 s fires `onConfirm`.
	 */
	private _makeDeleteButton(label: string, onConfirm: () => void, store: DisposableStore): HTMLButtonElement {
		const btn = this._makeButton(label, 'code-style-btn code-style-btn-danger');
		let timer: ReturnType<typeof setTimeout> | undefined;
		store.add(toDisposable(() => {
			if (timer !== undefined) {
				clearTimeout(timer);
				timer = undefined;
			}
		}));
		store.add(dom.addDisposableListener(btn, dom.EventType.CLICK, () => {
			if (timer !== undefined) {
				clearTimeout(timer);
				timer = undefined;
				btn.textContent = label;
				onConfirm();
			} else {
				btn.textContent = nls.localize('codeStyle.confirmDelete', 'Confirm?');
				timer = setTimeout(() => {
					timer = undefined;
					btn.textContent = label;
				}, 3000);
			}
		}));
		return btn;
	}

	// ---------------------------------------------------------------------------
	// Format tab
	// ---------------------------------------------------------------------------

	private _buildFormatTab(): void {
		const panel = this._addPanel('format');

		this._sectionTitle(panel, nls.localize('codeStyle.section.whitespace', 'Whitespace & Newlines'));
		const grid1 = this._formGrid(panel);

		this._enforceOnSaveChk = this._makeCheckbox();
		this._addFormRow(grid1, nls.localize('codeStyle.enforceOnSave.label', 'Enforce on Save'), this._enforceOnSaveChk);
		this._register(dom.addDisposableListener(this._enforceOnSaveChk, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ enforceOnSave: this._enforceOnSaveChk.checked }).catch(() => { /* ignore */ });
		}));

		this._insertFinalNewlineChk = this._makeCheckbox();
		this._addFormRow(grid1, nls.localize('codeStyle.insertFinalNewline.label', 'Insert Final Newline'), this._insertFinalNewlineChk);
		this._register(dom.addDisposableListener(this._insertFinalNewlineChk, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ insertFinalNewline: this._insertFinalNewlineChk.checked }).catch(() => { /* ignore */ });
		}));

		this._trimWsChk = this._makeCheckbox();
		this._addFormRow(grid1, nls.localize('codeStyle.trimTrailing.label', 'Trim Trailing Whitespace'), this._trimWsChk);
		this._register(dom.addDisposableListener(this._trimWsChk, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ trimTrailingWhitespace: this._trimWsChk.checked }).catch(() => { /* ignore */ });
		}));

		this._maxLineLengthInput = this._makeNumberInput(0, 1000);
		this._addFormRow(grid1,
			nls.localize('codeStyle.maxLineLength.label', 'Max Line Length'),
			this._maxLineLengthInput,
			nls.localize('codeStyle.maxLineLength.desc', 'Characters. Set to 0 to disable.'));
		this._register(dom.addDisposableListener(this._maxLineLengthInput, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ maxLineLength: parseInt(this._maxLineLengthInput.value, 10) || 0 }).catch(() => { /* ignore */ });
		}));

		this._severitySelect = this._makeSelect([
			{ value: 'error',       label: nls.localize('codeStyle.severity.error',       'Error') },
			{ value: 'warning',     label: nls.localize('codeStyle.severity.warning',     'Warning') },
			{ value: 'information', label: nls.localize('codeStyle.severity.information', 'Information') },
			{ value: 'hint',        label: nls.localize('codeStyle.severity.hint',        'Hint') },
		]);
		this._addFormRow(grid1, nls.localize('codeStyle.severity.label', 'Default Severity'), this._severitySelect);
		this._register(dom.addDisposableListener(this._severitySelect, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ defaultSeverity: this._severitySelect.value as CodeStyleSeverity }).catch(() => { /* ignore */ });
		}));

		this._sectionTitle(panel, nls.localize('codeStyle.section.lineEnding', 'Line Endings'));
		const grid2 = this._formGrid(panel);

		this._lineEndingSelect = this._makeSelect([
			{ value: 'auto', label: nls.localize('codeStyle.lineEnding.auto', 'Auto (detect from file)') },
			{ value: 'lf',   label: nls.localize('codeStyle.lineEnding.lf',   'LF \u2014 Unix / macOS (\\n)') },
			{ value: 'crlf', label: nls.localize('codeStyle.lineEnding.crlf', 'CRLF \u2014 Windows (\\r\\n)') },
			{ value: 'cr',   label: nls.localize('codeStyle.lineEnding.cr',   'CR \u2014 Classic Mac (\\r)') },
		]);
		this._addFormRow(grid2, nls.localize('codeStyle.lineEnding.label', 'Required Ending'), this._lineEndingSelect);
		this._register(dom.addDisposableListener(this._lineEndingSelect, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ lineEnding: this._lineEndingSelect.value as LineEnding }).catch(() => { /* ignore */ });
		}));

		this._sectionTitle(panel, nls.localize('codeStyle.section.indentation', 'Indentation'));
		const grid3 = this._formGrid(panel);

		this._indentStyleSelect = this._makeSelect([
			{ value: 'tabs',   label: nls.localize('codeStyle.indentStyle.tabs',   'Tabs') },
			{ value: 'spaces', label: nls.localize('codeStyle.indentStyle.spaces', 'Spaces') },
		]);
		this._addFormRow(grid3, nls.localize('codeStyle.indentStyle.label', 'Style'), this._indentStyleSelect);
		this._register(dom.addDisposableListener(this._indentStyleSelect, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({
				indent: { style: this._indentStyleSelect.value as IndentStyle, size: parseInt(this._indentSizeInput.value, 10) || 4 },
			}).catch(() => { /* ignore */ });
		}));

		this._indentSizeInput = this._makeNumberInput(1, 16);
		this._addFormRow(grid3,
			nls.localize('codeStyle.indentSize.label', 'Size'),
			this._indentSizeInput,
			nls.localize('codeStyle.indentSize.desc', 'Spaces per indent level (used when style is Spaces).'));
		this._register(dom.addDisposableListener(this._indentSizeInput, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({
				indent: { style: this._indentStyleSelect.value as IndentStyle, size: parseInt(this._indentSizeInput.value, 10) || 4 },
			}).catch(() => { /* ignore */ });
		}));
	}

	// ---------------------------------------------------------------------------
	// Syntax tab
	// ---------------------------------------------------------------------------

	private _buildSyntaxTab(): void {
		const panel = this._addPanel('syntax');
		this._sectionTitle(panel, nls.localize('codeStyle.section.syntax', 'Syntax Defaults'));
		const grid = this._formGrid(panel);

		this._quotesSelect = this._makeSelect([
			{ value: 'any',      label: nls.localize('codeStyle.quotes.any',      'Any (no preference)') },
			{ value: 'single',   label: nls.localize('codeStyle.quotes.single',   "Single ('')") },
			{ value: 'double',   label: nls.localize('codeStyle.quotes.double',   'Double ("")') },
			{ value: 'backtick', label: nls.localize('codeStyle.quotes.backtick', 'Backtick (template literal)') },
		]);
		this._addFormRow(grid, nls.localize('codeStyle.quotes.label', 'Quotes'), this._quotesSelect);
		this._register(dom.addDisposableListener(this._quotesSelect, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ quotes: { '*': this._quotesSelect.value as QuoteStyle } }).catch(() => { /* ignore */ });
		}));

		this._semicolonsSelect = this._makeSelect([
			{ value: 'any',    label: nls.localize('codeStyle.semicolons.any',    'Any (no preference)') },
			{ value: 'always', label: nls.localize('codeStyle.semicolons.always', 'Always') },
			{ value: 'never',  label: nls.localize('codeStyle.semicolons.never',  'Never') },
		]);
		this._addFormRow(grid, nls.localize('codeStyle.semicolons.label', 'Semicolons'), this._semicolonsSelect);
		this._register(dom.addDisposableListener(this._semicolonsSelect, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ semicolons: { '*': this._semicolonsSelect.value as SemicolonStyle } }).catch(() => { /* ignore */ });
		}));

		this._trailingCommasSelect = this._makeSelect([
			{ value: 'any',    label: nls.localize('codeStyle.trailingCommas.any',    'Any (no preference)') },
			{ value: 'always', label: nls.localize('codeStyle.trailingCommas.always', 'Always') },
			{ value: 'never',  label: nls.localize('codeStyle.trailingCommas.never',  'Never') },
			{ value: 'es5',    label: nls.localize('codeStyle.trailingCommas.es5',    'ES5') },
		]);
		this._addFormRow(grid, nls.localize('codeStyle.trailingCommas.label', 'Trailing Commas'), this._trailingCommasSelect);
		this._register(dom.addDisposableListener(this._trailingCommasSelect, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ trailingCommas: { '*': this._trailingCommasSelect.value as TrailingCommaStyle } }).catch(() => { /* ignore */ });
		}));

		this._braceStyleSelect = this._makeSelect([
			{ value: 'any',       label: nls.localize('codeStyle.braceStyle.any',      'Any (no preference)') },
			{ value: 'same-line', label: nls.localize('codeStyle.braceStyle.sameLine', 'Same Line (K&R)') },
			{ value: 'next-line', label: nls.localize('codeStyle.braceStyle.nextLine', 'Next Line (Allman)') },
		]);
		this._addFormRow(grid, nls.localize('codeStyle.braceStyle.label', 'Brace Style'), this._braceStyleSelect);
		this._register(dom.addDisposableListener(this._braceStyleSelect, dom.EventType.CHANGE, () => {
			this._styleService.updateProfile({ braceStyle: { '*': this._braceStyleSelect.value as BraceStyle } }).catch(() => { /* ignore */ });
		}));

		// ---- Per-language overrides ----
		this._sectionTitle(panel, nls.localize('codeStyle.section.syntaxOverrides', 'Language-Specific Overrides'));

		const addOverrideRow = dom.append(panel, dom.$('.code-style-add-row'));
		const addOverrideBtn = this._makeButton(
			nls.localize('codeStyle.syntax.addOverride', 'Add Language Override'),
			'code-style-btn code-style-btn-primary',
		);
		dom.append(addOverrideRow, addOverrideBtn);

		this._register(dom.addDisposableListener(addOverrideBtn, dom.EventType.CLICK, () => {
			if (this._addOverrideFormEl) {
				this._addOverrideFormEl.remove();
				this._addOverrideFormEl = undefined;
				return;
			}
			this._addOverrideFormEl = this._buildSyntaxOverrideForm(panel, undefined, () => {
				this._addOverrideFormEl?.remove();
				this._addOverrideFormEl = undefined;
			});
		}));

		this._syntaxOverridesContainer = dom.append(panel, dom.$('.code-style-card-list'));
	}

	private _buildSyntaxOverrideForm(
		container: HTMLElement,
		existing: ISyntaxOverride | undefined,
		onClose: () => void,
	): HTMLElement {
		const formStore = new DisposableStore();
		const closeAndDispose = () => { formStore.dispose(); onClose(); };
		const form = dom.append(container, dom.$('.code-style-inline-form'));
		const grid = this._formGrid(form);

		const langInput = this._makeTextInput(nls.localize('codeStyle.syntax.lang.placeholder', 'Language ID (e.g. typescript)'));
		const quotesSel = this._makeSelect([
			{ value: 'any',      label: nls.localize('codeStyle.syntaxOverride.quotes.any',      'Any') },
			{ value: 'single',   label: nls.localize('codeStyle.syntaxOverride.quotes.single',   'Single') },
			{ value: 'double',   label: nls.localize('codeStyle.syntaxOverride.quotes.double',   'Double') },
			{ value: 'backtick', label: nls.localize('codeStyle.syntaxOverride.quotes.backtick', 'Backtick') },
		]);
		const semiSel = this._makeSelect([
			{ value: 'any',    label: nls.localize('codeStyle.syntaxOverride.semicolons.any',    'Any') },
			{ value: 'always', label: nls.localize('codeStyle.syntaxOverride.semicolons.always', 'Always') },
			{ value: 'never',  label: nls.localize('codeStyle.syntaxOverride.semicolons.never',  'Never') },
		]);
		const trailSel = this._makeSelect([
			{ value: 'any',    label: nls.localize('codeStyle.syntaxOverride.trailingCommas.any',    'Any') },
			{ value: 'always', label: nls.localize('codeStyle.syntaxOverride.trailingCommas.always', 'Always') },
			{ value: 'never',  label: nls.localize('codeStyle.syntaxOverride.trailingCommas.never',  'Never') },
			{ value: 'es5',    label: nls.localize('codeStyle.syntaxOverride.trailingCommas.es5',    'ES5') },
		]);
		const braceSel = this._makeSelect([
			{ value: 'any',       label: nls.localize('codeStyle.syntaxOverride.braceStyle.any',      'Any') },
			{ value: 'same-line', label: nls.localize('codeStyle.syntaxOverride.braceStyle.sameLine', 'Same Line') },
			{ value: 'next-line', label: nls.localize('codeStyle.syntaxOverride.braceStyle.nextLine', 'Next Line') },
		]);

		if (existing) {
			langInput.value  = existing.language;
			quotesSel.value  = existing.quotes  ?? 'any';
			semiSel.value    = existing.semicolons ?? 'any';
			trailSel.value   = existing.trailingCommas ?? 'any';
			braceSel.value   = existing.braceStyle ?? 'any';
		}

		this._addFormRow(grid, nls.localize('codeStyle.syntax.language', 'Language'),        langInput);
		this._addFormRow(grid, nls.localize('codeStyle.quotes.label',    'Quotes'),          quotesSel);
		this._addFormRow(grid, nls.localize('codeStyle.semicolons.label','Semicolons'),      semiSel);
		this._addFormRow(grid, nls.localize('codeStyle.trailingCommas.label', 'Trailing Commas'), trailSel);
		this._addFormRow(grid, nls.localize('codeStyle.braceStyle.label','Brace Style'),     braceSel);

		const actions   = dom.append(form, dom.$('.code-style-form-actions'));
		const saveBtn   = this._makeButton(nls.localize('codeStyle.naming.save',   'Save'),   'code-style-btn code-style-btn-primary');
		const cancelBtn = this._makeButton(nls.localize('codeStyle.naming.cancel', 'Cancel'), 'code-style-btn code-style-btn-secondary');
		dom.append(actions, saveBtn);
		dom.append(actions, cancelBtn);

		formStore.add(dom.addDisposableListener(saveBtn, dom.EventType.CLICK, async () => {
			const lang = langInput.value.trim();
			if (!lang) { return; }
			const profile = this._styleService.getActiveProfile();

			const newQuotes        = { ...profile.quotes,        [lang]: quotesSel.value as QuoteStyle };
			const newSemicolons    = { ...profile.semicolons,    [lang]: semiSel.value as SemicolonStyle };
			const newTrailingCommas = { ...profile.trailingCommas, [lang]: trailSel.value as TrailingCommaStyle };
			const newBraceStyle    = { ...profile.braceStyle,    [lang]: braceSel.value as BraceStyle };

			if (existing && existing.language !== lang) {
				// Language ID was renamed — remove the old entry first.
				delete newQuotes[existing.language];
				delete newSemicolons[existing.language];
				delete newTrailingCommas[existing.language];
				delete newBraceStyle[existing.language];
			}

			await this._styleService.updateProfile({
				quotes: newQuotes,
				semicolons: newSemicolons,
				trailingCommas: newTrailingCommas,
				braceStyle: newBraceStyle,
			});
			closeAndDispose();
		}));

		formStore.add(dom.addDisposableListener(cancelBtn, dom.EventType.CLICK, () => closeAndDispose()));

		return form;
	}

	// ---------------------------------------------------------------------------
	// Naming Rules tab
	// ---------------------------------------------------------------------------

	private _buildNamingTab(): void {
		const panel = this._addPanel('naming');
		this._sectionTitle(panel, nls.localize('codeStyle.section.naming', 'Naming Rules'));

		const addRow = dom.append(panel, dom.$('.code-style-add-row'));
		const addBtn = this._makeButton(nls.localize('codeStyle.naming.add', 'Add Rule'), 'code-style-btn code-style-btn-primary');
		dom.append(addRow, addBtn);

		this._register(dom.addDisposableListener(addBtn, dom.EventType.CLICK, () => {
			if (this._addNamingFormEl) {
				this._addNamingFormEl.remove();
				this._addNamingFormEl = undefined;
				return;
			}
			this._addNamingFormEl = this._buildNamingRuleForm(panel, undefined, () => {
				this._addNamingFormEl?.remove();
				this._addNamingFormEl = undefined;
			});
		}));

		this._namingRulesContainer = dom.append(panel, dom.$('.code-style-card-list'));
	}

	private _buildNamingRuleForm(
		container: HTMLElement,
		existing: INamingRule | undefined,
		onClose: () => void,
	): HTMLElement {
		const formStore = new DisposableStore();
		const closeAndDispose = () => { formStore.dispose(); onClose(); };
		const form = dom.append(container, dom.$('.code-style-inline-form'));

		const kindSel   = this._makeSelect(NAMING_KINDS.map(k => ({ value: k, label: k })));
		const styleSel  = this._makeSelect(NAMING_STYLES.map(s => ({ value: s, label: s })));
		const langInput = this._makeTextInput(nls.localize('codeStyle.naming.lang.placeholder', 'e.g. typescript, javascript'));
		const prefixInp = this._makeTextInput(nls.localize('codeStyle.naming.prefix.placeholder', 'e.g. I'));
		const suffixInp = this._makeTextInput();
		const sevSel    = this._makeSelect(SEVERITIES.map(s => ({ value: s, label: s })));
		const enabledChk = this._makeCheckbox();
		enabledChk.checked = true;

		if (existing) {
			kindSel.value     = existing.kind;
			styleSel.value    = existing.style;
			langInput.value   = existing.languages.join(', ');
			prefixInp.value   = existing.prefix;
			suffixInp.value   = existing.suffix;
			sevSel.value      = existing.severity;
			enabledChk.checked = existing.enabled;
		}

		const grid = this._formGrid(form);
		this._addFormRow(grid, nls.localize('codeStyle.naming.kind',       'Kind'),      kindSel);
		this._addFormRow(grid, nls.localize('codeStyle.naming.style',      'Style'),     styleSel);
		this._addFormRow(grid, nls.localize('codeStyle.naming.languages',  'Languages'), langInput,
			nls.localize('codeStyle.naming.lang.desc', 'Comma-separated language IDs. Leave empty to apply to all.'));
		this._addFormRow(grid, nls.localize('codeStyle.naming.prefix',     'Prefix'),    prefixInp);
		this._addFormRow(grid, nls.localize('codeStyle.naming.suffix',     'Suffix'),    suffixInp);
		this._addFormRow(grid, nls.localize('codeStyle.naming.severity',   'Severity'),  sevSel);
		this._addFormRow(grid, nls.localize('codeStyle.naming.enabled',    'Enabled'),   enabledChk);

		const actions   = dom.append(form, dom.$('.code-style-form-actions'));
		const saveBtn   = this._makeButton(nls.localize('codeStyle.naming.save',   'Save'),   'code-style-btn code-style-btn-primary');
		const cancelBtn = this._makeButton(nls.localize('codeStyle.naming.cancel', 'Cancel'), 'code-style-btn code-style-btn-secondary');
		dom.append(actions, saveBtn);
		dom.append(actions, cancelBtn);

		formStore.add(dom.addDisposableListener(saveBtn, dom.EventType.CLICK, async () => {
			const langs   = langInput.value.split(',').map(s => s.trim()).filter(Boolean);
			const profile = this._styleService.getActiveProfile();
			let rules: INamingRule[];
			if (existing) {
				rules = profile.namingRules.map(r => r.id === existing.id ? {
					...r,
					kind:      kindSel.value as IdentifierKind,
					style:     styleSel.value as NamingStyle,
					languages: langs,
					prefix:    prefixInp.value.trim(),
					suffix:    suffixInp.value.trim(),
					severity:  sevSel.value as CodeStyleSeverity,
					enabled:   enabledChk.checked,
				} : r);
			} else {
				const newRule: INamingRule = {
					id:        generateNamingRuleId(),
					kind:      kindSel.value as IdentifierKind,
					style:     styleSel.value as NamingStyle,
					languages: langs,
					prefix:    prefixInp.value.trim(),
					suffix:    suffixInp.value.trim(),
					severity:  sevSel.value as CodeStyleSeverity,
					enabled:   enabledChk.checked,
				};
				rules = [...profile.namingRules, newRule];
			}
			await this._styleService.updateProfile({ namingRules: rules });
			closeAndDispose();
		}));

		formStore.add(dom.addDisposableListener(cancelBtn, dom.EventType.CLICK, () => closeAndDispose()));

		return form;
	}

	// ---------------------------------------------------------------------------
	// Presets tab
	// ---------------------------------------------------------------------------

	private _buildPresetsTab(): void {
		const panel = this._addPanel('presets');
		this._sectionTitle(panel, nls.localize('codeStyle.section.presets', 'Built-In Presets'));
		this._presetsContainer = dom.append(panel, dom.$('.code-style-card-list'));
	}

	// ---------------------------------------------------------------------------
	// Profiles tab
	// ---------------------------------------------------------------------------

	private _buildProfilesTab(): void {
		const panel = this._addPanel('profiles');
		this._sectionTitle(panel, nls.localize('codeStyle.section.profiles', 'Saved Profiles'));

		const saveAsRow = dom.append(panel, dom.$('.code-style-save-as-row'));
		const saveAsInput = this._makeTextInput(nls.localize('codeStyle.profiles.saveAs.placeholder', 'Profile name\u2026'));
		const saveAsBtn   = this._makeButton(nls.localize('codeStyle.profiles.save', 'Save Current'), 'code-style-btn code-style-btn-primary');
		dom.append(saveAsRow, saveAsInput);
		dom.append(saveAsRow, saveAsBtn);
		this._register(dom.addDisposableListener(saveAsBtn, dom.EventType.CLICK, async () => {
			const name = saveAsInput.value.trim();
			if (name) {
				await this._styleService.saveAsProfile(name);
				saveAsInput.value = '';
			}
		}));

		const exportRow = dom.append(panel, dom.$('.code-style-add-row'));
		exportRow.style.marginTop = '6px';
		const exportBtn = this._makeButton(nls.localize('codeStyle.profiles.export', 'Copy JSON to Clipboard'), 'code-style-btn code-style-btn-secondary');
		dom.append(exportRow, exportBtn);
		this._register(dom.addDisposableListener(exportBtn, dom.EventType.CLICK, () => {
			navigator.clipboard.writeText(this._styleService.exportToJSON()).catch(() => { /* ignore */ });
		}));

		const editorConfigRow = dom.append(panel, dom.$('.code-style-add-row'));
		editorConfigRow.style.marginTop = '6px';
		const importEcBtn = this._makeButton(nls.localize('codeStyle.profiles.importEditorConfig', 'Import from .editorconfig'), 'code-style-btn code-style-btn-secondary');
		const exportEcBtn = this._makeButton(nls.localize('codeStyle.profiles.exportEditorConfig', 'Export to .editorconfig'), 'code-style-btn code-style-btn-secondary');
		dom.append(editorConfigRow, importEcBtn);
		dom.append(editorConfigRow, exportEcBtn);
		this._register(dom.addDisposableListener(importEcBtn, dom.EventType.CLICK, () => {
			this._commandService.executeCommand('code-style.importEditorConfig').catch(() => { /* ignore */ });
		}));
		this._register(dom.addDisposableListener(exportEcBtn, dom.EventType.CLICK, () => {
			this._commandService.executeCommand('code-style.exportEditorConfig').catch(() => { /* ignore */ });
		}));

		this._profilesContainer = dom.append(panel, dom.$('.code-style-card-list'));
	}

	// ---------------------------------------------------------------------------
	// Dynamic panel refresh
	// ---------------------------------------------------------------------------

	private _refreshDynamicPanels(): void {
		this._dynamicDisposables.clear();
		this._refreshSyntaxOverrides();
		this._refreshNamingRules();
		this._refreshPresets();
		this._refreshProfiles();
	}

	private _refreshSyntaxOverrides(): void {
		this._addOverrideFormEl?.remove();
		this._addOverrideFormEl = undefined;
		dom.clearNode(this._syntaxOverridesContainer);
		const profile = this._styleService.getActiveProfile();

		// Collect per-language entries from all four syntax maps.
		const langs = new Set<string>();
		for (const map of [profile.quotes, profile.semicolons, profile.trailingCommas, profile.braceStyle]) {
			for (const key of Object.keys(map)) {
				if (key !== '*') { langs.add(key); }
			}
		}

		if (langs.size === 0) {
			const empty = dom.append(this._syntaxOverridesContainer, dom.$('span.code-style-empty'));
			empty.textContent = nls.localize('codeStyle.syntaxOverrides.empty', 'No language-specific overrides. Click Add Language Override to create one.');
			return;
		}

		for (const lang of langs) {
			let editFormEl: HTMLElement | undefined;
			const override: ISyntaxOverride = {
				language:      lang,
				quotes:        profile.quotes[lang],
				semicolons:    profile.semicolons[lang],
				trailingCommas: profile.trailingCommas[lang],
				braceStyle:    profile.braceStyle[lang],
			};

			const card = dom.append(this._syntaxOverridesContainer, dom.$('.code-style-card'));
			const row  = dom.append(card, dom.$('.code-style-card-row'));
			const name = dom.append(row, dom.$('span.code-style-card-name'));
			name.textContent = lang;

			const editBtn = this._makeButton(nls.localize('codeStyle.naming.edit', 'Edit'), 'code-style-btn code-style-btn-secondary');
			dom.append(row, editBtn);

			const delBtn = this._makeDeleteButton(
				nls.localize('codeStyle.naming.delete', 'Delete'),
				async () => {
					const p = this._styleService.getActiveProfile();
					const q  = { ...p.quotes };        delete q[lang];
					const s  = { ...p.semicolons };    delete s[lang];
					const tc = { ...p.trailingCommas }; delete tc[lang];
					const bs = { ...p.braceStyle };    delete bs[lang];
					await this._styleService.updateProfile({ quotes: q, semicolons: s, trailingCommas: tc, braceStyle: bs });
				},
				this._dynamicDisposables,
			);
			dom.append(row, delBtn);

			const parts: string[] = [];
			if (override.quotes)        { parts.push(`quotes: ${override.quotes}`); }
			if (override.semicolons)    { parts.push(`semicolons: ${override.semicolons}`); }
			if (override.trailingCommas){ parts.push(`trailing: ${override.trailingCommas}`); }
			if (override.braceStyle)    { parts.push(`braces: ${override.braceStyle}`); }
			const desc = dom.append(card, dom.$('.code-style-card-desc'));
			desc.textContent = parts.join(' \u00B7 ');

			this._dynamicDisposables.add(dom.addDisposableListener(editBtn, dom.EventType.CLICK, () => {
				if (editFormEl) {
					editFormEl.remove();
					editFormEl = undefined;
					return;
				}
				editFormEl = this._buildSyntaxOverrideForm(card, override, () => {
					editFormEl?.remove();
					editFormEl = undefined;
				});
			}));
		}
	}

	private _refreshNamingRules(): void {
		this._addNamingFormEl?.remove();
		this._addNamingFormEl = undefined;
		dom.clearNode(this._namingRulesContainer);
		const { namingRules } = this._styleService.getActiveProfile();

		if (namingRules.length === 0) {
			const empty = dom.append(this._namingRulesContainer, dom.$('span.code-style-empty'));
			empty.textContent = nls.localize('codeStyle.naming.empty', 'No naming rules defined. Click Add Rule to create one.');
			return;
		}

		for (const rule of namingRules) {
			let editFormEl: HTMLElement | undefined;
			const card = dom.append(this._namingRulesContainer, dom.$('.code-style-card'));
			const row  = dom.append(card, dom.$('.code-style-card-row'));

			const name = dom.append(row, dom.$('span.code-style-card-name'));
			name.textContent = `${rule.kind} \u2192 ${rule.style}`;

			if (!rule.enabled) {
				const badge = dom.append(row, dom.$('span'));
				badge.textContent = nls.localize('codeStyle.naming.disabled', 'disabled');
				badge.style.cssText = 'font-size:0.8em;opacity:0.6;';
			}

			const editBtn = this._makeButton(nls.localize('codeStyle.naming.edit', 'Edit'), 'code-style-btn code-style-btn-secondary');
			dom.append(row, editBtn);

			const delBtn = this._makeDeleteButton(
				nls.localize('codeStyle.naming.delete', 'Delete'),
				async () => {
					const p = this._styleService.getActiveProfile();
					await this._styleService.updateProfile({ namingRules: p.namingRules.filter(r => r.id !== rule.id) });
				},
				this._dynamicDisposables,
			);
			dom.append(row, delBtn);

			const descParts: string[] = [
				rule.languages.length
					? rule.languages.join(', ')
					: nls.localize('codeStyle.naming.allLanguages', 'all languages'),
				`severity: ${rule.severity}`,
			];
			if (rule.prefix) { descParts.push(`prefix: ${rule.prefix}`); }
			if (rule.suffix) { descParts.push(`suffix: ${rule.suffix}`); }
			const desc = dom.append(card, dom.$('.code-style-card-desc'));
			desc.textContent = descParts.join(' \u00B7 ');

			this._dynamicDisposables.add(dom.addDisposableListener(editBtn, dom.EventType.CLICK, () => {
				if (editFormEl) {
					editFormEl.remove();
					editFormEl = undefined;
					return;
				}
				editFormEl = this._buildNamingRuleForm(card, rule, () => {
					editFormEl?.remove();
					editFormEl = undefined;
				});
			}));
		}
	}

	private _refreshPresets(): void {
		dom.clearNode(this._presetsContainer);
		for (const preset of this._styleService.getPresets()) {
			const card  = dom.append(this._presetsContainer, dom.$('.code-style-card'));
			const row   = dom.append(card, dom.$('.code-style-card-row'));
			const name  = dom.append(row, dom.$('span.code-style-card-name'));
			name.textContent = preset.name;

			const applyBtn = this._makeButton(nls.localize('codeStyle.presets.apply', 'Apply'), 'code-style-btn code-style-btn-primary');
			dom.append(row, applyBtn);
			this._dynamicDisposables.add(dom.addDisposableListener(applyBtn, dom.EventType.CLICK, async () => {
				await this._styleService.applyPreset(preset.name);
			}));

			if (preset.description) {
				const desc = dom.append(card, dom.$('.code-style-card-desc'));
				desc.textContent = preset.description;
			}
		}
	}

	private _refreshProfiles(): void {
		dom.clearNode(this._profilesContainer);
		const profiles    = this._styleService.getProfiles();
		const activeName  = this._styleService.getActiveProfileName();

		if (profiles.length === 0) {
			const empty = dom.append(this._profilesContainer, dom.$('span.code-style-empty'));
			empty.textContent = nls.localize('codeStyle.profiles.empty', 'No saved profiles.');
			return;
		}

		for (const profile of profiles) {
			const isActive = profile.name === activeName;
			const card = dom.append(this._profilesContainer, dom.$(`.code-style-card${isActive ? '.active' : ''}`));
			const row  = dom.append(card, dom.$('.code-style-card-row'));
			const name = dom.append(row, dom.$('span.code-style-card-name'));
			name.textContent = profile.name;

			if (!profile.builtIn) {
				const loadBtn = this._makeButton(nls.localize('codeStyle.profiles.load', 'Load'), 'code-style-btn code-style-btn-secondary');
				dom.append(row, loadBtn);
				this._dynamicDisposables.add(dom.addDisposableListener(loadBtn, dom.EventType.CLICK, async () => {
					await this._styleService.loadProfile(profile.name);
				}));

				const delBtn = this._makeDeleteButton(
					nls.localize('codeStyle.profiles.delete', 'Delete'),
					async () => { await this._styleService.deleteProfile(profile.name); },
					this._dynamicDisposables,
				);
				dom.append(row, delBtn);
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Form ↔ profile sync
	// ---------------------------------------------------------------------------

	private _updateFormFromProfile(profile: ICodeStyleProfile): void {
		this._enforceOnSaveChk.checked      = profile.enforceOnSave;
		this._insertFinalNewlineChk.checked  = profile.insertFinalNewline;
		this._trimWsChk.checked             = profile.trimTrailingWhitespace;
		this._maxLineLengthInput.value       = String(profile.maxLineLength);
		this._severitySelect.value          = profile.defaultSeverity;
		this._lineEndingSelect.value        = profile.lineEnding;
		this._indentStyleSelect.value       = profile.indent.style;
		this._indentSizeInput.value         = String(profile.indent.size);
		this._quotesSelect.value            = profile.quotes['*'] ?? 'any';
		this._semicolonsSelect.value        = profile.semicolons['*'] ?? 'any';
		this._trailingCommasSelect.value    = profile.trailingCommas['*'] ?? 'any';
		this._braceStyleSelect.value        = profile.braceStyle['*'] ?? 'any';
	}
}
