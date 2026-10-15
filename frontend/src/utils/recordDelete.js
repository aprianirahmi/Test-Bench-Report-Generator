import { deleteTestRecord } from "../services/api";

// Asks for confirmation, deletes the record (admin only on the server) and
// calls onDeleted. confirm = useConfirm(), toast = useToast().
export function confirmDeleteRecord({ confirm, toast, record, label, onDeleted }) {
  confirm.require({
    message: `Delete the test record "${label}"? Its recorded data is removed for good and any report made from it can no longer be generated. This cannot be undone.`,
    header: "Delete Test Record",
    icon: "pi pi-exclamation-triangle",
    acceptLabel: "Delete",
    rejectLabel: "Cancel",
    acceptClass: "p-button-danger",
    accept: async () => {
      try {
        await deleteTestRecord(record.id);
        toast.add({ severity: "success", summary: "Deleted", detail: "Test record removed.", life: 3000 });
        if (onDeleted) await onDeleted(record);
      } catch (error) {
        const msg = error.response?.data?.error || "Failed to delete the test record.";
        toast.add({ severity: "error", summary: "Not Deleted", detail: msg, life: 5000 });
      }
    },
  });
}
