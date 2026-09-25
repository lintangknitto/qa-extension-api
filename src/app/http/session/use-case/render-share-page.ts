/* eslint-disable complexity, @typescript-eslint/no-base-to-string */
import { getShareContextUseCase } from './get-share-context.use-case';

export const renderShareHtml = async (shareToken: string, hostUrl?: string): Promise<string> => {
	const data = await getShareContextUseCase(shareToken);
	const s = data.session;
	const safeJson = JSON.stringify(data).replace(/</g, '\\u003c');
	const baseUrl = hostUrl || 'http://127.0.0.1:8010';
	const aiContextEndpoint = `${baseUrl}/api/v1/sessions/share/${shareToken}/ai-context`;

	const statusColor =
		s.result === 'PASS'
			? { bg: '#dcfce7', text: '#15803d', border: '#86efac', label: 'PASSED' }
			: s.result === 'FAIL'
				? { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', label: 'FAILED' }
				: { bg: '#ffedd5', text: '#c2410c', border: '#fdba74', label: String(s.result || s.status || 'RECORDED') };

	const dateStr = s.created_at ? new Date(String(s.created_at)).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

	const testCaseNo = String(s.test_case_no || 'UNTRACKED');
	const title = String(s.title || '');
	const status = String(s.result || s.status || '');
	const projName = String(s.project_name || s.id_project || '-');
	const projCode = String(s.project_code || '-');
	const targetUrl = String(s.target_url || '-');
	const actualRes = String(s.actual_result || 'None recorded');

	// Generate structured markdown context for AI agents
	const aiPromptMarkdown = `
# QA Test Incident Report: ${testCaseNo} — ${title}
**Status:** ${status}  
**Project:** ${projName} (${projCode})  
**Target URL:** ${targetUrl}  
**Recorded At:** ${dateStr}  
**Actual Result / Bug Description:** ${actualRes}

## 1. Failed HTTP Requests (${data.failed_requests.length})
${
	data.failed_requests.length === 0
		? '_No HTTP 4xx/5xx requests detected._'
		: data.failed_requests
			.map(
				(r) => `
- **[${r.method}]** \`${r.url}\` ➔ Status **${r.status} ${r.status_text || ''}**
  - **Request Body:**
\`\`\`json
${JSON.stringify(r.request_body ?? null, null, 2)}
\`\`\`
  - **Response Body:**
\`\`\`json
${JSON.stringify(r.response_body ?? null, null, 2)}
\`\`\`
`
			)
			.join('\n')
}

## 2. Console & Error Traces (${data.console_logs.length})
${
	data.console_logs.length === 0
		? '_No console errors captured._'
		: data.console_logs.map((c) => `- \`[${c.type.toUpperCase()}]\` ${c.message}`).join('\n')
}

## 3. Repro Checkpoints (${data.checkpoints.length} Steps)
${
	data.checkpoints.length === 0
		? '_No manual checkpoints recorded._'
		: data.checkpoints.map((cp, idx) => `${idx + 1}. ${cp.note}`).join('\n')
}

