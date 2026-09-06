// Only the true Super Admins (National/IT Level) who have global oversight and directory access.
export const ADMIN_UIDS = ["SgOR5cjCC6dZ0oABv4nXdntu6pI3", "m2ZTNUi5v9ef82FxVRbwSmyGv9S2"];

// Explicit list of administrator emails for secure session verification.
export const ADMIN_EMAILS = [
    "mbustamante@hovidinc.com",
    "wbmaralit@hovidinc.com",
    "admin@hovidinc.com"
];

// Centralized helpdesk contact email
export const HELPDESK_EMAIL = "mbustamante@hovidinc.com";


// Defines which users a manager can see in their admin dashboard.
// These UIDs represent the District Sales Managers (DSMs).
export const MANAGER_TEAMS: Record<string, string[]> = {
    "1qQzrIyR2POzuITWF4p8MIfwmfk1": [
        "XNfz4EiMrIRQ4NwLlkdUXUvBzSH2", // NL-01 Padilla, John Patrick
        "mdLCjhNVnYas96aW4IkrPWip7RS2", // NL-02 Pangan, Khristopher George
        "ePVOaPvZYTa9CGj0MpReVnmKhD62", // NL-03 Catama, Cheysa
        "Tajceo3bwwcH9ac9Mw4tEtj2Z952", // CL-01 Ramos, Pauline Jean
    ],
    "Z21R5NunJ2aD6wEKNOMPCzWWmzA2": [
        "HmxNU3owvAPLnprYQHfjTHF0zUA3", // CL-03 Canlas, Kristel
        "xNTJrZ5xXwRIiGvpCVXaxDwDpI32", // CL-04 Bongala, Arnel Jr
        "nZZHI6JVZzZCVBlDcwiAv0RDmGv2", // CL-05 Dimaala, Carmina
        "qsFiDEpOgOcTFSbiX2RJMrCKBHG3", // MQ-03 Capilos, Mark Anthony (Marco)
    ],
    "OU7hbPEFg7gaYfg1qHFOjNpBJLe2": [
        "8QiLTKzhovh43RX2arJ4xNAgoRj2", // MQ-02 Ponce, John Martin G.
        "CUEmweKbvSeQkbG07NvULh4ZBEd2", // MQ-04 Ariscon, Roland
        "fwBf7XGUb6MSJygdL5NitBcbHRA3", // MQ-06 De Castro, Isabel Joy
        "NOYZ3h8yIaNINBVBgFYJzhKdisY2", // MQ-01 Rivera, Luzviminda
        "XSQqh3BUr7Nex40R9PgjLjWfVVF2", // MIN-04 Calzada, Cyril
    ],
    "v0OiwmjES5ffpntunx4S6x92FC32": [
        "MkQwPWR0wyXrDRzIekEFMzQSu7Y2", // GMAS-01 Lestor, Gwyne Joseph
        "GjbznZ1QOwTfHMExfjsB3QsMpjl2", // GMAS-02 Casuncad, Sarah Mae
        "l5GMEE0OxpMOObd5qguyJtrVUi42", // GMAS-03 Dreu, Jacquelyn
        "vc3H0WWzmWQcEdjiTV4nzgd3neB2", // GMAS-04 Racuya, Frances Era
        "IedPtMmuniSwpkYZ5YAXOSREoxl2", // GMAS-05 Baluyot, Ellen
        "JvBQZydSDxNkZRP2vNofGXMGbGk1", // NL-04 Aguinaldo, Maribel
        "JvY6C2uEdPeEqoWLuqB4eYfbZqj2", // NL-05 Tagao, Janet
    ],
    "SO4jVY3fTwgHAkF0Ysi57phPCyn1": [
        "xOQdg23cnOgLQD5IonJtFgAELa13", // LSL-03 Baldoz, Marylyn
        "h2q00DOa3EM870V5RDu2NABcb213", // LSL-05 Tojon, Carmel
        "BjsmUvmlFdUMDKg123iibi5AxZA2", // LSL-06 Astor, Richelle
    ],
    "qQULNmXLYSfC8x3G6UuGKjZrimh2": [
        "hM21Pxjwfma3m75pefiM7j23F4f1", // VIS-01 Pagobo, Eliazar Jr.
        "px4HMkypSRMTuQFrY21bFEJoYA73", // VIS-02 Alberto, Anne
        "nBNzGCEnXuMKXOCeZGG3P6k6Spm1", // VIS-03 Costa, Ferrams Gwyn
        "iTKKyyR8jSdOjWPmWCOPy8G0w7J2", // VIS-04 De Arce, Baby Jane
        "CrwnET2Cohhqf4lsYiI8AYPtlPo1", // VIS-05 Sarahina, Armadilla
        "H5NGDRDneWdH9ADuZDCFNHIovK83", // VIS-06 Babas, Edcel
        "cOr0MeB0DCXtZZzknf7QunQQFan1", // VIS-07 Dap-og, Marlou
        "mxcI6Z9EjKWYmvNisUCIzSPi4573", // VIS-08 Torpez, Joenilo
    ],
    "mXMrQ6B740TNeC5a1LBDosCa14J2": [
        "r33zTad46OdCo5BSDc0nifqMimt2", // MIN-01 Nacaytuna, Rolando Jr
        "WkLHNPDvLmfJBvQSDSn5ImY3nkg1", // MIN-02 Espares, Jamaica
        "Dr2aymosXAUZP4PPagrNSG7UTFg1", // MIN-03 Daquipil, Kaye Angela
        "iBzfeR7QujgmyUT2ogY0cN3KrLC3", // MIN-05 Naraval, Geonalin P.
        "8qS5baPi4YRwX1sa4g2m1ZMEDfX2", // MIN-06 Lacal, Liezel
        "zU44zD5vnbdBy6bGHmAPNYXVYhJ2", // MIN-07 Generale, Marynald Sweetsyl
        "w90JOQlrOJOf2FVq0iU2krdMQzI3", // MIN-08 Bartiana, Mark John
        "SuPo0lvdIZPAgZb6zYrnIfPNchl1", // MIN-09 Quinto, Rizza Mae
    ]
};