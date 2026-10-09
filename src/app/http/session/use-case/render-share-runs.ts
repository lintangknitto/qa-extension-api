import { escapeHtml } from '@/libs/helpers/escapeHtml';

export interface IShareRun {
	run_number: number;
	kind: string;
	result: string | null;
	actual_result: string | null;
	video_url: string | null;
	video_file_name: string;
}

export interface IShareTabSwitch {
	sequence: number;
	title: string | null;
	url: string | null;
	timestamp?: string;
}

const RESULT_STYLE: Record<string, { color: string; label: string }> = {
	PASS: { color: '#15803d', label: 'PASSED' },
	FAIL: { color: '#b91c1c', label: 'FAILED' },
	BLOCKED: { color: '#c2410c', label: 'BLOCKED' }
};

const runLabel = (run: IShareRun): string => `Run #${run.run_number}${run.kind === 'original' ? ' (Asli)' : ''}`;

const renderRunPanel = (run: IShareRun, selected: boolean): string => {
	const style = RESULT_STYLE[run.result ?? ''] ?? { color: '#334155', label: run.result || '-' };
	const video = run.video_url
		? `<div class="video-box"><video src="${escapeHtml(run.video_url)}" controls preload="metadata"></video></div>
			<div style="display:flex; gap:8px; margin-top:8px;">
				<a class="run-download" href="${escapeHtml(run.video_url)}" download="${escapeHtml(run.video_file_name)}" data-file-name="${escapeHtml(run.video_file_name)}" onclick="return downloadRunVideo(event, this)" style="font-size: 12px; color: var(--primary); font-weight: 600;">Download</a>
				<a href="${escapeHtml(run.video_url)}" target="_blank" rel="noreferrer" style="font-size: 12px; color: var(--primary); font-weight: 600;">Buka Tab Baru</a>
			</div>`
		: `<div class="video-empty">
				<span style="font-weight:600; color:#334155;">Tidak ada video terunggah untuk run ini.</span>
				<span style="font-size:11px;">Run ini tidak merekam video atau video belum selesai diunggah.</span>
			</div>`;
	return `<div class="run-panel" role="tabpanel" id="run-panel-${run.run_number}" aria-hidden="${selected ? 'false' : 'true'}"${selected ? '' : ' hidden'}>
			<div style="font-size: 12px; margin-bottom: 8px;">
				<span style="font-weight: 800; color: ${style.color};">${escapeHtml(style.label)}</span>
				<span style="color: var(--text-muted);"> · ${escapeHtml(run.actual_result || '-')}</span>
			</div>
			${video}
		</div>`;
};

/** Tab per run (Run #1 default); sesi tanpa riwayat run memakai `fallback` sebagai Run #1. */
export const renderRunsSection = (runs: IShareRun[], fallback: IShareRun): string => {
	const list = runs.length > 0 ? runs : [fallback];
	const defaultRun = list[0].run_number;
	const tabs = list.length > 1
		? `<div class="tab-list" role="tablist" aria-label="Riwayat run">${list
			.map(
				(run) => `<button class="tab-button run-tab" role="tab" id="run-tab-${run.run_number}" aria-controls="run-panel-${run.run_number}" aria-selected="${run.run_number === defaultRun ? 'true' : 'false'}" onclick="selectRun(${run.run_number})">${escapeHtml(runLabel(run))}</button>`
			)
			.join('')}</div>`
		: '';
	return `${tabs}${list.map((run) => renderRunPanel(run, run.run_number === defaultRun)).join('')}`;
};

export const renderTabSwitches = (switches: IShareTabSwitch[]): string => {
	if (switches.length === 0) return '';
	return `<ol class="timeline" aria-label="Perpindahan tab">${switches
		.map((item) => {
			let host = '';
			try {
				host = item.url ? new URL(item.url).host : '';
			} catch {
				host = item.url ?? '';
			}
			return `<li class="timeline-item tab-switch">
					<div class="timeline-node">⇄</div>
					<div class="timeline-text">Pindah ke tab: ${escapeHtml(item.title || host || '-')}${item.title && host ? ` <span style="color: var(--text-muted);">(${escapeHtml(host)})</span>` : ''}</div>
				</li>`;
		})
		.join('')}</ol>`;
};

/** Download lewat blob: atribut `download` diabaikan untuk URL MinIO beda origin. Gagal fetch → buka link langsung. */
export const RUNS_SCRIPT = `
		function selectRun(runNumber) {
			document.querySelectorAll('.run-tab').forEach(function (btn) {
				btn.setAttribute('aria-selected', btn.id === 'run-tab-' + runNumber ? 'true' : 'false');
			});
			document.querySelectorAll('.run-panel').forEach(function (panel) {
				var active = panel.id === 'run-panel-' + runNumber;
				panel.hidden = !active;
				panel.setAttribute('aria-hidden', active ? 'false' : 'true');
				if (!active) panel.querySelectorAll('video').forEach(function (v) { v.pause(); });
			});
		}

		function downloadRunVideo(event, link) {
			event.preventDefault();
			var href = link.href;
			var name = link.getAttribute('data-file-name') || 'video.webm';
			fetch(href).then(function (res) {
				if (!res.ok) throw new Error('HTTP ' + res.status);
				return res.blob();
			}).then(function (blob) {
				var url = URL.createObjectURL(blob);
				var a = document.createElement('a');
				a.href = url;
				a.download = name;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
			}).catch(function () {
				window.open(href, '_blank', 'noopener');
			});
			return false;
		}
`;
