export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_events: {
        Row: {
          action_id: string
          actor: string
          created_at: string
          from_status: Database["public"]["Enums"]["action_status"] | null
          id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["action_status"]
          user_id: string
        }
        Insert: {
          action_id: string
          actor?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["action_status"] | null
          id?: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["action_status"]
          user_id: string
        }
        Update: {
          action_id?: string
          actor?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["action_status"] | null
          id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["action_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_events_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
        ]
      }
      action_executors: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          id: string
          kind: Database["public"]["Enums"]["executor_kind"]
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind: Database["public"]["Enums"]["executor_kind"]
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: Database["public"]["Enums"]["executor_kind"]
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      action_retries: {
        Row: {
          action_id: string
          attempt: number
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string | null
          user_id: string
        }
        Insert: {
          action_id: string
          attempt?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          user_id: string
        }
        Update: {
          action_id?: string
          attempt?: number
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      actions: {
        Row: {
          affected_entities: Json
          archived_at: string | null
          created_at: string
          description: string | null
          executed_at: string | null
          id: string
          organization_id: string | null
          payload: Json
          result: Json | null
          risk: Database["public"]["Enums"]["action_risk"]
          risk_acknowledged_at: string | null
          rollback_available: boolean
          rollback_token: string | null
          rolled_back_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affected_entities?: Json
          archived_at?: string | null
          created_at?: string
          description?: string | null
          executed_at?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json
          result?: Json | null
          risk?: Database["public"]["Enums"]["action_risk"]
          risk_acknowledged_at?: string | null
          rollback_available?: boolean
          rollback_token?: string | null
          rolled_back_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affected_entities?: Json
          archived_at?: string | null
          created_at?: string
          description?: string | null
          executed_at?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json
          result?: Json | null
          risk?: Database["public"]["Enums"]["action_risk"]
          risk_acknowledged_at?: string | null
          rollback_available?: boolean
          rollback_token?: string | null
          rolled_back_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      airport_places_cache: {
        Row: {
          category: string
          fetched_at: string
          iata: string
          payload: Json
        }
        Insert: {
          category: string
          fetched_at?: string
          iata: string
          payload?: Json
        }
        Update: {
          category?: string
          fetched_at?: string
          iata?: string
          payload?: Json
        }
        Relationships: []
      }
      api_cache: {
        Row: {
          created_at: string
          expires_at: string
          feature: string
          id: string
          location_context: Json | null
          normalized_query: string | null
          owner_id: string
          provider: string
          query_hash: string
          result_json: Json
          source_type: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          feature: string
          id?: string
          location_context?: Json | null
          normalized_query?: string | null
          owner_id: string
          provider: string
          query_hash: string
          result_json: Json
          source_type?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          feature?: string
          id?: string
          location_context?: Json | null
          normalized_query?: string | null
          owner_id?: string
          provider?: string
          query_hash?: string
          result_json?: Json
          source_type?: string | null
        }
        Relationships: []
      }
      api_usage_logs: {
        Row: {
          cache_hit: boolean
          created_at: string
          credits_used: number | null
          error_message: string | null
          estimated_cost: number | null
          feature: string
          id: string
          owner_id: string
          provider: string
          related_entity_id: string | null
          related_entity_type: string | null
          request_type: string | null
          status: string
          task_id: string | null
          tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          cache_hit?: boolean
          created_at?: string
          credits_used?: number | null
          error_message?: string | null
          estimated_cost?: number | null
          feature: string
          id?: string
          owner_id: string
          provider: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          request_type?: string | null
          status: string
          task_id?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          cache_hit?: boolean
          created_at?: string
          credits_used?: number | null
          error_message?: string | null
          estimated_cost?: number | null
          feature?: string
          id?: string
          owner_id?: string
          provider?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          request_type?: string | null
          status?: string
          task_id?: string | null
          tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          account_label: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          last_error: string | null
          last_error_at: string | null
          last_ok_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_label?: string | null
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_ok_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_label?: string | null
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_ok_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_annotations: {
        Row: {
          audit_event_id: string | null
          created_at: string
          id: string
          kind: string
          note: string
          organization_id: string | null
          user_id: string
        }
        Insert: {
          audit_event_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          note: string
          organization_id?: string | null
          user_id: string
        }
        Update: {
          audit_event_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          note?: string
          organization_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_annotations_audit_event_id_fkey"
            columns: ["audit_event_id"]
            isOneToOne: false
            referencedRelation: "audit_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_annotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string
          event: string
          id: string
          organization_id: string | null
          payload: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event: string
          id?: string
          organization_id?: string | null
          payload?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event?: string
          id?: string
          organization_id?: string | null
          payload?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      awareness_briefings: {
        Row: {
          confidence: string | null
          content: string
          generated_at: string
          id: string
          place_id: string
          section: string
          signal: Json | null
          sources: Json | null
          user_id: string
        }
        Insert: {
          confidence?: string | null
          content: string
          generated_at?: string
          id?: string
          place_id: string
          section: string
          signal?: Json | null
          sources?: Json | null
          user_id: string
        }
        Update: {
          confidence?: string | null
          content?: string
          generated_at?: string
          id?: string
          place_id?: string
          section?: string
          signal?: Json | null
          sources?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "awareness_briefings_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "awareness_places"
            referencedColumns: ["id"]
          },
        ]
      }
      awareness_overpass_cache: {
        Row: {
          cell_key: string
          fetched_at: string
          payload: Json
        }
        Insert: {
          cell_key: string
          fetched_at?: string
          payload: Json
        }
        Update: {
          cell_key?: string
          fetched_at?: string
          payload?: Json
        }
        Relationships: []
      }
      awareness_places: {
        Row: {
          address: string | null
          archived_at: string | null
          category: string | null
          country: string | null
          created_at: string
          geo: Json | null
          id: string
          label: string
          notes: string | null
          region: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          geo?: Json | null
          id?: string
          label: string
          notes?: string | null
          region?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          category?: string | null
          country?: string | null
          created_at?: string
          geo?: Json | null
          id?: string
          label?: string
          notes?: string | null
          region?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      awareness_snapshots: {
        Row: {
          compact: Json
          created_at: string
          expires_at: string
          full_data: Json
          generated_at: string
          id: string
          place_id: string
          sources_used: Json
          user_id: string
        }
        Insert: {
          compact?: Json
          created_at?: string
          expires_at?: string
          full_data?: Json
          generated_at?: string
          id?: string
          place_id: string
          sources_used?: Json
          user_id: string
        }
        Update: {
          compact?: Json
          created_at?: string
          expires_at?: string
          full_data?: Json
          generated_at?: string
          id?: string
          place_id?: string
          sources_used?: Json
          user_id?: string
        }
        Relationships: []
      }
      bank_links: {
        Row: {
          access_token: string
          accounts: Json
          active: boolean
          created_at: string
          id: string
          institution_name: string | null
          item_id: string
          last_read_at: string | null
          organization_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          accounts?: Json
          active?: boolean
          created_at?: string
          id?: string
          institution_name?: string | null
          item_id: string
          last_read_at?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          accounts?: Json
          active?: boolean
          created_at?: string
          id?: string
          institution_name?: string | null
          item_id?: string
          last_read_at?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brief_exports: {
        Row: {
          approved_at: string | null
          brief: Json
          created_at: string
          entity_id: string | null
          exported_at: string | null
          format: string
          id: string
          organization_id: string | null
          project_id: string | null
          scope_kind: string
          signals_hash: string | null
          status: string
          storage_path: string | null
          subtitle: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          brief?: Json
          created_at?: string
          entity_id?: string | null
          exported_at?: string | null
          format: string
          id?: string
          organization_id?: string | null
          project_id?: string | null
          scope_kind: string
          signals_hash?: string | null
          status?: string
          storage_path?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          brief?: Json
          created_at?: string
          entity_id?: string | null
          exported_at?: string | null
          format?: string
          id?: string
          organization_id?: string | null
          project_id?: string | null
          scope_kind?: string
          signals_hash?: string | null
          status?: string
          storage_path?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brief_exports_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_exports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brief_exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_changes: {
        Row: {
          change: string
          detected_at: string
          event_uid: string
          feed_id: string | null
          id: string
          new_starts_at: string | null
          old_starts_at: string | null
          organization_id: string | null
          signaled_at: string | null
          title: string | null
          user_id: string
          was_filed: boolean
        }
        Insert: {
          change: string
          detected_at?: string
          event_uid: string
          feed_id?: string | null
          id?: string
          new_starts_at?: string | null
          old_starts_at?: string | null
          organization_id?: string | null
          signaled_at?: string | null
          title?: string | null
          user_id: string
          was_filed?: boolean
        }
        Update: {
          change?: string
          detected_at?: string
          event_uid?: string
          feed_id?: string | null
          id?: string
          new_starts_at?: string | null
          old_starts_at?: string | null
          organization_id?: string | null
          signaled_at?: string | null
          title?: string | null
          user_id?: string
          was_filed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "calendar_changes_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "calendar_feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_changes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          attendees: string[]
          created_at: string
          description: string | null
          ends_at: string | null
          feed_id: string | null
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          location: string | null
          organization_id: string | null
          origin: string
          project_id: string | null
          starts_at: string
          sync_error: string | null
          sync_state: string
          synced_at: string | null
          title: string | null
          uid: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          attendees?: string[]
          created_at?: string
          description?: string | null
          ends_at?: string | null
          feed_id?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          organization_id?: string | null
          origin?: string
          project_id?: string | null
          starts_at: string
          sync_error?: string | null
          sync_state?: string
          synced_at?: string | null
          title?: string | null
          uid: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          attendees?: string[]
          created_at?: string
          description?: string | null
          ends_at?: string | null
          feed_id?: string | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          location?: string | null
          organization_id?: string | null
          origin?: string
          project_id?: string | null
          starts_at?: string
          sync_error?: string | null
          sync_state?: string
          synced_at?: string | null
          title?: string | null
          uid?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "calendar_feeds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_feeds: {
        Row: {
          active: boolean
          created_at: string
          default_project_id: string | null
          event_count: number
          id: string
          label: string
          last_added: number
          last_cancelled: number
          last_error: string | null
          last_moved: number
          last_synced_at: string | null
          organization_id: string | null
          provider: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_project_id?: string | null
          event_count?: number
          id?: string
          label: string
          last_added?: number
          last_cancelled?: number
          last_error?: string | null
          last_moved?: number
          last_synced_at?: string | null
          organization_id?: string | null
          provider?: string
          updated_at?: string
          url?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_project_id?: string | null
          event_count?: number
          id?: string
          label?: string
          last_added?: number
          last_cancelled?: number
          last_error?: string | null
          last_moved?: number
          last_synced_at?: string | null
          organization_id?: string | null
          provider?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feeds_default_project_id_fkey"
            columns: ["default_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_routes: {
        Row: {
          audit_event_id: string | null
          capture_id: string
          capture_kind: string
          created_at: string
          id: string
          new_status: string | null
          organization_id: string | null
          payload: Json
          previous_status: string | null
          sherlock_finding_id: string | null
          source: string | null
          suggested_route: string | null
          user_action: string
          user_id: string
        }
        Insert: {
          audit_event_id?: string | null
          capture_id: string
          capture_kind: string
          created_at?: string
          id?: string
          new_status?: string | null
          organization_id?: string | null
          payload?: Json
          previous_status?: string | null
          sherlock_finding_id?: string | null
          source?: string | null
          suggested_route?: string | null
          user_action: string
          user_id: string
        }
        Update: {
          audit_event_id?: string | null
          capture_id?: string
          capture_kind?: string
          created_at?: string
          id?: string
          new_status?: string | null
          organization_id?: string | null
          payload?: Json
          previous_status?: string | null
          sherlock_finding_id?: string | null
          source?: string | null
          suggested_route?: string | null
          user_action?: string
          user_id?: string
        }
        Relationships: []
      }
      case_claims: {
        Row: {
          case_id: string
          certainty: string
          created_at: string
          derived: boolean
          excerpt: string | null
          field: string
          id: string
          page: number | null
          record_key: string
          sensitive: boolean
          source_id: string | null
          unit: string | null
          user_id: string
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          case_id: string
          certainty?: string
          created_at?: string
          derived?: boolean
          excerpt?: string | null
          field: string
          id?: string
          page?: number | null
          record_key: string
          sensitive?: boolean
          source_id?: string | null
          unit?: string | null
          user_id: string
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          case_id?: string
          certainty?: string
          created_at?: string
          derived?: boolean
          excerpt?: string | null
          field?: string
          id?: string
          page?: number | null
          record_key?: string
          sensitive?: boolean
          source_id?: string | null
          unit?: string | null
          user_id?: string
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_claims_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cross_ref_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_claims_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "case_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      case_conflicts: {
        Row: {
          case_id: string
          claim_ids: string[]
          created_at: string
          field: string
          id: string
          kind: string
          record_key: string
          resolution: string
          resolved_at: string | null
          resolved_claim_id: string | null
          resolved_value: string | null
          user_id: string
        }
        Insert: {
          case_id: string
          claim_ids?: string[]
          created_at?: string
          field: string
          id?: string
          kind?: string
          record_key: string
          resolution?: string
          resolved_at?: string | null
          resolved_claim_id?: string | null
          resolved_value?: string | null
          user_id: string
        }
        Update: {
          case_id?: string
          claim_ids?: string[]
          created_at?: string
          field?: string
          id?: string
          kind?: string
          record_key?: string
          resolution?: string
          resolved_at?: string | null
          resolved_claim_id?: string | null
          resolved_value?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_conflicts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cross_ref_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_records: {
        Row: {
          case_id: string
          confirmed_by_user: boolean
          created_at: string
          display_label: string
          id: string
          match_confidence: string
          position: number
          record_key: string
          source_ids: string[]
          user_id: string
        }
        Insert: {
          case_id: string
          confirmed_by_user?: boolean
          created_at?: string
          display_label: string
          id?: string
          match_confidence?: string
          position?: number
          record_key: string
          source_ids?: string[]
          user_id: string
        }
        Update: {
          case_id?: string
          confirmed_by_user?: boolean
          created_at?: string
          display_label?: string
          id?: string
          match_confidence?: string
          position?: number
          record_key?: string
          source_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_records_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cross_ref_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_sources: {
        Row: {
          authority_fields: string[]
          authority_rank: number
          case_id: string
          content_hash: string | null
          created_at: string
          error: string | null
          extracted_text: string | null
          extraction_status: string
          filename: string
          id: string
          ingested_file_id: string | null
          mime_type: string | null
          page_count: number
          role: string
          role_set_by: string
          user_id: string
        }
        Insert: {
          authority_fields?: string[]
          authority_rank?: number
          case_id: string
          content_hash?: string | null
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          extraction_status?: string
          filename: string
          id?: string
          ingested_file_id?: string | null
          mime_type?: string | null
          page_count?: number
          role?: string
          role_set_by?: string
          user_id: string
        }
        Update: {
          authority_fields?: string[]
          authority_rank?: number
          case_id?: string
          content_hash?: string | null
          created_at?: string
          error?: string | null
          extracted_text?: string | null
          extraction_status?: string
          filename?: string
          id?: string
          ingested_file_id?: string | null
          mime_type?: string | null
          page_count?: number
          role?: string
          role_set_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_sources_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cross_ref_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          counterparty: string | null
          created_at: string
          direction: string
          due_at: string | null
          embedding: string | null
          id: string
          last_reminded_at: string | null
          metadata: Json
          organization_id: string | null
          priority: string
          remind_at: string | null
          source_note: string | null
          status: Database["public"]["Enums"]["commitment_status"]
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          counterparty?: string | null
          created_at?: string
          direction?: string
          due_at?: string | null
          embedding?: string | null
          id?: string
          last_reminded_at?: string | null
          metadata?: Json
          organization_id?: string | null
          priority?: string
          remind_at?: string | null
          source_note?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          summary: string
          updated_at?: string
          user_id: string
        }
        Update: {
          counterparty?: string | null
          created_at?: string
          direction?: string
          due_at?: string | null
          embedding?: string | null
          id?: string
          last_reminded_at?: string | null
          metadata?: Json
          organization_id?: string | null
          priority?: string
          remind_at?: string | null
          source_note?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          summary?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_source_note_fkey"
            columns: ["source_note"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          archived_at: string | null
          auto_titled: boolean
          context_id: string | null
          context_kind: string | null
          context_label: string | null
          created_at: string
          deleted_at: string | null
          id: string
          last_message_at: string | null
          organization_id: string | null
          outputs: Json
          pinned: boolean
          scope: string
          state: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          auto_titled?: boolean
          context_id?: string | null
          context_kind?: string | null
          context_label?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_message_at?: string | null
          organization_id?: string | null
          outputs?: Json
          pinned?: boolean
          scope?: string
          state?: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          auto_titled?: boolean
          context_id?: string | null
          context_kind?: string | null
          context_label?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_message_at?: string | null
          organization_id?: string | null
          outputs?: Json
          pinned?: boolean
          scope?: string
          state?: Json
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      corrections: {
        Row: {
          confidence_impact: string
          corrected_value: Json | null
          created_at: string
          expires_at: string | null
          feedback_type: string
          id: string
          organization_id: string | null
          original_value: Json | null
          scope: string
          source_label: string
          status: string
          surface: string
          target_id: string
          target_type: string
          updated_at: string
          user_id: string
          user_note: string | null
        }
        Insert: {
          confidence_impact?: string
          corrected_value?: Json | null
          created_at?: string
          expires_at?: string | null
          feedback_type: string
          id?: string
          organization_id?: string | null
          original_value?: Json | null
          scope?: string
          source_label?: string
          status?: string
          surface: string
          target_id: string
          target_type: string
          updated_at?: string
          user_id: string
          user_note?: string | null
        }
        Update: {
          confidence_impact?: string
          corrected_value?: Json | null
          created_at?: string
          expires_at?: string | null
          feedback_type?: string
          id?: string
          organization_id?: string | null
          original_value?: Json | null
          scope?: string
          source_label?: string
          status?: string
          surface?: string
          target_id?: string
          target_type?: string
          updated_at?: string
          user_id?: string
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corrections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_links: {
        Row: {
          confidence: string
          created_at: string
          created_by: string
          id: string
          metadata: Json
          reason: string | null
          relation: string
          removed_at: string | null
          source_id: string
          source_kind: string
          target_id: string
          target_kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          reason?: string | null
          relation?: string
          removed_at?: string | null
          source_id: string
          source_kind: string
          target_id: string
          target_kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          reason?: string | null
          relation?: string
          removed_at?: string | null
          source_id?: string
          source_kind?: string
          target_id?: string
          target_kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cross_ref_cases: {
        Row: {
          brief_export_id: string | null
          created_at: string
          id: string
          organization_id: string | null
          output_shape: string | null
          purpose: string | null
          recipe_id: string | null
          status: string
          style: string | null
          summary: string | null
          thread_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brief_export_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          output_shape?: string | null
          purpose?: string | null
          recipe_id?: string | null
          status?: string
          style?: string | null
          summary?: string | null
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brief_export_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string | null
          output_shape?: string | null
          purpose?: string | null
          recipe_id?: string | null
          status?: string
          style?: string | null
          summary?: string | null
          thread_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          acted_status: string | null
          because: string | null
          created_at: string
          dedupe_key: string
          failure: string | null
          headline: string | null
          id: string
          organization_id: string | null
          sensitivity: string
          sent_at: string
          situation_id: string
          situation_kind: string
          status: string
          surface: string
          urgency: string
          user_id: string
        }
        Insert: {
          acted_status?: string | null
          because?: string | null
          created_at?: string
          dedupe_key: string
          failure?: string | null
          headline?: string | null
          id?: string
          organization_id?: string | null
          sensitivity?: string
          sent_at?: string
          situation_id: string
          situation_kind: string
          status?: string
          surface: string
          urgency: string
          user_id: string
        }
        Update: {
          acted_status?: string | null
          because?: string | null
          created_at?: string
          dedupe_key?: string
          failure?: string | null
          headline?: string | null
          id?: string
          organization_id?: string | null
          sensitivity?: string
          sent_at?: string
          situation_id?: string
          situation_kind?: string
          status?: string
          surface?: string
          urgency?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_obligations: {
        Row: {
          conditions: string | null
          created_at: string
          document_id: string
          id: string
          party: string | null
          review_id: string
          source_clause_ref: string | null
          user_id: string
          what: string | null
          when_text: string | null
        }
        Insert: {
          conditions?: string | null
          created_at?: string
          document_id: string
          id?: string
          party?: string | null
          review_id: string
          source_clause_ref?: string | null
          user_id: string
          what?: string | null
          when_text?: string | null
        }
        Update: {
          conditions?: string | null
          created_at?: string
          document_id?: string
          id?: string
          party?: string | null
          review_id?: string
          source_clause_ref?: string | null
          user_id?: string
          what?: string | null
          when_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_obligations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_obligations_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "document_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      document_reviews: {
        Row: {
          document_id: string
          generated_at: string
          id: string
          key_dates: Json
          missing_or_unclear: Json
          model: string | null
          money_terms: Json
          obligations: Json
          parties: Json
          questions_to_ask: Json
          summary: string | null
          user_id: string
          verdict: string | null
          version_id: string
        }
        Insert: {
          document_id: string
          generated_at?: string
          id?: string
          key_dates?: Json
          missing_or_unclear?: Json
          model?: string | null
          money_terms?: Json
          obligations?: Json
          parties?: Json
          questions_to_ask?: Json
          summary?: string | null
          user_id: string
          verdict?: string | null
          version_id: string
        }
        Update: {
          document_id?: string
          generated_at?: string
          id?: string
          key_dates?: Json
          missing_or_unclear?: Json
          model?: string | null
          money_terms?: Json
          obligations?: Json
          parties?: Json
          questions_to_ask?: Json
          summary?: string | null
          user_id?: string
          verdict?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_reviews_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_risks: {
        Row: {
          clause_ref: string | null
          created_at: string
          document_id: string
          id: string
          plain_english: string | null
          review_id: string
          severity: Database["public"]["Enums"]["document_risk_severity"]
          suggested_question: string | null
          title: string
          user_id: string
        }
        Insert: {
          clause_ref?: string | null
          created_at?: string
          document_id: string
          id?: string
          plain_english?: string | null
          review_id: string
          severity?: Database["public"]["Enums"]["document_risk_severity"]
          suggested_question?: string | null
          title: string
          user_id: string
        }
        Update: {
          clause_ref?: string | null
          created_at?: string
          document_id?: string
          id?: string
          plain_english?: string | null
          review_id?: string
          severity?: Database["public"]["Enums"]["document_risk_severity"]
          suggested_question?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_risks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_risks_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "document_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          body_storage_path: string | null
          body_text: string | null
          created_at: string
          document_id: string
          id: string
          source: Database["public"]["Enums"]["document_version_source"]
          user_id: string
          version_no: number
        }
        Insert: {
          body_storage_path?: string | null
          body_text?: string | null
          created_at?: string
          document_id: string
          id?: string
          source?: Database["public"]["Enums"]["document_version_source"]
          user_id: string
          version_no?: number
        }
        Update: {
          body_storage_path?: string | null
          body_text?: string | null
          created_at?: string
          document_id?: string
          id?: string
          source?: Database["public"]["Enums"]["document_version_source"]
          user_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          conversation_id: string | null
          created_at: string
          draft_inputs: Json
          failure_reason: string | null
          id: string
          kind: Database["public"]["Enums"]["document_kind"]
          latest_review_id: string | null
          organization_id: string | null
          parties: Json
          project_id: string | null
          source_file_id: string | null
          status: Database["public"]["Enums"]["document_status"]
          template_key: string | null
          title: string
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          draft_inputs?: Json
          failure_reason?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          latest_review_id?: string | null
          organization_id?: string | null
          parties?: Json
          project_id?: string | null
          source_file_id?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          template_key?: string | null
          title?: string
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          draft_inputs?: Json
          failure_reason?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["document_kind"]
          latest_review_id?: string | null
          organization_id?: string | null
          parties?: Json
          project_id?: string | null
          source_file_id?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          template_key?: string | null
          title?: string
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_latest_review_fk"
            columns: ["latest_review_id"]
            isOneToOne: false
            referencedRelation: "document_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "ingested_files"
            referencedColumns: ["id"]
          },
        ]
      }
      email_inbound_addresses: {
        Row: {
          active: boolean
          created_at: string
          default_organization_id: string | null
          default_project_id: string | null
          default_scope: string
          id: string
          last_received_at: string | null
          slug: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_organization_id?: string | null
          default_project_id?: string | null
          default_scope?: string
          id?: string
          last_received_at?: string | null
          slug: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_organization_id?: string | null
          default_project_id?: string | null
          default_scope?: string
          id?: string
          last_received_at?: string | null
          slug?: string
          user_id?: string
        }
        Relationships: []
      }
      entities: {
        Row: {
          aliases: string[]
          confidence: string
          created_at: string
          display_name: string
          embedding: string | null
          first_seen_at: string
          id: string
          kind: string
          last_seen_at: string
          metadata: Json
          parent_entity_id: string | null
          pinned: boolean
          slug: string | null
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aliases?: string[]
          confidence?: string
          created_at?: string
          display_name: string
          embedding?: string | null
          first_seen_at?: string
          id?: string
          kind: string
          last_seen_at?: string
          metadata?: Json
          parent_entity_id?: string | null
          pinned?: boolean
          slug?: string | null
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aliases?: string[]
          confidence?: string
          created_at?: string
          display_name?: string
          embedding?: string | null
          first_seen_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          metadata?: Json
          parent_entity_id?: string | null
          pinned?: boolean
          slug?: string | null
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_links: {
        Row: {
          confidence: string
          created_at: string
          entity_id: string
          id: string
          metadata: Json
          role: string
          source_id: string
          source_kind: string
          user_id: string
        }
        Insert: {
          confidence?: string
          created_at?: string
          entity_id: string
          id?: string
          metadata?: Json
          role?: string
          source_id: string
          source_kind: string
          user_id: string
        }
        Update: {
          confidence?: string
          created_at?: string
          entity_id?: string
          id?: string
          metadata?: Json
          role?: string
          source_id?: string
          source_kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_links_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_relations: {
        Row: {
          created_at: string
          evidence_count: number
          from_entity_id: string
          id: string
          last_evidence_at: string
          metadata: Json
          relation: string
          source: string
          status: string
          to_entity_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence_count?: number
          from_entity_id: string
          id?: string
          last_evidence_at?: string
          metadata?: Json
          relation: string
          source?: string
          status?: string
          to_entity_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evidence_count?: number
          from_entity_id?: string
          id?: string
          last_evidence_at?: string
          metadata?: Json
          relation?: string
          source?: string
          status?: string
          to_entity_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relations_from_entity_id_fkey"
            columns: ["from_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relations_to_entity_id_fkey"
            columns: ["to_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      external_platform_webhook_diagnostics: {
        Row: {
          display_name: string
          enabled: boolean
          last_accepted_at: string | null
          last_event_type: string | null
          last_health_status: string
          last_idempotency_key: string | null
          last_received_at: string | null
          last_rejected_at: string | null
          last_rejection_reason: string | null
          owner_id: string
          secret_fingerprint: string | null
          signature_status: string
          source_platform: string
          updated_at: string
          webhook_configured: boolean
        }
        Insert: {
          display_name: string
          enabled?: boolean
          last_accepted_at?: string | null
          last_event_type?: string | null
          last_health_status?: string
          last_idempotency_key?: string | null
          last_received_at?: string | null
          last_rejected_at?: string | null
          last_rejection_reason?: string | null
          owner_id: string
          secret_fingerprint?: string | null
          signature_status?: string
          source_platform: string
          updated_at?: string
          webhook_configured?: boolean
        }
        Update: {
          display_name?: string
          enabled?: boolean
          last_accepted_at?: string | null
          last_event_type?: string | null
          last_health_status?: string
          last_idempotency_key?: string | null
          last_received_at?: string | null
          last_rejected_at?: string | null
          last_rejection_reason?: string | null
          owner_id?: string
          secret_fingerprint?: string | null
          signature_status?: string
          source_platform?: string
          updated_at?: string
          webhook_configured?: boolean
        }
        Relationships: []
      }
      external_platform_webhook_events: {
        Row: {
          accepted: boolean
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          owner_id: string
          payload: Json
          received_at: string
          rejection_reason: string | null
          signature_status: string
          source_platform: string
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          owner_id: string
          payload?: Json
          received_at?: string
          rejection_reason?: string | null
          signature_status?: string
          source_platform: string
        }
        Update: {
          accepted?: boolean
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          owner_id?: string
          payload?: Json
          received_at?: string
          rejection_reason?: string | null
          signature_status?: string
          source_platform?: string
        }
        Relationships: []
      }
      field_notes: {
        Row: {
          confidence: string
          created_at: string
          details: string | null
          expires_at: string | null
          freshness: string
          geo: Json | null
          geohash: string | null
          id: string
          location_label: string | null
          note_type: string
          organization_id: string | null
          place_id: string | null
          seasonal_context: Json | null
          sensitive: boolean
          share_intent: string
          source_label: string
          status: string
          summary: string
          updated_at: string
          user_id: string
          weather_context: Json | null
        }
        Insert: {
          confidence?: string
          created_at?: string
          details?: string | null
          expires_at?: string | null
          freshness?: string
          geo?: Json | null
          geohash?: string | null
          id?: string
          location_label?: string | null
          note_type?: string
          organization_id?: string | null
          place_id?: string | null
          seasonal_context?: Json | null
          sensitive?: boolean
          share_intent?: string
          source_label?: string
          status?: string
          summary: string
          updated_at?: string
          user_id: string
          weather_context?: Json | null
        }
        Update: {
          confidence?: string
          created_at?: string
          details?: string | null
          expires_at?: string | null
          freshness?: string
          geo?: Json | null
          geohash?: string | null
          id?: string
          location_label?: string | null
          note_type?: string
          organization_id?: string | null
          place_id?: string | null
          seasonal_context?: Json | null
          sensitive?: boolean
          share_intent?: string
          source_label?: string
          status?: string
          summary?: string
          updated_at?: string
          user_id?: string
          weather_context?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "field_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_notes_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "awareness_places"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_plans: {
        Row: {
          booking_ref: string | null
          chosen_option_id: string | null
          confirmed_at: string | null
          created_at: string
          currency: string | null
          depart_on: string
          destination: string
          event_ids: string[]
          id: string
          journey_id: string | null
          leg_order: number
          leg_state: string | null
          leg_state_at: string | null
          leg_state_note: string | null
          leg_state_source: string | null
          live_checked_at: string | null
          live_status: Json | null
          noticed_from: Json | null
          options: Json
          organization_id: string | null
          origin: string
          origin_kind: string
          ownership: string
          passengers: number
          return_on: string | null
          source: string
          status: string
          traveller_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_ref?: string | null
          chosen_option_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string | null
          depart_on: string
          destination: string
          event_ids?: string[]
          id?: string
          journey_id?: string | null
          leg_order?: number
          leg_state?: string | null
          leg_state_at?: string | null
          leg_state_note?: string | null
          leg_state_source?: string | null
          live_checked_at?: string | null
          live_status?: Json | null
          noticed_from?: Json | null
          options?: Json
          organization_id?: string | null
          origin: string
          origin_kind?: string
          ownership?: string
          passengers?: number
          return_on?: string | null
          source?: string
          status?: string
          traveller_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_ref?: string | null
          chosen_option_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string | null
          depart_on?: string
          destination?: string
          event_ids?: string[]
          id?: string
          journey_id?: string | null
          leg_order?: number
          leg_state?: string | null
          leg_state_at?: string | null
          leg_state_note?: string | null
          leg_state_source?: string | null
          live_checked_at?: string | null
          live_status?: Json | null
          noticed_from?: Json | null
          options?: Json
          organization_id?: string | null
          origin?: string
          origin_kind?: string
          ownership?: string
          passengers?: number
          return_on?: string | null
          source?: string
          status?: string
          traveller_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_plans_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "journeys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_senders: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          organization_id: string | null
          ownership: string
          sender_key: string
          sender_name: string | null
          times_seen: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          organization_id?: string | null
          ownership?: string
          sender_key: string
          sender_name?: string | null
          times_seen?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          organization_id?: string | null
          ownership?: string
          sender_key?: string
          sender_name?: string | null
          times_seen?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_senders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ingested_files: {
        Row: {
          approved_actions: Json
          batch_id: string | null
          confidence: string
          created_at: string
          detected_doc_type: string
          error: string | null
          extracted_entities: Json
          extracted_text: string | null
          filename: string
          id: string
          metadata: Json | null
          mime_type: string | null
          note_id: string | null
          organization_id: string | null
          review_status: string
          sensitive: boolean
          size_bytes: number | null
          source: string
          status: string
          storage_path: string | null
          suggested_actions: Json
          suggested_summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_actions?: Json
          batch_id?: string | null
          confidence?: string
          created_at?: string
          detected_doc_type?: string
          error?: string | null
          extracted_entities?: Json
          extracted_text?: string | null
          filename: string
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          note_id?: string | null
          organization_id?: string | null
          review_status?: string
          sensitive?: boolean
          size_bytes?: number | null
          source?: string
          status?: string
          storage_path?: string | null
          suggested_actions?: Json
          suggested_summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_actions?: Json
          batch_id?: string | null
          confidence?: string
          created_at?: string
          detected_doc_type?: string
          error?: string | null
          extracted_entities?: Json
          extracted_text?: string | null
          filename?: string
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          note_id?: string | null
          organization_id?: string | null
          review_status?: string
          sensitive?: boolean
          size_bytes?: number | null
          source?: string
          status?: string
          storage_path?: string | null
          suggested_actions?: Json
          suggested_summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      intake_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          item_id: string
          item_kind: string
          payload: Json
          reason: string | null
          restored_at: string | null
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          item_id: string
          item_kind: string
          payload?: Json
          reason?: string | null
          restored_at?: string | null
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          item_id?: string
          item_kind?: string
          payload?: Json
          reason?: string | null
          restored_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      integration_webhook_secrets: {
        Row: {
          created_at: string
          id: string
          integration_key: string
          owner_id: string
          secret_name: string
          secret_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_key: string
          owner_id: string
          secret_name: string
          secret_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_key?: string
          owner_id?: string
          secret_name?: string
          secret_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      investigation_findings: {
        Row: {
          claim: string
          confidence: string
          created_at: string
          id: string
          investigation_id: string
          source_excerpt: string | null
          source_id: string | null
          source_kind: string | null
          user_id: string
        }
        Insert: {
          claim: string
          confidence?: string
          created_at?: string
          id?: string
          investigation_id: string
          source_excerpt?: string | null
          source_id?: string | null
          source_kind?: string | null
          user_id: string
        }
        Update: {
          claim?: string
          confidence?: string
          created_at?: string
          id?: string
          investigation_id?: string
          source_excerpt?: string | null
          source_id?: string | null
          source_kind?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_findings_investigation_id_fkey"
            columns: ["investigation_id"]
            isOneToOne: false
            referencedRelation: "investigations"
            referencedColumns: ["id"]
          },
        ]
      }
      investigations: {
        Row: {
          created_at: string
          error: string | null
          id: string
          question: string
          related_action_ids: string[]
          related_commitment_ids: string[]
          related_note_ids: string[]
          status: Database["public"]["Enums"]["investigation_status"]
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          question: string
          related_action_ids?: string[]
          related_commitment_ids?: string[]
          related_note_ids?: string[]
          status?: Database["public"]["Enums"]["investigation_status"]
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          question?: string
          related_action_ids?: string[]
          related_commitment_ids?: string[]
          related_note_ids?: string[]
          status?: Database["public"]["Enums"]["investigation_status"]
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      job_leases: {
        Row: {
          expires_at: string
          job_name: string
          locked_at: string
          locked_by: string | null
        }
        Insert: {
          expires_at: string
          job_name: string
          locked_at?: string
          locked_by?: string | null
        }
        Update: {
          expires_at?: string
          job_name?: string
          locked_at?: string
          locked_by?: string | null
        }
        Relationships: []
      }
      journeys: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journeys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_seen: {
        Row: {
          created_at: string
          from_address: string | null
          id: string
          message_id: string
          outcome: string
          subject: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          from_address?: string | null
          id?: string
          message_id: string
          outcome?: string
          subject?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          from_address?: string | null
          id?: string
          message_id?: string
          outcome?: string
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mail_sync_state: {
        Row: {
          backfilled_at: string | null
          connector_id: string
          created_at: string
          enabled: boolean
          history_id: string | null
          last_error: string | null
          last_swept_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          backfilled_at?: string | null
          connector_id?: string
          created_at?: string
          enabled?: boolean
          history_id?: string | null
          last_error?: string | null
          last_swept_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          backfilled_at?: string | null
          connector_id?: string
          created_at?: string
          enabled?: boolean
          history_id?: string | null
          last_error?: string | null
          last_swept_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      medications: {
        Row: {
          active: boolean
          created_at: string
          dose: string
          ends_on: string | null
          id: string
          name: string
          notes: string
          organization_id: string | null
          rhythm: string
          starts_on: string | null
          times_local: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dose?: string
          ends_on?: string | null
          id?: string
          name: string
          notes?: string
          organization_id?: string | null
          rhythm?: string
          starts_on?: string | null
          times_local?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dose?: string
          ends_on?: string | null
          id?: string
          name?: string
          notes?: string
          organization_id?: string | null
          rhythm?: string
          starts_on?: string | null
          times_local?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          digest: Json | null
          embedding: string | null
          id: string
          metadata: Json | null
          organization_id: string | null
          role: Database["public"]["Enums"]["message_role"]
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          digest?: Json | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          role: Database["public"]["Enums"]["message_role"]
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          digest?: Json | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          role?: Database["public"]["Enums"]["message_role"]
          tool_calls?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      note_links: {
        Row: {
          created_at: string
          from_note: string
          id: string
          kind: string
          to_note: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_note: string
          id?: string
          kind?: string
          to_note: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_note?: string
          id?: string
          kind?: string
          to_note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_links_from_note_fkey"
            columns: ["from_note"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_links_to_note_fkey"
            columns: ["to_note"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          autolink_suggestions: Json | null
          body: string
          created_at: string
          digest: Json | null
          embedding: string | null
          id: string
          metadata: Json | null
          organization_id: string | null
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          autolink_suggestions?: Json | null
          body?: string
          created_at?: string
          digest?: Json | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          autolink_suggestions?: Json | null
          body?: string
          created_at?: string
          digest?: Json | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nudges: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          expires_at: string | null
          id: string
          kind: string
          organization_id: string | null
          priority: number
          related_entity_id: string | null
          related_entity_type: string | null
          status: Database["public"]["Enums"]["nudge_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          organization_id?: string | null
          priority?: number
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: Database["public"]["Enums"]["nudge_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          organization_id?: string | null
          priority?: number
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: Database["public"]["Enums"]["nudge_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nudges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      object_cadence: {
        Row: {
          computed_at: string
          id: string
          last_event_at: string | null
          median_gap_days: number
          object_id: string
          object_type: string
          organization_id: string | null
          samples: number
          user_id: string
          window_days: number
        }
        Insert: {
          computed_at?: string
          id?: string
          last_event_at?: string | null
          median_gap_days?: number
          object_id: string
          object_type: string
          organization_id?: string | null
          samples?: number
          user_id: string
          window_days?: number
        }
        Update: {
          computed_at?: string
          id?: string
          last_event_at?: string | null
          median_gap_days?: number
          object_id?: string
          object_type?: string
          organization_id?: string | null
          samples?: number
          user_id?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "object_cadence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_state_events: {
        Row: {
          created_at: string
          id: string
          inferred_state: string
          signals: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inferred_state: string
          signals?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inferred_state?: string
          signals?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string | null
          organization_id: string
          removed_at: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          removed_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          removed_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_hsl: string | null
          created_at: string
          id: string
          kind: string
          logo_url: string | null
          name: string
          owner_id: string
          short_code: string | null
          slug: string
          type: string
          updated_at: string
        }
        Insert: {
          accent_hsl?: string | null
          created_at?: string
          id?: string
          kind?: string
          logo_url?: string | null
          name: string
          owner_id: string
          short_code?: string | null
          slug: string
          type?: string
          updated_at?: string
        }
        Update: {
          accent_hsl?: string | null
          created_at?: string
          id?: string
          kind?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          short_code?: string | null
          slug?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      outbound_bridge_deliveries: {
        Row: {
          attempts: number
          body: Json
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          organization_id: string | null
          owner_id: string
          status: string
          target: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          body: Json
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          next_attempt_at?: string
          organization_id?: string | null
          owner_id: string
          status?: string
          target: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body?: Json
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          next_attempt_at?: string
          organization_id?: string | null
          owner_id?: string
          status?: string
          target?: string
          updated_at?: string
        }
        Relationships: []
      }
      place_state: {
        Row: {
          confidence: string
          conflicts: Json
          country: string | null
          created_at: string
          evidence: Json
          exact_label: string | null
          exact_place_id: string | null
          fixed_at: string | null
          id: string
          level: string
          locality: string | null
          metro: string | null
          organization_id: string | null
          region: string | null
          role: string
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string
          conflicts?: Json
          country?: string | null
          created_at?: string
          evidence?: Json
          exact_label?: string | null
          exact_place_id?: string | null
          fixed_at?: string | null
          id?: string
          level?: string
          locality?: string | null
          metro?: string | null
          organization_id?: string | null
          region?: string | null
          role: string
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string
          conflicts?: Json
          country?: string | null
          created_at?: string
          evidence?: Json
          exact_label?: string | null
          exact_place_id?: string | null
          fixed_at?: string | null
          id?: string
          level?: string
          locality?: string | null
          metro?: string | null
          organization_id?: string | null
          region?: string | null
          role?: string
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_state_exact_place_id_fkey"
            columns: ["exact_place_id"]
            isOneToOne: false
            referencedRelation: "awareness_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      place_transitions: {
        Row: {
          at: string
          confidence: string
          created_at: string
          evidence: Json
          from_words: string | null
          id: string
          kind: string
          level: string
          organization_id: string | null
          to_words: string | null
          user_id: string
        }
        Insert: {
          at?: string
          confidence?: string
          created_at?: string
          evidence?: Json
          from_words?: string | null
          id?: string
          kind: string
          level: string
          organization_id?: string | null
          to_words?: string | null
          user_id: string
        }
        Update: {
          at?: string
          confidence?: string
          created_at?: string
          evidence?: Json
          from_words?: string | null
          id?: string
          kind?: string
          level?: string
          organization_id?: string | null
          to_words?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_transitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_settings: {
        Row: {
          allow_shared_aggregation: boolean
          ask_before_contributing: boolean
          created_at: string
          default_share_intent: string
          organization_id: string | null
          sensitive_by_default: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_shared_aggregation?: boolean
          ask_before_contributing?: boolean
          created_at?: string
          default_share_intent?: string
          organization_id?: string | null
          sensitive_by_default?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_shared_aggregation?: boolean
          ask_before_contributing?: boolean
          created_at?: string
          default_share_intent?: string
          organization_id?: string | null
          sensitive_by_default?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          home_geo: Json | null
          id: string
          preferences: Json
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          home_geo?: Json | null
          id: string
          preferences?: Json
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          home_geo?: Json | null
          id?: string
          preferences?: Json
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_items: {
        Row: {
          added_at: string
          added_by: string
          id: string
          item_id: string
          item_type: string
          note: string | null
          position: number
          project_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          id?: string
          item_id: string
          item_type: string
          note?: string | null
          position?: number
          project_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          id?: string
          item_id?: string
          item_type?: string
          note?: string | null
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_suggestion_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          item_id: string
          item_type: string
          project_id: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          item_id: string
          item_type: string
          project_id: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          item_id?: string
          item_type?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_suggestion_dismissals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          brief_structured: Json | null
          created_at: string
          id: string
          metadata: Json
          organization_id: string | null
          pinned: boolean
          status: string
          summary: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brief_structured?: Json | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          pinned?: boolean
          status?: string
          summary?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brief_structured?: Json | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          pinned?: boolean
          status?: string
          summary?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_error: string | null
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      research_objects: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          metadata: Json
          mode: Database["public"]["Enums"]["research_mode"]
          question: string
          related_entity_id: string | null
          related_entity_type: string | null
          status: Database["public"]["Enums"]["research_status"]
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          mode?: Database["public"]["Enums"]["research_mode"]
          question: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: Database["public"]["Enums"]["research_status"]
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          mode?: Database["public"]["Enums"]["research_mode"]
          question?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: Database["public"]["Enums"]["research_status"]
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      research_sources: {
        Row: {
          created_at: string
          id: string
          position: number | null
          provider: string | null
          relevance: number | null
          research_id: string
          snippet: string | null
          title: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number | null
          provider?: string | null
          relevance?: number | null
          research_id: string
          snippet?: string | null
          title?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number | null
          provider?: string | null
          relevance?: number | null
          research_id?: string
          snippet?: string | null
          title?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_sources_research_id_fkey"
            columns: ["research_id"]
            isOneToOne: false
            referencedRelation: "research_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      sherlock_digests: {
        Row: {
          created_at: string
          delivered_channels: string[]
          digest: Json
          id: string
          look_again_count: number
          new_count: number
          organization_id: string | null
          seen_at: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          delivered_channels?: string[]
          digest?: Json
          id?: string
          look_again_count?: number
          new_count?: number
          organization_id?: string | null
          seen_at?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          delivered_channels?: string[]
          digest?: Json
          id?: string
          look_again_count?: number
          new_count?: number
          organization_id?: string | null
          seen_at?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      sherlock_findings: {
        Row: {
          audit_event_id: string | null
          confidence: string
          cooldown_until: string | null
          created_at: string
          evidence_hash: string | null
          extracted_data: Json
          finding_type: string
          id: string
          mode: string
          organization_id: string | null
          rationale: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sensitive_flag: boolean
          source_object_id: string | null
          source_object_type: string
          status: string
          suggested_action: string | null
          suggested_relation_type: string | null
          summary: string
          surface_origin: string | null
          target_object_id: string | null
          target_object_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audit_event_id?: string | null
          confidence?: string
          cooldown_until?: string | null
          created_at?: string
          evidence_hash?: string | null
          extracted_data?: Json
          finding_type: string
          id?: string
          mode: string
          organization_id?: string | null
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sensitive_flag?: boolean
          source_object_id?: string | null
          source_object_type: string
          status?: string
          suggested_action?: string | null
          suggested_relation_type?: string | null
          summary: string
          surface_origin?: string | null
          target_object_id?: string | null
          target_object_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audit_event_id?: string | null
          confidence?: string
          cooldown_until?: string | null
          created_at?: string
          evidence_hash?: string | null
          extracted_data?: Json
          finding_type?: string
          id?: string
          mode?: string
          organization_id?: string | null
          rationale?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sensitive_flag?: boolean
          source_object_id?: string | null
          source_object_type?: string
          status?: string
          suggested_action?: string | null
          suggested_relation_type?: string | null
          summary?: string
          surface_origin?: string | null
          target_object_id?: string | null
          target_object_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sherlock_findings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sherlock_findings_cache: {
        Row: {
          confidence: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          findings: Json
          id: string
          organization_id: string | null
          scope_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          findings: Json
          id?: string
          organization_id?: string | null
          scope_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          findings?: Json
          id?: string
          organization_id?: string | null
          scope_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sherlock_findings_cache_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sherlock_settings: {
        Row: {
          ambient_enabled: boolean
          created_at: string
          detect_entity_gone_quiet: boolean
          detect_meeting_without_context: boolean
          detect_near_duplicate_note: boolean
          detect_notes_disagree: boolean
          detect_obligation_untracked: boolean
          detect_promise_collides: boolean
          detect_recurring_entity: boolean
          detect_stale_commitment: boolean
          detect_unapproved_high_risk: boolean
          dismissed_cooldown_days: number
          duplicate_window_days: number
          manual_only_for_sensitive: boolean
          meeting_lookahead_hours: number
          quiet_gap_days: number
          recurring_min_mentions: number
          sensitive_caution: boolean
          show_in_briefings: boolean
          show_in_canvas: boolean
          show_low_confidence: boolean
          stale_promise_days: number
          updated_at: string
          user_id: string
          weekly_digest_enabled: boolean
          weekly_digest_telegram: boolean
          weekly_digest_today: boolean
        }
        Insert: {
          ambient_enabled?: boolean
          created_at?: string
          detect_entity_gone_quiet?: boolean
          detect_meeting_without_context?: boolean
          detect_near_duplicate_note?: boolean
          detect_notes_disagree?: boolean
          detect_obligation_untracked?: boolean
          detect_promise_collides?: boolean
          detect_recurring_entity?: boolean
          detect_stale_commitment?: boolean
          detect_unapproved_high_risk?: boolean
          dismissed_cooldown_days?: number
          duplicate_window_days?: number
          manual_only_for_sensitive?: boolean
          meeting_lookahead_hours?: number
          quiet_gap_days?: number
          recurring_min_mentions?: number
          sensitive_caution?: boolean
          show_in_briefings?: boolean
          show_in_canvas?: boolean
          show_low_confidence?: boolean
          stale_promise_days?: number
          updated_at?: string
          user_id: string
          weekly_digest_enabled?: boolean
          weekly_digest_telegram?: boolean
          weekly_digest_today?: boolean
        }
        Update: {
          ambient_enabled?: boolean
          created_at?: string
          detect_entity_gone_quiet?: boolean
          detect_meeting_without_context?: boolean
          detect_near_duplicate_note?: boolean
          detect_notes_disagree?: boolean
          detect_obligation_untracked?: boolean
          detect_promise_collides?: boolean
          detect_recurring_entity?: boolean
          detect_stale_commitment?: boolean
          detect_unapproved_high_risk?: boolean
          dismissed_cooldown_days?: number
          duplicate_window_days?: number
          manual_only_for_sensitive?: boolean
          meeting_lookahead_hours?: number
          quiet_gap_days?: number
          recurring_min_mentions?: number
          sensitive_caution?: boolean
          show_in_briefings?: boolean
          show_in_canvas?: boolean
          show_low_confidence?: boolean
          stale_promise_days?: number
          updated_at?: string
          user_id?: string
          weekly_digest_enabled?: boolean
          weekly_digest_telegram?: boolean
          weekly_digest_today?: boolean
        }
        Relationships: []
      }
      system_controls: {
        Row: {
          auto_refresh_enabled: boolean
          background_awareness_enabled: boolean
          calendar_sync_enabled: boolean
          campcore_enabled: boolean
          community_public_fallback_enabled: boolean
          community_reddit_enabled: boolean
          deep_research_enabled: boolean
          external_apis_enabled: boolean
          fenrir_enabled: boolean
          file_analysis_enabled: boolean
          gemini_enabled: boolean
          global_usage_mode: string
          gth_enabled: boolean
          local_search_enabled: boolean
          owner_id: string
          proactive_synthesis_enabled: boolean
          serpapi_enabled: boolean
          shared_aggregation_enabled: boolean
          shared_min_distinct_users: number
          shared_window_days: number
          updated_at: string
          weather_enabled: boolean
        }
        Insert: {
          auto_refresh_enabled?: boolean
          background_awareness_enabled?: boolean
          calendar_sync_enabled?: boolean
          campcore_enabled?: boolean
          community_public_fallback_enabled?: boolean
          community_reddit_enabled?: boolean
          deep_research_enabled?: boolean
          external_apis_enabled?: boolean
          fenrir_enabled?: boolean
          file_analysis_enabled?: boolean
          gemini_enabled?: boolean
          global_usage_mode?: string
          gth_enabled?: boolean
          local_search_enabled?: boolean
          owner_id: string
          proactive_synthesis_enabled?: boolean
          serpapi_enabled?: boolean
          shared_aggregation_enabled?: boolean
          shared_min_distinct_users?: number
          shared_window_days?: number
          updated_at?: string
          weather_enabled?: boolean
        }
        Update: {
          auto_refresh_enabled?: boolean
          background_awareness_enabled?: boolean
          calendar_sync_enabled?: boolean
          campcore_enabled?: boolean
          community_public_fallback_enabled?: boolean
          community_reddit_enabled?: boolean
          deep_research_enabled?: boolean
          external_apis_enabled?: boolean
          fenrir_enabled?: boolean
          file_analysis_enabled?: boolean
          gemini_enabled?: boolean
          global_usage_mode?: string
          gth_enabled?: boolean
          local_search_enabled?: boolean
          owner_id?: string
          proactive_synthesis_enabled?: boolean
          serpapi_enabled?: boolean
          shared_aggregation_enabled?: boolean
          shared_min_distinct_users?: number
          shared_window_days?: number
          updated_at?: string
          weather_enabled?: boolean
        }
        Relationships: []
      }
      telegram_chat_links: {
        Row: {
          chat_id: number
          id: string
          linked_at: string
          tg_username: string | null
          user_id: string
        }
        Insert: {
          chat_id: number
          id?: string
          linked_at?: string
          tg_username?: string | null
          user_id: string
        }
        Update: {
          chat_id?: number
          id?: string
          linked_at?: string
          tg_username?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_link_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_messages: {
        Row: {
          chat_id: number
          created_at: string
          direction: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          filed_as: string | null
          id: string
          kind: string
          meta: Json
          organization_id: string | null
          sent_by: string | null
          text: string | null
          update_id: number | null
          user_id: string
        }
        Insert: {
          chat_id: number
          created_at?: string
          direction: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          filed_as?: string | null
          id?: string
          kind?: string
          meta?: Json
          organization_id?: string | null
          sent_by?: string | null
          text?: string | null
          update_id?: number | null
          user_id: string
        }
        Update: {
          chat_id?: number
          created_at?: string
          direction?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          filed_as?: string | null
          id?: string
          kind?: string
          meta?: Json
          organization_id?: string | null
          sent_by?: string | null
          text?: string | null
          update_id?: number | null
          user_id?: string
        }
        Relationships: []
      }
      trip_points: {
        Row: {
          accuracy_m: number | null
          id: string
          kind: string
          label: string | null
          lat: number
          lon: number
          recorded_at: string
          trip_id: string
          user_id: string
        }
        Insert: {
          accuracy_m?: number | null
          id?: string
          kind?: string
          label?: string | null
          lat: number
          lon: number
          recorded_at?: string
          trip_id: string
          user_id: string
        }
        Update: {
          accuracy_m?: number | null
          id?: string
          kind?: string
          label?: string | null
          lat?: number
          lon?: number
          recorded_at?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_points_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          closed_by: string
          created_at: string
          distance_m: number | null
          end_label: string | null
          end_place_id: string | null
          ended_at: string | null
          id: string
          label: string | null
          notes: string | null
          organization_id: string | null
          point_count: number
          purpose: string | null
          start_label: string | null
          start_place_id: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_by?: string
          created_at?: string
          distance_m?: number | null
          end_label?: string | null
          end_place_id?: string | null
          ended_at?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          organization_id?: string | null
          point_count?: number
          purpose?: string | null
          start_label?: string | null
          start_place_id?: string | null
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_by?: string
          created_at?: string
          distance_m?: number | null
          end_label?: string | null
          end_place_id?: string | null
          ended_at?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          organization_id?: string | null
          point_count?: number
          purpose?: string | null
          start_label?: string | null
          start_place_id?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_end_place_id_fkey"
            columns: ["end_place_id"]
            isOneToOne: false
            referencedRelation: "awareness_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_start_place_id_fkey"
            columns: ["start_place_id"]
            isOneToOne: false
            referencedRelation: "awareness_places"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          auto_run_allowed: boolean
          created_at: string
          enabled: boolean
          feature: string
          id: string
          limit_per_day: number | null
          limit_per_hour: number | null
          limit_per_minute: number | null
          limit_per_month: number | null
          manual_approval_required: boolean
          max_calls_per_task: number | null
          mode_override: string | null
          owner_id: string
          provider: string
          updated_at: string
        }
        Insert: {
          auto_run_allowed?: boolean
          created_at?: string
          enabled?: boolean
          feature: string
          id?: string
          limit_per_day?: number | null
          limit_per_hour?: number | null
          limit_per_minute?: number | null
          limit_per_month?: number | null
          manual_approval_required?: boolean
          max_calls_per_task?: number | null
          mode_override?: string | null
          owner_id: string
          provider: string
          updated_at?: string
        }
        Update: {
          auto_run_allowed?: boolean
          created_at?: string
          enabled?: boolean
          feature?: string
          id?: string
          limit_per_day?: number | null
          limit_per_hour?: number | null
          limit_per_minute?: number | null
          limit_per_month?: number | null
          manual_approval_required?: boolean
          max_calls_per_task?: number | null
          mode_override?: string | null
          owner_id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_channel_links: {
        Row: {
          channel: string
          created_at: string
          default_route: string
          external_channel_id: string | null
          id: string
          last_seen_at: string | null
          linked_at: string
          metadata: Json
          organization_id: string | null
          provider_user_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          default_route?: string
          external_channel_id?: string | null
          id?: string
          last_seen_at?: string | null
          linked_at?: string
          metadata?: Json
          organization_id?: string | null
          provider_user_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          default_route?: string
          external_channel_id?: string | null
          id?: string
          last_seen_at?: string | null
          linked_at?: string
          metadata?: Json
          organization_id?: string | null
          provider_user_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_modes: {
        Row: {
          mode: Database["public"]["Enums"]["app_mode"]
          updated_at: string
          user_id: string
        }
        Insert: {
          mode?: Database["public"]["Enums"]["app_mode"]
          updated_at?: string
          user_id: string
        }
        Update: {
          mode?: Database["public"]["Enums"]["app_mode"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watches: {
        Row: {
          attempts: number
          cadence_minutes: number
          created_at: string
          goal: string
          id: string
          kind: string
          last_check_at: string | null
          max_attempts: number
          next_check_at: string
          organization_id: string | null
          outcome: string | null
          source: string
          state: string
          stop_at: string | null
          subject_id: string | null
          success_when: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          cadence_minutes?: number
          created_at?: string
          goal: string
          id?: string
          kind: string
          last_check_at?: string | null
          max_attempts?: number
          next_check_at?: string
          organization_id?: string | null
          outcome?: string | null
          source?: string
          state?: string
          stop_at?: string | null
          subject_id?: string | null
          success_when?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          cadence_minutes?: number
          created_at?: string
          goal?: string
          id?: string
          kind?: string
          last_check_at?: string | null
          max_attempts?: number
          next_check_at?: string
          organization_id?: string | null
          outcome?: string | null
          source?: string
          state?: string
          stop_at?: string | null
          subject_id?: string | null
          success_when?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wearable_readings: {
        Row: {
          created_at: string
          id: string
          kind: string
          measured_at: string
          organization_id: string | null
          raw: Json
          source: string
          unit: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          measured_at?: string
          organization_id?: string | null
          raw?: Json
          source?: string
          unit?: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          measured_at?: string
          organization_id?: string | null
          raw?: Json
          source?: string
          unit?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "wearable_readings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      world_facts: {
        Row: {
          authority: string
          checked_on: string
          country: string
          created_at: string
          id: string
          region: string | null
          source: string
          topic: string
          value: string
        }
        Insert: {
          authority?: string
          checked_on: string
          country: string
          created_at?: string
          id?: string
          region?: string | null
          source: string
          topic: string
          value: string
        }
        Update: {
          authority?: string
          checked_on?: string
          country?: string
          created_at?: string
          id?: string
          region?: string | null
          source?: string
          topic?: string
          value?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cross_links_create: {
        Args: {
          _confidence?: string
          _created_by?: string
          _reason?: string
          _relation?: string
          _source_id: string
          _source_kind: string
          _target_id: string
          _target_kind: string
        }
        Returns: string
      }
      cross_links_for_item: {
        Args: { _id: string; _kind: string }
        Returns: {
          confidence: string
          created_at: string
          created_by: string
          direction: string
          id: string
          other_id: string
          other_kind: string
          reason: string
          relation: string
        }[]
      }
      cross_links_remove: {
        Args: { _id: string; _reason?: string }
        Returns: boolean
      }
      entities_semantic_match: {
        Args: {
          _kinds?: string[]
          _match_count?: number
          _min_similarity?: number
          _query_embedding: string
          _user_id: string
        }
        Returns: {
          display_name: string
          id: string
          kind: string
          parent_entity_id: string
          similarity: number
          slug: string
        }[]
      }
      entity_rollup: { Args: { _entity_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      memory_search: {
        Args: {
          _match_count?: number
          _min_similarity?: number
          _query_embedding: string
          _user_id: string
        }
        Returns: {
          created_at: string
          id: string
          kind: string
          similarity: number
          snippet: string
          title: string
        }[]
      }
      notes_related: {
        Args: {
          _match_count?: number
          _min_similarity?: number
          _note_id: string
          _user_id: string
        }
        Returns: {
          id: string
          similarity: number
          snippet: string
          title: string
        }[]
      }
      org_role: { Args: { _org_id: string; _user_id: string }; Returns: string }
      rate_limit_hit: {
        Args: {
          _bucket: string
          _limit: number
          _user_id: string
          _window_seconds: number
        }
        Returns: boolean
      }
      shared_candidate_strength: {
        Args: { _geohash: string; _note_type: string; _window_days?: number }
        Returns: number
      }
      system_rollup: { Args: { _range_days?: number }; Returns: Json }
    }
    Enums: {
      action_risk: "low_reversible" | "standard" | "high"
      action_status:
        | "proposed"
        | "staged"
        | "approved"
        | "executed"
        | "audited"
        | "rolled_back"
        | "cancelled"
        | "needs_credentials"
      app_mode: "locked" | "observer" | "advisor" | "operator"
      app_role: "admin" | "user" | "owner"
      commitment_status: "open" | "done" | "cancelled"
      document_kind:
        | "nda"
        | "sow"
        | "service"
        | "lease"
        | "partnership"
        | "invoice"
        | "policy"
        | "letter"
        | "other"
        | "unknown"
      document_risk_severity: "low" | "medium" | "high"
      document_status:
        | "uploaded"
        | "extracting"
        | "extracted"
        | "reviewing"
        | "reviewed"
        | "failed"
        | "drafting"
        | "drafted"
        | "approved"
      document_version_source: "upload" | "extraction" | "draft" | "revision"
      executor_kind:
        | "webhook"
        | "telegram"
        | "google_calendar"
        | "email"
        | "first_party"
        | "gmail"
      investigation_status: "pending" | "running" | "complete" | "failed"
      message_role: "user" | "assistant" | "system" | "tool"
      nudge_status: "pending" | "seen" | "dismissed" | "acted"
      research_mode: "quick" | "deep"
      research_status: "pending" | "running" | "complete" | "failed" | "blocked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      action_risk: ["low_reversible", "standard", "high"],
      action_status: [
        "proposed",
        "staged",
        "approved",
        "executed",
        "audited",
        "rolled_back",
        "cancelled",
        "needs_credentials",
      ],
      app_mode: ["locked", "observer", "advisor", "operator"],
      app_role: ["admin", "user", "owner"],
      commitment_status: ["open", "done", "cancelled"],
      document_kind: [
        "nda",
        "sow",
        "service",
        "lease",
        "partnership",
        "invoice",
        "policy",
        "letter",
        "other",
        "unknown",
      ],
      document_risk_severity: ["low", "medium", "high"],
      document_status: [
        "uploaded",
        "extracting",
        "extracted",
        "reviewing",
        "reviewed",
        "failed",
        "drafting",
        "drafted",
        "approved",
      ],
      document_version_source: ["upload", "extraction", "draft", "revision"],
      executor_kind: [
        "webhook",
        "telegram",
        "google_calendar",
        "email",
        "first_party",
        "gmail",
      ],
      investigation_status: ["pending", "running", "complete", "failed"],
      message_role: ["user", "assistant", "system", "tool"],
      nudge_status: ["pending", "seen", "dismissed", "acted"],
      research_mode: ["quick", "deep"],
      research_status: ["pending", "running", "complete", "failed", "blocked"],
    },
  },
} as const
