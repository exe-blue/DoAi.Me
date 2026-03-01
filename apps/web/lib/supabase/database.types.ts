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
  public: {
    Tables: {
      alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string | null
          data: Json | null
          id: number
          level: string | null
          message: string
          source: string | null
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          data?: Json | null
          id?: number
          level?: string | null
          message: string
          source?: string | null
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          data?: Json | null
          id?: number
          level?: string | null
          message?: string
          source?: string | null
        }
        Relationships: []
      }
      app_users: {
        Row: {
          auth0_sub: string
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          picture: string | null
          updated_at: string | null
        }
        Insert: {
          auth0_sub: string
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          picture?: string | null
          updated_at?: string | null
        }
        Update: {
          auth0_sub?: string
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          picture?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      channels: {
        Row: {
          auto_collect: boolean | null
          banner_url: string | null
          category: string | null
          collect_interval_hours: number | null
          created_at: string | null
          default_prob_comment: number | null
          default_prob_like: number | null
          default_prob_subscribe: number | null
          default_watch_duration_sec: number | null
          handle: string | null
          id: string
          is_monitored: boolean | null
          last_collected_at: string | null
          last_video_check_at: string | null
          metadata: Json | null
          name: string
          profile_url: string | null
          push_expires_at: string | null
          push_status: string | null
          status: string | null
          subscriber_count: string | null
          thumbnail_url: string | null
          total_views: number | null
          updated_at: string | null
          video_count: number | null
        }
        Insert: {
          auto_collect?: boolean | null
          banner_url?: string | null
          category?: string | null
          collect_interval_hours?: number | null
          created_at?: string | null
          default_prob_comment?: number | null
          default_prob_like?: number | null
          default_prob_subscribe?: number | null
          default_watch_duration_sec?: number | null
          handle?: string | null
          id: string
          is_monitored?: boolean | null
          last_collected_at?: string | null
          last_video_check_at?: string | null
          metadata?: Json | null
          name: string
          profile_url?: string | null
          push_expires_at?: string | null
          push_status?: string | null
          status?: string | null
          subscriber_count?: string | null
          thumbnail_url?: string | null
          total_views?: number | null
          updated_at?: string | null
          video_count?: number | null
        }
        Update: {
          auto_collect?: boolean | null
          banner_url?: string | null
          category?: string | null
          collect_interval_hours?: number | null
          created_at?: string | null
          default_prob_comment?: number | null
          default_prob_like?: number | null
          default_prob_subscribe?: number | null
          default_watch_duration_sec?: number | null
          handle?: string | null
          id?: string
          is_monitored?: boolean | null
          last_collected_at?: string | null
          last_video_check_at?: string | null
          metadata?: Json | null
          name?: string
          profile_url?: string | null
          push_expires_at?: string | null
          push_status?: string | null
          status?: string | null
          subscriber_count?: string | null
          thumbnail_url?: string | null
          total_views?: number | null
          updated_at?: string | null
          video_count?: number | null
        }
        Relationships: []
      }
      command_logs: {
        Row: {
          command: string
          completed_at: string | null
          created_at: string | null
          id: string
          initiated_by: string | null
          results: Json | null
          status: string
          target_ids: string[] | null
          target_serials: string[] | null
          target_type: string
          worker_id: string | null
        }
        Insert: {
          command: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          initiated_by?: string | null
          results?: Json | null
          status?: string
          target_ids?: string[] | null
          target_serials?: string[] | null
          target_type?: string
          worker_id?: string | null
        }
        Update: {
          command?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          initiated_by?: string | null
          results?: Json | null
          status?: string
          target_ids?: string[] | null
          target_serials?: string[] | null
          target_type?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          active_devices: number | null
          avg_completion_rate: number | null
          avg_tasks_per_device: number | null
          avg_watch_time_sec: number | null
          by_hour: Json | null
          by_node: Json | null
          by_status: Json | null
          by_video: Json | null
          by_workflow: Json | null
          created_at: string | null
          date: string
          error_breakdown: Json | null
          error_summary: Json | null
          peak_hour: number | null
          success_rate: number | null
          total_cancelled: number | null
          total_comments: number | null
          total_completed: number | null
          total_executions: number | null
          total_failed: number | null
          total_likes: number | null
          total_subscribes: number | null
          total_watch_time_sec: number | null
          unique_devices: number | null
          unique_videos: number | null
          updated_at: string | null
        }
        Insert: {
          active_devices?: number | null
          avg_completion_rate?: number | null
          avg_tasks_per_device?: number | null
          avg_watch_time_sec?: number | null
          by_hour?: Json | null
          by_node?: Json | null
          by_status?: Json | null
          by_video?: Json | null
          by_workflow?: Json | null
          created_at?: string | null
          date: string
          error_breakdown?: Json | null
          error_summary?: Json | null
          peak_hour?: number | null
          success_rate?: number | null
          total_cancelled?: number | null
          total_comments?: number | null
          total_completed?: number | null
          total_executions?: number | null
          total_failed?: number | null
          total_likes?: number | null
          total_subscribes?: number | null
          total_watch_time_sec?: number | null
          unique_devices?: number | null
          unique_videos?: number | null
          updated_at?: string | null
        }
        Update: {
          active_devices?: number | null
          avg_completion_rate?: number | null
          avg_tasks_per_device?: number | null
          avg_watch_time_sec?: number | null
          by_hour?: Json | null
          by_node?: Json | null
          by_status?: Json | null
          by_video?: Json | null
          by_workflow?: Json | null
          created_at?: string | null
          date?: string
          error_breakdown?: Json | null
          error_summary?: Json | null
          peak_hour?: number | null
          success_rate?: number | null
          total_cancelled?: number | null
          total_comments?: number | null
          total_completed?: number | null
          total_executions?: number | null
          total_failed?: number | null
          total_likes?: number | null
          total_subscribes?: number | null
          total_watch_time_sec?: number | null
          unique_devices?: number | null
          unique_videos?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      device_commands: {
        Row: {
          command_type: string
          completed_at: string | null
          created_at: string | null
          device_id: string
          error_message: string | null
          id: string
          options: Json | null
          result: Json | null
          status: string | null
        }
        Insert: {
          command_type: string
          completed_at?: string | null
          created_at?: string | null
          device_id: string
          error_message?: string | null
          id?: string
          options?: Json | null
          result?: Json | null
          status?: string | null
        }
        Update: {
          command_type?: string
          completed_at?: string | null
          created_at?: string | null
          device_id?: string
          error_message?: string | null
          id?: string
          options?: Json | null
          result?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      device_issues: {
        Row: {
          auto_recoverable: boolean | null
          created_at: string | null
          details: Json | null
          device_id: string
          id: string
          message: string
          recovery_attempts: number | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          auto_recoverable?: boolean | null
          created_at?: string | null
          details?: Json | null
          device_id: string
          id?: string
          message: string
          recovery_attempts?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          auto_recoverable?: boolean | null
          created_at?: string | null
          details?: Json | null
          device_id?: string
          id?: string
          message?: string
          recovery_attempts?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_device_issues_device_serial"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["serial"]
          },
          {
            foreignKeyName: "fk_device_issues_device_serial"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "recent_tasks"
            referencedColumns: ["device_serial"]
          },
        ]
      }
      device_onboarding_states: {
        Row: {
          completed_at: string | null
          completed_steps: string[] | null
          config: Json | null
          created_at: string | null
          current_step: string | null
          device_id: string
          error_message: string | null
          id: number
          node_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["onboarding_status"]
          step_results: Json | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_steps?: string[] | null
          config?: Json | null
          created_at?: string | null
          current_step?: string | null
          device_id: string
          error_message?: string | null
          id?: number
          node_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          step_results?: Json | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_steps?: string[] | null
          config?: Json | null
          created_at?: string | null
          current_step?: string | null
          device_id?: string
          error_message?: string | null
          id?: number
          node_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          step_results?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      device_states: {
        Row: {
          battery: number | null
          current_step: string | null
          current_workflow_id: string | null
          device_id: string
          error_message: string | null
          id: string
          last_heartbeat: string | null
          node_id: string | null
          progress: number | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          battery?: number | null
          current_step?: string | null
          current_workflow_id?: string | null
          device_id: string
          error_message?: string | null
          id?: string
          last_heartbeat?: string | null
          node_id?: string | null
          progress?: number | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          battery?: number | null
          current_step?: string | null
          current_workflow_id?: string | null
          device_id?: string
          error_message?: string | null
          id?: string
          last_heartbeat?: string | null
          node_id?: string | null
          progress?: number | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          android_version: string | null
          battery: number | null
          battery_level: number | null
          connection_id: string | null
          connection_type: string | null
          consecutive_errors: number | null
          cpu_usage: number | null
          created_at: string | null
          current_assignment_id: string | null
          current_video_title: string | null
          daily_watch_count: number | null
          daily_watch_seconds: number | null
          device_code: string | null
          device_number: number | null
          error_count: number | null
          group_id: string | null
          id: string
          ip_address: unknown
          is_charging: boolean | null
          last_error: string | null
          last_error_at: string | null
          last_heartbeat: string | null
          last_seen: string | null
          last_seen_at: string | null
          last_task_at: string | null
          last_workflow_id: string | null
          management_code: string | null
          management_number: string | null
          memory_total: number | null
          memory_used: number | null
          metadata: Json | null
          model: string | null
          model_name: string | null
          name: string | null
          pc_id: string | null
          proxy: string | null
          proxy_id: string | null
          serial: string | null
          serial_number: string | null
          state: string | null
          status: string | null
          storage_total: number | null
          storage_used: number | null
          task_status: string | null
          temperature: number | null
          total_tasks_completed: number | null
          total_tasks_failed: number | null
          updated_at: string | null
          uptime_seconds: number | null
          usb_port: number | null
          watch_progress: number | null
          wifi_signal: number | null
        }
        Insert: {
          android_version?: string | null
          battery?: number | null
          battery_level?: number | null
          connection_id?: string | null
          connection_type?: string | null
          consecutive_errors?: number | null
          cpu_usage?: number | null
          created_at?: string | null
          current_assignment_id?: string | null
          current_video_title?: string | null
          daily_watch_count?: number | null
          daily_watch_seconds?: number | null
          device_code?: string | null
          device_number?: number | null
          error_count?: number | null
          group_id?: string | null
          id?: string
          ip_address?: unknown
          is_charging?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          last_heartbeat?: string | null
          last_seen?: string | null
          last_seen_at?: string | null
          last_task_at?: string | null
          last_workflow_id?: string | null
          management_code?: string | null
          management_number?: string | null
          memory_total?: number | null
          memory_used?: number | null
          metadata?: Json | null
          model?: string | null
          model_name?: string | null
          name?: string | null
          pc_id?: string | null
          proxy?: string | null
          proxy_id?: string | null
          serial?: string | null
          serial_number?: string | null
          state?: string | null
          status?: string | null
          storage_total?: number | null
          storage_used?: number | null
          task_status?: string | null
          temperature?: number | null
          total_tasks_completed?: number | null
          total_tasks_failed?: number | null
          updated_at?: string | null
          uptime_seconds?: number | null
          usb_port?: number | null
          watch_progress?: number | null
          wifi_signal?: number | null
        }
        Update: {
          android_version?: string | null
          battery?: number | null
          battery_level?: number | null
          connection_id?: string | null
          connection_type?: string | null
          consecutive_errors?: number | null
          cpu_usage?: number | null
          created_at?: string | null
          current_assignment_id?: string | null
          current_video_title?: string | null
          daily_watch_count?: number | null
          daily_watch_seconds?: number | null
          device_code?: string | null
          device_number?: number | null
          error_count?: number | null
          group_id?: string | null
          id?: string
          ip_address?: unknown
          is_charging?: boolean | null
          last_error?: string | null
          last_error_at?: string | null
          last_heartbeat?: string | null
          last_seen?: string | null
          last_seen_at?: string | null
          last_task_at?: string | null
          last_workflow_id?: string | null
          management_code?: string | null
          management_number?: string | null
          memory_total?: number | null
          memory_used?: number | null
          metadata?: Json | null
          model?: string | null
          model_name?: string | null
          name?: string | null
          pc_id?: string | null
          proxy?: string | null
          proxy_id?: string | null
          serial?: string | null
          serial_number?: string | null
          state?: string | null
          status?: string | null
          storage_total?: number | null
          storage_used?: number | null
          task_status?: string | null
          temperature?: number | null
          total_tasks_completed?: number | null
          total_tasks_failed?: number | null
          updated_at?: string | null
          uptime_seconds?: number | null
          usb_port?: number | null
          watch_progress?: number | null
          wifi_signal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "dashboard_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "devices_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pc_device_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "devices_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pc_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devices_proxy_id_fkey"
            columns: ["proxy_id"]
            isOneToOne: false
            referencedRelation: "proxies"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_logs: {
        Row: {
          created_at: string | null
          data: Json | null
          details: Json | null
          device_id: string | null
          error_category: string | null
          execution_id: string | null
          id: number
          level: string | null
          message: string | null
          status: string | null
          step_id: string | null
          video_id: string | null
          watch_duration_sec: number | null
          workflow_id: string | null
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          details?: Json | null
          device_id?: string | null
          error_category?: string | null
          execution_id?: string | null
          id?: number
          level?: string | null
          message?: string | null
          status?: string | null
          step_id?: string | null
          video_id?: string | null
          watch_duration_sec?: number | null
          workflow_id?: string | null
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          details?: Json | null
          device_id?: string | null
          error_category?: string | null
          execution_id?: string | null
          id?: number
          level?: string | null
          message?: string | null
          status?: string | null
          step_id?: string | null
          video_id?: string | null
          watch_duration_sec?: number | null
          workflow_id?: string | null
        }
        Relationships: []
      }
      job_assignments: {
        Row: {
          agent_id: string | null
          assigned_at: string | null
          completed_at: string | null
          created_at: string | null
          device_id: string
          device_serial: string | null
          did_comment: boolean | null
          did_like: boolean | null
          did_playlist: boolean | null
          error_code: string | null
          error_log: string | null
          final_duration_sec: number | null
          id: string
          job_id: string
          pc_id: string | null
          progress_pct: number
          retry_count: number
          search_success: boolean | null
          started_at: string | null
          status: string
          video_id: string | null
          watch_percentage: number | null
        }
        Insert: {
          agent_id?: string | null
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          device_id: string
          device_serial?: string | null
          did_comment?: boolean | null
          did_like?: boolean | null
          did_playlist?: boolean | null
          error_code?: string | null
          error_log?: string | null
          final_duration_sec?: number | null
          id?: string
          job_id: string
          pc_id?: string | null
          progress_pct?: number
          retry_count?: number
          search_success?: boolean | null
          started_at?: string | null
          status?: string
          video_id?: string | null
          watch_percentage?: number | null
        }
        Update: {
          agent_id?: string | null
          assigned_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          device_id?: string
          device_serial?: string | null
          did_comment?: boolean | null
          did_like?: boolean | null
          did_playlist?: boolean | null
          error_code?: string | null
          error_log?: string | null
          final_duration_sec?: number | null
          id?: string
          job_id?: string
          pc_id?: string | null
          progress_pct?: number
          retry_count?: number
          search_success?: boolean | null
          started_at?: string | null
          status?: string
          video_id?: string | null
          watch_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_assignments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "dashboard_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "job_assignments_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pc_device_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "job_assignments_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pc_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pcs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          base_reward: number
          created_at: string | null
          duration_max_pct: number
          duration_min_pct: number
          duration_sec: number | null
          id: string
          is_active: boolean
          keyword: string | null
          like_probability: number | null
          prob_comment: number
          prob_like: number
          prob_playlist: number
          script_type: string
          target_group: string | null
          target_url: string
          title: string
          total_assignments: number
          updated_at: string | null
          video_title: string | null
          video_url: string | null
        }
        Insert: {
          base_reward?: number
          created_at?: string | null
          duration_max_pct?: number
          duration_min_pct?: number
          duration_sec?: number | null
          id?: string
          is_active?: boolean
          keyword?: string | null
          like_probability?: number | null
          prob_comment?: number
          prob_like?: number
          prob_playlist?: number
          script_type?: string
          target_group?: string | null
          target_url: string
          title: string
          total_assignments?: number
          updated_at?: string | null
          video_title?: string | null
          video_url?: string | null
        }
        Update: {
          base_reward?: number
          created_at?: string | null
          duration_max_pct?: number
          duration_min_pct?: number
          duration_sec?: number | null
          id?: string
          is_active?: boolean
          keyword?: string | null
          like_probability?: number | null
          prob_comment?: number
          prob_like?: number
          prob_playlist?: number
          script_type?: string
          target_group?: string | null
          target_url?: string
          title?: string
          total_assignments?: number
          updated_at?: string | null
          video_title?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      keywords: {
        Row: {
          category: string | null
          collect_interval_hours: number | null
          created_at: string | null
          discovered_count: number | null
          exclude_keywords: string[] | null
          id: number
          is_active: boolean | null
          keyword: string
          last_collected_at: string | null
          max_duration_sec: number | null
          max_results: number | null
          metadata: Json | null
          min_duration_sec: number | null
          min_views: number | null
          updated_at: string | null
          used_count: number | null
        }
        Insert: {
          category?: string | null
          collect_interval_hours?: number | null
          created_at?: string | null
          discovered_count?: number | null
          exclude_keywords?: string[] | null
          id?: number
          is_active?: boolean | null
          keyword: string
          last_collected_at?: string | null
          max_duration_sec?: number | null
          max_results?: number | null
          metadata?: Json | null
          min_duration_sec?: number | null
          min_views?: number | null
          updated_at?: string | null
          used_count?: number | null
        }
        Update: {
          category?: string | null
          collect_interval_hours?: number | null
          created_at?: string | null
          discovered_count?: number | null
          exclude_keywords?: string[] | null
          id?: number
          is_active?: boolean | null
          keyword?: string
          last_collected_at?: string | null
          max_duration_sec?: number | null
          max_results?: number | null
          metadata?: Json | null
          min_duration_sec?: number | null
          min_views?: number | null
          updated_at?: string | null
          used_count?: number | null
        }
        Relationships: []
      }
      monitored_channels: {
        Row: {
          channel_id: string
          channel_name: string
          created_at: string | null
          id: string
          is_active: boolean
          last_checked_at: string | null
          last_video_id: string | null
          preset_settings: Json | null
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          channel_name: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_video_id?: string | null
          preset_settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          channel_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          last_checked_at?: string | null
          last_video_id?: string | null
          preset_settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      nodes: {
        Row: {
          active_devices: number | null
          connected_at: string | null
          cpu_usage: number | null
          created_at: string | null
          error_devices: number | null
          id: string
          idle_devices: number | null
          ip_address: string | null
          last_heartbeat: string | null
          memory_usage: number | null
          metadata: Json | null
          name: string | null
          status: string | null
          tasks_per_minute: number | null
          total_devices: number | null
          updated_at: string | null
        }
        Insert: {
          active_devices?: number | null
          connected_at?: string | null
          cpu_usage?: number | null
          created_at?: string | null
          error_devices?: number | null
          id: string
          idle_devices?: number | null
          ip_address?: string | null
          last_heartbeat?: string | null
          memory_usage?: number | null
          metadata?: Json | null
          name?: string | null
          status?: string | null
          tasks_per_minute?: number | null
          total_devices?: number | null
          updated_at?: string | null
        }
        Update: {
          active_devices?: number | null
          connected_at?: string | null
          cpu_usage?: number | null
          created_at?: string | null
          error_devices?: number | null
          id?: string
          idle_devices?: number | null
          ip_address?: string | null
          last_heartbeat?: string | null
          memory_usage?: number | null
          metadata?: Json | null
          name?: string | null
          status?: string | null
          tasks_per_minute?: number | null
          total_devices?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pcs: {
        Row: {
          agent_version: string | null
          created_at: string | null
          hostname: string | null
          id: string
          ip_address: unknown
          label: string | null
          last_heartbeat: string | null
          location: string | null
          max_devices: number | null
          pc_number: string
          status: string | null
          system: Json | null
          updated_at: string | null
        }
        Insert: {
          agent_version?: string | null
          created_at?: string | null
          hostname?: string | null
          id?: string
          ip_address?: unknown
          label?: string | null
          last_heartbeat?: string | null
          location?: string | null
          max_devices?: number | null
          pc_number: string
          status?: string | null
          system?: Json | null
          updated_at?: string | null
        }
        Update: {
          agent_version?: string | null
          created_at?: string | null
          hostname?: string | null
          id?: string
          ip_address?: unknown
          label?: string | null
          last_heartbeat?: string | null
          location?: string | null
          max_devices?: number | null
          pc_number?: string
          status?: string | null
          system?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      preset_commands: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_log: string | null
          id: string
          options: Json | null
          pc_id: string
          preset: string
          result: Json | null
          serial: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_log?: string | null
          id?: string
          options?: Json | null
          pc_id: string
          preset: string
          result?: Json | null
          serial?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_log?: string | null
          id?: string
          options?: Json | null
          pc_id?: string
          preset?: string
          result?: Json | null
          serial?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      proxies: {
        Row: {
          address: string
          assigned_count: number | null
          created_at: string | null
          device_id: string | null
          fail_count: number
          id: string
          last_checked: string | null
          last_error: string | null
          location: string | null
          max_devices: number | null
          password: string | null
          provider: string | null
          status: Database["public"]["Enums"]["proxy_status"] | null
          type: Database["public"]["Enums"]["proxy_type"]
          updated_at: string | null
          username: string | null
          worker_id: string | null
        }
        Insert: {
          address: string
          assigned_count?: number | null
          created_at?: string | null
          device_id?: string | null
          fail_count?: number
          id?: string
          last_checked?: string | null
          last_error?: string | null
          location?: string | null
          max_devices?: number | null
          password?: string | null
          provider?: string | null
          status?: Database["public"]["Enums"]["proxy_status"] | null
          type?: Database["public"]["Enums"]["proxy_type"]
          updated_at?: string | null
          username?: string | null
          worker_id?: string | null
        }
        Update: {
          address?: string
          assigned_count?: number | null
          created_at?: string | null
          device_id?: string | null
          fail_count?: number
          id?: string
          last_checked?: string | null
          last_error?: string | null
          location?: string | null
          max_devices?: number | null
          password?: string | null
          provider?: string | null
          status?: Database["public"]["Enums"]["proxy_status"] | null
          type?: Database["public"]["Enums"]["proxy_type"]
          updated_at?: string | null
          username?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proxies_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxies_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxies_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "dashboard_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "proxies_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "pc_device_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "proxies_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "pc_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proxies_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "pcs"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_logs: {
        Row: {
          actual_duration_sec: number
          assignment_id: string
          created_at: string | null
          id: string
          job_id: string
          rank_in_group: number | null
          watch_percentage: number
        }
        Insert: {
          actual_duration_sec: number
          assignment_id: string
          created_at?: string | null
          id?: string
          job_id: string
          rank_in_group?: number | null
          watch_percentage: number
        }
        Update: {
          actual_duration_sec?: number
          assignment_id?: string
          created_at?: string | null
          id?: string
          job_id?: string
          rank_in_group?: number | null
          watch_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_logs_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "job_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_runs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          schedule_id: number
          started_at: string | null
          status: string | null
          tasks_completed: number | null
          tasks_created: number | null
          tasks_failed: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          schedule_id: number
          started_at?: string | null
          status?: string | null
          tasks_completed?: number | null
          tasks_created?: number | null
          tasks_failed?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          schedule_id?: number
          started_at?: string | null
          status?: string | null
          tasks_completed?: number | null
          tasks_created?: number | null
          tasks_failed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          batch_size: number | null
          created_at: string | null
          cron_expression: string | null
          description: string | null
          fail_count: number | null
          id: number
          interval_minutes: number | null
          is_active: boolean | null
          last_run_at: string | null
          last_run_result: Json | null
          last_run_status: string | null
          last_status: string | null
          max_concurrent: number | null
          name: string
          next_run_at: string | null
          params: Json | null
          run_count: number | null
          schedule_type: string | null
          success_count: number | null
          target_ids: string[] | null
          target_type: string | null
          task_config: Json | null
          timezone: string | null
          updated_at: string | null
          video_filter: Json | null
          video_id: string | null
          workflow_id: string | null
        }
        Insert: {
          batch_size?: number | null
          created_at?: string | null
          cron_expression?: string | null
          description?: string | null
          fail_count?: number | null
          id?: number
          interval_minutes?: number | null
          is_active?: boolean | null
          last_run_at?: string | null
          last_run_result?: Json | null
          last_run_status?: string | null
          last_status?: string | null
          max_concurrent?: number | null
          name: string
          next_run_at?: string | null
          params?: Json | null
          run_count?: number | null
          schedule_type?: string | null
          success_count?: number | null
          target_ids?: string[] | null
          target_type?: string | null
          task_config?: Json | null
          timezone?: string | null
          updated_at?: string | null
          video_filter?: Json | null
          video_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          batch_size?: number | null
          created_at?: string | null
          cron_expression?: string | null
          description?: string | null
          fail_count?: number | null
          id?: number
          interval_minutes?: number | null
          is_active?: boolean | null
          last_run_at?: string | null
          last_run_result?: Json | null
          last_run_status?: string | null
          last_status?: string | null
          max_concurrent?: number | null
          name?: string
          next_run_at?: string | null
          params?: Json | null
          run_count?: number | null
          schedule_type?: string | null
          success_count?: number | null
          target_ids?: string[] | null
          target_type?: string | null
          task_config?: Json | null
          timezone?: string | null
          updated_at?: string | null
          video_filter?: Json | null
          video_id?: string | null
          workflow_id?: string | null
        }
        Relationships: []
      }
      scrcpy_commands: {
        Row: {
          command_data: Json | null
          command_type: string
          completed_at: string | null
          created_at: string | null
          device_id: string
          error_message: string | null
          id: string
          options: Json | null
          pc_id: string | null
          result_data: Json | null
          status: string | null
        }
        Insert: {
          command_data?: Json | null
          command_type: string
          completed_at?: string | null
          created_at?: string | null
          device_id: string
          error_message?: string | null
          id?: string
          options?: Json | null
          pc_id?: string | null
          result_data?: Json | null
          status?: string | null
        }
        Update: {
          command_data?: Json | null
          command_type?: string
          completed_at?: string | null
          created_at?: string | null
          device_id?: string
          error_message?: string | null
          id?: string
          options?: Json | null
          pc_id?: string | null
          result_data?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      script_device_results: {
        Row: {
          completed_at: string | null
          created_at: string
          device_id: string
          duration_ms: number | null
          error_message: string | null
          execution_id: string
          id: string
          management_code: string | null
          output: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          device_id: string
          duration_ms?: number | null
          error_message?: string | null
          execution_id: string
          id?: string
          management_code?: string | null
          output?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          device_id?: string
          duration_ms?: number | null
          error_message?: string | null
          execution_id?: string
          id?: string
          management_code?: string | null
          output?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_device_results_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "script_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      script_executions: {
        Row: {
          completed_at: string | null
          completed_devices: number
          created_at: string
          device_ids: string[]
          failed_devices: number
          id: string
          params: Json
          pc_ids: string[]
          script_id: string
          script_version: number
          started_at: string | null
          status: string
          total_devices: number
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_devices?: number
          created_at?: string
          device_ids?: string[]
          failed_devices?: number
          id?: string
          params?: Json
          pc_ids?: string[]
          script_id: string
          script_version: number
          started_at?: string | null
          status?: string
          total_devices?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_devices?: number
          created_at?: string
          device_ids?: string[]
          failed_devices?: number
          id?: string
          params?: Json
          pc_ids?: string[]
          script_id?: string
          script_version?: number
          started_at?: string | null
          status?: string
          total_devices?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_executions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          default_params: Json
          description: string | null
          id: string
          name: string
          params_schema: Json
          status: string
          tags: string[]
          target_group: string | null
          timeout_ms: number
          type: string
          updated_at: string
          version: number
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          default_params?: Json
          description?: string | null
          id?: string
          name: string
          params_schema?: Json
          status?: string
          tags?: string[]
          target_group?: string | null
          timeout_ms?: number
          type: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          default_params?: Json
          description?: string | null
          id?: string
          name?: string
          params_schema?: Json
          status?: string
          tags?: string[]
          target_group?: string | null
          timeout_ms?: number
          type?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          component: string
          created_at: string | null
          details: Json | null
          device_id: string | null
          id: string
          level: string
          message: string
          node_id: string | null
          request_id: string | null
          source: string
          stack_trace: string | null
          timestamp: string | null
        }
        Insert: {
          component: string
          created_at?: string | null
          details?: Json | null
          device_id?: string | null
          id?: string
          level: string
          message: string
          node_id?: string | null
          request_id?: string | null
          source: string
          stack_trace?: string | null
          timestamp?: string | null
        }
        Update: {
          component?: string
          created_at?: string | null
          details?: Json | null
          device_id?: string | null
          id?: string
          level?: string
          message?: string
          node_id?: string | null
          request_id?: string | null
          source?: string
          stack_trace?: string | null
          timestamp?: string | null
        }
        Relationships: []
      }
      task_devices: {
        Row: {
          attempt: number
          claimed_by_pc_id: string | null
          completed_at: string | null
          config: Json
          created_at: string
          device_id: string
          device_target: string | null
          error: string | null
          id: string
          lease_expires_at: string | null
          max_attempts: number
          pc_id: string
          result: Json | null
          started_at: string | null
          status: string
          task_id: string
          updated_at: string
        }
        Insert: {
          attempt?: number
          claimed_by_pc_id?: string | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          device_id: string
          device_target?: string | null
          error?: string | null
          id?: string
          lease_expires_at?: string | null
          max_attempts?: number
          pc_id: string
          result?: Json | null
          started_at?: string | null
          status?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          attempt?: number
          claimed_by_pc_id?: string | null
          completed_at?: string | null
          config?: Json
          created_at?: string
          device_id?: string
          device_target?: string | null
          error?: string | null
          id?: string
          lease_expires_at?: string | null
          max_attempts?: number
          pc_id?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_devices_claimed_by_pc_id_fkey"
            columns: ["claimed_by_pc_id"]
            isOneToOne: false
            referencedRelation: "dashboard_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "task_devices_claimed_by_pc_id_fkey"
            columns: ["claimed_by_pc_id"]
            isOneToOne: false
            referencedRelation: "pc_device_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "task_devices_claimed_by_pc_id_fkey"
            columns: ["claimed_by_pc_id"]
            isOneToOne: false
            referencedRelation: "pc_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_claimed_by_pc_id_fkey"
            columns: ["claimed_by_pc_id"]
            isOneToOne: false
            referencedRelation: "pcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "dashboard_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "task_devices_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pc_device_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "task_devices_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pc_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pcs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "recent_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_devices_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_queue: {
        Row: {
          created_at: string
          dispatched_at: string | null
          dispatched_task_id: string | null
          id: string
          priority: number
          status: string
          task_config: Json
        }
        Insert: {
          created_at?: string
          dispatched_at?: string | null
          dispatched_task_id?: string | null
          id?: string
          priority?: number
          status?: string
          task_config: Json
        }
        Update: {
          created_at?: string
          dispatched_at?: string | null
          dispatched_task_id?: string | null
          id?: string
          priority?: number
          status?: string
          task_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "task_queue_dispatched_task_id_fkey"
            columns: ["dispatched_task_id"]
            isOneToOne: false
            referencedRelation: "recent_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_queue_dispatched_task_id_fkey"
            columns: ["dispatched_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_schedules: {
        Row: {
          created_at: string
          cron_expression: string
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          next_run_at: string | null
          run_count: number
          task_config: Json
        }
        Insert: {
          created_at?: string
          cron_expression: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          run_count?: number
          task_config: Json
        }
        Update: {
          created_at?: string
          cron_expression?: string
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          run_count?: number
          task_config?: Json
        }
        Relationships: []
      }
      tasks: {
        Row: {
          celery_task_id: string | null
          completed_at: string | null
          created_at: string | null
          device_id: string | null
          duration_seconds: number | null
          error: string | null
          error_traceback: string | null
          id: string
          max_retries: number | null
          meta: Json | null
          payload: Json | null
          pc_id: string | null
          progress: number | null
          progress_message: string | null
          queue_name: string | null
          result: Json | null
          retries: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          task_name: string
        }
        Insert: {
          celery_task_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          device_id?: string | null
          duration_seconds?: number | null
          error?: string | null
          error_traceback?: string | null
          id?: string
          max_retries?: number | null
          meta?: Json | null
          payload?: Json | null
          pc_id?: string | null
          progress?: number | null
          progress_message?: string | null
          queue_name?: string | null
          result?: Json | null
          retries?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_name: string
        }
        Update: {
          celery_task_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          device_id?: string | null
          duration_seconds?: number | null
          error?: string | null
          error_traceback?: string | null
          id?: string
          max_retries?: number | null
          meta?: Json | null
          payload?: Json | null
          pc_id?: string | null
          progress?: number | null
          progress_message?: string | null
          queue_name?: string | null
          result?: Json | null
          retries?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          task_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "device_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "dashboard_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "tasks_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pc_device_summary"
            referencedColumns: ["pc_id"]
          },
          {
            foreignKeyName: "tasks_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pc_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_pc_id_fkey"
            columns: ["pc_id"]
            isOneToOne: false
            referencedRelation: "pcs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_executions: {
        Row: {
          actual_watch_duration_sec: number | null
          comment_text: string | null
          completed_at: string | null
          created_at: string | null
          device_id: string
          did_comment: boolean | null
          did_like: boolean | null
          did_subscribe: boolean | null
          error_code: string | null
          error_message: string | null
          execution_date: string | null
          id: string
          node_id: string | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          video_id: string
          watch_percentage: number | null
        }
        Insert: {
          actual_watch_duration_sec?: number | null
          comment_text?: string | null
          completed_at?: string | null
          created_at?: string | null
          device_id: string
          did_comment?: boolean | null
          did_like?: boolean | null
          did_subscribe?: boolean | null
          error_code?: string | null
          error_message?: string | null
          execution_date?: string | null
          id?: string
          node_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          video_id: string
          watch_percentage?: number | null
        }
        Update: {
          actual_watch_duration_sec?: number | null
          comment_text?: string | null
          completed_at?: string | null
          created_at?: string | null
          device_id?: string
          did_comment?: boolean | null
          did_like?: boolean | null
          did_subscribe?: boolean | null
          error_code?: string | null
          error_message?: string | null
          execution_date?: string | null
          id?: string
          node_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          video_id?: string
          watch_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_video_executions_video_id"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_video_executions_video_id"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          channel_id: string | null
          channel_name: string | null
          completed_views: number | null
          created_at: string | null
          duration_sec: number | null
          failed_views: number | null
          id: string
          last_scheduled_at: string | null
          metadata: Json | null
          priority: string | null
          priority_enabled: boolean | null
          priority_updated_at: string | null
          prob_comment: number | null
          prob_like: number | null
          prob_subscribe: number | null
          search_keyword: string | null
          status: string | null
          tags: string[] | null
          target_views: number | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string | null
          video_duration_sec: number | null
          watch_duration_max_pct: number | null
          watch_duration_min_pct: number | null
          watch_duration_sec: number | null
        }
        Insert: {
          channel_id?: string | null
          channel_name?: string | null
          completed_views?: number | null
          created_at?: string | null
          duration_sec?: number | null
          failed_views?: number | null
          id: string
          last_scheduled_at?: string | null
          metadata?: Json | null
          priority?: string | null
          priority_enabled?: boolean | null
          priority_updated_at?: string | null
          prob_comment?: number | null
          prob_like?: number | null
          prob_subscribe?: number | null
          search_keyword?: string | null
          status?: string | null
          tags?: string[] | null
          target_views?: number | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string | null
          video_duration_sec?: number | null
          watch_duration_max_pct?: number | null
          watch_duration_min_pct?: number | null
          watch_duration_sec?: number | null
        }
        Update: {
          channel_id?: string | null
          channel_name?: string | null
          completed_views?: number | null
          created_at?: string | null
          duration_sec?: number | null
          failed_views?: number | null
          id?: string
          last_scheduled_at?: string | null
          metadata?: Json | null
          priority?: string | null
          priority_enabled?: boolean | null
          priority_updated_at?: string | null
          prob_comment?: number | null
          prob_like?: number | null
          prob_subscribe?: number | null
          search_keyword?: string | null
          status?: string | null
          tags?: string[] | null
          target_views?: number | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string | null
          video_duration_sec?: number | null
          watch_duration_max_pct?: number | null
          watch_duration_min_pct?: number | null
          watch_duration_sec?: number | null
        }
        Relationships: []
      }
      workflow_executions: {
        Row: {
          completed_at: string | null
          completed_devices: number | null
          created_at: string | null
          current_step: string | null
          device_id: string | null
          device_ids: string[] | null
          error_message: string | null
          execution_id: string | null
          failed_devices: number | null
          id: string
          node_id: string | null
          node_ids: string[] | null
          params: Json | null
          progress: number | null
          result: Json | null
          started_at: string | null
          status: string | null
          total_devices: number | null
          triggered_by: string | null
          updated_at: string | null
          workflow_id: string | null
          workflow_version: number | null
        }
        Insert: {
          completed_at?: string | null
          completed_devices?: number | null
          created_at?: string | null
          current_step?: string | null
          device_id?: string | null
          device_ids?: string[] | null
          error_message?: string | null
          execution_id?: string | null
          failed_devices?: number | null
          id?: string
          node_id?: string | null
          node_ids?: string[] | null
          params?: Json | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          total_devices?: number | null
          triggered_by?: string | null
          updated_at?: string | null
          workflow_id?: string | null
          workflow_version?: number | null
        }
        Update: {
          completed_at?: string | null
          completed_devices?: number | null
          created_at?: string | null
          current_step?: string | null
          device_id?: string | null
          device_ids?: string[] | null
          error_message?: string | null
          execution_id?: string | null
          failed_devices?: number | null
          id?: string
          node_id?: string | null
          node_ids?: string[] | null
          params?: Json | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string | null
          total_devices?: number | null
          triggered_by?: string | null
          updated_at?: string | null
          workflow_id?: string | null
          workflow_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          on_error: Json | null
          params: Json | null
          params_schema: Json | null
          retry_policy: Json | null
          steps: Json
          tags: string[] | null
          timeout: number | null
          timeout_ms: number | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id: string
          is_active?: boolean | null
          name: string
          on_error?: Json | null
          params?: Json | null
          params_schema?: Json | null
          retry_policy?: Json | null
          steps?: Json
          tags?: string[] | null
          timeout?: number | null
          timeout_ms?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          on_error?: Json | null
          params?: Json | null
          params_schema?: Json | null
          retry_policy?: Json | null
          steps?: Json
          tags?: string[] | null
          timeout?: number | null
          timeout_ms?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      content_overview: {
        Row: {
          active_channels: number | null
          active_keywords: number | null
          active_schedules: number | null
          active_videos: number | null
          auto_collect_channels: number | null
          completed_videos: number | null
          paused_videos: number | null
          remaining_views: number | null
        }
        Relationships: []
      }
      dashboard_summary: {
        Row: {
          errors: number | null
          free_watch: number | null
          idle: number | null
          pc_id: string | null
          pc_number: string | null
          searching: number | null
          total_devices: number | null
          total_seconds_today: number | null
          total_watches_today: number | null
          watching: number | null
        }
        Relationships: []
      }
      device_overview: {
        Row: {
          android_version: string | null
          battery_level: number | null
          connection_type: string | null
          device_number: number | null
          device_status: string | null
          error_count: number | null
          id: string | null
          ip: string | null
          last_heartbeat: string | null
          management_code: string | null
          model: string | null
          pc_number: string | null
          pc_status: string | null
          serial: string | null
        }
        Relationships: []
      }
      pc_device_summary: {
        Row: {
          device_count: number | null
          disconnected_count: number | null
          error_count: number | null
          idle_count: number | null
          label: string | null
          location: string | null
          max_devices: number | null
          pc_id: string | null
          pc_number: string | null
          pc_status: string | null
          running_count: number | null
        }
        Relationships: []
      }
      pc_summary: {
        Row: {
          avg_battery: number | null
          device_count: number | null
          error_count: number | null
          hostname: string | null
          id: string | null
          ip_address: unknown
          label: string | null
          last_heartbeat: string | null
          location: string | null
          max_devices: number | null
          online_count: number | null
          pc_number: string | null
          status: string | null
        }
        Relationships: []
      }
      recent_tasks: {
        Row: {
          celery_task_id: string | null
          completed_at: string | null
          created_at: string | null
          device_code: string | null
          device_serial: string | null
          duration_seconds: number | null
          error: string | null
          id: string | null
          pc_number: string | null
          progress: number | null
          progress_message: string | null
          queue_name: string | null
          retries: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          task_name: string | null
        }
        Relationships: []
      }
      system_overview: {
        Row: {
          error_devices: number | null
          idle_devices: number | null
          online_pcs: number | null
          running_devices: number | null
          running_workflows: number | null
          total_devices: number | null
          total_pcs: number | null
          unacknowledged_alerts: number | null
        }
        Relationships: []
      }
      task_stats: {
        Row: {
          avg_duration: number | null
          failed_count: number | null
          last_task_at: string | null
          pending_count: number | null
          queue_name: string | null
          running_count: number | null
          success_count: number | null
          task_name: string | null
          total_count: number | null
        }
        Relationships: []
      }
      today_stats: {
        Row: {
          by_hour: Json | null
          completed: number | null
          failed: number | null
          success_rate: number | null
          total: number | null
          watch_time_sec: number | null
        }
        Relationships: []
      }
      video_progress: {
        Row: {
          channel_id: string | null
          completed: number | null
          failed: number | null
          id: string | null
          pending: number | null
          progress_pct: number | null
          running: number | null
          status: string | null
          target_views: number | null
          title: string | null
        }
        Relationships: []
      }
      workflow_execution_summary: {
        Row: {
          completed_at: string | null
          completed_devices: number | null
          created_at: string | null
          duration_seconds: number | null
          error_message: string | null
          execution_id: string | null
          failed_devices: number | null
          id: string | null
          params: Json | null
          progress_percent: number | null
          running_devices: number | null
          started_at: string | null
          status: string | null
          total_devices: number | null
          workflow_id: string | null
          workflow_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      broadcast_to_channel: {
        Args: { p_channel: string; p_event: string; p_payload: Json }
        Returns: undefined
      }
      calculate_next_run: {
        Args: { cron_expr: string; from_time?: string }
        Returns: string
      }
      claim_job: {
        Args: { p_device_id: string; p_pc_id: string }
        Returns: {
          assignment_id: string
          duration_sec: number
          job_id: string
          keyword: string
          video_title: string
        }[]
      }
      claim_next_assignment:
        | {
            Args: {
              p_device_id: string
              p_device_serial: string
              p_pc_id: string
            }
            Returns: {
              agent_id: string | null
              assigned_at: string | null
              completed_at: string | null
              created_at: string | null
              device_id: string
              device_serial: string | null
              did_comment: boolean | null
              did_like: boolean | null
              did_playlist: boolean | null
              error_code: string | null
              error_log: string | null
              final_duration_sec: number | null
              id: string
              job_id: string
              pc_id: string | null
              progress_pct: number
              retry_count: number
              search_success: boolean | null
              started_at: string | null
              status: string
              video_id: string | null
              watch_percentage: number | null
            }[]
            SetofOptions: {
              from: "*"
              to: "job_assignments"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: { p_device_serial: string; p_pc_id: string }
            Returns: {
              agent_id: string | null
              assigned_at: string | null
              completed_at: string | null
              created_at: string | null
              device_id: string
              device_serial: string | null
              did_comment: boolean | null
              did_like: boolean | null
              did_playlist: boolean | null
              error_code: string | null
              error_log: string | null
              final_duration_sec: number | null
              id: string
              job_id: string
              pc_id: string | null
              progress_pct: number
              retry_count: number
              search_success: boolean | null
              started_at: string | null
              status: string
              video_id: string | null
              watch_percentage: number | null
            }[]
            SetofOptions: {
              from: "*"
              to: "job_assignments"
              isOneToOne: false
              isSetofReturn: true
            }
          }
      claim_next_task_device: {
        Args: { p_device_serial: string; p_worker_id: string }
        Returns: {
          attempt: number
          claimed_by_pc_id: string | null
          completed_at: string | null
          config: Json
          created_at: string
          device_id: string
          device_target: string | null
          error: string | null
          id: string
          lease_expires_at: string | null
          max_attempts: number
          pc_id: string
          result: Json | null
          started_at: string | null
          status: string
          task_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "task_devices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_task_devices_for_pc:
        | {
            Args: {
              lease_minutes?: number
              max_to_claim?: number
              runner_pc_id?: string
            }
            Returns: {
              attempt: number
              claimed_by_pc_id: string | null
              completed_at: string | null
              config: Json
              created_at: string
              device_id: string
              device_target: string | null
              error: string | null
              id: string
              lease_expires_at: string | null
              max_attempts: number
              pc_id: string
              result: Json | null
              started_at: string | null
              status: string
              task_id: string
              updated_at: string
            }[]
            SetofOptions: {
              from: "*"
              to: "task_devices"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: {
              lease_minutes?: number
              max_to_claim?: number
              runner_pc_name: string
            }
            Returns: {
              attempt: number
              claimed_by_pc_id: string | null
              completed_at: string | null
              config: Json
              created_at: string
              device_id: string
              device_target: string | null
              error: string | null
              id: string
              lease_expires_at: string | null
              max_attempts: number
              pc_id: string
              result: Json | null
              started_at: string | null
              status: string
              task_id: string
              updated_at: string
            }[]
            SetofOptions: {
              from: "*"
              to: "task_devices"
              isOneToOne: false
              isSetofReturn: true
            }
          }
      cleanup_old_data: { Args: never; Returns: undefined }
      cleanup_old_tasks: { Args: { p_days?: number }; Returns: number }
      complete_task_device: {
        Args: { p_result?: Json; p_task_device_id: string }
        Returns: {
          attempt: number
          claimed_by_pc_id: string | null
          completed_at: string | null
          config: Json
          created_at: string
          device_id: string
          device_target: string | null
          error: string | null
          id: string
          lease_expires_at: string | null
          max_attempts: number
          pc_id: string
          result: Json | null
          started_at: string | null
          status: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "task_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_rank_in_group: {
        Args: { p_assignment_id: string; p_job_id: string }
        Returns: number
      }
      create_task: {
        Args: {
          p_celery_task_id?: string
          p_device_id?: string
          p_payload?: Json
          p_pc_id?: string
          p_queue_name?: string
          p_task_name: string
        }
        Returns: string
      }
      extract_keyword_from_title: { Args: { p_title: string }; Returns: string }
      extract_search_keyword: { Args: { p_title: string }; Returns: string }
      fail_or_retry_task_device: {
        Args: { p_error?: string; p_task_device_id: string }
        Returns: {
          attempt: number
          claimed_by_pc_id: string | null
          completed_at: string | null
          config: Json
          created_at: string
          device_id: string
          device_target: string | null
          error: string | null
          id: string
          lease_expires_at: string | null
          max_attempts: number
          pc_id: string
          result: Json | null
          started_at: string | null
          status: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "task_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_build_task_device_config: { Args: { _task_id: string }; Returns: Json }
      fn_timeout_tasks_and_task_devices: { Args: never; Returns: undefined }
      generate_device_number: {
        Args: { target_pc_id: string }
        Returns: number
      }
      generate_pc_number: { Args: never; Returns: string }
      get_active_videos: {
        Args: { p_limit?: number }
        Returns: {
          channel_name: string
          completed_views: number
          id: string
          priority: string
          remaining_views: number
          target_views: number
          title: string
          watch_duration_sec: number
        }[]
      }
      get_device_state_counts: {
        Args: never
        Returns: {
          count: number
          state: string
        }[]
      }
      get_management_code: {
        Args: { p_device_number: number; p_pc_id: string }
        Returns: string
      }
      get_onboarding_summary: {
        Args: { p_node_id?: string }
        Returns: {
          completed: number
          failed: number
          in_progress: number
          not_started: number
          total: number
        }[]
      }
      get_random_keywords: {
        Args: { p_count?: number }
        Returns: {
          category: string
          keyword: string
        }[]
      }
      get_workflow_execution_stats: {
        Args: { p_execution_id: string }
        Returns: {
          completed_devices: number
          failed_devices: number
          progress_percent: number
          running_devices: number
          total_devices: number
        }[]
      }
      increment_script_exec_count: {
        Args: { p_count_type: string; p_execution_id: string }
        Returns: undefined
      }
      increment_script_version: {
        Args: { p_script_id: string }
        Returns: {
          version: number
        }[]
      }
      increment_task_retry: { Args: { p_task_id: string }; Returns: number }
      increment_video_views: {
        Args: { p_success?: boolean; p_video_id: string }
        Returns: undefined
      }
      insert_execution_log: {
        Args: {
          p_details?: Json
          p_device_id: string
          p_execution_id: string
          p_level: string
          p_message: string
          p_status: string
          p_step_id: string
          p_workflow_id: string
        }
        Returns: {
          created_at: string | null
          data: Json | null
          details: Json | null
          device_id: string | null
          error_category: string | null
          execution_id: string | null
          id: number
          level: string | null
          message: string | null
          status: string | null
          step_id: string | null
          video_id: string | null
          watch_duration_sec: number | null
          workflow_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "execution_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_salary_log_atomic: {
        Args: {
          p_actual_duration_sec: number
          p_assignment_id: string
          p_job_id: string
          p_watch_percentage: number
        }
        Returns: {
          rank_in_group: number
          salary_log_id: string
          was_created: boolean
        }[]
      }
      mark_keyword_used: { Args: { p_keyword: string }; Returns: undefined }
      renew_task_device_lease: {
        Args: {
          lease_minutes?: number
          runner_pc_id: string
          task_device_id: string
        }
        Returns: {
          attempt: number
          claimed_by_pc_id: string | null
          completed_at: string | null
          config: Json
          created_at: string
          device_id: string
          device_target: string | null
          error: string | null
          id: string
          lease_expires_at: string | null
          max_attempts: number
          pc_id: string
          result: Json | null
          started_at: string | null
          status: string
          task_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "task_devices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_daily_stats: {
        Args: {
          p_completed?: number
          p_date: string
          p_failed?: number
          p_node_id?: string
          p_video_id?: string
          p_watch_time?: number
        }
        Returns: undefined
      }
      update_task_status: {
        Args: {
          p_error?: string
          p_progress?: number
          p_progress_message?: string
          p_result?: Json
          p_status: Database["public"]["Enums"]["task_status"]
          p_task_id: string
        }
        Returns: undefined
      }
      upsert_onboarding_state: {
        Args: {
          p_completed_steps?: string[]
          p_config?: Json
          p_current_step?: string
          p_device_id: string
          p_error_message?: string
          p_node_id: string
          p_status?: Database["public"]["Enums"]["onboarding_status"]
          p_step_results?: Json
        }
        Returns: {
          completed_at: string | null
          completed_steps: string[] | null
          config: Json | null
          created_at: string | null
          current_step: string | null
          device_id: string
          error_message: string | null
          id: number
          node_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["onboarding_status"]
          step_results: Json | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "device_onboarding_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      device_status:
        | "IDLE"
        | "RUNNING"
        | "BUSY"
        | "OFFLINE"
        | "ERROR"
        | "QUARANTINE"
      onboarding_status: "not_started" | "in_progress" | "completed" | "failed"
      pc_status: "ONLINE" | "OFFLINE" | "ERROR"
      proxy_status: "active" | "inactive" | "banned" | "testing"
      proxy_type: "http" | "https" | "socks5"
      task_status:
        | "pending"
        | "running"
        | "success"
        | "failed"
        | "retrying"
        | "cancelled"
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
      device_status: [
        "IDLE",
        "RUNNING",
        "BUSY",
        "OFFLINE",
        "ERROR",
        "QUARANTINE",
      ],
      onboarding_status: ["not_started", "in_progress", "completed", "failed"],
      pc_status: ["ONLINE", "OFFLINE", "ERROR"],
      proxy_status: ["active", "inactive", "banned", "testing"],
      proxy_type: ["http", "https", "socks5"],
      task_status: [
        "pending",
        "running",
        "success",
        "failed",
        "retrying",
        "cancelled",
      ],
    },
  },
} as const
