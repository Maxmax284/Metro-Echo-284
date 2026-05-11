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
          created_at: string
          description: string | null
          id: string
          payload: Json
          result: Json | null
          risk: Database["public"]["Enums"]["action_risk"]
          source: string | null
          status: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          risk?: Database["public"]["Enums"]["action_risk"]
          source?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          risk?: Database["public"]["Enums"]["action_risk"]
          source?: string | null
          status?: Database["public"]["Enums"]["action_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      commitments: {
        Row: {
          created_at: string
          due_at: string | null
          embedding: string | null
          id: string
          last_reminded_at: string | null
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          home_geo: Json | null
          id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          home_geo?: Json | null
          id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          home_geo?: Json | null
          id?: string
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
      app_role: "admin" | "user"
      commitment_status: "open" | "done" | "cancelled"
      executor_kind: "webhook" | "telegram"
      investigation_status: "pending" | "running" | "complete" | "failed"
      message_role: "user" | "assistant" | "system" | "tool"
      nudge_status: "pending" | "seen" | "dismissed" | "acted"
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
      ],
      app_role: ["admin", "user"],
      commitment_status: ["open", "done", "cancelled"],
      executor_kind: ["webhook", "telegram"],
      investigation_status: ["pending", "running", "complete", "failed"],
      message_role: ["user", "assistant", "system", "tool"],
      nudge_status: ["pending", "seen", "dismissed", "acted"],
    },
  },
} as const
