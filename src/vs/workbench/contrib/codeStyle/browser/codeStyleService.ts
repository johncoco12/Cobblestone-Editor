/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService, ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { ICodeStylePreset, ICodeStyleService } from '../common/codeStyle.js';
import {
	BraceStyle, ICodeStyleProfile, INamedProfile, ISyntaxOverride,
	QuoteStyle, SemicolonStyle, TrailingCommaStyle,
} from '../common/codeStyleTypes.js';
import { BUILT_IN_PRESETS } from './codeStylePresets.js';

const CONFIG_SECTION = 'code-style';
const PROFILES_KEY = 'profiles';
const ACTIVE_PROFILE_KEY = 'activeProfile';
const SCOPE_KEY = 'scope';
const LANG_OVERRIDES_KEY = 'languageSyntaxOverrides';

/** Mutable working copy of ISyntaxOverride — derived so it stays in sync. */
type ISyntaxOverrideEntry = { -readonly [K in keyof ISyntaxOverride]: ISyntaxOverride[K] };


/**
 * Implements {@link ICodeStyleService} by reading from and writing to individual
 * flat VS Code configuration keys (e.g. `code-style.lineEnding`). This allows
 * every setting to be managed directly from the native Settings editor.
 *
 * Named profiles are still stored in `code-style.profiles` so users can save and
 * switch between complete style snapshots from the Code Style Manager panel.
 */
