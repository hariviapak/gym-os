-- Migration 010: Contact log, Gym tasks, Message templates, Digital kit tracking

-- 1. Add 'contact' to event_type enum
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'contact';

-- 2. Gift kit tasks — track digital delivery separately + assigned_to
ALTER TABLE public.gift_kit_tasks
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS digital_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS digital_sent_by uuid REFERENCES public.users(id);

-- 3. Digital kit URLs — gym-level default + per-package override
ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS digital_kit_url text;

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS digital_kit_url text;

-- 4. Message templates table
CREATE TABLE IF NOT EXISTS public.message_templates (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id      uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL,
  content     text NOT NULL,
  is_active   boolean DEFAULT true,
  created_by  uuid REFERENCES public.users(id),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_gym_id ON public.message_templates(gym_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_type ON public.message_templates(gym_id, type);

-- 5. Gym tasks table
CREATE TABLE IF NOT EXISTS public.gym_tasks (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  gym_id       uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  type         text NOT NULL DEFAULT 'custom',
  priority     text NOT NULL DEFAULT 'medium',
  assigned_to  uuid REFERENCES public.users(id),
  status       text NOT NULL DEFAULT 'pending',
  due_date     date,
  created_by   uuid REFERENCES public.users(id),
  created_at   timestamptz DEFAULT now(),
  completed_at timestamptz,
  completed_by uuid REFERENCES public.users(id),
  notes        text
);

CREATE INDEX IF NOT EXISTS idx_gym_tasks_gym_id ON public.gym_tasks(gym_id);
CREATE INDEX IF NOT EXISTS idx_gym_tasks_status ON public.gym_tasks(gym_id, status);

-- 6. RLS for message_templates
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_templates" ON public.message_templates
  FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "manage_templates" ON public.message_templates
  FOR ALL TO authenticated
  USING (gym_id IN (SELECT gym_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (gym_id IN (SELECT gym_id FROM public.users WHERE id = auth.uid()));

-- 7. RLS for gym_tasks
ALTER TABLE public.gym_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_tasks" ON public.gym_tasks
  FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "staff_insert_tasks" ON public.gym_tasks
  FOR INSERT TO authenticated
  WITH CHECK (gym_id IN (SELECT gym_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "staff_update_tasks" ON public.gym_tasks
  FOR UPDATE TO authenticated
  USING (gym_id IN (SELECT gym_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (gym_id IN (SELECT gym_id FROM public.users WHERE id = auth.uid()));

-- 8. Seed default templates (run per-gym via a function)
CREATE OR REPLACE FUNCTION seed_default_templates(p_gym_id uuid, p_user_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.message_templates (gym_id, name, type, content, is_active, created_by)
  VALUES
    (p_gym_id, 'Welcome / Starter Kit', 'welcome_kit', 'Dear Member {name},

Welcome to the {gym_name} Family!

We are delighted to have you with us.

To help you get started, please find the important links below:

Member Access Portal
Access exclusive workout regimens, exercise videos, PDFs, fitness resources, and much more:
https://792fitnessstudio.com/member-access

Password: 792@fitness

792 Terms & Conditions
https://792fitnessstudio.com/Terms-and-Conditions

Should you require any assistance, our team will be happy to help.

Thank you for choosing {gym_name}.

Stay Fit
Team {gym_name}', true, p_user_id),
    (p_gym_id, 'Renewal Reminder', 'renewal', 'Hi {name}, your {package_name} at {gym_name} expires on {end_date}. Drop by to renew and keep your fitness journey going! 💪', true, p_user_id),
    (p_gym_id, 'Dues Reminder', 'dues', 'Hi {name}, you have a pending balance of {amount} at {gym_name}. Please clear it at your earliest convenience. Thank you!', true, p_user_id),
    (p_gym_id, 'Birthday Wish', 'birthday', 'Happy Birthday {name}! 🎂 Wishing you a fantastic day from all of us at {gym_name}!', true, p_user_id),
    (p_gym_id, 'Belated Birthday Wish', 'belated_birthday', 'Happy Belated Birthday {name}! 🎂 We hope you had a wonderful day! Sorry we missed wishing you on time. Wishing you a fantastic year ahead from all of us at {gym_name}!', true, p_user_id),
    (p_gym_id, 'Gift Kit Ready', 'gift_kit', 'Hi {name}, your welcome kit is ready for pickup at {gym_name}! Collect it from the front desk on your next visit.', true, p_user_id),
    (p_gym_id, 'Freeze Notification', 'freeze', 'Hi {name}, your membership at {gym_name} has been frozen as requested. Contact us for any queries.', true, p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;
