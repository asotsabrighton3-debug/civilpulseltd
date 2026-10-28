export const STATUSES = ["Received", "In Progress", "Resolved", "Rejected"];
export const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
export const CATEGORIES = ["Roads", "Water", "Garbage collection", "Street lighting", "Public safety", "Other"];
export const MANAGEMENT_ROLES = ["admin", "manager"];
export const PHOTO_STORE = "report-photos";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const reference = (id: number) => `CP-${String(id).padStart(5, "0")}`;
