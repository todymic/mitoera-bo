import { ref } from 'vue';

// Shared state: the plan currently open in the editor.
// PlanEditor writes here; AdminApp reads before workspace switch.
export const activePlanId     = ref(null);
export const activePlanDirty  = ref(false);
export const activePlanStatus = ref(null); // 'draft' | 'published' | 'archived' | null
