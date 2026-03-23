/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NuGetSource } from './nugetManager';

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/* Minimal inline SVGs – all use currentColor so they theme automatically */
const IC = {
	pkg: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2 8.186 1.113zm3.564 1.426L5.596 5 8 5.961 14.154 3.5l-2.404-.961zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923l6.5 2.6z"/></svg>`,
	search: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.656a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/></svg>`,
	add: `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>`,
	trash: `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`,
	restore: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>`,
	gear: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/></svg>`,
	verified: `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M10.067.87a2.89 2.89 0 0 0-4.134 0l-.622.638-.89-.011a2.89 2.89 0 0 0-2.924 2.924l.01.89-.636.622a2.89 2.89 0 0 0 0 4.134l.637.622-.011.89a2.89 2.89 0 0 0 2.924 2.924l.89-.01.622.636a2.89 2.89 0 0 0 4.134 0l.622-.637.89.011a2.89 2.89 0 0 0 2.924-2.924l-.01-.89.636-.622a2.89 2.89 0 0 0 0-4.134l-.637-.622.011-.89a2.89 2.89 0 0 0-2.924-2.924l-.89.01-.622-.636zm.287 5.984-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7 8.793l2.646-2.647a.5.5 0 0 1 .708.708z"/></svg>`,
	dl: `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>`,
	link: `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 9H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1z"/><path d="M9 5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6h3a2 2 0 1 1 0 4h-1.535a4.02 4.02 0 0 1-.82 1H12a3 3 0 1 0 0-6H9z"/></svg>`,
	close: `<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>`,
} as const;

export function getModalHtml(projectName: string, sources: NuGetSource[]): string {
	return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-ng001';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
svg{display:block;flex-shrink:0}
button,input,select{font:inherit;cursor:pointer}

body{
	font-family:var(--vscode-font-family);
	font-size:13px;
	color:var(--vscode-foreground);
	background:var(--vscode-editor-background);
	height:100vh;
	display:flex;
	flex-direction:column;
	overflow:hidden;
}

/* scrollbar */
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--vscode-scrollbarSlider-background);border-radius:2px}
::-webkit-scrollbar-thumb:hover{background:var(--vscode-scrollbarSlider-hoverBackground)}

.topbar{
	display:flex;
	align-items:center;
	gap:6px;
	padding:0 12px;
	height:35px;
	border-bottom:1px solid var(--vscode-panel-border);
	background:var(--vscode-editorGroupHeader-tabsBackground);
	flex-shrink:0;
}
.topbar-icon{opacity:.6;display:flex;align-items:center}
.topbar-project{
	font-size:12px;
	color:var(--vscode-foreground);
	opacity:.75;
	white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
	max-width:200px;
}
.topbar-gap{flex:1}

/* icon-only ghost button */
.tbtn{
	display:flex;align-items:center;gap:5px;
	height:24px;padding:0 7px;
	border:none;border-radius:3px;
	background:transparent;
	color:var(--vscode-foreground);
	opacity:.65;
	font-size:11px;
	white-space:nowrap;
	transition:opacity .1s,background .1s;
}
.tbtn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.tbtn.accent{
	background:var(--vscode-button-background);
	color:var(--vscode-button-foreground);
	opacity:1;
}
.tbtn.accent:hover{background:var(--vscode-button-hoverBackground)}

.tabs{
	display:flex;
	border-bottom:1px solid var(--vscode-panel-border);
	background:var(--vscode-editorGroupHeader-tabsBackground);
	flex-shrink:0;
}
.tab{
	display:flex;align-items:center;gap:5px;
	padding:0 16px;height:33px;
	font-size:12px;
	color:var(--vscode-tab-inactiveForeground);
	border-bottom:1px solid transparent;
	cursor:pointer;user-select:none;
	transition:color .1s;
}
.tab:hover{color:var(--vscode-tab-activeForeground)}
.tab.on{
	color:var(--vscode-tab-activeForeground);
	border-bottom-color:var(--vscode-focusBorder);
}
.tab svg{opacity:.55}
.tab.on svg{opacity:.8}
.cnt{
	font-size:10px;font-weight:600;
	min-width:16px;height:16px;padding:0 4px;
	border-radius:8px;line-height:16px;text-align:center;
	background:var(--vscode-badge-background);
	color:var(--vscode-badge-foreground);
}

