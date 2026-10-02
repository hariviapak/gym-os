-- 014: user-referencing FKs become ON DELETE SET NULL
-- Deleting a staff user (auth + profile) used to fail whenever they had
-- acted (audit rows, locker logs, receipts...). History rows now survive
-- with a null actor instead of blocking the deletion.

begin;
alter table audit_logs drop constraint audit_logs_user_id_fkey;
alter table audit_logs add constraint audit_logs_user_id_fkey foreign key (user_id) references public.users(id) on delete set null;
alter table device_commands drop constraint device_commands_created_by_fkey;
alter table device_commands add constraint device_commands_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table expenses drop constraint expenses_created_by_fkey;
alter table expenses add constraint expenses_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table gift_kit_tasks drop constraint gift_kit_tasks_assigned_to_fkey;
alter table gift_kit_tasks add constraint gift_kit_tasks_assigned_to_fkey foreign key (assigned_to) references public.users(id) on delete set null;
alter table gift_kit_tasks drop constraint gift_kit_tasks_created_by_fkey;
alter table gift_kit_tasks add constraint gift_kit_tasks_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table gift_kit_tasks drop constraint gift_kit_tasks_digital_sent_by_fkey;
alter table gift_kit_tasks add constraint gift_kit_tasks_digital_sent_by_fkey foreign key (digital_sent_by) references public.users(id) on delete set null;
alter table gym_tasks drop constraint gym_tasks_assigned_to_fkey;
alter table gym_tasks add constraint gym_tasks_assigned_to_fkey foreign key (assigned_to) references public.users(id) on delete set null;
alter table gym_tasks drop constraint gym_tasks_completed_by_fkey;
alter table gym_tasks add constraint gym_tasks_completed_by_fkey foreign key (completed_by) references public.users(id) on delete set null;
alter table gym_tasks drop constraint gym_tasks_created_by_fkey;
alter table gym_tasks add constraint gym_tasks_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table import_batches drop constraint import_batches_created_by_fkey;
alter table import_batches add constraint import_batches_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table locker_key_logs drop constraint locker_key_logs_issued_by_fkey;
alter table locker_key_logs add constraint locker_key_logs_issued_by_fkey foreign key (issued_by) references public.users(id) on delete set null;
alter table locker_key_logs drop constraint locker_key_logs_returned_by_fkey;
alter table locker_key_logs add constraint locker_key_logs_returned_by_fkey foreign key (returned_by) references public.users(id) on delete set null;
alter table member_addons drop constraint member_addons_created_by_fkey;
alter table member_addons add constraint member_addons_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table member_events drop constraint member_events_created_by_fkey;
alter table member_events add constraint member_events_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table member_groups drop constraint member_groups_created_by_fkey;
alter table member_groups add constraint member_groups_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table membership_freezes drop constraint membership_freezes_approved_by_fkey;
alter table membership_freezes add constraint membership_freezes_approved_by_fkey foreign key (approved_by) references public.users(id) on delete set null;
alter table membership_freezes drop constraint membership_freezes_requested_by_fkey;
alter table membership_freezes add constraint membership_freezes_requested_by_fkey foreign key (requested_by) references public.users(id) on delete set null;
alter table memberships drop constraint memberships_created_by_fkey;
alter table memberships add constraint memberships_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table message_templates drop constraint message_templates_created_by_fkey;
alter table message_templates add constraint message_templates_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table payments drop constraint payments_created_by_fkey;
alter table payments add constraint payments_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table receipts drop constraint receipts_created_by_fkey;
alter table receipts add constraint receipts_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table receipts drop constraint receipts_voided_by_fkey;
alter table receipts add constraint receipts_voided_by_fkey foreign key (voided_by) references public.users(id) on delete set null;
alter table refunds drop constraint refunds_created_by_fkey;
alter table refunds add constraint refunds_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table signing_tokens drop constraint signing_tokens_created_by_fkey;
alter table signing_tokens add constraint signing_tokens_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table terms_acceptances drop constraint terms_acceptances_created_by_fkey;
alter table terms_acceptances add constraint terms_acceptances_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;
alter table terms_versions drop constraint terms_versions_created_by_fkey;
alter table terms_versions add constraint terms_versions_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;

commit;