export class CodeStyleService extends Disposable implements ICodeStyleService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeProfile = this._register(new Emitter<ICodeStyleProfile>());
	readonly onDidChangeProfile = this._onDidChangeProfile.event;

	constructor(
		@IConfigurationService private readonly _configService: IConfigurationService,
	) {
		super();
		this._register(
			_configService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(CONFIG_SECTION)) {
					this._onDidChangeProfile.fire(this.getActiveProfile());
				}
			})
		);
	}

	// ---------------------------------------------------------------------------
	// Profile access — reads directly from flat config keys
	// ---------------------------------------------------------------------------

	getActiveProfile(): ICodeStyleProfile {
		const cfg = this._configService;
		const s = CONFIG_SECTION;

		const langOverrides: ISyntaxOverride[] = cfg.getValue(`${s}.${LANG_OVERRIDES_KEY}`) ?? [];
		const quotes: Record<string, QuoteStyle> = { '*': cfg.getValue(`${s}.quotes`) ?? 'any' };
		const semicolons: Record<string, SemicolonStyle> = { '*': cfg.getValue(`${s}.semicolons`) ?? 'any' };
		const trailingCommas: Record<string, TrailingCommaStyle> = { '*': cfg.getValue(`${s}.trailingCommas`) ?? 'any' };
		const braceStyle: Record<string, BraceStyle> = { '*': cfg.getValue(`${s}.braceStyle`) ?? 'any' };

		for (const o of langOverrides) {
			if (o.quotes) { quotes[o.language] = o.quotes; }
			if (o.semicolons) { semicolons[o.language] = o.semicolons; }
			if (o.trailingCommas) { trailingCommas[o.language] = o.trailingCommas; }
			if (o.braceStyle) { braceStyle[o.language] = o.braceStyle; }
		}

		return {
			lineEnding: cfg.getValue(`${s}.lineEnding`) ?? 'lf',
			insertFinalNewline: cfg.getValue(`${s}.insertFinalNewline`) ?? true,
			trimTrailingWhitespace: cfg.getValue(`${s}.trimTrailingWhitespace`) ?? true,
			maxLineLength: cfg.getValue(`${s}.maxLineLength`) ?? 0,
			enforceOnSave: cfg.getValue(`${s}.enforceOnSave`) ?? false,
			defaultSeverity: cfg.getValue(`${s}.defaultSeverity`) ?? 'warning',
			indent: {
				style: cfg.getValue(`${s}.indentStyle`) ?? 'tabs',
				size: cfg.getValue(`${s}.indentSize`) ?? 4,
			},
			quotes,
			semicolons,
			trailingCommas,
			braceStyle,
			namingRules: cfg.getValue(`${s}.namingRules`) ?? [],
		};
	}

	getActiveProfileName(): string {
		return this._configService.getValue<string>(`${CONFIG_SECTION}.${ACTIVE_PROFILE_KEY}`) ?? '';
	}

	getProfiles(): INamedProfile[] {
		const stored = this._configService.getValue<INamedProfile[]>(`${CONFIG_SECTION}.${PROFILES_KEY}`) ?? [];
		return stored.map(p => ({ ...p, profile: { ...p.profile } }));
	}

	// ---------------------------------------------------------------------------
	// Profile mutation — writes to flat config keys
	// ---------------------------------------------------------------------------

	async updateProfile(partial: Partial<ICodeStyleProfile>): Promise<void> {
		const target = this._getTarget();
		const s = CONFIG_SECTION;
		const writes: Promise<void>[] = [];

		if (partial.lineEnding !== undefined) {
			writes.push(this._configService.updateValue(`${s}.lineEnding`, partial.lineEnding, target));
		}
		if (partial.insertFinalNewline !== undefined) {
			writes.push(this._configService.updateValue(`${s}.insertFinalNewline`, partial.insertFinalNewline, target));
		}
		if (partial.trimTrailingWhitespace !== undefined) {
			writes.push(this._configService.updateValue(`${s}.trimTrailingWhitespace`, partial.trimTrailingWhitespace, target));
		}
		if (partial.maxLineLength !== undefined) {
			writes.push(this._configService.updateValue(`${s}.maxLineLength`, partial.maxLineLength, target));
		}
		if (partial.enforceOnSave !== undefined) {
			writes.push(this._configService.updateValue(`${s}.enforceOnSave`, partial.enforceOnSave, target));
		}
		if (partial.defaultSeverity !== undefined) {
			writes.push(this._configService.updateValue(`${s}.defaultSeverity`, partial.defaultSeverity, target));
		}
		if (partial.indent !== undefined) {
			if (partial.indent.style !== undefined) {
				writes.push(this._configService.updateValue(`${s}.indentStyle`, partial.indent.style, target));
			}
			if (partial.indent.size !== undefined) {
				writes.push(this._configService.updateValue(`${s}.indentSize`, partial.indent.size, target));
			}
		}
		if (partial.quotes !== undefined) {
			writes.push(this._configService.updateValue(`${s}.quotes`, partial.quotes['*'] ?? 'any', target));
		}
		if (partial.semicolons !== undefined) {
			writes.push(this._configService.updateValue(`${s}.semicolons`, partial.semicolons['*'] ?? 'any', target));
		}
		if (partial.trailingCommas !== undefined) {
			writes.push(this._configService.updateValue(`${s}.trailingCommas`, partial.trailingCommas['*'] ?? 'any', target));
		}
		if (partial.braceStyle !== undefined) {
			writes.push(this._configService.updateValue(`${s}.braceStyle`, partial.braceStyle['*'] ?? 'any', target));
		}
		if (partial.namingRules !== undefined) {
			writes.push(this._configService.updateValue(`${s}.namingRules`, partial.namingRules, target));
		}
		if (partial.quotes !== undefined || partial.semicolons !== undefined ||
			partial.trailingCommas !== undefined || partial.braceStyle !== undefined) {
			writes.push(this._persistSyntaxOverrides(partial, target));
		}

		await Promise.all(writes);
	}

	async loadProfile(name: string): Promise<void> {
		const found = this.getProfiles().find(p => p.name === name);
		if (found) {
			await this.updateProfile(found.profile);
		}
		await this._configService.updateValue(
			`${CONFIG_SECTION}.${ACTIVE_PROFILE_KEY}`,
			name,
			this._getTarget(),
		);
	}

	async saveAsProfile(name: string): Promise<void> {
		const current = this.getActiveProfile();
		const profiles = this.getProfiles().filter(p => p.name !== name);
		profiles.push({ name, profile: current });
		await this._persistProfiles(profiles);
		await this._configService.updateValue(
			`${CONFIG_SECTION}.${ACTIVE_PROFILE_KEY}`,
			name,
			this._getTarget(),
		);
	}

	async deleteProfile(name: string): Promise<void> {
		const profiles = this.getProfiles().filter(p => p.name !== name);
		await this._persistProfiles(profiles);
		if (this.getActiveProfileName() === name) {
			const next = profiles[0];
			if (next) {
				await this.loadProfile(next.name);
			} else {
				await this._configService.updateValue(
					`${CONFIG_SECTION}.${ACTIVE_PROFILE_KEY}`,
					'',
					this._getTarget(),
				);
			}
		}
	}

	// ---------------------------------------------------------------------------
	// Presets
	// ---------------------------------------------------------------------------

	getPresets(): ICodeStylePreset[] {
		return [...BUILT_IN_PRESETS];
	}

	async applyPreset(presetName: string, targetName?: string): Promise<void> {
		const preset = BUILT_IN_PRESETS.find(p => p.name === presetName);
		if (!preset) {
			throw new Error(`Preset '${presetName}' not found.`);
		}
		const name = targetName ?? presetName;
		// Save a mutable copy as a named profile so the user can edit it.
		const profiles = this.getProfiles().filter(p => p.name !== name);
		profiles.push({ name, profile: { ...preset.profile } });
		await this._persistProfiles(profiles);
		// Apply the preset values to the flat config keys so the Settings editor reflects them.
		await this.updateProfile(preset.profile);
		await this._configService.updateValue(
			`${CONFIG_SECTION}.${ACTIVE_PROFILE_KEY}`,
			name,
			this._getTarget(),
		);
	}

	// ---------------------------------------------------------------------------
	// Import / export
	// ---------------------------------------------------------------------------

	async importFromJSON(json: string): Promise<void> {
		const parsed = JSON.parse(json) as INamedProfile[];
		if (!Array.isArray(parsed)) {
			throw new Error('Invalid profile JSON: expected an array of profiles.');
		}
		for (const item of parsed) {
			if (typeof item.name !== 'string' || typeof item.profile !== 'object' || item.profile === null) {
				throw new Error(`Invalid profile JSON: each entry must have a 'name' string and a 'profile' object.`);
			}
		}
		const existing = this.getProfiles();
		for (const incoming of parsed) {
			const idx = existing.findIndex(p => p.name === incoming.name);
			if (idx >= 0) {
				existing[idx] = incoming;
			} else {
				existing.push(incoming);
			}
		}
		await this._persistProfiles(existing);
	}

	exportToJSON(): string {
		return JSON.stringify(this.getProfiles(), null, 2);
	}

	// ---------------------------------------------------------------------------
	// Scope
	// ---------------------------------------------------------------------------

	getScope(): 'workspace' | 'global' {
		return this._configService.getValue<'workspace' | 'global'>(`${CONFIG_SECTION}.${SCOPE_KEY}`) ?? 'workspace';
	}

	async setScope(scope: 'workspace' | 'global'): Promise<void> {
		await this._configService.updateValue(
			`${CONFIG_SECTION}.${SCOPE_KEY}`,
			scope,
			ConfigurationTarget.USER,
		);
	}

	revalidate(): void {
		this._onDidChangeProfile.fire(this.getActiveProfile());
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	private _getTarget(): ConfigurationTarget {
		return this.getScope() === 'global' ? ConfigurationTarget.USER : ConfigurationTarget.WORKSPACE;
	}

	private async _persistProfiles(profiles: INamedProfile[]): Promise<void> {
		await this._configService.updateValue(
			`${CONFIG_SECTION}.${PROFILES_KEY}`,
			profiles,
			this._getTarget(),
		);
	}

	/**
	 * Rewrites the per-language syntax overrides stored in
	 * `code-style.languageSyntaxOverrides` based on the non-`'*'` entries in
	 * the syntax fields of `partial`.  Fields absent from `partial` are left
	 * unchanged in the stored overrides.
	 */
	private async _persistSyntaxOverrides(partial: Partial<ICodeStyleProfile>, target: ConfigurationTarget): Promise<void> {
		const existing: ISyntaxOverrideEntry[] =
			(this._configService.getValue<ISyntaxOverride[]>(`${CONFIG_SECTION}.${LANG_OVERRIDES_KEY}`) ?? [])
				.map(o => ({ language: o.language, quotes: o.quotes, semicolons: o.semicolons, trailingCommas: o.trailingCommas, braceStyle: o.braceStyle }));

		const byLang = new Map(existing.map(o => [o.language, o]));

		const applyField = <T extends string>(
			field: Exclude<keyof ISyntaxOverrideEntry, 'language'>,
			values: Record<string, T> | undefined,
		) => {
			if (values === undefined) { return; }
			// Replace all per-language entries for this field with the new values.
			for (const entry of byLang.values()) { delete entry[field]; }
			for (const [lang, value] of Object.entries(values)) {
				if (lang === '*') { continue; }
				const entry = byLang.get(lang) ?? { language: lang };
				Object.assign(entry, { [field]: value });
				byLang.set(lang, entry);
			}
		};

		applyField('quotes', partial.quotes);
		applyField('semicolons', partial.semicolons);
		applyField('trailingCommas', partial.trailingCommas);
		applyField('braceStyle', partial.braceStyle);

		// Drop entries where every field has been cleared.
		const result = [...byLang.values()].filter(e =>
			e.quotes !== undefined || e.semicolons !== undefined ||
			e.trailingCommas !== undefined || e.braceStyle !== undefined,
		);

		await this._configService.updateValue(`${CONFIG_SECTION}.${LANG_OVERRIDES_KEY}`, result, target);
	}
}
