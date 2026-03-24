/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ICodeStyleService } from '../common/codeStyle.js';
import { CodeStyleService } from './codeStyleService.js';
import { CodeStyleDiagnosticProvider } from './codeStyleDiagnosticProvider.js';
import { CodeStyleSaveParticipant, applyTextFixes } from './codeStyleSaveParticipant.js';
import { CodeStylePanel } from './codeStylePanel.js';
import { CodeStyleStatusBarItem } from './codeStyleStatusBar.js';
import { CodeStyleCodeActionsContribution } from './codeStyleCodeActions.js';
import { BUILT_IN_PRESETS } from './codeStylePresets.js';
import { parseEditorConfig, generateEditorConfig } from './codeStyleEditorConfig.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ExplorerFolderContext } from '../../files/common/files.js';

// ---------------------------------------------------------------------------
// Service registration
// ---------------------------------------------------------------------------

registerSingleton(ICodeStyleService, CodeStyleService, InstantiationType.Delayed);

// ---------------------------------------------------------------------------
// Configuration schema
// ---------------------------------------------------------------------------

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'code-style',
	title: nls.localize('codeStyle.title', "Code Style"),
	order: 25,
	type: 'object',
	properties: {

		// ---- General -------------------------------------------------------

		'code-style.lineEnding': {
			type: 'string',
			enum: ['lf', 'crlf', 'cr', 'auto'],
			enumDescriptions: [
				nls.localize('codeStyle.lineEnding.lf', "Unix / macOS line endings (\\n)."),
				nls.localize('codeStyle.lineEnding.crlf', "Windows line endings (\\r\\n)."),
				nls.localize('codeStyle.lineEnding.cr', "Classic Mac line endings (\\r)."),
				nls.localize('codeStyle.lineEnding.auto', "Detect the line ending from the file content and do not enforce a specific style."),
			],
			default: 'lf',
			description: nls.localize('codeStyle.lineEnding.description', "Required line-ending sequence for all files."),
		},
		'code-style.insertFinalNewline': {
			type: 'boolean',
			default: true,
			description: nls.localize('codeStyle.insertFinalNewline', "Ensure every file ends with a newline character."),
		},
		'code-style.trimTrailingWhitespace': {
			type: 'boolean',
			default: true,
			description: nls.localize('codeStyle.trimTrailingWhitespace', "Remove trailing spaces and tabs from every line."),
		},
		'code-style.maxLineLength': {
			type: 'integer',
			default: 0,
			minimum: 0,
			markdownDescription: nls.localize('codeStyle.maxLineLength', "Maximum allowed line length in characters. Set to `0` to disable the check."),
		},
		'code-style.enforceOnSave': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('codeStyle.enforceOnSave', "Automatically apply fixable violations (line endings, trailing whitespace, final newline) when saving a file. Requires `#code-style.lineEnding#` or the corresponding toggle to be set."),
		},
		'code-style.defaultSeverity': {
			type: 'string',
			enum: ['error', 'warning', 'information', 'hint'],
			default: 'warning',
			description: nls.localize('codeStyle.defaultSeverity', "Diagnostic severity level used for violations that do not have their own severity setting."),
		},

		// ---- Indentation ---------------------------------------------------

		'code-style.indentStyle': {
			type: 'string',
			enum: ['tabs', 'spaces'],
			enumDescriptions: [
				nls.localize('codeStyle.indentStyle.tabs', "Use hard tab characters for indentation."),
				nls.localize('codeStyle.indentStyle.spaces', "Use space characters for indentation."),
			],
			default: 'tabs',
			description: nls.localize('codeStyle.indentStyle.description', "Whether to use tabs or spaces for indentation."),
		},
		'code-style.indentSize': {
			type: 'integer',
			default: 4,
			minimum: 1,
			maximum: 16,
			markdownDescription: nls.localize('codeStyle.indentSize', "Number of spaces per indentation level. Only used when `#code-style.indentStyle#` is `spaces`."),
		},

		// ---- Syntax --------------------------------------------------------

		'code-style.quotes': {
			type: 'string',
			enum: ['single', 'double', 'backtick', 'any'],
			enumDescriptions: [
				nls.localize('codeStyle.quotes.single', "Enforce single-quoted strings."),
				nls.localize('codeStyle.quotes.double', "Enforce double-quoted strings."),
				nls.localize('codeStyle.quotes.backtick', "Enforce template literals (backtick strings)."),
				nls.localize('codeStyle.quotes.any', "No quote style preference."),
			],
			default: 'any',
			description: nls.localize('codeStyle.quotes.description', "Preferred quote character for string literals. Applied to all languages unless overridden in the Code Style Manager panel."),
		},
		'code-style.semicolons': {
			type: 'string',
			enum: ['always', 'never', 'any'],
			enumDescriptions: [
				nls.localize('codeStyle.semicolons.always', "Require semicolons at the end of statements."),
				nls.localize('codeStyle.semicolons.never', "Forbid semicolons (ASI-style)."),
				nls.localize('codeStyle.semicolons.any', "No semicolon preference."),
			],
			default: 'any',
			description: nls.localize('codeStyle.semicolons.description', "Whether statement-terminating semicolons are required or forbidden."),
		},
		'code-style.trailingCommas': {
			type: 'string',
			enum: ['always', 'never', 'es5', 'any'],
			enumDescriptions: [
				nls.localize('codeStyle.trailingCommas.always', "Always require trailing commas in multi-line constructs."),
				nls.localize('codeStyle.trailingCommas.never', "Never allow trailing commas."),
				nls.localize('codeStyle.trailingCommas.es5', "Trailing commas where valid in ES5 (objects, arrays, etc.)."),
				nls.localize('codeStyle.trailingCommas.any', "No trailing comma preference."),
			],
			default: 'any',
			description: nls.localize('codeStyle.trailingCommas.description', "Trailing comma policy for multi-line lists and parameters."),
		},
		'code-style.braceStyle': {
			type: 'string',
			enum: ['same-line', 'next-line', 'any'],
			enumDescriptions: [
				nls.localize('codeStyle.braceStyle.sameLine', "Opening brace on the same line as the statement (K&R / 1TBS style)."),
				nls.localize('codeStyle.braceStyle.nextLine', "Opening brace on its own line (Allman style)."),
				nls.localize('codeStyle.braceStyle.any', "No brace style preference."),
			],
			default: 'any',
			description: nls.localize('codeStyle.braceStyle.description', "Where opening curly braces are placed relative to their statement."),
		},

		// ---- Advanced / profile management (hidden from main settings UI) --

		'code-style.namingRules': {
			type: 'array',
			default: [],
			markdownDescription: nls.localize(
				'codeStyle.namingRules',
				"Advanced naming rules with per-language scope, prefix/suffix requirements, and individual severity. Manage these from the **Code Style Manager** panel (`Code Style: Open Manager`).",
			),
			items: {
				type: 'object',
				required: ['id', 'kind', 'style', 'severity', 'enabled'],
				properties: {
					id: { type: 'string' },
					kind: {
						type: 'string',
						enum: ['variable', 'function', 'class', 'interface', 'enum', 'enumMember', 'type', 'constant', 'parameter', 'property'],
					},
					style: {
						type: 'string',
						enum: ['camelCase', 'PascalCase', 'snake_case', 'SCREAMING_SNAKE_CASE', 'kebab-case', 'any'],
					},
					languages: { type: 'array', items: { type: 'string' }, default: [] },
					enabled: { type: 'boolean', default: true },
					prefix: { type: 'string', default: '' },
					suffix: { type: 'string', default: '' },
					severity: {
						type: 'string',
						enum: ['error', 'warning', 'information', 'hint'],
						default: 'warning',
					},
				},
			},
		},
		'code-style.scope': {
			type: 'string',
			enum: ['workspace', 'global'],
			enumDescriptions: [
				nls.localize('codeStyle.scope.workspace', "Save settings in the workspace configuration (shared with the team)."),
				nls.localize('codeStyle.scope.global', "Save settings in the user configuration (personal)."),
			],
			default: 'workspace',
			description: nls.localize('codeStyle.scope.description', "Where code style settings are persisted when changed via the Code Style Manager panel."),
		},
		'code-style.profiles': {
			type: 'array',
			default: [],
			markdownDescription: nls.localize(
				'codeStyle.profiles.description',
				"Named profiles that store a complete snapshot of all code style settings. Manage profiles from the **Code Style Manager** panel (`Code Style: Open Manager`). Loading a profile overwrites all individual `code-style.*` settings.",
			),
			items: {
				type: 'object',
				required: ['name', 'profile'],
				properties: {
					name: { type: 'string' },
					builtIn: { type: 'boolean' },
					profile: { type: 'object' },
				},
			},
		},
		'code-style.activeProfile': {
			type: 'string',
			default: '',
			description: nls.localize('codeStyle.activeProfile.description', "Name of the last loaded profile. This is informational — the actual active settings are the individual code-style.* keys."),
		},
		'code-style.languageSyntaxOverrides': {
			type: 'array',
			default: [],
			markdownDescription: nls.localize(
				'codeStyle.languageSyntaxOverrides.description',
				"Per-language overrides for syntax settings (quotes, semicolons, trailing commas, brace style). Managed from the **Syntax** tab of the Code Style Manager panel.",
			),
			items: {
				type: 'object',
				required: ['language'],
				properties: {
					language: { type: 'string', description: nls.localize('codeStyle.languageSyntaxOverrides.language', "VS Code language ID.") },
					quotes: { type: 'string', enum: ['single', 'double', 'backtick', 'any'] },
					semicolons: { type: 'string', enum: ['always', 'never', 'any'] },
					trailingCommas: { type: 'string', enum: ['always', 'never', 'es5', 'any'] },
					braceStyle: { type: 'string', enum: ['same-line', 'next-line', 'any'] },
				},
			},
		},
	},
});

