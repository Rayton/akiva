export const CUSTOMER_WORKSPACE_MODAL_EVENT = 'akiva:open-customer-workspace';

export function openCustomerWorkspaceModal() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CUSTOMER_WORKSPACE_MODAL_EVENT));
}
