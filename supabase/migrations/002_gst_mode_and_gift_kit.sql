-- Migration 002: GST mode + digital content URL
-- Adds gst_mode to gym_settings, digital content fields to gift_kit_tasks
-- Run: 2026-09-23

alter table public.gym_settings 
  add column if not exists gst_mode text default 'inclusive' check (gst_mode in ('inclusive', 'exclusive'));

alter table public.gym_settings
  add column if not exists digital_content_url text;

alter table public.gift_kit_tasks
  add column if not exists digital_content_url text,
  add column if not exists delivered_by_method text;