// ---------------------------------------------------------------------------
// Workbench contribution — wires together the diagnostic provider and save participant
// ---------------------------------------------------------------------------

class CodeStyleContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.codeStyle';

	constructor(
		@ICodeStyleService codeStyleService: ICodeStyleService,
		@ITextFileService textFileService: ITextFileService,
	) {
		super();
		// Register the save participant so fixes are applied on save.
		this._register(
			textFileService.files.addSaveParticipant(new CodeStyleSaveParticipant(codeStyleService))
		);
	}
}

registerWorkbenchContribution2(
	CodeStyleContribution.ID,
	CodeStyleContribution,
	WorkbenchPhase.AfterRestored,
);

registerWorkbenchContribution2(
	CodeStyleDiagnosticProvider.ID,
	CodeStyleDiagnosticProvider,
	WorkbenchPhase.AfterRestored,
);

registerWorkbenchContribution2(
	CodeStyleStatusBarItem.ID,
	CodeStyleStatusBarItem,
	WorkbenchPhase.AfterRestored,
);

registerWorkbenchContribution2(
	CodeStyleCodeActionsContribution.ID,
	CodeStyleCodeActionsContribution,
	WorkbenchPhase.AfterRestored,
);

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

registerAction2(class OpenCodeStylePanel extends Action2 {
	constructor() {
		super({
			id: 'code-style.openPanel',
			title: nls.localize2('codeStyle.openPanel', "Open Manager"),
			category: nls.localize2('codeStyle.category', "Code Style"),
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		CodeStylePanel.createOrShow(
			accessor.get(IInstantiationService),
			accessor.get(ILayoutService),
		);
	}
});

registerAction2(class ValidateAllDocuments extends Action2 {
	constructor() {
		super({
			id: 'code-style.validateAll',
			title: nls.localize2('codeStyle.validateAll', "Re-validate All Open Documents"),
			category: nls.localize2('codeStyle.category', "Code Style"),
			f1: true,
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(ICodeStyleService).revalidate();
	}
});

registerAction2(class ApplyPreset extends Action2 {
	constructor() {
		super({
			id: 'code-style.applyPreset',
			title: nls.localize2('codeStyle.applyPreset', "Apply Preset…"),
			category: nls.localize2('codeStyle.category', "Code Style"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const styleService = accessor.get(ICodeStyleService);
		const quickInput = accessor.get(IQuickInputService);

		const items = BUILT_IN_PRESETS.map(p => ({
			label: p.name,
			description: p.description,
		}));

		const picked = await quickInput.pick(items, {
			placeHolder: nls.localize('codeStyle.applyPreset.placeholder', "Select a built-in preset to apply…"),
			matchOnDescription: true,
		});

		if (!picked) {
			return;
		}

		await styleService.applyPreset(picked.label);
	}
});

registerAction2(class ImportEditorConfig extends Action2 {
	constructor() {
		super({
			id: 'code-style.importEditorConfig',
			title: nls.localize2('codeStyle.importEditorConfig', "Import from .editorconfig"),
			category: nls.localize2('codeStyle.category', "Code Style"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const styleService = accessor.get(ICodeStyleService);
		const fileService = accessor.get(IFileService);
		const workspaceCtx = accessor.get(IWorkspaceContextService);
		const notifications = accessor.get(INotificationService);

		const folder = workspaceCtx.getWorkspace().folders[0];
		if (!folder) {
			notifications.warn(nls.localize('codeStyle.importEditorConfig.noWorkspace', "No workspace folder open."));
			return;
		}

		const uri = URI.joinPath(folder.uri, '.editorconfig');
		let content: string;
		try {
			const file = await fileService.readFile(uri);
			content = file.value.toString();
		} catch {
			notifications.warn(nls.localize('codeStyle.importEditorConfig.notFound', "No .editorconfig file found in the workspace root."));
			return;
		}

		const parsed = parseEditorConfig(content);
		await styleService.updateProfile(parsed);
		notifications.info(nls.localize('codeStyle.importEditorConfig.success', "Code style settings imported from .editorconfig."));
	}
});

registerAction2(class ExportEditorConfig extends Action2 {
	constructor() {
		super({
			id: 'code-style.exportEditorConfig',
			title: nls.localize2('codeStyle.exportEditorConfig', "Export to .editorconfig"),
			category: nls.localize2('codeStyle.category', "Code Style"),
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const styleService = accessor.get(ICodeStyleService);
		const fileService = accessor.get(IFileService);
		const workspaceCtx = accessor.get(IWorkspaceContextService);
		const notifications = accessor.get(INotificationService);

		const folder = workspaceCtx.getWorkspace().folders[0];
		if (!folder) {
			notifications.warn(nls.localize('codeStyle.exportEditorConfig.noWorkspace', "No workspace folder open."));
			return;
		}

		const profile = styleService.getActiveProfile();
		const content = generateEditorConfig(profile);
		const uri = URI.joinPath(folder.uri, '.editorconfig');
		await fileService.writeFile(uri, VSBuffer.fromString(content));
		notifications.info(nls.localize('codeStyle.exportEditorConfig.success', ".editorconfig written to workspace root."));
	}
});

registerAction2(class CodeCleanup extends Action2 {
	constructor() {
		super({
			id: 'code-style.codeCleanup',
			title: nls.localize2('codeStyle.codeCleanup', "Code Cleanup"),
			category: nls.localize2('codeStyle.category', "Code Style"),
			f1: true,
			menu: {
				id: MenuId.ExplorerContext,
				group: '3_compare',
				order: 99,
				when: ContextKeyExpr.not(ExplorerFolderContext.key),
			},
		});
	}

	async run(accessor: ServicesAccessor, resource?: URI): Promise<void> {
		const styleService = accessor.get(ICodeStyleService);
		const textModelService = accessor.get(ITextModelService);
		const textFileService = accessor.get(ITextFileService);
		const notifications = accessor.get(INotificationService);

		const uri = resource ?? textFileService.files.models.find(() => true)?.resource;
		if (!uri) {
			return;
		}

		const ref = await textModelService.createModelReference(uri);
		try {
			const textModel = ref.object.textEditorModel;
			if (!textModel) {
				return;
			}

			const profile = styleService.getActiveProfile();
			const original = textModel.getValue();
			const text = applyTextFixes(original, profile);

			if (text !== original) {
				textModel.pushStackElement();
				textModel.pushEditOperations(
					[],
					[{ range: textModel.getFullModelRange(), text }],
					() => null,
				);
				textModel.pushStackElement();
				await textFileService.save(uri);
				notifications.info(nls.localize('codeStyle.codeCleanup.success', "Code cleanup applied and file saved."));
			} else {
				notifications.info(nls.localize('codeStyle.codeCleanup.noop', "No code style issues found in this file."));
			}
		} finally {
			ref.dispose();
		}
	}
});
