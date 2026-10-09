declare namespace Entity {
	interface IQaProgram {
		id_program?: number
		name?: string
		code?: string
		type?: 'FRONTEND' | 'SERVICE' | string
		grafana_dashboard_url?: string | null
		description?: string | null
		base_url?: string | null
		repo_url?: string | null
		is_active?: boolean | number
		created_by_user_id?: number | null
		created_at?: string
		updated_at?: string
	}

	interface IQaProject {
		id_project?: number
		id_program?: number | null
		program_name?: string | null
		program_code?: string | null
		program_ids?: number[]
		programs?: Array<{
			id_program: number
			name: string
			code: string
			type?: string
			grafana_dashboard_url?: string | null
			base_url?: string | null
			repo_url?: string | null
		}>
		name?: string
		code?: string
		description?: string | null
		base_url?: string | null
		repo_url?: string | null
		release_version?: string | null
		test_app_folder?: string | null
		ip_dev?: string | null
		ip_prod?: string | null
		tester_name?: string | null
		programmer_name?: string | null
		task_dev?: string | null
		brd_id?: string | null
		link_task_pb?: string | null
		link_figma?: string | null
		is_active?: boolean | number
		created_by_user_id?: number | null
		created_at?: string
		updated_at?: string
	}

	interface IQaTestCaseTemplate {
		id_template?: number
		version_label?: string
		name?: string
		spreadsheet_url?: string
		gid?: string | null
		column_mapping?: Record<string, { header: string; aliases?: string[] }>
		export_anchors?: Record<string, unknown>
		is_default?: boolean
		is_active?: boolean
		created_by_user_id?: number | null
		updated_by_user_id?: number | null
		created_at?: string
		updated_at?: string
	}

	interface IQaTestCase {
		id_test_case?: number
		id_project?: number
		id_program?: number | null
		program_name?: string | null
		program_code?: string | null
		group_no?: string | null
		feature?: string | null
		process_no?: string | null
		test_type?: string
		test_case_id?: string
		test_variable?: string | null
		scenario?: string | null
		title?: string
		pre_condition?: string | null
		test_data?: string | null
		test_steps?: string | null
		expected_result?: string | null
		actual_result?: string | null
		status?: string
		evidence?: string | null
		remarks?: string | null
		automation_tools?: string | null
		test_date?: string | null
		last_session_id?: number | null
		created_by_user_id?: number | null
		created_at?: string
		updated_at?: string
	}

	interface IQaRecordingSession {
		id_session?: number
		id_project?: number | null
		id_test_case?: number | null
		test_case_no?: string
		title?: string
		description?: string | null
		target_url?: string | null
		owner_user_id?: number
		status?: string
		result?: string | null
		actual_result?: string | null
		share_token?: string | null
		/** Legacy: URL presigned lama, tidak lagi ditulis. Pakai `video_object_key`. */
		video_url?: string | null
		video_object_key?: string | null
		record_video?: number
		last_sequence?: number
		started_at?: string | null
		ended_at?: string | null
		created_at?: string
		updated_at?: string
	}

	interface IQaRecordingEvent {
		id_event?: number
		id_session?: number
		sequence?: number
		event_type?: string
		tab_id?: number | null
		url?: string | null
		payload?: string | Record<string, unknown> | null
		occurred_at?: string | null
		created_at?: string
	}

	interface IQaRecordingArtifact {
		id_artifact?: number
		id_session?: number
		kind?: string
		object_key?: string
		content_type?: string
		size_bytes?: number
		sequence?: number | null
		checksum_sha256?: string | null
		status?: string
		created_at?: string
		updated_at?: string
	}

	interface IQaRecordingGeneration {
		id_generation?: number
		id_session?: number
		kind?: string
		status?: string
		model?: string | null
		prompt_version?: string | null
		output?: string | null
		error_message?: string | null
		attempt_count?: number
		started_at?: string | null
		finished_at?: string | null
		created_at?: string
		updated_at?: string
	}

	interface IQaRecordingCheckpoint {
		id_checkpoint?: number
		id_session?: number
		note?: string
		sequence?: number | null
		id_artifact?: number | null
		created_by_user_id?: number
		created_at?: string
	}

	interface IQaUserProject {
		id_user?: number
		id_project?: number
		created_at?: string
		created_by?: number | null
	}

	interface IUser {
		id_user?: number
		nama?: string
		username?: string
		password?: string
		level?: string
		is_active?: number
		aktif?: number
		status_login?: string
		hint_password?: string
		ip_addres?: string
		created_at?: string
		updated_at?: string
	}

	interface IQaCodebaseFile {
		id_file?: number
		id_project?: number
		file_path?: string
		file_hash?: string
		language?: string
		total_lines?: number
		ast_summary?: Record<string, unknown> | string
		created_at?: string
		updated_at?: string
	}

	interface IQaCodebaseSymbol {
		id_symbol?: number
		id_file?: number
		id_project?: number
		name?: string
		kind?: string
		signature?: string | null
		docstring?: string | null
		start_line?: number
		end_line?: number
		scope_path?: string | null
		metadata?: Record<string, unknown> | string
		created_at?: string
	}

	interface IQaCodebaseChunk {
		id_chunk?: number
		id_file?: number
		id_project?: number
		chunk_type?: string
		content?: string
		start_line?: number
		end_line?: number
		embedding?: number[] | string
		similarity?: number
		metadata?: Record<string, unknown> | string
		created_at?: string
	}
}
