export type ModuleKey = "meals" | "tasks" | "budget" | "calendar";
export type MemberRole = "parent" | "enfant";

export type HouseholdMember = {
  name: string;
  role: MemberRole;
  email?: string;
};

export type ManagedHouseholdMember = {
  id: number;
  name: string;
  email: string;
  role: MemberRole;
  must_change_password: boolean;
};

export type CreatedMemberCredential = {
  id?: number;
  name?: string;
  generated_email?: string;
  generated_password?: string;
  share_text?: string;
};

export type TaskSettingsInput = {
  reminders_enabled: boolean;
  alternating_custody_enabled: boolean;
  custody_change_day: number;
  custody_home_week_start: string;
};

export type BudgetRecurrence = "weekly" | "monthly";

export type BudgetChildSettingDraft = {
  childId: number;
  childName: string;
  baseAmountInput: string;
  recurrence: BudgetRecurrence;
  resetDayInput: string;
  allowAdvances: boolean;
  maxAdvanceInput: string;
};

export type DietaryTagOption = {
  id: number;
  type: "diet" | "allergen" | "dislike" | "restriction" | "cuisine_rule";
  key: string;
  label: string;
  is_system: boolean;
};

export type DietaryTagDetail = {
  key: string;
  label: string;
  type: DietaryTagOption["type"];
};

export type HouseholdConnectionPendingRequest = {
  id: number;
  direction: "incoming" | "outgoing";
  status: "pending" | "accepted" | "refused";
  created_at: string | null;
  other_household: {
    id: number;
    name: string;
  } | null;
};

export type HouseholdConnectionState = {
  is_connected: boolean;
  linked_household: {
    id: number;
    name: string;
  } | null;
  pending_request: HouseholdConnectionPendingRequest | null;
  active_code: {
    code: string;
    expires_at: string | null;
    share_text: string;
  } | null;
};

export type HouseholdConnectionPermissions = {
  can_manage_connection: boolean;
  can_generate_code: boolean;
  can_connect_with_code: boolean;
  can_unlink: boolean;
};