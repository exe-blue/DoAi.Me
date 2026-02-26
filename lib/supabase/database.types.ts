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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          ban_reason: string | null
          banned_at: string | null
          cooldown_until: string | null
          created_at: string | null
          created_year: number | null
          device_id: string | null
          email: string
          id: string
          last_login: string | null
          last_used: string | null
          login_count: number | null
          notes: string | null
          phone_verified: boolean | null
          recovery_email: string | null
          status: Database["public"]["Enums"]["account_status"] | null
          task_count: number | null
          updated_at: string | null
          worker_id: string | null
        }
        Insert: {
          ban_reason?: string | null
          banned_at?: string | null
          cooldown_until?: string | null
          created_at?: string | null
          created_year?: number | null
          device_id?: string | null
          email: string
          id?: string
          last_login?: string | null
          last_used?: string | null
          login_count?: number | null
          notes?: string | null
          phone_verified?: boolean | null
          recovery_email?: string | null
          status?: Database["public"]["Enums"]["account_status"] | null
          task_count?: number | null
          updated_at?: string | null
          worker_id?: string | null
        }
        Update: {
          ban_reason?: string | null
          banned_at?: string | null
          cooldown_until?: string | null
          created_at?: string | null
          created_year?: number | null
          device_id?: string | null
          email?: string
          id?: string
          last_login?: string | null
          last_used?: string | null
          login_count?: number | null
          notes?: string | null
          phone_verified?: boolean | null
          recovery_email?: string | null
          status?: Database["public"]["Enums"]["account_status"] | null
          task_count?: number | null
          updated_at?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "v_device_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_worker_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          id: string
          name: string
          handle: string | null
          profile_url: string | null
          banner_url: string | null
          thumbnail_url: string | null
          subscriber_count: string | null
          video_count: number
          total_views: number
          category: string | null
          is_monitored: boolean
          auto_collect: boolean
          collect_interval_hours: number
          last_collected_at: string | null
          last_video_check_at: string | null
          default_watch_duration_sec: number
          default_prob_like: number
          default_prob_comment: number
          default_prob_subscribe: number
          status: string | null
          metadata: Json
          created_at: string | null
          updated_at: string | null
          push_status: string | null
          push_expires_at: string | null
        }
        Insert: {
          id: string
          name: string
          handle?: string | null
          profile_url?: string | null
          banner_url?: string | null
          thumbnail_url?: string | null
          subscriber_count?: string | null
          video_count?: number
          total_views?: number
          category?: string | null
          is_monitored?: boolean
          auto_collect?: boolean
          collect_interval_hours?: number
          last_collected_at?: string | null
          last_video_check_at?: string | null
          default_watch_duration_sec?: number
          default_prob_like?: number
          default_prob_comment?: number
          default_prob_subscribe?: number
          status?: string | null
          metadata?: Json
          created_at?: string | null
          updated_at?: string | null
          push_status?: string | null
          push_expires_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          handle?: string | null
          profile_url?: string | null
          banner_url?: string | null
          thumbnail_url?: string | null
          subscriber_count?: string | null
          video_count?: number
          total_views?: number
          category?: string | null
          is_monitored?: boolean
          auto_collect?: boolean
          collect_interval_hours?: number
          last_collected_at?: string | null
          last_video_check_at?: string | null
          default_watch_duration_sec?: number
          default_prob_like?: number
          default_prob_comment?: number
          default_prob_subscribe?: number
          status?: string | null
          metadata?: Json
          created_at?: string | null
          updated_at?: string | null
          push_status?: string | null
          push_expires_at?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          account_id: string | null
          android_version: string | null
          battery_charging: boolean | null
          battery_level: number | null
          connection_mode:
            | Database["public"]["Enums"]["device_connection_mode"]
            | null
          created_at: string | null
          connection_id: string | null
          current_task_id: string | null
          id: string
          ip_intranet: unknown
          last_screenshot: string | null
          last_seen: string | null
          mirror_height: number | null
          mirror_width: number | null
          model: string | null
          nickname: string | null
          proxy_id: string | null
          screen_on: boolean | null
          serial: string
          sort_order: number | null
          source_height: number | null
          source_width: number | null
          status: Database["public"]["Enums"]["device_status"] | null
          storage_free_mb: number | null
          tag_group: string | null
          total_errors: number | null
          total_tasks: number | null
          updated_at: string | null
          worker_id: string | null
          xiaowei_connect_time: string | null
          xiaowei_serial: string | null
          youtube_version: string | null
        }
        Insert: {
          account_id?: string | null
          android_version?: string | null
          battery_charging?: boolean | null
          battery_level?: number | null
          connection_mode?:
            | Database["public"]["Enums"]["device_connection_mode"]
            | null
          connection_id?: string | null
          created_at?: string | null
          current_task_id?: string | null
          id?: string
          ip_intranet?: unknown
          last_screenshot?: string | null
          last_seen?: string | null
          mirror_height?: number | null
          mirror_width?: number | null
          model?: string | null
          nickname?: string | null
          proxy_id?: string | null
          screen_on?: boolean | null
          serial: string
          sort_order?: number | null
          source_height?: number | null
          source_width?: number | null
          status?: Database["public"]["Enums"]["device_status"] | null
          storage_free_mb?: number | null
          tag_group?: string | null
          total_errors?: number | null
          total_tasks?: number | null
          updated_at?: string | null
          worker_id?: string | null
          xiaowei_connect_time?: string | null
          xiaowei_serial?: string | null
          youtube_version?: string | null
        }
        Update: {
          account_id?: string | null
          android_version?: string | null
          battery_charging?: boolean | null
          battery_level?: number | null
          connection_mode?:
            | Database["public"]["Enums"]["device_connection_mode"]
            | null
          connection_id?: string | null
          created_at?: string | null
          current_task_id?: string | null
          id?: string
          ip_intranet?: unknown
          last_screenshot?: string | null
          last_seen?: string | null
          mirror_height?: number | null
          mirror_width?: number | null
          model?: string | null
          nickname?: string | null
          proxy_id?: string | null
          screen_on?: boolean | null
          serial?: string
          sort_order?: number | null
          source_height?: number | null
          source_width?: number | null
          status?: Database["public"]["Enums"]["device_status"] | null
          storage_free_mb?: number | null
          tag_group?: string | null
          total_errors?: number | null
          total_tasks?: number | null
          updated_at?: string | null
          worker_id?: string | null
          xiaowei_connect_time?: string | null
          xiaowei_serial?: string | null
          youtube_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_worker_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_devices_account"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_devices_current_task"
            columns: ["current_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_devices_current_task"
            columns: ["current_task_id"]
            isOneToOne: false
            referencedRelation: "v_task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_devices_proxy"
            columns: ["proxy_id"]
            isOneToOne: false
            referencedRelation: "proxies"
            referencedColumns: ["id"]
          },
        ]
      }
      presets: {
        Row: {
          category: string | null
          config: Json
          created_at: string | null
          description: string | null
          estimated_duration_ms: number | null
          fail_count: number | null
          id: string
          is_active: boolean | null
          name: string
          parameters_schema: Json | null
          requires_account: boolean | null
          requires_proxy: boolean | null
          run_count: number | null
          sort_order: number | null
          success_count: number | null
          tags: string[] | null
          type: Database["public"]["Enums"]["preset_type"]
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          config?: Json
          created_at?: string | null
          description?: string | null
          estimated_duration_ms?: number | null
          fail_count?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          parameters_schema?: Json | null
          requires_account?: boolean | null
          requires_proxy?: boolean | null
          run_count?: number | null
          sort_order?: number | null
          success_count?: number | null
          tags?: string[] | null
          type: Database["public"]["Enums"]["preset_type"]
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          config?: Json
          created_at?: string | null
          description?: string | null
          estimated_duration_ms?: number | null
          fail_count?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          parameters_schema?: Json | null
          requires_account?: boolean | null
          requires_proxy?: boolean | null
          run_count?: number | null
          sort_order?: number | null
          success_count?: number | null
          tags?: string[] | null
          type?: Database["public"]["Enums"]["preset_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      proxies: {
        Row: {
          address: string
          assigned_count: number | null
          created_at: string | null
          device_id: string | null
          id: string
          last_checked: string | null
          last_error: string | null
          location: string | null
          max_devices: number | null
          password: string | null
          provider: string | null
          status: Database["public"]["Enums"]["proxy_status"] | null
          type: Database["public"]["Enums"]["proxy_type"] | null
          updated_at: string | null
          username: string | null
          worker_id: string | null
        }
        Insert: {
          address: string
          assigned_count?: number | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          last_checked?: string | null
          last_error?: string | null
          location?: string | null
          max_devices?: number | null
          password?: string | null
          provider?: string | null
          status?: Database["public"]["Enums"]["proxy_status"] | null
          type?: Database["public"]["Enums"]["proxy_type"] | null
          updated_at?: string | null
          username?: string | null
          worker_id?: string | null
        }
        Update: {
          address?: string
          assigned_count?: number | null
          created_at?: string | null
          device_id?: string | null
          id?: string
          last_checked?: string | null
          last_error?: string | null
          location?: string | null
          max_devices?: number | null
          password?: string | null
          provider?: string | null
          status?: Database["public"]["Enums"]["proxy_status"] | null
          type?: Database["public"]["Enums"]["proxy_type"] | null
          updated_at?: string | null
          username?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proxies_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxies_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "v_device_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxies_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_worker_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxies_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string | null
          cron_expression: string
          id: string
          is_active: boolean | null
          last_run_at: string | null
          name: string
          next_run_at: string | null
          payload: Json | null
          preset_id: string | null
          run_count: number | null
          target_devices: string[] | null
          target_tag: string | null
          target_workers: string[] | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          cron_expression: string
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          payload?: Json | null
          preset_id?: string | null
          run_count?: number | null
          target_devices?: string[] | null
          target_tag?: string | null
          target_workers?: string[] | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          cron_expression?: string
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          payload?: Json | null
          preset_id?: string | null
          run_count?: number | null
          target_devices?: string[] | null
          target_tag?: string | null
          target_workers?: string[] | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "presets"
            referencedColumns: ["id"]
          },
        ]
      }
      screenshots: {
        Row: {
          created_at: string | null
          device_serial: string
          file_size_bytes: number | null
          id: string
          storage_path: string
          storage_url: string | null
          task_id: string | null
          trigger: string | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string | null
          device_serial: string
          file_size_bytes?: number | null
          id?: string
          storage_path: string
          storage_url?: string | null
          task_id?: string | null
          trigger?: string | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string | null
          device_serial?: string
          file_size_bytes?: number | null
          id?: string
          storage_path?: string
          storage_url?: string | null
          task_id?: string | null
          trigger?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screenshots_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_worker_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      system_events: {
        Row: {
          created_at: string | null
          device_serial: string | null
          event_type: string
          id: string
          message: string | null
          metadata: Json | null
          severity: Database["public"]["Enums"]["log_level"] | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string | null
          device_serial?: string | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          severity?: Database["public"]["Enums"]["log_level"] | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string | null
          device_serial?: string | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          severity?: Database["public"]["Enums"]["log_level"] | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_worker_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_events_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      task_devices: {
        Row: {
          claimed_by_pc_id: string | null
          completed_at: string | null
          config: Json | null
          created_at: string | null
          device_serial: string
          duration_ms: number | null
          error: string | null
          id: string
          last_error_at: string | null
          lease_expires_at: string | null
          pc_id: string | null
          progress: number | null
          result: Json | null
          retry_count: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_id: string
          worker_id: string | null
          xiaowei_action: string | null
          xiaowei_code: number | null
          xiaowei_request: Json | null
          xiaowei_response: Json | null
        }
        Insert: {
          claimed_by_pc_id?: string | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          device_serial: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          last_error_at?: string | null
          lease_expires_at?: string | null
          pc_id?: string | null
          progress?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_id: string
          worker_id?: string | null
          xiaowei_action?: string | null
          xiaowei_code?: number | null
          xiaowei_request?: Json | null
          xiaowei_response?: Json | null
        }
        Update: {
          claimed_by_pc_id?: string | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          device_serial?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          last_error_at?: string | null
          lease_expires_at?: string | null
          pc_id?: string | null
          progress?: number | null
          result?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          task_id?: string
          worker_id?: string | null
          xiaowei_action?: string | null
          xiaowei_code?: number | null
          xiaowei_request?: Json | null
          xiaowei_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "task_devices_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_worker_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      task_logs: {
        Row: {
          action: string | null
          created_at: string | null
          device_serial: string | null
          id: string
          level: Database["public"]["Enums"]["log_level"] | null
          message: string | null
          request: Json | null
          response: Json | null
          source: string | null
          task_device_id: string | null
          task_id: string | null
          worker_id: string | null
        }
        Insert: {
          action?: string | null
          created_at?: string | null
          device_serial?: string | null
          id?: string
          level?: Database["public"]["Enums"]["log_level"] | null
          message?: string | null
          request?: Json | null
          response?: Json | null
          source?: string | null
          task_device_id?: string | null
          task_id?: string | null
          worker_id?: string | null
        }
        Update: {
          action?: string | null
          created_at?: string | null
          device_serial?: string | null
          id?: string
          level?: Database["public"]["Enums"]["log_level"] | null
          message?: string | null
          request?: Json | null
          response?: Json | null
          source?: string | null
          task_device_id?: string | null
          task_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_logs_task_device_id_fkey"
            columns: ["task_device_id"]
            isOneToOne: false
            referencedRelation: "task_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_logs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "v_task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_worker_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_at: string | null
          channel_id: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          device_count: number | null
          devices_done: number | null
          devices_failed: number | null
          devices_total: number | null
          error: string | null
          id: string
          max_retries: number | null
          payload: Json
          preset_id: string | null
          priority: number | null
          repeat_count: number | null
          repeat_interval_ms: number | null
          result: Json | null
          retry_count: number | null
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          target_devices: string[] | null
          target_tag: string | null
          target_workers: string[] | null
          task_type: string | null
          timeout_at: string | null
          title: string | null
          type: Database["public"]["Enums"]["task_type"]
          video_id: string | null
          worker_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          device_count?: number | null
          devices_done?: number | null
          devices_failed?: number | null
          devices_total?: number | null
          error?: string | null
          id?: string
          max_retries?: number | null
          payload?: Json
          preset_id?: string | null
          priority?: number | null
          repeat_count?: number | null
          repeat_interval_ms?: number | null
          result?: Json | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          target_devices?: string[] | null
          target_tag?: string | null
          target_workers?: string[] | null
          task_type?: string | null
          timeout_at?: string | null
          title?: string | null
          type: Database["public"]["Enums"]["task_type"]
          video_id?: string | null
          worker_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          device_count?: number | null
          devices_done?: number | null
          devices_failed?: number | null
          devices_total?: number | null
          error?: string | null
          id?: string
          max_retries?: number | null
          payload?: Json
          preset_id?: string | null
          priority?: number | null
          repeat_count?: number | null
          repeat_interval_ms?: number | null
          result?: Json | null
          retry_count?: number | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          target_devices?: string[] | null
          target_tag?: string | null
          target_workers?: string[] | null
          task_type?: string | null
          timeout_at?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["task_type"]
          video_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_worker_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          id: string
          title: string
          channel_id: string | null
          channel_name: string | null
          thumbnail_url: string | null
          duration_sec: number | null
          video_duration_sec: number | null
          search_keyword: string | null
          target_views: number | null
          completed_views: number | null
          failed_views: number | null
          watch_duration_sec: number | null
          watch_duration_min_pct: number | null
          watch_duration_max_pct: number | null
          prob_like: number | null
          prob_comment: number | null
          prob_subscribe: number | null
          status: string | null
          priority: string | null
          tags: string[] | null
          metadata: Json | null
          last_scheduled_at: string | null
          created_at: string | null
          updated_at: string | null
          priority_enabled: boolean | null
          priority_updated_at: string | null
        }
        Insert: {
          id: string
          title: string
          channel_id?: string | null
          channel_name?: string | null
          thumbnail_url?: string | null
          duration_sec?: number | null
          video_duration_sec?: number | null
          search_keyword?: string | null
          target_views?: number | null
          completed_views?: number | null
          failed_views?: number | null
          watch_duration_sec?: number | null
          watch_duration_min_pct?: number | null
          watch_duration_max_pct?: number | null
          prob_like?: number | null
          prob_comment?: number | null
          prob_subscribe?: number | null
          status?: string | null
          priority?: string | null
          tags?: string[] | null
          metadata?: Json | null
          last_scheduled_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          priority_enabled?: boolean | null
          priority_updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          channel_id?: string | null
          channel_name?: string | null
          thumbnail_url?: string | null
          duration_sec?: number | null
          video_duration_sec?: number | null
          search_keyword?: string | null
          target_views?: number | null
          completed_views?: number | null
          failed_views?: number | null
          watch_duration_sec?: number | null
          watch_duration_min_pct?: number | null
          watch_duration_max_pct?: number | null
          prob_like?: number | null
          prob_comment?: number | null
          prob_subscribe?: number | null
          status?: string | null
          priority?: string | null
          tags?: string[] | null
          metadata?: Json | null
          last_scheduled_at?: string | null
          created_at?: string | null
          updated_at?: string | null
          priority_enabled?: boolean | null
          priority_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          agent_version: string | null
          config: Json | null
          created_at: string | null
          device_capacity: number | null
          device_count: number | null
          display_name: string | null
          hostname: string
          id: string
          ip_local: unknown
          ip_public: unknown
          last_error: string | null
          last_heartbeat: string | null
          os_info: string | null
          status: Database["public"]["Enums"]["worker_status"] | null
          updated_at: string | null
          xiaowei_connected: boolean | null
          xiaowei_version: string | null
        }
        Insert: {
          agent_version?: string | null
          config?: Json | null
          created_at?: string | null
          device_capacity?: number | null
          device_count?: number | null
          display_name?: string | null
          hostname: string
          id?: string
          ip_local?: unknown
          ip_public?: unknown
          last_error?: string | null
          last_heartbeat?: string | null
          os_info?: string | null
          status?: Database["public"]["Enums"]["worker_status"] | null
          updated_at?: string | null
          xiaowei_connected?: boolean | null
          xiaowei_version?: string | null
        }
        Update: {
          agent_version?: string | null
          config?: Json | null
          created_at?: string | null
          device_capacity?: number | null
          device_count?: number | null
          display_name?: string | null
          hostname?: string
          id?: string
          ip_local?: unknown
          ip_public?: unknown
          last_error?: string | null
          last_heartbeat?: string | null
          os_info?: string | null
          status?: Database["public"]["Enums"]["worker_status"] | null
          updated_at?: string | null
          xiaowei_connected?: boolean | null
          xiaowei_version?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: string
          key: string
          value: string
          description: string | null
          updated_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          key: string
          value: string
          description?: string | null
          updated_at?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          key?: string
          value?: string
          description?: string | null
          updated_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      command_logs: {
        Row: {
          id: string
          command: string
          target_type: string
          target_ids: string[] | null
          target_serials: string[] | null
          status: string
          results: Json | null
          initiated_by: string | null
          worker_id: string | null
          created_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          command: string
          target_type?: string
          target_ids?: string[] | null
          target_serials?: string[] | null
          status?: string
          results?: Json | null
          initiated_by?: string | null
          worker_id?: string | null
          created_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          command?: string
          target_type?: string
          target_ids?: string[] | null
          target_serials?: string[] | null
          status?: string
          results?: Json | null
          initiated_by?: string | null
          worker_id?: string | null
          created_at?: string | null
          completed_at?: string | null
        }
        Relationships: []
      }
      scripts: {
        Row: {
          id: string
          name: string
          version: number
          status: string
          type: string
          content: string
          timeout_ms: number
          params_schema: Json
          default_params: Json
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          version: number
          status?: string
          type?: string
          content: string
          timeout_ms?: number
          params_schema?: Json
          default_params?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          version?: number
          status?: string
          type?: string
          content?: string
          timeout_ms?: number
          params_schema?: Json
          default_params?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_dashboard_stats: {
        Row: {
          accounts_available: number | null
          accounts_banned: number | null
          accounts_in_use: number | null
          devices_busy: number | null
          devices_online: number | null
          devices_total: number | null
          proxies_active: number | null
          tasks_done_24h: number | null
          tasks_failed_24h: number | null
          tasks_pending: number | null
          tasks_running: number | null
          workers_online: number | null
          workers_total: number | null
        }
        Relationships: []
      }
      v_device_detail: {
        Row: {
          account_email: string | null
          account_id: string | null
          account_status: Database["public"]["Enums"]["account_status"] | null
          android_version: string | null
          battery_charging: boolean | null
          battery_level: number | null
          connection_mode:
            | Database["public"]["Enums"]["device_connection_mode"]
            | null
          created_at: string | null
          current_task_id: string | null
          id: string | null
          ip_intranet: unknown
          last_screenshot: string | null
          last_seen: string | null
          mirror_height: number | null
          mirror_width: number | null
          model: string | null
          nickname: string | null
          proxy_address: string | null
          proxy_id: string | null
          proxy_type_val: Database["public"]["Enums"]["proxy_type"] | null
          screen_on: boolean | null
          serial: string | null
          sort_order: number | null
          source_height: number | null
          source_width: number | null
          status: Database["public"]["Enums"]["device_status"] | null
          storage_free_mb: number | null
          tag_group: string | null
          total_errors: number | null
          total_tasks: number | null
          updated_at: string | null
          worker_hostname: string | null
          worker_id: string | null
          worker_status: Database["public"]["Enums"]["worker_status"] | null
          xiaowei_connect_time: string | null
          xiaowei_serial: string | null
          youtube_version: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "v_worker_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_devices_account"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_devices_current_task"
            columns: ["current_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_devices_current_task"
            columns: ["current_task_id"]
            isOneToOne: false
            referencedRelation: "v_task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_devices_proxy"
            columns: ["proxy_id"]
            isOneToOne: false
            referencedRelation: "proxies"
            referencedColumns: ["id"]
          },
        ]
      }
      v_task_list: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          devices_done: number | null
          devices_failed: number | null
          devices_total: number | null
          error: string | null
          id: string | null
          preset_name: string | null
          preset_type_val: Database["public"]["Enums"]["preset_type"] | null
          priority: number | null
          progress_pct: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string | null
          type: Database["public"]["Enums"]["task_type"] | null
          worker_hostname: string | null
        }
        Relationships: []
      }
      v_worker_summary: {
        Row: {
          agent_version: string | null
          device_capacity: number | null
          device_count: number | null
          devices_busy: number | null
          devices_error: number | null
          devices_offline: number | null
          devices_online: number | null
          display_name: string | null
          hostname: string | null
          id: string | null
          last_heartbeat: string | null
          status: Database["public"]["Enums"]["worker_status"] | null
          tasks_pending: number | null
          tasks_running: number | null
          xiaowei_connected: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      broadcast_to_channel: {
        Args: { p_channel: string; p_event: string; p_payload: Json }
        Returns: undefined
      }
      fn_check_task_timeouts: { Args: never; Returns: undefined }
      fn_check_worker_heartbeats: { Args: never; Returns: undefined }
      fn_release_cooled_accounts: { Args: never; Returns: undefined }
      run_task_via_http: { Args: never; Returns: undefined }
    }
    Enums: {
      account_status: "available" | "in_use" | "cooldown" | "banned" | "retired"
      device_connection_mode: "usb" | "wifi" | "otg" | "accessibility" | "cloud"
      device_status: "online" | "offline" | "busy" | "error"
      log_level: "debug" | "info" | "warn" | "error" | "fatal"
      preset_type: "action" | "script" | "adb" | "composite"
      proxy_status: "active" | "inactive" | "banned" | "testing"
      proxy_type: "http" | "https" | "socks5"
      task_status:
        | "pending"
        | "assigned"
        | "running"
        | "done"
        | "failed"
        | "cancelled"
        | "timeout"
        | "completed"
      task_type: "preset" | "adb" | "direct" | "batch" | "youtube"
      worker_status: "online" | "offline" | "error"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_status: ["available", "in_use", "cooldown", "banned", "retired"],
      device_connection_mode: ["usb", "wifi", "otg", "accessibility", "cloud"],
      device_status: ["online", "offline", "busy", "error"],
      log_level: ["debug", "info", "warn", "error", "fatal"],
      preset_type: ["action", "script", "adb", "composite"],
      proxy_status: ["active", "inactive", "banned", "testing"],
      proxy_type: ["http", "https", "socks5"],
      task_status: [
        "pending",
        "assigned",
        "running",
        "done",
        "failed",
        "cancelled",
        "timeout",
        "completed",
      ],
      task_type: ["preset", "adb", "direct", "batch", "youtube"],
      worker_status: ["online", "offline", "error"],
    },
  },
} as const
