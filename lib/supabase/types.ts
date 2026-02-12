export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      workers: {
        Row: {
          id: string;
          hostname: string;
          ip_local: string | null;
          ip_public: string | null;
          status: string;
          device_count: number;
          xiaowei_connected: boolean;
          last_heartbeat: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          hostname: string;
          ip_local?: string | null;
          ip_public?: string | null;
          status?: string;
          device_count?: number;
          xiaowei_connected?: boolean;
          last_heartbeat?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          hostname?: string;
          ip_local?: string | null;
          ip_public?: string | null;
          status?: string;
          device_count?: number;
          xiaowei_connected?: boolean;
          last_heartbeat?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      devices: {
        Row: {
          id: string;
          serial: string;
          worker_id: string | null;
          nickname: string | null;
          model: string | null;
          status: string;
          connection_mode: number;
          current_task: string | null;
          account_id: string | null;
          proxy: string | null;
          ip_intranet: string | null;
          battery: number | null;
          last_seen: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          serial: string;
          worker_id?: string | null;
          nickname?: string | null;
          model?: string | null;
          status?: string;
          connection_mode?: number;
          current_task?: string | null;
          account_id?: string | null;
          proxy?: string | null;
          ip_intranet?: string | null;
          battery?: number | null;
          last_seen?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          serial?: string;
          worker_id?: string | null;
          nickname?: string | null;
          model?: string | null;
          status?: string;
          connection_mode?: number;
          current_task?: string | null;
          account_id?: string | null;
          proxy?: string | null;
          ip_intranet?: string | null;
          battery?: number | null;
          last_seen?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "devices_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "workers";
            referencedColumns: ["id"];
          },
        ];
      };
      accounts: {
        Row: {
          id: string;
          email: string;
          status: string;
          device_id: string | null;
          login_count: number;
          last_used: string | null;
          banned_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          status?: string;
          device_id?: string | null;
          login_count?: number;
          last_used?: string | null;
          banned_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          status?: string;
          device_id?: string | null;
          login_count?: number;
          last_used?: string | null;
          banned_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
        ];
      };
      presets: {
        Row: {
          id: string;
          name: string;
          type: string;
          description: string | null;
          config: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          type: string;
          description?: string | null;
          config: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          type?: string;
          description?: string | null;
          config?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          preset_id: string | null;
          type: string;
          status: string;
          priority: number;
          payload: Json;
          target_devices: string[] | null;
          target_workers: string[] | null;
          worker_id: string | null;
          result: Json | null;
          error: string | null;
          created_at: string;
          started_at: string | null;
          completed_at: string | null;
          video_id: string | null;
          channel_id: string | null;
          task_type: string | null;
          device_count: number;
          scheduled_at: string | null;
          retry_count: number;
          max_retries: number;
        };
        Insert: {
          id?: string;
          preset_id?: string | null;
          type: string;
          status?: string;
          priority?: number;
          payload: Json;
          target_devices?: string[] | null;
          target_workers?: string[] | null;
          worker_id?: string | null;
          result?: Json | null;
          error?: string | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          video_id?: string | null;
          channel_id?: string | null;
          task_type?: string | null;
          device_count?: number;
          scheduled_at?: string | null;
          retry_count?: number;
          max_retries?: number;
        };
        Update: {
          id?: string;
          preset_id?: string | null;
          type?: string;
          status?: string;
          priority?: number;
          payload?: Json;
          target_devices?: string[] | null;
          target_workers?: string[] | null;
          worker_id?: string | null;
          result?: Json | null;
          error?: string | null;
          created_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
          video_id?: string | null;
          channel_id?: string | null;
          task_type?: string | null;
          device_count?: number;
          scheduled_at?: string | null;
          retry_count?: number;
          max_retries?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_preset_id_fkey";
            columns: ["preset_id"];
            isOneToOne: false;
            referencedRelation: "presets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "workers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
        ];
      };
      task_logs: {
        Row: {
          id: string;
          task_id: string | null;
          device_serial: string | null;
          worker_id: string | null;
          action: string | null;
          request: Json | null;
          response: Json | null;
          status: string;
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          device_serial?: string | null;
          worker_id?: string | null;
          action?: string | null;
          request?: Json | null;
          response?: Json | null;
          status: string;
          message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string | null;
          device_serial?: string | null;
          worker_id?: string | null;
          action?: string | null;
          request?: Json | null;
          response?: Json | null;
          status?: string;
          message?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_logs_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_logs_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "workers";
            referencedColumns: ["id"];
          },
        ];
      };
      proxies: {
        Row: {
          id: string;
          address: string;
          type: string;
          status: string;
          assigned_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          address: string;
          type?: string;
          status?: string;
          assigned_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          address?: string;
          type?: string;
          status?: string;
          assigned_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      channels: {
        Row: {
          id: string;
          youtube_channel_id: string;
          channel_name: string;
          channel_url: string;
          thumbnail_url: string | null;
          subscriber_count: number;
          video_count: number;
          api_key_encrypted: string | null;
          monitoring_enabled: boolean;
          monitoring_interval_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          youtube_channel_id: string;
          channel_name: string;
          channel_url: string;
          thumbnail_url?: string | null;
          subscriber_count?: number;
          video_count?: number;
          api_key_encrypted?: string | null;
          monitoring_enabled?: boolean;
          monitoring_interval_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          youtube_channel_id?: string;
          channel_name?: string;
          channel_url?: string;
          thumbnail_url?: string | null;
          subscriber_count?: number;
          video_count?: number;
          api_key_encrypted?: string | null;
          monitoring_enabled?: boolean;
          monitoring_interval_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      videos: {
        Row: {
          id: string;
          channel_id: string | null;
          youtube_video_id: string;
          title: string;
          description: string | null;
          thumbnail_url: string | null;
          published_at: string | null;
          duration_seconds: number | null;
          view_count: number;
          like_count: number;
          status: string;
          auto_detected: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id?: string | null;
          youtube_video_id: string;
          title: string;
          description?: string | null;
          thumbnail_url?: string | null;
          published_at?: string | null;
          duration_seconds?: number | null;
          view_count?: number;
          like_count?: number;
          status?: string;
          auto_detected?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          channel_id?: string | null;
          youtube_video_id?: string;
          title?: string;
          description?: string | null;
          thumbnail_url?: string | null;
          published_at?: string | null;
          duration_seconds?: number | null;
          view_count?: number;
          like_count?: number;
          status?: string;
          auto_detected?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "videos_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
        ];
      };
      schedules: {
        Row: {
          id: string;
          channel_id: string | null;
          name: string;
          task_type: string;
          trigger_type: string;
          trigger_config: Json;
          device_count: number;
          is_active: boolean;
          last_triggered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          channel_id?: string | null;
          name: string;
          task_type: string;
          trigger_type: string;
          trigger_config?: Json;
          device_count?: number;
          is_active?: boolean;
          last_triggered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          channel_id?: string | null;
          name?: string;
          task_type?: string;
          trigger_type?: string;
          trigger_config?: Json;
          device_count?: number;
          is_active?: boolean;
          last_triggered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedules_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

// Convenience row type aliases
export type WorkerRow = Database["public"]["Tables"]["workers"]["Row"];
export type DeviceRow = Database["public"]["Tables"]["devices"]["Row"];
export type AccountRow = Database["public"]["Tables"]["accounts"]["Row"];
export type PresetRow = Database["public"]["Tables"]["presets"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskLogRow = Database["public"]["Tables"]["task_logs"]["Row"];
export type ProxyRow = Database["public"]["Tables"]["proxies"]["Row"];
export type ChannelRow = Database["public"]["Tables"]["channels"]["Row"];
export type VideoRow = Database["public"]["Tables"]["videos"]["Row"];
export type ScheduleRow = Database["public"]["Tables"]["schedules"]["Row"];
