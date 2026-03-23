/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as https from 'https';
import * as url from 'url';

const execFileAsync = promisify(execFile);

export interface NuGetPackage {
	id: string;
	version: string;
	description?: string;
	authors?: string[];
	totalDownloads?: number;
	verified?: boolean;
}

export interface InstalledPackage {
	id: string;
	version: string;
	requestedVersion?: string;
}

export interface NuGetSource {
	name: string;
	url: string;
	enabled: boolean;
}

function getDotnetPath(): string {
	return vscode.workspace.getConfiguration('csharpNugget').get<string>('dotnetPath', 'dotnet');
}

function getIncludePreRelease(): boolean {
	return vscode.workspace.getConfiguration('csharpNugget').get<boolean>('preReleasePackages', false);
}

function getSearchLimit(): number {
	return vscode.workspace.getConfiguration('csharpNugget').get<number>('searchResultsLimit', 20);
}

export function getSources(): NuGetSource[] {
	return vscode.workspace.getConfiguration('csharpNugget').get<NuGetSource[]>('sources', [
		{ name: 'nuget.org', url: 'https://api.nuget.org/v3/index.json', enabled: true }
	]);
}

export async function saveSources(sources: NuGetSource[]): Promise<void> {
	await vscode.workspace.getConfiguration('csharpNugget').update('sources', sources, vscode.ConfigurationTarget.Global);
}

export async function getInstalledPackages(csprojPath: string): Promise<InstalledPackage[]> {
	const dotnet = getDotnetPath();
	try {
		const { stdout } = await execFileAsync(dotnet, ['list', csprojPath, 'package', '--format', 'json']);
		return parseListOutput(stdout);
	} catch {
		// Fallback: parse .csproj XML directly
		return parseCSProjXml(csprojPath);
	}
}

function parseListOutput(output: string): InstalledPackage[] {
	try {
		const json = JSON.parse(output);
		const packages: InstalledPackage[] = [];
		if (json.projects) {
			for (const project of json.projects) {
				for (const framework of (project.frameworks ?? [])) {
					for (const pkg of (framework.topLevelPackages ?? [])) {
						if (!packages.find(p => p.id === pkg.id)) {
							packages.push({
								id: pkg.id,
								version: pkg.resolvedVersion ?? pkg.requestedVersion ?? '',
								requestedVersion: pkg.requestedVersion
							});
						}
					}
				}
			}
		}
		return packages;
	} catch {
		return [];
	}
}

async function parseCSProjXml(csprojPath: string): Promise<InstalledPackage[]> {
	const { readFile } = await import('fs/promises');
	try {
		const content = await readFile(csprojPath, 'utf-8');
		const packages: InstalledPackage[] = [];
		const regex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g;
		let match: RegExpExecArray | null;
		while ((match = regex.exec(content)) !== null) {
			packages.push({ id: match[1], version: match[2] });
		}
		return packages;
	} catch {
		return [];
	}
}

export async function searchPackages(query: string): Promise<NuGetPackage[]> {
	const sources = getSources().filter(s => s.enabled);
	if (sources.length === 0) {
		return [];
	}

	const preRelease = getIncludePreRelease();
	const limit = getSearchLimit();

	// Try each source and merge results
	for (const source of sources) {
		try {
			const results = await searchNuGetV3(source.url, query, limit, preRelease);
			if (results.length > 0) {
				return results;
			}
		} catch {
			// try next source
		}
	}
	return [];
}

function searchNuGetV3(sourceUrl: string, query: string, take: number, preRelease: boolean): Promise<NuGetPackage[]> {
	return new Promise((resolve, reject) => {
		// First, discover the search endpoint
		const indexUrl = url.parse(sourceUrl);
		const options: https.RequestOptions = {
			hostname: indexUrl.hostname,
			path: indexUrl.path,
			method: 'GET',
			headers: { 'Accept': 'application/json' }
		};

		const req = https.request(options, res => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => {
				try {
					const index = JSON.parse(data);
					const searchResource = index.resources?.find((r: { '@type': string; '@id': string }) =>
						r['@type'] === 'SearchQueryService' || r['@type'] === 'SearchQueryService/3.5.0'
					);
					if (!searchResource) {
						resolve([]);
						return;
					}
					doSearch(searchResource['@id'], query, take, preRelease).then(resolve).catch(reject);
				} catch (e) {
					reject(e);
				}
			});
		});
		req.on('error', reject);
		req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
		req.end();
	});
}