.panels{flex:1;overflow:hidden;display:flex;flex-direction:column}
.panel{display:none;flex:1;overflow:hidden;flex-direction:column}
.panel.on{display:flex}

.search-row{
	display:flex;align-items:center;gap:7px;
	padding:7px 10px;
	border-bottom:1px solid var(--vscode-panel-border);
	flex-shrink:0;
}
.sfield{
	flex:1;display:flex;align-items:center;gap:6px;
	height:26px;padding:0 8px;
	background:var(--vscode-input-background);
	border:1px solid var(--vscode-input-border,var(--vscode-panel-border));
	border-radius:2px;
	transition:border-color .1s;
}
.sfield:focus-within{border-color:var(--vscode-focusBorder)}
.sfield svg{color:var(--vscode-input-placeholderForeground);flex-shrink:0}
.sfield input{
	flex:1;border:none;background:transparent;
	color:var(--vscode-input-foreground);
	font-size:12px;outline:none;min-width:0;
}
.sfield input::placeholder{color:var(--vscode-input-placeholderForeground)}
.pre-label{
	display:flex;align-items:center;gap:4px;
	font-size:11px;color:var(--vscode-descriptionForeground);
	white-space:nowrap;cursor:pointer;user-select:none;
}
.pre-label input{cursor:pointer;accent-color:var(--vscode-focusBorder);width:12px;height:12px}

.list{flex:1;overflow-y:auto}

.row{
	display:flex;align-items:center;gap:10px;
	padding:7px 12px;
	border-bottom:1px solid var(--vscode-list-inactiveSelectionBackground);
	cursor:default;
}
.row:hover{background:var(--vscode-list-hoverBackground)}
.row.sel{
	background:var(--vscode-list-activeSelectionBackground);
	color:var(--vscode-list-activeSelectionForeground);
	outline:none;
}
.row.sel .sub{color:inherit;opacity:.7}

