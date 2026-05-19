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
          created_at: string
          description: string | null
          executed_at: string | null
          id: string
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
          created_at?: string
          description?: string | null
          executed_at?: string | null
          id?: string
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
          created_at?: string
          description?: string | null
          executed_at?: string | null
          id?: string
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
          payload: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event: string
          id?: string
          payload?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event?: string
          id?: string
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
          country: string | null
          created_at: string
          geo: Json | null
          id: string
          label: string
          region: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          geo?: Json | null
          id?: string
          label: string
          region?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          geo?: Json | null
          id?: string
          label?: string
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
      commitments: {
        Row: {
          created_at: string
          due_at: string | null
          embedding: string | null
          id: string
          last_reminded_at: string | null
          metadata: Json
          priority: string
          remind_at: string | null
          source_note: string | null
          status: Database["public"]["Enums"]["commitment_status"]
          summary: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          embedding?: string | null
          id?: string
          last_reminded_at?: string | null
          metadata?: Json
          priority?: string
          remind_at?: string | null
          source_note?: string | null
          status?: Database["public"]["Enums"]["commitment_status"]
          summary: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          embedding?: string | null
          id?: string
          last_reminded_at?: string | null
          metadata?: Json
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
          created_at: string
          id: string
          state: Json
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          state?: Json
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
      email_inbound_addresses: {
        Row: {
          active: boolean
          created_at: string
          id: string
          last_received_at: string | null
          slug: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          last_received_at?: string | null
          slug: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          last_received_at?: string | null
          slug?: string
          user_id?: string
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
      ingested_files: {
        Row: {
          created_at: string
          error: string | null
          filename: string
          id: string
          metadata: Json | null
          mime_type: string | null
          note_id: string | null
          size_bytes: number | null
          source: string
          status: string
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          filename: string
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          note_id?: string | null
          size_bytes?: number | null
          source?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          filename?: string
          id?: string
          metadata?: Json | null
          mime_type?: string | null
          note_id?: string | null
          size_bytes?: number | null
          source?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id?: string
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
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json | null
          role: Database["public"]["Enums"]["message_role"]
          tool_calls: Json | null
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          role: Database["public"]["Enums"]["message_role"]
          tool_calls?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
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
          embedding: string | null
          id: string
          metadata: Json | null
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          autolink_suggestions?: Json | null
          body?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          autolink_suggestions?: Json | null
          body?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
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
          priority?: number
          related_entity_id?: string | null
          related_entity_type?: string | null
          status?: Database["public"]["Enums"]["nudge_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
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
          created_at: string
          id: string
          kind: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
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
      sherlock_findings_cache: {
        Row: {
          confidence: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          findings: Json
          id: string
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
          scope_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_controls: {
        Row: {
          auto_refresh_enabled: boolean
          background_awareness_enabled: boolean
          calendar_sync_enabled: boolean
          community_public_fallback_enabled: boolean
          community_reddit_enabled: boolean
          deep_research_enabled: boolean
          external_apis_enabled: boolean
          file_analysis_enabled: boolean
          gemini_enabled: boolean
          global_usage_mode: string
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
          community_public_fallback_enabled?: boolean
          community_reddit_enabled?: boolean
          deep_research_enabled?: boolean
          external_apis_enabled?: boolean
          file_analysis_enabled?: boolean
          gemini_enabled?: boolean
          global_usage_mode?: string
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
          community_public_fallback_enabled?: boolean
          community_reddit_enabled?: boolean
          deep_research_enabled?: boolean
          external_apis_enabled?: boolean
          file_analysis_enabled?: boolean
          gemini_enabled?: boolean
          global_usage_mode?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      executor_kind: "webhook" | "telegram" | "google_calendar" | "email"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      executor_kind: ["webhook", "telegram", "google_calendar", "email"],
      investigation_status: ["pending", "running", "complete", "failed"],
      message_role: ["user", "assistant", "system", "tool"],
      nudge_status: ["pending", "seen", "dismissed", "acted"],
      research_mode: ["quick", "deep"],
      research_status: ["pending", "running", "complete", "failed", "blocked"],
    },
  },
} as const
