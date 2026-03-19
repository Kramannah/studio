
// This is a temporary list of admin UIDs.
// In a production environment, you should manage roles in a more robust way,
// for example, using a 'roles' collection in Firestore or custom claims.
export const ADMIN_UIDS = ["SgOR5cjCC6dZ0oABv4nXdntu6pI3", "m2ZTNUi5v9ef82FxVRbwSmyGv9S2"];


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
        "xNTJrZ5xXwRliGvpCVXaxDwDpl32",
        "n7J3AJy6KIXQYMEil0TyQQcAxs93",
        "HmxNU3owvAPLnprYQHfjTHF0zUA3"
    ],
    "x8u4kvWvieZIVc9NdgiWmG01nts2": [
        "Dr2aymosXAUZP4PPagrNSG7UTFg1",
        "XSQqh3BUr7Nex40R9PgjLjWfVVF2",
        "iBzfeR7QujgmyUT2ogY0cN3KrLC3",
        "8qS5baPi4YRwX1sa4g2m1ZMEDfX2",
        "bu35X2zJWmckJXGLt0yU3G6G54E3",
        "w90JOQlrOJOf2FVq0iU2krdMQzI3",
        "SuPo0lvdIZPAgZb6zYrnlfPNchl1"
    ],
    "MlE49ceLEDbzvKAsisKnW07fGfW2": [
        "sRqr0SXKIUZBCn5g9V6VQRh24SS2",
        "xOQdg23cnOgLQD5lonJtFgAELa13",
        "Hnr2ehdTK0O8PfSj7Vn2zQksqz63",
        "h2q00DOa3EM870V5RDu2NABcb213",
        "BjsmUvmlFdUMDKg123iibi5AxZA2",
        "2Bjo0AEdTbWb14C4knsPvX0Ub8r1",
        "MkQwPWR0wyXrDRzlekEFMzQSu7Y2"
    ],  
    "r19lVIqk4xTtzxvbs4W0kprHSvD2": [
        "hM21Pxjwfma3m75pefiM7j23F4f1",
        "px4HMkypSRMTuQFrY21bFEJoYA73",
        "5JJythHRfYT8PllnH7kcWoHDSIO2",
        "CrwnET2Cohhqf4lsYiI8AYPtlPo1",
        "mxcI6Z9EjKWYmvNisUCIzSPi4573",
        "nBNzGCEnXuMKXOCeZGG3P6k6Spm1",
        "BT6ANsPnO7fbL7Tm3oEBY2tFUks2"
    ],
    "lDprIWp1acWrMElyzk2uTjQ4q4m1": ["WZkgG4Ot9jRssWT3E09XIwe6VFc2"]
};
