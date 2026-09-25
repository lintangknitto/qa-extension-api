declare namespace Entity {
	interface IQaProject {
		id_project?: number
		name?: string
		code?: string
		description?: string | null
		base_url?: string | null
		is_active?: number
		created_by_user_id?: number | null
		created_at?: string
		updated_at?: string
	}

	interface IQaTestCase {
		id_test_case?: number
		id_project?: number
		group_no?: string | null
		feature?: string | null
		process_no?: string | null
		test_type?: string
		test_case_id?: string
		test_variable?: string | null
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
		video_url?: string | null
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
		payload?: string | null
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

	interface IUser {
		id_user?: number
		nama?: string
		username?: string
		password?: string
		level?: string
		aktif?: number
		status_login?: string
		hint_password?: string
		ip_addres?: string
	}
}
