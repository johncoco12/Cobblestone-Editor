/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ICodeStyleProfile, INamedProfile } from './codeStyleTypes.js';

/** A built-in preset with a human-readable description. */
export interface ICodeStylePreset extends INamedProfile {
	readonly builtIn: true;
	readonly description: string;
}

export const ICodeStyleService = createDecorator<ICodeStyleService>('codeStyleService');

/**
 * Core service for managing code style profiles.
 *
 * Profiles are persisted in VS Code configuration under `code-style.profiles`
 * and can target either workspace or global (user) scope.
 */
export interface ICodeStyleService {
	readonly _serviceBrand: undefined;

	// --- Profile access ---

	/** Returns a copy of the currently active profile's settings. */
	getActiveProfile(): ICodeStyleProfile;

	/** Returns the name of the currently active profile. */
	getActiveProfileName(): string;

	/** Returns all user-defined stored profiles. */
	getProfiles(): INamedProfile[];

	/** Returns the list of built-in read-only presets. */
	getPresets(): ICodeStylePreset[];

	/**
	 * Copies a preset into user storage under the preset's name (or a custom
	 * `targetName`) and switches the active profile to it.
	 */
	applyPreset(presetName: string, targetName?: string): Promise<void>;

	// --- Profile mutation ---

	/**
	 * Merges `partial` into the active profile and persists the result.
	 * Creates the active profile if it does not yet exist in storage.
	 */
	updateProfile(partial: Partial<ICodeStyleProfile>): Promise<void>;

	/** Switches the active profile to the one with the given `name`. */
	loadProfile(name: string): Promise<void>;

	/**
	 * Persists the current active profile's settings under a new (or existing)
	 * name and makes that the active profile.
	 */
	saveAsProfile(name: string): Promise<void>;

	/** Removes the profile with the given `name` from storage. */
	deleteProfile(name: string): Promise<void>;

	// --- Import / export ---

	/**
	 * Parses a JSON string produced by {@link exportToJSON} and merges the
	 * contained profiles into storage, overwriting any with the same name.
	 */
	importFromJSON(json: string): Promise<void>;

	/** Serialises all stored profiles to a JSON string. */
	exportToJSON(): string;

	// --- Scope ---

	/** Returns the persistence scope for configuration writes. */
	getScope(): 'workspace' | 'global';

	/** Persists the scope preference. */
	setScope(scope: 'workspace' | 'global'): Promise<void>;

	// --- Events ---

	/** Fired whenever the active profile changes (either by switching or by editing). */
	readonly onDidChangeProfile: Event<ICodeStyleProfile>;

	/**
	 * Forces all diagnostic providers to re-evaluate open documents against the
	 * current profile without mutating any configuration.
	 */
	revalidate(): void;
}
