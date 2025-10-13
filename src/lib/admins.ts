
// This is a temporary list of admin UIDs.
// In a production environment, you should manage roles in a more robust way,
// for example, using a 'roles' collection in Firestore or custom claims.
export const ADMIN_UIDS = ["SgOR5cjCC6dZ0oABv4nXdntu6pI3"];


// Defines which users a manager can see in their admin dashboard.
// The key is the manager's UID, and the value is an array of their team members' UIDs.
export const MANAGER_TEAMS: Record<string, string[]> = {
    // Example Manager UID -> Team Member UIDs
    // "manager_uid_1": ["user_uid_1", "user_uid_2"],
    "e11qs3XD1vW3JWHfEaJI2DXcCEj2": [
        "XNfz4EiMrIRQ4NwLlkdUXUvBzSH2",
        "mdLCjhNVnYas96aW4IkrPWip7RS2",
        "ePVOaPvZYTa9CGj0MpReVnmKhD62",
        "Tajceo3bwwcH9ac9Mw4tEtj2Z952",
        "nZZHI6JVZzZCVBIDcwiAv0RDmGv2",
        "NOYZ3h8ylaNINBVBgFYJzhKdisY2",
    ],
    "UmyUP0VwccRKLfrej67idFukFz42": [
        "pvzNDFxH4tf7JejE7YxMK4Rq3hj2",
        "l5GMEE0OxpMOObd5qguyJtrVUi42",
        "sN4SztOibRSTg1H7SEeAwiEpDgm1",
        "uDhb49uS55XJm8cp6bqL2adjfwh2",
        "AhkYw50sBueJFvRO8glPlpE4QWt2",
        "wHns6CCKRde4YMf8VZhxLJfAa6H3",
        "ledPtMmuniSwpkYZ5YAXOSREoxl2",
    ],
    "tb73WEIzndUrPEaD1q4H0VQfQaD3": [
        "8QiLTKzhovh43RX2arJ4xNAgoRj2",
        "mUP19b2ISPc4Qnl1e0MHbCkAAKH3",
        "e4U1TKIhzURRt3YdqKWQgkDQApv2",
        "cm4yqA8NfBadUBtffEzcEJRV9873",
        "qsFiDEpOgOcTFSbiX2RJMrCKBHG3",
        "H5NGDRDneWdH9ADuZDCFNHlovK83",
        "t8WMcGOCaQdB159ZeNBmHZvEtR13",
    ],
    "I3HkxWKsKZOPdmUT9Hi1G8JUy5t1": [
        "JvBQZydSDxNkZRP2vNofGXMGbGk1",
        "JvY6C2uEdPeEqoWLuqB4eYfbZqj2",
        "mZJZjTMVinNRegZFQG9FZzRjpiA2",
        "Jqy9ONMiwSP7BZM61X7x8PKI8lz1",
        "xNTJrZ5xXwRliGvpCVXaxDwDpl32"
    ],
};
