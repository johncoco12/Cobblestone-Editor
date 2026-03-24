/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { CodeStyleService } from '../../browser/codeStyleService.js';
import { ICodeStyleProfile } from '../../common/codeStyleTypes.js';

// ---------------------------------------------------------------------------
// Fake IConfigurationService
// ---------------------------------------------------------------------------

class FakeConfigurationService {
	private readonly _store = new Map<string, unknown>();
	private readonly _onDidChange = new Emitter<{ affectsConfiguration(key: string): boolean }>();
	readonly onDidChangeConfiguration = this._onDidChange.event;

	getValue<T>(key: string): T {
		return this._store.get(key) as T;
	}

	async updateValue(key: string, value: unknown, _target?: ConfigurationTarget): Promise<void> {
		this._store.set(key, value);
		this._onDidChange.fire({ affectsConfiguration: (k: string) => k === 'code-style' || key.startsWith(k) });
	}

	/** Seed a value without triggering the change event. */
	seed(key: string, value: unknown): void {
		this._store.set(key, value);
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

suite('CodeStyleService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let store: DisposableStore;
	let fakeConfig: FakeConfigurationService;
	let service: CodeStyleService;

	setup(() => {
		store = new DisposableStore();
		fakeConfig = new FakeConfigurationService();
		store.add(fakeConfig as unknown as { dispose(): void });
		service = store.add(new CodeStyleService(fakeConfig as unknown as IConfigurationService));
	});

	teardown(() => {
		store.dispose();
	});

	// ---- getActiveProfile ----

	suite('getActiveProfile', () => {
		test('returns defaults when no config is set', () => {
			const profile = service.getActiveProfile();
			assert.strictEqual(profile.lineEnding, 'lf');
			assert.strictEqual(profile.insertFinalNewline, true);
			assert.strictEqual(profile.trimTrailingWhitespace, true);
			assert.strictEqual(profile.maxLineLength, 0);
			assert.strictEqual(profile.enforceOnSave, false);
			assert.strictEqual(profile.defaultSeverity, 'warning');
			assert.deepStrictEqual(profile.indent, { style: 'tabs', size: 4 });
			assert.strictEqual(profile.namingRules.length, 0);
		});

		test('reads custom values from config', () => {
			fakeConfig.seed('code-style.lineEnding', 'crlf');
			fakeConfig.seed('code-style.maxLineLength', 120);
			fakeConfig.seed('code-style.indentStyle', 'spaces');
			fakeConfig.seed('code-style.indentSize', 2);
			const profile = service.getActiveProfile();
			assert.strictEqual(profile.lineEnding, 'crlf');
			assert.strictEqual(profile.maxLineLength, 120);
			assert.deepStrictEqual(profile.indent, { style: 'spaces', size: 2 });
		});

		test('merges language-specific syntax overrides into the profile', () => {
			fakeConfig.seed('code-style.quotes', 'single');
			fakeConfig.seed('code-style.languageSyntaxOverrides', [
				{ language: 'javascript', quotes: 'double' },
			]);
			const profile = service.getActiveProfile();
			assert.strictEqual(profile.quotes['*'], 'single');
			assert.strictEqual(profile.quotes['javascript'], 'double');
		});

		test('missing languageSyntaxOverrides defaults to wildcard-only map', () => {
			fakeConfig.seed('code-style.quotes', 'backtick');
			const profile = service.getActiveProfile();
			assert.deepStrictEqual(Object.keys(profile.quotes), ['*']);
			assert.strictEqual(profile.quotes['*'], 'backtick');
		});
	});

	// ---- updateProfile ----

	suite('updateProfile', () => {
		test('writes lineEnding to config', async () => {
			await service.updateProfile({ lineEnding: 'crlf' });
			assert.strictEqual(fakeConfig.getValue('code-style.lineEnding'), 'crlf');
		});

		test('writes trimTrailingWhitespace to config', async () => {
			await service.updateProfile({ trimTrailingWhitespace: false });
			assert.strictEqual(fakeConfig.getValue('code-style.trimTrailingWhitespace'), false);
		});

		test('writes indent style and size separately', async () => {
			await service.updateProfile({ indent: { style: 'spaces', size: 2 } });
			assert.strictEqual(fakeConfig.getValue('code-style.indentStyle'), 'spaces');
			assert.strictEqual(fakeConfig.getValue('code-style.indentSize'), 2);
		});

		test('writes quotes wildcard to config', async () => {
			await service.updateProfile({ quotes: { '*': 'double' } });
			assert.strictEqual(fakeConfig.getValue('code-style.quotes'), 'double');
		});

		test('persists per-language syntax overrides when quotes has non-wildcard keys', async () => {
			await service.updateProfile({ quotes: { '*': 'single', typescript: 'double' } });
			const stored = fakeConfig.getValue<unknown[]>('code-style.languageSyntaxOverrides') ?? [];
			assert.ok(Array.isArray(stored));
			const tsEntry = stored.find((e: unknown) => (e as { language: string }).language === 'typescript');
			assert.ok(tsEntry);
			assert.strictEqual((tsEntry as { quotes: string }).quotes, 'double');
		});

		test('omits fields not present in partial', async () => {
			fakeConfig.seed('code-style.lineEnding', 'lf');
			await service.updateProfile({ trimTrailingWhitespace: true });
			// lineEnding should be untouched
			assert.strictEqual(fakeConfig.getValue('code-style.lineEnding'), 'lf');
		});
	});

	// ---- saveAsProfile / getProfiles / loadProfile / deleteProfile ----

	suite('profiles CRUD', () => {
		test('saveAsProfile persists the current profile under the given name', async () => {
			fakeConfig.seed('code-style.lineEnding', 'crlf');
			await service.saveAsProfile('my-profile');
			const profiles = service.getProfiles();
			assert.strictEqual(profiles.length, 1);
			assert.strictEqual(profiles[0].name, 'my-profile');
			assert.strictEqual(profiles[0].profile.lineEnding, 'crlf');
		});

		test('saveAsProfile updates active profile name', async () => {
			await service.saveAsProfile('my-profile');
			assert.strictEqual(service.getActiveProfileName(), 'my-profile');
		});

		test('saveAsProfile replaces an existing profile with the same name', async () => {
			fakeConfig.seed('code-style.lineEnding', 'lf');
			await service.saveAsProfile('prof');
			fakeConfig.seed('code-style.lineEnding', 'crlf');
			await service.saveAsProfile('prof');
			assert.strictEqual(service.getProfiles().length, 1);
			assert.strictEqual(service.getProfiles()[0].profile.lineEnding, 'crlf');
		});

		test('loadProfile applies its values and sets active profile name', async () => {
			const savedProfile: ICodeStyleProfile = {
				lineEnding: 'cr',
				insertFinalNewline: false,
				trimTrailingWhitespace: false,
				maxLineLength: 80,
				enforceOnSave: true,
				defaultSeverity: 'error',
				indent: { style: 'spaces', size: 4 },
				quotes: { '*': 'double' },
				semicolons: { '*': 'always' },
				trailingCommas: { '*': 'never' },
				braceStyle: { '*': 'next-line' },
				namingRules: [],
			};
			fakeConfig.seed('code-style.profiles', [{ name: 'saved', profile: savedProfile }]);
			await service.loadProfile('saved');
			assert.strictEqual(service.getActiveProfileName(), 'saved');
			assert.strictEqual(fakeConfig.getValue('code-style.lineEnding'), 'cr');
		});

		test('deleteProfile removes the profile', async () => {
			await service.saveAsProfile('to-delete');
			await service.deleteProfile('to-delete');
			assert.strictEqual(service.getProfiles().length, 0);
		});

		test('deleteProfile clears activeProfileName when active profile is deleted', async () => {
			await service.saveAsProfile('to-delete');
			await service.deleteProfile('to-delete');
			assert.strictEqual(service.getActiveProfileName(), '');
		});

		test('deleteProfile switches to next profile when active is deleted', async () => {
			await service.saveAsProfile('first');
			await service.saveAsProfile('second');
			// 'second' is currently active — delete it, should switch to 'first'
			await service.deleteProfile('second');
			assert.strictEqual(service.getActiveProfileName(), 'first');
		});
	});

	// ---- importFromJSON / exportToJSON ----

	suite('importFromJSON / exportToJSON', () => {
		test('importFromJSON adds new profiles', async () => {
			const json = JSON.stringify([{ name: 'imported', profile: { lineEnding: 'lf' } }]);
			await service.importFromJSON(json);
			const profiles = service.getProfiles();
			assert.ok(profiles.some(p => p.name === 'imported'));
		});

		test('importFromJSON replaces existing profile with same name', async () => {
			await service.saveAsProfile('existing');
			const json = JSON.stringify([{ name: 'existing', profile: { lineEnding: 'crlf' } }]);
			await service.importFromJSON(json);
			const profiles = service.getProfiles();
			const match = profiles.find(p => p.name === 'existing');
			assert.ok(match);
			assert.strictEqual((match.profile as Partial<ICodeStyleProfile>).lineEnding, 'crlf');
		});

		test('importFromJSON throws on non-array JSON', async () => {
			await assert.rejects(service.importFromJSON('{}'), /expected an array/);
		});

		test('importFromJSON throws when entry lacks name', async () => {
			await assert.rejects(service.importFromJSON(JSON.stringify([{ profile: {} }])), /name.*string/i);
		});

		test('exportToJSON returns valid JSON array of current profiles', async () => {
			await service.saveAsProfile('prof-a');
			const json = service.exportToJSON();
			const parsed = JSON.parse(json);
			assert.ok(Array.isArray(parsed));
			assert.ok(parsed.some((p: { name: string }) => p.name === 'prof-a'));
		});
	});

	// ---- scope ----

	suite('scope', () => {
		test('getScope returns workspace by default', () => {
			assert.strictEqual(service.getScope(), 'workspace');
		});

		test('setScope persists the new scope', async () => {
			await service.setScope('global');
			assert.strictEqual(fakeConfig.getValue('code-style.scope'), 'global');
		});
	});

	// ---- revalidate ----

	suite('revalidate', () => {
		test('fires onDidChangeProfile', () => {
			let fired = false;
			store.add(service.onDidChangeProfile(() => { fired = true; }));
			service.revalidate();
			assert.strictEqual(fired, true);
		});
	});

	// ---- onDidChangeConfiguration integration ----

	suite('onDidChangeConfiguration', () => {
		test('fires onDidChangeProfile when config section changes', async () => {
			let firedCount = 0;
			store.add(service.onDidChangeProfile(() => { firedCount++; }));
			// updateValue triggers the fake onDidChangeConfiguration
			await service.updateProfile({ lineEnding: 'lf' });
			assert.ok(firedCount > 0);
		});
	});

	// ---- getPresets ----

	suite('getPresets', () => {
		test('returns a non-empty array of presets', () => {
			const presets = service.getPresets();
			assert.ok(presets.length > 0);
		});

		test('each preset has a name and a profile', () => {
			for (const preset of service.getPresets()) {
				assert.ok(typeof preset.name === 'string' && preset.name.length > 0);
				assert.ok(preset.profile !== null && typeof preset.profile === 'object');
			}
		});
	});
});