## 4. Playwright Reproduction Script
\`\`\`typescript
${data.playwright_script || '// Script not generated yet'}
\`\`\`
`.trim();

	const safeAiPrompt = JSON.stringify(aiPromptMarkdown).replace(/</g, '\\u003c');
	const safePlaywrightScript = JSON.stringify(data.playwright_script || '').replace(/</g, '\\u003c');
	const safeTestCaseId = JSON.stringify(s.test_case_no || 'test').replace(/</g, '\\u003c');

	return `<!DOCTYPE html>
<html lang="id">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Knitto QA Debugger — ${escapeHtml(s.test_case_no || '')} ${escapeHtml(s.title || '')}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
	<style>
		:root {
			--primary: #2F3574;
			--primary-hover: #24295e;
			--primary-light: #eef2ff;
			--primary-border: #c7d2fe;
			--bg-app: #f8fafc;
			--text-main: #0f172a;
			--text-muted: #64748b;
			--text-light: #94a3b8;
			--border: #e2e8f0;
			--border-strong: #cbd5e1;
			--card: #ffffff;
			--radius-sm: 6px;
			--radius-md: 10px;
			--radius-lg: 14px;
			--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
			--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05);
			--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.05);
		}

		* { box-sizing: border-box; margin: 0; padding: 0; }
		body {
			font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
			background: var(--bg-app);
			color: var(--text-main);
			line-height: 1.5;
			padding: 24px 16px;
			-webkit-font-smoothing: antialiased;
		}

		.container { max-width: 1240px; margin: 0 auto; }

		/* Header Section */
		.header-card {
			background: var(--card);
			border: 1px solid var(--border);
			border-radius: var(--radius-lg);
			padding: 24px;
			margin-bottom: 20px;
			box-shadow: var(--shadow-sm);
		}
		.brand-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 14px;
		}
		.brand-badge {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			background: var(--primary-light);
			color: var(--primary);
			font-weight: 800;
			font-size: 11px;
			padding: 4px 10px;
			border-radius: var(--radius-sm);
			letter-spacing: 0.5px;
			border: 1px solid var(--primary-border);
		}
		.title-row {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			flex-wrap: wrap;
			gap: 16px;
		}
		.test-case-id {
			font-family: 'JetBrains Mono', monospace;
			background: #f1f5f9;
			color: #1e293b;
			padding: 3px 8px;
			border-radius: 6px;
			font-size: 13px;
			font-weight: 700;
			border: 1px solid var(--border);
			display: inline-block;
			margin-bottom: 6px;
		}
		.title-text {
			font-size: 22px;
			font-weight: 800;
			color: #0f172a;
			letter-spacing: -0.3px;
		}
		.badge-status {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 6px 14px;
			border-radius: 9999px;
			font-weight: 700;
			font-size: 12px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}

		/* Meta Grid */
		.meta-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
			gap: 14px;
			margin-top: 18px;
			padding-top: 16px;
			border-top: 1px solid var(--border);
		}
		.meta-item { display: flex; flex-direction: column; gap: 2px; }
		.meta-label {
			color: var(--text-muted);
			font-size: 11px;
			text-transform: uppercase;
			font-weight: 700;
			letter-spacing: 0.4px;
		}
		.meta-value {
			font-size: 13px;
			font-weight: 600;
			color: #1e293b;
			word-break: break-all;
		}
		.meta-value.mono {
			font-family: 'JetBrains Mono', monospace;
			font-size: 12px;
		}

		/* Action Toolbar */
		.toolbar {
			display: flex;
			gap: 10px;
			flex-wrap: wrap;
			margin-top: 20px;
			padding-top: 16px;
			border-top: 1px solid var(--border);
		}
		.btn {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 8px 16px;
			border-radius: var(--radius-sm);
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
			border: 1px solid transparent;
			transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
			text-decoration: none;
			user-select: none;
		}
		.btn:active { transform: scale(0.98); }
		.btn-ai {
			background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
			color: #ffffff;
			border: none;
			box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
		}
		.btn-ai:hover { opacity: 0.95; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4); }
		.btn-primary { background: var(--primary); color: #ffffff; }
		.btn-primary:hover { background: var(--primary-hover); }
		.btn-outline { background: #ffffff; border-color: var(--border-strong); color: #334155; }
		.btn-outline:hover { background: #f8fafc; border-color: #94a3b8; }
		.btn.copied {
			background: #15803d !important;
			color: #ffffff !important;
			border-color: #15803d !important;
		}

		/* Main Layout Grid */
		.layout-grid {
			display: grid;
			grid-template-columns: 1fr;
			gap: 20px;
		}
		@media (min-width: 960px) {
			.layout-grid { grid-template-columns: 440px 1fr; }
		}

		/* Cards */
		.card {
			background: var(--card);
			border: 1px solid var(--border);
			border-radius: var(--radius-lg);
			padding: 20px;
			box-shadow: var(--shadow-sm);
			margin-bottom: 20px;
		}
		.card-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 14px;
		}
		.card-title {
			font-size: 15px;
			font-weight: 700;
			color: #0f172a;
			display: flex;
			align-items: center;
			gap: 8px;
		}

		/* Video Player */
		.video-box {
			background: #090d16;
			border-radius: var(--radius-md);
			overflow: hidden;
			position: relative;
			box-shadow: var(--shadow-md);
			aspect-ratio: 16/9;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		video { width: 100%; height: 100%; object-fit: contain; display: block; }
		.video-empty {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 8px;
			padding: 32px 16px;
			background: #f8fafc;
			border: 1.5px dashed var(--border-strong);
			border-radius: var(--radius-md);
			color: var(--text-muted);
			font-size: 12px;
			text-align: center;
		}

		/* Checkpoints Timeline */
		.timeline { list-style: none; padding-left: 24px; position: relative; margin-top: 8px; }
		.timeline::before {
			content: '';
			position: absolute;
			left: 8px;
			top: 6px;
			bottom: 6px;
			width: 2px;
			background: var(--border);
		}
		.timeline-item {
			position: relative;
			margin-bottom: 16px;
		}
		.timeline-item:last-child { margin-bottom: 0; }
		.timeline-node {
			position: absolute;
			left: -24px;
			top: 2px;
			width: 18px;
			height: 18px;
			border-radius: 50%;
			background: #ffffff;
			border: 2px solid var(--primary);
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 9px;
			font-weight: 800;
			color: var(--primary);
		}
		.timeline-text { font-size: 13px; font-weight: 500; color: #1e293b; line-height: 1.4; }

		/* Accessible Tabs */
		.tab-list {
			display: flex;
			gap: 4px;
			background: #f1f5f9;
			padding: 4px;
			border-radius: var(--radius-md);
			border: 1px solid var(--border);
			margin-bottom: 16px;
			overflow-x: auto;
		}
		.tab-button {
			display: inline-flex;
			align-items: center;
			gap: 6px;
			padding: 8px 14px;
			font-size: 12px;
			font-weight: 600;
			border: none;
			background: transparent;
			color: var(--text-muted);
			border-radius: var(--radius-sm);
			cursor: pointer;
			white-space: nowrap;
			transition: all 0.15s ease;
		}
		.tab-button[aria-selected="true"] {
			background: #ffffff;
			color: var(--primary);
			font-weight: 700;
			box-shadow: 0 1px 3px rgba(0,0,0,0.06);
		}
		.tab-panel { display: none; }
		.tab-panel[aria-hidden="false"] { display: block; }

		/* Network List */
		.filter-bar {
			display: flex;
			gap: 8px;
			margin-bottom: 12px;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
		}
		.search-input {
			padding: 6px 12px;
			border: 1px solid var(--border-strong);
			border-radius: var(--radius-sm);
			font-size: 12px;
			background: #ffffff;
			outline: none;
			width: 220px;
		}
		.search-input:focus { border-color: var(--primary); }

		.req-item {
			border: 1px solid var(--border);
			border-radius: var(--radius-md);
			background: #ffffff;
			margin-bottom: 8px;
			overflow: hidden;
			transition: border-color 0.15s ease;
		}
		.req-item:hover { border-color: var(--border-strong); }
		.req-item.has-error { border-left: 4px solid #ef4444; }
		.req-header {
			padding: 10px 14px;
			display: flex;
			justify-content: space-between;
			align-items: center;
			cursor: pointer;
			user-select: none;
			gap: 10px;
		}
		.method-tag {
			font-family: 'JetBrains Mono', monospace;
			font-size: 10px;
			font-weight: 800;
			padding: 2px 6px;
			border-radius: 4px;
			color: #ffffff;
		}
		.m-POST { background: #2563eb; }
		.m-GET { background: #16a34a; }
		.m-PUT { background: #d97706; }
		.m-DELETE { background: #dc2626; }
		.m-PATCH { background: #7c3aed; }
		.m-OTHER { background: #64748b; }

		.status-tag {
			font-family: 'JetBrains Mono', monospace;
			font-size: 11px;
			font-weight: 700;
			padding: 2px 6px;
			border-radius: 4px;
		}
		.st-2xx { background: #dcfce7; color: #166534; }
		.st-4xx, .st-5xx { background: #fee2e2; color: #991b1b; }
		.req-url {
			font-family: 'JetBrains Mono', monospace;
			font-size: 12px;
			color: #1e293b;
			word-break: break-all;
			flex: 1;
		}
		.req-body-box {
			display: none;
			padding: 12px 14px;
			background: #f8fafc;
			border-top: 1px solid var(--border);
		}
		.req-body-box.open { display: block; }

		/* Code Block */
		.code-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			background: #1e293b;
			padding: 8px 14px;
			border-top-left-radius: var(--radius-md);
			border-top-right-radius: var(--radius-md);
			color: #94a3b8;
			font-size: 12px;
			font-family: 'JetBrains Mono', monospace;
		}
		pre.code-viewer {
			background: #0f172a;
			color: #f8fafc;
			padding: 14px;
			border-bottom-left-radius: var(--radius-md);
			border-bottom-right-radius: var(--radius-md);
			font-family: 'JetBrains Mono', monospace;
			font-size: 12px;
			line-height: 1.6;
			overflow-x: auto;
			max-height: 500px;
		}

		/* Toast Banner */
		#toast-container {
			position: fixed;
			bottom: 24px;
			right: 24px;
			display: flex;
			flex-direction: column;
			gap: 8px;
			z-index: 9999;
			pointer-events: none;
		}
		.toast {
			background: #0f172a;
			color: #ffffff;
			padding: 10px 18px;
			border-radius: var(--radius-md);
			font-size: 13px;
			font-weight: 600;
			box-shadow: var(--shadow-lg);
			display: flex;
			align-items: center;
			gap: 8px;
			opacity: 0;
			transform: translateY(12px);
			transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
		}
		.toast.visible { opacity: 1; transform: translateY(0); }
	</style>
</head>
<body>
	<div class="container">
		<!-- Main Header Card -->
		<header class="header-card">
			<div class="brand-row">
				<div class="brand-badge">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
					<span>KNITTO QA REPORT &amp; DEBUGGER</span>
				</div>
				<span style="font-size: 12px; color: var(--text-muted); font-weight: 500;">
					Share Token: <code style="font-family: 'JetBrains Mono', monospace; font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${escapeHtml(shareToken)}</code>
				</span>
			</div>

			<div class="title-row">
				<div>
					<div class="test-case-id">${escapeHtml(s.test_case_no || 'TEST-CASE')}</div>
					<h1 class="title-text">${escapeHtml(s.title || 'Sesi Pengujian')}</h1>
				</div>
				<div>
					<span class="badge-status" style="background: ${statusColor.bg}; color: ${statusColor.text}; border: 1px solid ${statusColor.border};">
						<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${statusColor.text};"></span>
						${escapeHtml(statusColor.label)}
					</span>
				</div>
			</div>

			<div class="meta-grid">
				<div class="meta-item">
					<span class="meta-label">Project</span>
					<span class="meta-value">${escapeHtml(s.project_name || s.id_project || '-')} ${s.project_code ? `<span style="color:var(--text-muted);">(${escapeHtml(s.project_code)})</span>` : ''}</span>
				</div>
				<div class="meta-item">
					<span class="meta-label">Tanggal Pelaksanaan</span>
					<span class="meta-value">${dateStr}</span>
				</div>
				<div class="meta-item">
					<span class="meta-label">Target URL</span>
					<span class="meta-value mono">${escapeHtml(s.target_url || '-')}</span>
				</div>
				<div class="meta-item">
					<span class="meta-label">Temuan QA / Actual Result</span>
					<span class="meta-value" style="color: ${s.result === 'FAIL' ? '#b91c1c' : '#1e293b'};">${escapeHtml(s.actual_result || '-')}</span>
				</div>
			</div>

			<!-- Quick Actions Toolbar -->
			<div class="toolbar" role="toolbar" aria-label="Aksi Cepat">
				<button class="btn btn-ai" id="btn-copy-ai" onclick="copyContextForAi(this)">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
					<span class="btn-text">Salin Konteks untuk AI Agent</span>
				</button>
				<button class="btn btn-primary" id="btn-copy-pw" onclick="copyPlaywrightScript(this)">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
					<span class="btn-text">Salin Playwright</span>
				</button>
				<button class="btn btn-outline" onclick="downloadPlaywrightFile()">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
					<span>Unduh Playwright (.ts)</span>
				</button>
				<a href="${aiContextEndpoint}" target="_blank" rel="noreferrer" class="btn btn-outline">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
					<span>Raw JSON Context</span>
				</a>
			</div>
		</header>

		<!-- Main Layout -->
		<main class="layout-grid">
			<!-- Left Column: Video & Checkpoints -->
			<div>
				<section class="card">
					<div class="card-header">
						<h2 class="card-title">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F3574" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect width="14" height="14" x="1" y="5" rx="2" ry="2"/></svg>
							<span>Rekaman Video Pengujian</span>
						</h2>
						${
	s.video_url
		? `<a href="${escapeHtml(s.video_url)}" target="_blank" rel="noreferrer" style="font-size: 11px; color: var(--primary); font-weight: 600; text-decoration: none; display: flex; align-items: center; gap: 4px;">
									<span>Buka Tab Baru</span>
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
								   </a>`
		: ''
}
					</div>
					${
	s.video_url
		? `<div class="video-box">
								<video src="${escapeHtml(s.video_url)}" controls preload="metadata"></video>
							   </div>`
		: `<div class="video-empty">
								<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" x2="23" y1="1" y2="23"/><path d="M21 15.554v-.004a2 2 0 0 0-.57-1.428L16 10l-4.5 4.5"/><path d="M16 16v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.414A2 2 0 0 1 3.586 6L7 2.586A2 2 0 0 1 8.414 2H14a2 2 0 0 1 2 2v2"/></svg>
								<span style="font-weight:600; color:#334155;">Tidak ada video terunggah untuk sesi ini.</span>
								<span style="font-size:11px;">Sesi ini tidak merekam video atau video belum selesai diunggah.</span>
							   </div>`
}
				</section>

				<section class="card">
					<div class="card-header">
						<h2 class="card-title">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F3574" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><circle cx="4" cy="6" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="4" cy="18" r="2"/></svg>
							<span>Checkpoints Langkah</span>
						</h2>
						<span style="font-size: 11px; font-weight: 700; color: var(--text-muted); background: #f1f5f9; padding: 2px 8px; border-radius: 10px;">
							${data.checkpoints.length} Langkah
						</span>
					</div>
					${
	data.checkpoints.length === 0
		? '<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 16px 0;">Tidak ada checkpoint yang dicatat.</div>'
		: `<ol class="timeline">
								${data.checkpoints
		.map(
			(cp, idx) => `
									<li class="timeline-item">
										<div class="timeline-node">${idx + 1}</div>
										<div class="timeline-text">${escapeHtml(cp.note || '')}</div>
									</li>`
		)
		.join('')}
							   </ol>`
}
				</section>
			</div>

			<!-- Right Column: Tabs (Network, Console, Script) -->
			<div>
				<section class="card">
					<div class="tab-list" role="tablist" aria-label="Detail Analisis Debugging">
						<button class="tab-button" role="tab" id="tab-btn-network" aria-selected="true" aria-controls="panel-network" onclick="selectTab('network')">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
							<span>Network Requests (${data.network_requests.length})</span>
							${data.failed_requests.length > 0 ? `<span style="background: #ef4444; color: #ffffff; padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 800;">${data.failed_requests.length} FAIL</span>` : ''}
						</button>
						<button class="tab-button" role="tab" id="tab-btn-console" aria-selected="false" aria-controls="panel-console" onclick="selectTab('console')">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 17 6-6-6-6"/><path d="m12 19 8-8-8-8"/></svg>
							<span>Console &amp; Errors (${data.console_logs.length})</span>
						</button>
						<button class="tab-button" role="tab" id="tab-btn-script" aria-selected="false" aria-controls="panel-script" onclick="selectTab('script')">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
							<span>Script Playwright</span>
						</button>
					</div>

					<!-- Panel 1: Network -->
					<div id="panel-network" class="tab-panel" role="tabpanel" aria-labelledby="tab-btn-network" aria-hidden="false">
						<div class="filter-bar">
							<div style="display: flex; gap: 6px;">
								<button class="btn btn-outline" style="font-size: 11px; padding: 4px 10px;" onclick="filterReqs('all', this)">Semua (${data.network_requests.length})</button>
								<button class="btn btn-outline" style="font-size: 11px; padding: 4px 10px; color: #dc2626;" onclick="filterReqs('failed', this)">Gagal (${data.failed_requests.length})</button>
							</div>
							<input type="text" class="search-input" placeholder="Saring URL / path..." oninput="searchReqs(this.value)" aria-label="Filter URL network">
						</div>

						<div id="req-container">
							${
	data.network_requests.length === 0
		? '<div style="text-align: center; padding: 32px; color: var(--text-muted); font-size: 13px;">Tidak ada permintaan network yang tertangkap.</div>'
		: data.network_requests
			.map((req, i) => {
				const methodClass = ['POST', 'GET', 'PUT', 'DELETE', 'PATCH'].includes(req.method) ? `m-${req.method}` : 'm-OTHER';
				const isError = req.status >= 400 || req.is_error;
				const statusClass = isError ? 'st-4xx' : 'st-2xx';
				return `
									<div class="req-item ${isError ? 'has-error' : ''}" data-method="${req.method}" data-status="${req.status}" data-error="${isError}">
										<div class="req-header" onclick="toggleReq(${i})">
											<div style="display: flex; align-items: center; gap: 8px;">
												<span class="method-tag ${methodClass}">${escapeHtml(req.method)}</span>
												<span class="status-tag ${statusClass}">${req.status}</span>
												${req.duration_ms ? `<span style="font-size: 11px; color: var(--text-muted);">${req.duration_ms}ms</span>` : ''}
											</div>
											<div class="req-url">${escapeHtml(req.url)}</div>
											<span style="font-size: 11px; color: var(--text-light);">#${req.sequence}</span>
										</div>
										<div id="req-detail-${i}" class="req-body-box">
											${
	req.request_body
		? `<div style="margin-bottom: 8px;">
														<div style="font-weight: 700; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Request Payload:</div>
														<pre style="background: #0f172a; color: #f8fafc; padding: 8px 12px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; max-height: 180px; overflow: auto;">${escapeHtml(JSON.stringify(req.request_body, null, 2))}</pre>
													   </div>`
		: ''
}
											${
	req.response_body
		? `<div>
														<div style="font-weight: 700; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; text-transform: uppercase;">Response Body:</div>
														<pre style="background: #0f172a; color: #f8fafc; padding: 8px 12px; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; max-height: 220px; overflow: auto;">${escapeHtml(JSON.stringify(req.response_body, null, 2))}</pre>
													   </div>`
		: ''
}
										</div>
									</div>`;
			})
			.join('')
}
						</div>
					</div>

					<!-- Panel 2: Console Logs -->
					<div id="panel-console" class="tab-panel" role="tabpanel" aria-labelledby="tab-btn-console" aria-hidden="true">
						${
	data.console_logs.length === 0
		? '<div style="text-align: center; padding: 32px; color: var(--text-muted); font-size: 13px;">Tidak ada log error di console browser. Bersih!</div>'
		: data.console_logs
			.map(
				(log) => `
								<div style="padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid #fecdd3; background: #fff1f2; margin-bottom: 8px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #9f1239;">
									<div style="font-weight: 800; font-size: 10px; margin-bottom: 2px;">[${escapeHtml(log.type.toUpperCase())}] ${escapeHtml(log.timestamp || '')}</div>
									<div style="white-space: pre-wrap; word-break: break-all;">${escapeHtml(log.message)}</div>
								</div>`
			)
			.join('')
}
					</div>

					<!-- Panel 3: Playwright Script -->
					<div id="panel-script" class="tab-panel" role="tabpanel" aria-labelledby="tab-btn-script" aria-hidden="true">
						<div class="code-header">
							<span>${escapeHtml(s.test_case_no || 'test')}-repro.spec.ts</span>
							<div style="display: flex; gap: 6px;">
								<button class="btn btn-outline" style="background: #334155; color: #ffffff; border: none; font-size: 11px; padding: 3px 8px;" onclick="copyPlaywrightScript(this)">
									Salin Script
								</button>
								<button class="btn btn-outline" style="background: #334155; color: #ffffff; border: none; font-size: 11px; padding: 3px 8px;" onclick="downloadPlaywrightFile()">
									Unduh .ts
								</button>
							</div>
						</div>
						<pre class="code-viewer">${escapeHtml(data.playwright_script || '// Script Playwright belum digenerate untuk sesi rekaman ini.')}</pre>
					</div>
				</section>
			</div>
		</main>
	</div>

	<div id="toast-container" aria-live="polite"></div>

	<!-- Machine-readable context for AI coding tools -->
	<script id="ai-debug-payload" type="application/json">
		${safeJson}
	</script>

	<script>
		const AI_PROMPT = ${safeAiPrompt};
		const PLAYWRIGHT_SCRIPT = ${safePlaywrightScript};
		const TEST_CASE_ID = ${safeTestCaseId};

		function showToast(message) {
			const container = document.getElementById('toast-container');
			const toast = document.createElement('div');
			toast.className = 'toast';
			toast.innerHTML = '<span>' + message + '</span>';
			container.appendChild(toast);
			requestAnimationFrame(() => toast.classList.add('visible'));
			setTimeout(() => {
				toast.classList.remove('visible');
				setTimeout(() => toast.remove(), 300);
			}, 2500);
		}

		function triggerButtonFeedback(btn, successLabel) {
			if (!btn) return;
			const originalHtml = btn.innerHTML;
			btn.classList.add('copied');
			btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><span>' + (successLabel || 'Tersalin!') + '</span>';
			setTimeout(() => {
				btn.classList.remove('copied');
				btn.innerHTML = originalHtml;
			}, 2200);
		}

		function copyContextForAi(btn) {
			navigator.clipboard.writeText(AI_PROMPT).then(() => {
				triggerButtonFeedback(btn, 'Konteks Tersalin!');
				showToast('Konteks AI berhasil disalin ke clipboard');
			}).catch(() => {
				showToast('Gagal menyalin konteks');
			});
		}

		function copyPlaywrightScript(btn) {
			if (!PLAYWRIGHT_SCRIPT) {
				showToast('Script Playwright belum tersedia');
				return;
			}
			navigator.clipboard.writeText(PLAYWRIGHT_SCRIPT).then(() => {
				triggerButtonFeedback(btn, 'Script Tersalin!');
				showToast('Script Playwright berhasil disalin');
			}).catch(() => {
				showToast('Gagal menyalin script');
			});
		}

		function downloadPlaywrightFile() {
			if (!PLAYWRIGHT_SCRIPT) {
				showToast('Script Playwright belum tersedia');
				return;
			}
			const blob = new Blob([PLAYWRIGHT_SCRIPT], { type: 'text/plain;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = (TEST_CASE_ID || 'test') + '-repro.spec.ts';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			showToast('File Playwright berhasil diunduh');
		}

		function selectTab(tabId) {
			const tabs = ['network', 'console', 'script'];
			tabs.forEach(t => {
				const btn = document.getElementById('tab-btn-' + t);
				const panel = document.getElementById('panel-' + t);
				if (t === tabId) {
					btn.setAttribute('aria-selected', 'true');
					panel.setAttribute('aria-hidden', 'false');
				} else {
					btn.setAttribute('aria-selected', 'false');
					panel.setAttribute('aria-hidden', 'true');
				}
			});
		}

		function toggleReq(index) {
			const box = document.getElementById('req-detail-' + index);
			if (box) box.classList.toggle('open');
		}

		function filterReqs(filterType, btn) {
			const items = document.querySelectorAll('#req-container .req-item');
			items.forEach(item => {
				if (filterType === 'failed') {
					item.style.display = item.getAttribute('data-error') === 'true' ? 'block' : 'none';
				} else {
					item.style.display = 'block';
				}
			});
		}

		function searchReqs(keyword) {
			const q = (keyword || '').toLowerCase().trim();
			const items = document.querySelectorAll('#req-container .req-item');
			items.forEach(item => {
				const url = (item.querySelector('.req-url')?.textContent || '').toLowerCase();
				item.style.display = !q || url.includes(q) ? 'block' : 'none';
			});
		}
	</script>
</body>
</html>`;
};

function escapeHtml(str: unknown): string {
	const val = typeof str === 'string' ? str : (str === null || str === undefined ? '' : String(str));
	return val
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