function doSearch(searchUrl: string, query: string, take: number, preRelease: boolean): Promise<NuGetPackage[]> {
	return new Promise((resolve, reject) => {
		const encodedQuery = encodeURIComponent(query);
		const fullUrl = url.parse(`${searchUrl}?q=${encodedQuery}&take=${take}&prerelease=${preRelease}&semVerLevel=2.0.0`);
		const options: https.RequestOptions = {
			hostname: fullUrl.hostname,
			path: fullUrl.path,
			method: 'GET',
			headers: { 'Accept': 'application/json' }
		};

		const req = https.request(options, res => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => {
				try {
					const result = JSON.parse(data);
					const packages: NuGetPackage[] = (result.data ?? []).map((pkg: {
						id: string;
						version: string;
						description?: string;
						authors?: string[];
						totalDownloads?: number;
						verified?: boolean;
					}) => ({
						id: pkg.id,
						version: pkg.version,
						description: pkg.description,
						authors: pkg.authors,
						totalDownloads: pkg.totalDownloads,
						verified: pkg.verified
					}));
					resolve(packages);
				} catch (e) {
					reject(e);
				}
			});
		});
		req.on('error', reject);
		req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
		req.end();
	});
}

export async function getPackageVersions(packageId: string): Promise<string[]> {
	const sources = getSources().filter(s => s.enabled);
	for (const source of sources) {
		try {
			const versions = await fetchPackageVersions(source.url, packageId);
			if (versions.length > 0) {
				return versions;
			}
		} catch {
			// try next
		}
	}
	return [];
}

function fetchPackageVersions(sourceUrl: string, packageId: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const indexUrl = url.parse(sourceUrl);
		const options: https.RequestOptions = {
			hostname: indexUrl.hostname,
			path: indexUrl.path,
			method: 'GET',
			headers: { 'Accept': 'application/json' }
		};

		const req = https.request(options, res => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => {
				try {
					const index = JSON.parse(data);
					const registrationResource = index.resources?.find((r: { '@type': string; '@id': string }) =>
						r['@type'] === 'RegistrationsBaseUrl' || r['@type'] === 'RegistrationsBaseUrl/3.6.0'
					);
					if (!registrationResource) {
						resolve([]);
						return;
					}
					const regUrl = `${registrationResource['@id']}${packageId.toLowerCase()}/index.json`;
					fetchRegistrationVersions(regUrl).then(resolve).catch(reject);
				} catch (e) {
					reject(e);
				}
			});
		});
		req.on('error', reject);
		req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
		req.end();
	});
}

function fetchRegistrationVersions(regUrl: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		const parsedUrl = url.parse(regUrl);
		const options: https.RequestOptions = {
			hostname: parsedUrl.hostname,
			path: parsedUrl.path,
			method: 'GET',
			headers: { 'Accept': 'application/json' }
		};

		const req = https.request(options, res => {
			let data = '';
			res.on('data', chunk => { data += chunk; });
			res.on('end', () => {
				try {
					const result = JSON.parse(data);
					const versions: string[] = [];
					for (const page of (result.items ?? [])) {
						for (const item of (page.items ?? [])) {
							const ver = item.catalogEntry?.version;
							if (ver) {
								versions.push(ver);
							}
						}
					}
					resolve(versions.reverse());
				} catch (e) {
					reject(e);
				}
			});
		});
		req.on('error', reject);
		req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
		req.end();
	});
}

export async function addPackage(csprojPath: string, packageId: string, version: string): Promise<string> {
	const dotnet = getDotnetPath();
	try {
		const { stdout, stderr } = await execFileAsync(dotnet, ['add', csprojPath, 'package', packageId, '--version', version]);
		return stdout || stderr;
	} catch (err: unknown) {
		if (err instanceof Error) {
			throw new Error(`Failed to add package: ${err.message}`);
		}
		throw err;
	}
}

export async function removePackage(csprojPath: string, packageId: string): Promise<string> {
	const dotnet = getDotnetPath();
	try {
		const { stdout, stderr } = await execFileAsync(dotnet, ['remove', csprojPath, 'package', packageId]);
		return stdout || stderr;
	} catch (err: unknown) {
		if (err instanceof Error) {
			throw new Error(`Failed to remove package: ${err.message}`);
		}
		throw err;
	}
}

export async function restorePackages(csprojPath: string): Promise<string> {
	const dotnet = getDotnetPath();
	try {
		const { stdout, stderr } = await execFileAsync(dotnet, ['restore', csprojPath]);
		return stdout || stderr;
	} catch (err: unknown) {
		if (err instanceof Error) {
			throw new Error(`Failed to restore packages: ${err.message}`);
		}
		throw err;
	}
}
