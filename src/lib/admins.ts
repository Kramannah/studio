
// This is a temporary list of admin UIDs.
// In a production environment, you should manage roles in a more robust way,
// for example, using a 'roles' collection in Firestore or custom claims.
export const ADMIN_UIDS = ["SgOR5cjCC6dZ0oABv4nXdntu6pI3"];


// Defines which users a manager can see in their admin dashboard.
// The key is the manager's UID, and the value is an array of their team members' UIDs.
export const MANAGER_TEAMS: Record<string, string[]> = {
    // Example Manager UID -> Team Member UIDs
    // "manager_uid_1": ["user_uid_1", "user_uid_2"],
    "cm4yqA8NfBadUBtffEzcEJRV9873": [
        "mZJZjTMVinNRegZFQG9FZzRjpiA2",
        "Jqy9ONMiwSP7BZM61X7x8PKI8lz1",
        "xNTJrZ5xXwRliGvpCVXaxDwDpl32",
    ],
    "UmyUP0VwccRKLfrej67idFukFz42": [
        "pvzNDFxH4tf7JejE7YxMK4Rq3hj2",
        "l5GMEE0OxpMOObd5qguyJtrVUi42",
        "sN4SztOibRSTg1H7SEeAwiEpDgm1",
        "uDhb49uS55XJm8cp6bqL2adjfwh2",
        "AhkYw50sBueJFvRO8glPlpE4QWt2",
        "wHns6CCKRde4YMf8VZhxLJfAa6H3",
        "ledPtMmuniSwpkYZ5YAXOSREoxl2",
    ]
};