.ricon{
	width:30px;height:30px;border-radius:4px;
	background:var(--vscode-badge-background);
	display:flex;align-items:center;justify-content:center;
	color:var(--vscode-badge-foreground);flex-shrink:0;
}
.rbody{flex:1;min-width:0}
.rname{
	display:flex;align-items:center;gap:6px;
	font-size:12px;font-weight:600;
}
.rname span{
	white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
	max-width:260px;
}
.ver{
	font-size:10px;padding:1px 6px;border-radius:10px;
	background:var(--vscode-badge-background);
	color:var(--vscode-badge-foreground);
	white-space:nowrap;flex-shrink:0;
}
.sub{
	font-size:11px;color:var(--vscode-descriptionForeground);
	margin-top:2px;
	white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.meta{
	display:flex;align-items:center;gap:3px;
	font-size:10px;color:var(--vscode-descriptionForeground);
	margin-top:2px;opacity:.8;
}
.vbadge{color:var(--vscode-terminal-ansiBlue);display:flex;align-items:center}
.rside{display:flex;align-items:center;gap:4px;flex-shrink:0}

.abtn{
	display:flex;align-items:center;gap:4px;
	height:22px;padding:0 8px;
	border:none;border-radius:2px;
	background:transparent;
	color:var(--vscode-foreground);
	font-size:11px;opacity:.6;
	white-space:nowrap;
	transition:opacity .1s,background .1s,color .1s;
}
.abtn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.abtn.add{
	background:var(--vscode-button-background);
	color:var(--vscode-button-foreground);
	opacity:1;
}
.abtn.add:hover{background:var(--vscode-button-hoverBackground)}
.abtn.del:hover{
	background:var(--vscode-inputValidation-errorBackground,rgba(255,65,54,.1));
	color:var(--vscode-errorForeground);opacity:1;
}

.detail{
	border-top:1px solid var(--vscode-panel-border);
	background:var(--vscode-editorWidget-background);
	padding:9px 12px;flex-shrink:0;
}
.detail-top{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.detail-name{font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vsel{
	height:22px;padding:0 5px;
	background:var(--vscode-dropdown-background);
	color:var(--vscode-dropdown-foreground);
	border:1px solid var(--vscode-dropdown-border);
	border-radius:2px;font-size:11px;outline:none;
}
.vsel:focus{border-color:var(--vscode-focusBorder)}
.detail-meta{font-size:11px;color:var(--vscode-descriptionForeground);display:flex;gap:12px;flex-wrap:wrap}
.detail-meta span{display:flex;align-items:center;gap:3px}

.empty{
	flex:1;display:flex;flex-direction:column;
	align-items:center;justify-content:center;
	gap:9px;padding:24px;
	color:var(--vscode-descriptionForeground);
	text-align:center;font-size:12px;
}
.empty svg{opacity:.25}
.spin{
	width:18px;height:18px;
	border:1.5px solid var(--vscode-panel-border);
	border-top-color:var(--vscode-progressBar-background);
	border-radius:50%;
	animation:spin .6s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}

.src-list{flex:1;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
.src-row{
	display:flex;align-items:center;gap:8px;
	padding:6px 9px;border-radius:2px;
	border:1px solid var(--vscode-panel-border);
	background:var(--vscode-input-background);
	transition:border-color .1s;
}
.src-row:hover{border-color:var(--vscode-focusBorder)}
/* toggle pill */
.pill{position:relative;width:26px;height:14px;flex-shrink:0}
.pill input{opacity:0;width:0;height:0;position:absolute}
.pill-track{
	position:absolute;inset:0;border-radius:7px;
	background:var(--vscode-panel-border);
	transition:background .15s;
}
.pill input:checked+.pill-track{background:var(--vscode-button-background)}
.pill-dot{
	position:absolute;top:2px;left:2px;
	width:10px;height:10px;border-radius:50%;
	background:#fff;
	box-shadow:0 1px 2px rgba(0,0,0,.25);
	transition:transform .15s;
}
.pill input:checked~.pill-dot{transform:translateX(12px)}
.src-info{flex:1;min-width:0}
.src-name{font-size:12px;font-weight:600}
.src-url{font-size:11px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.add-row{
	display:flex;align-items:center;gap:7px;
	padding:7px 10px;
	border-top:1px solid var(--vscode-panel-border);
	flex-shrink:0;
}
.finput{
	height:24px;padding:0 7px;
	background:var(--vscode-input-background);
	color:var(--vscode-input-foreground);
	border:1px solid var(--vscode-input-border,var(--vscode-panel-border));
	border-radius:2px;font-size:12px;outline:none;
	transition:border-color .1s;
}
.finput:focus{border-color:var(--vscode-focusBorder)}
.finput::placeholder{color:var(--vscode-input-placeholderForeground)}

.sbar{
	display:flex;align-items:center;gap:6px;
	padding:0 10px;height:20px;
	background:var(--vscode-statusBar-background);
	color:var(--vscode-statusBar-foreground);
	font-size:11px;flex-shrink:0;
}
.sspin{
	width:9px;height:9px;
	border:1.5px solid currentColor;border-top-color:transparent;
	border-radius:50%;animation:spin .6s linear infinite;
	opacity:.7;display:none;
}
.sspin.on{display:block}
.smsg{flex:1;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style>
</head>
<body>

<!-- top bar -->
<div class="topbar">
	<span class="topbar-icon">${IC.pkg}</span>
	<span class="topbar-project" title="${escapeHtml(projectName)}">${escapeHtml(projectName)}</span>
	<div class="topbar-gap"></div>
	<button class="tbtn" id="btn-restore">${IC.restore} Restore</button>
	<button class="tbtn accent" id="btn-settings">${IC.gear} Settings</button>
</div>

<!-- tabs -->
<div class="tabs">
	<div class="tab on" data-tab="installed">${IC.pkg} Installed <span class="cnt" id="cnt-installed" style="display:none"></span></div>
	<div class="tab" data-tab="browse">${IC.search} Browse</div>
	<div class="tab" data-tab="sources">${IC.link} Sources <span class="cnt" id="cnt-sources"></span></div>
</div>

<!-- panels -->
<div class="panels">

	<!-- installed -->
	<div class="panel on" id="panel-installed">
		<div class="list" id="list-installed">
			<div class="empty" id="loading-installed"><div class="spin"></div><span>Loading…</span></div>
		</div>
	</div>

	<!-- browse -->
	<div class="panel" id="panel-browse">
		<div class="search-row">
			<div class="sfield">
				${IC.search}
				<input id="inp-search" type="text" placeholder="Search NuGet packages…" autocomplete="off" spellcheck="false">
			</div>
			<label class="pre-label"><input type="checkbox" id="chk-pre"> Pre-release</label>
			<button class="tbtn accent" id="btn-search">${IC.search} Search</button>
		</div>
		<div class="list" id="list-browse">
			<div class="empty">
				<svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2 8.186 1.113zm3.564 1.426L5.596 5 8 5.961 14.154 3.5l-2.404-.961zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923l6.5 2.6z"/></svg>
				<span>Search to find packages</span>
			</div>
		</div>
		<div id="detail" style="display:none"></div>
	</div>

	<!-- sources -->
	<div class="panel" id="panel-sources">
		<div class="src-list" id="list-sources"></div>
		<div class="add-row">
			<input class="finput" id="inp-src-name" type="text" placeholder="Name" style="width:110px;flex-shrink:0">
			<input class="finput" id="inp-src-url" type="url" placeholder="https://…/index.json" style="flex:1">
			<button class="tbtn accent" id="btn-add-src">${IC.add} Add</button>
		</div>
	</div>

</div>

<!-- status bar -->
<div class="sbar">
	<div class="sspin" id="spin"></div>
	<span class="smsg" id="smsg">Ready</span>
</div>

<script nonce="ng001">
(function(){
'use strict';
const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const post = m => vscode.postMessage(m);
const fmt = n => !n ? null : n>=1e9 ? (n/1e9).toFixed(1)+'B' : n>=1e6 ? (n/1e6).toFixed(1)+'M' : n>=1e3 ? Math.round(n/1e3)+'K' : String(n);

let installed=[], results=[], sources=${JSON.stringify(sources)}, selPkg=null, selVers={};

function status(msg, loading){
	$('smsg').textContent=msg;
	$('spin').classList.toggle('on',!!loading);
}

// tabs
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
	document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
	document.querySelectorAll('.panel').forEach(x=>x.classList.remove('on'));
	t.classList.add('on');
	$('panel-'+t.dataset.tab).classList.add('on');
}));

function renderInstalled(){
	const el=$('list-installed'), badge=$('cnt-installed');
	if(!installed.length){
		badge.style.display='none';
		el.innerHTML='<div class="empty"><svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2 8.186 1.113zm3.564 1.426L5.596 5 8 5.961 14.154 3.5l-2.404-.961zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923l6.5 2.6z"/></svg><span>No packages installed</span></div>';
		return;
	}
	badge.textContent=installed.length; badge.style.display='';
	el.innerHTML=installed.map(p=>\`
<div class="row" data-id="\${esc(p.id)}">
	<div class="ricon"><svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2 8.186 1.113zm3.564 1.426L5.596 5 8 5.961 14.154 3.5l-2.404-.961zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923l6.5 2.6z"/></svg></div>
	<div class="rbody">
    <div class="rname"><span>\${esc(p.id)}</span><span class="ver">\${esc(p.version)}</span></div>
</div>
<div class="rside">
    <button class="abtn del btn-rm" data-id="\${esc(p.id)}" title="Remove">
    	<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
    	Remove
    </button>
</div>
</div>\`).join('');
	el.querySelectorAll('.btn-rm').forEach(b=>b.addEventListener('click',e=>{
		e.stopPropagation();
		status('Removing '+b.dataset.id+'…',true);
		post({type:'removePackage',packageId:b.dataset.id});
	}));
}

function renderBrowse(){
	const el=$('list-browse');
	if(!results.length){
		el.innerHTML='<div class="empty"><svg width="36" height="36" viewBox="0 0 16 16" fill="currentColor"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2 8.186 1.113zm3.564 1.426L5.596 5 8 5.961 14.154 3.5l-2.404-.961zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923l6.5 2.6z"/></svg><span>Search to find packages</span></div>';
		return;
	}
	el.innerHTML=results.map(p=>{
		const dl=fmt(p.totalDownloads);
		return \`<div class="row \${selPkg===p.id?'sel':''}" data-id="\${esc(p.id)}">
<div class="ricon"><svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8.186 1.113a.5.5 0 0 0-.372 0L1.846 3.5l2.404.961L10.404 2 8.186 1.113zm3.564 1.426L5.596 5 8 5.961 14.154 3.5l-2.404-.961zm3.25 1.7-6.5 2.6v7.922l6.5-2.6V4.24zM7.5 14.762V6.838L1 4.239v7.923l6.5 2.6z"/></svg></div>
<div class="rbody">
    <div class="rname">
    	<span>\${esc(p.id)}</span>
    	\${p.verified?'<span class="vbadge" title="Verified"><svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M10.067.87a2.89 2.89 0 0 0-4.134 0l-.622.638-.89-.011a2.89 2.89 0 0 0-2.924 2.924l.01.89-.636.622a2.89 2.89 0 0 0 0 4.134l.637.622-.011.89a2.89 2.89 0 0 0 2.924 2.924l.89-.01.622.636a2.89 2.89 0 0 0 4.134 0l.622-.637.89.011a2.89 2.89 0 0 0 2.924-2.924l-.01-.89.636-.622a2.89 2.89 0 0 0 0-4.134l-.637-.622.011-.89a2.89 2.89 0 0 0-2.924-2.924l-.89.01-.622-.636zm.287 5.984-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7 8.793l2.646-2.647a.5.5 0 0 1 .708.708z"/></svg></span>':''}
    	<span class="ver">\${esc(p.version)}</span>
    </div>
    \${p.description?'<div class="sub">'+esc(p.description)+'</div>':''}
    \${dl?'<div class="meta"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>'+esc(dl)+'</div>':''}
</div>
<div class="rside">
    <button class="abtn add btn-add" data-id="\${esc(p.id)}" data-ver="\${esc(p.version)}">
    	<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
    	Add
    </button>
	</div>
</div>\`;
	}).join('');

	el.querySelectorAll('.row').forEach(r=>r.addEventListener('click',e=>{
		if(e.target.closest('.abtn')){return;}
		selPkg=r.dataset.id; renderBrowse(); openDetail(r.dataset.id);
	}));
	el.querySelectorAll('.btn-add').forEach(b=>b.addEventListener('click',e=>{
		e.stopPropagation();
		const ver=selVers[b.dataset.id]||b.dataset.ver;
		status('Adding '+b.dataset.id+'…',true);
		post({type:'addPackage',packageId:b.dataset.id,version:ver});
	}));
}

function openDetail(id){
	const d=$('detail');
	d.style.display='block';
	d.innerHTML='<div class="detail"><span style="font-size:11px;color:var(--vscode-descriptionForeground)">Fetching versions…</span></div>';
	post({type:'getVersions',packageId:id});
}

function renderSources(){
	const el=$('list-sources'), badge=$('cnt-sources');
	badge.textContent=sources.length;
	if(!sources.length){
		el.innerHTML='<div class="empty"><svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor"><path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9c-.086 0-.17.01-.25.031A2 2 0 0 1 7 9H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1z"/><path d="M9 5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6h3a2 2 0 1 1 0 4h-1.535a4.02 4.02 0 0 1-.82 1H12a3 3 0 1 0 0-6H9z"/></svg><span>No sources configured</span></div>';
		return;
	}
	el.innerHTML=sources.map((s,i)=>\`
<div class="src-row">
	<label class="pill">
    	<input type="checkbox" class="src-chk" data-i="\${i}" \${s.enabled?'checked':''}>
    	<div class="pill-track"></div>
    	<div class="pill-dot"></div>
	</label>
	<div class="src-info">
    	<div class="src-name">\${esc(s.name)}</div>
    	<div class="src-url">\${esc(s.url)}</div>
</div>
<button class="abtn del btn-del-src" data-i="\${i}" title="Remove">
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
</button>
</div>\`).join('');
	el.querySelectorAll('.src-chk').forEach(c=>c.addEventListener('change',()=>{
		sources[+c.dataset.i].enabled=c.checked; renderSources(); post({type:'saveSources',sources});
	}));
	el.querySelectorAll('.btn-del-src').forEach(b=>b.addEventListener('click',()=>{
		sources.splice(+b.dataset.i,1); renderSources(); post({type:'saveSources',sources});
	}));
}

$('btn-add-src').addEventListener('click',()=>{
	const n=$('inp-src-name').value.trim(), u=$('inp-src-url').value.trim();
	if(!n||!u){return;}
	sources.push({name:n,url:u,enabled:true});
	$('inp-src-name').value=''; $('inp-src-url').value='';
	renderSources(); post({type:'saveSources',sources});
});

function doSearch(){
	const q=$('inp-search').value.trim();
	if(!q){return;}
	$('list-browse').innerHTML='<div class="empty"><div class="spin"></div><span>Searching…</span></div>';
	$('detail').style.display='none';
	status('Searching "'+q+'"…',true);
	post({type:'search',query:q,preRelease:$('chk-pre').checked});
}
$('btn-search').addEventListener('click',doSearch);
$('inp-search').addEventListener('keydown',e=>{if(e.key==='Enter'){doSearch();}});

$('btn-restore').addEventListener('click',()=>{status('Restoring…',true);post({type:'restore'});});
$('btn-settings').addEventListener('click',()=>post({type:'openSettings'}));

window.addEventListener('message',e=>{
	const m=e.data;
	switch(m.type){
		case 'installedPackages':
			installed=m.packages;
			$('loading-installed')?.remove();
			renderInstalled();
			status(installed.length+' package'+(installed.length!==1?'s':'')+' installed',false);
			break;
		case 'searchResults':
			results=m.packages; selPkg=null;
			renderBrowse();
			$('detail').style.display='none';
			status(results.length+' result'+(results.length!==1?'s':'')+' found',false);
			break;
		case 'versions':{
			const pkg=results.find(p=>p.id===m.packageId);
			if(!pkg){break;}
			const cur=selVers[m.packageId]||pkg.version;
			const opts=m.versions.map(v=>'<option value="'+esc(v)+'"'+(v===cur?' selected':'')+'>'+esc(v)+'</option>').join('');
			const dl=fmt(pkg.totalDownloads);
			$('detail').innerHTML=\`<div class="detail">
<div class="detail-top">
    <span class="detail-name">\${esc(pkg.id)}</span>
    <select class="vsel" id="vsel">\${opts}</select>
    <button class="abtn add" id="btn-detail-add">
    	<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
    	Add to project
    </button>
</div>
<div class="detail-meta">
    \${pkg.authors&&pkg.authors.length?'<span>by '+esc(pkg.authors.join(', '))+'</span>':''}
    \${dl?'<span><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>'+esc(dl)+' downloads</span>':''}
</div>
</div>\`;
			$('vsel').addEventListener('change',ev=>{selVers[m.packageId]=ev.target.value;});
			$('btn-detail-add').addEventListener('click',()=>{
				const ver=$('vsel').value;
				status('Adding '+m.packageId+'@'+ver+'…',true);
				post({type:'addPackage',packageId:m.packageId,version:ver});
			});
			break;
		}
		case 'packageAdded':
			installed=m.packages; renderInstalled(); status(m.packageId+' added',false); break;
		case 'packageRemoved':
			installed=m.packages; renderInstalled(); status(m.packageId+' removed',false); break;
		case 'restored':
			status('Restored',false); break;
		case 'error':
			status('Error: '+m.message,false); break;
		case 'sourcesUpdated':
			sources=m.sources; renderSources(); status('Sources saved',false); break;
	}
});

// init
renderSources();
post({type:'getInstalled'});
status('Loading…',true);
})();
</script>
</body>
</html>`;
}
