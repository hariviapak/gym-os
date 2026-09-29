export type StaffRole = 'owner' | 'admin' | 'manager' | 'staff' | 'trainer';
export type MemberStatus = 'active' | 'deactivated' | 'blacklisted';
export type PackageType = 'membership' | 'day_pass' | 'trial' | 'pt';
export type MembershipStatus = 'active' | 'expired' | 'frozen' | 'upgraded' | 'cancelled';
export type PaymentStatus = 'paid' | 'partial' | 'pending';
export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other';
export type EventType =
  | 'enrollment' | 'renewal' | 'upgrade' | 'downgrade'
  | 'freeze_start' | 'freeze_end' | 'expiry' | 'payment'
  | 'receipt_voided' | 'status_change' | 'profile_update'
  | 'terms_accepted' | 'gift_kit_assigned' | 'gift_kit_delivered'
  | 'access_enabled' | 'access_disabled' | 'note' | 'import' | 'contact';
export type FreezeStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'ended';
export type GiftKitStatus = 'pending' | 'assigned' | 'delivered' | 'not_applicable';
export type ImportStatus = 'running' | 'completed' | 'failed' | 'partial';
export type TermsStatus = 'draft' | 'active' | 'retired';

export interface Gym {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  logo_url: string | null;
  digital_kit_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GymSettings {
  gym_id: string;
  grace_period_days: number;
  currency_symbol: string;
  gst_enabled: boolean;
  gst_rate: number;
  whatsapp_enabled: boolean;
  whatsapp_phone_id: string | null;
  whatsapp_access_token: string | null;
  whatsapp_token_iv: string | null;
  receipt_prefix: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  gym_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  gym_id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
  gender: 'male' | 'female' | 'other' | null;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  medical_notes: string | null;
  injury_notes: string | null;
  photo_url: string | null;
  status: MemberStatus;
  blacklist_reason: string | null;
  referred_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Package {
  id: string;
  gym_id: string;
  name: string;
  type: PackageType;
  duration_days: number;
  amount: number;
  gst_rate: number;
  description: string | null;
  digital_kit_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  gym_id: string;
  member_id: string;
  package_id: string;
  status: MembershipStatus;
  payment_status: PaymentStatus;
  start_date: string;
  end_date: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  amount_paid: number;
  prorated_credit: number;
  upgraded_from_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberEvent {
  id: string;
  gym_id: string;
  member_id: string;
  event_type: EventType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface MembershipFreeze {
  id: string;
  gym_id: string;
  membership_id: string;
  member_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: FreezeStatus;
  is_backdated: boolean;
  backdated_days: number;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  gym_id: string;
  member_id: string;
  membership_id: string | null;
  receipt_id: string | null;
  amount: number;
  mode: PaymentMode;
  reference_note: string | null;
  payment_date: string;
  gateway: string | null;
  gateway_payment_id: string | null;
  gateway_status: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Receipt {
  id: string;
  gym_id: string;
  receipt_no: number;
  member_id: string;
  membership_id: string | null;
  payment_id: string | null;
  amount: number;
  gst_amount: number;
  total_amount: number;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ImportBatch {
  id: string;
  gym_id: string;
  filename: string;
  total_rows: number;
  processed_rows: number;
  created_rows: number;
  updated_rows: number;
  skipped_rows: number;
  error_rows: number;
  errors: Array<{ row: number; error: string }>;
  status: ImportStatus;
  column_mapping: Record<string, string>;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TermsVersion {
  id: string;
  gym_id: string;
  version: string;
  title: string;
  body: string;
  status: TermsStatus;
  category: 'gym' | 'swimming';
  effective_from: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TermsAcceptance {
  id: string;
  gym_id: string;
  member_id: string;
  terms_version_id: string;
  accepted_at: string;
  accepted_by_method: string;
  signature_image: string | null;
  signed_name: string | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  signed_at: string | null;
  created_by: string | null;
}

export interface SigningToken {
  id: string;
  gym_id: string;
  member_id: string;
  terms_version_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface GiftKitTask {
  id: string;
  gym_id: string;
  member_id: string;
  status: GiftKitStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  delivered_at: string | null;
  digital_sent_at: string | null;
  digital_sent_by: string | null;
  digital_content_url: string | null;
  delivered_by_method: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  gym_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface PaymentLink {
  id: string;
  gym_id: string;
  member_id: string | null;
  package_id: string;
  amount: number;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  gateway: string | null;
  gateway_link_id: string | null;
  expires_at: string | null;
  paid_at: string | null;
  payment_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Device {
  id: string;
  gym_id: string;
  name: string;
  device_model: string | null;
  serial_number: string | null;
  location: string | null;
  ip_address: string | null;
  port: number | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceUser {
  id: string;
  gym_id: string;
  member_id: string;
  device_id: string | null;
  device_user_id: string | null;
  enrollment_status: 'not_enrolled' | 'enrolled' | 'failed' | 'removed';
  access_enabled: boolean;
  face_enrolled: boolean;
  card_number: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceCommand {
  id: string;
  gym_id: string;
  device_id: string | null;
  member_id: string;
  device_user_id: string | null;
  command: 'enable_access' | 'disable_access' | 'create_user' | 'delete_user' | 'sync_user';
  status: 'pending' | 'sent' | 'success' | 'failed' | 'retrying';
  triggered_by: 'system' | 'staff' | 'reconciliation';
  reason: string | null;
  error_message: string | null;
  retry_count: number;
  sent_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ConnectorHeartbeat {
  id: string;
  gym_id: string;
  connector_type: string;
  status: 'healthy' | 'degraded' | 'offline';
  last_ping_at: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  gym_id: string;
  name: string;
  type: string;
  content: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface GymTask {
  id: string;
  gym_id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  assigned_to: string | null;
  status: string;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
}

export interface Database {
  public: {
    Tables: {
      gyms: { Row: Gym; Insert: Partial<Gym>; Update: Partial<Gym> };
      gym_settings: { Row: GymSettings; Insert: Partial<GymSettings>; Update: Partial<GymSettings> };
      users: { Row: User; Insert: Partial<User>; Update: Partial<User> };
      members: { Row: Member; Insert: Partial<Member>; Update: Partial<Member> };
      packages: { Row: Package; Insert: Partial<Package>; Update: Partial<Package> };
      memberships: { Row: Membership; Insert: Partial<Membership>; Update: Partial<Membership> };
      member_events: { Row: MemberEvent; Insert: Partial<MemberEvent>; Update: never };
      membership_freezes: { Row: MembershipFreeze; Insert: Partial<MembershipFreeze>; Update: Partial<MembershipFreeze> };
      payments: { Row: Payment; Insert: Partial<Payment>; Update: Partial<Payment> };
      receipts: { Row: Receipt; Insert: Partial<Receipt>; Update: Partial<Receipt> };
      import_batches: { Row: ImportBatch; Insert: Partial<ImportBatch>; Update: Partial<ImportBatch> };
      terms_versions: { Row: TermsVersion; Insert: Partial<TermsVersion>; Update: Partial<TermsVersion> };
      terms_acceptances: { Row: TermsAcceptance; Insert: Partial<TermsAcceptance>; Update: Partial<TermsAcceptance> };
      signing_tokens: { Row: SigningToken; Insert: Partial<SigningToken>; Update: Partial<SigningToken> };
      gift_kit_tasks: { Row: GiftKitTask; Insert: Partial<GiftKitTask>; Update: Partial<GiftKitTask> };
      audit_logs: { Row: AuditLog; Insert: Partial<AuditLog>; Update: never };
      payment_links: { Row: PaymentLink; Insert: Partial<PaymentLink>; Update: Partial<PaymentLink> };
      devices: { Row: Device; Insert: Partial<Device>; Update: Partial<Device> };
      device_users: { Row: DeviceUser; Insert: Partial<DeviceUser>; Update: Partial<DeviceUser> };
      device_commands: { Row: DeviceCommand; Insert: Partial<DeviceCommand>; Update: Partial<DeviceCommand> };
      connector_heartbeats: { Row: ConnectorHeartbeat; Insert: Partial<ConnectorHeartbeat>; Update: Partial<ConnectorHeartbeat> };
      message_templates: { Row: MessageTemplate; Insert: Partial<MessageTemplate>; Update: Partial<MessageTemplate> };
      gym_tasks: { Row: GymTask; Insert: Partial<GymTask>; Update: Partial<GymTask> };
    };
  };
}
